# backend-py

MeetAI 的 FastAPI 版本后端，和 Next.js 的 API 并行跑。手机端可以切到这个。

## 装依赖

```bash
cd backend-py
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

## 配置

```bash
cp .env.example .env
# 填上 NEXTAUTH_SECRET（必须和 Next.js 的一样，JWT 才能互通）
# 填上其他 OAuth / OpenAI 的 key
```

## 启动

```bash
uvicorn main:app --reload --port 8000
```

- 健康检查：http://localhost:8000/health
- Swagger 文档：http://localhost:8000/docs

## Mobile 切过来

改 `mobile/.env.local`：

```
EXPO_PUBLIC_API_URL=http://<你的LAN IP>:8000
```
