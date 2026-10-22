import cv2
import numpy as np
import torch
import time
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
import warnings

from app.schemas import ModelInfo, Detection, BoundingBox, SegmentationMask
from app.config import settings

logger = logging.getLogger(__name__)

# Suppress ultralytics logging
logging.getLogger("ultralytics").setLevel(logging.WARNING)


class InferenceEngine:
    """YOLO inference engine for pothole detection"""
    
    def __init__(
        self,
        model_path: str,
        model_type: str = "segmentation",
        device: str = "auto",
        half_precision: bool = True,
        image_size: int = 640,
        confidence_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        enable_segmentation: bool = True,
        enable_demo_mode: bool = False,
    ):
        self.model_path = Path(model_path)
        self.model_type = model_type
        self.device = self._resolve_device(device)
        self.half_precision = half_precision and self.device.type == "cuda"
        self.image_size = image_size
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold
        self.enable_segmentation = enable_segmentation
        self.enable_demo_mode = enable_demo_mode
        
        self.model = None
        self.model_names = []
        self._load_model()
    
    def _resolve_device(self, device: str) -> torch.device:
        """Resolve device string to torch.device"""
        if device == "auto":
            if torch.cuda.is_available():
                return torch.device("cuda:0")
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                return torch.device("mps")
            return torch.device("cpu")
        return torch.device(device)
    
    def _load_model(self):
        """Load YOLO model"""
        # Demo mode: explicitly enabled via ENABLE_DEMO_MODE=true. Runs a mock
        # detector so the pipeline can be exercised without trained weights.
        # Results are clearly labeled DEMO and are NOT real detections.
        if self.enable_demo_mode:
            logger.warning(
                "DEMO MODE enabled: no real model will be loaded. "
                "All results are mock detections labeled DEMO."
            )
            self.model = None
            self.model_names = ["pothole"]
            return

        try:
            from ultralytics import YOLO

            # Check if model file exists
            if not self.model_path.exists():
                raise FileNotFoundError(
                    f"Model weights not found at {self.model_path}. "
                    f"Please place your trained model (best.pt) in the models directory. "
                    f"Set ENABLE_DEMO_MODE=true to run without custom weights."
                )
            
            logger.info(f"Loading model from {self.model_path} on {self.device}")
            self.model = YOLO(str(self.model_path))
            self.model.to(self.device)
            
            if self.half_precision:
                self.model.model.half()
            
            # Warmup
            dummy = np.zeros((self.image_size, self.image_size, 3), dtype=np.uint8)
            _ = self.model(dummy, verbose=False, device=self.device)

            names = self.model.names if hasattr(self.model, "names") else ["pothole"]
            # Ultralytics >= 8.x returns {class_idx: name}; normalize to a list
            if isinstance(names, dict):
                names = [names[k] for k in sorted(names)]
            self.model_names = names
            logger.info(f"Model loaded successfully. Classes: {self.model_names}")
            
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise
    
    @property
    def model_info(self) -> ModelInfo:
        if self.model is None:
            return ModelInfo(
                name="DEMO-MockDetector",
                version=settings.model_version,
                task=self.model_type,
                weights_path="none (demo mode)",
                device=str(self.device),
                half_precision=False,
                image_size=self.image_size,
                confidence_threshold=self.confidence_threshold,
                iou_threshold=self.iou_threshold,
                classes=["pothole (DEMO)"],
            )
        return ModelInfo(
            name="YOLO",
            version=settings.model_version,
            task=self.model_type,
            weights_path=str(self.model_path),
            device=str(self.device),
            half_precision=self.half_precision,
            image_size=self.image_size,
            confidence_threshold=self.confidence_threshold,
            iou_threshold=self.iou_threshold,
            classes=self.model_names,
        )
    
    def predict(
        self,
        image: np.ndarray,
        confidence_threshold: Optional[float] = None,
        iou_threshold: Optional[float] = None,
    ) -> List[Detection]:
        """Run inference on image"""
        if self.model is None:
            return self._mock_detections(
                image,
                confidence_threshold=confidence_threshold if confidence_threshold is not None else self.confidence_threshold,
            )

        conf = confidence_threshold if confidence_threshold is not None else self.confidence_threshold
        iou = iou_threshold if iou_threshold is not None else self.iou_threshold
        
        # Run inference
        results = self.model(
            image,
            conf=conf,
            iou=iou,
            imgsz=self.image_size,
            device=self.device,
            verbose=False,
            half=self.half_precision,
        )
        
        return self._parse_results(results[0], image.shape[:2])
    
    def _parse_results(self, result, image_shape) -> List[Detection]:
        """Parse YOLO results into Detection objects"""
        detections = []
        h, w = image_shape
        
        if result.boxes is None or len(result.boxes) == 0:
            return detections
        
        boxes = result.boxes.xyxy.cpu().numpy()
        confs = result.boxes.conf.cpu().numpy()
        classes = result.boxes.cls.cpu().numpy().astype(int)
        
        # Get masks if available
        masks = None
        if self.enable_segmentation and result.masks is not None:
            masks = result.masks.xy
        
        for i, (box, conf, cls) in enumerate(zip(boxes, confs, classes)):
            x1, y1, x2, y2 = box
            
            # Clamp to image bounds
            x1 = max(0, min(x1, w))
            y1 = max(0, min(y1, h))
            x2 = max(0, min(x2, w))
            y2 = max(0, min(y2, h))
            
            class_name = self.model_names[cls] if cls < len(self.model_names) else f"class_{cls}"
            
            # Parse segmentation mask
            segmentation = None
            if masks is not None and i < len(masks):
                mask_points = masks[i]
                if len(mask_points) > 0:
                    # Calculate mask area
                    mask_area = cv2.contourArea(mask_points.astype(np.float32))
                    segmentation = SegmentationMask(
                        points=mask_points.tolist(),
                        area=float(mask_area),
                    )
            
            detections.append(Detection(
                id=f"det_{i}_{int(time.time()*1000)}",
                class_name=class_name,
                confidence=float(conf),
                bbox=BoundingBox(x1=float(x1), y1=float(y1), x2=float(x2), y2=float(y2)),
                segmentation=segmentation,
                severity=None,  # Will be filled by severity estimator
            ))
        
        return detections
    
    def _mock_detections(
        self,
        image: np.ndarray,
        confidence_threshold: Optional[float] = None,
    ) -> List[Detection]:
        """Generate mock detections for demo mode.

        Respects the caller's confidence threshold so DEMO results behave
        consistently with real inference when thresholds change.
        """
        h, w = image.shape[:2]

        import random
        jitter_x = random.uniform(-0.03, 0.03)
        jitter_y = random.uniform(-0.03, 0.03)
        confidence = 0.85
        threshold = confidence_threshold if confidence_threshold is not None else self.confidence_threshold
        if confidence < threshold:
            return []
        detections = [
            Detection(
                id=f"demo_{int(time.time()*1000)}",
                class_name="pothole (DEMO)",
                confidence=0.85,
                bbox=BoundingBox(
                    x1=w * (0.3 + jitter_x), y1=h * (0.3 + jitter_y),
                    x2=w * (0.7 + jitter_x), y2=h * (0.7 + jitter_y)
                ),
                segmentation=SegmentationMask(
                    points=[
                        [w * (0.3 + jitter_x), h * (0.3 + jitter_y)], [w * (0.7 + jitter_x), h * (0.3 + jitter_y)],
                        [w * (0.7 + jitter_x), h * (0.7 + jitter_y)], [w * (0.3 + jitter_x), h * (0.7 + jitter_y)]
                    ],
                    area=(w * 0.4) * (h * 0.4)
                ),
                severity=None,
            )
        ]
        return detections
    
    def draw_detections(self, image: np.ndarray, detections: List[Detection]) -> np.ndarray:
        """Draw detection boxes and masks on image"""
        annotated = image.copy()
        
        for det in detections:
            x1, y1, x2, y2 = int(det.bbox.x1), int(det.bbox.y1), int(det.bbox.x2), int(det.bbox.y2)
            
            # Color based on severity
            if det.severity:
                level = det.severity.level
                if level == "LOW":
                    color = (0, 255, 0)
                elif level == "MODERATE":
                    color = (0, 255, 255)
                elif level == "HIGH":
                    color = (0, 165, 255)
                else:  # CRITICAL
                    color = (0, 0, 255)
            else:
                color = (0, 255, 0)
            
            # Draw bounding box
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 3)
            
            # Draw segmentation mask
            if det.segmentation and det.segmentation.points:
                pts = np.array(det.segmentation.points, dtype=np.int32)
                cv2.polylines(annotated, [pts], True, color, 2)
                # Fill with transparency
                overlay = annotated.copy()
                cv2.fillPoly(overlay, [pts], color)
                cv2.addWeighted(overlay, 0.3, annotated, 0.7, 0, annotated)
            
            # Draw label
            label = f"{det.class_name} {det.confidence:.2f}"
            if det.severity:
                label += f" {det.severity.level}"
            
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
            cv2.rectangle(annotated, (x1, y1 - th - 10), (x1 + tw + 10, y1), color, -1)
            cv2.putText(annotated, label, (x1 + 5, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            
            # Draw track ID if available
            if det.track_id:
                track_label = f"ID: {det.track_id[-6:]}"
                cv2.putText(annotated, track_label, (x1, y2 + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        return annotated
    
    def export_onnx(self, output_path: str) -> bool:
        """Export model to ONNX format"""
        if self.model is None:
            return False
        
        try:
            self.model.export(format="onnx", imgsz=self.image_size, half=self.half_precision)
            logger.info(f"Model exported to ONNX: {output_path}")
            return True
        except Exception as e:
            logger.error(f"ONNX export failed: {e}")
            return False