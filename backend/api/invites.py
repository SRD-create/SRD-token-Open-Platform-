from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime
from pydantic import BaseModel, Field
from decimal import Decimal

from shared.models.db import get_db
from shared.models.models import Invite, User, BalanceTransaction, UserAccount, SystemConfig, Package, UserPackage
from shared.schemas.response import DataResponse, ListResponse
from shared.utils.i18n import get_translator
from api.auth import get_current_user_id, logger
from shared.utils.redis_utils import cache_user_info, get_user_current_package

router = APIRouter()


class BindInviteCodeRequest(BaseModel):
    invite_code: str = Field(..., description="邀请码")


@router.get("", response_model=ListResponse)
async def get_invites(user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """获取邀请记录"""
    # 构建查询
    result = await db.execute(
        select(Invite, User)
        .join(User, Invite.invitee_id == User.id)
        .where(Invite.inviter_id == user_id)
        .order_by(Invite.created_at.desc())
    )
    
    sent_invites = []
    for invite, user in result.all():
        sent_invites.append({
            "id": invite.id,
            "invitee": {
                "id": user.id,
                "name": user.name,
                "avatar": user.avatar
            },
            "status": invite.status,
            "reward_amount": invite.reward_amount,
            "reward_status": invite.reward_status,
            "created_at": invite.created_at
        })
    
    # 获取收到的邀请
    received_result = await db.execute(
        select(Invite, User)
        .join(User, Invite.inviter_id == User.id)
        .where(Invite.invitee_id == user_id)
        .order_by(Invite.created_at.desc())
    )
    
    received_invites = []
    for invite, user in received_result.all():
        received_invites.append({
            "id": invite.id,
            "inviter": {
                "id": user.id,
                "name": user.name,
                "avatar": user.avatar
            },
            "status": invite.status,
            "created_at": invite.created_at
        })
    
    invite_data = {
        "sent_invites": sent_invites,
        "received_invites": received_invites
    }
    
    return DataResponse(data=invite_data)


@router.post("/reward/{invite_id}", response_model=DataResponse)
async def issue_invite_reward(invite_id: int, db: AsyncSession = Depends(get_db)):
    """发放邀请奖励"""
    # 实际项目中应该从JWT token中获取user_id
    # 这里仅作为管理员接口使用
    
    invite = await db.get(Invite, invite_id)
    if not invite:
        raise HTTPException(status_code=404, detail="邀请记录不存在")
    
    if invite.reward_status == "issued":
        raise HTTPException(status_code=400, detail="奖励已经发放")
    
    # 获取邀请人账户
    from shared.models.models import UserAccount
    result = await db.execute(select(UserAccount).where(UserAccount.user_id == invite.inviter_id))
    inviter_account = result.scalar_one_or_none()
    if not inviter_account:
        raise HTTPException(status_code=404, detail="邀请人账户不存在")
    
    # 发放奖励
    balance_before = inviter_account.balance
    inviter_account.balance += invite.reward_amount
    balance_after = inviter_account.balance
    
    # 创建交易记录
    transaction = BalanceTransaction(
        user_id=invite.inviter_id,
        account_type="balance",
        type="reward",
        amount=invite.reward_amount,
        balance_before=balance_before,
        balance_after=balance_after,
        related_id=invite.id,
        description=f"邀请奖励 {invite.reward_amount} 元"
    )
    
    # 更新邀请状态
    invite.reward_status = "issued"
    invite.status = "completed"
    
    db.add(transaction)
    await db.commit()
    await db.refresh(invite)
    
    reward_data = {
        "invite_id": invite.id,
        "reward_amount": invite.reward_amount,
        "inviter_balance": inviter_account.balance
    }
    
    return DataResponse(data=reward_data, message="奖励发放成功")


@router.post("/bind", response_model=DataResponse)
async def bind_invite_code(
    request: Request,
    bind_request: BindInviteCodeRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """绑定邀请码"""
    _ = get_translator(request)
    
    # 记录请求信息
    logger.info(f"🔍 收到绑定邀请码请求: URL={str(request.url)}, invite_code={bind_request.invite_code}, user_id={user_id}")
    
    # 获取当前用户（使用数据库行锁定避免并发问题）
    from sqlalchemy import select
    user_result = await db.execute(
        select(User).where(User.id == user_id).with_for_update()  # 添加行锁定
    )
    current_user = user_result.scalar_one_or_none()
    
    if not current_user:
        raise HTTPException(status_code=404, detail=_('用户不存在'))
    
    if current_user.invited_by is not None:
        raise HTTPException(status_code=400, detail=_('您已经绑定过邀请人了'))
    
    # 检查是否是自己的邀请码
    if current_user.invite_code == bind_request.invite_code:
        raise HTTPException(status_code=400, detail=_("不能绑定自己的邀请码"))
    
    # 根据邀请码查找邀请人
    result = await db.execute(select(User).where(User.invite_code == bind_request.invite_code))
    inviter = result.scalar_one_or_none()
    
    if not inviter:
        raise HTTPException(status_code=404, detail=_("邀请码无效"))
    
    # 检查是否已经存在相同的邀请记录
    existing_invite_result = await db.execute(
        select(Invite).where(
            (Invite.inviter_id == inviter.id) & 
            (Invite.invitee_id == current_user.id)
        )
    )
    existing_invite = existing_invite_result.scalar_one_or_none()
    
    if existing_invite:
        # 已经存在邀请记录，只更新用户的 invited_by
        current_user.invited_by = inviter.id
        invite = existing_invite
        logger.info(f"邀请记录已存在，跳过创建: invite_id={invite.id}")
    else:
        # 更新当前用户的 invited_by
        current_user.invited_by = inviter.id
        
        # 创建邀请记录
        invite = Invite(
            inviter_id=inviter.id,
            invitee_id=current_user.id,
            status="completed",
            reward_status="pending"
        )
        db.add(invite)
        
        # 给邀请人返佣5块钱
        # 获取邀请人账户
        inviter_account_result = await db.execute(select(UserAccount).where(UserAccount.user_id == inviter.id))
        inviter_account = inviter_account_result.scalar_one_or_none()
        
        if not inviter_account:
            # 如果邀请人没有账户，创建一个
            inviter_account = UserAccount(user_id=inviter.id)
            db.add(inviter_account)
            await db.commit()
            await db.refresh(inviter_account)
        
        # 从配置项读取邀请人返利金额
        config_result = await db.execute(
            select(SystemConfig).where(
                SystemConfig.config_key == "invite_rewards",
                SystemConfig.is_deleted == False
            )
        )
        config = config_result.scalar_one_or_none()
        
        if not config:
            # 如果配置不存在，使用默认值 5.0
            fixed_amount = Decimal('5.0')
            logger.warning("邀请人返利配置不存在，使用默认值: 5.0 元")
        else:
            try:
                fixed_amount = Decimal(str(config.config_value))
                logger.info(f"从配置读取邀请人返利金额: {fixed_amount} 元")
            except (ValueError, TypeError):
                # 如果配置值无效，使用默认值
                fixed_amount = Decimal('5.0')
                logger.warning(f"邀请人返利配置值无效: {config.config_value}，使用默认值: 5.0 元")
        
        # 更新余额
        balance_before = inviter_account.balance
        inviter_account.balance += fixed_amount
        balance_after = inviter_account.balance
        
        # 创建余额交易记录
        transaction = BalanceTransaction(
            user_id=inviter.id,
            account_type="balance",
            type="reward",
            amount=fixed_amount,
            balance_before=balance_before,
            balance_after=balance_after,
            related_id=invite.id,
            description=f"邀请返利 - 新用户绑定邀请码"
        )
        db.add(transaction)
        
        # 更新邀请记录的奖励金额和状态
        invite.reward_amount = fixed_amount
        invite.reward_status = "issued"
        
        logger.info(f"邀请人 {inviter.id} (普通用户) 获得返利: {fixed_amount} 元")
        
    
    await db.commit()
    
    # 更新邀请人在 Redis 中的缓存 (db=3)
    balance = float(inviter_account.balance) if inviter_account else 0.0
    commission = float(inviter_account.commission) if inviter_account else 0.0
    
    # 获取邀请人当前套餐信息
    from shared.models.models import UserPackage, Package
    from sqlalchemy import select
    # 加载邀请人的套餐信息
    result = await db.execute(
        select(UserPackage, Package)
        .join(Package, UserPackage.package_id == Package.id)
        .where(UserPackage.user_id == inviter.id)
    )
    user_packages = result.all()
    package_info = await get_user_current_package(user_packages, db=db)
    
    await cache_user_info(inviter.id, balance, commission, package_info)
    await db.refresh(current_user)
    await db.refresh(invite)
    
    response_data = {
        "inviter_id": inviter.id,
        "inviter_name": inviter.name,
        "invite_id": invite.id
    }
    
    return DataResponse(data=response_data, message=_("邀请码绑定成功"))
