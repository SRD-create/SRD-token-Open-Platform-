import redis.asyncio as redis
from shared.config.config import settings
import asyncio
import loguru
import json
from typing import Optional, Any


class RedisClient:
    """Redis客户端 - 支持多数据库"""
    _instances = {}  # 单例模式，按db缓存实例
    
    def __new__(cls, db: int = None):
        db = db if db is not None else settings.REDIS_DB
        if db not in cls._instances:
            cls._instances[db] = super().__new__(cls)
            cls._instances[db]._initialized = False
            cls._instances[db].db = db
            cls._instances[db].redis_client = None
        return cls._instances[db]
    
    async def initialize(self):
        """初始化Redis连接"""
        if self.redis_client:
            return
        
        try:
            loguru.logger.info(f"Connecting to Redis: {settings.REDIS_HOST}:{settings.REDIS_PORT}, db={self.db}")
            self.redis_client = redis.Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                password=settings.REDIS_PASSWORD,
                db=self.db,
                decode_responses=True,
                socket_timeout=5
            )
            # 测试连接
            await self.redis_client.ping()
            self._initialized = True
            loguru.logger.info(f"Redis connection established (db={self.db})")
        except Exception as e:
            loguru.logger.error(f"Failed to connect to Redis: {e}")
            self._initialized = False
            self.redis_client = None
    
    async def ensure_connected(self):
        """确保Redis连接已建立"""
        if not self.redis_client:
            await self.initialize()
    
    async def set(self, key: str, value: Any, expire: int = None):
        """设置缓存
        
        Args:
            key: 缓存键
            value: 缓存值（支持任意类型，会自动序列化）
            expire: 过期时间（秒），默认不过期
        """
        await self.ensure_connected()
        if self.redis_client:
            # 序列化非字符串值
            if not isinstance(value, str):
                value = json.dumps(value)
            
            if expire:
                await self.redis_client.setex(key, expire, value)
            else:
                await self.redis_client.set(key, value)
        else:
            loguru.logger.warning(f"Redis client not initialized, skipping set operation for key: {key}")
    
    async def get(self, key: str, default: Any = None) -> Any:
        """获取缓存
        
        Args:
            key: 缓存键
            default: 默认值
            
        Returns:
            缓存值，如果不存在返回默认值
        """
        await self.ensure_connected()
        if self.redis_client:
            value = await self.redis_client.get(key)
            if value is None:
                return default
            
            # 尝试反序列化JSON
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return value
        else:
            loguru.logger.warning(f"Redis client not initialized, skipping get operation for key: {key}")
            return default
    
    async def delete(self, key: str):
        """删除缓存
        
        Args:
            key: 缓存键
        """
        await self.ensure_connected()
        if self.redis_client:
            await self.redis_client.delete(key)
        else:
            loguru.logger.warning(f"Redis client not initialized, skipping delete operation for key: {key}")
    
    async def exists(self, key: str) -> bool:
        """检查键是否存在
        
        Args:
            key: 缓存键
            
        Returns:
            是否存在
        """
        await self.ensure_connected()
        if self.redis_client:
            return await self.redis_client.exists(key) > 0
        else:
            loguru.logger.warning(f"Redis client not initialized, skipping exists operation for key: {key}")
            return False
    
    async def expire(self, key: str, seconds: int):
        """设置过期时间
        
        Args:
            key: 缓存键
            seconds: 过期秒数
        """
        await self.ensure_connected()
        if self.redis_client:
            await self.redis_client.expire(key, seconds)
        else:
            loguru.logger.warning(f"Redis client not initialized, skipping expire operation for key: {key}")
    
    async def keys(self, pattern: str) -> list:
        """查找匹配的键
        
        Args:
            pattern: 匹配模式，如 "api_key:*"
            
        Returns:
            键列表
        """
        await self.ensure_connected()
        if self.redis_client:
            return await self.redis_client.keys(pattern)
        else:
            loguru.logger.warning(f"Redis client not initialized, skipping keys operation for pattern: {pattern}")
            return []
    
    async def clear_pattern(self, pattern: str):
        """删除匹配模式的所有键
        
        Args:
            pattern: 匹配模式
        """
        await self.ensure_connected()
        if self.redis_client:
            keys = await self.redis_client.keys(pattern)
            if keys:
                await self.redis_client.delete(*keys)
                loguru.logger.info(f"Cleared {len(keys)} keys matching '{pattern}' from Redis (db={self.db})")
        else:
            loguru.logger.warning(f"Redis client not initialized, skipping clear_pattern operation for pattern: {pattern}")
    
    async def flushdb(self):
        """清空当前数据库"""
        await self.ensure_connected()
        if self.redis_client:
            await self.redis_client.flushdb()
            loguru.logger.warning(f"Flushed Redis database {self.db}")
        else:
            loguru.logger.warning("Redis client not initialized, skipping flushdb operation")


