'use client';

import * as React from 'react';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getUserSessions, getCurrentUser } from '@/lib/supabase';
import { formatDateTime, formatDuration } from '@/lib/utils';
import type { DetectionSession } from '@/types';
import { Loader2, Route, Camera } from 'lucide-react';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  return <Badge className={map[status] || ''}>{status}</Badge>;
}

export default function SessionsPage() {
  const { toast } = useToast();
  const [sessions, setSessions] = React.useState<DetectionSession[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return;
        const { data, error } = await getUserSessions(user.id);
        if (error) throw error;
        setSessions((data || []) as unknown as DetectionSession[]);
      } catch (error) {
        toast({
          title: 'Failed to load sessions',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [toast]);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Detection Sessions</h1>
        <p className="text-sm text-muted-foreground">
          Live camera and video processing sessions recorded on your account.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading sessions…
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <Route className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="font-medium mt-4">No sessions yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Start a live detection or process a video to create your first session.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sessions.map((s) => {
            const duration =
              s.ended_at
                ? (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000
                : 0;
            return (
              <Card key={s.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Camera className="h-4 w-4 text-muted-foreground" />
                      {s.session_type === 'road_scan' ? 'Road Scan' : s.session_type.replace('_', ' ')}
                    </CardTitle>
                    {statusBadge(s.status)}
                  </div>
                  <CardDescription>Started {formatDateTime(s.started_at)}</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-4 gap-2 text-center text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Frames</p>
                    <p className="font-semibold">{s.processed_frames}/{s.total_frames}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Detections</p>
                    <p className="font-semibold">{s.total_detections}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Unique</p>
                    <p className="font-semibold">{s.unique_potholes}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Duration</p>
                    <p className="font-semibold">{duration > 0 ? formatDuration(duration) : '—'}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
