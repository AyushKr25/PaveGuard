// Typed schema for the SmartPothole AI database.
// Mirrors supabase/migrations/20240101000000_initial_schema.sql.
// Regenerate with `npm run db:generate-types` after schema changes.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type SeverityLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type UserRole = 'USER' | 'ADMIN';

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

type ModelVersion = {
  id: string;
  name: string;
  version: string;
  task: 'detect' | 'segment' | 'classify' | 'pose';
  weights_path: string | null;
  metrics_json: Json | null;
  is_active: boolean;
  created_at: string;
};

export type Detection = {
  id: string;
  user_id: string;
  session_id: string | null;
  detection_type: 'image' | 'video' | 'live' | 'road_scan';
  severity_level: SeverityLevel;
  severity_score: number;
  severity_confidence: number;
  confidence: number;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  source: 'camera' | 'upload' | 'dashcam' | 'mobile';
  status: 'active' | 'archived' | 'flagged' | 'verified';
  model_version_id: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
  detection_media?: DetectionMedia[];
  detection_frames?: DetectionFrame[];
  model_versions?: Pick<ModelVersion, 'name' | 'version' | 'task'> | null;
};

type DetectionMedia = {
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
};

type DetectionFrame = {
  id: string;
  detection_id: string;
  frame_number: number;
  timestamp_ms: number;
  confidence: number;
  bbox: Json;
  mask: Json | null;
  track_id: string | null;
  severity_level: SeverityLevel | null;
  severity_score: number | null;
  created_at: string;
};

type DetectionSession = {
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
};

type RoadScanSession = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  status: 'active' | 'completed' | 'cancelled';
  total_detections: number;
  unique_potholes: number;
  distance_meters: number | null;
  route_geometry: unknown | null;
  bbox_geometry: unknown | null;
  stats_json: Json;
  created_at: string;
  updated_at: string;
};

type Location = {
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
};

type ProcessingJob = {
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
};

type Feedback = {
  id: string;
  user_id: string;
  detection_id: string;
  actual_label: 'pothole' | 'not_pothole' | 'crack' | 'patch' | 'other' | null;
  actual_severity: SeverityLevel | null;
  is_correct: boolean | null;
  comment: string | null;
  created_at: string;
};

type Report = {
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
};

type UserPreference = {
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
};

type SystemSetting = {
  id: string;
  key: string;
  value: Json;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

type Insert<T> = Partial<Omit<T, 'id' | 'created_at' | 'updated_at'>> & { id?: string };
type Update<T> = Partial<T>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Insert<Profile> & { email: string };
        Update: Update<Profile>;
        Relationships: [];
      };
      model_versions: {
        Row: ModelVersion;
        Insert: Insert<ModelVersion> & { name: string; version: string; task: ModelVersion['task'] };
        Update: Update<ModelVersion>;
        Relationships: [];
      };
      detections: {
        Row: Detection;
        Insert: Insert<Detection> & {
          user_id: string;
          detection_type: Detection['detection_type'];
          severity_level: SeverityLevel;
          severity_score: number;
          severity_confidence: number;
          confidence: number;
          source: Detection['source'];
        };
        Update: Update<Detection>;
        Relationships: [];
      };
      detection_media: {
        Row: DetectionMedia;
        Insert: Insert<DetectionMedia> & { detection_id: string; storage_path: string; media_type: DetectionMedia['media_type'] };
        Update: Update<DetectionMedia>;
        Relationships: [];
      };
      detection_frames: {
        Row: DetectionFrame;
        Insert: Insert<DetectionFrame> & { detection_id: string; frame_number: number; timestamp_ms: number; confidence: number; bbox: Json };
        Update: Update<DetectionFrame>;
        Relationships: [];
      };
      detection_sessions: {
        Row: DetectionSession;
        Insert: Insert<DetectionSession> & { user_id: string; session_type: DetectionSession['session_type'] };
        Update: Update<DetectionSession>;
        Relationships: [];
      };
      road_scan_sessions: {
        Row: RoadScanSession;
        Insert: Insert<RoadScanSession> & { user_id: string };
        Update: Update<RoadScanSession>;
        Relationships: [];
      };
      locations: {
        Row: Location;
        Insert: Insert<Location> & { session_id: string; latitude: number; longitude: number };
        Update: Update<Location>;
        Relationships: [];
      };
      processing_jobs: {
        Row: ProcessingJob;
        Insert: Insert<ProcessingJob> & { user_id: string; job_type: ProcessingJob['job_type'] };
        Update: Update<ProcessingJob>;
        Relationships: [];
      };
      feedback: {
        Row: Feedback;
        Insert: Insert<Feedback> & { user_id: string; detection_id: string };
        Update: Update<Feedback>;
        Relationships: [];
      };
      reports: {
        Row: Report;
        Insert: Insert<Report> & { user_id: string; title: string; report_type: Report['report_type'] };
        Update: Update<Report>;
        Relationships: [];
      };
      user_preferences: {
        Row: UserPreference;
        Insert: Insert<UserPreference> & { user_id: string };
        Update: Update<UserPreference>;
        Relationships: [];
      };
      system_settings: {
        Row: SystemSetting;
        Insert: Insert<SystemSetting> & { key: string; value: Json };
        Update: Update<SystemSetting>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_user_detection_stats: { Args: { p_user_id: string }; Returns: Json };
      get_admin_detection_stats: { Args: Record<string, never>; Returns: Json };
      get_detections_near: {
        Args: { p_latitude: number; p_longitude: number; p_radius_meters?: number; p_limit?: number };
        Returns: {
          id: string;
          severity_level: SeverityLevel;
          severity_score: number;
          confidence: number;
          latitude: number;
          longitude: number;
          created_at: string;
          source: string;
          detection_type: string;
          thumbnail_path: string | null;
        }[];
      };
      aggregate_track_severity: { Args: { p_detection_id: string }; Returns: Json };
      cleanup_old_jobs: { Args: { p_older_than_days?: number }; Returns: number };
      update_road_scan_stats: { Args: { p_session_id: string }; Returns: undefined };
    };
    Enums: Record<string, never>;
  };
};
