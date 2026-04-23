import traceback

from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

from auth.deps import require_user
from auth.jwt_utils import MobileTokenPayload
from db import prisma, lifespan
from routes import auth as auth_routes
from routes import calendar as calendar_routes
from routes import meetings as meetings_routes
from routes import recommendations as recommendations_routes
from routes import ai_advisor as ai_advisor_routes
from routes import preferences as preferences_routes
from routes import notifications as notifications_routes
from routes import contacts as contacts_routes


app = FastAPI(
    title="MeetAI Python Backend",
    description="FastAPI version of the MeetAI backend, running alongside Next.js",
    version="0.1.0",
    lifespan=lifespan,
)

# Open CORS so both Expo and Next.js can hit this service.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def uncaught_exception_handler(request: Request, exc: Exception):
    """Always return JSON for uncaught errors so the mobile client can parse them."""
    tb = traceback.format_exc()
    # Log full traceback server-side for debugging.
    print(f"[ERROR] {request.method} {request.url.path}\n{tb}")
    return JSONResponse(
        status_code=500,
        content={"error": str(exc) or exc.__class__.__name__},
    )

app.include_router(auth_routes.router, prefix="/api/auth")
app.include_router(calendar_routes.router, prefix="/api/calendar")
app.include_router(meetings_routes.router, prefix="/api/meetings")
app.include_router(recommendations_routes.router, prefix="/api/recommendations")
app.include_router(ai_advisor_routes.router, prefix="/api/ai-advisor")
app.include_router(preferences_routes.router, prefix="/api/preferences")
app.include_router(notifications_routes.router, prefix="/api/notifications")
app.include_router(contacts_routes.router, prefix="/api/contacts")


@app.get("/health")
def health():
    return {"ok": True, "service": "meetai-backend-py"}


@app.get("/api/me")
def me(user: MobileTokenPayload = Depends(require_user)):
    """Auth smoke test — requires a valid Bearer token."""
    return {"user": user}


@app.get("/api/stats")
async def stats():
    """DB smoke test — count rows in a few tables."""
    return {
        "users": await prisma.user.count(),
        "events_cached": await prisma.calendareventcache.count(),
        "accounts": await prisma.account.count(),
    }
