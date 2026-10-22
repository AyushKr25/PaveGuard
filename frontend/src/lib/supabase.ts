import { createBrowserClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { SeverityLevel, DetectionType, DetectionSource, DetectionStatus } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getSupabaseUrl(): string {
  return supabaseUrl || '';
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

function assertConfigured() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
    );
  }
}

// Browser client singleton
let browserClient: SupabaseClient<Database> | null = null;

export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  assertConfigured();
  if (browserClient) return browserClient;
  browserClient = createBrowserClient<Database>(supabaseUrl!, supabaseAnonKey!);
  return browserClient;
}

// Helper to get current user (client side)
export async function getCurrentUser() {
  const supabase = createBrowserSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Helper to get current session (client side)
export async function getCurrentSession() {
  const supabase = createBrowserSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// Auth helpers
export async function signIn(email: string, password: string) {
  const supabase = createBrowserSupabaseClient();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email: string, password: string, metadata?: Record<string, string>) {
  const supabase = createBrowserSupabaseClient();
  return supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });
}

export async function signOut() {
  const supabase = createBrowserSupabaseClient();
  return supabase.auth.signOut();
}

export async function resetPassword(email: string) {
  const supabase = createBrowserSupabaseClient();
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  });
}

export async function updatePassword(password: string) {
  const supabase = createBrowserSupabaseClient();
  return supabase.auth.updateUser({ password });
}

// Storage helpers
export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob,
  options?: { contentType?: string; upsert?: boolean }
) {
  const supabase = createBrowserSupabaseClient();
  return supabase.storage.from(bucket).upload(path, file, options);
}

export async function downloadFile(bucket: string, path: string) {
  const supabase = createBrowserSupabaseClient();
  return supabase.storage.from(bucket).download(path);
}

export async function deleteFile(bucket: string, paths: string[]) {
  const supabase = createBrowserSupabaseClient();
  return supabase.storage.from(bucket).remove(paths);
}

export async function getSignedUrl(bucket: string, path: string, expiresIn = 3600) {
  const supabase = createBrowserSupabaseClient();
  return supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
}

// Database helpers
export async function getUserProfile(userId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
}

export async function updateUserProfile(userId: string, updates: Partial<Database['public']['Tables']['profiles']['Update']>) {
  const supabase = createBrowserSupabaseClient();
  return supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);
}

export async function getUserPreferences(userId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();
  return { data, error };
}

export async function updateUserPreferences(userId: string, updates: Partial<Database['public']['Tables']['user_preferences']['Update']>) {
  const supabase = createBrowserSupabaseClient();
  return supabase
    .from('user_preferences')
    .upsert({ user_id: userId, ...updates } as Database['public']['Tables']['user_preferences']['Insert']);
}

// Detection helpers
export interface DetectionFilters {
  severity_level?: string[];
  detection_type?: string[];
  source?: string[];
  status?: string[];
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
  order_by?: string;
  order_dir?: 'asc' | 'desc';
}

export async function getDetections(filters: DetectionFilters = {}) {
  const supabase = createBrowserSupabaseClient();
  const user = await getCurrentUser();
  if (!user) {
    return { data: [], error: new Error('Not authenticated') as unknown, count: 0 };
  }

  let query = supabase
    .from('detections')
    .select(`
      *,
      detection_media(*),
      model_versions(name, version, task)
    `, { count: 'exact' })
    .eq('user_id', user.id);

  if (filters.severity_level?.length) {
    query = query.in('severity_level', filters.severity_level as SeverityLevel[]);
  }
  if (filters.detection_type?.length) {
    query = query.in('detection_type', filters.detection_type as unknown as DetectionType[]);
  }
  if (filters.source?.length) {
    query = query.in('source', filters.source as unknown as DetectionSource[]);
  }
  if (filters.status?.length) {
    query = query.in('status', filters.status as unknown as DetectionStatus[]);
  }
  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte('created_at', filters.date_to);
  }

  const orderBy = filters.order_by || 'created_at';
  const orderDir = filters.order_dir || 'desc';
  query = query.order(orderBy, { ascending: orderDir === 'asc' });

  if (filters.offset !== undefined || filters.limit) {
    const from = filters.offset || 0;
    const to = from + (filters.limit || 50) - 1;
    query = query.range(from, to);
  }

  return query;
}

export async function getDetectionById(id: string) {
  const supabase = createBrowserSupabaseClient();
  return supabase
    .from('detections')
    .select(`
      *,
      detection_media(*),
      detection_frames(*),
      model_versions(name, version, task)
    `)
    .eq('id', id)
    .single();
}

export async function createDetection(detection: Database['public']['Tables']['detections']['Insert']) {
  const supabase = createBrowserSupabaseClient();
  return supabase.from('detections').insert(detection).select().single();
}

export async function updateDetection(id: string, updates: Database['public']['Tables']['detections']['Update']) {
  const supabase = createBrowserSupabaseClient();
  return supabase.from('detections').update(updates).eq('id', id);
}

