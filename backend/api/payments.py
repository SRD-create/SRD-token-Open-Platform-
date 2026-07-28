from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import httpx
import json
import time
import secrets
import string
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy.future import select
from shared.models.db import get_db
from shared.models.models import (
    Payment, Order, Package, UserPackage, UserAccount, BalanceTransaction,
    PackageStatus, User, Role, TransactionType, AccountType, AgentLevel, Withdrawal
)
from api.schemas.payments import CreatePaymentRequest
from shared.schemas.response import DataResponse, BaseResponse
from shared.services.wechat_pay import wxpay
from shared.utils.utils import setup_logger
from api.auth import get_current_user_id
from shared.utils.i18n import get_translator
from shared.utils.redis_utils import cache_user_info, get_user_current_package


# 日志配置
logger = setup_logger()

# 路由器
router = APIRouter()


def generate_invite_code():
    """生成邀请码
    
    Returns:
        str: 生成的邀请码，6位大写字母和数字组合
    """
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))


async def _handle_recharge_order(db: AsyncSession, order: Order) -> bool:
    """处理充值订单
    
    Args:
        db: 数据库会话
        order: 订单对象
    
    Returns:
        bool: 处理是否成功
    """
    # 查询用户账户
    result = await db.execute(select(UserAccount).where(UserAccount.user_id == order.user_id))
    user_account = result.scalar_one_or_none()
    if not user_account:
        logger.warning(f"用户账户不存在: user_id={order.user_id}")
        return False

    # 更新余额
    balance_before = user_account.balance
    user_account.balance += order.amount
    balance_after = user_account.balance

    # 创建交易记录
    transaction = BalanceTransaction(
        user_id=order.user_id,
        account_type="balance",
        type="recharge",
        amount=order.amount,
        balance_before=balance_before,
        balance_after=balance_after,
        related_id=order.id,
        description=f"充值 {order.amount} 元"
    )
    db.add(transaction)

    logger.info(f"用户 {order.user_id} 充值成功，余额从 {balance_before} 增加到 {balance_after}")
    return True


async def _handle_package_order(db: AsyncSession, order: Order) -> bool:
    """处理套餐订单
    
    Args:
        db: 数据库会话
        order: 订单对象
    
    Returns:
        bool: 处理是否成功
    """
    # 查询套餐信息
    package = await db.get(Package, order.package_id)
    if not package:
        logger.warning(f"套餐不存在: package_id={order.package_id}")
        return False

    # 检查用户是否已有该套餐的有效记录
    from datetime import datetime
    now = datetime.utcnow()
    result = await db.execute(
        select(UserPackage)
        .where(
            UserPackage.user_id == order.user_id,
            UserPackage.package_id == order.package_id,
            UserPackage.status == 'active',
            UserPackage.end_at > now
        )
    )
    existing_user_package = result.scalar_one_or_none()

    if existing_user_package:
        # 如果已有有效套餐，延长有效期
        existing_end_at = existing_user_package.end_at
        new_end_at = existing_end_at + timedelta(days=package.duration_days)
        existing_user_package.end_at = new_end_at
        existing_user_package.order_id = order.id  # 更新订单ID
        logger.info(f"用户 {order.user_id} 续费套餐 {package.name} 成功，有效期从 {existing_end_at} 延长到 {new_end_at}")
    else:
        # 如果没有有效套餐，创建新的套餐记录
        start_at = datetime.utcnow()
        end_at = start_at + timedelta(days=package.duration_days)

        # 创建用户套餐关联
        user_package = UserPackage(
            user_id=order.user_id,
            package_id=order.package_id,
            order_id=order.id,
            start_at=start_at,
            end_at=end_at,
            status=PackageStatus.ACTIVE
        )
        db.add(user_package)
        logger.info(f"用户 {order.user_id} 购买套餐 {package.name} 成功，有效期从 {start_at} 到 {end_at}")

    return True


