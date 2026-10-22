import pytest
import numpy as np
from app.severity.estimator import SeverityEstimator
from app.schemas import BoundingBox, SegmentationMask


@pytest.fixture
def estimator():
    return SeverityEstimator(config_path="/app/config/severity_config.yaml")


@pytest.fixture
def sample_bbox():
    return BoundingBox(x1=100, y1=100, x2=300, y2=300)


@pytest.fixture
def sample_segmentation():
    points = [[100, 100], [300, 100], [300, 300], [100, 300]]
    return SegmentationMask(points=points, area=40000)


def test_severity_low(estimator, sample_bbox, sample_segmentation):
    """Test LOW severity for small detections"""
    # Very small bbox (1% of image)
    small_bbox = BoundingBox(x1=100, y1=100, x2=120, y2=120)
    small_seg = SegmentationMask(points=[[100,100],[120,100],[120,120],[100,120]], area=400)
    
    severity = estimator.estimate(
        bbox=small_bbox,
        segmentation=small_seg,
        confidence=0.9,
        image_width=1280,
        image_height=720,
    )
    
    assert severity.level == "LOW"
    assert severity.score < 0.35


def test_severity_moderate(estimator, sample_bbox, sample_segmentation):
    """Test MODERATE severity for medium detections"""
    # Medium bbox (5% of image)
    med_bbox = BoundingBox(x1=300, y1=200, x2=500, y2=400)
    med_seg = SegmentationMask(
        points=[[300,200],[500,200],[500,400],[300,400]], 
        area=40000
    )
    
    severity = estimator.estimate(
        bbox=med_bbox,
        segmentation=med_seg,
        confidence=0.8,
        image_width=1280,
        image_height=720,
    )
    
    assert severity.level in ["LOW", "MODERATE"]
    assert 0.0 <= severity.score <= 1.0


def test_severity_high(estimator):
    """Test HIGH severity for large detections"""
    # Large bbox (15% of image)
    large_bbox = BoundingBox(x1=200, y1=150, x2=700, y2=550)
    large_seg = SegmentationMask(
        points=[[200,150],[700,150],[700,550],[200,550]], 
        area=200000
    )
    
    severity = estimator.estimate(
        bbox=large_bbox,
        segmentation=large_seg,
        confidence=0.85,
        image_width=1280,
        image_height=720,
    )
    
    assert severity.level in ["MODERATE", "HIGH", "CRITICAL"]
    assert severity.score >= 0.35


def test_severity_critical(estimator):
    """Test CRITICAL severity for very large detections"""
    # Very large bbox (30% of image)
    huge_bbox = BoundingBox(x1=100, y1=100, x2=900, y2=600)
    huge_seg = SegmentationMask(
        points=[[100,100],[900,100],[900,600],[100,600]], 
        area=400000
    )
    
    severity = estimator.estimate(
        bbox=huge_bbox,
        segmentation=huge_seg,
        confidence=0.95,
        image_width=1280,
        image_height=720,
    )
    
    assert severity.level in ["HIGH", "CRITICAL"]
    assert severity.score >= 0.65


def test_severity_confidence_bounds(estimator, sample_bbox, sample_segmentation):
    """Test severity confidence is within bounds"""
    severity = estimator.estimate(
        bbox=sample_bbox,
        segmentation=sample_segmentation,
        confidence=0.5,
        image_width=1280,
        image_height=720,
    )
    
    assert 0.0 <= severity.confidence <= 1.0
    assert 0.0 <= severity.score <= 1.0


def test_severity_with_track_history(estimator, sample_bbox, sample_segmentation):
    """Test severity confidence increases with track history"""
    # Without track history
    severity1 = estimator.estimate(
        bbox=sample_bbox,
        segmentation=sample_segmentation,
        confidence=0.7,
        image_width=1280,
        image_height=720,
    )
    
    # With track history (5 frames)
    track_history = [
        {"bbox": {"x1": 100, "y1": 100, "x2": 300, "y2": 300}, "confidence": 0.7}
        for _ in range(5)
    ]
    
    severity2 = estimator.estimate(
        bbox=sample_bbox,
        segmentation=sample_segmentation,
        confidence=0.7,
        image_width=1280,
        image_height=720,
        track_history=track_history,
    )
    
    # Confidence should be higher with track history
    assert severity2.confidence >= severity1.confidence


def test_severity_reasons(estimator, sample_bbox, sample_segmentation):
    """Test severity reasons are generated"""
    severity = estimator.estimate(
        bbox=sample_bbox,
        segmentation=sample_segmentation,
        confidence=0.9,
        image_width=1280,
        image_height=720,
    )
    
    assert isinstance(severity.reasons, list)
    assert len(severity.reasons) > 0


def test_demo_mode(estimator):
    """Test demo mode returns fixed severity"""
    estimator.config["demo_mode"]["enabled"] = True
    estimator.demo_mode = True
    
    severity = estimator.estimate(
        bbox=BoundingBox(x1=0, y1=0, x2=100, y2=100),
        segmentation=None,
        confidence=0.5,
        image_width=640,
        image_height=480,
    )
    
    assert severity.level == "MODERATE"
    assert "DEMO MODE" in str(severity.reasons)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])