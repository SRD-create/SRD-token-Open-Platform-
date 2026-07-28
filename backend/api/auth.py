
from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
import json
from jose import JWTError, jwt
from datetime import datetime, timedelta
import secrets
import string

from shared.config.config import settings
from shared.models.db import get_db
from shared.models.models import User, UserAccount
from api.schemas.auth import MockLoginRequest
from shared.schemas.response import DataResponse
from shared.utils.i18n import get_translator
from shared.utils.utils import setup_logger
from shared.utils.redis_utils import redis_client, cache_user_info, get_user_current_package
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
# 为新用户绑定 common 类型的按量计费套餐
from shared.models.models import Package, UserPackage, Order

# 安全依赖
security = HTTPBearer()


# 日志配置
logger = setup_logger()

router = APIRouter()


async def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security), db: AsyncSession = Depends(get_db)) -> int:
    """从JWT token中获取当前用户ID"""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        user_hash: str = payload.get("user_hash")
        if user_id is None or user_hash is None:
            raise HTTPException(status_code=401, detail="无效的认证凭据")
        
        # 查询用户并验证哈希值
        user = await db.get(User, int(user_id))
        if not user:
            raise HTTPException(status_code=401, detail="用户不存在")
        
        # 计算用户哈希值并验证
        import hashlib
        calculated_hash = hashlib.md5(f"{user.id}{user.created_at}{user.wechat_openid or user.email or user.alipay_openid}".encode()).hexdigest()
        if calculated_hash != user_hash:
            raise HTTPException(status_code=401, detail="无效的认证凭据")
        
        return int(user_id)
    except JWTError:
        raise HTTPException(status_code=401, detail="无效的认证凭据")


def create_access_token(data: dict, user: User, expires_delta: timedelta = None):
    """创建访问令牌"""
    to_encode = data.copy()
    # 添加用户唯一标识信息，包括用户ID、创建时间和哈希值
    import hashlib
    user_hash = hashlib.md5(f"{user.id}{user.created_at}{user.wechat_openid or user.email or user.alipay_openid}".encode()).hexdigest()
    to_encode.update({
        "user_hash": user_hash,
        "created_at": user.created_at.isoformat() if user.created_at else None
    })
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def generate_invite_code():
    """生成邀请码"""
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))


@router.get("/wechat/login", response_model=DataResponse)
def wechat_login(invite_code: str = None):
    import urllib.parse
    base_redirect_uri = settings.WECHAT_REDIRECT_URI
    scope = "snsapi_login"

    # 使用 state 参数传递 invite_code
    if invite_code and invite_code.strip():
        state = urllib.parse.quote(invite_code.strip())
    else:
        state = "STATE"

    # 使用标准的 urlencode 编码所有参数
    params = {
        "appid": settings.WECHAT_APP_ID,
        "redirect_uri": base_redirect_uri,
        "response_type": "code",
        "scope": scope,
        "state": state
    }
    query_string = urllib.parse.urlencode(params)
    url = f"https://open.weixin.qq.com/connect/qrconnect?{query_string}#wechat_redirect"

    logger.info(f"生成微信登录链接: redirect_uri={base_redirect_uri}, invite_code={invite_code}, url={url}")
    return DataResponse(data={"url": url})


