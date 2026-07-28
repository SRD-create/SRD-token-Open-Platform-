from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta

from shared.models.db import get_db
from shared.models.models import Package, UserPackage, Order, PackageModel
from api.schemas.packages import PurchasePackageRequest
from shared.schemas.response import DataResponse, ListResponse
from api.auth import get_current_user_id
from shared.utils.i18n import get_translator

router = APIRouter()


@router.get("", response_model=ListResponse)
async def get_packages(
    request: Request,
    limit: int = 10, 
    offset: int = 0, 
    db: AsyncSession = Depends(get_db)
):
    """获取套餐列表"""
    _ = get_translator(request)
    # 获取总记录数
    total_result = await db.execute(select(func.count(Package.id)))
    total = total_result.scalar() or 0
    
    # 获取分页数据
    result = await db.execute(
        select(Package)
        .order_by(Package.price)
        .limit(limit)
        .offset(offset)
    )
    packages = result.scalars().all()
    
    # 获取语言偏好
    accept_language = request.headers.get('accept-language', '').lower()
    is_english = 'en' in accept_language
    
    package_list = []
    for p in packages:
        # 构建套餐信息
        package_info = {
            "id": p.id,
            "name": p.name_en if (is_english and p.name_en) else p.name,
            "price": p.price,
            "duration_days": p.duration_days,
            "rpm": p.rpm,
            "tpm": p.tpm,
            "is_all_models": p.is_all_models,
            "package_type": p.package_type,
            "description": p.description,
            "models": []
        }
        
        # 如果不是使用所有模型，查询套餐绑定的模型
        if not p.is_all_models:
            # 查询套餐绑定的模型
            model_result = await db.execute(
                select(PackageModel)
                .where(PackageModel.package_id == p.id)
            )
            package_models = model_result.scalars().all()
            # 提取模型名称列表
            model_names = [pm.model_name for pm in package_models]
            package_info["models"] = model_names
        
        package_list.append(package_info)
    
    return ListResponse(data=package_list, total=total)


@router.get("/user", response_model=ListResponse)
async def get_user_packages(
    request: Request,
    limit: int = 10, 
    offset: int = 0, 
    user_id: int = Depends(get_current_user_id), 
    db: AsyncSession = Depends(get_db)
):
    """获取用户的套餐"""
    _ = get_translator(request)
    # 获取当前时间
    now = datetime.utcnow()
    
    # 获取总记录数（只统计可用的套餐：状态为 active 且未过期）
    total_result = await db.execute(
        select(func.count(UserPackage.id))
        .where(
            UserPackage.user_id == user_id,
            UserPackage.status == 'active',
            UserPackage.end_at > now
        )
    )
    total = total_result.scalar() or 0
    
    # 获取分页数据（只获取可用的套餐）
    result = await db.execute(
        select(UserPackage, Package)
        .join(Package, UserPackage.package_id == Package.id)
        .where(
            UserPackage.user_id == user_id,
            UserPackage.status == 'active',
            UserPackage.end_at > now
        )
        .order_by(UserPackage.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    
    # 获取语言偏好
    accept_language = request.headers.get('accept-language', '').lower()
    is_english = 'en' in accept_language
    
    packages_data = []
    for user_package, package in result.all():
        packages_data.append({
            "id": user_package.id,
            "package": [{
                "id": package.id,
                "name": package.name_en if (is_english and package.name_en) else package.name,
                "price": package.price,
                "duration_days": package.duration_days,
                "rpm": package.rpm,
                "tpm": package.tpm,
                "is_all_models": package.is_all_models,
                "package_type": package.package_type,
                "description": package.description
            }],
            "start_at": user_package.start_at,
            "end_at": user_package.end_at,
            "status": user_package.status
        })
    
    if packages_data:
        return ListResponse(data=packages_data, total=total)
    else:
        return ListResponse(data=[], total=0)


@router.post("/{package_id}/purchase", response_model=DataResponse)
async def purchase_package(
    package_id: int, 
    request_data: PurchasePackageRequest, 
    user_id: int = Depends(get_current_user_id), 
    db: AsyncSession = Depends(get_db),
    request: Request = None
):
    """购买套餐"""
    _ = get_translator(request)
    # 检查套餐是否存在
    package = await db.get(Package, package_id)
    if not package:
        raise HTTPException(status_code=404, detail=_("套餐不存在"))
    
    # 检查支付方式
    if request_data.payment_method not in ["wechat", "alipay"]:
        raise HTTPException(status_code=400, detail=_("无效的支付方式"))
    
    # 创建订单
    import uuid
    import time
    order_no = f"ORD{int(time.time())}{str(uuid.uuid4())[:8].upper()}"
    
    order = Order(
        user_id=user_id,
        order_no=order_no,
        amount=package.price,
        order_type="package",
        package_id=package_id,
        payment_method=request_data.payment_method,
        status="pending"
    )
    
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    # 如果是微信支付，生成支付二维码
    if request_data.payment_method == "wechat":
        from shared.services.wechat_pay import wxpay
        
        # 调用微信支付API创建Native支付单
        out_trade_no = order.order_no
        total_fee = int(order.amount * 100)  # 转换为分
        desc = f"AI Token 平台 - {package.name}套餐"
        
        try:
            res = wxpay.create_native(out_trade_no, total_fee, desc)
            code_url = res.get("code_url")
            
            if not code_url:
                error_message = _("微信支付创建失败: {res}").format(res=res)
                raise HTTPException(status_code=400, detail=error_message)
            
            # 创建支付记录
            from shared.models.models import Payment
            payment = Payment(
                order_id=order.id,
                payment_method="wechat",
                transaction_id=out_trade_no,
                amount=order.amount,
                status="pending"
            )
            
            db.add(payment)
            await db.commit()
            
            return DataResponse(
                data={
                    "order_id": order.id,
                    "order_no": order.order_no,
                    "amount": order.amount,
                    "payment_method": order.payment_method,
                    "code_url": code_url
                },
                message=_("套餐订单创建成功，请扫码支付")
            )
        except Exception as e:
            # 回滚订单
            await db.delete(order)
            await db.commit()
            error_message = _("微信支付创建失败: {e}").format(e=str(e))
            raise HTTPException(status_code=500, detail=error_message)
    else:
        # 其他支付方式处理（如支付宝）
        # 这里可以添加支付宝支付逻辑
        return DataResponse(
            data={
                "order_id": order.id,
                "order_no": order.order_no,
                "amount": order.amount,
                "payment_method": order.payment_method
            },
            message=_("套餐订单创建成功")
        )
