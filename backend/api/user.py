from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from shared.models.db import get_db
from shared.models.models import User, UserAccount, Role, AgentLevel, UserPackage, Package, PackageStatus
from api.schemas.user import UserUpdate
from shared.schemas.response import DataResponse, ListResponse
from api.auth import get_current_user_id

router = APIRouter()


@router.get("/me", response_model=DataResponse)
async def get_current_user(request: Request, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """获取当前用户信息"""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    
    # 获取用户账户信息，如果不存在则创建
    result = await db.execute(select(UserAccount).where(UserAccount.user_id == user.id))
    user_account = result.scalar_one_or_none()
    if not user_account:
        user_account = UserAccount(user_id=user.id)
        db.add(user_account)
        await db.commit()
        await db.refresh(user_account)
    
    # 获取角色信息
    role = await db.get(Role, user.role_id)
    
    # 获取代理商等级信息
    agent_level = None
    if user.agent_level_id:
        agent_level = await db.get(AgentLevel, user.agent_level_id)
    
    # 查询admin角色的id
    admin_role_result = await db.execute(
        select(Role.id)
        .where(Role.name == "admin")
    )
    admin_role = admin_role_result.first()
    admin_role_id = admin_role.id if admin_role else None
    
    # 获取语言偏好
    accept_language = request.headers.get('accept-language', '').lower()
    is_english = 'en' in accept_language
    
    # 获取用户购买的ACTIVE状态的套餐信息
    active_packages_result = await db.execute(
        select(UserPackage, Package)
        .join(Package, UserPackage.package_id == Package.id)
        .where(UserPackage.user_id == user.id, UserPackage.status == PackageStatus.ACTIVE)
    )
    
    active_packages = []
    for user_package, package in active_packages_result.all():
        active_packages.append({
            "id": package.id,
            "name": package.name,
            "description": package.description,
            "price": package.price,
            "duration_days": package.duration_days,
            "status": user_package.status,
            "purchased_at": user_package.created_at,
            "start_at": user_package.start_at,
            "end_at": user_package.end_at
        })
    
    # 判断是否为管理员
    is_admin = role.id == admin_role_id if (role and admin_role_id) else False
    
    user_data = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "avatar": user.avatar,
        "is_admin": is_admin,
        "agent_level": {
            "id": agent_level.id if agent_level else None,
            "level": agent_level.level if agent_level else None,
            "commission_rate": agent_level.commission_rate if agent_level else None,
            "description": agent_level.description if (agent_level and not is_english) else (getattr(agent_level, 'description_en', None) if agent_level else None)
        } if agent_level else None,
        "invite_code": user.invite_code,
        "invited_by": user.invited_by,
        "last_login_at": user.last_login_at,
        "created_at": user.created_at,
        "account": {
            "balance": user_account.balance,
            "commission": user_account.commission,
            "total_tokens": user_account.total_tokens,
            "used_tokens": user_account.used_tokens
        },
        "active_packages": active_packages,
        "wechat_service_bound": True if user.service_openid else False
    }
    
    return DataResponse(data=user_data)


@router.put("/me", response_model=DataResponse)
async def update_user(user_data: UserUpdate, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """更新用户信息"""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    
    # 更新用户信息
    if user_data.name:
        user.name = user_data.name
    if user_data.email:
        # 检查邮箱是否已存在
        result = await db.execute(select(User).where(User.email == user_data.email, User.id != user_id))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="邮箱已存在")
        user.email = user_data.email
    
    await db.commit()
    await db.refresh(user)
    
    update_data = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "avatar": user.avatar,
        "invite_code": user.invite_code,
        "created_at": user.created_at
    }
    
    return DataResponse(data=update_data, message="更新成功")


@router.get("/invited-users", response_model=ListResponse)
async def get_invited_users(
    limit: int = 10, 
    offset: int = 0, 
    user_id: int = Depends(get_current_user_id), 
    db: AsyncSession = Depends(get_db)
):
    """获取邀请的用户列表"""

    from shared.models.models import Invite
    
    # 获取总记录数
    total_result = await db.execute(
        select(func.count(Invite.id))
        .where(Invite.inviter_id == user_id)
    )
    total = total_result.scalar() or 0
    
    # 获取分页数据
    result = await db.execute(
        select(Invite, User)
        .join(User, Invite.invitee_id == User.id)
        .where(Invite.inviter_id == user_id)
        .order_by(Invite.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    
    invited_users = []
    for invite, user in result.all():
        invited_users.append({
            "id": user.id,
            "name": user.name,
            "avatar": user.avatar,
            "invite_status": invite.status,
            "reward_amount": invite.reward_amount,
            "reward_status": invite.reward_status,
            "invited_at": invite.created_at
        })
    
    return ListResponse(data=invited_users, total=total)
