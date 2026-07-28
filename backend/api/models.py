from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from shared.models.db import get_db
from shared.models.models import Package, PackageModel, ModelService
from shared.schemas.response import DataResponse, ListResponse
from pydantic import BaseModel


class PackageModelRequest(BaseModel):
    """套餐模型绑定请求体"""
    model_name: str

router = APIRouter()


@router.get("/package/{package_id}", response_model=DataResponse)
async def get_package_models(package_id: int, db: AsyncSession = Depends(get_db)):
    """获取套餐可使用的模型"""
    package = await db.get(Package, package_id)
    if not package:
        raise HTTPException(status_code=404, detail="套餐不存在")
    
    if package.is_all_models:
        # 如果套餐可以使用所有模型，返回空列表
        # 实际实现时需要从外部接口获取所有模型
        model_list = []
    else:
        # 否则返回套餐关联的模型
        result = await db.execute(
            select(PackageModel)
            .where(PackageModel.package_id == package_id)
        )
        package_models = result.scalars().all()
        model_list = [
            {
                "name": pm.model_name
            }
            for pm in package_models
        ]
    
    return DataResponse(
        data={
            "package_id": package.id,
            "package_name": package.name,
            "is_all_models": package.is_all_models,
            "models": model_list
        }
    )


@router.get("/services", response_model=ListResponse)
async def get_model_services(
    pageNum: int = Query(1, ge=1, description="页码"),
    pageSize: int = Query(10, ge=1, le=100, description="每页数量"),
    model_type: str = Query(None, description="模型类型"),
    provider: str = Query(None, description="服务提供商"),
    is_publish: bool = Query(None, description="是否上架"),
    keyword: str = Query(None, description="搜索关键词（模型名称/描述）"),
    db: AsyncSession = Depends(get_db)
):
    """
    分页获取模型服务列表
    """
    # 构建查询
    base_query = select(ModelService)
    
    # 按条件筛选
    if model_type:
        base_query = base_query.where(ModelService.model_type == model_type)
    if provider:
        base_query = base_query.where(ModelService.provider == provider)
    if is_publish is not None:
        base_query = base_query.where(ModelService.is_publish == is_publish)
    if keyword:
        base_query = base_query.where(
            (ModelService.name.contains(keyword)) |
            (ModelService.description.contains(keyword))
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
        base_query.order_by(ModelService.id.asc()).limit(pageSize).offset(offset)
    )
    model_services = result.scalars().all()
    
    # 构建响应数据
    service_list = [
        {
            "id": service.id,
            "name": service.name,
            "url": service.url,
            "status": service.status,
            "description": service.description,
            "max_context_length": service.max_context_length,
            "model_type": service.model_type,
            "parameters": service.parameters,
            "provider": service.provider,
            "litellm_model_id": service.litellm_model_id,
            "is_publish": service.is_publish,
            "created_at": service.created_at,
            "updated_at": service.updated_at
        }
        for service in model_services
    ]
    
    # 构建分页响应数据
    pagination_data = {
        "total": total,
        "pages": pages,
        "current": pageNum,
        "size": pageSize,
        "records": service_list
    }
    
    return ListResponse(data=pagination_data, total=total, message="获取模型服务列表成功")


@router.get("/services/{service_id}", response_model=DataResponse)
async def get_model_service(
    service_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    获取单个模型服务详情
    """
    # 查找模型服务
    service = await db.get(ModelService, service_id)
    if not service:
        raise HTTPException(status_code=404, detail="模型服务不存在")
    
    return DataResponse(
        data={
            "id": service.id,
            "name": service.name,
            "url": service.url,
            "status": service.status,
            "description": service.description,
            "max_context_length": service.max_context_length,
            "model_type": service.model_type,
            "parameters": service.parameters,
            "provider": service.provider,
            "litellm_model_id": service.litellm_model_id,
            "is_publish": service.is_publish,
            "created_at": service.created_at,
            "updated_at": service.updated_at
        },
        message="获取模型服务成功"
    )


@router.post("/package/{package_id}/models", response_model=DataResponse)
async def add_package_model(
    package_id: int,
    request: PackageModelRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    为套餐添加模型
    """
    model_name = request.model_name
    # 检查套餐是否存在
    package = await db.get(Package, package_id)
    if not package:
        raise HTTPException(status_code=404, detail="套餐不存在")
    
    # 检查套餐是否设置为使用所有模型
    if package.is_all_models:
        raise HTTPException(status_code=400, detail="该套餐已设置为使用所有模型，无需单独绑定")
    
    # 检查模型是否已绑定
    existing_model = await db.execute(
        select(PackageModel)
        .where(PackageModel.package_id == package_id, PackageModel.model_name == model_name)
    )
    if existing_model.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该模型已绑定到套餐")
    
    # 添加模型绑定
    new_package_model = PackageModel(
        package_id=package_id,
        model_name=model_name
    )
    
    db.add(new_package_model)
    await db.commit()
    
    return DataResponse(
        data={
            "package_id": package_id,
            "model_name": model_name
        },
        message="模型绑定成功"
    )


@router.post("/package/{package_id}/models/{model_name}", response_model=DataResponse)
async def remove_package_model(
    package_id: int,
    model_name: str,
    db: AsyncSession = Depends(get_db)
):
    """
    从套餐中删除模型
    """
    # 检查套餐是否存在
    package = await db.get(Package, package_id)
    if not package:
        raise HTTPException(status_code=404, detail="套餐不存在")
    
    # 检查套餐是否设置为使用所有模型
    if package.is_all_models:
        raise HTTPException(status_code=400, detail="该套餐设置为使用所有模型，无需单独解绑")
    
    # 查找模型绑定
    package_model = await db.execute(
        select(PackageModel)
        .where(PackageModel.package_id == package_id, PackageModel.model_name == model_name)
    )
    package_model = package_model.scalar_one_or_none()
    
    if not package_model:
        raise HTTPException(status_code=404, detail="模型未绑定到套餐")
    
    # 删除模型绑定
    await db.delete(package_model)
    await db.commit()
    
    return DataResponse(
        data={
            "package_id": package_id,
            "model_name": model_name
        },
        message="模型解绑成功"
    )