async def _handle_agent_register_order(db: AsyncSession, order: Order) -> dict:
    """处理代理商注册订单
    
    Args:
        db: 数据库会话
        order: 订单对象
    
    Returns:
        dict: 包含user_id和is_new_user的字典
    """
    # 查询用户信息
    user = await db.get(User, order.user_id)

    if not user and order.user_id is None:
        # 新用户注册为代理商
        # 生成唯一邀请码
        invite_code = generate_invite_code()
        while True:
            result = await db.execute(select(User).where(User.invite_code == invite_code))
            if not result.scalar_one_or_none():
                break
            invite_code = generate_invite_code()

        # 创建新用户
        user = User(
            name=f"代理用户_{order.order_no[:8]}",
            role_id=1,  # 默认角色
            agent_level_id=order.agent_level_id,  # 设置为代理商
            invite_code=invite_code
        )
        db.add(user)
        await db.flush()  # 获取用户ID

        # 更新订单的user_id
        order.user_id = user.id

        # 创建用户账户
        user_account = UserAccount(user_id=user.id)
        db.add(user_account)

        logger.info(f"新用户 {user.id} 成功注册为代理商，等级ID: {order.agent_level_id}")
    elif user:
        # 已有用户升级为代理商
        user.agent_level_id = order.agent_level_id
        order.user_id = user.id
        logger.info(f"用户 {user.id} 成功升级为代理商，等级ID: {order.agent_level_id}")

    return {"user_id": order.user_id, "is_new_user": user is None and order.user_id is not None}


async def _handle_invite_rebate(db: AsyncSession, order: Order) -> bool:
    """处理邀请返利
    
    Args:
        db: 数据库会话
        order: 订单对象
    
    Returns:
        bool: 处理是否成功
    """
    # 查询用户信息
    user = await db.get(User, order.user_id)
    if not user or not user.invited_by:
        return False

    # 查询邀请人信息
    inviter = await db.get(User, user.invited_by)
    if not inviter or not inviter.agent_level_id:
        return False

    # 查询邀请人代理等级
    agent_level = await db.get(AgentLevel, inviter.agent_level_id)
    if not agent_level:
        return False

    # 查询邀请人账户
    result = await db.execute(select(UserAccount).where(UserAccount.user_id == inviter.id))
    inviter_account = result.scalar_one_or_none()
    if not inviter_account:
        return False

    # 计算返利金额
    # 使用Decimal进行精确计算，避免float精度问题
    logger.info(f"开始计算邀请返利: order_amount={order.amount}, commission_rate={agent_level.commission_rate}%")
    commission_rate = agent_level.commission_rate / Decimal('100')
    logger.info(f"计算后的佣金比例: {commission_rate}")
    commission_amount = order.amount * commission_rate
    logger.info(f"计算后的返利金额: {commission_amount}")
    # 保留4位小数
    commission_amount = commission_amount.quantize(Decimal('0.0000'))
    logger.info(f"最终返利金额: {commission_amount}")

    # 更新佣金余额
    balance_before = inviter_account.commission
    inviter_account.commission += commission_amount
    balance_after = inviter_account.commission

    # 创建佣金交易记录
    transaction = BalanceTransaction(
        user_id=inviter.id,
        account_type=AccountType.COMMISSION,
        type=TransactionType.COMMISSION,
        amount=commission_amount,
        balance_before=balance_before,
        balance_after=balance_after,
        related_id=order.id,
        description=f"邀请返利 - 订单 {order.order_no}"
    )
    db.add(transaction)

    logger.info(f"邀请人 {inviter.id} (代理商) 获得返利: {commission_amount} 元")
    return True


async def _update_user_cache(db: AsyncSession, user_id: int):
    """更新用户缓存
    
    Args:
        db: 数据库会话
        user_id: 用户ID
    """
    # 查询用户账户信息
    result = await db.execute(select(UserAccount).where(UserAccount.user_id == user_id))
    user_account = result.scalar_one_or_none()

    # 提取余额和佣金
    balance = float(user_account.balance) if user_account else 0.0
    commission = float(user_account.commission) if user_account else 0.0

    # 查询用户套餐信息
    result = await db.execute(
        select(UserPackage, Package)
        .join(Package, UserPackage.package_id == Package.id)
        .where(UserPackage.user_id == user_id)
    )
    user_packages = result.all()
    package_info = await get_user_current_package(user_packages, db=db)

    # 更新缓存
    await cache_user_info(user_id, balance, commission, package_info)


