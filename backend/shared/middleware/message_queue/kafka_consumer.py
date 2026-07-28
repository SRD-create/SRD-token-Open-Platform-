"""
Kafka 消费者模块

特性：
1. 支持消费者组模式 - 多实例自动分区分配，避免重复消费
2. 幂等性处理 - 使用 Redis 防止消息重复处理
3. 优雅关闭 - 支持信号处理，确保 offset 正确提交
4. 死信队列 - 处理失败的消息可发送到 DLQ
5. 健康检查 - 提供消费者健康状态监控

使用示例：
    from shared.utils.kafka_consumer import KafkaConsumerManager

    async def handle_message(message):
        # 处理消息的业务逻辑
        print(f"Processing: {message.value}")

    consumer = KafkaConsumerManager(
        topics=["my-topic"],
        message_handler=handle_message
    )
    await consumer.start()
"""

import json
import signal
import asyncio
from typing import Callable, List, Optional, Dict, Any, Union
from dataclasses import dataclass
from datetime import datetime
import loguru

from kafka import KafkaConsumer, TopicPartition
from kafka.errors import KafkaError, KafkaTimeoutError
from kafka.structs import OffsetAndMetadata

from shared.config.config import settings
from shared.utils.redis_utils import RedisClient


@dataclass
class KafkaMessage:
    """Kafka 消息封装类"""
    topic: str
    partition: int
    offset: int
    key: Optional[str]
    value: Any
    headers: Dict[str, str]
    timestamp: datetime

    @property
    def message_id(self) -> str:
        """生成消息唯一ID（用于幂等性检查）"""
        return f"{self.topic}:{self.partition}:{self.offset}"


class IdempotencyChecker:
    """
    幂等性检查器

    使用 Redis 记录已处理的消息 ID，防止重复处理。
    适用于消费者再平衡或 offset 提交失败时的重复消费场景。
    """

    def __init__(self, redis_db: int = 2, expire_hours: int = 24):
        self.redis_db = redis_db
        self.expire_seconds = expire_hours * 3600
        self.redis_client = RedisClient(db=self.redis_db)
        self._initialized = False

    async def initialize(self):
        """初始化 Redis 连接"""
        if not self._initialized:
            await self.redis_client.initialize()
            self._initialized = True
            loguru.logger.info(f"IdempotencyChecker initialized (Redis db={self.redis_db})")

    def _make_key(self, message_id: str) -> str:
        """生成 Redis key"""
        return f"kafka:processed:{message_id}"

    async def is_processed(self, message_id: str) -> bool:
        """检查消息是否已处理"""
        await self.initialize()
        key = self._make_key(message_id)
        exists = await self.redis_client.exists(key)
        return exists

    async def mark_processed(self, message_id: str):
        """标记消息已处理"""
        await self.initialize()
        key = self._make_key(message_id)
        await self.redis_client.set(key, "1", expire=self.expire_seconds)

    async def cleanup(self, pattern: str = "kafka:processed:*"):
        """清理已处理记录（慎用）"""
        await self.initialize()
        await self.redis_client.clear_pattern(pattern)
        loguru.logger.warning(f"Cleaned up idempotency records with pattern: {pattern}")


