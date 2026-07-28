from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean, Enum, DECIMAL
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .db import Base
import enum


# 枚举类型
class OrderType(str, enum.Enum):
    RECHARGE = "recharge"
    PACKAGE = "package"
    AGENT_REGISTER = "agent_register"


class PaymentMethod(str, enum.Enum):
    WECHAT = "wechat"
    ALIPAY = "alipay"


class OrderStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"


class PackageStatus(str, enum.Enum):
    ACTIVE = "active"
    EXPIRED = "expired"


class ApiKeyStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class InviteStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"


class RewardStatus(str, enum.Enum):
    PENDING = "pending"
    ISSUED = "issued"


class AccountType(str, enum.Enum):
    BALANCE = "balance"
    COMMISSION = "commission"


class TransactionType(str, enum.Enum):
    RECHARGE = "recharge"
    USAGE = "usage"
    REWARD = "reward"
    COMMISSION = "commission"
    WITHDRAWAL = "withdrawal"


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    users = relationship("User", back_populates="role")


class AgentLevel(Base):
    __tablename__ = "agent_levels"

    id = Column(Integer, primary_key=True, index=True)
    level = Column(Integer, nullable=False)
    commission_rate = Column(DECIMAL(5, 2), nullable=False)
    price = Column(DECIMAL(10, 2), nullable=False, comment="成为该等级代理商的费用")
    description = Column(Text)
    description_en = Column(Text, comment="英文描述")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    users = relationship("User", back_populates="agent_level")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    wechat_openid = Column(String(100), unique=True, index=True)
    wechat_unionid = Column(String(100), unique=True, index=True)
    service_openid = Column(String(100), index=True)  # 服务号openid，用于微信支付
    alipay_openid = Column(String(100), unique=True, index=True)
    name = Column(String(100))
    email = Column(String(100), unique=True, index=True)
    avatar = Column(String(255))
    role_id = Column(Integer, ForeignKey("roles.id"), default=1)
    agent_level_id = Column(Integer, ForeignKey("agent_levels.id"))
    invite_code = Column(String(20), unique=True, index=True)
    invited_by = Column(Integer, ForeignKey("users.id"))
    last_login_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    role = relationship("Role", back_populates="users")
    agent_level = relationship("AgentLevel", back_populates="users")
    account = relationship("UserAccount", back_populates="user", uselist=False, cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="user", foreign_keys="Order.user_id")
    api_keys = relationship("ApiKey", back_populates="user")
    token_usage = relationship("TokenUsage", back_populates="user")
    balance_transactions = relationship("BalanceTransaction", back_populates="user")
    withdrawals = relationship("Withdrawal", back_populates="user")
    inviter = relationship("User", remote_side=[id])
    invites_sent = relationship("Invite", foreign_keys="Invite.inviter_id", back_populates="inviter")
    invites_received = relationship("Invite", foreign_keys="Invite.invitee_id", back_populates="invitee")


class UserAccount(Base):
    __tablename__ = "user_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    balance = Column(DECIMAL(10, 2), default=0.00, comment="账户余额（只能用于使用模型）")
    commission = Column(DECIMAL(10, 2), default=0.00, comment="佣金（可以提现）")
    total_tokens = Column(Integer, default=0)
    used_tokens = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    user = relationship("User", back_populates="account")


class WithdrawalStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    COMPLETED = "completed"


class Withdrawal(Base):
    __tablename__ = "withdrawals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(DECIMAL(10, 2), nullable=False)
    status = Column(String(50), nullable=False, default="pending")
    bank_account = Column(String(255))
    out_batch_no = Column(String(100), unique=True, index=True)
    transfer_bill_no = Column(String(100))
    package_info = Column(Text, comment="微信转账package_info，用于JSAPI唤起收款确认")
    failure_reason = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    user = relationship("User")


