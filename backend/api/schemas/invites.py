from pydantic import BaseModel


class IssueInviteRewardRequest(BaseModel):
    """发放邀请奖励请求模型"""
    invite_id: int
