'use client';

import * as React from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  Upload, 
  Video, 
  X, 
  Loader2, 
  Play, 
  Pause, 
  Download, 
  Save,
  AlertTriangle,
  Clock,
  FileVideo,
} from 'lucide-react';
import { predictVideo, validateVideoFile, waitForJobCompletion, getJobResultUrl } from '@/lib/ai-api';
import { createProcessingJob, updateProcessingJob, createSession, updateSession, getCurrentUser } from '@/lib/supabase';
import { saveDetectionsWithMedia, type GpsInfo } from '@/lib/detection-save';
import { cn, formatFileSize, formatDuration, getSeverityColor } from '@/lib/utils';
import type { JobStatusResponse, Detection, SeverityLevel } from '@/types';
import { AppShell } from '@/components/app-shell';
import { LocationPicker } from '@/components/location-picker';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export default function VideoDetectionPage() {
  const { toast } = useToast();
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [job, setJob] = React.useState<JobStatusResponse | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [confidenceThreshold, setConfidenceThreshold] = React.useState(0.25);
  const [iouThreshold, setIouThreshold] = React.useState(0.45);
  const [inferenceFps, setInferenceFps] = React.useState(5);
  const [returnAnnotated, setReturnAnnotated] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<'upload' | 'results'>('upload');
  const [videoRef, setVideoRef] = React.useState<HTMLVideoElement | null>(null);
  const [annotatedVideoUrl, setAnnotatedVideoUrl] = React.useState<string | null>(null);
  const [dbJobId, setDbJobId] = React.useState<string | null>(null);
  const [dbSessionId, setDbSessionId] = React.useState<string | null>(null);
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved'>('idle');
  const [gps, setGps] = React.useState<GpsInfo | null>(null);

  const onDrop = React.useCallback((acceptedFiles: File[]) => {
    const acceptedFile = acceptedFiles[0];
    const validation = validateVideoFile(acceptedFile);
    if (!validation.valid) {
      toast({ title: 'Invalid file', description: validation.error, variant: 'destructive' });
      return;
    }
    setFile(acceptedFile);
    setPreview(URL.createObjectURL(acceptedFile));
    setJob(null);
    setAnnotatedVideoUrl(null);
    setActiveTab('upload');
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/mp4': ['.mp4'],
      'video/webm': ['.webm'],
      'video/quicktime': ['.mov'],
    },
    maxSize: MAX_FILE_SIZE,
    noClick: false,
  });

  const removeFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setJob(null);
    setAnnotatedVideoUrl(null);
  };

  const handleDetect = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    setActiveTab('results');
    setSaveState('idle');

    let localDbJobId: string | null = null;
    let localDbSessionId: string | null = null;

    try {
      // Record the run in processing_jobs and detection_sessions so the
      // Sessions page and job history reflect real activity
      try {
        const user = await getCurrentUser();
        if (user) {
          const session = await createSession({
            user_id: user.id,
            session_type: 'video',
            status: 'active',
            metadata: { file_name: file.name, file_size: file.size } as never,
          });
          if (session.data) localDbSessionId = session.data.id;
          const job = await createProcessingJob({
            user_id: user.id,
            job_type: 'video',
            status: 'processing',
            progress: 0,
            input_path: file.name,
          });
          if (job.data) localDbJobId = job.data.id;
        }
      } catch (e) {
        console.error('Failed to record job/session:', e);
      }
      setDbJobId(localDbJobId);
      setDbSessionId(localDbSessionId);

      // Start async video processing
      const { job_id } = await predictVideo({
        file,
        confidence_threshold: confidenceThreshold,
        iou_threshold: iouThreshold,
        inference_fps: inferenceFps,
        return_annotated: returnAnnotated,
      });

      // Poll for completion
      const result = await waitForJobCompletion(
        job_id,
        (prog, status) => {
          setProgress(prog);
          if (localDbJobId && status === 'processing') {
            updateProcessingJob(localDbJobId, { progress: prog, status: 'processing' }).catch(() => {});
          }
        },
        600000, // 10 minute timeout
        3000
      );

      setJob(result);

      // The AI service serves the annotated video at /jobs/<id>/result —
      // go through the same-origin proxy so the secret stays server-side.
      if (result.result_url) {
        setAnnotatedVideoUrl(getJobResultUrl(job_id));
      }

      if (localDbJobId) {
        updateProcessingJob(localDbJobId, {
          status: result.status === 'completed' ? 'completed' : 'failed',
          progress: 100,
          result_json: {
            ai_job_id: job_id,
            detections: result.detections.length,
            processed_frames: result.processed_frames,
            total_frames: result.total_frames,
          } as never,
          completed_at: new Date().toISOString(),
        }).catch(() => {});
      }
      if (localDbSessionId) {
        updateSession(localDbSessionId, {
          status: result.status === 'completed' ? 'completed' : 'failed',
          ended_at: new Date().toISOString(),
          total_frames: result.total_frames,
          processed_frames: result.processed_frames,
          total_detections: result.detections.length,
          unique_potholes: result.detections.length,
        }).catch(() => {});
      }

      toast({
        title: 'Video processing complete',
        description: `Found ${result.detections.length} unique potholes in ${result.processed_frames} frames`
      });
    } catch (error: unknown) {
      if (localDbJobId) {
        updateProcessingJob(localDbJobId, {
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Video processing failed',
          completed_at: new Date().toISOString(),
        }).catch(() => {});
      }
      if (localDbSessionId) {
        updateSession(localDbSessionId, { status: 'failed', ended_at: new Date().toISOString() }).catch(() => {});
      }
      const message = error instanceof Error ? error.message : 'Video processing failed';
      toast({ title: 'Processing failed', description: message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 500);
    }
  };

  // Save the deduplicated potholes from this video to the dashboard
  const saveResults = async () => {
    if (!job || job.detections.length === 0) return;
    setSaveState('saving');
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated. Please sign in first.');
      const saved = await saveDetectionsWithMedia({
        userId: user.id,
        detections: job.detections,
        detectionType: 'video',
        source: 'upload',
        gps,
        sessionId: dbSessionId,
        extraMetadata: { video_file: file?.name ?? null },
      });
      setSaveState('saved');
      toast({
        title: 'Saved to dashboard',
        description:
          `${saved.savedCount} detection(s) saved` +
          (gps ? ' · GPS attached' : '') +
          (saved.warnings.length ? ` · ${saved.warnings[0]}` : ''),
      });
    } catch (error) {
      setSaveState('idle');
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <AppShell>
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Video Detection</h1>
          <p className="text-muted-foreground mt-1">
            Upload a video to detect potholes frame-by-frame with object tracking and deduplication.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'upload' | 'results')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">Upload & Process</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload" className="mt-6">
            <Card className={cn('relative', isDragActive && 'border-primary')}>
              <CardHeader>
                <CardTitle>Upload Video</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  {...getRootProps()}
                  className={cn(
                    'relative border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                    isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                  )}
                >
                  <input {...getInputProps()} />
                  <FileVideo className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  {file ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center gap-4 p-4 bg-muted rounded-lg">
                        <Video className="w-12 h-12 text-primary" />
                        <div className="text-left">
                          <p className="font-medium truncate max-w-xs">{file.name}</p>
                          <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={removeFile}>
                          <X className="w-5 h-5" />
                        </Button>
                      </div>
                      {preview && (
                        <div className="relative max-h-96">
                          <video 
                            ref={setVideoRef} 
                            src={preview} 
                            controls 
                            className="max-w-full h-auto rounded-lg"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-lg font-medium">Drag & drop a video here</p>
                      <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        MP4, WebM, MOV up to 500MB
                      </p>
                    </div>
                  )}
                </div>

                {/* Settings */}
                <Separator className="my-6" />
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="confidence">Confidence Threshold: {confidenceThreshold.toFixed(2)}</Label>
                    <Slider
                      id="confidence"
                      value={[confidenceThreshold]}
                      onValueChange={([v]) => setConfidenceThreshold(v)}
                      min={0}
                      max={1}
                      step={0.05}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="iou">IoU Threshold: {iouThreshold.toFixed(2)}</Label>
                    <Slider
                      id="iou"
                      value={[iouThreshold]}
                      onValueChange={([v]) => setIouThreshold(v)}
                      min={0}
                      max={1}
                      step={0.05}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="fps">Inference FPS: {inferenceFps}</Label>
                    <Slider
                      id="fps"
                      value={[inferenceFps]}
                      onValueChange={([v]) => setInferenceFps(v)}
                      min={1}
                      max={30}
                      step={1}
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Lower FPS = faster processing, fewer frames analyzed
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="annotated">Return Annotated Video</Label>
                    <Switch id="annotated" checked={returnAnnotated} onCheckedChange={setReturnAnnotated} />
                  </div>

                  <LocationPicker value={gps} onChange={setGps} />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 mt-6">
                  <Button 
                    onClick={handleDetect} 
                    disabled={!file || isProcessing}
                    className="flex-1"
                    size="lg"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing... {progress}%
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Process Video
                      </>
                    )}
                  </Button>
                  {file && !isProcessing && (
                    <Button variant="outline" onClick={removeFile}>
                      Clear
                    </Button>
                  )}
                </div>

                {isProcessing && (
                  <div className="mt-4 space-y-2">
                    <Progress value={progress} />
                    <p className="text-sm text-muted-foreground text-center">
                      This may take several minutes for long videos...
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Processing Results</CardTitle>
              </CardHeader>
              <CardContent>
                {!file && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Video className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>Upload and process a video to see results</p>
                  </div>
                )}

                {isProcessing && !job && (
                  <div className="text-center py-12">
                    <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
                    <p>Processing video frames...</p>
                    <Progress value={progress} className="mt-4" />
                    <p className="text-sm text-muted-foreground mt-2">
                      {progress}% complete
                    </p>
                  </div>
                )}

                {job && (
                  <div className="space-y-6">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Frames</p>
                        <p className="text-2xl font-bold">{job.total_frames}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Processed</p>
                        <p className="text-2xl font-bold">{job.processed_frames}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Unique Potholes</p>
                        <p className="text-2xl font-bold text-primary">{job.detections.length}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Status</p>
                        <Badge variant={job.status === 'completed' ? 'success' : 'warning'}>
                          {job.status}
                        </Badge>
                      </div>
                    </div>

                    {/* Severity Distribution */}
                    {job.detections.length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-3">Severity Distribution</h3>
                        <div className="flex flex-wrap gap-2">
                          {(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as SeverityLevel[]).map((level) => {
                            const count = job.detections.filter(d => d.severity.level === level).length;
                            return (
                              <Badge 
                                key={level} 
                                variant={level.toLowerCase() as any} 
                                className={cn(getSeverityColor(level), 'text-sm')}
                              >
                                {level}: {count}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Detections List */}
                    {job.detections.length > 0 && (
                      <div className="space-y-4 max-h-96 overflow-y-auto">
                        <h3 className="font-semibold">Detected Potholes (Tracked & Deduplicated)</h3>
                        {job.detections.map((detection, index) => (
                          <div key={index} className="border rounded-lg p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', getSeverityColor(detection.severity.level))}>
                                  <span className="text-white font-bold text-sm">{index + 1}</span>
                                </div>
                                <div>
                                  <p className="font-medium">Track #{detection.track_id?.slice(-6) || index + 1}</p>
                                  <p className="text-sm text-muted-foreground">
                                    Frames: {detection.metadata?.frame_count || 'N/A'} • 
                                    Avg Conf: {((detection.metadata?.avg_confidence || detection.confidence) * 100).toFixed(1)}%
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={detection.severity.level.toLowerCase() as any} className={cn(getSeverityColor(detection.severity.level), 'text-sm')}>
                                  {detection.severity.level}
                                </Badge>
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">BBox:</span>
                                <span className="ml-2 font-mono">
                                  [{detection.bbox.x1}, {detection.bbox.y1}, {detection.bbox.x2}, {detection.bbox.y2}]
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Severity Score:</span>
                                <span className="ml-2 font-mono">{detection.severity.score.toFixed(3)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">First Seen:</span>
                                <span className="ml-2 font-mono">{formatTime(detection.metadata?.first_frame_ms || 0)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {job.detections.length === 0 && job.status === 'completed' && (
                      <div className="text-center py-8">
                        <span className="text-6xl mb-4 block">🎉</span>
                        <p className="text-lg font-medium">No potholes detected in this video</p>
                        <p className="text-muted-foreground mt-1">The road appears to be in good condition</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-4 pt-4 border-t">
                      {job.detections.length > 0 && (
                        <Button
                          onClick={saveResults}
                          disabled={saveState !== 'idle'}
                          className={saveState === 'saved' ? 'bg-green-600 hover:bg-green-700' : ''}
                        >
                          {saveState === 'saving' ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : saveState === 'saved' ? (
                            <>
                              <Save className="w-4 h-4 mr-2" />
                              Saved to Dashboard
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4 mr-2" />
                              Save to Dashboard
                            </>
                          )}
                        </Button>
                      )}
                      {annotatedVideoUrl && (
                        <Button variant="outline" onClick={() => {
                          const a = document.createElement('a');
                          a.href = annotatedVideoUrl;
                          a.download = `annotated-${file?.name || 'video'}.mp4`;
                          a.click();
                        }}>
                          <Download className="w-4 h-4 mr-2" />
                          Download Annotated Video
                        </Button>
                      )}
                      <Button variant="outline" onClick={() => { setJob(null); setActiveTab('upload'); }}>
                        <X className="w-4 h-4 mr-2" />
                        Process Another Video
                      </Button>
                    </div>
                  </div>
                )}

                {job?.status === 'failed' && (
                  <div className="text-center py-8 text-destructive">
                    <AlertTriangle className="w-16 h-16 mx-auto mb-4" />
                    <p className="text-lg font-medium">Processing Failed</p>
                    <p className="text-muted-foreground mt-1">{job.error_message}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
