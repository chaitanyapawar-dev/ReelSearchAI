import sqlite3
import json
import time
import requests
import sys
import asyncio
from pathlib import Path

# Add backend to path to allow importing db
sys.path.append(str(Path(__file__).parent))
import db
from main import job_notifier, log_job, update_job, app

BASE_URL = "http://127.0.0.1:8000"

def print_result(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    detail_str = f" ({detail})" if detail else ""
    print(f"  [{status}] {name}{detail_str}")
    return passed

def test_sqlite_schema():
    print("\n--- [1] Testing SQLite Schemas & Indexes ---")
    conn = sqlite3.connect(str(db.DB_PATH))
    cursor = conn.cursor()
    
    # Check jobs columns
    cursor.execute("PRAGMA table_info(jobs)")
    jobs_cols = {row[1]: row[2] for row in cursor.fetchall()}
    expected_jobs_cols = ["job_id", "url", "status", "stage", "progress", "error", "result", "created_at", "updated_at"]
    all_jobs_present = all(col in jobs_cols for col in expected_jobs_cols)
    print_result("Jobs table columns correct", all_jobs_present, f"found cols: {list(jobs_cols.keys())}")
    
    # Check logs columns
    cursor.execute("PRAGMA table_info(logs)")
    logs_cols = {row[1]: row[2] for row in cursor.fetchall()}
    expected_logs_cols = ["id", "job_id", "timestamp", "msg", "level"]
    all_logs_present = all(col in logs_cols for col in expected_logs_cols)
    print_result("Logs table columns correct", all_logs_present, f"found cols: {list(logs_cols.keys())}")
    
    # Check indexes
    cursor.execute("PRAGMA index_list(jobs)")
    jobs_indexes = {row[1] for row in cursor.fetchall()}
    idx_status_ok = "idx_jobs_status" in jobs_indexes
    idx_created_ok = "idx_jobs_created_at" in jobs_indexes
    print_result("Jobs index idx_jobs_status exists", idx_status_ok)
    print_result("Jobs index idx_jobs_created_at exists", idx_created_ok)
    
    cursor.execute("PRAGMA index_list(logs)")
    logs_indexes = {row[1] for row in cursor.fetchall()}
    idx_logs_ok = "idx_logs_job_id_timestamp" in logs_indexes
    print_result("Logs index idx_logs_job_id_timestamp exists", idx_logs_ok)
    
    # Check WAL mode
    cursor.execute("PRAGMA journal_mode")
    journal_mode = cursor.fetchone()[0]
    print_result("SQLite is in WAL mode", journal_mode.lower() == "wal", f"journal_mode={journal_mode}")
    
    conn.close()
    return all_jobs_present and all_logs_present and idx_status_ok and idx_created_ok and idx_logs_ok and (journal_mode.lower() == "wal")

def test_startup_recovery():
    print("\n--- [2] Testing Startup Recovery Hook ---")
    conn = sqlite3.connect(str(db.DB_PATH))
    cursor = conn.cursor()
    
    # Insert a dummy active job
    job_id = "test_recovery_job_123"
    cursor.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
    cursor.execute(
        "INSERT INTO jobs (job_id, url, status, stage, progress, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (job_id, "https://test.url/recovery", "running", "Downloading", 50, "2026-05-22T00:00:00Z", "2026-05-22T00:00:00Z")
    )
    conn.commit()
    conn.close()
    
    # Run recovery hook sync
    db._recover_orphaned_jobs_sync()
    
    # Retrieve job
    recovered_job = db._get_job_sync(job_id)
    passed = False
    if recovered_job:
        passed = (
            recovered_job["status"] == "failed" and 
            recovered_job["stage"] == "Failed" and 
            "interrupted" in recovered_job["error"]
        )
        print_result("Orphaned job recovered to failed", passed, f"status={recovered_job['status']}, error={recovered_job.get('error')}")
    else:
        print_result("Orphaned job recovered to failed", False, "job not found")
        
    # Clean up
    conn = sqlite3.connect(str(db.DB_PATH))
    cursor = conn.cursor()
    cursor.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
    conn.commit()
    conn.close()
    return passed

async def test_sse_streaming_async():
    print("\n--- [3] Testing SSE Stream & Subscriber Cleanup (Async) ---")
    job_id = "test_sse_job_456"
    
    # Prepare job
    conn = sqlite3.connect(str(db.DB_PATH))
    cursor = conn.cursor()
    cursor.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
    cursor.execute("DELETE FROM logs WHERE job_id = ?", (job_id,))
    cursor.execute(
        "INSERT INTO jobs (job_id, url, status, stage, progress, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (job_id, "https://test.url/sse", "queued", "Queued", 0, "2026-05-22T00:00:00Z", "2026-05-22T00:00:00Z")
    )
    conn.commit()
    conn.close()
    
    try:
        from main import api_stream_job
        response = await api_stream_job(job_id)
        generator = response.body_iterator
        
        # Read initial event (yielded immediately upon subscription)
        first_event = await generator.__anext__()
        has_initial_data = "job_update" in first_event
        print_result("Initial state sent in stream", has_initial_data, f"event={first_event[:80]}...")
        
        # Verify subscriber registered in job_notifier
        sub_count = len(job_notifier.subscribers.get(job_id, set()))
        print_result("JobNotifier registered subscriber", sub_count == 1, f"count={sub_count}")
        
        # Trigger an update using log_job (runs notifier.notify internally)
        log_job(job_id, "Log message propagated", "INFO")
        await asyncio.sleep(0.1) # yield to event loop
        
        # Read second event (update)
        second_event = await generator.__anext__()
        has_update_data = "Log message propagated" in second_event
        print_result("Updates received in stream", has_update_data, f"event={second_event[:80]}...")
        
        # Close generator (simulates client disconnect)
        await generator.aclose()
        await asyncio.sleep(0.1) # yield to let cleanup run
        
        # Check subscriber cleanup
        final_count = len(job_notifier.subscribers.get(job_id, set()))
        print_result("JobNotifier cleaned up subscriber on disconnect", final_count == 0, f"count={final_count}")
        
        passed = has_initial_data and (sub_count == 1) and has_update_data and (final_count == 0)
    except Exception as e:
        print_result("SSE async test raised exception", False, str(e))
        passed = False
    finally:
        # Cleanup
        conn = sqlite3.connect(str(db.DB_PATH))
        cursor = conn.cursor()
        cursor.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
        cursor.execute("DELETE FROM logs WHERE job_id = ?", (job_id,))
        conn.commit()
        conn.close()
        
    return passed

def test_running_api_endpoints():
    print("\n--- [4] Testing Live HTTP API Endpoints ---")
    try:
        # 1. Health
        r = requests.get(f"{BASE_URL}/api/health", timeout=5)
        r.raise_for_status()
        health = r.json()
        h_ok = health.get("backendOnline") is True
        print_result("GET /api/health correct", h_ok, f"response={health}")
        
        # 2. POST /api/jobs (create job)
        test_url = "https://www.instagram.com/reel/C7Xyz_" + str(int(time.time()))
        r = requests.post(f"{BASE_URL}/api/jobs", json={"url": test_url}, timeout=5)
        r.raise_for_status()
        create_res = r.json()
        job_id = create_res.get("job_id")
        status = create_res.get("status")
        c_ok = bool(job_id) and status == "queued"
        print_result("POST /api/jobs correct", c_ok, f"response={create_res}")
        
        # 3. GET /api/jobs/{job_id}
        r = requests.get(f"{BASE_URL}/api/jobs/{job_id}", timeout=5)
        r.raise_for_status()
        job_res = r.json()
        g_ok = job_res.get("job_id") == job_id and "queue_position" in job_res
        print_result("GET /api/jobs/{job_id} correct", g_ok, f"queue_position={job_res.get('queue_position')}")
        
        # 4. GET /api/jobs (list with filters)
        r = requests.get(f"{BASE_URL}/api/jobs?limit=5", timeout=5)
        r.raise_for_status()
        list_res = r.json()
        l_ok = isinstance(list_res, list) and len(list_res) > 0
        print_result("GET /api/jobs list correct", l_ok, f"count={len(list_res)}")

        # Fetch actual current status of job to filter dynamically (as it might have progressed to 'running')
        r_job = requests.get(f"{BASE_URL}/api/jobs/{job_id}", timeout=5)
        r_job.raise_for_status()
        current_status = r_job.json().get("status", "queued")

        r_filtered = requests.get(f"{BASE_URL}/api/jobs?limit=5&status={current_status}", timeout=5)
        r_filtered.raise_for_status()
        list_filtered = r_filtered.json()
        filter_ok = isinstance(list_filtered, list) and len(list_filtered) > 0 and all(j.get("status") == current_status for j in list_filtered)
        print_result(f"GET /api/jobs filtering by status '{current_status}' correct", filter_ok, f"count={len(list_filtered)}")
        
        # Cleanup
        conn = sqlite3.connect(str(db.DB_PATH))
        cursor = conn.cursor()
        cursor.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
        cursor.execute("DELETE FROM logs WHERE job_id = ?", (job_id,))
        conn.commit()
        conn.close()
        
        return h_ok and c_ok and g_ok and l_ok and filter_ok
    except Exception as e:
        print_result("Live HTTP API endpoint checks failed", False, str(e))
        return False

def run_all():
    print("=" * 60)
    print("PHASE 4 AUTOMATED TEST SUITE")
    print("=" * 60)
    
    schema_ok = test_sqlite_schema()
    recovery_ok = test_startup_recovery()
    sse_ok = asyncio.run(test_sse_streaming_async())
    api_ok = test_running_api_endpoints()
    
    print("\n" + "=" * 60)
    if schema_ok and recovery_ok and sse_ok and api_ok:
        print("OVERALL: ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("OVERALL: SOME TESTS FAILED")
        sys.exit(1)

if __name__ == "__main__":
    run_all()
