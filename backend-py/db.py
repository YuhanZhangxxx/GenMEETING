"""
Prisma client singleton. Each endpoint can `from db import prisma` and use it.
The FastAPI lifespan hook handles connect/disconnect.
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