class Invite(Base):
    __tablename__ = "invites"

    id = Column(Integer, primary_key=True, index=True)
    inviter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    invitee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(50), nullable=False, default="pending")
    reward_amount = Column(DECIMAL(10, 2), default=0.00)
    reward_status = Column(String(50), nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    inviter = relationship("User", foreign_keys=[inviter_id], back_populates="invites_sent")
    invitee = relationship("User", foreign_keys=[invitee_id], back_populates="invites_received")


class Package(Base):
    __tablename__ = "packages"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    name_en = Column(String(100), comment="英文名称")
    price = Column(DECIMAL(10, 2), nullable=False)
    duration_days = Column(Integer, nullable=False)
    rpm = Column(Integer, nullable=False)
    tpm = Column(Integer, nullable=False)
    is_all_models = Column(Boolean, default=False)
    package_type = Column(String(50), comment="套餐类型")
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    user_packages = relationship("UserPackage", back_populates="package")
    package_models = relationship("PackageModel", back_populates="package")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    order_no = Column(String(50), unique=True, index=True, nullable=False)
    amount = Column(DECIMAL(10, 2), nullable=False)
    order_type = Column(String(50), nullable=False)
    package_id = Column(Integer, ForeignKey("packages.id"))
    agent_level_id = Column(Integer, ForeignKey("agent_levels.id"))
    payment_method = Column(String(50), nullable=False)
    status = Column(String(50), default="pending")
    transaction_id = Column(String(100))
    agent_commission = Column(DECIMAL(10, 2), default=0.00)
    agent_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    user = relationship("User", back_populates="orders", foreign_keys=[user_id])
    package = relationship("Package")
    agent_level = relationship("AgentLevel")
    agent = relationship("User", foreign_keys=[agent_id])
    payments = relationship("Payment", back_populates="order")
    user_packages = relationship("UserPackage", back_populates="order")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    payment_method = Column(String(50), nullable=False)
    transaction_id = Column(String(100), unique=True, nullable=False)
    amount = Column(DECIMAL(10, 2), nullable=False)
    status = Column(String(50), nullable=False, default="pending")
    callback_data = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    order = relationship("Order", back_populates="payments")


class UserPackage(Base):
    __tablename__ = "user_packages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    start_at = Column(DateTime(timezone=True), nullable=False)
    end_at = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(50), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    user = relationship("User")
    package = relationship("Package", back_populates="user_packages")
    order = relationship("Order", back_populates="user_packages")


class SystemConfig(Base):
    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True, index=True)
    config_key = Column(String(100), unique=True, nullable=False)
    config_value = Column(Text)
    description = Column(String(500))
    category = Column(String(50), default="general")
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TokenUsage(Base):
    __tablename__ = "token_usage"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(String(64), nullable=False, index=True)
    enterprise_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    api_key = Column(String(255), nullable=False, index=True)
    model_name = Column(String(100), nullable=False, index=True)
    prompt_tokens = Column(Integer, nullable=False)
    completion_tokens = Column(Integer, nullable=False)
    total_tokens = Column(Integer, nullable=False, index=True)
    request_time = Column(DateTime, nullable=False, default=func.now(), index=True)
    response_time = Column(Float, nullable=False)
    status = Column(String(20), nullable=False, index=True)
    error_message = Column(Text)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    input_token_price = Column(Float, nullable=True)
    output_token_price = Column(Float, nullable=True)
    cache_hit_tokens = Column(Integer, default=0, index=True)
    cache_storage_price = Column(Float, default=0)
    cache_hit_price = Column(Float, default=0)
    cost = Column(Float, default=0)

    # 关系
    user = relationship("User", back_populates="token_usage")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=True, index=True)
    name = Column(String(100), nullable=False)
    api_key = Column(String(255), unique=True, index=True, nullable=False)
    status = Column(String(50), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    user = relationship("User", back_populates="api_keys")
    package = relationship("Package")


class PackageModel(Base):
    __tablename__ = "package_models"

    id = Column(Integer, primary_key=True, index=True)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    model_name = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系
    package = relationship("Package", back_populates="package_models")





class BalanceTransaction(Base):
    __tablename__ = "balance_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    account_type = Column(String(50), nullable=False)
    type = Column(String(50), nullable=False)
    amount = Column(DECIMAL(10, 2), nullable=False)
    balance_before = Column(DECIMAL(10, 2), nullable=False)
    balance_after = Column(DECIMAL(10, 2), nullable=False)
    related_id = Column(Integer)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系
    user = relationship("User", back_populates="balance_transactions")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(String(64), nullable=False, index=True, comment="请求唯一ID")
    content = Column(Text, nullable=False, comment="消息内容(JSON格式)")
    created_at = Column(DateTime, default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), comment="更新时间")


