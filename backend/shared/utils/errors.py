from fastapi import HTTPException, status
from typing import Optional, Dict, Any


class AppException(HTTPException):
    """应用自定义异常基类"""
    def __init__(
        self,
        status_code: int,
        detail: str,
        error_code: str,
        headers: Optional[Dict[str, Any]] = None
    ):
        self.error_code = error_code
        super().__init__(
            status_code=status_code,
            detail={"message": detail, "error_code": error_code},
            headers=headers
        )


class BadRequestException(AppException):
    """400 Bad Request"""
    def __init__(self, detail: str, error_code: str = "BAD_REQUEST"):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
            error_code=error_code
        )


class UnauthorizedException(AppException):
    """401 Unauthorized"""
    def __init__(self, detail: str = "Unauthorized", error_code: str = "UNAUTHORIZED"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            error_code=error_code,
            headers={"WWW-Authenticate": "Bearer"}
        )


class ForbiddenException(AppException):
    """403 Forbidden"""
    def __init__(self, detail: str = "Forbidden", error_code: str = "FORBIDDEN"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
            error_code=error_code
        )


class NotFoundException(AppException):
    """404 Not Found"""
    def __init__(self, detail: str = "Resource not found", error_code: str = "NOT_FOUND"):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail,
            error_code=error_code
        )


class ConflictException(AppException):
    """409 Conflict"""
    def __init__(self, detail: str = "Conflict", error_code: str = "CONFLICT"):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
            error_code=error_code
        )


class InternalServerErrorException(AppException):
    """500 Internal Server Error"""
    def __init__(self, detail: str = "Internal server error", error_code: str = "INTERNAL_SERVER_ERROR"):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail,
            error_code=error_code
        )