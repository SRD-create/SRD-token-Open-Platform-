from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from shared.models.db import get_db
from shared.models.models import AgentLevel
from shared.schemas.response import DataResponse, ListResponse
from shared.utils.i18n import get_translator

router = APIRouter()


@router.get("/levels", response_model=ListResponse)
async def get_agent_levels(request: Request, db: AsyncSession = Depends(get_db)):
    """获取所有代理等级"""
    _ = get_translator(request)
    # 获取总记录数
    total_result = await db.execute(select(func.count(AgentLevel.id)))
    total = total_result.scalar() or 0
    
    # 获取所有代理等级
    result = await db.execute(select(AgentLevel).order_by(AgentLevel.level))
    agent_levels = result.scalars().all()
    
    # 获取语言偏好
    accept_language = request.headers.get('accept-language', '').lower()
    is_english = 'en' in accept_language
    
    agent_level_list = [
        {
            "id": level.id,
            "level": level.level,
            "commission_rate": level.commission_rate,
            "price": level.price,
            "description": level.description_en if (is_english and level.description_en) else level.description,
            "created_at": level.created_at
        }
        for level in agent_levels
    ]
    
    return ListResponse(data=agent_level_list, total=total)
