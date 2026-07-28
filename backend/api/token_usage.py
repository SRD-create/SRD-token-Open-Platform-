from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime

from shared.models.db import get_db
from shared.models.models import TokenUsage, ApiKey
from shared.schemas.response import DataResponse, ListResponse
from api.auth import get_current_user_id

router = APIRouter()


@router.get("", response_model=ListResponse)
async def get_token_usage(
    model_name: str = None, 
    status: str = None, 
    start_date: str = None, 
    end_date: str = None, 
    limit: int = 10, 
    offset: int = 0, 
    user_id: int = Depends(get_current_user_id), 
    db: AsyncSession = Depends(get_db)
):
    """获取Token使用记录"""
    # 构建总记录数查询
    count_query = select(func.count(TokenUsage.id)).where(TokenUsage.user_id == user_id)
    if model_name:
        count_query = count_query.where(TokenUsage.model_name == model_name)
    if status:
        count_query = count_query.where(TokenUsage.status == status)
    if start_date:
        start = datetime.fromisoformat(start_date)
        count_query = count_query.where(TokenUsage.created_at >= start)
    if end_date:
        end = datetime.fromisoformat(end_date)
        count_query = count_query.where(TokenUsage.created_at <= end)
    
    # 获取总记录数
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 构建分页查询
    query = select(TokenUsage).where(TokenUsage.user_id == user_id)
    if model_name:
        query = query.where(TokenUsage.model_name == model_name)
    if status:
        query = query.where(TokenUsage.status == status)
    if start_date:
        start = datetime.fromisoformat(start_date)
        query = query.where(TokenUsage.created_at >= start)
    if end_date:
        end = datetime.fromisoformat(end_date)
        query = query.where(TokenUsage.created_at <= end)
    
    query = query.order_by(TokenUsage.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    usages = result.scalars().all()
    
    # 构建响应
    usage_list = [
        {
            "id": u.id,
            "request_id": u.request_id,
            "model_name": u.model_name,
            "api_key": u.api_key,
            "prompt_tokens": u.prompt_tokens,
            "completion_tokens": u.completion_tokens,
            "total_tokens": u.total_tokens,
            "cost": u.cost,
            "status": u.status,
            "error_message": u.error_message,
            "response_time": u.response_time,
            "created_at": u.created_at
        }
        for u in usages
    ]
    
    return ListResponse(data=usage_list, total=total)


@router.get("/summary", response_model=DataResponse)
async def get_usage_summary(
    days: int = 30, 
    user_id: int = Depends(get_current_user_id), 
    db: AsyncSession = Depends(get_db)
):
    """获取使用统计摘要"""

    from datetime import timedelta
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # 总使用量
    total_result = await db.execute(
        select(
            func.sum(TokenUsage.total_tokens).label("total_tokens"),
            func.sum(TokenUsage.cost).label("total_cost")
        ).where(
            TokenUsage.user_id == user_id,
            TokenUsage.created_at >= start_date
        )
    )
    total = total_result.first()
    
    # 按模型统计
    model_result = await db.execute(
        select(
            TokenUsage.model_name,
            func.sum(TokenUsage.total_tokens).label("tokens"),
            func.sum(TokenUsage.cost).label("cost"),
            func.count(TokenUsage.id).label("count")
        ).where(
            TokenUsage.user_id == user_id,
            TokenUsage.created_at >= start_date
        ).group_by(TokenUsage.model_name)
    )
    models = model_result.all()
    
    # 按日期统计
    daily_result = await db.execute(
        select(
            func.date(TokenUsage.created_at).label("date"),
            func.sum(TokenUsage.total_tokens).label("tokens"),
            func.sum(TokenUsage.cost).label("cost")
        ).where(
            TokenUsage.user_id == user_id,
            TokenUsage.created_at >= start_date
        ).group_by(func.date(TokenUsage.created_at))
        .order_by(func.date(TokenUsage.created_at))
    )
    daily = daily_result.all()
    
    summary_data = {
        "total_tokens": total.total_tokens or 0,
        "total_cost": total.total_cost or 0,
        "period_days": days,
        "models": [
            {
                "model_name": m.model_name,
                "tokens": m.tokens or 0,
                "cost": m.cost or 0,
                "count": m.count or 0
            }
            for m in models
        ],
        "daily": [
            {
                "date": d.date.isoformat() if d.date else None,
                "tokens": d.tokens or 0,
                "cost": d.cost or 0
            }
            for d in daily
        ]
    }
    
    return DataResponse(data=summary_data)
