-- ============================================
-- STORAGE BUCKET POLICIES
-- Run these in Supabase SQL Editor after creating buckets
-- ============================================

-- Note: These policies are for reference. Apply via Supabase Dashboard > Storage > Policies
-- or use the Supabase CLI with storage policies.

-- ============================================
-- detection-images bucket policies
-- ============================================
-- Policy: Users can upload to their own folder
-- CREATE POLICY "Users can upload own detection images" ON storage.objects
-- FOR INSERT TO authenticated
-- WITH CHECK (
--     bucket_id = 'detection-images' AND
--     (storage.foldername(name))[1] = auth.uid()::text
-- );

-- Policy: Users can view their own images
-- CREATE POLICY "Users can view own detection images" ON storage.objects
-- FOR SELECT TO authenticated
-- USING (
--     bucket_id = 'detection-images' AND
--     (storage.foldername(name))[1] = auth.uid()::text
-- );

-- Policy: Users can delete their own images
-- CREATE POLICY "Users can delete own detection images" ON storage.objects
-- FOR DELETE TO authenticated
-- USING (
--     bucket_id = 'detection-images' AND
--     (storage.foldername(name))[1] = auth.uid()::text
-- );

-- Policy: Admins can view all images
-- CREATE POLICY "Admins can view all detection images" ON storage.objects
-- FOR SELECT TO authenticated
-- USING (
--     bucket_id = 'detection-images' AND
--     EXISTS (
--         SELECT 1 FROM public.profiles
--         WHERE id = auth.uid() AND role = 'ADMIN'
--     )
-- );

-- ============================================
-- detection-videos bucket policies
-- ============================================
-- CREATE POLICY "Users can upload own detection videos" ON storage.objects
-- FOR INSERT TO authenticated
-- WITH CHECK (
--     bucket_id = 'detection-videos' AND
--     (storage.foldername(name))[1] = auth.uid()::text
-- );

-- CREATE POLICY "Users can view own detection videos" ON storage.objects
-- FOR SELECT TO authenticated
-- USING (
--     bucket_id = 'detection-videos' AND
--     (storage.foldername(name))[1] = auth.uid()::text
-- );

-- CREATE POLICY "Users can delete own detection videos" ON storage.objects
-- FOR DELETE TO authenticated
-- USING (
--     bucket_id = 'detection-videos' AND
--     (storage.foldername(name))[1] = auth.uid()::text
-- );

-- CREATE POLICY "Admins can view all detection videos" ON storage.objects
-- FOR SELECT TO authenticated
-- USING (
--     bucket_id = 'detection-videos' AND
--     EXISTS (
--         SELECT 1 FROM public.profiles
--         WHERE id = auth.uid() AND role = 'ADMIN'
--     )
-- );

-- ============================================
-- annotated-results bucket policies
-- ============================================
-- Service role (AI service) can write annotated results
-- CREATE POLICY "Service role can write annotated results" ON storage.objects
-- FOR INSERT TO service_role
-- WITH CHECK (bucket_id = 'annotated-results');

-- Users can view their own annotated results
-- CREATE POLICY "Users can view own annotated results" ON storage.objects
-- FOR SELECT TO authenticated
-- USING (
--     bucket_id = 'annotated-results' AND
--     (storage.foldername(name))[1] = auth.uid()::text
-- );

-- Admins can view all annotated results
-- CREATE POLICY "Admins can view all annotated results" ON storage.objects
-- FOR SELECT TO authenticated
-- USING (
--     bucket_id = 'annotated-results' AND
--     EXISTS (
--         SELECT 1 FROM public.profiles
--         WHERE id = auth.uid() AND role = 'ADMIN'
--     )
-- );

-- ============================================
-- avatars bucket policies
-- ============================================
-- Public read access for avatars
-- CREATE POLICY "Public can view avatars" ON storage.objects
-- FOR SELECT TO public
-- USING (bucket_id = 'avatars');

-- Users can upload their own avatar
-- CREATE POLICY "Users can upload own avatar" ON storage.objects
-- FOR INSERT TO authenticated
-- WITH CHECK (
--     bucket_id = 'avatars' AND
--     (storage.foldername(name))[1] = auth.uid()::text
-- );

-- Users can update their own avatar
-- CREATE POLICY "Users can update own avatar" ON storage.objects
-- FOR UPDATE TO authenticated
-- USING (
--     bucket_id = 'avatars' AND
--     (storage.foldername(name))[1] = auth.uid()::text
-- );

-- Users can delete their own avatar
-- CREATE POLICY "Users can delete own avatar" ON storage.objects
-- FOR DELETE TO authenticated
-- USING (
--     bucket_id = 'avatars' AND
--     (storage.foldername(name))[1] = auth.uid()::text
-- );

-- ============================================
-- reports bucket policies
-- ============================================
-- Service role can write reports
-- CREATE POLICY "Service role can write reports" ON storage.objects
-- FOR INSERT TO service_role
-- WITH CHECK (bucket_id = 'reports');

-- Users can view their own reports
-- CREATE POLICY "Users can view own reports" ON storage.objects
-- FOR SELECT TO authenticated
-- USING (
--     bucket_id = 'reports' AND
--     (storage.foldername(name))[1] = auth.uid()::text
-- );

-- Admins can view all reports
-- CREATE POLICY "Admins can view all reports" ON storage.objects
-- FOR SELECT TO authenticated
-- USING (
--     bucket_id = 'reports' AND
--     EXISTS (
--         SELECT 1 FROM public.profiles
--         WHERE id = auth.uid() AND role = 'ADMIN'
--     )
-- );

-- ============================================
-- Helper function for storage folder extraction
-- ============================================
-- This is built into Supabase: storage.foldername(name)
-- Returns array of path segments
-- Example: 'user123/image.jpg' -> ['user123']