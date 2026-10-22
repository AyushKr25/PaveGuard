from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from contextlib import asynccontextmanager
import uvicorn
import logging
import time
import uuid
import os
from pathlib import Path
from typing import Optional, List, Dict, Any
import asyncio

from app.config import settings
from app.schemas import (
    HealthResponse, ModelInfo, DetectionResponse, Detection, 
    BoundingBox, SegmentationMask, Severity, SeverityRequest,
    VideoJobRequest, VideoJobResponse, JobStatusResponse,
    ErrorResponse
)
from app.inference.engine import InferenceEngine
from app.tracking.tracker import ObjectTracker
from app.severity.estimator import SeverityEstimator
from app.video.processor import VideoProcessor
from app.services.job_manager import JobManager
from app.utils.image import load_image_from_upload, image_to_base64, base64_to_image

# Configure logging
logging.basicConfig(level=settings.log_level.upper())
logger = logging.getLogger(__name__)

# Global instances
inference_engine: Optional[InferenceEngine] = None
tracker: Optional[ObjectTracker] = None
severity_estimator: Optional[SeverityEstimator] = None
video_processor: Optional[VideoProcessor] = None
job_manager: Optional[JobManager] = None

security = HTTPBearer(auto_error=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global inference_engine, tracker, severity_estimator, video_processor, job_manager
    
    logger.info("Starting SmartPothole AI Service...")
    
    # Initialize job manager
    job_manager = JobManager()
    
    # Initialize inference engine
    try:
        inference_engine = InferenceEngine(
            model_path=settings.model_path,
            model_type=settings.model_type,
            device=settings.device,
            half_precision=settings.half_precision,
            image_size=settings.image_size,
            confidence_threshold=settings.confidence_threshold,
            iou_threshold=settings.iou_threshold,
            enable_segmentation=settings.enable_segmentation,
            enable_demo_mode=settings.enable_demo_mode,
        )
        logger.info(f"Model loaded: {inference_engine.model_info}")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        if not settings.enable_demo_mode:
            raise
    
    # Initialize tracker
    if settings.enable_tracking:
        tracker = ObjectTracker(
            min_detection_frames=settings.track_min_detection_frames,
            timeout=settings.track_timeout,
            dedup_distance=settings.track_dedup_distance,
            min_confidence=settings.track_min_confidence,
        )
    
    # Initialize severity estimator
    severity_estimator = SeverityEstimator(config_path=settings.severity_config_path)
    
    # Initialize video processor
    video_processor = VideoProcessor(
        inference_engine=inference_engine,
        tracker=tracker,
        severity_estimator=severity_estimator,
        job_manager=job_manager,
    )
    
    logger.info("AI Service started successfully")
    
    yield
    
    # Cleanup
    logger.info("Shutting down AI Service...")
    if job_manager:
        await job_manager.shutdown()


app = FastAPI(
    title="SmartPothole AI Service",
    description="AI-powered pothole detection and severity estimation API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def verify_secret(request: Request):
    """Verify the shared secret sent by the frontend via X-AI-Service-Secret."""
    if not settings.ai_service_secret:
        return True
    provided = request.headers.get("X-AI-Service-Secret")
    if not provided:
        raise HTTPException(status_code=401, detail="API secret required")
    if provided != settings.ai_service_secret:
        raise HTTPException(status_code=401, detail="Invalid API secret")
    return True


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    # In demo mode there is no real model, but the service is functional —
    # model_info.name reports "DEMO-MockDetector" so clients can label results.
    model_loaded = inference_engine is not None and (
        inference_engine.model is not None or settings.enable_demo_mode
    )
    
    return HealthResponse(
        status="healthy" if model_loaded else "degraded",
        model_loaded=model_loaded,
        model_info=inference_engine.model_info if inference_engine else None,
        uptime_seconds=time.time() - app.state.start_time if hasattr(app.state, 'start_time') else 0,
        gpu_available=inference_engine.device.type == "cuda" if inference_engine else False,
        memory_usage_mb=0,  # Would need psutil to get actual memory
    )


@app.get("/ready")
async def readiness_check():
    """Readiness check for Kubernetes"""
    model_loaded = inference_engine is not None and (
        inference_engine.model is not None or settings.enable_demo_mode
    )
    return {"ready": model_loaded, "model_loaded": model_loaded}


@app.get("/model", response_model=ModelInfo)
async def get_model_info():
    """Get model information"""
    if not inference_engine:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return inference_engine.model_info


@app.post("/predict/image", response_model=DetectionResponse)
async def predict_image(
    file: UploadFile = File(...),
    confidence_threshold: Optional[float] = Form(None),
    iou_threshold: Optional[float] = Form(None),
    return_annotated: bool = Form(False),
    _: bool = Depends(verify_secret),
):
    """Single image detection"""
    if not inference_engine:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    # Validate file
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    if file.size and file.size > settings.max_upload_size:
        raise HTTPException(status_code=413, detail="File too large")
    
    try:
        # Load image
        image = await load_image_from_upload(file)
        
        # Run inference
        start_time = time.time()
        detections = inference_engine.predict(
            image,
            confidence_threshold=confidence_threshold if confidence_threshold is not None else settings.confidence_threshold,
            iou_threshold=iou_threshold if iou_threshold is not None else settings.iou_threshold,
        )
        latency_ms = int((time.time() - start_time) * 1000)

        # Estimate severity for each detection
        for det in detections:
            if severity_estimator:
                det.severity = severity_estimator.estimate(
                    bbox=det.bbox,
                    segmentation=det.segmentation,
                    confidence=det.confidence,
                    image_width=image.shape[1],
                    image_height=image.shape[0],
                )
        
        # Generate annotated image if requested
        annotated_base64 = None
        if return_annotated and detections:
            annotated = inference_engine.draw_detections(image, detections)
            annotated_base64 = image_to_base64(annotated)
        
        return DetectionResponse(
            detections=detections,
            model=inference_engine.model_info,
            processing={
                "latency_ms": latency_ms,
                "image_width": image.shape[1],
                "image_height": image.shape[0],
            },
            annotated_image=annotated_base64,
        )
        
    except Exception as e:
        logger.error(f"Image prediction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Image prediction failed")


@app.post("/predict/frame", response_model=DetectionResponse)
async def predict_frame(
    request: Request,
    _: bool = Depends(verify_secret),
):
    """Single frame detection (for live camera). Accepts JSON:
    { image_base64, timestamp, confidence_threshold?, iou_threshold? }"""
    if not inference_engine:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    image_base64 = body.get("image_base64")
    if not image_base64:
        raise HTTPException(status_code=400, detail="image_base64 is required")
    confidence_threshold = body.get("confidence_threshold")
    iou_threshold = body.get("iou_threshold")
    track = bool(body.get("track", False))
    timestamp = int(body.get("timestamp") or (time.time() * 1000))

    try:
        # Decode base64 image
        image = base64_to_image(image_base64)

        # Run inference
        start_time = time.time()
        detections = inference_engine.predict(
            image,
            confidence_threshold=confidence_threshold if confidence_threshold is not None else settings.confidence_threshold,
            iou_threshold=iou_threshold if iou_threshold is not None else settings.iou_threshold,
        )
        latency_ms = int((time.time() - start_time) * 1000)

        # Apply tracking if requested
        if track and tracker:
            detections = tracker.update(detections, timestamp)

        # Estimate severity
        for det in detections:
            if severity_estimator:
                det.severity = severity_estimator.estimate(
                    bbox=det.bbox,
                    segmentation=det.segmentation,
                    confidence=det.confidence,
                    image_width=image.shape[1],
                    image_height=image.shape[0],
                    track_history=tracker.get_track_history(det.track_id) if tracker and det.track_id else None,
                )

        return DetectionResponse(
            detections=detections,
            model=inference_engine.model_info,
            processing={
                "latency_ms": latency_ms,
                "image_width": image.shape[1],
                "image_height": image.shape[0],
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Frame prediction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Frame prediction failed")


@app.post("/track/frame", response_model=DetectionResponse)
async def track_frame(
    request: Request,
    _: bool = Depends(verify_secret),
):
    """Frame detection with tracking. Accepts the same JSON body as
    /predict/frame — tracking is always applied."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    body["track"] = True
    # Re-dispatch with a synthetic JSON body
    async def json_body():
        return body
    original = request.json
    request.json = json_body  # type: ignore[method-assign]
    try:
        return await predict_frame(request, _=True)
    finally:
        request.json = original  # type: ignore[method-assign]


@app.post("/predict/video", response_model=VideoJobResponse)
async def predict_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    confidence_threshold: Optional[float] = Form(None),
    iou_threshold: Optional[float] = Form(None),
    inference_fps: int = Form(5),
    return_annotated: bool = Form(True),
    _: bool = Depends(verify_secret),
):
    """Start async video processing job"""
    if not video_processor:
        raise HTTPException(status_code=503, detail="Video processor not available")
    
    # Validate file
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")
    
    if file.size and file.size > settings.max_upload_size:
        raise HTTPException(status_code=413, detail="File too large")
    
    # Create job
    job_id = str(uuid.uuid4())
    job = await job_manager.create_job(
        job_id=job_id,
        job_type="video",
        input_file=file,
        params={
            "confidence_threshold": confidence_threshold if confidence_threshold is not None else settings.confidence_threshold,
            "iou_threshold": iou_threshold if iou_threshold is not None else settings.iou_threshold,
            "inference_fps": inference_fps,
            "return_annotated": return_annotated,
        },
    )
    
    # Start processing in background
    background_tasks.add_task(
        video_processor.process_video,
        job_id=job_id,
        file=file,
        confidence_threshold=confidence_threshold if confidence_threshold is not None else settings.confidence_threshold,
        iou_threshold=iou_threshold if iou_threshold is not None else settings.iou_threshold,
        inference_fps=inference_fps,
        return_annotated=return_annotated,
    )
    
    return VideoJobResponse(job_id=job_id, status="queued")


@app.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str, _: bool = Depends(verify_secret)):
    """Get video processing job status"""
    if not job_manager:
        raise HTTPException(status_code=503, detail="Job manager not available")
    
    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return job


@app.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, _: bool = Depends(verify_secret)):
    """Cancel a processing job"""
    if not job_manager:
        raise HTTPException(status_code=503, detail="Job manager not available")

    success = await job_manager.cancel_job(job_id)
    return {"cancelled": success}


@app.get("/jobs/{job_id}/result")
async def get_job_result(job_id: str, _: bool = Depends(verify_secret)):
    """Download the annotated video produced by a completed job"""
    if not job_manager:
        raise HTTPException(status_code=503, detail="Job manager not available")

    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "completed":
        raise HTTPException(status_code=409, detail=f"Job is {job.status}, not completed")

    result_file = job_manager.result_files.get(job_id)
    if not result_file or not Path(result_file).exists():
        raise HTTPException(status_code=404, detail="Annotated result not available for this job")

    return FileResponse(
        result_file,
        media_type="video/mp4",
        filename=f"annotated-{job_id}.mp4",
    )


@app.post("/severity", response_model=Severity)
async def estimate_severity(
    request: SeverityRequest,
    _: bool = Depends(verify_secret),
):
    """Estimate severity from detection features"""
    if not severity_estimator:
        raise HTTPException(status_code=503, detail="Severity estimator not available")
    
    severity = severity_estimator.estimate(
        bbox=request.bbox,
        segmentation=request.segmentation,
        confidence=request.confidence,
        image_width=request.image_width,
        image_height=request.image_height,
        track_history=request.track_history,
    )
    
    return severity


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            error=exc.detail,
            status_code=exc.status_code,
        ).model_dump(),
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            error="Internal server error",
            status_code=500,
        ).model_dump(),
    )


if __name__ == "__main__":
    app.state.start_time = time.time()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        workers=settings.workers,
        log_level=settings.log_level,
        reload=True,
    )