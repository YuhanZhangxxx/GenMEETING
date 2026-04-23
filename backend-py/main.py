from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from auth.deps import require_user
from auth.jwt_utils import MobileTokenPayload
from db import prisma, lifespan
from routes import auth as auth_routes


app = FastAPI(
    title="MeetAI Python Backend",
    description="FastAPI version of the MeetAI backend, running alongside Next.js",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(auth_routes.router, prefix="/api/auth")

# 允许 Expo 和 Next.js 都能调
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "service": "meetai-backend-py"}


@app.get("/api/me")
def me(user: MobileTokenPayload = Depends(require_user)):
    """测试鉴权是否生效 — 需要合法 Bearer token。"""
    return {"user": user}


@app.get("/api/stats")
async def stats():
    """DB 烟雾测试 — 数一下表里有多少记录。"""
    return {
        "users": await prisma.user.count(),
        "events_cached": await prisma.calendareventcache.count(),
        "accounts": await prisma.account.count(),
    }
