'use client';

import * as React from 'react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  AlertTriangle, 
  TrendingUp, 
  MapPin, 
  Clock, 
  CheckCircle, 
  Download, 
  Filter,
  Loader2,
  BarChart3,
  Target,
} from 'lucide-react';
import { getDetections, getUserStats, getCurrentUser, createBrowserSupabaseClient, getRoadScanCount, getSignedUrl } from '@/lib/supabase';
import { cn, formatDateTime, formatRelativeTime, getSeverityColor } from '@/lib/utils';
import type { DetectionRecord, SeverityLevel, DetectionType, DetectionSource, DashboardStats, DetectionMedia } from '@/types';
import { AppShell } from '@/components/app-shell';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// Renders a real thumbnail from the detection's stored media via a signed URL
function DetectionThumbnail({ media }: { media: DetectionMedia[] }) {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const candidate =
      media.find((m) => m.media_type === 'thumbnail') ||
      media.find((m) => m.media_type === 'image') ||
      media.find((m) => m.media_type === 'annotated_image');
    if (!candidate?.storage_path) return;
    let active = true;
    getSignedUrl('detection-images', candidate.storage_path, 3600).then(({ data }) => {
      if (active && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => {
      active = false;
    };
  }, [media]);

  if (!url) return <div className="w-16 h-10 rounded bg-muted" />;
  return <img src={url} alt="Detection" className="w-16 h-10 rounded object-cover" />;
}

const severityColors: Record<SeverityLevel, string> = {
  LOW: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  MODERATE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  HIGH: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  CRITICAL: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200',
};

const sourceIcons: Record<DetectionSource, React.ReactNode> = {
  camera: <Video className="w-4 h-4" />,
  upload: <Upload className="w-4 h-4" />,
  dashcam: <Camera className="w-4 h-4" />,
  mobile: <Smartphone className="w-4 h-4" />,
};

function StatCard({ title, value, icon, trend, color }: { 
  title: string; 
  value: string | number; 
  icon: React.ReactNode;
  trend?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {trend && <p className="text-xs text-green-600 mt-1">{trend}</p>}
          </div>
          <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center', color || 'bg-primary/10 text-primary')}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const REFRESH_INTERVAL_MS = 10_000;

export default function DashboardPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [now, setNow] = React.useState(() => Date.now());
  const [filters, setFilters] = useState({
    severity: [] as SeverityLevel[],
    type: [] as DetectionType[],
    source: [] as DetectionSource[],
    dateRange: { from: undefined as Date | undefined, to: undefined as Date | undefined },
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });

  const { data: user } = useQuery({
    queryKey: ['dashboard-user'],
    queryFn: () => getCurrentUser(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const statsQuery = useQuery({
    queryKey: ['dashboard-stats', user?.id],
    queryFn: () => getUserStats(user!.id),
    enabled: Boolean(user?.id),
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  const roadScansQuery = useQuery({
    queryKey: ['dashboard-roadscans', user?.id],
    queryFn: () => getRoadScanCount(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });

  const detectionsQuery = useQuery({
    queryKey: [
      'dashboard-detections',
      filters.severity,
      filters.type,
      filters.source,
      filters.dateRange.from?.toISOString(),
      filters.dateRange.to?.toISOString(),
      pagination.page,
      pagination.limit,
    ],
    queryFn: () =>
      getDetections({
        severity_level: filters.severity.length ? filters.severity : undefined,
        detection_type: filters.type.length ? filters.type : undefined,
        source: filters.source.length ? filters.source : undefined,
        date_from: filters.dateRange.from?.toISOString(),
        date_to: filters.dateRange.to?.toISOString(),
        limit: pagination.limit,
        offset: (pagination.page - 1) * pagination.limit,
      }),
    enabled: Boolean(user?.id),
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  // Instant refresh when new/changed detections arrive via Supabase Realtime
  React.useEffect(() => {
    if (!user?.id) return;
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel('dashboard-detections-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'detections' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard-detections'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Re-render periodically so relative timestamps ("2 min ago") stay accurate
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (detectionsQuery.isError) {
      toast({
        title: 'Failed to load dashboard',
        description:
          detectionsQuery.error instanceof Error ? detectionsQuery.error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [detectionsQuery.isError, detectionsQuery.error, toast]);

  // Export the current filtered detections as a CSV report (real download)
  const exportCsv = async () => {
    try {
      const { data, error } = await getDetections({
        severity_level: filters.severity.length ? filters.severity : undefined,
        detection_type: filters.type.length ? filters.type : undefined,
        source: filters.source.length ? filters.source : undefined,
        date_from: filters.dateRange.from?.toISOString(),
        date_to: filters.dateRange.to?.toISOString(),
        limit: 1000,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as DetectionRecord[];
      if (rows.length === 0) {
        toast({ title: 'Nothing to export', description: 'No detections match the current filters.' });
        return;
      }
      const headers = ['id', 'created_at', 'detection_type', 'source', 'severity_level', 'severity_score', 'severity_confidence', 'confidence', 'latitude', 'longitude', 'status'];
      const escape = (v: unknown) => {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [
        headers.join(','),
        ...rows.map((r) => headers.map((h) => escape(r[h as keyof DetectionRecord])).join(',')),
      ].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `smartpothole-detections-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export ready', description: `${rows.length} detections exported as CSV.` });
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const stats = (statsQuery.data?.data as unknown as DashboardStats | undefined) ?? null;
  const detections = (detectionsQuery.data?.data as DetectionRecord[] | undefined) ?? [];
  const total = detectionsQuery.data?.count ?? 0;
  const isInitialLoading = detectionsQuery.isLoading && !detectionsQuery.data;
  const isRefreshing = detectionsQuery.isFetching || statsQuery.isFetching;
  const lastUpdated = Math.max(detectionsQuery.dataUpdatedAt, statsQuery.dataUpdatedAt);
  const secondsSinceUpdate = lastUpdated ? Math.max(0, Math.round((now - lastUpdated) / 1000)) : null;

  React.useEffect(() => {
    setPagination((prev) => (prev.total === total ? prev : { ...prev, total }));
  }, [total]);

  return (
    <AppShell>
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">Dashboard</h1>
              <Badge variant="outline" className="gap-1.5 font-normal">
                <span className="relative flex h-2 w-2">
                  {isRefreshing && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  )}
                  <span
                    className={cn(
                      'relative inline-flex rounded-full h-2 w-2',
                      isRefreshing ? 'bg-primary' : 'bg-muted-foreground/50'
                    )}
                  />
                </span>
                Live
                {secondsSinceUpdate !== null && (
                  <span>· updated {secondsSinceUpdate}s ago</span>
                )}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">Overview of your pothole detections and analytics</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                detectionsQuery.refetch();
                statsQuery.refetch();
              }}
              disabled={isRefreshing}
            >
              <Loader2 className={cn('w-4 h-4 mr-2', isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
            <Button size="sm" asChild>
              <a href="/detect/image">New Detection</a>
            </Button>
          </div>
        </div>

        {isInitialLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="h-8 bg-muted animate-pulse rounded w-3/4 mb-4" />
                  <div className="h-12 bg-muted animate-pulse rounded w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
        {/* Stats Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Detections"
            value={stats?.total_detections || 0}
            icon={<AlertTriangle className="w-6 h-6" />}
            color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            trend={stats?.today_count ? `+${stats.today_count} today` : undefined}
          />
          <StatCard
            title="High & Critical"
            value={(stats?.by_severity?.HIGH || 0) + (stats?.by_severity?.CRITICAL || 0)}
            icon={<AlertTriangle className="w-6 h-6" />}
            color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          />
          <StatCard
            title="Avg Confidence"
            value={`${((stats?.avg_confidence || 0) * 100).toFixed(1)}%`}
            icon={<Target className="w-6 h-6" />}
            color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          />
          <StatCard
            title="Road Scans"
            value={roadScansQuery.data?.count ?? 0}
            icon={<MapPin className="w-6 h-6" />}
            color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
          />
        </div>

        {/* Severity Distribution */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Severity Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as SeverityLevel[]).map(level => {
                  const count = stats?.by_severity?.[level] || 0;
                  const percentage = stats?.total_detections ? (count / stats.total_detections * 100).toFixed(1) : '0';
                  return (
                    <div key={level} className="flex items-center gap-3 p-3 bg-muted rounded-lg flex-1 min-w-[150px]">
                      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', severityColors[level])}>
                        <span className="font-bold">{level[0]}</span>
                      </div>
                      <div>
                        <p className="font-medium">{level}</p>
                        <p className="text-sm text-muted-foreground">{count} ({percentage}%)</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>By Source</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(['camera', 'upload', 'dashcam', 'mobile'] as DetectionSource[]).map(source => {
                  const count = stats?.by_source?.[source] || 0;
                  return (
                    <div key={source} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{sourceIcons[source]}</span>
                        <span className="capitalize">{source}</span>
                      </div>
                      <span className="font-semibold">{count}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detections Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle>Recent Detections</CardTitle>
              <div className="flex items-center gap-4">
                <Select value={filters.severity.join(',') || 'all'} onValueChange={v => setFilters({...filters, severity: v === 'all' ? [] : [v as SeverityLevel]})}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Severities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severities</SelectItem>
                    <SelectItem value="LOW">LOW</SelectItem>
                    <SelectItem value="MODERATE">MODERATE</SelectItem>
                    <SelectItem value="HIGH">HIGH</SelectItem>
                    <SelectItem value="CRITICAL">CRITICAL</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filters.type.join(',') || 'all'} onValueChange={v => setFilters({...filters, type: v === 'all' ? [] : [v as DetectionType]})}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="road_scan">Road Scan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {detections.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-lg font-medium">No detections found</p>
                <p className="text-muted-foreground mt-1">Start detecting potholes to see them here</p>
                <Button className="mt-4" asChild><a href="/detect/image">Detect Potholes</a></Button>
              </div>
            ) : (
              <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thumbnail</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detections.map((detection) => (
                      <TableRow key={detection.id} className="hover:bg-muted/50">
                        <TableCell>
                          <DetectionThumbnail
                            media={((detection as DetectionRecord & { detection_media?: DetectionMedia[] }).detection_media) ?? []}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant={detection.severity_level.toLowerCase() as any} className={severityColors[detection.severity_level]}>
                            {detection.severity_level}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${detection.confidence * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-mono">{(detection.confidence * 100).toFixed(1)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {detection.latitude && detection.longitude ? (
                            <span className="font-mono text-sm">
                              {detection.latitude.toFixed(4)}, {detection.longitude.toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">No GPS</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="capitalize">{detection.source}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{detection.detection_type}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatRelativeTime(detection.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" asChild>
                            <a href={`/detections/${detection.id}`}>
                              <ChevronRight className="w-4 h-4" />
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {pagination.total > pagination.limit && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPagination(p => ({...p, page: p.page - 1}))} disabled={pagination.page === 1}>
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setPagination(p => ({...p, page: p.page + 1}))} disabled={pagination.page * pagination.limit >= pagination.total}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

// Missing icon imports
function Video({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
}
function Upload({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
}
function Camera({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="12" r="4"/></svg>;
}
function Smartphone({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>;
}
function ChevronRight({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>;
}
