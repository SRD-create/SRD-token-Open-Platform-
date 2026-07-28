import json
import logging
import time
import requests
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
import base64
from Crypto.PublicKey import RSA
from Crypto.Signature import pkcs1_15
from Crypto.Hash import SHA256
from Crypto.Cipher import PKCS1_OAEP
from shared.config.config import settings

logger = logging.getLogger(__name__)


class WXPayUtility:
    @staticmethod
    def to_json(obj: Any) -> str:
        """将对象转换为 JSON 字符串"""
        return json.dumps(obj, ensure_ascii=False)

    @staticmethod
    def from_json(json_str: str) -> Dict:
        """将 JSON 字符串解析为字典"""
        return json.loads(json_str)

    @staticmethod
    def read_key_string_from_path(key_path: str) -> str:
        """从公私钥文件路径中读取文件内容"""
        with open(key_path, 'r', encoding='utf-8') as f:
            return f.read()

    @staticmethod
    def load_private_key_from_string(key_string: str) -> RSA.RsaKey:
        """读取 PKCS#8 格式的私钥字符串并加载为私钥对象"""
        key_string = key_string.replace("-----BEGIN PRIVATE KEY-----", "") \
            .replace("-----END PRIVATE KEY-----", "") \
            .replace("\n", "")
        key_bytes = base64.b64decode(key_string)
        return RSA.import_key(key_bytes)

    @staticmethod
    def load_private_key_from_path(key_path: str) -> RSA.RsaKey:
        """从 PKCS#8 格式的私钥文件中加载私钥"""
        return WXPayUtility.load_private_key_from_string(
            WXPayUtility.read_key_string_from_path(key_path)
        )

    @staticmethod
    def load_public_key_from_string(key_string: str) -> RSA.RsaKey:
        """读取 PKCS#8 格式的公钥字符串并加载为公钥对象"""
        key_string = key_string.replace("-----BEGIN PUBLIC KEY-----", "") \
            .replace("-----END PUBLIC KEY-----", "") \
            .replace("\n", "")
        key_bytes = base64.b64decode(key_string)
        return RSA.import_key(key_bytes)

    @staticmethod
    def load_public_key_from_path(key_path: str) -> RSA.RsaKey:
        """从 PKCS#8 格式的公钥文件中加载公钥"""
        return WXPayUtility.load_public_key_from_string(
            WXPayUtility.read_key_string_from_path(key_path)
        )

    @staticmethod
    def create_nonce(length: int = 32) -> str:
        """创建指定长度的随机字符串，字符集为[0-9a-zA-Z]"""
        import string
        import random
        chars = string.ascii_letters + string.digits
        return ''.join(random.choice(chars) for _ in range(length))

    @staticmethod
    def encrypt(public_key: RSA.RsaKey, plaintext: str) -> str:
        """使用公钥按照 RSA_PKCS1_OAEP_PADDING 算法进行加密"""
        cipher = PKCS1_OAEP.new(public_key)
        encrypted = cipher.encrypt(plaintext.encode('utf-8'))
        return base64.b64encode(encrypted).decode('utf-8')

    @staticmethod
    def verify(message: str, signature: str, public_key: RSA.RsaKey) -> bool:
        """使用公钥按照 SHA256withRSA 算法验证签名"""
        h = SHA256.new(message.encode('utf-8'))
        try:
            pkcs1_15.new(public_key).verify(h, base64.b64decode(signature))
            return True
        except (ValueError, TypeError):
            return False

    @staticmethod
    def build_authorization(mchid, certificate_serial_no, private_key, method, uri, body):
        nonce = WXPayUtility.create_nonce(32)
        timestamp = int(time.time())

        # 构造签名串
        message = f"{method}\n{uri}\n{timestamp}\n{nonce}\n{body if body else ''}\n"

        # 生成签名
        signature = WXPayUtility.sign(message, private_key)

        auth = (
            f'WECHATPAY2-SHA256-RSA2048 mchid="{mchid}",nonce_str="{nonce}",' 
            f'signature="{signature}",timestamp="{timestamp}",serial_no="{certificate_serial_no}"'
        )
        return auth

    @staticmethod
    def sign(message, private_key):
        """添加签名"""
        h = SHA256.new(message.encode('utf-8'))
        signature = pkcs1_15.new(private_key).sign(h)
        b64_signature = base64.b64encode(signature).decode('utf-8')
        return b64_signature

    @staticmethod
    def url_encode(content: str) -> str:
        """对参数进行 URL 编码"""
        from urllib.parse import quote
        return quote(content, safe='')

    @staticmethod
    def url_encode_params(params: Dict[str, Any]) -> str:
        """对参数Map进行 URL 编码，生成 QueryString"""
        if not params:
            return ""

        return "&".join(
            f"{k}={WXPayUtility.url_encode(str(v))}"
            for k, v in params.items()
        )

    @staticmethod
    def validate_response(
            wechatpay_public_key_id: str,
            wechatpay_public_key: RSA.RsaKey,
            headers: Dict[str, str],
            body: str
    ) -> None:
        """验证微信支付APIv3应答签名"""
        from datetime import datetime, timedelta
        timestamp = headers.get("Wechatpay-Timestamp")
        try:
            response_time = datetime.fromtimestamp(int(timestamp))
            # 拒绝过期请求（5分钟）
            if abs(datetime.now() - response_time) > timedelta(minutes=5):
                raise ValueError(
                    f"Validate http response,timestamp[{timestamp}] of httpResponse is expires, "
                    f"request-id[{headers.get('Request-ID')}]"
                )
        except (ValueError, TypeError) as e:
            raise ValueError(
                f"Validate http response,timestamp[{timestamp}] of httpResponse is invalid, "
                f"request-id[{headers.get('Request-ID')}]"
            ) from e

        message = f"{timestamp}\n{headers.get('Wechatpay-Nonce')}\n{body if body else ''}\n"
        serial_number = headers.get("Wechatpay-Serial")
        if serial_number != wechatpay_public_key_id:
            raise ValueError(
                f"Invalid Wechatpay-Serial, Local: {wechatpay_public_key_id}, Remote: {serial_number}"
            )

        signature = headers.get("Wechatpay-Signature")
        if not signature:
            raise ValueError("Missing Wechatpay-Signature in headers")

        if not WXPayUtility.verify(message, signature, wechatpay_public_key):
            raise ValueError(
                f"Validate response failed,the WechatPay signature is incorrect.\n"
                f"Request-ID[{headers.get('Request-ID')}]\tresponseHeader[{headers}]\t"
                f"responseBody[{body[:1024] if body else ''}]"
            )


