from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError
from loguru import logger

from shared.utils.errors import AppException
from shared.schemas.response import ErrorResponse


async def app_exception_handler(request: Request, exc: AppException):
    """应用自定义异常处理"""
    logger.error(f"AppException: {exc.detail}, Error code: {exc.error_code}")
    error_response = ErrorResponse(
        code=exc.status_code,
        message=exc.detail.get('message', '操作失败'),
        data=exc.detail.get('data')
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response.model_dump()
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """请求参数验证异常处理"""
    logger.error(f"Validation error: {exc.errors()}")
    error_response = ErrorResponse(
        code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        message="请求参数验证失败",
        data={
            "error_code": "VALIDATION_ERROR",
            "details": exc.errors()
        }
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=error_response.model_dump()
    )


async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    """数据库异常处理"""
    logger.error(f"Database error: {str(exc)}")
    error_response = ErrorResponse(
        code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        message="数据库操作失败",
        data={
            "error_code": "DATABASE_ERROR"
        }
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_response.model_dump()
    )


async def general_exception_handler(request: Request, exc: Exception):
    """通用异常处理"""
    logger.error(f"General error: {str(exc)}")
    error_response = ErrorResponse(
        code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        message="服务器内部错误",
        data={
            "error_code": "INTERNAL_SERVER_ERROR"
        }
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_response.model_dump()
    )