async def _decrypt_payment_callback(resource: dict) -> dict:
    """解密微信支付回调数据
    
    Args:
        resource: 加密的回调数据
    
    Returns:
        dict: 解密后的数据
    """
    try:
        return wxpay.decrypt_callback(resource)
    except Exception as e:
        logger.error(f"解密支付回调失败: {e}")
        return None


@router.post("/wechat/callback")
async def wechat_payment_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """微信支付回调
    
    处理微信支付的异步通知，更新订单状态和相关数据
    
    Args:
        request: HTTP请求对象
        db: 数据库会话
    
    Returns:
        dict: 回调处理结果
    """
    try:
        # 解析请求体
        body = await request.body()
        data = json.loads(body)
        logger.info("微信回调: {}", data)

        # 验证回调数据
        if not data.get("resource"):
            return {"code": "FAIL", "message": "无效的回调数据"}

        # 解密回调数据
        decrypted_data = await _decrypt_payment_callback(data.get("resource"))
        if not decrypted_data:
            return {"code": "FAIL", "message": "解密失败"}

        # 获取事件类型，判断是支付回调还是转账回调
        event_type = data.get("event_type")
        
        # 处理转账回调（商家转账单据终态通知）
        if event_type and event_type == "MCHTRANSFER.BILL.FINISHED":
            logger.info("处理转账回调: {}", decrypted_data)
            
            # 提取转账信息
            out_batch_no = decrypted_data.get("out_bill_no")
            transfer_bill_no = decrypted_data.get("transfer_bill_no")
            transfer_state = decrypted_data.get("state")
            
            logger.info(f"转账回调 - 商户批次号: {out_batch_no}, 微信转账批次号: {transfer_bill_no}, 状态: {transfer_state}")
            
            if not out_batch_no:
                return {"code": "FAIL", "message": "无效的批次号"}
            
            # 查找提现记录
            result = await db.execute(select(Withdrawal).where(Withdrawal.out_batch_no == out_batch_no))
            withdrawal = result.scalar_one_or_none()
            if not withdrawal:
                logger.warning(f"找不到对应的提现记录: {out_batch_no}")
                return {"code": "SUCCESS", "message": "成功"}
            
            # 开始事务处理
            try:
                # 更新提现状态
                withdrawal.transfer_bill_no = transfer_bill_no
                
                if transfer_state == "SUCCESS":
                    withdrawal.status = "completed"
                    logger.info(f"提现 {withdrawal.id} 转账成功")
                    
                    # 查找用户账户
                    result = await db.execute(select(UserAccount).where(UserAccount.user_id == withdrawal.user_id))
                    user_account = result.scalar_one_or_none()
                    if user_account:
                        # 扣除佣金
                        balance_before = user_account.commission
                        user_account.commission -= withdrawal.amount
                        balance_after = user_account.commission
                        
                        # 创建交易记录
                        transaction = BalanceTransaction(
                            user_id=withdrawal.user_id,
                            account_type="commission",
                            type="withdrawal",
                            amount=withdrawal.amount,
                            balance_before=balance_before,
                            balance_after=balance_after,
                            related_id=withdrawal.id,
                            description=f"提现 {withdrawal.amount} 元"
                        )
                        db.add(transaction)
                        logger.info(f"已扣减用户 {withdrawal.user_id} 佣金 {withdrawal.amount} 元")
                else:
                    withdrawal.status = "failed"
                    withdrawal.failure_reason = f"转账失败: {transfer_state}"
                    logger.info(f"提现 {withdrawal.id} 转账失败: {transfer_state}")
                
                # 提交事务
                await db.commit()
                
                # 更新用户缓存
                await _update_user_cache(db, withdrawal.user_id)
                
                return {"code": "SUCCESS", "message": "成功"}
            except Exception as e:
                await db.rollback()
                logger.error(f"处理转账回调失败: {e}")
                return {"code": "FAIL", "message": "处理失败"}

        # 处理支付回调
        # 提取订单信息
        out_trade_no = decrypted_data.get("out_trade_no")
        transaction_id = decrypted_data.get("transaction_id")
        logger.info("解密后 - 订单号: {}, 交易号: {}".format(out_trade_no, transaction_id))

        if not out_trade_no:
            return {"code": "FAIL", "message": "无效的订单号"}

        # 查找订单
        result = await db.execute(select(Order).where(Order.order_no == out_trade_no))
        order = result.scalar_one_or_none()
        if not order:
            return {"code": "FAIL", "message": "订单不存在"}

        # 查找支付记录
        result = await db.execute(
            select(Payment).where(Payment.transaction_id == out_trade_no)
        )
        payment = result.scalar_one_or_none()
        if not payment:
            return {"code": "FAIL", "message": "支付记录不存在"}

        # 开始事务处理
        try:
            # 更新支付和订单状态
            payment.status = "success"
            payment.callback_data = json.dumps(data)
            order.status = "paid"
            order.transaction_id = transaction_id or out_trade_no

            # 根据订单类型处理
            if order.order_type == "recharge":
                # 处理充值订单
                await _handle_recharge_order(db, order)
            elif order.order_type == "package":
                # 处理套餐订单
                await _handle_package_order(db, order)
            elif order.order_type == "agent_register":
                # 处理代理商注册订单
                await _handle_agent_register_order(db, order)

            # 处理邀请返利（套餐、代理商注册和充值订单）
            if order.order_type in ["package", "agent_register", "recharge"]:
                await _handle_invite_rebate(db, order)

            # 提交事务
            await db.commit()

            # 更新用户缓存
            await _update_user_cache(db, order.user_id)

            # 代理商注册和充值订单需要更新邀请人缓存
            if order.order_type in ["package","agent_register", "recharge"]:
                user = await db.get(User, order.user_id)
                if user and user.invited_by:
                    await _update_user_cache(db, user.invited_by)
            logger.info(f"订单 {order.order_no} 支付成功，订单类型: {order.order_type}")

            # 返回成功响应
            return {"code": "SUCCESS", "message": "成功"}
        except Exception as e:
            # 发生错误，回滚事务
            await db.rollback()
            logger.error(f"处理支付回调失败: {e}")
            return {"code": "FAIL", "message": "处理失败"}
    except Exception as e:
        logger.error(f"微信支付回调异常: {e}")
        return {"code": "FAIL", "message": "处理失败"}