@router.get("/wechat/service/login", response_model=DataResponse)
def wechat_service_login(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    import urllib.parse
    # 获取token
    token = credentials.credentials
    
    # 服务号授权回调地址
    base_redirect_uri = "https://your-domain.com/nexus/api/auth/wechat/service/callback"
    scope = "snsapi_userinfo"

    # 使用 state 参数传递token
    state_data = {
        "token": token
    }
    state = urllib.parse.quote(json.dumps(state_data))

    # 使用标准的 urlencode 编码所有参数
    params = {
        "appid": settings.WECHAT_APPID,  # 服务号appid
        "redirect_uri": base_redirect_uri,
        "response_type": "code",
        "scope": scope,
        "state": state
    }
    query_string = urllib.parse.urlencode(params)
    url = f"https://open.weixin.qq.com/connect/oauth2/authorize?{query_string}#wechat_redirect"

    logger.info(f"生成服务号授权链接: redirect_uri={base_redirect_uri}, url={url}")
    return DataResponse(data={"url": url})


@router.get("/wechat/callback", response_model=DataResponse)
async def wechat_callback(request: Request, code: str, state: str = None, db: AsyncSession = Depends(get_db)):
    import urllib.parse
    """微信登录回调"""
    # 获取翻译函数
    # 打印完整的请求信息用于调试
    logger.info(f"🔍 微信回调完整请求URL: {str(request.url)}")
    logger.info(f"🔍 微信回调查询参数: {request.query_params}")
    logger.info(f"🔍 微信回调原始code: {code}")
    logger.info(f"🔍 微信回调原始state: {state}")

    _ = get_translator(request)
    
    # 从 state 参数中提取 invite_code
    invite_code = None
    if state and state != "STATE":
        invite_code = urllib.parse.unquote(state)
        logger.info(f"✅ 从state中解码后的invite_code: {invite_code}")
    
    logger.info("微信登录回调开始: code={}, invite_code={}", code, invite_code)
    
    # 获取access_token
    token_url = f"https://api.weixin.qq.com/sns/oauth2/access_token?appid={settings.WECHAT_APP_ID}&secret={settings.WECHAT_APP_SECRET}&code={code}&grant_type=authorization_code"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(token_url)
        data = response.json()
        
        if "errcode" in data:
            logger.error("微信API错误: code={}, errmsg={}", data['errcode'], data['errmsg'])
            raise HTTPException(status_code=400, detail=_('WeChat API error: %s') % data['errmsg'])
        
        access_token = data["access_token"]
        openid = data["openid"]
        unionid = data.get("unionid")
        logger.info("获取access_token成功: openid={}, unionid={}", openid, unionid)
        
        # 获取用户信息
        user_info_url = f"https://api.weixin.qq.com/sns/userinfo?access_token={access_token}&openid={openid}"
        user_info_response = await client.get(user_info_url)
        user_info = user_info_response.json()
        
        if "errcode" in user_info:
            logger.error("微信API错误: code={}, errmsg={}", user_info['errcode'], user_info['errmsg'])
            raise HTTPException(status_code=400, detail=_('WeChat API error: %s') % user_info['errmsg'])
        
        logger.info("获取用户信息成功: nickname={}", user_info.get("nickname"))
    
    # 查找或创建用户
    result = await db.execute(select(User).where(User.wechat_openid == openid))
    user = result.scalar_one_or_none()
    
    if not user:
        # 生成邀请码
        while True:
            new_invite_code = generate_invite_code()
            result = await db.execute(select(User).where(User.invite_code == new_invite_code))
            if not result.scalar_one_or_none():
                break
        
        # 处理邀请码
        invited_by = None
        if invite_code:
            # 根据邀请码查找邀请人
            invite_result = await db.execute(select(User).where(User.invite_code == invite_code))
            inviter = invite_result.scalar_one_or_none()
            if inviter:
                invited_by = inviter.id
                logger.info("邀请码有效: invite_code={}, inviter_id={}", invite_code, inviter.id)
            else:
                logger.warning("邀请码无效: {}", invite_code)
        
        # 创建用户
        user = User(
            wechat_openid=openid,
            wechat_unionid=unionid,
            name=user_info.get("nickname"),
            avatar=user_info.get("headimgurl"),
            invite_code=new_invite_code,
            invited_by=invited_by
        )

        logger.info(f"✅当前用户的invited_by: {invited_by}")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
        # 从配置表读取默认余额
        from shared.models.models import SystemConfig
        default_balance = 0.0
        config_result = await db.execute(
            select(SystemConfig)
            .where(
                SystemConfig.config_key == "new_user_default_balance",
                SystemConfig.is_deleted == False
            )
        )
        config = config_result.scalar_one_or_none()
        if config:
            try:
                default_balance = float(config.config_value)
                logger.info(f"从配置表读取新用户默认余额: {default_balance} 元")
            except (ValueError, TypeError):
                logger.warning(f"默认余额配置值无效: {config.config_value}，使用默认值 0.0")
        else:
            logger.info("未找到新用户默认余额配置，使用默认值 0.0")
        
        # 创建用户账户
        user_account = UserAccount(user_id=user.id, balance=default_balance)
        db.add(user_account)
        

        # 按 package_type='common' 查询套餐
        common_package_result = await db.execute(select(Package).where(Package.package_type == "common"))
        common_package = common_package_result.scalar_one_or_none()
        if common_package:
            # 创建套餐订单
            import uuid
            import time
            order_no = f"ORD{int(time.time())}{str(uuid.uuid4())[:8].upper()}"
            
            order = Order(
                user_id=user.id,
                order_no=order_no,
                amount=common_package.price,
                order_type="package",
                package_id=common_package.id,
                agent_level_id=None,
                payment_method="system",
                status="paid"
            )
            db.add(order)
            await db.flush()  # 获取 order.id
            
            # 创建用户套餐关联
            start_at = datetime.utcnow()
            if common_package.duration_days > 0:
                end_at = start_at + timedelta(days=common_package.duration_days)
            else:
                # 对于无期限的套餐（如按量计费），设置一个很远的未来时间
                end_at = start_at + timedelta(days=365 * 100)
            
            user_package = UserPackage(
                user_id=user.id,
                package_id=common_package.id,
                order_id=order.id,
                start_at=start_at,
                end_at=end_at,
                status="active"
            )
            db.add(user_package)
            logger.info("为新用户绑定 common 类型套餐: user_id={}, package_id={}, package_name={}, order_id={}", 
                       user.id, common_package.id, common_package.name, order.id)
        
        # 创建邀请记录
        if invited_by:
            from shared.models.models import Invite
            invite = Invite(
                inviter_id=invited_by,
                invitee_id=user.id,
                status="completed",
                reward_status="pending"
            )
            db.add(invite)
            logger.info("创建邀请记录成功: inviter_id={}, invitee_id={}", invited_by, user.id)

        await db.commit()
        
        logger.info("创建新用户成功: id={}, name={}, invite_code={}, invited_by={}", user.id, user.name, new_invite_code, invited_by)
    else:
        logger.info("用户已存在: id={}, name={}", user.id, user.name)
    
    # 更新最后登录时间
    user.last_login_at = datetime.utcnow()
    await db.commit()
    await db.refresh(user)
    logger.info("更新用户登录时间: id={}", user.id)
    
    # 获取用户账户信息
    result = await db.execute(select(UserAccount).where(UserAccount.user_id == user.id))
    user_account = result.scalar_one_or_none()
    balance = float(user_account.balance) if user_account else 0.0
    commission = float(user_account.commission) if user_account else 0.0
    

    # 加载用户的套餐信息
    result = await db.execute(
        select(UserPackage, Package)
        .join(Package, UserPackage.package_id == Package.id)
        .where(UserPackage.user_id == user.id)
    )
    user_packages = result.all()
    package_info = await get_user_current_package(user_packages, db=db)
    
    # 更新用户缓存
    await cache_user_info(user.id, balance, commission, package_info)
    logger.info("更新用户缓存: id={}", user.id)
    
    # 创建访问令牌
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "name": user.name, "role_id": user.role_id},
        user=user,
        expires_delta=access_token_expires
    )
    
    login_data = {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "avatar": user.avatar,
            "role_id": user.role_id,
            "invite_code": user.invite_code
        }
    }
    
    logger.info("微信登录成功: user_id={}", user.id)
    return DataResponse(data=login_data, message=_('登录成功'))