class ApiException(Exception):
    """微信支付API错误异常"""

    def __init__(self, status_code: int, body: str, headers: Dict[str, str]):
        self.status_code = status_code
        self.body = body
        self.headers = headers

        self.error_code = None
        self.error_message = None

        if body:
            try:
                data = json.loads(body)
                self.error_code = data.get("code")
                self.error_message = data.get("message")
            except json.JSONDecodeError:
                pass

        super().__init__(
            f"微信支付API访问失败，StatusCode: [{status_code}], Body: [{body}], Headers: [{headers}]"
        )

    def get_status_code(self) -> int:
        """获取 HTTP 应答状态码"""
        return self.status_code

    def get_body(self) -> str:
        """获取 HTTP 应答包体内容"""
        return self.body

    def get_headers(self) -> Dict[str, str]:
        """获取 HTTP 应答 Header"""
        return self.headers

    def get_error_code(self) -> Optional[str]:
        """获取 错误码 （错误应答中的 code 字段）"""
        return self.error_code

    def get_error_message(self) -> Optional[str]:
        """获取 错误消息 （错误应答中的 message 字段）"""
        return self.error_message


@dataclass
class TransferSceneReportInfo:
    """转账场景上报信息"""
    info_type: str
    info_content: str

    def to_dict(self) -> Dict:
        return {"info_type": self.info_type, "info_content": self.info_content}


@dataclass
class TransferBillsRequest:
    """转账请求参数"""
    appid: str
    out_bill_no: str
    transfer_scene_id: str
    openid: str
    user_name: Optional[str] = None
    transfer_amount: int = 0
    transfer_remark: str = ""
    notify_url: str = ""
    user_recv_perception: str = ""
    transfer_scene_report_infos: List[TransferSceneReportInfo] = field(default_factory=list)

    def to_json(self) -> str:
        data = {
            "appid": self.appid,
            "out_bill_no": self.out_bill_no,
            "transfer_scene_id": self.transfer_scene_id,
            "openid": self.openid,
            "transfer_amount": self.transfer_amount,
            "transfer_remark": self.transfer_remark,
            "notify_url": self.notify_url,
            "user_recv_perception": self.user_recv_perception,
            "transfer_scene_report_infos": [info.to_dict() for info in self.transfer_scene_report_infos]
        }
        if self.user_name is not None:
            data["user_name"] = self.user_name
        return json.dumps(data, separators=(',', ':'))


@dataclass
class TransferBillResponse:
    """转账响应结果"""
    out_bill_no: str
    transfer_bill_no: str
    create_time: str
    state: str
    fail_reason: Optional[str] = None
    package_info: Optional[str] = None
    mch_id: Optional[str] = None
    app_id: Optional[str] = None

    @classmethod
    def from_json(cls, json_str: str):
        data = json.loads(json_str)
        return cls(
            out_bill_no=data.get("out_bill_no"),
            transfer_bill_no=data.get("transfer_bill_no"),
            create_time=data.get("create_time"),
            state=data.get("state"),
            fail_reason=data.get("fail_reason"),
            package_info=data.get("package_info")
        )


