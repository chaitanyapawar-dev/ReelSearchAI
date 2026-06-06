"""Phase 1 verification script — run from backend/ directory."""
src = open("main.py", encoding="utf-8").read()

pipeline_start = src.find("async def run_pipeline")
pipeline_end = src.find("# ---------------------------------------------------------------------------\n# Endpoint to fetch job status")
pipeline_body = src[pipeline_start:pipeline_end]

checks = {
    "active_pipeline_tasks defined": "active_pipeline_tasks: dict[str, asyncio.Task] = {}" in src,
    "update_job stamps updated_at": 'job["updated_at"] = datetime.utcnow().isoformat()' in src,
    "log_job also stamps updated_at": src.count('job["updated_at"] = datetime.utcnow().isoformat()') >= 2,
    "HTTPException NOT raised in run_pipeline": "raise HTTPException" not in pipeline_body,
    "RuntimeError used in pipeline": "raise RuntimeError" in pipeline_body,
    "OLLAMA stage update present": "stage=PipelineStage.OLLAMA" in pipeline_body,
    "CHROMA stage update present": "stage=PipelineStage.CHROMA" in pipeline_body,
    "OLLAMA before CHROMA in pipeline": pipeline_body.find("PipelineStage.OLLAMA") < pipeline_body.find("PipelineStage.CHROMA"),
    "FAILED stage used on error": "stage=PipelineStage.FAILED" in pipeline_body,
    "ERROR stage NOT used in pipeline": "stage=PipelineStage.ERROR" not in pipeline_body,
    "active_url_jobs.pop in finally": "active_url_jobs.pop(url, None)" in pipeline_body,
    "active_pipeline_tasks.pop in finally": "active_pipeline_tasks.pop(job_id, None)" in pipeline_body,
    "job_lock NOT used inside pipeline": "job_lock" not in pipeline_body,
    "result field in job endpoint": '"result": job.get("result")' in src,
    "activeJobs in health endpoint": "activeJobs" in src,
    "status field in download response": '"status": "queued"' in src,
    "duplicate URL checks running status": '("queued", "running")' in src,
    "Ollama structured JSON prompt": "semantic_memory" in pipeline_body,
    "log_job caps at 200": "len(logs) > 200" in src,
    "pipeline_semaphore used": "async with pipeline_semaphore" in pipeline_body,
    "Whisper transcription wrapped in try/except": 'raise RuntimeError(f"Transcription failed' in pipeline_body,
}

all_pass = True
for name, passed in checks.items():
    status = "PASS" if passed else "FAIL"
    if not passed:
        all_pass = False
    print(f"  [{status}] {name}")

print()
print("OVERALL:", "ALL PASS" if all_pass else "SOME FAILURES - review above")