@router.post("/wechat/native")
async def create_wechat_native_payment(
    order_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    request: Request = None
):
    """创建微信 Native 支付，返回二维码链接
    
    Args:
        order_id: 订单ID
        user_id: 当前用户ID
        db: 数据库会话
        request: HTTP请求对象
    
    Returns:
        DataResponse: 包含二维码链接的响应
    """
    _ = get_translator(request)
    
    # 检查订单是否存在
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail=_('订单不存在'))
    
    # 检查订单权限
    if order.user_id != user_id:
        raise HTTPException(status_code=403, detail=_('您没有权限为此订单支付'))
    
    # 检查订单状态
    if order.status == "paid":
        raise HTTPException(status_code=400, detail=_('订单已经支付'))
    
    try:
        # 准备支付参数
        out_trade_no = order.order_no
        total_fee = int(order.amount * 100)  # 金额转换为分
        desc = f"AI Token 平台 - {order.order_type}订单"
        
        # 调用微信支付 API 创建 Native 支付
        res = wxpay.create_native(out_trade_no, total_fee, desc)
        code_url = res.get("code_url")
        
        if not code_url:
            error_message = _('微信支付创建失败: {res}').format(res=res)
            raise HTTPException(status_code=400, detail=error_message)
        
        # 创建支付记录
        payment = Payment(
            order_id=order.id,
            payment_method="wechat",
            transaction_id=out_trade_no,
            amount=order.amount,
            status="pending"
        )
        
        db.add(payment)
        await db.commit()
        
        # 返回二维码链接
        return DataResponse(
            data={
                "out_trade_no": out_trade_no,
                "code_url": code_url,
                "amount": order.amount
            },
            message=_('微信支付二维码生成成功')
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))