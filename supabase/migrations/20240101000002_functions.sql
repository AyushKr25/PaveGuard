-- ============================================
-- DATABASE HELPER FUNCTIONS
-- ============================================

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url',
        'USER'
    );
    -- Create default preferences
    INSERT INTO public.user_preferences (user_id)
    VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to get detection statistics for user
CREATE OR REPLACE FUNCTION public.get_user_detection_stats(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_detections', COUNT(*),
        'by_severity', jsonb_build_object(
            'LOW', COUNT(*) FILTER (WHERE severity_level = 'LOW'),
            'MODERATE', COUNT(*) FILTER (WHERE severity_level = 'MODERATE'),
            'HIGH', COUNT(*) FILTER (WHERE severity_level = 'HIGH'),
            'CRITICAL', COUNT(*) FILTER (WHERE severity_level = 'CRITICAL')
        ),
        'by_source', jsonb_build_object(
            'camera', COUNT(*) FILTER (WHERE source = 'camera'),
            'upload', COUNT(*) FILTER (WHERE source = 'upload'),
            'dashcam', COUNT(*) FILTER (WHERE source = 'dashcam'),
            'mobile', COUNT(*) FILTER (WHERE source = 'mobile')
        ),
        'avg_confidence', ROUND(AVG(confidence)::numeric, 3),
        'avg_severity_score', ROUND(AVG(severity_score)::numeric, 3),
        'recent_count', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days'),
        'today_count', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day')
    ) INTO stats
    FROM public.detections
    WHERE user_id = p_user_id AND status = 'active';

    RETURN COALESCE(stats, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get detection statistics for admin (all users)
CREATE OR REPLACE FUNCTION public.get_admin_detection_stats()
RETURNS JSONB AS $$
DECLARE
    stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_users', (SELECT COUNT(*) FROM public.profiles),
        'total_detections', COUNT(*),
        'by_severity', jsonb_build_object(
            'LOW', COUNT(*) FILTER (WHERE severity_level = 'LOW'),
            'MODERATE', COUNT(*) FILTER (WHERE severity_level = 'MODERATE'),
            'HIGH', COUNT(*) FILTER (WHERE severity_level = 'HIGH'),
            'CRITICAL', COUNT(*) FILTER (WHERE severity_level = 'CRITICAL')
        ),
        'by_source', jsonb_build_object(
            'camera', COUNT(*) FILTER (WHERE source = 'camera'),
            'upload', COUNT(*) FILTER (WHERE source = 'upload'),
            'dashcam', COUNT(*) FILTER (WHERE source = 'dashcam'),
            'mobile', COUNT(*) FILTER (WHERE source = 'mobile')
        ),
        'avg_confidence', ROUND(AVG(confidence)::numeric, 3),
        'avg_severity_score', ROUND(AVG(severity_score)::numeric, 3),
        'recent_count', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days'),
        'today_count', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day'),
        'pending_jobs', (SELECT COUNT(*) FROM public.processing_jobs WHERE status IN ('queued', 'processing')),
        'failed_jobs', (SELECT COUNT(*) FROM public.processing_jobs WHERE status = 'failed' AND created_at > NOW() - INTERVAL '7 days')
    ) INTO stats
    FROM public.detections
    WHERE status = 'active';

    RETURN COALESCE(stats, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get detections near a location (for map clustering)
CREATE OR REPLACE FUNCTION public.get_detections_near(
    p_latitude NUMERIC,
    p_longitude NUMERIC,
    p_radius_meters INTEGER DEFAULT 1000,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    severity_level TEXT,
    severity_score NUMERIC,
    confidence NUMERIC,
    latitude NUMERIC,
    longitude NUMERIC,
    created_at TIMESTAMPTZ,
    source TEXT,
    detection_type TEXT,
    thumbnail_path TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.severity_level,
        d.severity_score,
        d.confidence,
        d.latitude,
        d.longitude,
        d.created_at,
        d.source,
        d.detection_type,
        dm.thumbnail_path
    FROM public.detections d
    LEFT JOIN LATERAL (
        SELECT thumbnail_path
        FROM public.detection_media
        WHERE detection_id = d.id AND media_type = 'thumbnail'
        LIMIT 1
    ) dm ON TRUE
    WHERE d.latitude IS NOT NULL
    AND d.longitude IS NOT NULL
    AND d.status = 'active'
    AND earth_distance(
        ll_to_earth(d.latitude, d.longitude),
        ll_to_earth(p_latitude, p_longitude)
    ) <= p_radius_meters
    ORDER BY earth_distance(
        ll_to_earth(d.latitude, d.longitude),
        ll_to_earth(p_latitude, p_longitude)
    )
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to aggregate severity across frames for a track
CREATE OR REPLACE FUNCTION public.aggregate_track_severity(p_detection_id UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    severity_scores NUMERIC[];
    severity_levels TEXT[];
BEGIN
    SELECT
        ARRAY_AGG(severity_score ORDER BY frame_number),
        ARRAY_AGG(severity_level ORDER BY frame_number)
    INTO severity_scores, severity_levels
    FROM public.detection_frames
    WHERE detection_id = p_detection_id
    AND severity_score IS NOT NULL
    AND severity_level IS NOT NULL;

    IF severity_scores IS NULL OR array_length(severity_scores, 1) = 0 THEN
        RETURN '{"level": "LOW", "score": 0.0, "confidence": 0.0, "frame_count": 0}'::jsonb;
    END IF;

    -- Weighted average: more weight to recent frames and higher severity
    -- Simple approach: mode of severity levels, average of scores
    SELECT jsonb_build_object(
        'level', MODE() WITHIN GROUP (ORDER BY severity_level),
        'score', ROUND(AVG(severity_score)::numeric, 3),
        'confidence', ROUND(
            (COUNT(*)::numeric / GREATEST(COUNT(*), 5)) *
            (AVG(severity_score)::numeric)
        , 3),
        'frame_count', COUNT(*)
    ) INTO result
    FROM unnest(severity_scores, severity_levels) AS t(score, level);

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old processing jobs
CREATE OR REPLACE FUNCTION public.cleanup_old_jobs(p_older_than_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.processing_jobs
    WHERE status IN ('completed', 'failed', 'cancelled')
    AND created_at < NOW() - (p_older_than_days || ' days')::interval;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update road scan session stats
CREATE OR REPLACE FUNCTION public.update_road_scan_stats(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.road_scan_sessions
    SET
        total_detections = (
            SELECT COUNT(*)
            FROM public.detections
            WHERE session_id = p_session_id
        ),
        unique_potholes = (
            SELECT COUNT(DISTINCT track_id)
            FROM public.detection_frames
            WHERE detection_id IN (
                SELECT id FROM public.detections WHERE session_id = p_session_id
            )
            AND track_id IS NOT NULL
        ),
        updated_at = NOW()
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_detection_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_detections_near(NUMERIC, NUMERIC, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_track_severity(UUID) TO authenticated;

-- Grant execute permissions to service role for admin functions
GRANT EXECUTE ON FUNCTION public.get_admin_detection_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_jobs(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_road_scan_stats(UUID) TO service_role;