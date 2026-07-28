from pydantic import BaseModel


class UserUpdate(BaseModel):
    """用户更新模型"""
    name: str = None
    email: str = None
