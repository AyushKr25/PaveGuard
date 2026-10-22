'use client';

import * as React from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { getDetections, getCurrentUser, deleteDetection } from '@/lib/supabase';
import { cn, formatDateTime, getSeverityColor } from '@/lib/utils';
import type { DetectionRecord, SeverityLevel } from '@/types';
import { Loader2, Search, Trash2, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';

const SEVERITIES: SeverityLevel[] = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

export default function DetectionsPage() {
  const { toast } = useToast();
  const [detections, setDetections] = React.useState<DetectionRecord[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [severity, setSeverity] = React.useState<string>('all');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const PAGE_SIZE = 20;

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const { data, count, error } = await getDetections({
        severity_level: severity === 'all' ? undefined : [severity],
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      setDetections((data || []) as unknown as DetectionRecord[]);
      setTotal(count || 0);
    } catch (error) {
      toast({
        title: 'Failed to load detections',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [severity, page, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    const { error } = await deleteDetection(id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Detection deleted' });
    load();
  };

  const filtered = detections.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.id.toLowerCase().includes(q) ||
      d.source.includes(q) ||
      d.detection_type.includes(q)
    );
  });

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Detections</h1>
          <p className="text-sm text-muted-foreground">All pothole detections saved to your account.</p>
        </div>
        <div className="sm:ml-auto flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search…"
              className="pl-8 w-48"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search detections"
            />
          </div>
          <Select value={severity} onValueChange={(v) => { setSeverity(v); setPage(0); }}>
            <SelectTrigger className="w-36" aria-label="Filter by severity">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {SEVERITIES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading detections…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="font-medium">No detections yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Run detection on an image, video, or live camera and save the results.
              </p>
              <Button className="mt-4" asChild>
                <Link href="/detect/image">Detect Potholes</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead className="hidden md:table-cell">Source</TableHead>
                  <TableHead className="hidden lg:table-cell">Location</TableHead>
                  <TableHead className="hidden md:table-cell">Detected</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/detections/${d.id}`} className="hover:underline">
                        {d.id.slice(0, 8)}…
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge className={getSeverityColor(d.severity_level)}>{d.severity_level}</Badge>
                    </TableCell>
                    <TableCell>{(Number(d.confidence) * 100).toFixed(1)}%</TableCell>
                    <TableCell className="hidden md:table-cell capitalize">{d.source}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {d.latitude != null && d.longitude != null ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <MapPin className="h-3 w-3" />
                          {Number(d.latitude).toFixed(4)}, {Number(d.longitude).toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {formatDateTime(d.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(d.id)}
                        aria-label="Delete detection"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} of {Math.ceil(total / PAGE_SIZE)} · {total} detections
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage(page + 1)}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
