'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  getDetectionById,
  getDetectionFeedback,
  submitFeedback,
  getCurrentUser,
  getSignedUrl,
} from '@/lib/supabase';
import { formatDateTime, getSeverityColor } from '@/lib/utils';
import type { DetectionRecord } from '@/types';
import type { Detection as DBDetectionRecord } from '@/types/database';
import type { SeverityLevel } from '@/types/database';
import { Loader2, MapPin, ArrowLeft, MessageSquare } from 'lucide-react';

export default function DetectionDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [detection, setDetection] = React.useState<(DBDetectionRecord & { model_versions?: { name: string; version: string; task: string } | null }) | null>(null);
  const [mediaUrl, setMediaUrl] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<Array<{ id: string; is_correct: boolean | null; comment: string | null; actual_severity: string | null; created_at: string }>>([]);
  const [fbLabel, setFbLabel] = React.useState<string>('pothole');
  const [fbSeverity, setFbSeverity] = React.useState<string>('HIGH');
  const [fbCorrect, setFbCorrect] = React.useState<boolean>(true);
  const [fbComment, setFbComment] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const { data, error } = await getDetectionById(params.id);
        if (error) throw error;
        setDetection(data as unknown as DetectionRecord);

        // Load the stored media via a signed URL if present
        const media = (data as { detection_media?: Array<{ storage_path: string }> }).detection_media?.[0];
        if (media) {
          const { data: signed } = await getSignedUrl('detection-images', media.storage_path);
          if (signed) setMediaUrl(signed.signedUrl);
        }

        const fbUser = await getCurrentUser();
        if (fbUser) {
          const { data: fbData } = await getDetectionFeedback(params.id);
          setFeedback(fbData || []);
        }
      } catch (error) {
        toast({
          title: 'Detection not found',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [params.id, toast]);

  const handleFeedback = async () => {
    setIsSubmitting(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not signed in');
      const { error } = await submitFeedback({
        user_id: user.id,
        detection_id: params.id,
        actual_label: fbLabel as 'pothole' | 'not_pothole' | 'crack' | 'patch' | 'other',
        actual_severity: fbSeverity as SeverityLevel,
        is_correct: fbCorrect,
        comment: fbComment || null,
      });
      if (error) throw error;
      toast({ title: 'Feedback recorded', description: 'Thank you — feedback improves future model versions.' });
      setFbComment('');
      const { data: fbData } = await getDetectionFeedback(params.id);
      setFeedback(fbData || []);
    } catch (error) {
      toast({
        title: 'Could not save feedback',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading detection…
        </div>
      </AppShell>
    );
  }

  if (!detection) {
    return (
      <AppShell>
        <div className="text-center py-24 space-y-3">
          <p className="font-medium">Detection not found</p>
          <Button asChild variant="outline">
            <Link href="/detections">Back to detections</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const metadata = (detection.metadata || {}) as { bbox?: { x1: number; y1: number; x2: number; y2: number }; model?: { name?: string; version?: string } };

  return (
    <AppShell>
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href="/detections"><ArrowLeft className="h-4 w-4 mr-1" /> All detections</Link>
      </Button>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Capture</CardTitle>
            <CardDescription>Detection ID: <span className="font-mono text-xs">{detection.id}</span></CardDescription>
          </CardHeader>
          <CardContent>
            {mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl} alt="Detection capture" className="rounded-md w-full object-cover" />
            ) : (
              <div className="rounded-md border border-dashed py-16 text-center text-sm text-muted-foreground">
                No stored media for this detection.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Severity</p>
                <Badge className={`${getSeverityColor(detection.severity_level)} mt-1`}>
                  {detection.severity_level}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Severity score</p>
                <p className="font-medium mt-1">{Number(detection.severity_score).toFixed(2)} (AI-estimated)</p>
              </div>
              <div>
                <p className="text-muted-foreground">Model confidence</p>
                <p className="font-medium mt-1">{(Number(detection.confidence) * 100).toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Source</p>
                <p className="font-medium mt-1 capitalize">{detection.source}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Detected at</p>
                <p className="font-medium mt-1">{formatDateTime(detection.created_at)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Model</p>
                <p className="font-medium mt-1">
                  {detection.model_versions?.name
                    ? `${detection.model_versions.name} ${detection.model_versions.version}`
                    : metadata.model?.name
                      ? `${metadata.model.name} ${metadata.model.version ?? ''}`
                      : 'Unknown'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Location</p>
                {detection.latitude != null && detection.longitude != null ? (
                  <p className="font-medium mt-1 inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {Number(detection.latitude).toFixed(5)}, {Number(detection.longitude).toFixed(5)}
                    {detection.location_accuracy != null && ` (±${Number(detection.location_accuracy)}m)`}
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">No GPS recorded</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Give feedback
              </CardTitle>
              <CardDescription>
                Your feedback is stored and can be exported later as training data for retraining.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Is it correct?</Label>
                  <Select value={fbCorrect ? 'yes' : 'no'} onValueChange={(v) => setFbCorrect(v === 'yes')}>
                    <SelectTrigger aria-label="Detection correct"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Correct</SelectItem>
                      <SelectItem value="no">Incorrect</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Actual label</Label>
                  <Select value={fbLabel} onValueChange={setFbLabel}>
                    <SelectTrigger aria-label="Actual label"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pothole">Pothole</SelectItem>
                      <SelectItem value="not_pothole">Not a pothole</SelectItem>
                      <SelectItem value="crack">Crack</SelectItem>
                      <SelectItem value="patch">Patch</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Actual severity</Label>
                  <Select value={fbSeverity} onValueChange={setFbSeverity}>
                    <SelectTrigger aria-label="Actual severity"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fb-comment">Comment (optional)</Label>
                <Textarea
                  id="fb-comment"
                  placeholder="Anything worth noting about this detection…"
                  value={fbComment}
                  onChange={(e) => setFbComment(e.target.value)}
                  rows={2}
                />
              </div>
              <Button onClick={handleFeedback} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit feedback
              </Button>

              {feedback.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Correct</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Comment</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feedback.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell>{f.is_correct == null ? '—' : f.is_correct ? 'Yes' : 'No'}</TableCell>
                        <TableCell>{f.actual_severity ?? '—'}</TableCell>
                        <TableCell className="max-w-40 truncate">{f.comment || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(f.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
