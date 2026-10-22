-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "cube";
CREATE EXTENSION IF NOT EXISTS "earthdistance";

-- ============================================
-- PROFILES TABLE
-- ============================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_role ON public.profiles(role);

-- ============================================
-- MODEL VERSIONS TABLE
-- ============================================
CREATE TABLE public.model_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    task TEXT NOT NULL CHECK (task IN ('detect', 'segment', 'classify', 'pose')),
    weights_path TEXT,
    metrics_json JSONB,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name, version)
);

CREATE INDEX idx_model_versions_active ON public.model_versions(is_active) WHERE is_active = TRUE;

-- ============================================
-- DETECTIONS TABLE
-- ============================================
CREATE TABLE public.detections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_id UUID,
    detection_type TEXT NOT NULL CHECK (detection_type IN ('image', 'video', 'live', 'road_scan')),
    severity_level TEXT NOT NULL CHECK (severity_level IN ('LOW', 'MODERATE', 'HIGH', 'CRITICAL')),
    severity_score NUMERIC(4,3) NOT NULL CHECK (severity_score >= 0 AND severity_score <= 1),
    severity_confidence NUMERIC(4,3) NOT NULL CHECK (severity_confidence >= 0 AND severity_confidence <= 1),
    confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    location_accuracy NUMERIC(8, 2),
    source TEXT NOT NULL CHECK (source IN ('camera', 'upload', 'dashcam', 'mobile')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'flagged', 'verified')),
    model_version_id UUID REFERENCES public.model_versions(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_detections_user_id ON public.detections(user_id);
CREATE INDEX idx_detections_session_id ON public.detections(session_id);
CREATE INDEX idx_detections_created_at ON public.detections(created_at DESC);
CREATE INDEX idx_detections_severity ON public.detections(severity_level);
CREATE INDEX idx_detections_location ON public.detections USING GIST (
    ll_to_earth(latitude, longitude)
) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX idx_detections_status ON public.detections(status);

-- ============================================
-- DETECTION MEDIA TABLE
-- ============================================
CREATE TABLE public.detection_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    detection_id UUID NOT NULL REFERENCES public.detections(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'annotated_image', 'annotated_video', 'thumbnail')),
    thumbnail_path TEXT,
    annotated_path TEXT,
    file_size BIGINT,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    duration_seconds NUMERIC(8, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_detection_media_detection_id ON public.detection_media(detection_id);
CREATE INDEX idx_detection_media_type ON public.detection_media(media_type);

-- ============================================
-- DETECTION FRAMES TABLE (for video/live tracking)
-- ============================================
CREATE TABLE public.detection_frames (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    detection_id UUID NOT NULL REFERENCES public.detections(id) ON DELETE CASCADE,
    frame_number INTEGER NOT NULL,
    timestamp_ms BIGINT NOT NULL,
    confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    bbox JSONB NOT NULL,
    mask JSONB,
    track_id TEXT,
    severity_level TEXT CHECK (severity_level IN ('LOW', 'MODERATE', 'HIGH', 'CRITICAL')),
    severity_score NUMERIC(4,3) CHECK (severity_score >= 0 AND severity_score <= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_detection_frames_detection_id ON public.detection_frames(detection_id);
CREATE INDEX idx_detection_frames_track_id ON public.detection_frames(track_id);
CREATE INDEX idx_detection_frames_frame_number ON public.detection_frames(frame_number);

-- ============================================
-- DETECTION SESSIONS TABLE
-- ============================================
CREATE TABLE public.detection_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_type TEXT NOT NULL CHECK (session_type IN ('image_batch', 'video', 'live', 'road_scan')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'failed')),
    total_frames INTEGER DEFAULT 0,
    processed_frames INTEGER DEFAULT 0,
    total_detections INTEGER DEFAULT 0,
    unique_potholes INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_detection_sessions_user_id ON public.detection_sessions(user_id);
CREATE INDEX idx_detection_sessions_status ON public.detection_sessions(status);
CREATE INDEX idx_detection_sessions_started_at ON public.detection_sessions(started_at DESC);

-- ============================================
-- ROAD SCAN SESSIONS TABLE
-- ============================================
CREATE TABLE public.road_scan_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    total_detections INTEGER DEFAULT 0,
    unique_potholes INTEGER DEFAULT 0,
    distance_meters NUMERIC(10, 2),
    route_geometry GEOGRAPHY(LINESTRING, 4326),
    bbox_geometry GEOGRAPHY(POLYGON, 4326),
    stats_json JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_road_scan_sessions_user_id ON public.road_scan_sessions(user_id);
CREATE INDEX idx_road_scan_sessions_status ON public.road_scan_sessions(status);
CREATE INDEX idx_road_scan_sessions_route ON public.road_scan_sessions USING GIST (route_geometry) WHERE route_geometry IS NOT NULL;

-- ============================================
-- LOCATIONS TABLE (GPS points for road scans)
-- ============================================
CREATE TABLE public.locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.road_scan_sessions(id) ON DELETE CASCADE,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    accuracy NUMERIC(8, 2),
    altitude NUMERIC(8, 2),
    speed NUMERIC(6, 2),
    heading NUMERIC(5, 2),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locations_session_id ON public.locations(session_id);
CREATE INDEX idx_locations_timestamp ON public.locations(timestamp);

-- ============================================
-- PROCESSING JOBS TABLE
-- ============================================
CREATE TABLE public.processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL CHECK (job_type IN ('video', 'batch_images', 'export', 'training')),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    input_path TEXT,
    output_path TEXT,
    error_message TEXT,
    result_json JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_processing_jobs_user_id ON public.processing_jobs(user_id);
CREATE INDEX idx_processing_jobs_status ON public.processing_jobs(status);
CREATE INDEX idx_processing_jobs_created_at ON public.processing_jobs(created_at DESC);

-- ============================================
-- FEEDBACK TABLE
-- ============================================
CREATE TABLE public.feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    detection_id UUID NOT NULL REFERENCES public.detections(id) ON DELETE CASCADE,
    actual_label TEXT CHECK (actual_label IN ('pothole', 'not_pothole', 'crack', 'patch', 'other')),
    actual_severity TEXT CHECK (actual_severity IN ('LOW', 'MODERATE', 'HIGH', 'CRITICAL')),
    is_correct BOOLEAN,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX idx_feedback_detection_id ON public.feedback(detection_id);

-- ============================================
-- REPORTS TABLE
-- ============================================
CREATE TABLE public.reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    report_type TEXT NOT NULL CHECK (report_type IN ('single_detection', 'road_scan', 'date_range', 'custom')),
    date_from TIMESTAMPTZ,
    date_to TIMESTAMPTZ,
    filters_json JSONB DEFAULT '{}',
    storage_path TEXT,
    file_size BIGINT,
    mime_type TEXT,
    status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_reports_user_id ON public.reports(user_id);
CREATE INDEX idx_reports_status ON public.reports(status);

-- ============================================
-- USER PREFERENCES TABLE
-- ============================================
CREATE TABLE public.user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    inference_mode TEXT DEFAULT 'auto' CHECK (inference_mode IN ('auto', 'browser', 'cloud')),
    inference_fps INTEGER DEFAULT 5 CHECK (inference_fps >= 1 AND inference_fps <= 30),
    confidence_threshold NUMERIC(3,2) DEFAULT 0.25 CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1),
    severity_threshold TEXT DEFAULT 'MODERATE' CHECK (severity_threshold IN ('LOW', 'MODERATE', 'HIGH', 'CRITICAL')),
    enable_gps BOOLEAN DEFAULT TRUE,
    enable_sound BOOLEAN DEFAULT FALSE,
    auto_save_detections BOOLEAN DEFAULT FALSE,
    map_cluster_enabled BOOLEAN DEFAULT TRUE,
    language TEXT DEFAULT 'en',
    units TEXT DEFAULT 'metric' CHECK (units IN ('metric', 'imperial')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- SYSTEM SETTINGS TABLE
-- ============================================
CREATE TABLE public.system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description TEXT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_detections_updated_at
    BEFORE UPDATE ON public.detections
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_detection_sessions_updated_at
    BEFORE UPDATE ON public.detection_sessions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_road_scan_sessions_updated_at
    BEFORE UPDATE ON public.road_scan_sessions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_processing_jobs_updated_at
    BEFORE UPDATE ON public.processing_jobs
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_user_preferences_updated_at
    BEFORE UPDATE ON public.user_preferences
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_system_settings_updated_at
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();