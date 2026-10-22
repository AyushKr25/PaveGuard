-- ============================================
-- FIX: infinite recursion in RLS policies
--
-- Admin policies on many tables query public.profiles. Because those
-- policies run while evaluating policies ON profiles itself, Postgres
-- raised 42P17 "infinite recursion detected in policy for relation
-- profiles" for any query touching profiles or detections (including
-- user inserts/reads of their own rows).
--
-- Fix: a SECURITY DEFINER helper that bypasses RLS when checking the
-- caller's role, then rewrite every admin policy to use it.
-- ============================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'ADMIN'
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ---------- profiles ----------
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update all profiles" ON public.profiles
    FOR UPDATE USING (public.is_admin());

-- ---------- model_versions ----------
DROP POLICY IF EXISTS "Admins can manage models" ON public.model_versions;
CREATE POLICY "Admins can manage models" ON public.model_versions
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------- detections ----------
DROP POLICY IF EXISTS "Admins can view all detections" ON public.detections;
DROP POLICY IF EXISTS "Admins can update all detections" ON public.detections;
CREATE POLICY "Admins can view all detections" ON public.detections
    FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update all detections" ON public.detections
    FOR UPDATE USING (public.is_admin());

-- ---------- detection_media ----------
DROP POLICY IF EXISTS "Admins can view all detection media" ON public.detection_media;
CREATE POLICY "Admins can view all detection media" ON public.detection_media
    FOR SELECT USING (public.is_admin());

-- ---------- detection_frames ----------
DROP POLICY IF EXISTS "Admins can view all detection frames" ON public.detection_frames;
CREATE POLICY "Admins can view all detection frames" ON public.detection_frames
    FOR SELECT USING (public.is_admin());

-- ---------- detection_sessions ----------
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.detection_sessions;
CREATE POLICY "Admins can view all sessions" ON public.detection_sessions
    FOR SELECT USING (public.is_admin());

-- ---------- road_scan_sessions ----------
DROP POLICY IF EXISTS "Admins can view all road scans" ON public.road_scan_sessions;
CREATE POLICY "Admins can view all road scans" ON public.road_scan_sessions
    FOR SELECT USING (public.is_admin());

-- ---------- locations ----------
DROP POLICY IF EXISTS "Admins can view all locations" ON public.locations;
CREATE POLICY "Admins can view all locations" ON public.locations
    FOR SELECT USING (public.is_admin());

-- ---------- processing_jobs ----------
DROP POLICY IF EXISTS "Admins can view all jobs" ON public.processing_jobs;
CREATE POLICY "Admins can view all jobs" ON public.processing_jobs
    FOR SELECT USING (public.is_admin());

-- ---------- feedback ----------
DROP POLICY IF EXISTS "Admins can view all feedback" ON public.feedback;
CREATE POLICY "Admins can view all feedback" ON public.feedback
    FOR SELECT USING (public.is_admin());

-- ---------- reports ----------
DROP POLICY IF EXISTS "Admins can view all reports" ON public.reports;
CREATE POLICY "Admins can view all reports" ON public.reports
    FOR SELECT USING (public.is_admin());

-- ---------- system_settings ----------
DROP POLICY IF EXISTS "Admins can manage settings" ON public.system_settings;
CREATE POLICY "Admins can manage settings" ON public.system_settings
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------- storage ----------
DROP POLICY IF EXISTS "Admins can view all files" ON storage.objects;
CREATE POLICY "Admins can view all files" ON storage.objects
    FOR SELECT TO authenticated
    USING (public.is_admin());
