'use client';

import * as React from 'react';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { createBrowserSupabaseClient } from '@/lib/supabase';
import { formatDateTime } from '@/lib/utils';
import { Loader2, Users, Camera, AlertTriangle, ShieldAlert } from 'lucide-react';

interface AdminData {
  stats: {
    total_users?: number;
    total_detections?: number;
    by_severity?: Record<string, number>;
    by_source?: Record<string, number>;
    avg_confidence?: number;
    today_count?: number;
    recent_count?: number;
    pending_jobs?: number;
    failed_jobs?: number;
  };
  users: Array<{ id: string; email: string; full_name: string | null; role: string; created_at: string }>;
  failedJobs: Array<{ id: string; job_type: string; error_message: string | null; created_at: string }>;
  recentDetections: Array<{ id: string; severity_level: string; confidence: number; source: string; detection_type: string; created_at: string }>;
  modelCount: number;
}

export default function AdminPage() {
  const { toast } = useToast();
  const [data, setData] = React.useState<AdminData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [forbidden, setForbidden] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not signed in');
        const res = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        setData(await res.json());
      } catch (error) {
        toast({
          title: 'Failed to load admin data',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [toast]);

  if (isLoading) {
    return (
      <AppShell admin>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading admin data…
        </div>
      </AppShell>
    );
  }

  if (forbidden) {
    return (
      <AppShell admin>
        <div className="text-center py-24 space-y-3">
          <ShieldAlert className="h-12 w-12 mx-auto text-destructive" />
          <p className="font-medium">Admin access required</p>
          <p className="text-sm text-muted-foreground">Your account does not have the ADMIN role.</p>
        </div>
      </AppShell>
    );
  }

  if (!data) return null;

  const sev = data.stats.by_severity || {};

  return (
    <AppShell admin>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">Platform-wide statistics, users, and system health.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Users</p>
              <p className="text-3xl font-bold">{data.stats.total_users ?? 0}</p>
            </div>
            <Users className="h-8 w-8 text-primary/60" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Detections</p>
              <p className="text-3xl font-bold">{data.stats.total_detections ?? 0}</p>
            </div>
            <Camera className="h-8 w-8 text-primary/60" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Avg Confidence</p>
              <p className="text-3xl font-bold">{((Number(data.stats.avg_confidence) || 0) * 100).toFixed(1)}%</p>
            </div>
            <Camera className="h-8 w-8 text-primary/60" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Failed Jobs (7d)</p>
              <p className="text-3xl font-bold">{data.stats.failed_jobs ?? 0}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-destructive/60" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader><CardTitle>Severity Distribution</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const).map((level) => {
              const value = sev[level] || 0;
              const total = data.stats.total_detections || 1;
              return (
                <div key={level} className="flex items-center gap-3">
                  <span className="text-sm w-20">{level}</span>
                  <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${(value / total) * 100}%` }} />
                  </div>
                  <span className="text-sm text-muted-foreground w-10 text-right">{value}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>System Health</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Registered model versions</span>
              <span className="font-medium">{data.modelCount}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Pending processing jobs</span>
              <span className="font-medium">{data.stats.pending_jobs ?? 0}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Detections today</span>
              <span className="font-medium">{data.stats.today_count ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Detections last 7 days</span>
              <span className="font-medium">{data.stats.recent_count ?? 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recent Users</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === 'ADMIN' ? 'default' : 'outline'}>{u.role}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(u.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent Detections (all users)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Conf.</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentDetections.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell><Badge variant="outline">{d.severity_level}</Badge></TableCell>
                    <TableCell>{(Number(d.confidence) * 100).toFixed(0)}%</TableCell>
                    <TableCell className="capitalize text-sm">{d.source}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(d.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {data.failedJobs.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Failed Jobs</CardTitle>
            <CardDescription>Most recent processing failures.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.failedJobs.map((j) => (
              <div key={j.id} className="flex items-start gap-2 border-b pb-2 last:border-0">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">{j.job_type} job</p>
                  <p className="text-muted-foreground">{j.error_message || 'Unknown error'} · {formatDateTime(j.created_at)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