# ==================== 预定义的Redis客户端实例 ====================

# 默认 Redis 客户端（db=0，用于验证码等业务）
redis_client = RedisClient(db=0)

# API Key 专用 Redis 客户端（db=1）
api_key_redis = RedisClient(db=1)

# Model Service 专用 Redis 客户端（db=2）
model_service_redis = RedisClient(db=2)

# 用户信息缓存专用 Redis 客户端（db=3）
user_redis = RedisClient(db=3)

# API Key 缓存专用 Redis 客户端（db=4）
api_key_redis_db4 = RedisClient(db=4)


# ==================== API Key 缓存（使用 db=1）====================

async def cache_api_key_db1(api_key: str, api_key_data: dict, expire: int = None):
    """缓存 API Key 信息到 Redis（db=1）
    
    Args:
        api_key: API Key 字符串
        api_key_data: API Key 数据字典
        expire: 过期时间（秒），默认不过期
    """
    key = f"api_key:{api_key}"
    await api_key_redis.set(key, api_key_data, expire)
    loguru.logger.info(f"Cached API key to Redis (db=1): {api_key[:10]}...")


async def get_cached_api_key_db1(api_key: str) -> Optional[dict]:
    """从 Redis 获取缓存的 API Key 信息（db=1）
    
    Args:
        api_key: API Key 字符串
        
    Returns:
        API Key 数据字典，如果不存在返回 None
    """
    key = f"api_key:{api_key}"
    return await api_key_redis.get(key)


async def delete_cached_api_key_db1(api_key: str):
    """从 Redis 删除缓存的 API Key（db=1）
    
    Args:
        api_key: API Key 字符串
    """
    key = f"api_key:{api_key}"
    await api_key_redis.delete(key)
    loguru.logger.info(f"Deleted API key from Redis (db=1): {api_key[:10]}...")


async def cache_all_api_keys_db1(api_keys: list):
    """批量缓存所有 API Key 到 Redis（db=1）
    
    Args:
        api_keys: API Key 对象列表
    """
    for api_key_obj in api_keys:
        key = f"api_key:{api_key_obj.api_key}"
        api_key_data = {
            "id": api_key_obj.id,
            "user_id": api_key_obj.user_id,
            "key": api_key_obj.api_key,
            "name": api_key_obj.name,
            "status": api_key_obj.status if hasattr(api_key_obj, 'status') else True,
            "created_at": api_key_obj.created_at.isoformat() if api_key_obj.created_at else None
        }
        await api_key_redis.set(key, api_key_data)
    loguru.logger.info(f"Cached {len(api_keys)} API keys to Redis (db=1)")


async def clear_all_api_keys_db1():
    """清除 Redis 中所有缓存的 API Key（db=1）"""
    await api_key_redis.clear_pattern("api_key:*")


# ==================== 用户信息缓存（使用 db=3）====================

