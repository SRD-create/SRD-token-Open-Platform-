from datetime import datetime, timedelta
from typing import Optional, Union
from jose import JWTError, jwt
from passlib.context import CryptContext
from shared.config.config import settings
from loguru import logger
import secrets
import os


# 确保logs目录存在
os.makedirs('logs', exist_ok=True)


# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# 密码处理
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """获取密码哈希值"""
    return pwd_context.hash(password)


# JWT处理
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建访问令牌"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """解码访问令牌"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


# 生成API密钥
def generate_api_key() -> str:
    """生成API密钥，格式：sk-xxx（32位十六进制，类似DeepSeek）"""
    return "sk-" + secrets.token_hex(16)


# 日志配置
def setup_logger():
    """设置日志"""
    logger.add(
        "logs/app.log",
        rotation="10 MB",
        compression="zip",
        level="INFO"
    )
    return logger


# 获取客户端IP
def get_client_ip(request) -> str:
    """获取客户端IP"""
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.client.host


# 验证权限
def check_permissions(user_role: str, required_role: str) -> bool:
    """验证用户权限"""
    roles = ["user", "admin"]
    user_role_index = roles.index(user_role)
    required_role_index = roles.index(required_role)
    return user_role_index >= required_role_index


# 数字格式化
def format_number(value: Union[int, float]) -> str:
    """
    格式化数字，自动选择合适的单位（K、M、B、T）
    
    Args:
        value: 要格式化的数字
        
    Returns:
        格式化后的字符串，如 "5.70K", "1.50M", "2.30B"
        
    Examples:
        >>> format_number(5700)
        '5.70K'
        >>> format_number(1500000)
        '1.50M'
        >>> format_number(500)
        '500'
    """
    value = float(value)

    if value >= 1_000_000_000_000:  # T - 万亿
        t_value = value / 1_000_000_000_000
        t_value = int(t_value * 100) / 100  # 保留2位小数，不四舍五入
        return f"{t_value:.2f}T"
    elif value >= 1_000_000_000:  # B - 十亿
        b_value = value / 1_000_000_000
        b_value = int(b_value * 100) / 100
        return f"{b_value:.2f}B"
    elif value >= 1_000_000:  # M - 百万
        m_value = value / 1_000_000
        m_value = int(m_value * 100) / 100
        return f"{m_value:.2f}M"
    elif value >= 1000:  # K - 千
        k_value = value / 1000
        k_value = int(k_value * 100) / 100
        return f"{k_value:.2f}K"

    return str(int(value))
