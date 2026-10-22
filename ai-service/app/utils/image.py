import cv2
import numpy as np
import base64
from typing import Optional
from fastapi import UploadFile
import logging

logger = logging.getLogger(__name__)


async def load_image_from_upload(file: UploadFile) -> np.ndarray:
    """Load image from uploaded file"""
    content = await file.read()
    nparr = np.frombuffer(content, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if image is None:
        raise ValueError("Could not decode image")
    
    return image


def image_to_base64(image: np.ndarray, format: str = ".jpg", quality: int = 85) -> str:
    """Convert image to base64 string"""
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality] if format == ".jpg" else []
    success, buffer = cv2.imencode(format, image, encode_params)
    
    if not success:
        raise ValueError("Could not encode image")
    
    return base64.b64encode(buffer).decode('utf-8')


def base64_to_image(base64_string: str) -> np.ndarray:
    """Convert base64 string to image"""
    # Remove data URL prefix if present
    if base64_string.startswith('data:image'):
        base64_string = base64_string.split(',', 1)[1]
    
    try:
        decoded = base64.b64decode(base64_string)
        nparr = np.frombuffer(decoded, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            raise ValueError("Could not decode base64 image")
        
        return image
    except Exception as e:
        raise ValueError(f"Invalid base64 image: {e}")


def resize_image(image: np.ndarray, max_width: int, max_height: int) -> np.ndarray:
    """Resize image maintaining aspect ratio"""
    h, w = image.shape[:2]
    
    if w <= max_width and h <= max_height:
        return image
    
    scale = min(max_width / w, max_height / h)
    new_w = int(w * scale)
    new_h = int(h * scale)
    
    return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)


def draw_bounding_box(
    image: np.ndarray,
    bbox,
    label: str,
    color: tuple = (0, 255, 0),
    thickness: int = 2,
) -> np.ndarray:
    """Draw bounding box with label on image"""
    x1, y1, x2, y2 = map(int, [bbox.x1, bbox.y1, bbox.x2, bbox.y2])
    
    # Draw rectangle
    cv2.rectangle(image, (x1, y1), (x2, y2), color, thickness)
    
    # Draw label background
    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
    cv2.rectangle(image, (x1, y1 - th - 8), (x1 + tw + 8, y1), color, -1)
    
    # Draw label text
    cv2.putText(image, label, (x1 + 4, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    
    return image


def draw_segmentation_mask(
    image: np.ndarray,
    points: list,
    color: tuple = (0, 255, 0),
    alpha: float = 0.3,
) -> np.ndarray:
    """Draw segmentation mask on image"""
    if not points:
        return image
    
    pts = np.array(points, dtype=np.int32)
    
    # Create overlay
    overlay = image.copy()
    cv2.fillPoly(overlay, [pts], color)
    cv2.addWeighted(overlay, alpha, image, 1 - alpha, 0, image)
    
    # Draw outline
    cv2.polylines(image, [pts], True, color, 2)
    
    return image