async def cache_user_info(user_id: int, balance: float, commission: float, package_info: list = None, expire: int = None):
    """缓存用户信息到 Redis（db=3）
    
    Args:
        user_id: 用户ID
        balance: 账户余额
        commission: 佣金余额
        package_info: 套餐信息列表
        expire: 过期时间（秒），默认不过期
    """
    key = f"{user_id}"  # 用户ID作为key
    value = {
        "balance": balance,
        "commission": commission,
        "packages": package_info or []
    }
    await user_redis.set(key, value, expire)
    loguru.logger.info(f"Cached user info to Redis (db=3): user_id={user_id}, balance={balance}, commission={commission}, packages={package_info}")


async def get_cached_user_info(user_id: int) -> Optional[dict]:
    """从 Redis 获取缓存的用户信息（db=3）
    
    Args:
        user_id: 用户ID
        
    Returns:
        用户数据字典，如果不存在返回 None
    """
    key = f"{user_id}"
    return await user_redis.get(key)


async def delete_cached_user_info(user_id: int):
    """从 Redis 删除缓存的用户信息（db=3）
    
    Args:
        user_id: 用户ID
    """
    key = f"{user_id}"
    await user_redis.delete(key)
    loguru.logger.info(f"Deleted user info from Redis (db=3): user_id={user_id}")


async def cache_all_users(users: list):
    """批量缓存所有用户信息到 Redis（db=3）
    
    Args:
        users: 用户对象列表
    """
    for user in users:
        # 获取用户账户信息
        user_account = user.account
        balance = float(user_account.balance) if user_account else 0.0
        commission = float(user_account.commission) if user_account else 0.0
        
        # 获取用户当前套餐信息
        from shared.models.models import UserPackage, Package
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        # 加载用户的套餐信息
        from shared.models.db import get_db
        import asyncio
        db = asyncio.run(get_db().__anext__())
        try:
            result = await db.execute(
                select(UserPackage, Package)
                .join(Package, UserPackage.package_id == Package.id)
                .where(UserPackage.user_id == user.id)
            )
            user_packages = result.all()
            package_info = await get_user_current_package(user_packages, db=db)
        finally:
            import asyncio
            asyncio.run(db.close())
        
        await cache_user_info(user.id, balance, commission, package_info)
    loguru.logger.info(f"Cached {len(users)} users to Redis (db=3)")


async def clear_all_users():
    """清除 Redis 中所有缓存的用户信息（db=3）"""
    await user_redis.clear_pattern("*")


async def get_user_current_package(user_packages, db=None):
    """获取用户当前有效的套餐信息
    
    Args:
        user_packages: 用户套餐列表，包含 UserPackage 和 Package 信息
        db: 数据库会话，用于查询套餐绑定的模型信息
        
    Returns:
        套餐信息字典列表，如果没有有效套餐返回 []
    """
    from datetime import datetime
    from sqlalchemy import select
    from shared.models.models import PackageModel
    
    # 查找当前有效的套餐（未过期且状态为active）
    now = datetime.utcnow()
    package_info_list = []
    
    for user_package, package in user_packages:
        if user_package.status == 'active':
            # 构建套餐信息字典
            package_info = {
                "id": package.id,
                "name": package.name,
                "name_en": package.name_en,
                "price": float(package.price),
                "duration_days": package.duration_days,
                "rpm": package.rpm,
                "tpm": package.tpm,
                "is_all_models": package.is_all_models,
                "package_type": package.package_type,
                "status": user_package.status,
                "start_at": user_package.start_at.isoformat() if user_package.start_at else None,
                "end_at": user_package.end_at.isoformat() if user_package.end_at else None,
                "models": []
            }
            
            # 如果不是使用所有模型，查询套餐绑定的模型
            if not package.is_all_models and db:
                import loguru
                loguru.logger.info(f"开始查询套餐绑定的模型: package_id={package.id}, is_all_models={package.is_all_models}")
                try:
                    # 查询套餐绑定的模型
                    result = await db.execute(
                        select(PackageModel)
                        .where(PackageModel.package_id == package.id)
                    )
                    package_models = result.scalars().all()
                    loguru.logger.info(f"查询到套餐绑定的模型数量: package_id={package.id}, count={len(package_models)}")
                    # 提取模型名称列表
                    model_names = [pm.model_name for pm in package_models]
                    loguru.logger.info(f"套餐绑定的模型列表: package_id={package.id}, models={model_names}")
                    package_info["models"] = model_names
                except Exception as e:
                    # 如果查询失败，不影响主流程
                    loguru.logger.warning(f"查询套餐绑定模型失败: package_id={package.id}, error={e}")
                    pass
            
            package_info_list.append(package_info)
    
    return package_info_list


