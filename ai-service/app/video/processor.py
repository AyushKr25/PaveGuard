import cv2
import numpy as np
import asyncio
import uuid
import os
import tempfile
import shutil
from pathlib import Path
from typing import Optional, List, Dict, Any
import logging
from datetime import datetime

from app.inference.engine import InferenceEngine
from app.tracking.tracker import ObjectTracker
from app.severity.estimator import SeverityEstimator
from app.services.job_manager import JobManager
from app.schemas import Detection, JobStatusResponse

logger = logging.getLogger(__name__)


class VideoProcessor:
    """Process videos for pothole detection with tracking"""
    
    def __init__(
        self,
        inference_engine: InferenceEngine,
        tracker: Optional[ObjectTracker],
        severity_estimator: SeverityEstimator,
        job_manager: JobManager,
    ):
        self.inference_engine = inference_engine
        self.tracker = tracker
        self.severity_estimator = severity_estimator
        self.job_manager = job_manager
    
    async def process_video(
        self,
        job_id: str,
        file,
        confidence_threshold: float,
        iou_threshold: float,
        inference_fps: int,
        return_annotated: bool,
    ):
        """Process video file asynchronously"""
        
        # Save uploaded file to temp location
        temp_dir = Path(tempfile.gettempdir()) / f"video_{job_id}"
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        input_path = temp_dir / "input.mp4"
        
        try:
            # Write uploaded file
            content = await file.read()
            with open(input_path, "wb") as f:
                f.write(content)
            
            await self.job_manager.update_job(job_id, {
                "status": "processing",
                "started_at": datetime.utcnow().isoformat(),
            })
            
            # Open video
            cap = cv2.VideoCapture(str(input_path))
            if not cap.isOpened():
                raise ValueError("Could not open video file")
            
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS) or 30
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            
            # Calculate frame skip for desired inference FPS
            frame_skip = max(1, int(fps / inference_fps))
            
            # Setup output video writer if annotated requested
            output_path = None
            writer = None
            if return_annotated:
                output_path = temp_dir / "annotated.mp4"
                fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
            
            # Reset tracker
            if self.tracker:
                self.tracker.reset()
            
            all_detections = []
            processed_frames = 0
            frame_idx = 0
            
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                # Process every Nth frame
                if frame_idx % frame_skip == 0:
                    # Run inference
                    detections = self.inference_engine.predict(
                        frame,
                        confidence_threshold=confidence_threshold,
                        iou_threshold=iou_threshold,
                    )
                    
                    # Apply tracking
                    if self.tracker:
                        detections = self.tracker.update(detections, frame_idx)
                    
                    # Estimate severity
                    for det in detections:
                        if self.severity_estimator:
                            track_hist = self.tracker.get_track_history(det.track_id) if self.tracker and det.track_id else None
                            det.severity = self.severity_estimator.estimate(
                                bbox=det.bbox,
                                segmentation=det.segmentation,
                                confidence=det.confidence,
                                image_width=width,
                                image_height=height,
                                track_history=track_hist,
                            )
                    
                    all_detections.extend(detections)
                    processed_frames += 1
                    
                    # Write annotated frame
                    if writer and detections:
                        annotated = self.inference_engine.draw_detections(frame, detections)
                        writer.write(annotated)
                    elif writer:
                        writer.write(frame)
                    
                    # Update job progress
                    progress = min(99, int((frame_idx / total_frames) * 100))
                    await self.job_manager.update_job(job_id, {
                        "progress": progress,
                        "processed_frames": processed_frames,
                        "total_frames": total_frames,
                    })
                
                frame_idx += 1
                
                # Yield control periodically
                if frame_idx % 30 == 0:
                    await asyncio.sleep(0)
            
            # Cleanup
            cap.release()
            if writer:
                writer.release()
            
            # Deduplicate detections by track
            unique_detections = self._deduplicate_detections(all_detections)
            
            # Finalize job — keep the annotated video on disk so it can be
            # downloaded via GET /jobs/{job_id}/result
            result_url = None
            if output_path and output_path.exists():
                result_url = f"/api/jobs/{job_id}/result"
                self.job_manager.result_files[job_id] = str(output_path)

            await self.job_manager.update_job(job_id, {
                "status": "completed",
                "progress": 100,
                "processed_frames": processed_frames,
                "total_frames": total_frames,
                "detections": [d.model_dump() for d in unique_detections],
                "completed_at": datetime.utcnow().isoformat(),
                "result_url": result_url,
            })

            # Cleanup input file and temp dir only when there is no annotated
            # result to serve
            if not result_url:
                shutil.rmtree(temp_dir, ignore_errors=True)
            
        except Exception as e:
            logger.error(f"Video processing failed for job {job_id}: {e}")
            await self.job_manager.update_job(job_id, {
                "status": "failed",
                "error_message": str(e),
                "completed_at": datetime.utcnow().isoformat(),
            })
            shutil.rmtree(temp_dir, ignore_errors=True)
    
    def _deduplicate_detections(self, detections: List[Detection]) -> List[Detection]:
        """Deduplicate detections by track ID, keeping best detection per track"""
        track_best = {}
        
        for det in detections:
            if not det.track_id:
                continue
            
            if det.track_id not in track_best:
                track_best[det.track_id] = det
            else:
                # Keep detection with highest confidence
                if det.confidence > track_best[det.track_id].confidence:
                    track_best[det.track_id] = det
        
        return list(track_best.values())