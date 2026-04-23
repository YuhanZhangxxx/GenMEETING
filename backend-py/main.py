from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="MeetAI Python Backend",
    description="FastAPI version of the MeetAI backend, running alongside Next.js",
    version="0.1.0",
)

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
