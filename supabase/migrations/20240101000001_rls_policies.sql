-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.road_scan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES POLICIES
-- ============================================
-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- Admins can update all profiles
CREATE POLICY "Admins can update all profiles" ON public.profiles
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================
-- MODEL VERSIONS POLICIES
-- ============================================
-- Everyone can view active model versions
CREATE POLICY "Anyone can view active models" ON public.model_versions
    FOR SELECT USING (is_active = TRUE);

-- Admins can manage model versions
CREATE POLICY "Admins can manage models" ON public.model_versions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================
-- DETECTIONS POLICIES
-- ============================================
-- Users can view their own detections
CREATE POLICY "Users can view own detections" ON public.detections
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own detections
CREATE POLICY "Users can insert own detections" ON public.detections
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own detections (status, metadata)
CREATE POLICY "Users can update own detections" ON public.detections
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own detections
CREATE POLICY "Users can delete own detections" ON public.detections
    FOR DELETE USING (auth.uid() = user_id);

-- Admins can view all detections
CREATE POLICY "Admins can view all detections" ON public.detections
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- Admins can update all detections
CREATE POLICY "Admins can update all detections" ON public.detections
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================
-- DETECTION MEDIA POLICIES
-- ============================================
-- Users can view media for their detections
CREATE POLICY "Users can view own detection media" ON public.detection_media
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.detections
            WHERE id = detection_media.detection_id
            AND user_id = auth.uid()
        )
    );

-- Users can insert media for their detections
CREATE POLICY "Users can insert own detection media" ON public.detection_media
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.detections
            WHERE id = detection_media.detection_id
            AND user_id = auth.uid()
        )
    );

-- Users can delete media for their detections
CREATE POLICY "Users can delete own detection media" ON public.detection_media
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.detections
            WHERE id = detection_media.detection_id
            AND user_id = auth.uid()
        )
    );

-- Admins can view all detection media
CREATE POLICY "Admins can view all detection media" ON public.detection_media
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================
-- DETECTION FRAMES POLICIES
-- ============================================
-- Users can view frames for their detections
CREATE POLICY "Users can view own detection frames" ON public.detection_frames
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.detections
            WHERE id = detection_frames.detection_id
            AND user_id = auth.uid()
        )
    );

-- Users can insert frames for their detections
CREATE POLICY "Users can insert own detection frames" ON public.detection_frames
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.detections
            WHERE id = detection_frames.detection_id
            AND user_id = auth.uid()
        )
    );

-- Admins can view all detection frames
CREATE POLICY "Admins can view all detection frames" ON public.detection_frames
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================
-- DETECTION SESSIONS POLICIES
-- ============================================
-- Users can view their own sessions
CREATE POLICY "Users can view own sessions" ON public.detection_sessions
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own sessions
CREATE POLICY "Users can insert own sessions" ON public.detection_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own sessions
CREATE POLICY "Users can update own sessions" ON public.detection_sessions
    FOR UPDATE USING (auth.uid() = user_id);

-- Admins can view all sessions
CREATE POLICY "Admins can view all sessions" ON public.detection_sessions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================
-- ROAD SCAN SESSIONS POLICIES
-- ============================================
-- Users can view their own road scan sessions
CREATE POLICY "Users can view own road scans" ON public.road_scan_sessions
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own road scan sessions
CREATE POLICY "Users can insert own road scans" ON public.road_scan_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own road scan sessions
CREATE POLICY "Users can update own road scans" ON public.road_scan_sessions
    FOR UPDATE USING (auth.uid() = user_id);

-- Admins can view all road scan sessions
CREATE POLICY "Admins can view all road scans" ON public.road_scan_sessions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================
-- LOCATIONS POLICIES
-- ============================================
-- Users can view locations for their sessions
CREATE POLICY "Users can view own locations" ON public.locations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.road_scan_sessions
            WHERE id = locations.session_id
            AND user_id = auth.uid()
        )
    );

-- Users can insert locations for their sessions
CREATE POLICY "Users can insert own locations" ON public.locations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.road_scan_sessions
            WHERE id = locations.session_id
            AND user_id = auth.uid()
        )
    );

-- Admins can view all locations
CREATE POLICY "Admins can view all locations" ON public.locations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================
-- PROCESSING JOBS POLICIES
-- ============================================
-- Users can view their own jobs
CREATE POLICY "Users can view own jobs" ON public.processing_jobs
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own jobs
CREATE POLICY "Users can insert own jobs" ON public.processing_jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own jobs (cancel)
CREATE POLICY "Users can update own jobs" ON public.processing_jobs
    FOR UPDATE USING (auth.uid() = user_id);

-- Admins can view all jobs
CREATE POLICY "Admins can view all jobs" ON public.processing_jobs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================
-- FEEDBACK POLICIES
-- ============================================
-- Users can view their own feedback
CREATE POLICY "Users can view own feedback" ON public.feedback
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert feedback for their detections
CREATE POLICY "Users can insert own feedback" ON public.feedback
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.detections
            WHERE id = feedback.detection_id
            AND user_id = auth.uid()
        )
    );

-- Admins can view all feedback
CREATE POLICY "Admins can view all feedback" ON public.feedback
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================
-- REPORTS POLICIES
-- ============================================
-- Users can view their own reports
CREATE POLICY "Users can view own reports" ON public.reports
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own reports
CREATE POLICY "Users can insert own reports" ON public.reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can view all reports
CREATE POLICY "Admins can view all reports" ON public.reports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================
-- USER PREFERENCES POLICIES
-- ============================================
-- Users can view their own preferences
CREATE POLICY "Users can view own preferences" ON public.user_preferences
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own preferences
CREATE POLICY "Users can insert own preferences" ON public.user_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own preferences
CREATE POLICY "Users can update own preferences" ON public.user_preferences
    FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- SYSTEM SETTINGS POLICIES
-- ============================================
-- Public settings can be viewed by anyone
CREATE POLICY "Anyone can view public settings" ON public.system_settings
    FOR SELECT USING (is_public = TRUE);

-- Admins can manage all settings
CREATE POLICY "Admins can manage settings" ON public.system_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================
-- STORAGE POLICIES
-- ============================================
-- These will be applied via Supabase dashboard or storage SQL
-- Detection images bucket
-- Users can upload to their own folder: user_id/*
-- Users can read their own files
-- Admins can read all files

-- Detection videos bucket
-- Same pattern as images

-- Annotated results bucket
-- Users can read their own annotated results
-- Service role can write annotated results

-- Avatars bucket
-- Public read access
-- Users can upload to their own folder

-- Reports bucket
-- Users can read their own reports
-- Service role can write reports