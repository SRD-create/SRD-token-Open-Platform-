from fastapi import APIRouter
from .auth import router as auth_router
from .user import router as user_router
from .account import router as account_router
from .api_keys import router as api_keys_router
from .packages import router as packages_router
from .orders import router as orders_router
from .payments import router as payments_router
from .withdrawals import router as withdrawals_router
from .token_usage import router as token_usage_router
from .invites import router as invites_router
from .agents import router as agents_router
from .models import router as models_router
from .model_marketplace import router as model_marketplace_router
from .config import router as config_router
from .dashboard import router as dashboard_router
from .agent_level import router as agent_level_router
from .package_admin import router as package_admin_router

router = APIRouter()

# 注册子路由
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(user_router, prefix="/user", tags=["user"])
router.include_router(account_router, prefix="/account", tags=["account"])
router.include_router(api_keys_router, prefix="/api-keys", tags=["api-keys"])
router.include_router(packages_router, prefix="/packages", tags=["packages"])
router.include_router(orders_router, prefix="/orders", tags=["orders"])
router.include_router(payments_router, prefix="/payments", tags=["payments"])
router.include_router(withdrawals_router, prefix="/withdrawals", tags=["withdrawals"])
router.include_router(invites_router, prefix="/invites", tags=["invites"])
router.include_router(agents_router, prefix="/agents", tags=["agents"])
router.include_router(token_usage_router, prefix="/token-usage", tags=["token-usage"])
router.include_router(models_router, prefix="/models", tags=["models"])
router.include_router(model_marketplace_router, tags=["model-marketplace"])
router.include_router(config_router, prefix="/config", tags=["config"])
router.include_router(dashboard_router, tags=["dashboard"])
router.include_router(agent_level_router, prefix="/admin", tags=["agent-levels"])
router.include_router(package_admin_router, prefix="/admin", tags=["packages"])
