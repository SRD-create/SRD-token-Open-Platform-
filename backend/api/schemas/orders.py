from pydantic import BaseModel


class OrderFilter(BaseModel):
    """订单过滤模型"""
    order_type: str = None
    status: str = None
    limit: int = 10
    offset: int = 0
