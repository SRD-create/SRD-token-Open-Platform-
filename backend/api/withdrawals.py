from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta
from jose import JWTError, jwt
import json
import urllib.parse

from shared.models.db import get_db
from shared.models.models import Withdrawal, UserAccount, BalanceTransaction, Role, User, SystemConfig
from api.schemas.withdrawals import WithdrawalRequest
from shared.schemas.response import DataResponse, ListResponse
from api.auth import get_current_user_id, security, logger
from fastapi.security import HTTPAuthorizationCredentials
from shared.config.config import settings
from shared.utils.utils import check_permissions
from shared.services.wechat_transfer import wxpay_transfer_service, TransferBillsRequest, TransferSceneReportInfo

def generate_wechat_service_auth_url(token: str) -> str:
    """生成微信服务号授权链接
    
    Args:
        token: 用户的JWT token
    
    Returns:
        str: 微信服务号授权链接
    """
    base_redirect_uri = "https://your-domain.com/nexus/api/auth/wechat/service/callback"
    scope = "snsapi_userinfo"

    # 使用 state 参数传递token
    state_data = {
        "token": token
    }
    state = urllib.parse.quote(json.dumps(state_data))

    # 使用标准的 urlencode 编码所有参数
    params = {
        "appid": settings.WECHAT_APPID,  # 服务号appid
        "redirect_uri": base_redirect_uri,
        "response_type": "code",
        "scope": scope,
        "state": state
    }
    query_string = urllib.parse.urlencode(params)
    auth_url = f"https://open.weixin.qq.com/connect/oauth2/authorize?{query_string}#wechat_redirect"

    return auth_url

router = APIRouter()


async def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security), db: AsyncSession = Depends(get_db)) -> int:
    """从JWT token中获取当前管理员ID"""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="无效的认证凭据")
        
        # 获取用户角色
        result = await db.execute(select(Role).join(User).where(User.id == int(user_id)))
        role = result.scalar_one_or_none()
        if not role:
            raise HTTPException(status_code=403, detail="权限不足")
        
        # 检查是否为管理员
        if not check_permissions(role.name, "admin"):
            raise HTTPException(status_code=403, detail="权限不足")
        
        return int(user_id)
    except JWTError:
        raise HTTPException(status_code=401, detail="无效的认证凭据")


def create_withdraw_number():
    """生成唯一的提现订单号"""
    import time
    import random
    return str(int(time.time() * 1000)) + str(random.randint(100000, 999999))


@router.post("", response_model=DataResponse)
async def create_withdrawal(
    withdrawal_data: WithdrawalRequest, 
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user_id: int = Depends(get_current_user_id), 
    db: AsyncSession = Depends(get_db)
):
    """创建提现申请"""
    # 检查用户信息
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 检查service_openid是否绑定
    if not user.service_openid:
        # 获取token
        token = credentials.credentials
        # 生成服务号授权链接
        auth_url = generate_wechat_service_auth_url(token)
        
        return DataResponse(
            data={"auth_url": auth_url},
            message="请先绑定微信服务号"
        )
    
    # 检查用户账户
    result = await db.execute(select(UserAccount).where(UserAccount.user_id == user_id))
    user_account = result.scalar_one_or_none()
    if not user_account:
        raise HTTPException(status_code=404, detail="用户账户不存在")
    
    # 检查金额范围
    # 从系统配置中读取提现金额限制
    config_result = await db.execute(
        select(SystemConfig.config_key, SystemConfig.config_value)
        .where(SystemConfig.config_key.in_(["withdraw_min", "withdraw_max"]))
    )
    configs = {row.config_key: row.config_value for row in config_result}
    
    # 获取最小和最大提现金额，默认为20-200
    withdraw_min = float(configs.get("withdraw_min", 20))
    withdraw_max = float(configs.get("withdraw_max", 200))
    
    # 校验金额
    if withdrawal_data.amount < withdraw_min:
        raise HTTPException(status_code=400, detail=f"提现金额不能小于 {withdraw_min} 元")
    if withdrawal_data.amount > withdraw_max:
        raise HTTPException(status_code=400, detail=f"提现金额不能大于 {withdraw_max} 元")
    
    # 检查佣金余额是否足够
    if user_account.commission < withdrawal_data.amount:
        raise HTTPException(status_code=400, detail="佣金余额不足")
    
    # 创建提现记录（仅创建，不扣除佣金）
    withdrawal = Withdrawal(
        user_id=user_id,
        amount=withdrawal_data.amount,
        bank_account=withdrawal_data.bank_account,
        status="pending"
    )
    
    db.add(withdrawal)
    await db.commit()
    await db.refresh(withdrawal)
    
    withdrawal_data = {
        "withdrawal_id": withdrawal.id,
        "amount": withdrawal.amount,
        "status": withdrawal.status,
        "commission_balance": user_account.commission
    }
    
    return DataResponse(data=withdrawal_data, message="提现申请提交成功")


