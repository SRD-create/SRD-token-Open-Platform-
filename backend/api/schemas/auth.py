from pydantic import BaseModel


class MockLoginRequest(BaseModel):
    """模拟登录请求模型"""
    user_id: int = 1