class WeChatPayTransfer:
    """微信支付转账服务"""

    API_HOST = "https://api.mch.weixin.qq.com"
    TRANSFER_PATH = "/v3/fund-app/mch-transfer/transfer-bills"

    def __init__(self, mchid: str, private_key_path: str, cert_serial_no: str):
        """
        初始化转账服务
        :param mchid: 商户号
        :param private_key_path: 商户私钥路径
        :param cert_serial_no: 商户证书序列号
        """
        self.mchid = mchid
        self.cert_serial_no = cert_serial_no

        # 加载密钥
        self.private_key = WXPayUtility.load_private_key_from_path(private_key_path)

        self.http_client = requests.Session()
        logger.info("微信支付转账服务初始化完成")

    def transfer(self, request: TransferBillsRequest) -> TransferBillResponse:
        """
        发起商家转账
        :param request: 转账请求参数
        :return: 转账响应结果
        :raises: ApiException 当API返回错误时
        """
        url = self.API_HOST + self.TRANSFER_PATH
        body = request.to_json()

        # 构建签名头
        auth = self._build_authorization(body)

        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": auth
        }

        try:
            logger.info(f"发起微信转账请求: {request.out_bill_no}")
            response = self.http_client.post(url, headers=headers, data=body, timeout=30)
            response.raise_for_status()

            return TransferBillResponse.from_json(response.text)

        except requests.exceptions.RequestException as e:
            logger.error(f"微信转账请求失败: {str(e)}")
            if e.response is not None:
                raise ApiException(e.response.status_code, e.response.text, dict(e.response.headers))
            raise RuntimeError(f"请求失败: {str(e)}")

    def get_confirm_redirect_url(self, out_batch_no: str) -> str:
        """
        获取微信收款确认跳转链接（H5/网站/服务号专用）
        :param out_batch_no: 转账批次号
        :return: 收款确认跳转链接
        :raises: ApiException 当API返回错误时
        """
        CONFIRM_REDIRECT_PATH = "/v3/transfer/confirm-redirect"
        url = self.API_HOST + CONFIRM_REDIRECT_PATH
        
        # 请求体
        data = {
            "out_batch_no": out_batch_no,
            "path": "/pages/transfer/transfer-result"
        }
        body = json.dumps(data, separators=(',', ':'))

        # 构建签名头
        method = "POST"
        uri = CONFIRM_REDIRECT_PATH
        nonce = WXPayUtility.create_nonce(32)
        timestamp = str(int(time.time()))

        # 构造签名串
        message = f"{method}\n{uri}\n{timestamp}\n{nonce}\n{body}\n"

        # 使用商户私钥签名
        signature = WXPayUtility.sign(message, self.private_key)

        # 构建Authorization头
        auth = (
            f'WECHATPAY2-SHA256-RSA2048 '
            f'mchid="{self.mchid}",'
            f'nonce_str="{nonce}",'
            f'signature="{signature}",'
            f'timestamp="{timestamp}",'
            f'serial_no="{self.cert_serial_no}"'
        )

        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": auth
        }

        try:
            logger.info(f"获取收款确认链接: {out_batch_no}")
            response = self.http_client.post(url, headers=headers, json=data, timeout=30)
            response.raise_for_status()
            result = response.json()
            return result.get("confirm_redirect_url")

        except requests.exceptions.RequestException as e:
            logger.error(f"获取收款确认链接失败: {str(e)}")
            if e.response is not None:
                raise ApiException(e.response.status_code, e.response.text, dict(e.response.headers))
            raise RuntimeError(f"请求失败: {str(e)}")

    def _build_authorization(self, body: str) -> str:
        """构建Authorization头"""
        method = "POST"
        uri = self.TRANSFER_PATH
        nonce = WXPayUtility.create_nonce(32)
        timestamp = str(int(time.time()))

        # 构造签名串
        message = f"{method}\n{uri}\n{timestamp}\n{nonce}\n{body}\n"

        # 使用商户私钥签名
        signature = WXPayUtility.sign(message, self.private_key)

        # 构建Authorization头
        return (
            f'WECHATPAY2-SHA256-RSA2048 '
            f'mchid="{self.mchid}",'
            f'nonce_str="{nonce}",'
            f'signature="{signature}",'
            f'timestamp="{timestamp}",'
            f'serial_no="{self.cert_serial_no}"'
        )


# 初始化微信支付转账服务
wxpay_transfer_service = WeChatPayTransfer(
    mchid=settings.WECHAT_MCH_ID,
    private_key_path=settings.WECHAT_PRIVATE_KEY_PATH,
    cert_serial_no=settings.WECHAT_CERT_SERIAL
)
