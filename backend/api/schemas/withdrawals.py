from pydantic import BaseModel


class WithdrawalRequest(BaseModel):
    """提现请求模型"""
    amount: float
    bank_account: str