@router.post("/wechat", response_model=DataResponse)
async def create_withdrawal_wechat(
    withdrawal_data: WithdrawalRequest, 
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user_id: int = Depends(get_current_user_id), 
    db: AsyncSession = Depends(get_db)
):
    """创建提现申请并发起微信转账"""
    # 检查用户信息
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 检查service_openid是否绑定
    if not user.service_openid:
        # 获取token
        token = credentials.credentials
        # 生成服务号授权链接
        auth_url = generate_wechat_service_auth_url(token)
        
        return DataResponse(
            data={"auth_url": auth_url},
            message="请先绑定微信服务号"
        )
    
    # 检查用户账户
    result = await db.execute(select(UserAccount).where(UserAccount.user_id == user_id))
    user_account = result.scalar_one_or_none()
    if not user_account:
        raise HTTPException(status_code=404, detail="用户账户不存在")
    
    # 检查金额范围
    # 从系统配置中读取提现金额限制
    config_result = await db.execute(
        select(SystemConfig.config_key, SystemConfig.config_value)
        .where(SystemConfig.config_key.in_(["withdraw_min", "withdraw_max"]))
    )
    configs = {row.config_key: row.config_value for row in config_result}
    
    # 获取最小和最大提现金额，默认为20-200
    withdraw_min = float(configs.get("withdraw_min", 20))
    withdraw_max = float(configs.get("withdraw_max", 200))
    
    # 校验金额
    if withdrawal_data.amount < withdraw_min:
        raise HTTPException(status_code=400, detail=f"提现金额不能小于 {withdraw_min} 元")
    if withdrawal_data.amount > withdraw_max:
        raise HTTPException(status_code=400, detail=f"提现金额不能大于 {withdraw_max} 元")
    
    # 检查佣金余额是否足够
    if user_account.commission < withdrawal_data.amount:
        raise HTTPException(status_code=400, detail="佣金余额不足")
    
    # 生成唯一订单号
    out_batch_no = create_withdraw_number()
    
    # 创建提现记录
    withdrawal = Withdrawal(
        user_id=user_id,
        amount=withdrawal_data.amount,
        bank_account=withdrawal_data.bank_account,
        status="pending",
        out_batch_no=out_batch_no
    )
    
    db.add(withdrawal)
    await db.commit()
    await db.refresh(withdrawal)
    
    try:
        # 发起微信转账
        request_data = TransferBillsRequest(
            appid=settings.WECHAT_APPID,
            out_bill_no=out_batch_no,
            transfer_scene_id="1005",  # 转账场景ID（佣金报酬）
            openid=user.service_openid,
            transfer_amount=int(withdrawal_data.amount * 100),  # 微信支付金额单位为分，转换为整数
            transfer_remark="账户余额提现结算",
            notify_url=settings.WECHAT_NOTIFY_URL,  # 回调地址
            user_recv_perception="劳务报酬",  # 官方要求
            transfer_scene_report_infos=[
                TransferSceneReportInfo("岗位类型", "推广员"),  # 官方强制要求
                TransferSceneReportInfo("报酬说明", "平台佣金结算")  # 官方强制要求
            ]
        )
        
        # 调用微信转账服务
        result = wxpay_transfer_service.transfer(request_data)
   
        # 更新提现状态
        if result.state == "SUCCESS":
            withdrawal.status = "completed"
            withdrawal.transfer_bill_no = result.transfer_bill_no
            # 扣除佣金
            balance_before = user_account.commission
            user_account.commission -= withdrawal_data.amount
            balance_after = user_account.commission
            
            # 创建交易记录
            transaction = BalanceTransaction(
                user_id=user_id,
                account_type="commission",
                type="withdrawal",
                amount=withdrawal_data.amount,
                balance_before=balance_before,
                balance_after=balance_after,
                related_id=withdrawal.id,
                description=f"提现 {withdrawal_data.amount} 元"
            )
            db.add(transaction)
        elif result.state == "WAIT_USER_CONFIRM":
            withdrawal.status = "pending_user_confirm"
            withdrawal.transfer_bill_no = result.transfer_bill_no
            # 保存package_info（如果有）
            if hasattr(result, 'package_info') and result.package_info:
                withdrawal.package_info = result.package_info
        else:
            withdrawal.status = "failed"
            withdrawal.failure_reason = result.fail_reason
        
        await db.commit()
        await db.refresh(withdrawal)
        
        # 构建响应数据
        result_dict = {
            "withdrawal_id": withdrawal.id,
            "out_batch_no": out_batch_no,
            "amount": withdrawal.amount,
            "status": withdrawal.status,
            "commission_balance": user_account.commission,
            "transfer_state": result.state,
            "transfer_bill_no": result.transfer_bill_no,
            "package_info": withdrawal.package_info,
            "create_time": result.create_time
        }
        
        return DataResponse(data=result_dict, message="微信提现申请提交成功")
        
    except Exception as e:
        # 处理异常，更新提现状态为失败
        withdrawal.status = "failed"
        withdrawal.failure_reason = str(e)
        await db.commit()
        raise HTTPException(status_code=400, detail=f"提现失败: {str(e)}")


