"""
Phase 1 self-contained runtime verification.
Starts uvicorn in a subprocess, waits for readiness, runs checks, stops.
Run from: backend/
Usage: python selftest.py [instagram_reel_url]
"""
import subprocess, sys, time, requests, signal, os, json

BASE = "http://127.0.0.1:8000"
URL_ARG = sys.argv[1] if len(sys.argv) > 1 else None
PYTHON = sys.executable

# ── Start the server ──────────────────────────────────────────────────────────
print("[BOOT] Starting uvicorn...")
srv = subprocess.Popen(
    [PYTHON, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000",
     "--log-level", "warning"],
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    cwd=os.path.dirname(os.path.abspath(__file__)),
)

def stop():
    srv.terminate()
    try: srv.wait(timeout=5)
    except: srv.kill()
    print("[BOOT] Server stopped.")

# ── Wait until healthy (up to 180s for model loading) ─────────────────────────
print("[BOOT] Waiting for models to load (up to 180s)...")
deadline = time.time() + 180
ready = False
while time.time() < deadline:
    try:
        r = requests.get(f"{BASE}/health", timeout=3)
        if r.status_code == 200:
            h = r.json()
            models = h.get("models", {})
            all_loaded = all(v == "loaded" for v in models.values())
            if all_loaded:
                print(f"[BOOT] Ready! Models: {models}")
                ready = True
                break
            else:
                print(f"[BOOT] Still loading... models={models}")
    except Exception:
        pass
    time.sleep(5)

if not ready:
    print("[FAIL] Server did not become ready in time.")
    stop()
    sys.exit(1)

# ── Run checks ────────────────────────────────────────────────────────────────
results = []

def check(label, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    suffix = f"  ({detail})" if detail else ""
    msg = f"  [{status}] {label}{suffix}"
    print(msg)
    results.append((label, cond))
    return cond

print("\n=== PHASE 1 RUNTIME VERIFICATION ===\n")

# 1. Health check
print("[CHECK 1] Health endpoint")
h = requests.get(f"{BASE}/health", timeout=5).json()
check("backendOnline=True", h.get("backendOnline") == True)
check("activeJobs field present", "activeJobs" in h, f"value={h.get('activeJobs')}")
check("chromaOnline=True", h.get("chromaOnline") == True)
check("ollamaOnline field present", "ollamaOnline" in h)
check("gpu field present", "gpu" in h)
check("all models loaded", all(v == "loaded" for v in h.get("models", {}).values()),
      str(h.get("models")))

# 2. POST /download structure (with a dummy URL to test validation)
print("\n[CHECK 2] POST /download validation")
r_bad = requests.post(f"{BASE}/download", json={"url": "https://notreallyinstagram.com/reel/x"}, timeout=5)
check("Non-instagram URL rejected (400)", r_bad.status_code == 400, f"got={r_bad.status_code}")

r_empty = requests.post(f"{BASE}/download", json={"url": ""}, timeout=5)
check("Empty URL rejected (400)", r_empty.status_code == 400, f"got={r_empty.status_code}")

# 3. Full pipeline test (only if URL provided)
if URL_ARG:
    print(f"\n[CHECK 3] Full pipeline with URL: {URL_ARG}")

    # POST job
    r1 = requests.post(f"{BASE}/download", json={"url": URL_ARG}, timeout=10)
    check("POST /download returns 200", r1.status_code == 200, f"got={r1.status_code}")
    data1 = r1.json()
    job_id = data1.get("job_id")
    check("job_id returned", bool(job_id), f"job_id={job_id}")
    check("status field returned", "status" in data1, f"keys={list(data1.keys())}")
    check("initial status queued", data1.get("status") in ("queued",), f"got={data1.get('status')}")

    # Dedup check
    r2 = requests.post(f"{BASE}/download", json={"url": URL_ARG}, timeout=10)
    data2 = r2.json()
    check("Duplicate URL returns same job_id", data2.get("job_id") == job_id,
          f"got={data2.get('job_id')}")
    check("Duplicate returns active status", data2.get("status") in ("queued", "running"),
          f"got={data2.get('status')}")

    # Poll to completion
    print(f"\n  Polling job {job_id} every 3s...")
    seen_stages = []
    start = time.time()
    final_job = None

    while time.time() - start < 600:
        r = requests.get(f"{BASE}/jobs/{job_id}", timeout=5)
        job = r.json()
        stage = job.get("stage", "")
        status = job.get("status", "")
        progress = job.get("progress", 0)

        if not seen_stages or seen_stages[-1] != stage:
            seen_stages.append(stage)
            elapsed = round(time.time() - start, 1)
            print(f"  [{elapsed:>6.1f}s] {stage:<35} {progress}%  [{status}]")

        if status in ("completed", "failed", "cancelled"):
            final_job = job
            break
        time.sleep(3)

    if final_job:
        print(f"\n[CHECK 4] Final state")
        check("Final status=completed", final_job.get("status") == "completed",
              f"got={final_job.get('status')}")
        check("Final stage=Finished", final_job.get("stage") == "Finished",
              f"got={final_job.get('stage')}")
        check("Progress=100", final_job.get("progress") == 100,
              f"got={final_job.get('progress')}")
        check("result object present", bool(final_job.get("result")),
              f"keys={list((final_job.get('result') or {}).keys())}")
        check("No error on success", final_job.get("error") is None,
              f"error={final_job.get('error')}")

        print(f"\n[CHECK 5] Stage sequence: {seen_stages}")
        check("Downloading observed", any("Downloading" in s for s in seen_stages))
        check("LLM Enrichment (Ollama) observed", any("LLM Enrichment" in s for s in seen_stages))
        check("Storing to ChromaDB observed", any("ChromaDB" in s or "Chroma" in s for s in seen_stages))
        check("Finished observed", any("Finished" in s for s in seen_stages))

        # Stage order
        stage_list = list(seen_stages)
        def idx(fragment):
            return next((i for i,s in enumerate(stage_list) if fragment in s), -1)
        check("OLLAMA before CHROMA", 0 <= idx("LLM") < idx("ChromaDB"),
              f"llm={idx('LLM')} chroma={idx('ChromaDB')}")
        check("CHROMA before FINISHED", 0 <= idx("ChromaDB") < idx("Finished"),
              f"chroma={idx('ChromaDB')} finished={idx('Finished')}")

        print(f"\n[CHECK 6] Log format")
        logs = final_job.get("logs", [])
        check("Logs present", len(logs) > 0, f"count={len(logs)}")
        if logs:
            first = logs[0]
            check("Log is dict with timestamp", isinstance(first, dict) and "timestamp" in first)
            check("Log has msg key", isinstance(first, dict) and "msg" in first)

        print(f"\n[CHECK 7] active_pipeline_tasks cleanup")
        h2 = requests.get(f"{BASE}/health", timeout=5).json()
        check("activeJobs decremented after completion",
              h2.get("activeJobs", -1) == 0, f"got={h2.get('activeJobs')}")
    else:
        check("Job completed within 600s", False, "TIMEOUT")
else:
    print("\n  [SKIP] No Instagram URL provided — pipeline checks skipped.")
    print("  Run: python selftest.py https://www.instagram.com/reel/XXXX/")

# Summary
total = len(results)
passed = sum(1 for _, v in results if v)
failed = total - passed
print(f"\n{'='*50}")
print(f"RUNTIME VERIFICATION: {passed}/{total} checks passed")
if failed:
    print("FAILED checks:")
    for name, v in results:
        if not v:
            print(f"  - {name}")
print('='*50)

stop()
sys.exit(0 if failed == 0 else 1)
