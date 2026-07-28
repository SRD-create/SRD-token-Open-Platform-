import os
from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    """应用配置"""
    # 应用信息
    APP_NAME: str
    APP_VERSION: str
    DEBUG: bool
    
    # 数据库配置
    DATABASE_URL: str
    
    # JWT配置
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    
    # CORS配置
    CORS_ORIGINS: List[str]
    
    # Redis配置
    REDIS_HOST: str
    REDIS_PORT: int
    REDIS_PASSWORD: str
    REDIS_DB: int

    # Kafka 配置（从数据库读取，这里仅作为类型定义）
    KAFKA_BOOTSTRAP_SERVERS: Optional[str] = None
    KAFKA_CONSUMER_GROUP: Optional[str] = None
    KAFKA_TOPIC: Optional[str] = None
    KAFKA_AUTO_OFFSET_RESET: str = "earliest"
    KAFKA_ENABLE_AUTO_COMMIT: bool = True
    KAFKA_MAX_POLL_RECORDS: int = 500
    KAFKA_SESSION_TIMEOUT_MS: int = 30000
    KAFKA_HEARTBEAT_INTERVAL_MS: int = 10000
    KAFKA_IDEMPOTENCY_REDIS_DB: int = 2
    KAFKA_IDEMPOTENCY_EXPIRE_HOURS: int = 24

    # WeChat
    WECHAT_APP_ID: str
    WECHAT_APP_SECRET: str
    WECHAT_REDIRECT_URI: str
    
    # WeChat Pay
    WECHAT_APPID: str
    WECHAT_SERVICE_APP_SECRET: str
    WECHAT_MCH_ID: str
    WECHAT_API_V3_KEY: str
    WECHAT_CERT_SERIAL: str
    WECHAT_PRIVATE_KEY_PATH: str
    WECHAT_NOTIFY_URL: str

    model_config = {
        "case_sensitive": True
    }


# 根据环境变量选择配置文件
env = os.getenv("ENVIRONMENT", "development")
if env == "production":
    settings = Settings(_env_file=".env.production")
else:
    settings = Settings(_env_file=".env")