export async function createDetectionMedia(media: Database['public']['Tables']['detection_media']['Insert']) {
  const supabase = createBrowserSupabaseClient();
  return supabase.from('detection_media').insert(media).select().single();
}

// Count of road scan sessions owned by the user (dashboard "Road Scans" stat)
export async function getRoadScanCount(userId: string) {
  const supabase = createBrowserSupabaseClient();
  const { count, error } = await supabase
    .from('road_scan_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  return { count: count ?? 0, error };
}

export async function deleteDetection(id: string) {
  const supabase = createBrowserSupabaseClient();
  return supabase.from('detections').delete().eq('id', id);
}

// Session helpers
export async function createSession(session: Database['public']['Tables']['detection_sessions']['Insert']) {
  const supabase = createBrowserSupabaseClient();
  return supabase.from('detection_sessions').insert(session).select().single();
}

export async function updateSession(id: string, updates: Database['public']['Tables']['detection_sessions']['Update']) {
  const supabase = createBrowserSupabaseClient();
  return supabase.from('detection_sessions').update(updates).eq('id', id);
}

export async function getUserSessions(userId: string) {
  const supabase = createBrowserSupabaseClient();
  return supabase
    .from('detection_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });
}

// Road scan helpers
export async function createRoadScan(session: Database['public']['Tables']['road_scan_sessions']['Insert']) {
  const supabase = createBrowserSupabaseClient();
  return supabase.from('road_scan_sessions').insert(session).select().single();
}

export async function updateRoadScan(id: string, updates: Database['public']['Tables']['road_scan_sessions']['Update']) {
  const supabase = createBrowserSupabaseClient();
  return supabase.from('road_scan_sessions').update(updates).eq('id', id);
}

export async function addLocationPoint(point: Database['public']['Tables']['locations']['Insert']) {
  const supabase = createBrowserSupabaseClient();
  return supabase.from('locations').insert(point);
}

export async function getRoadScanWithLocations(sessionId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data: session } = await supabase
    .from('road_scan_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  const { data: locations } = await supabase
    .from('locations')
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true });

  return { session, locations };
}

// Processing job helpers
export async function createProcessingJob(job: Database['public']['Tables']['processing_jobs']['Insert']) {
  const supabase = createBrowserSupabaseClient();
  return supabase.from('processing_jobs').insert(job).select().single();
}

export async function updateProcessingJob(id: string, updates: Database['public']['Tables']['processing_jobs']['Update']) {
  const supabase = createBrowserSupabaseClient();
  return supabase.from('processing_jobs').update(updates).eq('id', id);
}

export async function getProcessingJob(id: string) {
  const supabase = createBrowserSupabaseClient();
  return supabase.from('processing_jobs').select('*').eq('id', id).single();
}

export async function getUserProcessingJobs(userId: string) {
  const supabase = createBrowserSupabaseClient();
  return supabase
    .from('processing_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}

// Feedback helpers
export async function submitFeedback(feedback: Database['public']['Tables']['feedback']['Insert']) {
  const supabase = createBrowserSupabaseClient();
  return supabase.from('feedback').insert(feedback).select().single();
}

export async function getDetectionFeedback(detectionId: string) {
  const supabase = createBrowserSupabaseClient();
  return supabase
    .from('feedback')
    .select('*')
    .eq('detection_id', detectionId);
}

// Report helpers
export async function createReport(report: Database['public']['Tables']['reports']['Insert']) {
  const supabase = createBrowserSupabaseClient();
  return supabase.from('reports').insert(report).select().single();
}

export async function updateReport(id: string, updates: Database['public']['Tables']['reports']['Update']) {
  const supabase = createBrowserSupabaseClient();
  return supabase.from('reports').update(updates).eq('id', id);
}

export async function getUserReports(userId: string) {
  const supabase = createBrowserSupabaseClient();
  return supabase
    .from('reports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}

// Model version helpers
export async function getActiveModel() {
  const supabase = createBrowserSupabaseClient();
  return supabase
    .from('model_versions')
    .select('*')
    .eq('is_active', true)
    .single();
}

export async function getAllModels() {
  const supabase = createBrowserSupabaseClient();
  return supabase
    .from('model_versions')
    .select('*')
    .order('created_at', { ascending: false });
}

// Stats helpers
export async function getUserStats(userId: string) {
  const supabase = createBrowserSupabaseClient();
  return supabase.rpc('get_user_detection_stats', { p_user_id: userId });
}

export async function getDetectionsNear(
  latitude: number,
  longitude: number,
  radiusMeters = 1000,
  limit = 100
) {
  const supabase = createBrowserSupabaseClient();
  return supabase.rpc('get_detections_near', {
    p_latitude: latitude,
    p_longitude: longitude,
    p_radius_meters: radiusMeters,
    p_limit: limit,
  });
}
