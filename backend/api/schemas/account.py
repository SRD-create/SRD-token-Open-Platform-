from pydantic import BaseModel


class TopUpRequest(BaseModel):
    """充值请求模型"""
    amount: float
    payment_method: str


class WithdrawalRequest(BaseModel):
    """提现请求模型"""
    amount: float
    bank_account: str


class AgentRegisterRequest(BaseModel):
    """代理商注册请求模型"""
    agent_level_id: int
    payment_method: str
