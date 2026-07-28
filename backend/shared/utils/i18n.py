import gettext
import os
from fastapi import Request

# 获取当前文件的目录
current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 构建locale目录的绝对路径
locale_dir = os.path.join(current_dir, "locale")

# 初始化国际化工具
def get_translator(request: Request):
    """获取翻译函数
    
    Args:
        request: FastAPI 请求对象
        
    Returns:
        翻译函数 gettext
    """
    # 从请求头中获取语言
    lang = request.headers.get("Accept-Language", "zh").split(",")[0]
    
    # 支持的语言代码映射
    lang_map = {
        "en": "en_US",
        "zh": "zh_CN"
    }
    
    # 获取对应的语言代码
    lang_code = lang_map.get(lang.split("-")[0], "zh_CN")
    
    try:
        # 尝试加载对应语言的翻译
        translator = gettext.translation(
            domain="messages",
            localedir=locale_dir,
            languages=[lang_code],
            fallback=True
        )
        return translator.gettext
    except:
        # 如果加载失败，返回默认翻译（返回原文）
        return lambda x: x

# 便捷函数，用于在模板或其他地方使用
def _(text):
    """默认翻译函数，返回原文
    
    Args:
        text: 待翻译的文本
        
    Returns:
        原文
    """
    return text
