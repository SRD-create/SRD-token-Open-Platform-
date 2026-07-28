from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import secrets
import string
from datetime import datetime, timedelta

from shared.models.db import get_db
from shared.models.models import ApiKey, User, UserAccount, Package, PackageModel, ModelService
from api.schemas.api_keys import CreateApiKeyRequest, UpdateApiKeyStatusRequest
from shared.schemas.response import DataResponse, ListResponse
from api.auth import get_current_user_id
from shared.utils.litellm_client import get_litellm_client
from shared.utils.redis_utils import cache_api_key, delete_cached_api_key, cache_user_info, get_user_current_package

router = APIRouter()


def generate_api_key():
    """生成API密钥"""
    prefix = "sk-"
    key = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(40))
    return prefix + key


@router.get("", response_model=ListResponse)
async def get_api_keys(
    status: str = None, 
    limit: int = 10, 
    offset: int = 0, 
    user_id: int = Depends(get_current_user_id), 
    db: AsyncSession = Depends(get_db)
):
    """获取API密钥列表"""
    # 获取总记录数
    total_result = await db.execute(
        select(func.count(ApiKey.id))
        .where(ApiKey.user_id == user_id)
    )
    total = total_result.scalar() or 0
    
    # 获取分页数据，同时查询关联的套餐信息
    result = await db.execute(
        select(ApiKey, Package)
        .outerjoin(Package, ApiKey.package_id == Package.id)
        .where(ApiKey.user_id == user_id)
        .order_by(ApiKey.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    api_keys_with_package = result.all()
    
    api_key_list = [
        {
            "id": key.id,
            "name": key.name,
            "key": key.api_key,
            "status": key.status,
            "package_id": key.package_id,
            "package_type": package.package_type if package else None,
            "created_at": key.created_at
        }
        for key, package in api_keys_with_package
    ]
    
    return ListResponse(data=api_key_list, total=total)


@router.post("", response_model=DataResponse)
async def create_api_key(
    api_key_data: CreateApiKeyRequest, 
    user_id: int = Depends(get_current_user_id), 
    db: AsyncSession = Depends(get_db)
):
    """创建API密钥（先在 LiteLLM 创建，再入库）"""
    # 检查用户API密钥数量限制
    result = await db.execute(select(func.count(ApiKey.id)).where(ApiKey.user_id == user_id))
    api_key_count = result.scalar() or 0
    
    if api_key_count >= 10:
        raise HTTPException(status_code=400, detail="最多只能创建10个API密钥")
    
    # 检查同一用户下name是否已存在
    result = await db.execute(
        select(ApiKey).where(
            (ApiKey.user_id == user_id) &
            (ApiKey.name == api_key_data.name)
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="API密钥名称已存在")
    
    # 生成API密钥
    api_key = generate_api_key()
    
    # 检查API密钥是否已存在
    max_retries = 10
    retry_count = 0
    while retry_count < max_retries:
        result = await db.execute(select(ApiKey).where(ApiKey.api_key == api_key))
        if not result.scalar_one_or_none():
            break
        api_key = generate_api_key()
        retry_count += 1
    
    if retry_count >= max_retries:
        raise HTTPException(status_code=500, detail="无法生成唯一的API密钥，请稍后重试")
    
    # 先在 LiteLLM 创建 Key
    try:
        litellm_client = await get_litellm_client()
        
        # 准备参数
        rpm_limit = None
        tpm_limit = None
        
        # 如果传入了package_id，查询套餐信息获取rpm和tpm
        if api_key_data.package_id:
            package_result = await db.execute(
                select(Package).where(Package.id == api_key_data.package_id)
            )
            package = package_result.scalar_one_or_none()
            if package and package.package_type == 'package':
                rpm_limit = package.rpm
                tpm_limit = package.tpm
        
        # 创建 LiteLLM Key
        litellm_response = await litellm_client.generate_key(
            models=[],  # 允许所有模型
            team_id=str(user_id),  # 使用用户ID作为team_id
            user_id=str(user_id),
            key=api_key,
            rpm_limit=rpm_limit,
            tpm_limit=tpm_limit,
            blocked=False
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LiteLLM 创建 Key 失败: {str(e)}")
    
    # 计算过期时间（默认一年后）
    expires_at = datetime.utcnow() + timedelta(days=365)
    
    # 创建API密钥（入库）
    new_api_key = ApiKey(
        user_id=user_id,
        package_id=api_key_data.package_id,
        name=api_key_data.name,
        api_key=api_key
    )
    
    db.add(new_api_key)
    await db.commit()
    await db.refresh(new_api_key)
    # 缓存 API Key 到 Redis (db=4)
    await cache_api_key(new_api_key.api_key, new_api_key.user_id, new_api_key.package_id)

    api_key_response = {
        "id": new_api_key.id,
        "name": new_api_key.name,
        "key": new_api_key.api_key,
        "status": new_api_key.status,
        "created_at": new_api_key.created_at,
        "remaining_limit": 10 - api_key_count - 1
    }
    
    return DataResponse(data=api_key_response, message="API密钥创建成功")


@router.delete("/{api_key_id}", response_model=DataResponse)
async def delete_api_key(api_key_id: int, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """删除API密钥（同时删除 LiteLLM 中的 Key）"""

    api_key = await db.get(ApiKey, api_key_id)
    
    if not api_key:
        raise HTTPException(status_code=404, detail="API密钥不存在")
    
    if api_key.user_id != user_id:
        raise HTTPException(status_code=403, detail="您没有权限删除此API密钥")
    
    # 获取api_key字符串
    api_key_str = api_key.api_key
    
    # 先删除 LiteLLM 中的 Key
    try:
        litellm_client = await get_litellm_client()
        await litellm_client.delete_key(api_key_str)
    except Exception as e:
        # LiteLLM 删除失败也继续删除本地记录，但记录日志
        import loguru
        loguru.logger.warning(f"Warning: Failed to delete key from LiteLLM: {e}")

    # 从 Redis 中删除缓存 (db=4)
    await delete_cached_api_key(api_key_str)

    # 删除本地数据库记录
    await db.delete(api_key)
    await db.commit()
    
    return DataResponse(message="API密钥删除成功")


@router.put("/{api_key_id}/status", response_model=DataResponse)
async def update_api_key_status(
    api_key_id: int, 
    request: UpdateApiKeyStatusRequest, 
    user_id: int = Depends(get_current_user_id), 
    db: AsyncSession = Depends(get_db)
):
    """更新API密钥状态"""

    api_key = await db.get(ApiKey, api_key_id)
    
    if not api_key:
        raise HTTPException(status_code=404, detail="API密钥不存在")
    
    if api_key.user_id != user_id:
        raise HTTPException(status_code=403, detail="您没有权限更新此API密钥")
    
    if request.status not in ["active", "inactive"]:
        raise HTTPException(status_code=400, detail="无效的状态")
    
    # 更新本地状态
    api_key.status = request.status
    
    # 同步到 LiteLLM
    try:
        litellm_client = await get_litellm_client()
        await litellm_client.update_key(
            key=api_key.api_key,
            blocked=(request.status == "inactive")
        )
    except Exception as e:
        # LiteLLM 更新失败也继续更新本地记录，但记录日志
        import loguru
        loguru.logger.warning(f"Warning: Failed to update key status in LiteLLM: {e}")
    

    
    await db.commit()
    await db.refresh(api_key)
    
    status_data = {
        "id": api_key.id,
        "name": api_key.name,
        "status": api_key.status,
        "updated_at": api_key.updated_at
    }
    
    return DataResponse(data=status_data, message="API密钥状态更新成功")


@router.get("/models", response_model=DataResponse)
async def get_api_key_models(
    api_key: str,
    db: AsyncSession = Depends(get_db)
):
    """根据API密钥查询可用模型"""
    # 查询API密钥
    api_key_result = await db.execute(
        select(ApiKey).where(ApiKey.api_key == api_key)
    )
    api_key_record = api_key_result.scalar_one_or_none()
    
    if not api_key_record:
        raise HTTPException(status_code=404, detail="API密钥不存在")
    
    # 查询套餐信息
    package = None
    if api_key_record.package_id:
        package = await db.get(Package, api_key_record.package_id)
    
    model_list = []
    
    if package:
        if package.package_type == 'common' or package.is_all_models:
            # 如果是common类型或允许使用所有模型，返回所有模型
            model_services_result = await db.execute(select(ModelService))
            model_services = model_services_result.scalars().all()
            model_list = [
                {
                    "name": service.name
                }
                for service in model_services
            ]
        elif package.package_type == 'package':
            # 如果是package类型，返回套餐关联的模型
            package_models_result = await db.execute(
                select(PackageModel).where(PackageModel.package_id == package.id)
            )
            package_models = package_models_result.scalars().all()
            model_list = [
                {
                    "name": pm.model_name
                }
                for pm in package_models
            ]
    
    return DataResponse(
        data={
            "api_key": api_key,
            "package_id": api_key_record.package_id,
            "models": model_list
        },
        message="获取API密钥可用模型成功"
    )
