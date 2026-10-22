import yaml
import numpy as np
import cv2
from typing import Optional, List, Dict, Any
from pathlib import Path
import logging

from app.schemas import Severity, BoundingBox, SegmentationMask
from app.config import settings

logger = logging.getLogger(__name__)


class SeverityEstimator:
    """Estimate pothole severity from visual features"""
    
    def __init__(self, config_path: str = "/app/config/severity_config.yaml"):
        self.config_path = Path(config_path)
        self.config = self._load_config()
        self.demo_mode = settings.enable_demo_mode
    
    def _load_config(self) -> dict:
        """Load severity configuration from YAML"""
        default_config = {
            # Weights when a segmentation mask is available (sum to 1.0)
            "weights_seg": {
                "segmentation_area": 0.30,
                "bbox_area": 0.20,
                "proximity": 0.10,
                "aspect_ratio": 0.10,
                "shape_irregularity": 0.10,
                "confidence": 0.10,
                "temporal_persistence": 0.10,
            },
            # Weights for bbox-only detections (detect models). Calibrated on
            # the pothole val split so severity tracks visual size + proximity
            # (see ml/TRAINING_RESULTS.md). Weights renormalize automatically
            # when temporal evidence is absent (single images).
            "weights_bbox_only": {
                "bbox_area": 0.45,
                "proximity": 0.20,
                "confidence": 0.15,
                "aspect_ratio": 0.10,
                "temporal_persistence": 0.10,
            },
            "thresholds": {
                "LOW": 0.0,
                "MODERATE": 0.30,
                "HIGH": 0.55,
                "CRITICAL": 0.80,
            },
            "severity_confidence": {
                "min_frames_for_high_confidence": 5,
                "confidence_boost_per_frame": 0.05,
                "max_confidence": 0.95,
            },
            "feature_extraction": {
                "min_contour_area": 100,
                "contour_epsilon_factor": 0.02,
                "min_segmentation_ratio": 0.001,
                "max_segmentation_ratio": 0.5,
                # Fraction of image area that maps to feature value 1.0
                "area_full_scale": 0.35,
            },
            "temporal": {
                "smoothing_window": 5,
                "latest_weight": 0.6,
                "min_frames_for_severe": 3,
            },
            "demo_mode": {
                "enabled": False,
                "fixed_severity": "MODERATE",
                "fixed_score": 0.5,
                "add_random_variance": 0.1,
            }
        }
        
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r') as f:
                    loaded = yaml.safe_load(f)
                    if loaded:
                        for key, value in loaded.items():
                            if key in default_config and isinstance(default_config[key], dict):
                                default_config[key].update(value)
                            else:
                                default_config[key] = value
            except Exception as e:
                logger.warning(f"Failed to load severity config: {e}, using defaults")
        
        return default_config
    
    def estimate(
        self,
        bbox: BoundingBox,
        segmentation: Optional[SegmentationMask],
        confidence: float,
        image_width: int,
        image_height: int,
        track_history: Optional[List[Dict[str, Any]]] = None,
    ) -> Severity:
        """Estimate severity from detection features"""

        if self.demo_mode and self.config["demo_mode"]["enabled"]:
            return self._demo_severity()

        features = self._extract_features(bbox, segmentation, confidence, image_width, image_height, track_history)

        # Feature weights depend on what evidence exists for this detection:
        # - with a segmentation mask: full weight set
        # - bbox-only (detect models): the bbox_only weights, which lean on
        #   visual size + proximity (vertical position as a distance proxy)
        has_seg = bool(segmentation and segmentation.area > 0)
        weights = dict(self.config["weights_seg"] if has_seg else self.config["weights_bbox_only"])

        # Renormalize over features that are actually available so a single
        # image (no track history) is not penalized for missing evidence.
        if not track_history:
            weights.pop("temporal_persistence", None)
        total_weight = sum(weights.values()) or 1.0
        severity_score = sum(w * features[k] for k, w in weights.items()) / total_weight
        severity_score = float(np.clip(severity_score, 0.0, 1.0))

        thresholds = self.config["thresholds"]
        if severity_score >= thresholds["CRITICAL"]:
            level = "CRITICAL"
        elif severity_score >= thresholds["HIGH"]:
            level = "HIGH"
        elif severity_score >= thresholds["MODERATE"]:
            level = "MODERATE"
        else:
            level = "LOW"

        severity_confidence = self._calculate_severity_confidence(features, track_history, severity_score, has_seg)
        reasons = self._generate_reasons(features, track_history)

        return Severity(
            level=level,
            score=float(severity_score),
            confidence=float(severity_confidence),
            reasons=reasons,
        )

    def _extract_features(
        self,
        bbox: BoundingBox,
        segmentation: Optional[SegmentationMask],
        confidence: float,
        image_width: int,
        image_height: int,
        track_history: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, float]:
        image_area = image_width * image_height

        bbox_area = (bbox.x2 - bbox.x1) * (bbox.y2 - bbox.y1)
        bbox_ratio = np.clip(bbox_area / image_area, 0, 1)

        # Proximity cue: a pothole at the bottom of the frame is close to the
        # camera, so the same on-screen size means a physically larger hole.
        center_y = (bbox.y1 + bbox.y2) / 2 / max(image_height, 1)
        proximity = np.clip((center_y - 0.30) / 0.60, 0, 1)

        seg_ratio = 0.0
        shape_irregularity = 0.0

        if segmentation and segmentation.area > 0:
            seg_ratio = np.clip(segmentation.area / image_area, 0, 1)

            if segmentation.points and len(segmentation.points) >= 3:
                shape_irregularity = self._calculate_shape_irregularity(segmentation.points)

        bbox_width = bbox.x2 - bbox.x1
        bbox_height = bbox.y2 - bbox.y1
        if bbox_height > 0:
            aspect = bbox_width / bbox_height
            aspect_ratio = min(aspect, 1/aspect)
            aspect_ratio = 1.0 - aspect_ratio
        else:
            aspect_ratio = 0.0

        # A detection confirmed across many frames is more likely a real,
        # persistent pothole (live/video only; 10+ frames = full credit)
        temporal_persistence = np.clip(len(track_history) / 10.0, 0, 1) if track_history else 0.0

        fe = self.config["feature_extraction"]
        return {
            # Area features are scaled so the worst realistic close-range
            # case maps to 1.0 (not the whole image area).
            "segmentation_area": np.clip(
                seg_ratio / fe.get("seg_area_full_scale", 0.35), 0, 1
            ),
            "bbox_area": np.clip(
                bbox_ratio / fe["area_full_scale"], 0, 1
            ),
            "proximity": proximity,
            "aspect_ratio": np.clip(aspect_ratio, 0, 1),
            "shape_irregularity": np.clip(shape_irregularity, 0, 1),
            "confidence": confidence,
            "temporal_persistence": temporal_persistence,
        }
    
    def _calculate_shape_irregularity(self, points: List[List[float]]) -> float:
        try:
            pts = np.array(points, dtype=np.float32)
            hull = cv2.convexHull(pts)
            hull_area = cv2.contourArea(hull)
            contour_area = cv2.contourArea(pts)
            
            if hull_area > 0:
                solidity = contour_area / hull_area
                return 1.0 - solidity
        except Exception:
            pass
        
        return 0.0
    
    def _calculate_severity_confidence(
        self,
        features: Dict[str, float],
        track_history: Optional[List[Dict[str, Any]]],
        severity_score: float,
        has_segmentation: bool = False,
    ) -> float:
        base_confidence = 0.5

        if has_segmentation:
            base_confidence += 0.1
        if features["bbox_area"] > 0.02:
            base_confidence += 0.1
        if features["confidence"] > 0.7:
            base_confidence += 0.1
        
        if track_history:
            frames = len(track_history)
            min_frames = self.config["severity_confidence"]["min_frames_for_high_confidence"]
            boost_per_frame = self.config["severity_confidence"]["confidence_boost_per_frame"]
            max_conf = self.config["severity_confidence"]["max_confidence"]
            
            if frames >= min_frames:
                base_confidence = min(max_conf, base_confidence + (frames - min_frames + 1) * boost_per_frame)
        
        if severity_score > 0.9 or severity_score < 0.1:
            base_confidence *= 0.8
        
        return np.clip(base_confidence, 0.0, 1.0)
    
    def _generate_reasons(
        self,
        features: Dict[str, float],
        track_history: Optional[List[Dict[str, Any]]],
    ) -> List[str]:
        reasons = []

        if features["segmentation_area"] > 0.3:
            reasons.append("large segmented area")
        elif features["segmentation_area"] > 0.15:
            reasons.append("moderate segmented area")

        if features["bbox_area"] > 0.3:
            reasons.append("very large in frame")
        elif features["bbox_area"] > 0.1:
            reasons.append("large in frame")

        if features["proximity"] > 0.6:
            reasons.append("close to camera")

        if features["aspect_ratio"] > 0.5:
            reasons.append("irregular aspect ratio")

        if features["shape_irregularity"] > 0.3:
            reasons.append("highly irregular shape")

        if features["confidence"] > 0.8:
            reasons.append("high detection confidence")

        if track_history and len(track_history) >= 3:
            reasons.append(f"persistent across {len(track_history)} frames")

        if not reasons:
            reasons.append("small/distant in frame")

        return reasons
    
    def _demo_severity(self) -> Severity:
        demo = self.config["demo_mode"]
        import random
        
        base_score = demo["fixed_score"]
        if demo["add_random_variance"] > 0:
            base_score += random.uniform(-demo["add_random_variance"], demo["add_random_variance"])
            base_score = np.clip(base_score, 0, 1)
        
        return Severity(
            level=demo["fixed_severity"],
            score=base_score,
            confidence=0.7,
            reasons=["DEMO MODE - not a real severity estimate"],
        )