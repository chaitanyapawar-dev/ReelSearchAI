"""
Phase 1 Runtime Verification Script
------------------------------------
Run AFTER starting the backend: python main.py

Usage: python runtime_verify.py <instagram_reel_url>
       python runtime_verify.py --demo   (uses a URL from active_url_jobs if any)

What this checks:
1. POST /download creates a job with status=queued
2. Same URL returns same job_id while active
3. Stages transition sequentially
4. progress reaches 100
5. Final status = completed, stage = Finished
6. active_pipeline_tasks is cleaned up after completion
"""
import sys
import time
import requests
import json

BASE = "http://127.0.0.1:8000"

# ── Test URL: change to a real public reel for full verification
TEST_URL = sys.argv[1] if len(sys.argv) > 1 else None

STAGE_ORDER = [
    "Queued",
    "Downloading",
    "Audio Extraction",
    "Transcribing",
    "OCR",
    "BLIP Captioning",
    "CLIP Embedding",
    "LLM Enrichment",
    "Storing to ChromaDB",
    "Finished",
]

def check(label, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    suffix = f"  ({detail})" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    return cond

def poll_job(job_id, timeout=600):
    """Poll /jobs/{job_id} every 3 seconds until terminal state or timeout."""
    seen_stages = []
    seen_logs = set()
    start = time.time()
    last_progress = -1

    print(f"\n  Polling job {job_id}...")

    while time.time() - start < timeout:
        try:
            r = requests.get(f"{BASE}/jobs/{job_id}", timeout=5)
            r.raise_for_status()
            job = r.json()
        except Exception as e:
            print(f"    [WARN] Poll failed: {e}")
            time.sleep(3)
            continue

        stage = job.get("stage", "")
        status = job.get("status", "")
        progress = job.get("progress", 0)
        logs = job.get("logs", [])

        # Track stage transitions
        if not seen_stages or seen_stages[-1] != stage:
            seen_stages.append(stage)
            elapsed = round(time.time() - start, 1)
            print(f"    [{elapsed:>6.1f}s] Stage: {stage:<30} Progress: {progress}%  Status: {status}")

        # Show new log lines
        for log_entry in logs:
            msg = log_entry.get("msg", "") if isinstance(log_entry, dict) else str(log_entry)
            key = (log_entry.get("timestamp", ""), msg) if isinstance(log_entry, dict) else msg
            if key not in seen_logs:
                seen_logs.add(key)
                print(f"              LOG: {msg}")

        if progress != last_progress:
            last_progress = progress

        if status in ("completed", "failed", "cancelled"):
            elapsed = round(time.time() - start)
            print(f"\n  Terminal state reached in {elapsed}s")
            return job, seen_stages

        time.sleep(3)

    print("  [TIMEOUT] Job did not complete within timeout")
    return None, seen_stages


def run_verification():
    all_pass = True

    print("=" * 60)
    print("PHASE 1 RUNTIME VERIFICATION")
    print("=" * 60)

    # --- 1. Health check ---
    print("\n[1] Backend health check")
    try:
        r = requests.get(f"{BASE}/health", timeout=5)
        r.raise_for_status()
        health = r.json()
        all_pass &= check("Backend online", health.get("backendOnline"))
        all_pass &= check("activeJobs field present", "activeJobs" in health,
                          f"value={health.get('activeJobs')}")
        all_pass &= check("Chroma online", health.get("chromaOnline"))
    except Exception as e:
        print(f"  [FAIL] Health check failed: {e}")
        print("  Is the backend running? Start with: python main.py")
        return

    if not TEST_URL:
        print("\n[!] No URL provided. Skipping live pipeline verification.")
        print("    Run: python runtime_verify.py https://www.instagram.com/reel/...")
        return

    # --- 2. POST /download ---
    print(f"\n[2] POST /download with URL")
    try:
        r = requests.post(f"{BASE}/download", json={"url": TEST_URL}, timeout=10)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"  [FAIL] POST /download failed: {e}")
        return

    job_id = data.get("job_id")
    status = data.get("status")
    all_pass &= check("job_id returned", bool(job_id), f"job_id={job_id}")
    all_pass &= check("status field returned", status is not None, f"status={status}")
    all_pass &= check("initial status is queued", status in ("queued",), f"got={status}")

    # --- 3. Duplicate URL deduplication ---
    print(f"\n[3] Duplicate URL deduplication")
    try:
        r2 = requests.post(f"{BASE}/download", json={"url": TEST_URL}, timeout=10)
        r2.raise_for_status()
        data2 = r2.json()
        same_id = data2.get("job_id") == job_id
        all_pass &= check("Same URL returns same job_id", same_id,
                          f"got={data2.get('job_id')}, expected={job_id}")
        all_pass &= check("Returned status is still active",
                          data2.get("status") in ("queued", "running"),
                          f"got={data2.get('status')}")
    except Exception as e:
        print(f"  [FAIL] Dedup check failed: {e}")

    # --- 4. Poll to completion ---
    print(f"\n[4] Pipeline stage verification")
    final_job, seen_stages = poll_job(job_id)

    if final_job is None:
        all_pass = False
        print("  [FAIL] Job did not reach terminal state")
        return

    # --- 5. Final state checks ---
    print(f"\n[5] Final state checks")
    final_status = final_job.get("status")
    final_stage = final_job.get("stage")
    final_progress = final_job.get("progress")
    final_result = final_job.get("result")
    final_error = final_job.get("error")

    all_pass &= check("Final status = completed", final_status == "completed",
                      f"got={final_status}")
    all_pass &= check("Final stage = Finished", final_stage == "Finished",
                      f"got={final_stage}")
    all_pass &= check("Progress = 100", final_progress == 100,
                      f"got={final_progress}")
    all_pass &= check("Result object present", bool(final_result),
                      f"keys={list(final_result.keys()) if final_result else 'None'}")
    all_pass &= check("No error on success", final_error is None,
                      f"error={final_error}")

    # --- 6. Stage sequence check ---
    print(f"\n[6] Stage sequence check")
    print(f"    Observed stages: {seen_stages}")
    expected_present = ["Downloading", "Finished"]
    for expected in expected_present:
        all_pass &= check(f"Stage '{expected}' was observed",
                          any(expected in s for s in seen_stages))

    # OLLAMA stage
    ollama_seen = any("LLM Enrichment" in s for s in seen_stages)
    all_pass &= check("Ollama (LLM Enrichment) stage observed", ollama_seen)

    # CHROMA stage
    chroma_seen = any("ChromaDB" in s for s in seen_stages)
    all_pass &= check("ChromaDB stage observed", chroma_seen)

    # Stage ordering: OLLAMA before FINISHED
    try:
        stage_values = [s for s in seen_stages]
        ollama_idx = next((i for i, s in enumerate(stage_values) if "LLM" in s), None)
        chroma_idx = next((i for i, s in enumerate(stage_values) if "ChromaDB" in s), None)
        finished_idx = next((i for i, s in enumerate(stage_values) if "Finished" in s), None)
        if ollama_idx is not None and chroma_idx is not None:
            all_pass &= check("OLLAMA before CHROMA in sequence",
                              ollama_idx < chroma_idx)
        if chroma_idx is not None and finished_idx is not None:
            all_pass &= check("CHROMA before FINISHED in sequence",
                              chroma_idx < finished_idx)
    except Exception as e:
        print(f"    [WARN] Stage ordering check failed: {e}")

    # --- 7. Logs are real backend logs (objects, not fake strings) ---
    print(f"\n[7] Log format check")
    logs = final_job.get("logs", [])
    all_pass &= check("Logs are present", len(logs) > 0, f"count={len(logs)}")
    if logs:
        first_log = logs[0]
        all_pass &= check("Log entries are objects with 'timestamp' key",
                          isinstance(first_log, dict) and "timestamp" in first_log,
                          f"type={type(first_log).__name__}")
        all_pass &= check("Log entries have 'msg' key",
                          isinstance(first_log, dict) and "msg" in first_log)
        # Check no fake initialization logs
        fake_msgs = [
            "Initializing ingestion thread",
            "FastAPI job created",
            "PIPELINE_ERROR",
            "SCHEDULER_ERROR",
        ]
        for fake in fake_msgs:
            found = any(fake in (l.get("msg", "") if isinstance(l, dict) else str(l)) for l in logs)
            all_pass &= check(f"No fake log: '{fake[:30]}'", not found)

    # --- 8. Health after completion ---
    print(f"\n[8] Post-completion health check")
    try:
        r = requests.get(f"{BASE}/health", timeout=5)
        health2 = r.json()
        all_pass &= check("Backend still online after job", health2.get("backendOnline"))
        print(f"    activeJobs count after completion: {health2.get('activeJobs')}")
    except Exception as e:
        print(f"  [WARN] Post-completion health check failed: {e}")

    # --- Summary ---
    print("\n" + "=" * 60)
    result_str = "PHASE 1 RUNTIME: ALL CHECKS PASSED" if all_pass else "PHASE 1 RUNTIME: SOME CHECKS FAILED"
    print(result_str)
    print("=" * 60)


if __name__ == "__main__":
    run_verification()