class KafkaConsumerManager:
    """
    Kafka 消费者管理器

    特性：
    - 消费者组模式：相同 group_id 的实例自动分配分区
    - 幂等性保证：可选开启 Redis 幂等性检查
    - 批量处理：支持批量拉取和批量处理
    - 死信队列：处理失败的消息可发送到指定 topic
    - 优雅关闭：捕获信号，确保 offset 正确提交

    多实例部署说明：
    1. 所有实例使用相同的 group_id（从配置读取）
    2. Kafka 自动进行分区分配，每个分区只被一个消费者处理
    3. 消费者数不应超过分区数，否则多余的消费者会空闲
    """

    def __init__(
            self,
            topics: Union[str, List[str]],
            message_handler: Callable[[KafkaMessage], Any],
            group_id: str = None,
            bootstrap_servers: str = None,
            enable_idempotency: bool = True,
            dlq_topic: Optional[str] = None,
            max_retries: int = 3,
            retry_delay: float = 1.0,
            idempotency_redis_db: int = 2,
            idempotency_expire_hours: int = 24,
            **kafka_configs
    ):
        """
        初始化 Kafka 消费者管理器

        Args:
            topics: 订阅的 topic 或 topic 列表
            message_handler: 消息处理函数，接收 KafkaMessage 对象
            group_id: 消费者组 ID
            bootstrap_servers: Kafka 服务器地址
            enable_idempotency: 是否启用幂等性检查
            dlq_topic: 死信队列 topic，处理失败的消息会发送到这里
            max_retries: 消息处理失败时的最大重试次数
            retry_delay: 重试间隔（秒）
            idempotency_redis_db: 幂等性检查使用的 Redis 数据库
            idempotency_expire_hours: 幂等性记录过期时间（小时）
            **kafka_configs: 其他 Kafka 配置参数
        """
        self.topics = [topics] if isinstance(topics, str) else topics
        self.message_handler = message_handler
        self.group_id = group_id
        self.bootstrap_servers = bootstrap_servers
        self.enable_idempotency = enable_idempotency
        self.dlq_topic = dlq_topic
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.idempotency_redis_db = idempotency_redis_db
        self.idempotency_expire_hours = idempotency_expire_hours
        self.kafka_configs = kafka_configs

        self.consumer: Optional[KafkaConsumer] = None
        self.idempotency_checker: Optional[IdempotencyChecker] = None
        self._running = False
        self._shutdown_event = asyncio.Event()
        self._stats = {
            "messages_processed": 0,
            "messages_failed": 0,
            "messages_duplicated": 0,
            "started_at": None
        }

        # 注册信号处理
        self._setup_signal_handlers()

    def _setup_signal_handlers(self):
        """设置信号处理器，支持优雅关闭"""
        try:
            for sig in (signal.SIGTERM, signal.SIGINT):
                signal.signal(sig, self._signal_handler)
        except ValueError:
            # 在非主线程中无法设置信号处理器
            loguru.logger.warning("Cannot set signal handlers (not in main thread)")

    def _signal_handler(self, signum, frame):
        """信号处理函数"""
        loguru.logger.info(f"Received signal {signum}, initiating graceful shutdown...")
        self._shutdown_event.set()

    def _create_consumer(self) -> KafkaConsumer:
        """创建 Kafka 消费者实例"""
        configs = {
            "bootstrap_servers": self.bootstrap_servers.split(",") if isinstance(self.bootstrap_servers,
                                                                                 str) else self.bootstrap_servers,
            "group_id": self.group_id,
            "value_deserializer": lambda m: json.loads(m.decode("utf-8")) if m else None,
            "key_deserializer": lambda m: m.decode("utf-8") if m else None,
        }

        # 合并用户自定义配置（从 kafka_configs 传入）
        configs.update(self.kafka_configs)

        consumer = KafkaConsumer(**configs)
        consumer.subscribe(self.topics)

        loguru.logger.info(
            f"Kafka consumer created: group_id={self.group_id}, "
            f"topics={self.topics}, servers={self.bootstrap_servers}"
        )

        return consumer

    def _parse_message(self, msg) -> KafkaMessage:
        """解析 Kafka 消息为 KafkaMessage 对象"""
        headers = {}
        if msg.headers:
            for key, value in msg.headers:
                headers[key] = value.decode("utf-8") if isinstance(value, bytes) else str(value)

        return KafkaMessage(
            topic=msg.topic,
            partition=msg.partition,
            offset=msg.offset,
            key=msg.key,
            value=msg.value,
            headers=headers,
            timestamp=datetime.fromtimestamp(msg.timestamp / 1000) if msg.timestamp else datetime.now()
        )

    async def _process_with_retry(self, message: KafkaMessage) -> bool:
        """
        带重试的消息处理

        Returns:
            处理成功返回 True，失败返回 False
        """
        for attempt in range(self.max_retries):
            try:
                # 调用用户定义的处理函数
                result = self.message_handler(message)
                # 检查是否是协程对象
                if asyncio.iscoroutine(result):
                    await result

                return True

            except Exception as e:
                loguru.logger.error(
                    f"Message processing failed (attempt {attempt + 1}/{self.max_retries}): "
                    f"topic={message.topic}, partition={message.partition}, offset={message.offset}, error={e}"
                )

                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (attempt + 1))
                else:
                    return False

        return False

    async def _send_to_dlq(self, message: KafkaMessage, error: str):
        """发送消息到死信队列"""
        if not self.dlq_topic:
            return

        try:
            from kafka import KafkaProducer

            producer = KafkaProducer(
                bootstrap_servers=self.bootstrap_servers.split(",") if isinstance(self.bootstrap_servers,
                                                                                  str) else self.bootstrap_servers,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                key_serializer=lambda v: v.encode("utf-8") if v else None
            )

            dlq_message = {
                "original_topic": message.topic,
                "original_partition": message.partition,
                "original_offset": message.offset,
                "original_key": message.key,
                "original_value": message.value,
                "original_headers": message.headers,
                "error": error,
                "failed_at": datetime.now().isoformat(),
                "consumer_group": self.group_id
            }

            producer.send(self.dlq_topic, key=message.key, value=dlq_message)
            producer.flush()
            producer.close()

            loguru.logger.info(f"Message sent to DLQ: {self.dlq_topic}, offset={message.offset}")

        except Exception as e:
            loguru.logger.error(f"Failed to send message to DLQ: {e}")

    async def start(self):
        """启动消费者"""
        if self._running:
            loguru.logger.warning("Consumer is already running")
            return

        self._running = True
        self._stats["started_at"] = datetime.now()

        # 初始化幂等性检查器
        if self.enable_idempotency:
            self.idempotency_checker = IdempotencyChecker(
                redis_db=self.idempotency_redis_db,
                expire_hours=self.idempotency_expire_hours
            )
            await self.idempotency_checker.initialize()

        # 创建消费者（在单独的线程中运行，因为 KafkaConsumer 是阻塞的）
        self.consumer = self._create_consumer()

        loguru.logger.info(f"Kafka consumer started, subscribing to: {self.topics}")

        # 在后台线程中运行消费者循环
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._consume_loop)

    def _consume_loop(self):
        """消费者主循环（在后台线程中运行）"""
        # 创建新的事件循环用于当前线程
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            while self._running and not self._shutdown_event.is_set():
                try:
                    # 拉取消息（带超时，以便检查关闭信号）
                    messages = self.consumer.poll(timeout_ms=1000)

                    if not messages:
                        continue

                    for topic_partition, records in messages.items():
                        for record in records:
                            if self._shutdown_event.is_set():
                                break

                            # 解析消息
                            message = self._parse_message(record)

                            # 异步处理消息（使用当前线程的事件循环）
                            loop.run_until_complete(self._handle_message(message))

                except KafkaError as e:
                    loguru.logger.error(f"Kafka error: {e}")

        except Exception as e:
            loguru.logger.error(f"Consumer loop error: {e}")

        finally:
            # 关闭事件循环
            try:
                loop.run_until_complete(loop.shutdown_asyncgens())
                loop.close()
            except:
                pass
            self._cleanup()

    async def _handle_message(self, message: KafkaMessage):
        """处理单条消息"""
        try:
            # 幂等性检查
            if self.enable_idempotency and self.idempotency_checker:
                if await self.idempotency_checker.is_processed(message.message_id):
                    loguru.logger.debug(f"Duplicate message skipped: {message.message_id}")
                    self._stats["messages_duplicated"] += 1
                    return

            # 处理消息
            success = await self._process_with_retry(message)

            if success:
                # 标记已处理（幂等性）
                if self.enable_idempotency and self.idempotency_checker:
                    await self.idempotency_checker.mark_processed(message.message_id)

                self._stats["messages_processed"] += 1
                loguru.logger.debug(f"Message processed: {message.message_id}")
            else:
                # 处理失败，发送到死信队列
                self._stats["messages_failed"] += 1
                await self._send_to_dlq(message, "Max retries exceeded")

        except Exception as e:
            loguru.logger.error(f"Unexpected error handling message: {e}")
            self._stats["messages_failed"] += 1

    def _cleanup(self):
        """清理资源"""
        try:
            if self.consumer:
                loguru.logger.info("Closing Kafka consumer...")
                self.consumer.close()
                self.consumer = None

            self._running = False

            # 打印统计信息
            duration = datetime.now() - self._stats["started_at"] if self._stats["started_at"] else None
            loguru.logger.info(
                f"Consumer stopped. Stats: processed={self._stats['messages_processed']}, "
                f"failed={self._stats['messages_failed']}, duplicated={self._stats['messages_duplicated']}, "
                f"duration={duration}"
            )

        except Exception as e:
            loguru.logger.error(f"Error during cleanup: {e}")

    async def stop(self):
        """停止消费者"""
        loguru.logger.info("Stopping Kafka consumer...")
        self._shutdown_event.set()
        self._running = False

    def get_stats(self) -> Dict[str, Any]:
        """获取消费者统计信息"""
        stats = self._stats.copy()
        if stats["started_at"]:
            stats["duration"] = (datetime.now() - stats["started_at"]).total_seconds()
        return stats

    def is_running(self) -> bool:
        """检查消费者是否正在运行"""
        return self._running


