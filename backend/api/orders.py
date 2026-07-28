from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime

from shared.models.db import get_db
from shared.models.models import Order, Package
from shared.schemas.response import DataResponse, ListResponse
from api.auth import get_current_user_id

router = APIRouter()


@router.get("", response_model=ListResponse)
async def get_orders(
    order_type: str = None, 
    status: str = None, 
    limit: int = 10, 
    offset: int = 0, 
    user_id: int = Depends(get_current_user_id), 
    db: AsyncSession = Depends(get_db)
):
    """获取用户的订单列表"""

    
    # 获取总记录数
    count_query = select(func.count(Order.id)).where(
        Order.user_id == user_id,
        Order.status != "pending",  # 过滤掉待支付的订单
        Order.payment_method != "system"  # 过滤掉支付方式为system的订单
    )
    if order_type:
        count_query = count_query.where(Order.order_type == order_type)
    if status:
        count_query = count_query.where(Order.status == status)
    
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 获取分页数据
    query = select(Order).where(
        Order.user_id == user_id,
        Order.status != "pending",  # 过滤掉待支付的订单
        Order.payment_method != "system"  # 过滤掉支付方式为system的订单
    )
    if order_type:
        query = query.where(Order.order_type == order_type)
    if status:
        query = query.where(Order.status == status)
    
    query = query.order_by(Order.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    orders = result.scalars().all()
    
    order_list = []
    for order in orders:
        package_info = None
        if order.package_id:
            package = await db.get(Package, order.package_id)
            if package:
                package_info = {
                    "id": package.id,
                    "name": package.name,
                    "price": package.price
                }
        
        order_list.append({
            "id": order.id,
            "order_no": order.order_no,
            "amount": order.amount,
            "order_type": order.order_type,
            "package": package_info,
            "payment_method": order.payment_method,
            "status": order.status,
            "transaction_id": order.transaction_id,
            "agent_commission": order.agent_commission,
            "created_at": order.created_at,
            "updated_at": order.updated_at
        })
    
    return ListResponse(data=order_list, total=total)


@router.get("/{order_id}", response_model=DataResponse)
async def get_order_detail(order_id: int, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """获取订单详情"""
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    
    if order.user_id != user_id:
        raise HTTPException(status_code=403, detail="您没有权限查看此订单")
    
    package_info = None
    if order.package_id:
        package = await db.get(Package, order.package_id)
        if package:
            package_info = {
                "id": package.id,
                "name": package.name,
                "price": package.price,
                "duration_days": package.duration_days,
                "rpm": package.rpm,
                "tpm": package.tpm,
                "is_all_models": package.is_all_models
            }
    
    # 获取支付记录
    from shared.models.models import Payment
    payment_result = await db.execute(
        select(Payment).where(Payment.order_id == order_id)
    )
    payments = payment_result.scalars().all()
    
    payment_info = [
        {
            "id": p.id,
            "payment_method": p.payment_method,
            "transaction_id": p.transaction_id,
            "amount": p.amount,
            "status": p.status,
            "created_at": p.created_at
        }
        for p in payments
    ]
    
    order_detail = {
        "id": order.id,
        "order_no": order.order_no,
        "amount": order.amount,
        "order_type": order.order_type,
        "package": package_info,
        "payment_method": order.payment_method,
        "status": order.status,
        "transaction_id": order.transaction_id,
        "agent_commission": order.agent_commission,
        "agent_id": order.agent_id,
        "payments": payment_info,
        "created_at": order.created_at,
        "updated_at": order.updated_at
    }
    
    return DataResponse(data=order_detail)
