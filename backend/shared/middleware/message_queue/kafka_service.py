"""
Kafka 消费者服务模块

集成到 FastAPI 应用生命周期中，在应用启动时自动启动消费者。
处理 LLM Gateway 返回的消息，转换为 token_usage 格式入库。
"""

import asyncio
import loguru
import threading
from typing import Optional
from datetime import datetime

from sqlalchemy import select
import httpx

from shared.middleware.message_queue.kafka_consumer import KafkaConsumerManager, KafkaMessage
from shared.utils.config_utils import get_kafka_config
from shared.models.db import AsyncSessionLocal
from shared.models.models import TokenUsage, ApiKey, Conversation, ModelPrice, Package, UserAccount, BalanceTransaction, UserPackage
from sqlalchemy.ext.asyncio import AsyncSession
from decimal import Decimal
import json
from shared.utils.config_utils import get_system_config
from shared.utils.redis_utils import cache_user_info, get_user_current_package


class KafkaService:
    """Kafka 消费者服务"""

    _instance: Optional['KafkaService'] = None
    _consumer: Optional[KafkaConsumerManager] = None
    _loop: Optional[asyncio.AbstractEventLoop] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def start(self):
        """启动 Kafka 消费者服务"""
        if self._consumer and self._consumer.is_running():
            loguru.logger.warning("Kafka consumer is already running")
            return

        try:
            # 保存主事件循环
            self._loop = asyncio.get_running_loop()

            # 从数据库获取 Kafka 配置
            kafka_config = await get_kafka_config()

            # 创建消费者
            self._consumer = KafkaConsumerManager(
                topics=[kafka_config["KAFKA_TOPIC"]],
                message_handler=self._handle_message_sync,
                group_id=kafka_config["KAFKA_CONSUMER_GROUP_ID"],
                bootstrap_servers=kafka_config["KAFKA_BOOTSTRAP_SERVERS"],
                enable_idempotency=False,  # 暂时禁用幂等性检查
                dlq_topic=f"{kafka_config['KAFKA_TOPIC']}_dlq",
                max_retries=3,
                retry_delay=1.0,
                auto_offset_reset=kafka_config["KAFKA_AUTO_OFFSET_RESET"],
                enable_auto_commit=kafka_config["KAFKA_ENABLE_AUTO_COMMIT"],
                max_poll_records=kafka_config["KAFKA_MAX_POLL_RECORDS"],
                session_timeout_ms=kafka_config["KAFKA_SESSION_TIMEOUT_MS"],
                heartbeat_interval_ms=kafka_config["KAFKA_HEARTBEAT_INTERVAL_MS"]
            )

            # 启动消费者（在后台运行）
            asyncio.create_task(self._consumer.start())
            loguru.logger.info(f"Kafka consumer service started, topic: {kafka_config['KAFKA_TOPIC']}")
            loguru.logger.info(f"Kafka consumer service started, server: {kafka_config['KAFKA_BOOTSTRAP_SERVERS']}")

        except Exception as e:
            loguru.logger.error(f"Failed to start Kafka consumer: {e}")

    async def stop(self):
        """停止 Kafka 消费者服务"""
        if self._consumer:
            await self._consumer.stop()
            self._consumer = None
            loguru.logger.info("Kafka consumer service stopped")

    def _handle_message_sync(self, message: KafkaMessage):
        """
        同步消息处理入口

        将消息传递给主事件循环中的异步处理函数
        """
        if self._loop and self._loop.is_running():
            # 使用 call_soon_threadsafe 将任务提交到主事件循环
            asyncio.run_coroutine_threadsafe(
                self._handle_message_async(message),
                self._loop
            )
        else:
            loguru.logger.error("Main event loop is not available")
            raise RuntimeError("Main event loop is not available")

    async def _handle_message_async(self, message: KafkaMessage):
        """
        异步处理 Kafka 消息

        在主事件循环中执行，确保数据库操作正确
        """
        try:
            loguru.logger.info(f"Processing Kafka message: topic={message.topic}, offset={message.offset}")

            data = message.value

            # 解析消息并保存到数据库
            success = await self._process_message_data(data)

            if success:
                loguru.logger.info(f"Successfully processed message: {message.message_id}")
            else:
                loguru.logger.warning(f"Failed to process message: {message.message_id}")

        except Exception as e:
            loguru.logger.error(f"Error processing message: {e}")
            raise

    async def _process_message_data(self, data: dict) -> bool:
        """
        处理消息数据，包括保存 token usage 和对话记录

        Args:
            data: LLM Gateway 返回的消息数据

        Returns:
            bool: 操作是否成功
        """
        try:
            await self._save_message_data(data)
            return True
        except Exception as e:
            loguru.logger.error(f"Error processing message data: {e}")
            return False



    async def _save_message_data(self, data: dict):
        """
        保存消息数据，包括 token usage、对话记录和余额扣除

        Args:
            data: LLM Gateway 返回的消息数据
        """
        async with AsyncSessionLocal() as db:
            try:
                # 1. 解析消息数据
                request_id, api_key_value, usage, model_name, status, response_time_ms, timestamp = await self._parse_message_data(data)

                if not request_id:
                    loguru.logger.warning("No request_id in message, skipping")
                    return

                # 2. 提取 token 数据
                prompt_tokens, completion_tokens, cache_hit_tokens, total_tokens = await self._extract_token_data(usage)

                # 3. 查询用户信息
                user_id = await self._get_user_id_by_api_key(db, api_key_value)

                # 4. 解析请求时间
                request_time = self._parse_request_time(timestamp)

                # 5. 查询模型价格
                input_token_price, output_token_price, cache_storage_price, cache_hit_price = await self._get_model_price(db, model_name, prompt_tokens)

                # 6. 计算成本
                cost = self._calculate_cost(prompt_tokens, completion_tokens, cache_hit_tokens, input_token_price, output_token_price, cache_hit_price)

                # 7. 保存或更新 token usage 记录
                token_usage = await self._save_or_update_token_usage(
                    db, request_id, user_id, api_key_value, model_name, prompt_tokens, 
                    completion_tokens, cache_hit_tokens, total_tokens, input_token_price, 
                    output_token_price, cache_storage_price, cache_hit_price, cost, 
                    request_time, response_time_ms, status
                )

                # 8. 保存或更新对话记录
                await self._save_or_update_conversation(db, request_id, data)

                # 9. 处理余额扣除（如果是计量计费套餐）
                await self._process_balance_deduction(
                    db, api_key_value, user_id, model_name, cost
                )

                # 11. 提交事务
                await db.commit()

                # 10. 更新用户缓存
                if user_id:
                    await self._update_user_cache(db, user_id)

            except Exception as e:
                # 发生错误，回滚事务
                await db.rollback()
                loguru.logger.error(f"Failed to save message data: {e}")
                raise

    async def _parse_message_data(self, data: dict):
        """
        解析消息数据

        Args:
            data: LLM Gateway 返回的消息数据

        Returns:
            tuple: 解析后的数据
        """
        request_id = data.get("request_id", "")
        api_key_value = data.get("api-key", "")
        usage = data.get("usage", {})
        model_name = data.get("model", "")
        status = data.get("status", "success")
        response_time_ms = data.get("response_time_ms", 0)
        timestamp = data.get("timestamp", "")

        return request_id, api_key_value, usage, model_name, status, response_time_ms, timestamp

    async def _extract_token_data(self, usage: dict):
        """
        提取 token 数据

        Args:
            usage: usage 数据

        Returns:
            tuple: token 数据
        """
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        # 从 prompt_tokens_details 中获取缓存命中 tokens
        prompt_tokens_details = usage.get("prompt_tokens_details", {})
        cache_hit_tokens = prompt_tokens_details.get("cached_tokens", 0)
        total_tokens = usage.get("total_tokens", 0)

        return prompt_tokens, completion_tokens, cache_hit_tokens, total_tokens

    async def _get_user_id_by_api_key(self, db: AsyncSession, api_key_value: str):
        """
        根据 API key 查询用户 ID

        Args:
            db: 数据库会话
            api_key_value: API key 值

        Returns:
            int: 用户 ID
        """
        user_id = None
        if api_key_value:
            result = await db.execute(
                select(ApiKey).where(ApiKey.api_key == api_key_value)
            )
            api_key_obj = result.scalar_one_or_none()
            if api_key_obj:
                user_id = api_key_obj.user_id

        return user_id

    def _parse_request_time(self, timestamp: str):
        """
        解析请求时间

        Args:
            timestamp: 时间戳

        Returns:
            datetime: 请求时间
        """
        request_time = datetime.now()
        if timestamp:
            try:
                request_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            except:
                pass

        return request_time

    async def _get_model_price(self, db: AsyncSession, model_name: str, context_length: int):
        """
        查询模型价格

        Args:
            db: 数据库会话
            model_name: 模型名称
            context_length: 上下文长度

        Returns:
            tuple: 模型价格
        """
        input_token_price = None
        output_token_price = None
        cache_storage_price = None
        cache_hit_price = None

        if model_name:
            # 查询适合该上下文长度的价格
            result = await db.execute(
                select(ModelPrice).where(
                    ModelPrice.model_name == model_name,
                    ModelPrice.context_min <= context_length,
                    ModelPrice.context_max >= context_length
                )
            )
            model_price = result.scalar_one_or_none()

            # 如果没有找到匹配的价格，使用默认价格（上下文最小的）
            if not model_price:
                result = await db.execute(
                    select(ModelPrice).where(ModelPrice.model_name == model_name)
                    .order_by(ModelPrice.context_min)
                    .limit(1)
                )
                model_price = result.scalar_one_or_none()

            if model_price:
                input_token_price = model_price.input_token_price
                output_token_price = model_price.output_token_price
                cache_storage_price = model_price.cache_storage_price
                cache_hit_price = model_price.cache_hit_price

        return input_token_price, output_token_price, cache_storage_price, cache_hit_price

    def _calculate_cost(self, prompt_tokens: int, completion_tokens: int, cache_hit_tokens: int, 
                      input_token_price: Decimal, output_token_price: Decimal, cache_hit_price: Decimal):
        """
        计算成本

        Args:
            prompt_tokens: 提示 token 数量
            completion_tokens: 完成 token 数量
            cache_hit_tokens: 缓存命中 token 数量
            input_token_price: 输入 token 价格
            output_token_price: 输出 token 价格
            cache_hit_price: 缓存命中 token 价格

        Returns:
            float: 成本
        """
        cost = 0.0
        if input_token_price and output_token_price:
            cost = (prompt_tokens * float(input_token_price)) + (completion_tokens * float(output_token_price))
            if cache_hit_price:
                cost += (cache_hit_tokens * float(cache_hit_price))

        return cost

    async def _save_or_update_token_usage(self, db: AsyncSession, request_id: str, user_id: int, 
                                        api_key_value: str, model_name: str, prompt_tokens: int, 
                                        completion_tokens: int, cache_hit_tokens: int, total_tokens: int, 
                                        input_token_price: Decimal, output_token_price: Decimal, 
                                        cache_storage_price: Decimal, cache_hit_price: Decimal, cost: float, 
                                        request_time: datetime, response_time_ms: float, status: str):
        """
        保存或更新 token usage 记录

        Args:
            db: 数据库会话
            request_id: 请求 ID
            user_id: 用户 ID
            api_key_value: API key 值
            model_name: 模型名称
            prompt_tokens: 提示 token 数量
            completion_tokens: 完成 token 数量
            cache_hit_tokens: 缓存命中 token 数量
            total_tokens: 总 token 数量
            input_token_price: 输入 token 价格
            output_token_price: 输出 token 价格
            cache_storage_price: 缓存存储价格
            cache_hit_price: 缓存命中价格
            cost: 成本
            request_time: 请求时间
            response_time_ms: 响应时间（毫秒）
            status: 状态

        Returns:
            TokenUsage: token usage 对象
        """
        # 检查是否已存在相同 request_id 的记录
        existing_result = await db.execute(
            select(TokenUsage).where(TokenUsage.request_id == request_id)
        )
        existing_token_usage = existing_result.scalar_one_or_none()

        if existing_token_usage:
            # 更新现有记录
            existing_token_usage.enterprise_id = user_id
            existing_token_usage.user_id = user_id
            existing_token_usage.api_key = api_key_value
            existing_token_usage.model_name = model_name
            existing_token_usage.prompt_tokens = prompt_tokens
            existing_token_usage.completion_tokens = completion_tokens
            existing_token_usage.cache_hit_tokens = cache_hit_tokens
            existing_token_usage.total_tokens = total_tokens
            existing_token_usage.input_token_price = input_token_price
            existing_token_usage.output_token_price = output_token_price
            existing_token_usage.cache_storage_price = cache_storage_price
            existing_token_usage.cache_hit_price = cache_hit_price
            existing_token_usage.cost = cost
            existing_token_usage.request_time = request_time
            existing_token_usage.response_time = response_time_ms / 1000.0  # 转换为秒
            existing_token_usage.status = status
            existing_token_usage.error_message = None

            loguru.logger.info(
                f"Token usage updated: request_id={existing_token_usage.request_id}, "
                f"model={existing_token_usage.model_name}, "
                f"total_tokens={existing_token_usage.total_tokens}, "
                f"cache_hit_tokens={existing_token_usage.cache_hit_tokens}, "
                f"cost={existing_token_usage.cost:.6f}, "
            )
            return existing_token_usage
        else:
            # 创建新记录
            token_usage = TokenUsage(
                request_id=request_id,
                enterprise_id=user_id,
                user_id=user_id,
                api_key=api_key_value,
                model_name=model_name,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cache_hit_tokens=cache_hit_tokens,
                total_tokens=total_tokens,
                input_token_price=input_token_price,
                output_token_price=output_token_price,
                cache_storage_price=cache_storage_price,
                cache_hit_price=cache_hit_price,
                cost=cost,
                request_time=request_time,
                response_time=response_time_ms / 1000.0,  # 转换为秒
                status=status,
                error_message=None
            )

            db.add(token_usage)

            loguru.logger.info(
                f"Token usage saved: request_id={token_usage.request_id}, "
                f"model={token_usage.model_name}, "
                f"total_tokens={token_usage.total_tokens}, "
                f"cache_hit_tokens={token_usage.cache_hit_tokens}, "
                f"cost={token_usage.cost:.6f}, "
            )
            return token_usage

    async def _save_or_update_conversation(self, db: AsyncSession, request_id: str, data: dict):
        """
        保存或更新对话记录

        Args:
            db: 数据库会话
            request_id: 请求 ID
            data: 消息数据
        """
        # 检查是否已存在相同 request_id 的记录
        existing_result = await db.execute(
            select(Conversation).where(Conversation.request_id == request_id)
        )
        existing_conversation = existing_result.scalar_one_or_none()

        if existing_conversation:
            # 更新现有记录
            existing_conversation.content = json.dumps(data, ensure_ascii=False)
            loguru.logger.info(
                f"Conversation updated: request_id={existing_conversation.request_id}"
            )
        else:
            # 创建新记录
            conversation = Conversation(
                request_id=request_id,
                content=json.dumps(data, ensure_ascii=False)
            )
            db.add(conversation)
            loguru.logger.info(
                f"Conversation saved: request_id={conversation.request_id}"
            )

    async def _update_user_cache(self, db: AsyncSession, user_id: int):
        """
        更新用户缓存

        Args:
            db: 数据库会话
            user_id: 用户 ID
        """
        if not user_id:
            return
        
        try:
            # 获取用户账户信息
            user_account_result = await db.execute(
                select(UserAccount).where(UserAccount.user_id == user_id)
            )
            user_account = user_account_result.scalar_one_or_none()
            
            if user_account:
                # 获取用户套餐信息
                user_packages_result = await db.execute(
                    select(UserPackage, Package)
                    .join(Package, UserPackage.package_id == Package.id)
                    .where(UserPackage.user_id == user_id)
                )
                user_packages = user_packages_result.all()
                package_info = await get_user_current_package(user_packages, db=db)
                
                # 缓存用户信息
                balance = float(user_account.balance)
                commission = float(user_account.commission) if hasattr(user_account, 'commission') else 0.0
                await cache_user_info(user_id, balance, commission, package_info)
                loguru.logger.info(f"Updated user cache: user_id={user_id}")
        except Exception as e:
            loguru.logger.warning(f"Failed to update user cache: {e}")

    async def _process_balance_deduction(self, db: AsyncSession, api_key_value: str, 
                                       user_id: int, model_name: str, cost: float):
        """
        处理余额扣除（如果是计量计费套餐）

        Args:
            db: 数据库会话
            api_key_value: API key 值
            user_id: 用户 ID
            model_name: 模型名称
            cost: 成本
        """
        if not api_key_value or not user_id:
            loguru.logger.debug(f"Skipping balance deduction: missing api_key or user_id")
            return

        # 查询 API key 对应的套餐
        result = await db.execute(
            select(ApiKey).where(ApiKey.api_key == api_key_value)
        )
        api_key = result.scalar_one_or_none()
        
        if not api_key or not api_key.package_id:
            loguru.logger.debug(f"Skipping balance deduction: api_key not found or no package_id")
            return

        # 查询套餐信息
        result = await db.execute(
            select(Package).where(Package.id == api_key.package_id)
        )
        package = result.scalar_one_or_none()
        
        if not package or package.package_type != "common":
            loguru.logger.debug(f"Skipping balance deduction: package not found or not common type")
            return

        # 查询用户账户
        result = await db.execute(
            select(UserAccount).where(UserAccount.user_id == user_id)
        )
        user_account = result.scalar_one_or_none()
        
        if not user_account:
            loguru.logger.debug(f"Skipping balance deduction: user account not found")
            return

        # 计算扣除金额
        deduction_amount = Decimal(str(cost))  # 转换为 Decimal 类型
        # 确保余额不小于 0
        new_balance = max(user_account.balance - deduction_amount, Decimal('0'))
        
        # 检查是否需要扣费
        if deduction_amount > Decimal('0'):
            # 创建交易记录
            transaction = BalanceTransaction(
                user_id=user_id,
                account_type="balance",
                type="usage",
                amount=-deduction_amount,  # 负值表示扣款
                balance_before=user_account.balance,
                balance_after=new_balance,
                related_id=None,  # request_id 是字符串，不能作为整数类型的 related_id
                description=f"Token usage deduction for model {model_name}"
            )
            db.add(transaction)

        # 更新余额
        user_account.balance = new_balance
        loguru.logger.info(
            f"Deducted balance for user {user_id}: {deduction_amount:.6f}, new balance: {new_balance:.6f}"
        )

    def is_running(self) -> bool:
        """检查消费者是否正在运行"""
        return self._consumer is not None and self._consumer.is_running()

    def get_stats(self):
        """获取消费者统计信息"""
        if self._consumer:
            return self._consumer.get_stats()
        return {}


# 全局 Kafka 服务实例
kafka_service = KafkaService()


async def start_kafka_service():
    """启动 Kafka 服务（用于应用启动时调用）"""
    await kafka_service.start()


async def stop_kafka_service():
    """停止 Kafka 服务（用于应用关闭时调用）"""
    await kafka_service.stop()