class ModelService(Base):
    __tablename__ = "model_services"

    id = Column(Integer, primary_key=True, index=True, comment="服务ID")
    name = Column(String(100), nullable=False, unique=True, comment="服务名称")
    url = Column(String(255), nullable=False, comment="服务URL")
    auth_token = Column(String(255), nullable=True, comment="认证令牌")
    status = Column(String(20), default="healthy", index=True, comment="状态（healthy, unhealthy）")
    last_check = Column(DateTime, nullable=True, comment="最后检查时间")
    created_at = Column(DateTime, default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), comment="更新时间")
    description = Column(Text, nullable=True, comment="模型描述")
    max_context_length = Column(Integer, nullable=True, comment="最大上下文长度")
    model_type = Column(String(50), nullable=True, comment="模型类型（chat/text-generation/code-generation/embedding/multimodal）")
    parameters = Column(String(50), nullable=True, comment="参数量")
    provider = Column(String(50), nullable=True, comment="服务提供商，如：OpenAI、MiniMax、DeepSeek等")
    litellm_model_id = Column(String(100), nullable=True, comment="LiteLLM 模型 ID，用于更新和删除操作")
    is_publish = Column(Boolean, nullable=False, default=False, comment="是否上架，True=已上架，False=未上架")
    sort_order = Column(Integer, default=0, comment="排序值，用于模型列表排序")


class ModelPrice(Base):
    __tablename__ = "model_prices"

    id = Column(Integer, primary_key=True, index=True, comment="价格ID")
    model_name = Column(String(100), nullable=False, comment="模型名称")
    input_token_price = Column(DECIMAL(10, 8), default=0.00000080, comment="输入Token单价（元/个）")
    output_token_price = Column(DECIMAL(10, 8), default=0.00000200, comment="输出Token单价（元/个）")
    created_at = Column(DateTime, default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), comment="更新时间")
    context_min = Column(Integer, default=0, comment="上下文长度最小值（tokens）")
    context_max = Column(Integer, default=999999999, comment="上下文长度最大值（tokens）")
    cache_storage_price = Column(Float, default=0, comment="缓存存储单价（元/个/小时）")
    cache_hit_price = Column(Float, default=0, comment="缓存命中单价（元/个）")


class ModelPriceHistory(Base):
    __tablename__ = "model_price_history"

    id = Column(Integer, primary_key=True, index=True, comment="历史ID")
    model_name = Column(String(100), nullable=False, index=True, comment="模型名称")
    input_token_price = Column(DECIMAL(10, 8), nullable=False, comment="输入Token单价（元/个）")
    output_token_price = Column(DECIMAL(10, 8), nullable=False, comment="输出Token单价（元/个）")
    effective_date = Column(DateTime, nullable=False, index=True, comment="生效日期")
    end_date = Column(DateTime, nullable=True, index=True, comment="结束日期")
    created_at = Column(DateTime, default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), comment="更新时间")
    context_min = Column(Integer, default=0, comment="上下文长度最小值（tokens)")
    context_max = Column(Integer, default=999999999, comment="上下文长度最大值（tokens)")
    cache_storage_price = Column(Float, default=0, comment="缓存存储单价（元/个/小时)")
    cache_hit_price = Column(Float, default=0, comment="缓存命中单价（元/个)")