import os
from typing import List, Any

from fastapi import FastAPI, HTTPException
import asyncpg

DATABASE_URL_ENV = "NEON_DATABASE_URL"

app = FastAPI(title="Mikael OGE Train - Backend (FastAPI demo)")


@app.on_event("startup")
async def startup():
    url = os.getenv(DATABASE_URL_ENV)
    if not url:
        raise RuntimeError(f"Environment variable {DATABASE_URL_ENV} is not set")
    app.state.db_pool = await asyncpg.create_pool(dsn=url, min_size=1, max_size=5)


@app.on_event("shutdown")
async def shutdown():
    pool = getattr(app.state, "db_pool", None)
    if pool:
        await pool.close()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/items")
async def read_items(limit: int = 10):
    pool = app.state.db_pool
    if not pool:
        raise HTTPException(status_code=500, detail="DB pool not initialized")
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, name, created_at FROM items LIMIT $1", limit)
        return [dict(row) for row in rows]
