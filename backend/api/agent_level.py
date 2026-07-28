from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from decimal import Decimal

from shared.models.db import get_db
from shared.models.models import AgentLevel
from shared.schemas.response import DataResponse, ListResponse
from api.auth import get_current_user_id

router = APIRouter()


async def get_current_admin(user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """获取当前管理员用户"""
    # 查询admin角色的id
    from shared.models.models import Role
    admin_role_result = await db.execute(
        select(Role.id)
        .where(Role.name == "admin")
    )
    admin_role = admin_role_result.first()
    admin_role_id = admin_role.id if admin_role else None
    
    # 查询用户的角色id
    from shared.models.models import User
    user = await db.get(User, user_id)
    if not user or user.role_id != admin_role_id:
        raise HTTPException(status_code=403, detail="只有管理员可以访问此接口")
    return user_id


class AgentLevelCreate(BaseModel):
    """创建代理商等级的请求体"""
    level: int
    commission_rate: Decimal
    price: Decimal
    description: str
    description_en: str


class AgentLevelUpdate(BaseModel):
    """更新代理商等级的请求体"""
    level: int
    commission_rate: Decimal
    price: Decimal
    description: str
    description_en: str


@router.get("/agent-levels", response_model=ListResponse)
async def get_agent_levels(
    pageNum: int = Query(1, ge=1, description="页码"),
    pageSize: int = Query(10, ge=1, le=100, description="每页数量"),
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    分页获取代理商等级列表
    只有管理员可以访问
    """
    # 获取总记录数
    total_result = await db.execute(
        select(func.count(AgentLevel.id))
    )
    total = total_result.scalar() or 0
    
    # 计算总页数
    pages = (total + pageSize - 1) // pageSize
    
    # 分页查询
    offset = (pageNum - 1) * pageSize
    result = await db.execute(
        select(AgentLevel)
        .order_by(AgentLevel.level.asc())
        .limit(pageSize)
        .offset(offset)
    )
    agent_levels = result.scalars().all()
    
    # 构建响应数据
    agent_level_list = [
        {
            "id": level.id,
            "level": level.level,
            "commission_rate": str(level.commission_rate),
            "price": str(level.price),
            "description": level.description,
            "description_en": level.description_en,
            "created_at": level.created_at,
            "updated_at": level.updated_at
        }
        for level in agent_levels
    ]
    
    # 构建分页响应数据
    pagination_data = {
        "total": total,
        "pages": pages,
        "current": pageNum,
        "size": pageSize,
        "records": agent_level_list
    }
    
    return ListResponse(data=pagination_data, total=total, message="获取代理商等级列表成功")


@router.post("/agent-levels", response_model=DataResponse)
async def create_agent_level(
    level_data: AgentLevelCreate,
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    创建代理商等级
    只有管理员可以访问
    """
    # 检查level是否已存在
    existing_level = await db.execute(
        select(AgentLevel)
        .where(AgentLevel.level == level_data.level)
    )
    if existing_level.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该等级已存在")
    
    # 创建新等级
    new_level = AgentLevel(
        level=level_data.level,
        commission_rate=level_data.commission_rate,
        price=level_data.price,
        description=level_data.description,
        description_en=level_data.description_en
    )
    
    db.add(new_level)
    await db.commit()
    await db.refresh(new_level)
    
    return DataResponse(
        data={
            "id": new_level.id,
            "level": new_level.level,
            "commission_rate": str(new_level.commission_rate),
            "price": str(new_level.price),
            "description": new_level.description,
            "description_en": new_level.description_en
        },
        message="创建代理商等级成功"
    )


@router.get("/agent-levels/{level_id}", response_model=DataResponse)
async def get_agent_level(
    level_id: int,
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    获取单个代理商等级详情
    只有管理员可以访问
    """
    # 查找等级
    level = await db.get(AgentLevel, level_id)
    if not level:
        raise HTTPException(status_code=404, detail="代理商等级不存在")
    
    return DataResponse(
        data={
            "id": level.id,
            "level": level.level,
            "commission_rate": str(level.commission_rate),
            "price": str(level.price),
            "description": level.description,
            "description_en": level.description_en,
            "created_at": level.created_at,
            "updated_at": level.updated_at
        },
        message="获取代理商等级成功"
    )


@router.post("/agent-levels/{level_id}", response_model=DataResponse)
async def update_agent_level(
    level_id: int,
    level_data: AgentLevelUpdate,
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    更新代理商等级
    只有管理员可以访问
    """
    # 查找等级
    level = await db.get(AgentLevel, level_id)
    if not level:
        raise HTTPException(status_code=404, detail="代理商等级不存在")
    
    # 检查level是否已被其他记录使用
    if level.level != level_data.level:
        existing_level = await db.execute(
            select(AgentLevel)
            .where(AgentLevel.level == level_data.level, AgentLevel.id != level_id)
        )
        if existing_level.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="该等级已存在")
    
    # 更新等级
    level.level = level_data.level
    level.commission_rate = level_data.commission_rate
    level.price = level_data.price
    level.description = level_data.description
    level.description_en = level_data.description_en
    
    await db.commit()
    await db.refresh(level)
    
    return DataResponse(
        data={
            "id": level.id,
            "level": level.level,
            "commission_rate": str(level.commission_rate),
            "price": str(level.price),
            "description": level.description,
            "description_en": level.description_en
        },
        message="更新代理商等级成功"
    )


@router.post("/agent-levels/{level_id}/delete", response_model=DataResponse)
async def delete_agent_level(
    level_id: int,
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    删除代理商等级
    只有管理员可以访问
    """
    # 查找等级
    level = await db.get(AgentLevel, level_id)
    if not level:
        raise HTTPException(status_code=404, detail="代理商等级不存在")
    
    # 检查是否有用户正在使用该等级
    from shared.models.models import User
    user_count_result = await db.execute(
        select(func.count(User.id))
        .where(User.agent_level_id == level_id)
    )
    user_count = user_count_result.scalar() or 0
    if user_count > 0:
        raise HTTPException(status_code=400, detail="该等级正在被用户使用，无法删除")
    
    # 删除等级
    await db.delete(level)
    await db.commit()
    
    return DataResponse(data=None, message="删除代理商等级成功")
