'use client';

import * as React from 'react';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getDetections, getCurrentUser, createReport, getUserReports } from '@/lib/supabase';
import { formatDateTime } from '@/lib/utils';
import { Loader2, Download, FileText, FileSpreadsheet, FileJson } from 'lucide-react';

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

export default function ReportsPage() {
  const { toast } = useToast();
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [reports, setReports] = React.useState<Array<{ id: string; title: string; report_type: string; status: string; created_at: string }>>([]);

  const loadReports = React.useCallback(async () => {
    const user = await getCurrentUser();
    if (!user) return;
    const { data } = await getUserReports(user.id);
    setReports(data || []);
  }, []);

  React.useEffect(() => {
    loadReports();
  }, [loadReports]);

  const generate = async (format: 'csv' | 'json') => {
    setIsGenerating(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not signed in');

      const { data, error } = await getDetections({
        date_from: from ? new Date(from).toISOString() : undefined,
        date_to: to ? new Date(to).toISOString() : undefined,
        limit: 1000,
      });
      if (error) throw error;
      const rows = (data || []) as Record<string, unknown>[];

      if (rows.length === 0) {
        toast({ title: 'No detections in range', description: 'Nothing to export for the selected date range.' });
        return;
      }

      let blob: Blob;
      let ext: string;
      if (format === 'csv') {
        blob = new Blob([toCsv(rows)], { type: 'text/csv' });
        ext = 'csv';
      } else {
        blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
        ext = 'json';
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smartpothole-report-${new Date().toISOString().slice(0, 10)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);

      await createReport({
        user_id: user.id,
        title: `Road damage export (${ext.toUpperCase()})`,
        report_type: 'date_range',
        date_from: from ? new Date(from).toISOString() : null,
        date_to: to ? new Date(to).toISOString() : null,
        filters_json: { format, count: rows.length },
        status: 'ready',
        completed_at: new Date().toISOString(),
      });
      await loadReports();

      toast({ title: `Export ready`, description: `${rows.length} detections exported as ${ext.toUpperCase()}.` });
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Export your detections as machine-readable reports for analysis or handover to road authorities.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Generate export</CardTitle>
            <CardDescription>Optionally limit the report to a date range. Exports include up to 1000 detections.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="from">From</Label>
                <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to">To</Label>
                <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => generate('csv')} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => generate('json')} disabled={isGenerating}>
                <FileJson className="mr-2 h-4 w-4" />
                Export JSON
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Note: severity in these exports is the AI-estimated severity recorded at detection time, not a certified engineering measurement.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Export history</CardTitle>
            <CardDescription>Reports you have generated previously.</CardDescription>
          </CardHeader>
          <CardContent>
            {reports.length === 0 ? (
              <div className="text-center py-10">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-3">No reports generated yet.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {reports.map((r) => (
                  <li key={r.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(r.created_at)} · {r.report_type.replace(/_/g, ' ')}</p>
                    </div>
                    <Badge variant="outline">{r.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
