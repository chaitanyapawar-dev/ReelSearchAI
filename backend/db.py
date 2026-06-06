import sqlite3
import json
import asyncio
from pathlib import Path
from datetime import datetime

DB_PATH = Path("vector_db/jobs.db")

def get_db_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def _init_db_sync():
    conn = get_db_connection()
    try:
        with conn:
            # Create jobs table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    url TEXT,
                    status TEXT,
                    stage TEXT,
                    progress INTEGER,
                    error TEXT,
                    result TEXT,
                    created_at TEXT,
                    updated_at TEXT
                )
            """)
            # Create logs table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id TEXT,
                    timestamp TEXT,
                    msg TEXT,
                    level TEXT,
                    FOREIGN KEY(job_id) REFERENCES jobs(job_id) ON DELETE CASCADE
                )
            """)
            # Create indexes for optimal query performance
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_logs_job_id_timestamp ON logs(job_id, timestamp ASC);")
    finally:
        conn.close()

def _recover_orphaned_jobs_sync():
    conn = get_db_connection()
    now = datetime.utcnow().isoformat()
    try:
        with conn:
            conn.execute(
                "UPDATE jobs SET status = ?, stage = ?, error = ?, updated_at = ? WHERE status IN (?, ?)",
                ("failed", "Failed", "Ingestion pipeline interrupted due to server shutdown/restart.", now, "running", "queued")
            )
    finally:
        conn.close()

def _create_job_sync(job_id: str, url: str):
    conn = get_db_connection()
    now = datetime.utcnow().isoformat()
    try:
        with conn:
            conn.execute(
                "INSERT INTO jobs (job_id, url, status, stage, progress, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (job_id, url, "queued", "Queued", 0, now, now)
            )
    finally:
        conn.close()

def _update_job_sync(job_id: str, **kwargs):
    conn = get_db_connection()
    now = datetime.utcnow().isoformat()
    try:
        # Prepare dynamic UPDATE statement
        fields = []
        values = []
        for k, v in kwargs.items():
            if k == "result" and isinstance(v, dict):
                fields.append("result = ?")
                values.append(json.dumps(v))
            elif k in ("status", "stage", "progress", "error"):
                fields.append(f"{k} = ?")
                values.append(v)
        
        if not fields:
            return

        fields.append("updated_at = ?")
        values.append(now)
        values.append(job_id)

        with conn:
            conn.execute(
                f"UPDATE jobs SET {', '.join(fields)} WHERE job_id = ?",
                tuple(values)
            )
    finally:
        conn.close()

def _add_log_sync(job_id: str, message: str, level: str = "INFO"):
    conn = get_db_connection()
    now = datetime.utcnow().isoformat()
    try:
        with conn:
            conn.execute(
                "INSERT INTO logs (job_id, timestamp, msg, level) VALUES (?, ?, ?, ?)",
                (job_id, now, message, level.upper())
            )
            conn.execute(
                "UPDATE jobs SET updated_at = ? WHERE job_id = ?",
                (now, job_id)
            )
    finally:
        conn.close()

def _row_to_dict(row):
    if not row:
        return None
    d = dict(row)
    if "result" in d and d["result"]:
        try:
            d["result"] = json.loads(d["result"])
        except Exception:
            pass
    return d

def _get_job_sync(job_id: str):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        if not row:
            return None
        job = _row_to_dict(row)
        
        log_rows = conn.execute(
            "SELECT timestamp, msg, level FROM logs WHERE job_id = ? ORDER BY timestamp ASC",
            (job_id,)
        ).fetchall()
        job["logs"] = [{"timestamp": r["timestamp"], "msg": r["msg"], "level": r["level"]} for r in log_rows]
        return job
    finally:
        conn.close()

def _list_jobs_sync(limit: int = 50, offset: int = 0, status: str = None):
    conn = get_db_connection()
    try:
        query = "SELECT * FROM jobs"
        params = []
        if status:
            query += " WHERE status = ?"
            params.append(status)
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        rows = conn.execute(query, params).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()

def _get_queue_position_sync(job_id: str) -> int:
    conn = get_db_connection()
    try:
        target = conn.execute("SELECT created_at FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        if not target:
            return 0
        created_at = target["created_at"]
        count = conn.execute(
            "SELECT COUNT(*) FROM jobs WHERE status = ? AND created_at < ?",
            ("queued", created_at)
        ).fetchone()[0]
        return count
    finally:
        conn.close()

# Asynchronous wrappers for FastAPI
async def init_db():
    await asyncio.to_thread(_init_db_sync)

async def recover_orphaned_jobs():
    await asyncio.to_thread(_recover_orphaned_jobs_sync)

async def create_job(job_id: str, url: str):
    await asyncio.to_thread(_create_job_sync, job_id, url)

async def update_job(job_id: str, **kwargs):
    await asyncio.to_thread(_update_job_sync, job_id, **kwargs)

async def add_log(job_id: str, message: str, level: str = "INFO"):
    await asyncio.to_thread(_add_log_sync, job_id, message, level)

async def get_job(job_id: str):
    return await asyncio.to_thread(_get_job_sync, job_id)

async def list_jobs(limit: int = 50, offset: int = 0, status: str = None):
    return await asyncio.to_thread(_list_jobs_sync, limit, offset, status)

async def get_queue_position(job_id: str) -> int:
    return await asyncio.to_thread(_get_queue_position_sync, job_id)

def _get_active_job_by_url_sync(url: str):
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT job_id FROM jobs WHERE url = ? AND status IN (?, ?) LIMIT 1",
            (url, "queued", "running")
        ).fetchone()
        return row["job_id"] if row else None
    finally:
        conn.close()

async def get_active_job_by_url(url: str):
    return await asyncio.to_thread(_get_active_job_by_url_sync, url)

def _get_active_jobs_count_sync() -> int:
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM jobs WHERE status IN (?, ?)",
            ("queued", "running")
        ).fetchone()
        return row[0] if row else 0
    finally:
        conn.close()

async def get_active_jobs_count() -> int:
    return await asyncio.to_thread(_get_active_jobs_count_sync)

