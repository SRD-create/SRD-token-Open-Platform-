from pydantic import BaseModel


class CreatePaymentRequest(BaseModel):
    """创建支付请求模型"""
    order_id: int
    payment_method: str
