from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from routes.claims import router as claims_router
from routes.ai import router as ai_router
from routes.upload import router as upload_router
from seed_data import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed()
    yield


app = FastAPI(
    title="PIP Caseworker Assistant",
    description="AI-powered assistant to reduce PIP assessment backlogs",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(claims_router)
app.include_router(ai_router)
app.include_router(upload_router)


@app.get("/")
def root():
    return {"service": "PIP Caseworker Assistant", "status": "running", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
