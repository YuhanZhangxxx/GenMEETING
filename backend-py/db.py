"""
Prisma client 单例。每个端点 `from db import prisma` 就能用。
FastAPI 的 lifespan 钩子负责连接/断开。
"""
from contextlib import asynccontextmanager

from prisma import Prisma


prisma = Prisma(auto_register=True)


@asynccontextmanager
async def lifespan(app):
    await prisma.connect()
    try:
        yield
    finally:
        await prisma.disconnect()
