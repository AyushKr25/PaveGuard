import numpy as np
from typing import List, Optional, Dict, Any
from collections import defaultdict, deque
import time
import uuid

from app.schemas import Detection, BoundingBox


class Track:
    """Single track representation"""
    
    def __init__(self, track_id: str, detection: Detection, timestamp: int):
        self.track_id = track_id
        self.detections = deque([detection], maxlen=100)
        self.first_seen = timestamp
        self.last_seen = timestamp
        self.frame_count = 1
        self.confidence_history = deque([detection.confidence], maxlen=100)
        self.bbox_history = deque([detection.bbox], maxlen=100)
        self.mask_history = deque([detection.segmentation], maxlen=100) if detection.segmentation else deque(maxlen=100)
        self.severity_history = deque([detection.severity], maxlen=100) if detection.severity else deque(maxlen=100)
    
    def update(self, detection: Detection, timestamp: int):
        """Update track with new detection"""
        self.detections.append(detection)
        self.last_seen = timestamp
        self.frame_count += 1
        self.confidence_history.append(detection.confidence)
        self.bbox_history.append(detection.bbox)
        if detection.segmentation:
            self.mask_history.append(detection.segmentation)
        if detection.severity:
            self.severity_history.append(detection.severity)
    
    def get_average_bbox(self) -> BoundingBox:
        """Get average bounding box"""
        if not self.bbox_history:
            return BoundingBox(x1=0, y1=0, x2=0, y2=0)
        
        boxes = list(self.bbox_history)
        return BoundingBox(
            x1=np.mean([b.x1 for b in boxes]),
            y1=np.mean([b.y1 for b in boxes]),
            x2=np.mean([b.x2 for b in boxes]),
            y2=np.mean([b.y2 for b in boxes]),
        )
    
    def get_average_confidence(self) -> float:
        """Get average confidence"""
        if not self.confidence_history:
            return 0.0
        return np.mean(list(self.confidence_history))
    
    def get_severity_mode(self) -> str:
        """Get most common severity level"""
        if not self.severity_history:
            return "LOW"
        
        levels = [s.level for s in self.severity_history if s]
        if not levels:
            return "LOW"
        
        return max(set(levels), key=levels.count)


class ObjectTracker:
    """Object tracker for pothole detections across frames"""
    
    def __init__(
        self,
        min_detection_frames: int = 3,
        timeout: int = 30,
        dedup_distance: int = 50,
        min_confidence: float = 0.3,
    ):
        self.min_detection_frames = min_detection_frames
        self.timeout = timeout  # frames
        self.dedup_distance = dedup_distance  # pixels
        self.min_confidence = min_confidence
        
        self.tracks: Dict[str, Track] = {}
        self.next_track_id = 0
        self.frame_count = 0
    
    def update(self, detections: List[Detection], timestamp: int) -> List[Detection]:
        """Update tracks with new detections"""
        self.frame_count += 1
        
        # Filter low confidence detections
        valid_detections = [d for d in detections if d.confidence >= self.min_confidence]
        
        # Match detections to existing tracks
        matched_tracks = set()
        matched_detections = set()
        
        for track_id, track in list(self.tracks.items()):
            if self.frame_count - track.last_seen > self.timeout:
                # Track expired
                del self.tracks[track_id]
                continue
            
            # Find best matching detection
            best_match = None
            best_dist = float('inf')
            
            track_center = self._bbox_center(track.get_average_bbox())
            
            for i, det in enumerate(valid_detections):
                if i in matched_detections:
                    continue
                
                det_center = self._bbox_center(det.bbox)
                dist = np.sqrt((track_center[0] - det_center[0])**2 + (track_center[1] - det_center[1])**2)
                
                if dist < self.dedup_distance and dist < best_dist:
                    best_dist = dist
                    best_match = i
            
            if best_match is not None:
                # Update track
                track.update(valid_detections[best_match], timestamp)
                valid_detections[best_match].track_id = track_id
                matched_tracks.add(track_id)
                matched_detections.add(best_match)
        
        # Create new tracks for unmatched detections
        for i, det in enumerate(valid_detections):
            if i not in matched_detections:
                track_id = f"track_{self.next_track_id}"
                self.next_track_id += 1
                self.tracks[track_id] = Track(track_id, det, timestamp)
                det.track_id = track_id
        
        # Filter detections: only return those with confirmed tracks
        confirmed_detections = []
        for det in valid_detections:
            if det.track_id and det.track_id in self.tracks:
                track = self.tracks[det.track_id]
                if track.frame_count >= self.min_detection_frames:
                    # Use track-averaged values for stability
                    det.bbox = track.get_average_bbox()
                    det.confidence = track.get_average_confidence()
                    confirmed_detections.append(det)
        
        return confirmed_detections
    
    def _bbox_center(self, bbox: BoundingBox) -> tuple:
        return ((bbox.x1 + bbox.x2) / 2, (bbox.y1 + bbox.y2) / 2)
    
    def get_track_history(self, track_id: str) -> Optional[List[Dict[str, Any]]]:
        """Get track history for severity estimation"""
        if track_id not in self.tracks:
            return None
        
        track = self.tracks[track_id]
        history = []
        
        for i, det in enumerate(track.detections):
            history.append({
                "bbox": det.bbox.model_dump(),
                "confidence": det.confidence,
                "severity": det.severity.model_dump() if det.severity else None,
                "timestamp": track.first_seen + i * 100,  # approximate
                "frame_number": i,
            })
        
        return history
    
    def get_active_tracks(self) -> Dict[str, Track]:
        """Get all active tracks"""
        return {tid: track for tid, track in self.tracks.items() 
                if self.frame_count - track.last_seen <= self.timeout}
    
    def reset(self):
        """Reset tracker"""
        self.tracks.clear()
        self.next_track_id = 0
        self.frame_count = 0