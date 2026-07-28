from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from shared.models.db import get_db
from shared.models.models import SystemConfig, Role
from shared.schemas.response import DataResponse, ListResponse
from api.auth import get_current_user_id

router = APIRouter()


async def get_current_admin(user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """获取当前管理员用户"""
    # 查询admin角色的id
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


class SystemConfigCreate(BaseModel):
    """创建系统配置的请求体"""
    config_key: str
    config_value: str
    description: str
    category: str


class SystemConfigUpdate(BaseModel):
    """更新系统配置的请求体"""
    config_value: str
    description: str
    category: str


@router.get("/llm-server", response_model=DataResponse)
async def get_api_server(db: AsyncSession = Depends(get_db)):
    """获取 API 服务器配置"""
    # 从 system_config 表中查询 key 为 api-server 的记录
    result = await db.execute(
        select(SystemConfig).where(
            SystemConfig.config_key == "api-server",
            SystemConfig.is_deleted == False
        )
    )
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(status_code=404, detail="API 服务器配置不存在")
    
    config_data = {
        "value": config.config_value,
        "description": config.description
    }
    
    return DataResponse(data=config_data)


@router.get("/withdrawal-limits", response_model=DataResponse)
async def get_withdrawal_limits(db: AsyncSession = Depends(get_db)):
    """
    获取提现金额限制
    从系统配置中读取提现金额的最小和最大值
    """
    # 从系统配置中读取提现金额限制
    config_result = await db.execute(
        SystemConfig.__table__.select()
        .where(SystemConfig.config_key.in_(["withdraw_min", "withdraw_max"]))
    )
    configs = {row.config_key: row.config_value for row in config_result}

    # 获取最小和最大提现金额，默认为20-200
    withdraw_min = float(configs.get("withdraw_min", 20))
    withdraw_max = float(configs.get("withdraw_max", 200))

    # 构建响应数据
    data = {
        "withdraw_min": withdraw_min,
        "withdraw_max": withdraw_max
    }

    return DataResponse(data=data, message="获取提现金额限制成功")


@router.get("/topup-limits", response_model=DataResponse)
async def get_topup_limits(db: AsyncSession = Depends(get_db)):
    """
    获取充值金额限制
    从系统配置中读取充值金额的最小值
    """
    # 从系统配置中读取充值金额限制
    config_result = await db.execute(
        SystemConfig.__table__.select()
        .where(SystemConfig.config_key == "topup_min")
    )
    config = config_result.first()

    # 获取最小充值金额，默认为10
    topup_min = float(config.config_value) if config else 10.0

    # 构建响应数据
    data = {
        "topup_min": topup_min
    }

    return DataResponse(data=data, message="获取充值金额限制成功")


@router.get("/system", response_model=ListResponse)
async def get_system_configs(
    pageNum: int = Query(1, ge=1, description="页码"),
    pageSize: int = Query(10, ge=1, le=100, description="每页数量"),
    category: str = Query(None, description="分类"),
    keyword: str = Query(None, description="搜索关键词（配置键/描述）"),
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    分页获取系统配置列表
    只有管理员可以访问
    """
    # 构建查询
    base_query = select(SystemConfig).where(SystemConfig.is_deleted == False)
    
    # 按分类筛选
    if category:
        base_query = base_query.where(SystemConfig.category == category)
    
    # 关键词搜索
    if keyword:
        base_query = base_query.where(
            (SystemConfig.config_key.contains(keyword)) |
            (SystemConfig.description.contains(keyword))
        )
    
    # 获取总记录数
    count_query = select(func.count()).select_from(base_query.subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0
    
    # 计算总页数
    pages = (total + pageSize - 1) // pageSize
    
    # 分页查询
    offset = (pageNum - 1) * pageSize
    result = await db.execute(
        base_query.order_by(SystemConfig.created_at.desc()).limit(pageSize).offset(offset)
    )
    configs = result.scalars().all()
    
    # 构建响应数据
    config_list = [
        {
            "id": config.id,
            "config_key": config.config_key,
            "config_value": config.config_value,
            "description": config.description,
            "category": config.category,
            "is_deleted": config.is_deleted,
            "created_at": config.created_at,
            "updated_at": config.updated_at
        }
        for config in configs
    ]
    
    # 构建分页响应数据
    pagination_data = {
        "total": total,
        "pages": pages,
        "current": pageNum,
        "size": pageSize,
        "records": config_list
    }
    
    return ListResponse(data=pagination_data, total=total, message="获取系统配置列表成功")


@router.post("/system", response_model=DataResponse)
async def create_system_config(
    config_data: SystemConfigCreate,
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    创建系统配置
    只有管理员可以访问
    """
    # 检查config_key是否已存在
    existing_config = await db.execute(
        select(SystemConfig).where(
            SystemConfig.config_key == config_data.config_key,
            SystemConfig.is_deleted == False
        )
    )
    if existing_config.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="配置键已存在")
    
    # 创建新配置
    new_config = SystemConfig(
        config_key=config_data.config_key,
        config_value=config_data.config_value,
        description=config_data.description,
        category=config_data.category
    )
    
    db.add(new_config)
    await db.commit()
    await db.refresh(new_config)
    
    return DataResponse(
        data={
            "id": new_config.id,
            "config_key": new_config.config_key,
            "config_value": new_config.config_value,
            "description": new_config.description,
            "category": new_config.category
        },
        message="创建系统配置成功"
    )


@router.post("/system/{config_id}", response_model=DataResponse)
async def update_system_config(
    config_id: int,
    config_data: SystemConfigUpdate,
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    更新系统配置
    只有管理员可以访问
    """
    # 查找配置
    config = await db.get(SystemConfig, config_id)
    if not config or config.is_deleted:
        raise HTTPException(status_code=404, detail="配置不存在")
    
    # 更新配置
    config.config_value = config_data.config_value
    config.description = config_data.description
    config.category = config_data.category
    
    await db.commit()
    await db.refresh(config)
    
    return DataResponse(
        data={
            "id": config.id,
            "config_key": config.config_key,
            "config_value": config.config_value,
            "description": config.description,
            "category": config.category
        },
        message="更新系统配置成功"
    )


@router.post("/system/{config_id}/delete", response_model=DataResponse)
async def delete_system_config(
    config_id: int,
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    删除系统配置（软删除）
    只有管理员可以访问
    """
    # 查找配置
    config = await db.get(SystemConfig, config_id)
    if not config or config.is_deleted:
        raise HTTPException(status_code=404, detail="配置不存在")
    
    # 软删除
    config.is_deleted = True
    
    await db.commit()
    
    return DataResponse(data=None, message="删除系统配置成功")


@router.get("/system/{config_id}", response_model=DataResponse)
async def get_system_config(
    config_id: int,
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    获取单个系统配置详情
    只有管理员可以访问
    """
    # 查找配置
    config = await db.get(SystemConfig, config_id)
    if not config or config.is_deleted:
        raise HTTPException(status_code=404, detail="配置不存在")
    
    return DataResponse(
        data={
            "id": config.id,
            "config_key": config.config_key,
            "config_value": config.config_value,
            "description": config.description,
            "category": config.category,
            "is_deleted": config.is_deleted,
            "created_at": config.created_at,
            "updated_at": config.updated_at
        },
        message="获取系统配置成功"
    )
