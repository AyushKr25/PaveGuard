import type { Database } from './database';

export type Json = Database['public']['Tables']['detections']['Row']['metadata'];

// Severity Levels
export type SeverityLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface Severity {
  level: SeverityLevel;
  score: number;
  confidence: number;
  reasons?: string[];
}

// Detection Types
export type DetectionType = 'image' | 'video' | 'live' | 'road_scan';
export type DetectionSource = 'camera' | 'upload' | 'dashcam' | 'mobile';
export type DetectionStatus = 'active' | 'archived' | 'flagged' | 'verified';

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SegmentationMask {
  points: number[][];
  area: number;
}

export interface Detection {
  id: string;
  class_name: string;
  confidence: number;
  bbox: BoundingBox;
  segmentation: SegmentationMask | null;
  severity: Severity;
  track_id?: string;
  metadata?: {
    frame_count?: number;
    avg_confidence?: number;
    first_frame_ms?: number;
    last_frame_ms?: number;
    [key: string]: unknown;
  };
}

export interface ModelInfo {
  name: string;
  version: string;
  task: 'detect' | 'segment' | 'classify' | 'pose';
}

export interface ProcessingInfo {
  latency_ms: number;
  image_width: number;
  image_height: number;
}

export interface AIResponse {
  detections: Detection[];
  model: ModelInfo;
  processing: ProcessingInfo;
  annotated_image?: string | null;
}

