# aitoken_platform_backend_nexus

AI Token Platform Backend Nexus - 后端API服务

## Getting started

### Prerequisites
- Python 3.10+
- MySQL 8.0+
- Redis 7.0+
- Docker (optional for deployment)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/aitoken_platform_backend_nexus.git
cd aitoken_platform_backend_nexus
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` file with your configuration.

4. Run the application:
```bash
python main.py
```

### Docker Deployment
```bash
docker build -t aitoken-platform-nexus .
docker run -d -p 8002:8002 aitoken-platform-nexus
```

## API Documentation
Access Swagger UI at: `http://localhost:8002/docs`

## Features
- User authentication with WeChat
- API Key management
- Token package management
- Payment integration (WeChat Pay)
- Token usage tracking
- Admin dashboard

## License
This project is for internal use.
