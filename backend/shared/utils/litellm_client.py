"""
LiteLLM API 客户端封装

用于与 LiteLLM 服务进行交互，管理 API Keys
"""

import httpx
from typing import Optional, Dict, Any, List
from pydantic import BaseModel

from shared.models.db import AsyncSessionLocal
from shared.models.models import SystemConfig
from sqlalchemy import select


class LiteLLMClient:
    """LiteLLM API 客户端"""
    
    def __init__(self):
        self.base_url = ""
        self.master_key = ""
        self.client = httpx.AsyncClient(timeout=30.0, verify=False)
    
    async def _get_config(self) -> tuple[str, str]:
        """从数据库获取 LiteLLM 配置"""
        async with AsyncSessionLocal() as db:
            # 获取 base_url
            result = await db.execute(
                select(SystemConfig)
                .where(SystemConfig.config_key == "litellm.base_url")
            )
            config = result.scalar_one_or_none()
            base_url = config.config_value if config else ""
            
            # 获取 master_key
            result = await db.execute(
                select(SystemConfig)
                .where(SystemConfig.config_key == "litellm.master_key")
            )
            config = result.scalar_one_or_none()
            master_key = config.config_value if config else ""
            
            return base_url, master_key
    
    async def _ensure_config(self):
        """确保配置已加载"""
        if not self.base_url or not self.master_key:
            self.base_url, self.master_key = await self._get_config()
    
    def _get_headers(self):
        """获取请求头"""
        return {
            "Authorization": f"Bearer {self.master_key}",
            "Content-Type": "application/json"
        }
    
    async def generate_key(
        self,
        models: List[str] = None,
        team_id: str = None,
        user_id: str = None,
        key: str = None,
        rpm_limit: Optional[int] = None,
        tpm_limit: Optional[int] = None,
        max_parallel_requests: Optional[int] = None,
        blocked: bool = False
    ) -> Dict[str, Any]:
        """
        生成 LiteLLM API Key
        
        Args:
            models: 允许的模型列表
            team_id: 团队 ID
            user_id: 用户 ID
            key: 自定义 API Key
            rpm_limit: 每分钟请求限制
            tpm_limit: 每分钟 Token 限制
            max_parallel_requests: 最大并行请求数
            blocked: 是否禁用
            
        Returns:
            Dict: LiteLLM 响应
        """
        await self._ensure_config()
        
        # 如果没有传限制参数，使用默认值
        if rpm_limit is None:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(SystemConfig)
                    .where(SystemConfig.config_key == "litellm.default_rpm_limit")
                )
                config = result.scalar_one_or_none()
                rpm_limit = int(config.config_value) if config else 60
        
        if tpm_limit is None:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(SystemConfig)
                    .where(SystemConfig.config_key == "litellm.default_tpm_limit")
                )
                config = result.scalar_one_or_none()
                tpm_limit = int(config.config_value) if config else 100000
        
        if max_parallel_requests is None:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(SystemConfig)
                    .where(SystemConfig.config_key == "litellm.default_max_parallel_requests")
                )
                config = result.scalar_one_or_none()
                max_parallel_requests = int(config.config_value) if config else 3
        
        url = f"{self.base_url}/key/generate"
        
        payload = {
            "models": models or [],
            "team_id": team_id,
            "user_id": user_id,
            "key": key,
            "rpm_limit": rpm_limit,
            "tpm_limit": tpm_limit,
            "max_parallel_requests": max_parallel_requests,
            "metadata": {"user_type": "toc"}
        }
        
        try:
            response = await self.client.post(
                url,
                headers=self._get_headers(),
                json=payload
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise Exception(f"LiteLLM API error: {e}")
    
    async def delete_key(self, key: str) -> bool:
        """
        删除 LiteLLM 中的 API Key
        
        Args:
            key: 要删除的 API Key
            
        Returns:
            bool: 是否删除成功
        """
        await self._ensure_config()
        
        url = f"{self.base_url}/key/delete"
        
        try:
            response = await self.client.post(
                url,
                headers=self._get_headers(),
                json={"key": key}
            )
            response.raise_for_status()
            return True
        except httpx.HTTPError:
            return False
    
    async def get_key_info(self, key: str) -> Optional[Dict[str, Any]]:
        """
        获取 API Key 信息
        
        Args:
            key: API Key
            
        Returns:
            Optional[Dict]: Key 信息
        """
        await self._ensure_config()
        
        url = f"{self.base_url}/key/info"
        
        try:
            response = await self.client.get(
                url,
                headers=self._get_headers(),
                params={"key": key}
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError:
            return None
    
    async def update_key(
        self,
        key: str,
        rpm_limit: int = None,
        tpm_limit: int = None,
        max_parallel_requests: int = None,
        blocked: bool = None
    ) -> bool:
        """
        更新 API Key 配置
        
        Args:
            key: API Key
            rpm_limit: 每分钟请求限制
            tpm_limit: 每分钟 Token 限制
            max_parallel_requests: 最大并行请求数
            blocked: 是否禁用
            
        Returns:
            bool: 是否更新成功
        """
        await self._ensure_config()
        
        url = f"{self.base_url}/key/update"
        
        payload = {"key": key}
        if rpm_limit is not None:
            payload["rpm_limit"] = rpm_limit
        if tpm_limit is not None:
            payload["tpm_limit"] = tpm_limit
        if max_parallel_requests is not None:
            payload["max_parallel_requests"] = max_parallel_requests
        if blocked is not None:
            payload["blocked"] = blocked
        
        try:
            response = await self.client.post(
                url,
                headers=self._get_headers(),
                json=payload
            )
            response.raise_for_status()
            return True
        except httpx.HTTPError:
            return False
    
    async def close(self):
        """关闭 HTTP 客户端"""
        await self.client.aclose()


# 全局客户端实例
_litellm_client: Optional[LiteLLMClient] = None


async def get_litellm_client() -> LiteLLMClient:
    """获取 LiteLLM 客户端实例"""
    global _litellm_client
    if _litellm_client is None:
        _litellm_client = LiteLLMClient()
    return _litellm_client