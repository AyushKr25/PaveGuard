from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from uuid import UUID


class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"x1": 100, "y1": 150, "x2": 400, "y2": 350}
        }
    )


class SegmentationMask(BaseModel):
    points: List[List[float]] = Field(default_factory=list)
    area: float = 0.0
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"points": [[100, 150], [400, 150], [400, 350], [100, 350]], "area": 50000}
        }
    )


class Severity(BaseModel):
    level: str = Field(pattern="^(LOW|MODERATE|HIGH|CRITICAL)$")
    score: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    reasons: List[str] = Field(default_factory=list)
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"level": "HIGH", "score": 0.78, "confidence": 0.71, "reasons": ["large segmented area", "persistent across multiple frames"]}
        }
    )


class Detection(BaseModel):
    id: str
    class_name: str
    confidence: float = Field(ge=0, le=1)
    bbox: BoundingBox
    segmentation: Optional[SegmentationMask] = None
    severity: Optional[Severity] = None
    track_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ModelInfo(BaseModel):
    name: str
    version: str
    task: str
    weights_path: str
    device: str
    half_precision: bool
    image_size: int
    confidence_threshold: float
    iou_threshold: float
    classes: List[str]


class ProcessingInfo(BaseModel):
    latency_ms: int
    image_width: int
    image_height: int


class DetectionResponse(BaseModel):
    detections: List[Detection]
    model: ModelInfo
    processing: ProcessingInfo
    annotated_image: Optional[str] = None


class SeverityRequest(BaseModel):
    bbox: BoundingBox
    segmentation: Optional[SegmentationMask] = None
    confidence: float = Field(ge=0, le=1)
    image_width: int
    image_height: int
    track_history: Optional[List[Dict[str, Any]]] = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_info: Optional[ModelInfo] = None
    uptime_seconds: float
    gpu_available: bool
    memory_usage_mb: float


class VideoJobRequest(BaseModel):
    confidence_threshold: Optional[float] = None
    iou_threshold: Optional[float] = None
    inference_fps: int = 5
    return_annotated: bool = True


class VideoJobResponse(BaseModel):
    job_id: str
    status: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: int = 0
    processed_frames: int = 0
    total_frames: int = 0
    detections: List[Detection] = Field(default_factory=list)
    error_message: Optional[str] = None
    result_url: Optional[str] = None


class ErrorResponse(BaseModel):
    error: str
    status_code: int
    details: Optional[Dict[str, Any]] = None