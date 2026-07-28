from pydantic import BaseModel


class CreateApiKeyRequest(BaseModel):
    """创建API密钥请求模型"""
    name: str
    package_id: int = None


class UpdateApiKeyStatusRequest(BaseModel):
    """更新API密钥状态请求模型"""
    status: str
