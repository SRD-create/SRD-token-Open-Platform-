from fastapi import APIRouter, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from shared.models.db import AsyncSessionLocal
from shared.models.models import ModelPrice, ModelService
from shared.schemas.response import ListResponse, DataResponse

router = APIRouter(prefix="/model-services", tags=["Model Marketplace - 模型广场"])


class ModelServiceResponse:
    """模型服务响应模型"""
    def __init__(self, model_service):
        self.id = model_service.id
        self.name = model_service.name
        self.provider = model_service.provider
        self.description = model_service.description
        self.max_context_length = model_service.max_context_length
        self.model_type = model_service.model_type
        self.parameters = model_service.parameters
        self.url = model_service.url
        self.auth_token = model_service.auth_token
        self.litellm_model_id = model_service.litellm_model_id
        self.status = model_service.status
        self.is_publish = model_service.is_publish
        self.last_check = model_service.last_check
        self.created_at = model_service.created_at
        self.updated_at = model_service.updated_at
    
    def model_dump(self):
        """转换为字典"""
        return {
            "id": self.id,
            "name": self.name,
            "provider": self.provider,
            "description": self.description,
            "max_context_length": self.max_context_length,
            "model_type": self.model_type,
            "parameters": self.parameters,
            "url": self.url,
            "auth_token": self.auth_token,
            "litellm_model_id": self.litellm_model_id,
            "status": self.status,
            "is_publish": self.is_publish,
            "last_check": self.last_check,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }


class ModelType:
    """模型类型枚举"""
    CHAT = "chat"
    TEXT_GENERATION = "text-generation"
    CODE_GENERATION = "code-generation"
    EMBEDDING = "embedding"
    MULTIMODAL = "multimodal"
    
    @classmethod
    def get_type_list(cls):
        """获取所有类型列表（包含中文标签）"""
        return [
            {"value": "chat", "label": "对话模型"},
            {"value": "text-generation", "label": "文本生成"},
            {"value": "code-generation", "label": "代码生成"},
            {"value": "embedding", "label": "文本嵌入"},
            {"value": "multimodal", "label": "多模态"},
            {"value": "vision", "label": "视觉输入"},
            {"value": "tool-call", "label": "工具调用"},
            {"value": "prefix-continuation", "label": "前缀续写"}
        ]


