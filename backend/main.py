from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from fastapi.openapi.utils import get_openapi

from shared.config.config import settings
from api.router import router as admin_router
from shared.models.db import engine, Base
from shared.utils.utils import setup_logger
from shared.middleware.message_queue.kafka_service import kafka_service, start_kafka_service, stop_kafka_service
from shared.utils.exception_handler import app_exception_handler, validation_exception_handler, sqlalchemy_exception_handler, general_exception_handler
from shared.utils.errors import AppException
from sqlalchemy.exc import SQLAlchemyError


# 日志配置
logger = setup_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时执行
    logger.info("Starting up...")
    
    # 启动 Kafka 消费者服务
    try:
        # 启动 Kafka 消费者服务
        await start_kafka_service()
        logger.info("Kafka consumer service started")
    except Exception as e:
        logger.error(f"Failed to start Kafka consumer service: {e}")
    

    yield
    
    # 关闭时执行
    logger.info("Shutting down...")
    
    # 停止 Kafka 消费者服务
    try:
        await stop_kafka_service()
        logger.info("Kafka consumer service stopped")
    except Exception as e:
        logger.error(f"Failed to stop Kafka consumer service: {e}")
    
    await engine.dispose()


# 创建FastAPI应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="API for AI Token Platform with WeChat login and payment integration",
    lifespan=lifespan
)


def custom_openapi():
    """自定义OpenAPI文档，支持中文"""
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="AI Token 平台 API",
        version=settings.APP_VERSION,
        summary="AI Token 平台 API 文档",
        description="AI Token 平台的 API 接口文档，支持微信登录、支付、API密钥管理等功能。",
        routes=app.routes,
    )
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi



# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册异常处理器
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

# 注册路由
app.include_router(admin_router, prefix="/nexus/api")


@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "Welcome to AI Token Nexus API",
        "version": settings.APP_VERSION,
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8002,
        reload=settings.DEBUG
    )