class BatchKafkaConsumerManager(KafkaConsumerManager):
    """
    批量处理版本的 Kafka 消费者

    适用于需要批量处理消息的场景，如批量写入数据库。
    """

    def __init__(
            self,
            topics: Union[str, List[str]],
            batch_handler: Callable[[List[KafkaMessage]], Any],
            batch_size: int = 100,
            batch_timeout: float = 5.0,
            **kwargs
    ):
        """
        初始化批量消费者

        Args:
            topics: 订阅的 topic
            batch_handler: 批量处理函数，接收 KafkaMessage 列表
            batch_size: 批量大小
            batch_timeout: 批量超时时间（秒）
            **kwargs: 其他 KafkaConsumerManager 参数
        """
        self.batch_handler = batch_handler
        self.batch_size = batch_size
        self.batch_timeout = batch_timeout
        self._batch_buffer: List[KafkaMessage] = []
        self._last_batch_time = datetime.now()

        # 使用内部 handler 包装 batch_handler
        super().__init__(topics, self._single_message_handler, **kwargs)

    async def _single_message_handler(self, message: KafkaMessage):
        """内部单条消息处理器，用于批量缓冲"""
        self._batch_buffer.append(message)

        # 检查是否满足批量条件
        should_flush = (
                len(self._batch_buffer) >= self.batch_size or
                (datetime.now() - self._last_batch_time).total_seconds() >= self.batch_timeout
        )

        if should_flush:
            await self._flush_batch()

    async def _flush_batch(self):
        """刷新批量缓冲区"""
        if not self._batch_buffer:
            return

        batch = self._batch_buffer.copy()
        self._batch_buffer.clear()
        self._last_batch_time = datetime.now()

        try:
            if asyncio.iscoroutinefunction(self.batch_handler):
                await self.batch_handler(batch)
            else:
                self.batch_handler(batch)

            loguru.logger.debug(f"Batch processed: {len(batch)} messages")

        except Exception as e:
            loguru.logger.error(f"Batch processing failed: {e}")
            # 批量失败时，尝试逐条处理
            for message in batch:
                await self._process_with_retry(message)

    async def stop(self):
        """停止消费者，刷新剩余消息"""
        await self._flush_batch()
        await super().stop()
