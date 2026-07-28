from pydantic import BaseModel


class PurchasePackageRequest(BaseModel):
    """购买套餐请求模型"""
    payment_method: str
