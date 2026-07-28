import time
import json
import base64
import requests
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from shared.config.config import settings
from shared.utils.utils import setup_logger


# 日志配置
logger = setup_logger()

class WechatNativePay:
    def __init__(self):
        self.appid = settings.WECHAT_APPID
        self.mchid = settings.WECHAT_MCH_ID
        self.api_v3_key = settings.WECHAT_API_V3_KEY
        self.cert_serial = settings.WECHAT_CERT_SERIAL
        self.private_key_path = settings.WECHAT_PRIVATE_KEY_PATH
        self.notify_url = settings.WECHAT_NOTIFY_URL

        with open(self.private_key_path, 'rb') as f:
            self.private_key = load_pem_private_key(f.read(), password=None)

    def sign(self, data):
        sign = self.private_key.sign(
            data.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        return base64.b64encode(sign).decode("utf-8")

    def auth_header(self, method, url, body=""):
        ts = str(int(time.time()))
        nonce = ts
        sign_str = f"{method}\n{url}\n{ts}\n{nonce}\n{body}\n"
        sign = self.sign(sign_str)
        return (
            f'WECHATPAY2-SHA256-RSA2048 '
            f'mchid="{self.mchid}",'
            f'serial_no="{self.cert_serial}",'
            f'timestamp="{ts}",'
            f'nonce_str="{nonce}",'
            f'signature="{sign}"'
        )

    def create_native(self, out_trade_no, total_fee, desc):
        url = "/v3/pay/transactions/native"
        body = json.dumps({
            "appid": self.appid,
            "mchid": self.mchid,
            "description": desc,
            "out_trade_no": out_trade_no,
            "notify_url": self.notify_url,
            "amount": {"total": total_fee, "currency": "CNY"}
        }, ensure_ascii=False)

        headers = {
            "Authorization": self.auth_header("POST", url, body),
            "Content-Type": "application/json"
        }
        
        logger.info("创建微信支付订单: out_trade_no={}, total_fee={}, desc={}", out_trade_no, total_fee, desc)
        
        resp = requests.post(
            "https://api.mch.weixin.qq.com" + url,
            data=body.encode("utf-8"),
            headers=headers
        )
        
        result = resp.json()
        logger.info("微信支付订单创建结果: {}", result)
        
        return result

    def decrypt_callback(self, resource):
        """解密微信支付回调数据

        Args:
            resource: 回调数据中的resource字段

        Returns:
            dict: 解密后的回调数据
        """
        try:
            # 获取解密所需参数
            nonce = resource.get('nonce')
            associated_data = resource.get('associated_data')
            ciphertext = resource.get('ciphertext')
            
            logger.info(f"解密参数: nonce={nonce}, associated_data={associated_data}, ciphertext length={len(ciphertext) if ciphertext else 0}")

            if not all([nonce, ciphertext]):
                logger.error("解密参数不完整: nonce={}, ciphertext={}", nonce, ciphertext)
                return None

            # 解码
            ciphertext = base64.b64decode(ciphertext)
            logger.info(f"解码后 ciphertext length={len(ciphertext)}")

            nonce = nonce.encode('utf-8')
            associated_data = associated_data.encode('utf-8') if associated_data else b''
            api_key = self.api_v3_key.encode('utf-8')

            logger.info(f"API key length={len(api_key)}")

            # 提取iv、密文和认证标签
            if len(ciphertext) < 32:
                logger.error("密文长度不足，至少需要32字节")
                return None

            iv = nonce  # 注意：微信支付V3的iv是nonce
            encrypted_data = ciphertext[:-16]  # 密文部分
            tag = ciphertext[-16:]  # 认证标签

            logger.info(f"iv length={len(iv)}, encrypted_data length={len(encrypted_data)}, tag length={len(tag)}")

            # 解密
            decryptor = Cipher(
                algorithms.AES(api_key),
                modes.GCM(iv),  # 注意：这里只传入iv，tag在finalize时验证
                backend=default_backend()
            ).decryptor()

            if associated_data:
                decryptor.authenticate_additional_data(associated_data)

            decrypted_data = decryptor.update(encrypted_data) + decryptor.finalize_with_tag(tag)

            # 解析为JSON
            result = json.loads(decrypted_data.decode('utf-8'))
            logger.info("解密成功: {}", result)
            return result

        except Exception as e:
            logger.error("解密失败: {}", e)
            import traceback
            logger.error("堆栈跟踪: {}", traceback.format_exc())
            return None


wxpay = WechatNativePay()
