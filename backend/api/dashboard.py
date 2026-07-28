from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract, and_
from datetime import datetime, timedelta

from shared.models.db import get_db
from shared.models.models import User, TokenUsage, Order, Withdrawal, UserPackage, Package, ModelService
from shared.schemas.response import DataResponse
from api.auth import get_current_user_id

router = APIRouter()


async def get_current_admin(user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """获取当前管理员用户"""
    # 查询admin角色的id
    from shared.models.models import Role
    admin_role_result = await db.execute(
        select(Role.id)
        .where(Role.name == "admin")
    )
    admin_role = admin_role_result.first()
    admin_role_id = admin_role.id if admin_role else None
    
    # 查询用户的角色id
    from shared.models.models import User
    user = await db.get(User, user_id)
    if not user or user.role_id != admin_role_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="只有管理员可以访问此接口")
    return user_id


@router.get("/dashboard", response_model=DataResponse)
async def get_dashboard_data(
    admin_user_id: int = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    获取仪表盘数据
    只有管理员可以访问
    """
    # 获取当前时间
    now = datetime.now()
    current_month = now.month
    current_year = now.year
    
    # 1. 总用户数量
    total_users_result = await db.execute(
        select(func.count(User.id))
    )
    total_users = total_users_result.scalar() or 0
    
    # 2. 总代理商数量
    total_agents_result = await db.execute(
        select(func.count(User.id))
        .where(User.agent_level_id.isnot(None))
    )
    total_agents = total_agents_result.scalar() or 0
    
    # 3. 本月收益（充值+套餐）
    start_of_month = datetime(current_year, current_month, 1)
    monthly_revenue_result = await db.execute(
        select(func.sum(Order.amount))
        .where(
            and_(
                Order.created_at >= start_of_month,
                Order.status == "paid",
                Order.order_type.in_(["recharge", "package"])
            )
        )
    )
    monthly_revenue = monthly_revenue_result.scalar() or 0
    
    # 4. 本月Token消耗量
    monthly_token_usage_result = await db.execute(
        select(func.sum(TokenUsage.total_tokens))
        .where(
            and_(
                extract('year', TokenUsage.request_time) == current_year,
                extract('month', TokenUsage.request_time) == current_month
            )
        )
    )
    monthly_token_usage = monthly_token_usage_result.scalar() or 0
    
    # 5. 本月佣金提现金额
    monthly_withdrawal_result = await db.execute(
        select(func.sum(Withdrawal.amount))
        .where(
            and_(
                Withdrawal.created_at >= start_of_month,
                Withdrawal.status == "completed"
            )
        )
    )
    monthly_withdrawal = monthly_withdrawal_result.scalar() or 0
    
    # 6. 年度每个月的收益（充值+套餐）趋势图数据
    yearly_revenue_data = []
    for month in range(1, 13):
        month_start = datetime(current_year, month, 1)
        if month < 12:
            month_end = datetime(current_year, month + 1, 1) - timedelta(seconds=1)
        else:
            month_end = datetime(current_year, 12, 31, 23, 59, 59)
        
        month_revenue_result = await db.execute(
            select(func.sum(Order.amount))
            .where(
                and_(
                    Order.created_at >= month_start,
                    Order.created_at <= month_end,
                    Order.status == "paid",
                    Order.order_type.in_(["recharge", "package"])
                )
            )
        )
        month_revenue = month_revenue_result.scalar() or 0
        yearly_revenue_data.append({
            "month": month,
            "revenue": float(month_revenue)
        })
    
    # 7. 年度每个月的Token消耗量趋势图数据
    yearly_token_usage_data = []
    for month in range(1, 13):
        month_token_usage_result = await db.execute(
            select(func.sum(TokenUsage.total_tokens))
            .where(
                and_(
                    extract('year', TokenUsage.request_time) == current_year,
                    extract('month', TokenUsage.request_time) == month
                )
            )
        )
        month_token_usage = month_token_usage_result.scalar() or 0
        yearly_token_usage_data.append({
            "month": month,
            "tokens": int(month_token_usage)
        })
    
    # 8. 年度每个月的佣金提现金额趋势图数据
    yearly_withdrawal_data = []
    for month in range(1, 13):
        month_start = datetime(current_year, month, 1)
        if month < 12:
            month_end = datetime(current_year, month + 1, 1) - timedelta(seconds=1)
        else:
            month_end = datetime(current_year, 12, 31, 23, 59, 59)
        
        month_withdrawal_result = await db.execute(
            select(func.sum(Withdrawal.amount))
            .where(
                and_(
                    Withdrawal.created_at >= month_start,
                    Withdrawal.created_at <= month_end,
                    Withdrawal.status == "completed"
                )
            )
        )
        month_withdrawal = month_withdrawal_result.scalar() or 0
        yearly_withdrawal_data.append({
            "month": month,
            "amount": float(month_withdrawal)
        })
    
    # 9. token使用量前10用户
    top_token_users_result = await db.execute(
        select(
            User.id,
            User.name,
            func.sum(TokenUsage.total_tokens).label("total_tokens")
        )
        .join(TokenUsage, User.id == TokenUsage.user_id)
        .group_by(User.id, User.name)
        .order_by(func.sum(TokenUsage.total_tokens).desc())
        .limit(10)
    )
    top_token_users = [
        {
            "user_id": user_id,
            "user_name": name,
            "total_tokens": int(total_tokens)
        }
        for user_id, name, total_tokens in top_token_users_result.all()
    ]
    
    # 10. 用户购买的套餐按照数量前3名
    top_packages_result = await db.execute(
        select(
            Package.id,
            Package.name,
            func.count(UserPackage.id).label("purchase_count")
        )
        .join(UserPackage, Package.id == UserPackage.package_id)
        .group_by(Package.id, Package.name)
        .order_by(func.count(UserPackage.id).desc())
        .limit(3)
    )
    top_packages = [
        {
            "package_id": package_id,
            "package_name": name,
            "purchase_count": int(count)
        }
        for package_id, name, count in top_packages_result.all()
    ]
    
    # 11. 模型的数量
    total_models_result = await db.execute(
        select(func.count(ModelService.id))
        .where(ModelService.is_publish == True)
    )
    total_models = total_models_result.scalar() or 0
    
    # 12. 模型使用量按照前3排名
    top_model_usage_result = await db.execute(
        select(
            TokenUsage.model_name,
            func.sum(TokenUsage.total_tokens).label("total_tokens")
        )
        .group_by(TokenUsage.model_name)
        .order_by(func.sum(TokenUsage.total_tokens).desc())
        .limit(3)
    )
    top_model_usage = [
        {
            "model_name": model_name,
            "total_tokens": int(total_tokens)
        }
        for model_name, total_tokens in top_model_usage_result.all()
    ]
    
    # 构建响应数据
    dashboard_data = {
        "total_users": total_users,
        "total_agents": total_agents,
        "monthly_revenue": float(monthly_revenue),
        "monthly_token_usage": int(monthly_token_usage),
        "monthly_withdrawal": float(monthly_withdrawal),
        "yearly_revenue_data": yearly_revenue_data,
        "yearly_token_usage_data": yearly_token_usage_data,
        "yearly_withdrawal_data": yearly_withdrawal_data,
        "top_token_users": top_token_users,
        "top_packages": top_packages,
        "total_models": total_models,
        "top_model_usage": top_model_usage
    }
    
    return DataResponse(data=dashboard_data, message="获取仪表盘数据成功")
