from pydantic import BaseModel
from datetime import datetime


class TokenUsageFilter(BaseModel):
    """Token使用记录过滤模型"""
    model_name: str = None
    status: str = None
    start_date: str = None
    end_date: str = None
    limit: int = 10
    offset: int = 0
    
    model_config = {
        "protected_namespaces": ()
    }
