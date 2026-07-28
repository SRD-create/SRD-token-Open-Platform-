# 使用Python 3.10作为基础镜像
FROM python:3.10-slim

# 设置构建参数
ARG ENVIRONMENT=development

# 设置环境变量
ENV ENVIRONMENT=${ENVIRONMENT}

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制requirements.txt文件
COPY requirements.txt .

# 安装Python依赖
RUN pip install --no-cache-dir -r requirements.txt -i https://repo.huaweicloud.com/repository/pypi/simple

# 安装Gunicorn
RUN pip install --no-cache-dir gunicorn -i https://repo.huaweicloud.com/repository/pypi/simple

# 复制应用代码
COPY . .

# 创建logs目录
RUN mkdir -p logs

# 暴露端口
EXPOSE 8002

# 运行应用（使用Gunicorn启动多个Uvicorn工作进程）
CMD ["sh", "-c", "gunicorn -w ${GUNICORN_WORKERS:-4} -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8002"]