@router.get("/wechat/service/callback", response_model=DataResponse)
async def wechat_service_callback(request: Request, code: str, state: str = None, db: AsyncSession = Depends(get_db)):
    import urllib.parse
    """服务号授权回调"""
    # 打印完整的请求信息用于调试
    logger.info(f"🔍 服务号回调完整请求URL: {str(request.url)}")
    logger.info(f"🔍 服务号回调查询参数: {request.query_params}")
    logger.info(f"🔍 服务号回调原始code: {code}")
    logger.info(f"🔍 服务号回调原始state: {state}")

    _ = get_translator(request)
    
    # 从 state 参数中提取token并解析用户ID
    user_id = None
    if state and state != "STATE":
        try:
            state_data = json.loads(urllib.parse.unquote(state))
            token = state_data.get("token")
            if token:
                payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
                user_id = payload.get("sub")
                logger.info(f"✅ 从state中解码后的user_id: {user_id}")
        except Exception as e:
            logger.error(f"解析state参数失败: {e}")
    
    logger.info("服务号授权回调开始: code={}, user_id={}", code, user_id)
    
    # 获取服务号的access_token和openid
    token_url = f"https://api.weixin.qq.com/sns/oauth2/access_token?appid={settings.WECHAT_APPID}&secret={settings.WECHAT_SERVICE_APP_SECRET}&code={code}&grant_type=authorization_code"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(token_url)
        data = response.json()
        logger.info("data: {}", data)
        
        if "errcode" in data:
            logger.error("微信API错误: code={}, errmsg={}", data['errcode'], data['errmsg'])
            raise HTTPException(status_code=400, detail=_('WeChat API error: %s') % data['errmsg'])
        
        access_token = data["access_token"]
        service_openid = data["openid"]
        unionid = data.get("unionid")
        logger.info("获取服务号access_token成功: service_openid={}, unionid={}", service_openid, unionid)
    

    
    # 根据用户ID查找用户
    if user_id:
        user = await db.get(User, user_id)
        if user:
            # 更新用户的服务号openid
            user.service_openid = service_openid
            # 如果有unionid也一并更新
            if unionid:
                user.wechat_unionid = unionid
            
            await db.commit()
            await db.refresh(user)
            logger.info("更新用户服务号openid成功: user_id={}, service_openid={}", user.id, service_openid)
            
            # 创建访问令牌
            access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
            access_token = create_access_token(
                data={"sub": str(user.id), "name": user.name, "role_id": user.role_id},
                user=user,
                expires_delta=access_token_expires
            )
            
            login_data = {
                "access_token": access_token,
                "token_type": "bearer",
                "user": {
                    "id": user.id,
                    "name": user.name,
                    "avatar": user.avatar,
                    "role_id": user.role_id,
                    "invite_code": user.invite_code,
                    "service_openid": user.service_openid
                }
            }
            
            logger.info("服务号授权登录成功: user_id={}", user.id)
            return DataResponse(data={}, message=_('登录成功'))
        else:
            logger.error("未找到用户: user_id={}", user_id)
            return DataResponse(data={}, message=_('服务号授权成功，但未找到用户'))
    else:
        # 兼容旧逻辑：如果没有用户ID，尝试通过unionid查找
        if unionid:
            result = await db.execute(select(User).where(User.wechat_unionid == unionid))
            user = result.scalar_one_or_none()
            
            if user:
                # 更新用户的服务号openid
                user.service_openid = service_openid
                await db.commit()
                await db.refresh(user)
                logger.info("更新用户服务号openid成功: user_id={}, service_openid={}", user.id, service_openid)
                
                # 创建访问令牌
                access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
                access_token = create_access_token(
                    data={"sub": str(user.id), "name": user.name, "role_id": user.role_id},
                    user=user,
                    expires_delta=access_token_expires
                )
                
                login_data = {
                    "access_token": access_token,
                    "token_type": "bearer",
                    "user": {
                        "id": user.id,
                        "name": user.name,
                        "avatar": user.avatar,
                        "role_id": user.role_id,
                        "invite_code": user.invite_code
                    }
                }
                
                logger.info("服务号授权登录成功: user_id={}", user.id)
                return DataResponse(data={}, message=_('登录成功'))
            else:
                logger.error("通过unionid未找到用户: unionid={}", unionid)
                return DataResponse(data={}, message=_('服务号授权成功，但未找到用户'))
        else:
            logger.error("未获取到用户ID和unionid")
            return DataResponse(data={}, message=_('服务号授权成功，但未获取到用户信息'))




