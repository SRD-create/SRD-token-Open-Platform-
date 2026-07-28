"""
配置工具模块

提供从系统配置表读取配置的功能
"""

from shared.models.db import AsyncSessionLocal
from shared.models.models import SystemConfig
from sqlalchemy import select
from shared.config.config import settings


async def get_system_config(config_key: str, default_value: str = None) -> str:
    """
    从系统配置表获取配置值

    Args:
        config_key: 配置键
        default_value: 默认值

    Returns:
        配置值或默认值
    """
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SystemConfig.config_value)
                .where(SystemConfig.config_key == config_key)
                .where(SystemConfig.is_deleted == False)
            )
            value = result.scalar_one_or_none()
            return value if value is not None else default_value
    except Exception as e:
        print(f"Error getting system config: {e}")
        return default_value


async def get_kafka_config() -> dict:
    """
    获取 Kafka 相关配置

    常用配置（可能变动）从数据库读取：
    - KAFKA_BOOTSTRAP_SERVERS
    - KAFKA_TOPIC
    - KAFKA_CONSUMER_GROUP_ID

    不常修改的配置从 config.py 读取：
    - KAFKA_AUTO_OFFSET_RESET
    - KAFKA_ENABLE_AUTO_COMMIT
    - KAFKA_MAX_POLL_RECORDS
    - KAFKA_SESSION_TIMEOUT_MS
    - KAFKA_HEARTBEAT_INTERVAL_MS
    - KAFKA_IDEMPOTENCY_REDIS_DB
    - KAFKA_IDEMPOTENCY_EXPIRE_HOURS

    Returns:
        Kafka 配置字典
    """
    configs = {
        # 从数据库读取（常用配置）
        "KAFKA_BOOTSTRAP_SERVERS": await get_system_config("kafka.bootstrap_servers", ""),
        "KAFKA_TOPIC": await get_system_config("kafka.topic", ""),
        "KAFKA_CONSUMER_GROUP_ID": await get_system_config("kafka.consumer_group_id", ""),

        # 从 config.py 读取（不常修改）
        "KAFKA_AUTO_OFFSET_RESET": settings.KAFKA_AUTO_OFFSET_RESET,
        "KAFKA_ENABLE_AUTO_COMMIT": settings.KAFKA_ENABLE_AUTO_COMMIT,
        "KAFKA_MAX_POLL_RECORDS": settings.KAFKA_MAX_POLL_RECORDS,
        "KAFKA_SESSION_TIMEOUT_MS": settings.KAFKA_SESSION_TIMEOUT_MS,
        "KAFKA_HEARTBEAT_INTERVAL_MS": settings.KAFKA_HEARTBEAT_INTERVAL_MS,
        "KAFKA_IDEMPOTENCY_REDIS_DB": settings.KAFKA_IDEMPOTENCY_REDIS_DB,
        "KAFKA_IDEMPOTENCY_EXPIRE_HOURS": settings.KAFKA_IDEMPOTENCY_EXPIRE_HOURS,
    }

    return configs