@router.get("", response_model=ListResponse)
async def get_withdrawals(
    status: str = None, 
    limit: int = 10, 
    offset: int = 0, 
    user_id: int = Depends(get_current_user_id), 
    db: AsyncSession = Depends(get_db)
):
    """获取提现记录"""

    
    # 获取总记录数（过滤掉待用户确认的记录）
    count_query = select(func.count(Withdrawal.id)).where(
        Withdrawal.user_id == user_id,
        Withdrawal.status != "pending_user_confirm"
    )
    if status:
        count_query = count_query.where(Withdrawal.status == status)
    
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 获取分页数据（过滤掉待用户确认的记录）
    query = select(Withdrawal).where(
        Withdrawal.user_id == user_id,
        Withdrawal.status != "pending_user_confirm"
    )
    if status:
        query = query.where(Withdrawal.status == status)
    
    query = query.order_by(Withdrawal.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    withdrawals = result.scalars().all()
    
    withdrawal_list = [
        {
            "id": w.id,
            "amount": w.amount,
            "bank_account": w.bank_account,
            "status": w.status,
            "out_batch_no": w.out_batch_no,
            "transfer_bill_no": w.transfer_bill_no,
            "package_info": w.package_info,
            "failure_reason": w.failure_reason,
            "created_at": w.created_at,
            "updated_at": w.updated_at
        }
        for w in withdrawals
    ]
    
    return ListResponse(data=withdrawal_list, total=total)


@router.get("/{withdrawal_id}", response_model=DataResponse)
async def get_withdrawal_detail(withdrawal_id: int, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """获取提现详情"""
    withdrawal = await db.get(Withdrawal, withdrawal_id)
    if not withdrawal:
        raise HTTPException(status_code=404, detail="提现记录不存在")
    
    if withdrawal.user_id != user_id:
        raise HTTPException(status_code=403, detail="您没有权限查看此提现记录")
    
    # 不允许查看待用户确认的提现记录
    if withdrawal.status == "pending_user_confirm":
        raise HTTPException(status_code=404, detail="提现记录不存在")
    
    withdrawal_detail = {
        "id": withdrawal.id,
        "amount": withdrawal.amount,
        "bank_account": withdrawal.bank_account,
        "status": withdrawal.status,
        "out_batch_no": withdrawal.out_batch_no,
        "transfer_bill_no": withdrawal.transfer_bill_no,
        "package_info": withdrawal.package_info,
        "failure_reason": withdrawal.failure_reason,
        "created_at": withdrawal.created_at,
        "updated_at": withdrawal.updated_at
    }
    
    return DataResponse(data=withdrawal_detail)


@router.post("/{withdrawal_id}/approve", response_model=DataResponse)
async def approve_withdrawal(
    withdrawal_id: int,
    admin_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """管理员批准提现申请"""
    # 查找提现记录
    withdrawal = await db.get(Withdrawal, withdrawal_id)
    if not withdrawal:
        raise HTTPException(status_code=404, detail="提现记录不存在")
    
    # 检查提现状态
    if withdrawal.status != "pending":
        raise HTTPException(status_code=400, detail="只有待处理的提现申请可以批准")
    
    # 检查用户账户
    result = await db.execute(select(UserAccount).where(UserAccount.user_id == withdrawal.user_id))
    user_account = result.scalar_one_or_none()
    if not user_account:
        raise HTTPException(status_code=404, detail="用户账户不存在")
    
    # 检查佣金余额是否足够（再次检查，防止在审核期间余额发生变化）
    if user_account.commission < withdrawal.amount:
        raise HTTPException(status_code=400, detail="佣金余额不足")
    
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
    
    # 更新提现状态
    withdrawal.status = "completed"
    
    db.add(transaction)
    await db.commit()
    await db.refresh(withdrawal)
    
    approval_data = {
        "withdrawal_id": withdrawal.id,
        "amount": withdrawal.amount,
        "status": withdrawal.status,
        "commission_balance": user_account.commission
    }
    
    return DataResponse(data=approval_data, message="提现申请批准成功")


@router.get("/{withdrawal_id}/confirm-url", response_model=DataResponse)
async def get_withdrawal_confirm_url(
    withdrawal_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """获取微信收款确认跳转链接"""
    # 查找提现记录
    withdrawal = await db.get(Withdrawal, withdrawal_id)
    if not withdrawal:
        raise HTTPException(status_code=404, detail="提现记录不存在")
    
    # 检查用户权限
    if withdrawal.user_id != user_id:
        raise HTTPException(status_code=403, detail="您没有权限查看此提现记录")
    
    # 确保只有待用户确认的提现记录才能获取确认链接
    if withdrawal.status != "pending_user_confirm":
        raise HTTPException(status_code=400, detail="只有待用户确认的提现记录才能获取确认链接")
    
    # 检查是否有out_batch_no
    if not withdrawal.out_batch_no:
        raise HTTPException(status_code=400, detail="提现记录没有批次号")
    
    try:
        # 获取收款确认跳转链接
        confirm_url = wxpay_transfer_service.get_confirm_redirect_url(withdrawal.out_batch_no)
        
        if not confirm_url:
            raise HTTPException(status_code=400, detail="获取收款确认链接失败")
        
        return DataResponse(
            data={"confirm_redirect_url": confirm_url},
            message="获取收款确认链接成功"
        )
    except Exception as e:
        logger.error(f"获取收款确认链接失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取收款确认链接失败: {str(e)}")
