from pydantic import BaseModel, Field
from typing import Optional, Generic, TypeVar, List, Union

T = TypeVar('T')


class BaseResponse(BaseModel):
    """基础响应模型"""
    code: int = Field(default=200, description="响应码")
    message: str = Field(default="操作成功", description="响应信息")
    data: Optional[dict] = Field(default=None, description="响应数据")


class DataResponse(BaseModel, Generic[T]):
    """带数据的响应模型"""
    code: int = Field(default=200, description="响应码")
    message: str = Field(default="操作成功", description="响应信息")
    data: Optional[T] = Field(default=None, description="响应数据")


class ListResponse(BaseModel, Generic[T]):
    """列表响应模型"""
    code: int = Field(default=200, description="响应码")
    message: str = Field(default="操作成功", description="响应信息")
    data: Optional[Union[List[T], dict]] = Field(default=None, description="响应数据")
    total: int = Field(default=0, description="总记录数")


class ErrorResponse(BaseModel):
    """错误响应模型"""
    code: int = Field(default=500, description="响应码")
    message: str = Field(default="操作失败", description="响应信息")
    data: Optional[dict] = Field(default=None, description="响应数据")