export interface DetectionRecord {
  id: string;
  user_id: string;
  session_id: string | null;
  detection_type: DetectionType;
  severity_level: SeverityLevel;
  severity_score: number;
  severity_confidence: number;
  confidence: number;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  source: DetectionSource;
  status: DetectionStatus;
  model_version_id: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface DetectionMedia {
  id: string;
  detection_id: string;
  storage_path: string;
  media_type: 'image' | 'video' | 'annotated_image' | 'annotated_video' | 'thumbnail';
  thumbnail_path: string | null;
  annotated_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface DetectionFrame {
  id: string;
  detection_id: string;
  frame_number: number;
  timestamp_ms: number;
  confidence: number;
  bbox: BoundingBox;
  mask: SegmentationMask | null;
  track_id: string | null;
  severity_level: SeverityLevel | null;
  severity_score: number | null;
  created_at: string;
}

export interface DetectionSession {
  id: string;
  user_id: string;
  session_type: 'image_batch' | 'video' | 'live' | 'road_scan';
  status: 'active' | 'completed' | 'cancelled' | 'failed';
  total_frames: number;
  processed_frames: number;
  total_detections: number;
  unique_potholes: number;
  started_at: string;
  ended_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface RoadScanSession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  status: 'active' | 'completed' | 'cancelled';
  total_detections: number;
  unique_potholes: number;
  distance_meters: number | null;
  route_geometry: GeoJSON.LineString | null;
  bbox_geometry: GeoJSON.Polygon | null;
  stats_json: Json;
  created_at: string;
  updated_at: string;
}

export interface LocationPoint {
  id: string;
  session_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: string;
  created_at: string;
}

export interface ProcessingJob {
  id: string;
  user_id: string;
  job_type: 'video' | 'batch_images' | 'export' | 'training';
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  input_path: string | null;
  output_path: string | null;
  error_message: string | null;
  result_json: Json | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Feedback {
  id: string;
  user_id: string;
  detection_id: string;
  actual_label: 'pothole' | 'not_pothole' | 'crack' | 'patch' | 'other' | null;
  actual_severity: SeverityLevel | null;
  is_correct: boolean | null;
  comment: string | null;
  created_at: string;
}

export interface Report {
  id: string;
  user_id: string;
  title: string;
  report_type: 'single_detection' | 'road_scan' | 'date_range' | 'custom';
  date_from: string | null;
  date_to: string | null;
  filters_json: Json;
  storage_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  status: 'generating' | 'ready' | 'failed';
  created_at: string;
  completed_at: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: 'USER' | 'ADMIN';
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  inference_mode: 'auto' | 'browser' | 'cloud';
  inference_fps: number;
  confidence_threshold: number;
  severity_threshold: SeverityLevel;
  enable_gps: boolean;
  enable_sound: boolean;
  auto_save_detections: boolean;
  map_cluster_enabled: boolean;
  language: string;
  units: 'metric' | 'imperial';
  created_at: string;
  updated_at: string;
}

export interface ModelVersion {
  id: string;
  name: string;
  version: string;
  task: 'detect' | 'segment' | 'classify' | 'pose';
  weights_path: string | null;
  metrics_json: Json | null;
  is_active: boolean;
  created_at: string;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: Json;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

// API Request/Response Types
export interface ImageDetectionRequest {
  file: File;
  confidence_threshold?: number;
  iou_threshold?: number;
  return_annotated?: boolean;
}

export interface VideoDetectionRequest {
  file: File;
  confidence_threshold?: number;
  iou_threshold?: number;
  inference_fps?: number;
  return_annotated?: boolean;
}

export interface LiveFrameRequest {
  image_base64: string;
  confidence_threshold?: number;
  iou_threshold?: number;
  track?: boolean;
  timestamp: number;
}

export interface SeverityRequest {
  bbox: BoundingBox;
  segmentation: SegmentationMask | null;
  confidence: number;
  image_width: number;
  image_height: number;
  track_history?: Array<{
    bbox: BoundingBox;
    severity: Severity;
    timestamp: number;
  }>;
}

// Map Types
export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  severity: SeverityLevel;
  confidence: number;
  detection_type: DetectionType;
  created_at: string;
  thumbnail_url?: string;
  detection_id: string;
}

export interface MapCluster {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  severity_counts: Record<SeverityLevel, number>;
  bounds: [[number, number], [number, number]];
}

// Dashboard Types
export interface DashboardStats {
  total_detections: number;
  by_severity: Record<SeverityLevel, number>;
  by_source: Record<DetectionSource, number>;
  avg_confidence: number;
  avg_severity_score: number;
  recent_count: number;
  today_count: number;
}

export interface TimeSeriesData {
  date: string;
  count: number;
  severity_breakdown: Record<SeverityLevel, number>;
}

export interface GeographicData {
  latitude: number;
  longitude: number;
  count: number;
  avg_severity: number;
}

// Auth Types
export interface AuthUser {
  id: string;
  email: string;
  user_metadata: {
    full_name?: string;
    avatar_url?: string;
  };
  app_metadata: {
    role?: string;
  };
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupCredentials {
  email: string;
  password: string;
  full_name: string;
}

// AI Service Types
export interface AIHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  model_loaded: boolean;
  model_info?: ModelInfo;
  uptime_seconds: number;
  gpu_available: boolean;
  memory_usage_mb: number;
}

export interface AIModelInfo {
  name: string;
  version: string;
  task: string;
  weights_path: string;
  device: string;
  half_precision: boolean;
  image_size: number;
  confidence_threshold: number;
  iou_threshold: number;
  classes: string[];
}

export interface JobStatusResponse {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  processed_frames: number;
  total_frames: number;
  detections: Detection[];
  error_message?: string;
  result_url?: string;
}

// Component Props Types
export interface DetectionCardProps {
  detection: DetectionRecord;
  media?: DetectionMedia[];
  onClick?: () => void;
  showActions?: boolean;
}

export interface SeverityBadgeProps {
  level: SeverityLevel;
  size?: 'sm' | 'md' | 'lg';
  showScore?: boolean;
  score?: number;
}

export interface ConfidenceBarProps {
  value: number;
  threshold?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export interface MapViewProps {
  center?: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  clusters?: MapCluster[];
  onMarkerClick?: (marker: MapMarker) => void;
  filterSeverity?: SeverityLevel[];
  filterDateRange?: [Date, Date];
  showUserLocation?: boolean;
}