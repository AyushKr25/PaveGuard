-- ============================================
-- DEVELOPMENT SEED DATA
-- Only run in development environments
-- ============================================

-- Insert default model version
INSERT INTO public.model_versions (name, version, task, weights_path, metrics_json, is_active)
VALUES
    ('YOLO11n-seg', 'v1.0.0', 'segment', 'models/yolo11n-seg.pt',
     '{"mAP50": 0.45, "mAP50-95": 0.28, "precision": 0.52, "recall": 0.41, "fps": 120}'::jsonb, TRUE),
    ('YOLO11s-seg', 'v1.0.0', 'segment', 'models/yolo11s-seg.pt',
     '{"mAP50": 0.52, "mAP50-95": 0.34, "precision": 0.58, "recall": 0.48, "fps": 65}'::jsonb, FALSE),
    ('YOLO11m-seg', 'v1.0.0', 'segment', 'models/yolo11m-seg.pt',
     '{"mAP50": 0.58, "mAP50-95": 0.40, "precision": 0.63, "recall": 0.54, "fps": 35}'::jsonb, FALSE)
ON CONFLICT (name, version) DO NOTHING;

-- Insert default system settings
INSERT INTO public.system_settings (key, value, description, is_public)
VALUES
    ('app_name', '"SmartPothole AI"', 'Application name', TRUE),
    ('app_version', '"1.0.0"', 'Application version', TRUE),
    ('max_image_size_mb', '10', 'Maximum image upload size in MB', TRUE),
    ('max_video_size_mb', '500', 'Maximum video upload size in MB', TRUE),
    ('default_confidence_threshold', '0.25', 'Default confidence threshold for detection', TRUE),
    ('default_iou_threshold', '0.45', 'Default IoU threshold for NMS', TRUE),
    ('default_inference_fps', '5', 'Default inference FPS for live detection', TRUE),
    ('enable_demo_mode', 'false', 'Enable demo mode with mock detections', TRUE),
    ('maintenance_mode', 'false', 'Enable maintenance mode', TRUE),
    ('max_detections_per_session', '1000', 'Maximum detections per session', FALSE),
    ('video_processing_timeout_seconds', '3600', 'Video processing timeout in seconds', FALSE),
    ('severity_config_version', '1', 'Severity configuration version', FALSE)
ON CONFLICT (key) DO NOTHING;

-- Insert default user preferences (will be created per user on signup via trigger)
-- This is just a reference