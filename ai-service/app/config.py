from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional, List
import os


class Settings(BaseSettings):
    # Model Configuration
    model_provider: str = Field(default="ultralytics", alias="AI_MODEL_PROVIDER")
    model_path: str = Field(default="/app/models/best.pt", alias="AI_MODEL_PATH")
    model_type: str = Field(default="segmentation", alias="AI_MODEL_TYPE")
    model_version: str = Field(default="v1.0.0", alias="AI_MODEL_VERSION")
    model_task: str = Field(default="segment", alias="AI_MODEL_TASK")
    
    # Inference Configuration
    confidence_threshold: float = Field(default=0.25, alias="AI_CONFIDENCE_THRESHOLD")
    iou_threshold: float = Field(default=0.45, alias="AI_IOU_THRESHOLD")
    image_size: int = Field(default=640, alias="AI_IMAGE_SIZE")
    device: str = Field(default="auto", alias="AI_DEVICE")
    half_precision: bool = Field(default=True, alias="AI_HALF_PRECISION")
    
    # Performance Profiles
    profile_fast_model: str = Field(default="yolo11n-seg.pt", alias="AI_PROFILE_FAST_MODEL")
    profile_balanced_model: str = Field(default="yolo11s-seg.pt", alias="AI_PROFILE_BALANCED_MODEL")
    profile_accuracy_model: str = Field(default="yolo11m-seg.pt", alias="AI_PROFILE_ACCURACY_MODEL")
    
    # Server Configuration
    host: str = Field(default="0.0.0.0", alias="AI_HOST")
    port: int = Field(default=8000, alias="AI_PORT")
    workers: int = Field(default=1, alias="AI_WORKERS")
    log_level: str = Field(default="info", alias="AI_LOG_LEVEL")
    max_upload_size: int = Field(default=104857600, alias="AI_MAX_UPLOAD_SIZE")
    request_timeout: int = Field(default=300, alias="AI_REQUEST_TIMEOUT")
    
    # Feature Flags
    enable_segmentation: bool = Field(default=True, alias="ENABLE_SEGMENTATION")
    enable_tracking: bool = Field(default=True, alias="ENABLE_TRACKING")
    enable_depth: bool = Field(default=False, alias="ENABLE_DEPTH")
    enable_demo_mode: bool = Field(default=False, alias="ENABLE_DEMO_MODE")
    
    # Tracking Configuration
    track_min_detection_frames: int = Field(default=3, alias="TRACK_MIN_DETECTION_FRAMES")
    track_timeout: int = Field(default=30, alias="TRACK_TIMEOUT")
    track_dedup_distance: int = Field(default=50, alias="TRACK_DEDUPLICATION_DISTANCE")
    track_min_confidence: float = Field(default=0.3, alias="TRACK_MIN_CONFIDENCE")
    
    # Severity Configuration
    severity_config_path: str = Field(default="/app/config/severity_config.yaml", alias="SEVERITY_CONFIG_PATH")
    
    # CORS
    cors_origins: List[str] = Field(default=["http://localhost:3000"], alias="AI_CORS_ORIGINS")
    
    # Security
    ai_service_secret: Optional[str] = Field(default=None, alias="AI_SERVICE_SECRET")
    
    # Paths
    models_dir: str = "/app/models"
    config_dir: str = "/app/config"
    temp_dir: str = "/app/temp"
    uploads_dir: str = "/app/uploads"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"


settings = Settings()

# Ensure directories exist
for path in [settings.models_dir, settings.config_dir, settings.temp_dir, settings.uploads_dir]:
    os.makedirs(path, exist_ok=True)