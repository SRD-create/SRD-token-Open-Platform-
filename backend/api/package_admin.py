from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from decimal import Decimal

from shared.models.db import get_db
from shared.models.models import Package
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


class PackageCreate(BaseModel):
    """创建套餐的请求体"""
    name: str
    name_en: str
    price: Decimal
    duration_days: int
    rpm: int
    tpm: int
    is_all_models: bool
    package_type: str
    description: str


class PackageUpdate(BaseModel):
    """更新套餐的请求体"""
    name: str
    name_en: str
    price: Decimal
    duration_days: int
    rpm: int
    tpm: int
    is_all_models: bool
    package_type: str
    description: str


@router.get("/packages", response_model=ListResponse)
async def get_packages(
    pageNum: int = Query(1, ge=1, description="页码"),
    pageSize: int = Query(10, ge=1, le=100, description="每页数量"),
    package_type: str = Query(None, description="套餐类型"),
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    分页获取套餐列表
    只有管理员可以访问
    """
    # 构建查询
    base_query = select(Package)
    
    # 按套餐类型筛选
    if package_type:
        base_query = base_query.where(Package.package_type == package_type)
    
    # 获取总记录数
    total_result = await db.execute(
        select(func.count(Package.id))
    )
    if package_type:
        total_result = await db.execute(
            select(func.count(Package.id))
            .where(Package.package_type == package_type)
        )
    total = total_result.scalar() or 0
    
    # 计算总页数
    pages = (total + pageSize - 1) // pageSize
    
    # 分页查询
    offset = (pageNum - 1) * pageSize
    result = await db.execute(
        base_query.order_by(Package.id.asc()).limit(pageSize).offset(offset)
    )
    packages = result.scalars().all()
    
    # 构建响应数据
    package_list = [
        {
            "id": package.id,
            "name": package.name,
            "name_en": package.name_en,
            "price": str(package.price),
            "duration_days": package.duration_days,
            "rpm": package.rpm,
            "tpm": package.tpm,
            "is_all_models": bool(package.is_all_models),
            "package_type": package.package_type,
            "description": package.description,
            "created_at": package.created_at,
            "updated_at": package.updated_at
        }
        for package in packages
    ]
    
    # 构建分页响应数据
    pagination_data = {
        "total": total,
        "pages": pages,
        "current": pageNum,
        "size": pageSize,
        "records": package_list
    }
    
    return ListResponse(data=pagination_data, total=total, message="获取套餐列表成功")


@router.post("/packages", response_model=DataResponse)
async def create_package(
    package_data: PackageCreate,
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    创建套餐
    只有管理员可以访问
    """
    # 检查套餐名称是否已存在
    existing_package = await db.execute(
        select(Package)
        .where(Package.name == package_data.name)
    )
    if existing_package.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="套餐名称已存在")
    
    # 创建新套餐
    new_package = Package(
        name=package_data.name,
        name_en=package_data.name_en,
        price=package_data.price,
        duration_days=package_data.duration_days,
        rpm=package_data.rpm,
        tpm=package_data.tpm,
        is_all_models=package_data.is_all_models,
        package_type=package_data.package_type,
        description=package_data.description
    )
    
    db.add(new_package)
    await db.commit()
    await db.refresh(new_package)
    
    return DataResponse(
        data={
            "id": new_package.id,
            "name": new_package.name,
            "name_en": new_package.name_en,
            "price": str(new_package.price),
            "duration_days": new_package.duration_days,
            "rpm": new_package.rpm,
            "tpm": new_package.tpm,
            "is_all_models": bool(new_package.is_all_models),
            "package_type": new_package.package_type,
            "description": new_package.description
        },
        message="创建套餐成功"
    )


@router.get("/packages/{package_id}", response_model=DataResponse)
async def get_package(
    package_id: int,
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    获取单个套餐详情
    只有管理员可以访问
    """
    # 查找套餐
    package = await db.get(Package, package_id)
    if not package:
        raise HTTPException(status_code=404, detail="套餐不存在")
    
    return DataResponse(
        data={
            "id": package.id,
            "name": package.name,
            "name_en": package.name_en,
            "price": str(package.price),
            "duration_days": package.duration_days,
            "rpm": package.rpm,
            "tpm": package.tpm,
            "is_all_models": bool(package.is_all_models),
            "package_type": package.package_type,
            "description": package.description,
            "created_at": package.created_at,
            "updated_at": package.updated_at
        },
        message="获取套餐成功"
    )


@router.post("/packages/{package_id}", response_model=DataResponse)
async def update_package(
    package_id: int,
    package_data: PackageUpdate,
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    更新套餐
    只有管理员可以访问
    """
    # 查找套餐
    package = await db.get(Package, package_id)
    if not package:
        raise HTTPException(status_code=404, detail="套餐不存在")
    
    # 检查套餐名称是否已被其他记录使用
    if package.name != package_data.name:
        existing_package = await db.execute(
            select(Package)
            .where(Package.name == package_data.name, Package.id != package_id)
        )
        if existing_package.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="套餐名称已存在")
    
    # 更新套餐
    package.name = package_data.name
    package.name_en = package_data.name_en
    package.price = package_data.price
    package.duration_days = package_data.duration_days
    package.rpm = package_data.rpm
    package.tpm = package_data.tpm
    package.is_all_models = package_data.is_all_models
    package.package_type = package_data.package_type
    package.description = package_data.description
    
    await db.commit()
    await db.refresh(package)
    
    return DataResponse(
        data={
            "id": package.id,
            "name": package.name,
            "name_en": package.name_en,
            "price": str(package.price),
            "duration_days": package.duration_days,
            "rpm": package.rpm,
            "tpm": package.tpm,
            "is_all_models": bool(package.is_all_models),
            "package_type": package.package_type,
            "description": package.description
        },
        message="更新套餐成功"
    )


@router.post("/packages/{package_id}/delete", response_model=DataResponse)
async def delete_package(
    package_id: int,
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    删除套餐
    只有管理员可以访问
    """
    # 查找套餐
    package = await db.get(Package, package_id)
    if not package:
        raise HTTPException(status_code=404, detail="套餐不存在")
    
    # 检查是否有用户正在使用该套餐
    from shared.models.models import UserPackage
    user_package_count_result = await db.execute(
        select(func.count(UserPackage.id))
        .where(UserPackage.package_id == package_id)
    )
    user_package_count = user_package_count_result.scalar() or 0
    if user_package_count > 0:
        raise HTTPException(status_code=400, detail="该套餐正在被用户使用，无法删除")
    
    # 检查是否有API密钥关联该套餐
    from shared.models.models import ApiKey
    api_key_count_result = await db.execute(
        select(func.count(ApiKey.id))
        .where(ApiKey.package_id == package_id)
    )
    api_key_count = api_key_count_result.scalar() or 0
    if api_key_count > 0:
        raise HTTPException(status_code=400, detail="该套餐已关联API密钥，无法删除")
    
    # 删除套餐
    await db.delete(package)
    await db.commit()
    
    return DataResponse(data=None, message="删除套餐成功")
