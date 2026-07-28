from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime

from shared.models.db import get_db
from shared.models.models import UserAccount, BalanceTransaction, Order, AgentLevel
from api.schemas.account import TopUpRequest, AgentRegisterRequest
from shared.schemas.response import DataResponse, ListResponse
from api.auth import get_current_user_id
from shared.utils.i18n import get_translator

router = APIRouter()


@router.get("/balance", response_model=DataResponse)
async def get_account_balance(request: Request, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """获取账户余额"""
    _ = get_translator(request)
    result = await db.execute(select(UserAccount).where(UserAccount.user_id == user_id))
    user_account = result.scalar_one_or_none()
    if not user_account:
        raise HTTPException(status_code=404, detail=_('用户账户不存在'))
    
    # 从 TokenUsage 表中获取总 tokens 使用量
    from shared.models.models import TokenUsage
    from sqlalchemy import func
    from datetime import datetime, timedelta
    
    # 计算当天的开始和结束时间
    today = datetime.utcnow().date()
    start_of_day = datetime.combine(today, datetime.min.time())
    end_of_day = datetime.combine(today, datetime.max.time())
    
    # 查询总使用量
    total_token_result = await db.execute(
        select(
            func.sum(TokenUsage.total_tokens).label("total_tokens_used")
        ).where(
            TokenUsage.user_id == user_id
        )
    )
    total_token_usage = total_token_result.first()
    used_tokens = total_token_usage.total_tokens_used or 0
    
    # 查询当日使用量
    daily_token_result = await db.execute(
        select(
            func.sum(TokenUsage.total_tokens).label("daily_tokens_used")
        ).where(
            TokenUsage.user_id == user_id,
            TokenUsage.request_time >= start_of_day,
            TokenUsage.request_time <= end_of_day
        )
    )
    daily_token_usage = daily_token_result.first()
    used_tokens_daily = daily_token_usage.daily_tokens_used or 0

    balance_data = {
        "balance": user_account.balance,
        "commission": user_account.commission,
        "used_tokens": used_tokens,
        "used_tokens_daily": used_tokens_daily
    }
    
    return DataResponse(data=balance_data)


@router.get("/transactions", response_model=ListResponse)
async def get_transactions(
    request: Request,
    account_type: str = None, 
    transaction_type: str = None, 
    limit: int = 10, 
    offset: int = 0, 
    user_id: int = Depends(get_current_user_id), 
    db: AsyncSession = Depends(get_db)
):
    _ = get_translator(request)
    """获取交易记录"""
    base_query = select(BalanceTransaction).where(BalanceTransaction.user_id == user_id)
    
    # 构建总记录数查询
    count_query = select(func.count(BalanceTransaction.id)).where(BalanceTransaction.user_id == user_id)
    if account_type:
        count_query = count_query.where(BalanceTransaction.account_type == account_type)
    if transaction_type:
        count_query = count_query.where(BalanceTransaction.type == transaction_type)
    
    # 获取总记录数
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 构建分页查询
    query = base_query
    if account_type:
        query = query.where(BalanceTransaction.account_type == account_type)
    if transaction_type:
        query = query.where(BalanceTransaction.type == transaction_type)
    
    query = query.order_by(BalanceTransaction.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    transactions = result.scalars().all()
    
    transaction_list = [
        {
            "id": t.id,
            "account_type": t.account_type,
            "type": t.type,
            "amount": t.amount,
            "balance_before": t.balance_before,
            "balance_after": t.balance_after,
            "related_id": t.related_id,
            "description": t.description,
            "created_at": t.created_at
        }
        for t in transactions
    ]
    
    return ListResponse(data=transaction_list, total=total)


@router.post("/topup", response_model=DataResponse)
async def top_up(topup_data: TopUpRequest, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db), request: Request = None):
    """充值账户"""
    _ = get_translator(request)
    result = await db.execute(select(UserAccount).where(UserAccount.user_id == user_id))
    user_account = result.scalar_one_or_none()
    if not user_account:
        raise HTTPException(status_code=404, detail=_("用户账户不存在"))
    
    # 验证支付方式
    if topup_data.payment_method not in ["wechat", "alipay"]:
        raise HTTPException(status_code=400, detail=_("无效的支付方式"))
    
    # 检查充值金额最小值
    from shared.models.models import SystemConfig
    config_result = await db.execute(
        select(SystemConfig.config_key, SystemConfig.config_value)
        .where(SystemConfig.config_key == "topup_min")
    )
    config = config_result.first()
    topup_min = float(config.config_value) if config else 10.0
    
    if topup_data.amount < topup_min:
        raise HTTPException(status_code=400, detail=_("充值金额不能小于 {topup_min} 元").format(topup_min=topup_min))
    
    # 创建充值订单
    from shared.models.models import Order
    import uuid
    import time
    order_no = f"ORD{int(time.time())}{str(uuid.uuid4())[:8].upper()}"
    
    order = Order(
        user_id=user_id,
        order_no=order_no,
        amount=topup_data.amount,
        order_type="recharge",
        payment_method=topup_data.payment_method,
        status="pending"
    )
    
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    # 如果是微信支付，生成支付二维码
    if topup_data.payment_method == "wechat":
        from shared.services.wechat_pay import wxpay
        
        # 调用微信支付API创建Native支付单
        out_trade_no = order.order_no
        total_fee = int(order.amount * 100)  # 转换为分
        desc = f"AI Token 平台 - 充值订单"
        
        try:
            res = wxpay.create_native(out_trade_no, total_fee, desc)
            code_url = res.get("code_url")
            
            if not code_url:
                error_message = _("微信支付创建失败: {res}").format(res=res)
                raise HTTPException(status_code=400, detail=error_message)
            
            # 创建支付记录
            from shared.models.models import Payment
            payment = Payment(
                order_id=order.id,
                payment_method="wechat",
                transaction_id=out_trade_no,
                amount=order.amount,
                status="pending"
            )
            
            db.add(payment)
            await db.commit()
            
            return DataResponse(
                data={
                    "order_id": order.id,
                    "order_no": order.order_no,
                    "amount": order.amount,
                    "payment_method": order.payment_method,
                    "code_url": code_url
                },
                message=_("充值订单创建成功，请扫码支付")
            )
        except Exception as e:
            # 回滚订单
            await db.delete(order)
            await db.commit()
            error_message = _("微信支付创建失败: {e}").format(e=str(e))
            raise HTTPException(status_code=500, detail=error_message)
    else:
        # 其他支付方式处理（如支付宝）
        # 这里可以添加支付宝支付逻辑
        return DataResponse(
            data={
                "order_id": order.id,
                "order_no": order.order_no,
                "amount": order.amount,
                "payment_method": order.payment_method
            },
            message=_("充值订单创建成功")
        )


@router.post("/agent/register", response_model=DataResponse)
async def agent_register(agent_data: AgentRegisterRequest, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db), request: Request = None):
    """代理商加盟（需要登录）"""
    _ = get_translator(request)
    # 检查代理等级是否存在
    agent_level = await db.get(AgentLevel, agent_data.agent_level_id)
    if not agent_level:
        raise HTTPException(status_code=404, detail=_("代理等级不存在"))
    
    # 验证支付方式
    if agent_data.payment_method not in ["wechat", "alipay"]:
        raise HTTPException(status_code=400, detail=_("无效的支付方式"))
    
    # 创建代理注册订单
    import uuid
    import time
    order_no = f"ORD{int(time.time())}{str(uuid.uuid4())[:8].upper()}"
    
    order = Order(
        user_id=user_id,  # 使用已登录用户的ID
        order_no=order_no,
        amount=agent_level.price,
        order_type="agent_register",
        agent_level_id=agent_data.agent_level_id,
        payment_method=agent_data.payment_method,
        status="pending"
    )
    
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    # 如果是微信支付，生成支付二维码
    if agent_data.payment_method == "wechat":
        from shared.services.wechat_pay import wxpay
        
        # 调用微信支付API创建Native支付单
        out_trade_no = order.order_no
        total_fee = int(order.amount * 100)  # 转换为分
        desc = f"AI Token 平台 - 代理商注册"
        
        try:
            res = wxpay.create_native(out_trade_no, total_fee, desc)
            code_url = res.get("code_url")
            
            if not code_url:
                error_message = _("微信支付创建失败: {res}").format(res=res)
                raise HTTPException(status_code=400, detail=error_message)
            
            # 创建支付记录
            from shared.models.models import Payment
            payment = Payment(
                order_id=order.id,
                payment_method="wechat",
                transaction_id=out_trade_no,
                amount=order.amount,
                status="pending"
            )
            
            db.add(payment)
            await db.commit()
            
            return DataResponse(
                data={
                    "order_id": order.id,
                    "order_no": order.order_no,
                    "amount": order.amount,
                    "payment_method": order.payment_method,
                    "code_url": code_url
                },
                message=_("代理商注册订单创建成功，请扫码支付")
            )
        except Exception as e:
            # 回滚订单
            await db.delete(order)
            await db.commit()
            error_message = _("微信支付创建失败: {e}").format(e=str(e))
            raise HTTPException(status_code=500, detail=error_message)
    else:
        # 其他支付方式处理（如支付宝）
        # 这里可以添加支付宝支付逻辑
        return DataResponse(
            data={
                "order_id": order.id,
                "order_no": order.order_no,
                "amount": order.amount,
                "payment_method": order.payment_method
            },
            message=_("代理商注册订单创建成功")
        )
