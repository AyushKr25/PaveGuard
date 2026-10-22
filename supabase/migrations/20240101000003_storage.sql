-- Create private storage buckets and access policies
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
    ('detection-images', 'detection-images', FALSE, 10485760),
    ('detection-videos', 'detection-videos', FALSE, 524288000),
    ('annotated-results', 'annotated-results', FALSE, 524288000),
    ('avatars', 'avatars', TRUE, 2097152),
    ('reports', 'reports', FALSE, 10485760)
ON CONFLICT (id) DO NOTHING;

-- Generic per-user folder policies for each private bucket
CREATE POLICY "Users can upload to own folder" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id IN ('detection-images', 'detection-videos', 'annotated-results', 'reports') AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can view own files" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id IN ('detection-images', 'detection-videos', 'annotated-results', 'reports') AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can update own files" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id IN ('detection-images', 'detection-videos', 'annotated-results', 'reports') AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can delete own files" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id IN ('detection-images', 'detection-videos', 'annotated-results', 'reports') AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- Avatars: public read, owner write
CREATE POLICY "Anyone can view avatars" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'avatars');

CREATE POLICY "Users can manage own avatar" ON storage.objects
    FOR ALL TO authenticated
    USING (
        bucket_id = 'avatars' AND
        (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'avatars' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- Admins can view everything
CREATE POLICY "Admins can view all files" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- Service role full access (AI service writes results)
CREATE POLICY "Service role full access" ON storage.objects
    FOR ALL TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);