# ==================== API Key 缓存（使用 db=4）====================

async def cache_api_key_db4(api4_key: str, user_id: int, package_id: int = None, expire: int = None):
    """缓存 API Key 到 Redis（db=4）
    
    Args:
        api4_key: API Key 作为key
        user_id: 用户ID
        package_id: 套餐ID
        expire: 过期时间（秒），默认不过期
    """
    value = {
        "user_id": user_id,
        "package_id": package_id
    }
    await api_key_redis_db4.set(api4_key, value, expire)
    loguru.logger.info(f"Cached API key to Redis (db=4): {api4_key[:10]}..., user_id={user_id}, package_id={package_id}")


async def get_cached_api_key_db4(api4_key: str) -> Optional[dict]:
    """从 Redis 获取缓存的 API Key 信息（db=4）
    
    Args:
        api4_key: API Key 字符串
        
    Returns:
        包含 user_id 和 package_id 的字典，如果不存在返回 None
    """
    return await api_key_redis_db4.get(api4_key)


async def delete_cached_api_key_db4(api4_key: str):
    """从 Redis 删除缓存的 API Key（db=4）
    
    Args:
        api4_key: API Key 字符串
    """
    await api_key_redis_db4.delete(api4_key)
    loguru.logger.info(f"Deleted API key from Redis (db=4): {api4_key[:10]}...")


async def cache_all_api_keys_db4(api_keys: list):
    """批量缓存所有 API Key 到 Redis（db=4）
    
    Args:
        api_keys: API Key 对象列表
    """
    for api_key_obj in api_keys:
        await cache_api_key_db4(api_key_obj.api_key, api_key_obj.user_id, api_key_obj.package_id)
    loguru.logger.info(f"Cached {len(api_keys)} API keys to Redis (db=4)")


async def clear_all_api_keys_db4():
    """清除 Redis 中所有缓存的 API Key（db=4）"""
    await api_key_redis_db4.clear_pattern("*")


# ==================== 向后兼容的函数别名 ====================

# 为了保持向后兼容性，添加原来的函数名作为别名
async def cache_api_key(api_key: str, user_id: int, package_id: int = None, expire: int = None):
    """缓存 API Key 到 Redis（db=4）- 向后兼容"""
    return await cache_api_key_db4(api_key, user_id, package_id, expire)


async def delete_cached_api_key(api_key: str):
    """从 Redis 删除缓存的 API Key（db=4）- 向后兼容"""
    return await delete_cached_api_key_db4(api_key)


async def get_cached_api_key(api_key: str) -> Optional[dict]:
    """从 Redis 获取缓存的 API Key 信息（db=4）- 向后兼容"""
    return await get_cached_api_key_db4(api_key)


async def cache_all_api_keys(api_keys: list):
    """批量缓存所有 API Key 到 Redis（db=4）- 向后兼容"""
    return await cache_all_api_keys_db4(api_keys)


# ==================== 通用缓存辅助函数 ====================

async def get_redis_client(db: int = 0) -> RedisClient:
    """获取指定数据库的 Redis 客户端
    
    Args:
        db: Redis 数据库编号
        
    Returns:
        RedisClient 实例
    """
    client = RedisClient(db=db)
    await client.initialize()
    return client