class ModelProvider:
    """模型服务提供商枚举"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    WENXIN = "wenxin"
    TONGYI = "tongyi"
    HUNYUAN = "hunyuan"
    MINIMAX = "minimax"
    ZHIPU = "zhipu"
    MOONSHOT = "moonshot"
    DOUBAO = "doubao"
    BEDROCK = "bedrock"
    MCP = "mcp"
    GRPC = "grpc"
    REST = "rest"
    
    @classmethod
    def get_provider_list(cls):
        """获取所有提供商列表（包含中文标签）"""
        return [
            {"value": "openai", "label": "OpenAI 兼容协议（90% 模型）"},
            {"value": "anthropic", "label": "Claude 原生"},
            {"value": "gemini", "label": "Google Gemini"},
            {"value": "wenxin", "label": "文心千帆"},
            {"value": "tongyi", "label": "通义千问"},
            {"value": "hunyuan", "label": "腾讯混元"},
            {"value": "minimax", "label": "MiniMax"},
            {"value": "zhipu", "label": "智谱"},
            {"value": "moonshot", "label": "月之暗面"},
            {"value": "doubao", "label": "豆包"},
            {"value": "bedrock", "label": "AWS"},
            {"value": "mcp", "label": "新行业标准协议"},
            {"value": "grpc", "label": "gRPC"},
            {"value": "rest", "label": "通用 REST"}
        ]


@router.get("", response_model=ListResponse)
async def get_model_services(
    pageNum: int = Query(1, ge=1, description="页码"),
    pageSize: int = Query(10, ge=1, description="每页数量"),
    model_type: Optional[str] = Query(None, description="模型类型筛选"),
    provider: Optional[str] = Query(None, description="服务提供商筛选"),
    keyword: Optional[str] = Query(None, description="搜索关键词（名称/描述）")
):
    """获取模型服务列表（无需鉴权）"""
    async with AsyncSessionLocal() as db:
        query = select(ModelService).where(ModelService.is_publish == True)

        # 按模型类型筛选
        if model_type:
            # 处理多个模型类型，以逗号分隔
            model_types = [mt.strip() for mt in model_type.split(",")]
            # 构建OR条件，使用LIKE查询来匹配以逗号分隔的model_type字段
            from sqlalchemy import or_
            or_conditions = []
            for mt in model_types:
                # 匹配开头、中间或结尾的模型类型
                or_conditions.append(ModelService.model_type.like(f"{mt}%"))
                or_conditions.append(ModelService.model_type.like(f"%{mt}%"))
                or_conditions.append(ModelService.model_type.like(f"%{mt}"))
            query = query.where(or_(*or_conditions))

        # 按服务提供商筛选
        if provider:
            query = query.where(ModelService.provider == provider)

        # 按关键词搜索
        if keyword:
            query = query.where(
                (ModelService.name.contains(keyword)) |
                (ModelService.description.contains(keyword))
            )

        # 按排序值正序排列
        query = query.order_by(ModelService.sort_order.asc())

        # 获取总数
        total_result = await db.execute(select(func.count()).select_from(query.subquery()))
        total = total_result.scalar()
        
        # 分页查询
        offset = (pageNum - 1) * pageSize
        query = query.offset(offset).limit(pageSize)
        result = await db.execute(query)
        model_services = result.scalars().all()

        # 获取所有模型价格信息（使用 name 字段作为 model_name）
        model_names = [ms.name for ms in model_services]
        price_result = await db.execute(
            select(ModelPrice).where(ModelPrice.model_name.in_(model_names))
        )
        prices = price_result.scalars().all()
        
        # 按模型名称分组，存储不同上下文范围的价格
        price_map = {}
        for price in prices:
            if price.model_name not in price_map:
                price_map[price.model_name] = []
            price_map[price.model_name].append(price)

        # 转换为响应模型并添加价格信息
        model_service_responses = []
        for model_service in model_services:
            model_dict = ModelServiceResponse(model_service).model_dump()
            
            # 移除敏感字段
            sensitive_fields = ['id', 'litellm_model_id', 'url', 'auth_token']
            for field in sensitive_fields:
                model_dict.pop(field, None)
            
            # 添加价格信息
            model_prices = price_map.get(model_service.name, [])
            if model_prices:
                # 按上下文范围排序
                model_prices.sort(key=lambda x: x.context_min)
                
                # 构建价格列表（返回单个token价格）
                price_list = []
                for price in model_prices:
                    price_list.append({
                        "context_range_min": price.context_min,
                        "context_range_max": price.context_max,
                        "input_token_price": "{:.10f}".format(float(price.input_token_price)),  # 单个token价格
                        "output_token_price": "{:.10f}".format(float(price.output_token_price)),  # 单个token价格
                        "cache_storage_price": "{:.10f}".format(price.cache_storage_price),  # 单个token价格/小时
                        "cache_hit_price": "{:.10f}".format(price.cache_hit_price)  # 单个token价格
                    })
                
                model_dict["prices"] = price_list
                # 默认使用第一个价格（最小上下文范围）
                default_price = model_prices[0]
                model_dict["input_token_price"] = "{:.10f}".format(float(default_price.input_token_price))  # 单个token价格
                model_dict["output_token_price"] = "{:.10f}".format(float(default_price.output_token_price))  # 单个token价格
                model_dict["input_token_price_unit"] = "each"
                model_dict["output_token_price_unit"] = "each"
            else:
                model_dict["prices"] = []
                model_dict["input_token_price"] = None
                model_dict["output_token_price"] = None
                model_dict["input_token_price_unit"] = None
                model_dict["output_token_price_unit"] = None
            model_service_responses.append(model_dict)

        # 计算总页数
        pages = (total + pageSize - 1) // pageSize if pageSize > 0 else 0

        return ListResponse(
            code=200,
            message="获取模型服务列表成功",
            data={
                "total": total,
                "pages": pages,
                "current": pageNum,
                "size": pageSize,
                "records": model_service_responses
            },
            total=total
        )


@router.get("/types/list", response_model=DataResponse)
async def get_model_types():
    """获取模型类型列表（无需鉴权）"""
    return DataResponse(
        code=200,
        message="获取模型类型列表成功",
        data=ModelType.get_type_list()
    )


@router.get("/providers/list", response_model=DataResponse)
async def get_model_providers():
    """获取模型服务提供商列表（无需鉴权）"""
    return DataResponse(
        code=200,
        message="获取模型服务提供商列表成功",
        data=ModelProvider.get_provider_list()
    )