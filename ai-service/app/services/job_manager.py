import asyncio
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from pathlib import Path
import json
import logging

from app.schemas import JobStatusResponse

logger = logging.getLogger(__name__)


class JobManager:
    """Manage async processing jobs"""
    
    def __init__(self, storage_dir: str = "/app/temp/jobs"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.jobs: Dict[str, Dict[str, Any]] = {}
        # job_id -> path of the annotated video kept on disk for download
        self.result_files: Dict[str, str] = {}
        self._lock = asyncio.Lock()
    
    async def create_job(
        self,
        job_id: str,
        job_type: str,
        input_file,
        params: Dict[str, Any],
    ) -> JobStatusResponse:
        """Create a new job"""
        job_data = {
            "job_id": job_id,
            "job_type": job_type,
            "status": "queued",
            "progress": 0,
            "processed_frames": 0,
            "total_frames": 0,
            "detections": [],
            "error_message": None,
            "result_url": None,
            "params": params,
            "created_at": datetime.utcnow().isoformat(),
            "started_at": None,
            "completed_at": None,
        }
        
        async with self._lock:
            self.jobs[job_id] = job_data
            await self._persist_job(job_id)
        
        return JobStatusResponse(**job_data)
    
    async def get_job(self, job_id: str) -> Optional[JobStatusResponse]:
        """Get job status"""
        async with self._lock:
            job = self.jobs.get(job_id)
            if not job:
                # Try loading from disk
                job = await self._load_job(job_id)
            
            if job:
                return JobStatusResponse(**job)
            return None
    
    async def update_job(self, job_id: str, updates: Dict[str, Any]) -> Optional[JobStatusResponse]:
        """Update job status"""
        async with self._lock:
            if job_id not in self.jobs:
                return None
            
            self.jobs[job_id].update(updates)
            await self._persist_job(job_id)
            
            return JobStatusResponse(**self.jobs[job_id])
    
    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a job"""
        async with self._lock:
            if job_id not in self.jobs:
                return False
            
            if self.jobs[job_id]["status"] in ["completed", "failed", "cancelled"]:
                return False
            
            self.jobs[job_id]["status"] = "cancelled"
            self.jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()
            await self._persist_job(job_id)
            
            return True
    
    async def list_jobs(self, status: Optional[str] = None) -> List[JobStatusResponse]:
        """List all jobs"""
        async with self._lock:
            jobs = list(self.jobs.values())
            if status:
                jobs = [j for j in jobs if j["status"] == status]
            return [JobStatusResponse(**j) for j in jobs]
    
    async def _persist_job(self, job_id: str):
        """Persist job to disk"""
        job_file = self.storage_dir / f"{job_id}.json"
        try:
            with open(job_file, 'w') as f:
                json.dump(self.jobs[job_id], f, default=str)
        except Exception as e:
            logger.error(f"Failed to persist job {job_id}: {e}")
    
    async def _load_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Load job from disk"""
        job_file = self.storage_dir / f"{job_id}.json"
        if not job_file.exists():
            return None
        
        try:
            with open(job_file, 'r') as f:
                job = json.load(f)
                self.jobs[job_id] = job
                return job
        except Exception as e:
            logger.error(f"Failed to load job {job_id}: {e}")
            return None
    
    async def cleanup_old_jobs(self, max_age_hours: int = 24):
        """Clean up old completed jobs"""
        async with self._lock:
            cutoff = datetime.utcnow().timestamp() - (max_age_hours * 3600)
            to_remove = []
            
            for job_id, job in self.jobs.items():
                if job["status"] in ["completed", "failed", "cancelled"]:
                    completed_at = job.get("completed_at")
                    if completed_at:
                        try:
                            completed_ts = datetime.fromisoformat(completed_at).timestamp()
                            if completed_ts < cutoff:
                                to_remove.append(job_id)
                        except Exception:
                            pass
            
            for job_id in to_remove:
                del self.jobs[job_id]
                job_file = self.storage_dir / f"{job_id}.json"
                job_file.unlink(missing_ok=True)
    
    async def shutdown(self):
        """Shutdown job manager"""
        # Persist all jobs
        for job_id in self.jobs:
            await self._persist_job(job_id)