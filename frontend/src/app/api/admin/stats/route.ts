import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';

// Server-side admin endpoint: verifies the caller is authenticated AND has
// the ADMIN role server-side before returning platform-wide statistics.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [{ data: stats }, { data: users }, { data: failedJobs }, { data: recentDetections }] =
    await Promise.all([
      supabase.rpc('get_admin_detection_stats'),
      supabase.from('profiles').select('id, email, full_name, role, created_at').order('created_at', { ascending: false }).limit(20),
      supabase.from('processing_jobs').select('*').eq('status', 'failed').order('created_at', { ascending: false }).limit(10),
      supabase.from('detections').select('id, severity_level, confidence, source, detection_type, created_at').order('created_at', { ascending: false }).limit(10),
    ]);

  const { count: modelCount } = await supabase
    .from('model_versions')
    .select('*', { count: 'exact', head: true });

  return NextResponse.json({
    stats: stats || {},
    users: users || [],
    failedJobs: failedJobs || [],
    recentDetections: recentDetections || [],
    modelCount: modelCount ?? 0,
  });
}
