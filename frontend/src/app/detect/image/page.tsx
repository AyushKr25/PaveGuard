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
import { useToast } from '@/hooks/use-toast';
import {
  Upload,
  Image,
  X,
  CheckCircle,
  Loader2,
  Download,
  Save,
  MapPin,
  Eye,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { predictImage, validateImageFile, checkAIServiceHealthStatus } from '@/lib/ai-api';
import { getCurrentUser } from '@/lib/supabase';
import { saveDetectionsWithMedia, dataUrlToBlob, getDetectionDefaults, type GpsInfo } from '@/lib/detection-save';
import { cn, formatFileSize, getSeverityColor } from '@/lib/utils';
import type { AIResponse, Detection, SeverityLevel } from '@/types';
import { AppShell } from '@/components/app-shell';
import { LocationPicker } from '@/components/location-picker';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function ImageDetectionPage() {
  const { toast } = useToast();
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<AIResponse | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [confidenceThreshold, setConfidenceThreshold] = React.useState(0.25);
  const [iouThreshold, setIouThreshold] = React.useState(0.45);
  const [returnAnnotated, setReturnAnnotated] = React.useState(true);
  const [saveToDb, setSaveToDb] = React.useState(false);
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved'>('idle');
  const [aiStatus, setAiStatus] = React.useState<'checking' | 'online' | 'offline'>('checking');
  const [aiModelName, setAiModelName] = React.useState<string>('');
  const [annotatedImage, setAnnotatedImage] = React.useState<string | null>(null);
  const [gps, setGps] = React.useState<GpsInfo | null>(null);

  React.useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      const status = await checkAIServiceHealthStatus();
      if (!active) return;
      setAiStatus(status.online ? 'online' : 'offline');
      setAiModelName(status.modelName);
      // Keep polling while offline so the badge recovers when the service starts
      if (!status.online) {
        timer = setTimeout(check, 15_000);
      }
    };

    check();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Apply the defaults saved on the Settings page. Location is deliberately
  // NOT auto-detected: the user picks it explicitly with the LocationPicker.
  React.useEffect(() => {
    (async () => {
      const defaults = await getDetectionDefaults();
      if (!defaults) return;
      setConfidenceThreshold(defaults.confidence_threshold);
      setSaveToDb(defaults.auto_save_detections);
    })();
  }, []);

  const onDrop = React.useCallback((acceptedFiles: File[]) => {
    const acceptedFile = acceptedFiles[0];
    const validation = validateImageFile(acceptedFile);
    if (!validation.valid) {
      toast({ title: 'Invalid file', description: validation.error, variant: 'destructive' });
      return;
    }
    setFile(acceptedFile);
    setPreview(URL.createObjectURL(acceptedFile));
    setResult(null);
    setAnnotatedImage(null);
    setSaveState('idle');
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    maxSize: MAX_FILE_SIZE,
    noClick: false,
  });

  const removeFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setResult(null);
    setAnnotatedImage(null);
    setSaveState('idle');
  };

  // Client-side annotation fallback (server-annotated image is preferred)
  const drawAnnotations = (imageSrc: string, detections: Detection[]): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0);

        detections.forEach((detection) => {
          const { x1, y1, x2, y2 } = detection.bbox;
          const color = getSeverityColorClass(detection.severity.level);

          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

          const label = `${detection.class_name} ${(detection.confidence * 100).toFixed(1)}% ${detection.severity.level}`;
          ctx.font = '14px system-ui';
          const textWidth = ctx.measureText(label).width;
          ctx.fillStyle = color;
          ctx.fillRect(x1, y1 - 24, textWidth + 12, 24);

          ctx.fillStyle = '#fff';
          ctx.fillText(label, x1 + 6, y1 - 6);

          if (detection.segmentation?.points) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            detection.segmentation.points.forEach((point, i) => {
              if (i === 0) ctx.moveTo(point[0], point[1]);
              else ctx.lineTo(point[0], point[1]);
            });
            ctx.closePath();
            ctx.stroke();
          }
        });

        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(null);
      img.src = imageSrc;
    });
  };

  const getSeverityColorClass = (level: SeverityLevel): string => {
    switch (level) {
      case 'LOW': return '#22c55e';
      case 'MODERATE': return '#f59e0b';
      case 'HIGH': return '#ef4444';
      case 'CRITICAL': return '#991b1b';
      default: return '#22c55e';
    }
  };

  const saveDetections = async (response: AIResponse) => {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated. Please sign in first.');
    if (response.detections.length === 0) throw new Error('No potholes to save');

    // Prefer the annotated image returned by the AI service; fall back to a
    // locally-annotated copy of the original.
    let annotatedBlob: Blob | null = null;
    if (annotatedImage) {
      annotatedBlob = await dataUrlToBlob(annotatedImage);
    }

    const saved = await saveDetectionsWithMedia({
      userId: user.id,
      detections: response.detections,
      detectionType: 'image',
      source: 'upload',
      gps,
      getMediaFor: () => ({ original: file, annotated: annotatedBlob }),
    });

    setSaveState('saved');
    toast({
      title: 'Saved to dashboard',
      description:
        `${saved.savedCount} detection(s) · ${saved.mediaCount} image(s) stored` +
        (gps ? ' · GPS attached' : '') +
        (saved.warnings.length ? ` · ${saved.warnings[0]}` : ''),
    });
  };

  const handleDetect = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    setSaveState('idle');

    try {
      // Simulated progress while the upload/inference round-trip runs
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      const response = await predictImage({
        file,
        confidence_threshold: confidenceThreshold,
        iou_threshold: iouThreshold,
        return_annotated: returnAnnotated,
      });

      clearInterval(progressInterval);
      setProgress(100);
      setResult(response);
      setAnnotatedImage(null);

      // Prefer the server-annotated image; fall back to local annotation
      if (response.annotated_image) {
        setAnnotatedImage(`data:image/jpeg;base64,${response.annotated_image}`);
      } else if (preview && response.detections.length > 0) {
        const local = await drawAnnotations(preview, response.detections);
        if (local) setAnnotatedImage(local);
      }

      toast({ title: 'Detection complete', description: `Found ${response.detections.length} pothole(s)` });

      // Save to database if auto-save is enabled
      if (saveToDb && response.detections.length > 0) {
        try {
          await saveDetections(response);
        } catch (error) {
          toast({
            title: 'Save failed',
            description: error instanceof Error ? error.message : 'Could not save detections',
            variant: 'destructive',
          });
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Detection failed';
      toast({ title: 'Detection failed', description: message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 500);
    }
  };

  const downloadAnnotated = () => {
    if (annotatedImage) {
      const link = document.createElement('a');
      link.download = `pothole-detection-${Date.now()}.jpg`;
      link.href = annotatedImage;
      link.click();
    }
  };

  return (
    <AppShell>
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">Image Detection</h1>
            {aiStatus === 'online' && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                AI Service online{aiModelName ? ` · ${aiModelName}` : ''}
              </Badge>
            )}
            {aiStatus === 'offline' && (
              <Badge variant="destructive">AI Service offline — detection unavailable</Badge>
            )}
            {gps && (
              <Badge variant="secondary" className="gap-1">
                <MapPin className="w-3 h-3" />
                {gps.lat.toFixed(4)}, {gps.lng.toFixed(4)}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Upload an image to detect potholes with AI-powered segmentation and AI-estimated severity.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Upload Area */}
          <Card className={cn('relative', isDragActive && 'border-primary')}>
            <CardHeader>
              <CardTitle>Upload Image</CardTitle>
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
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                {file ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-4 p-4 bg-muted rounded-lg">
                      <Image className="w-12 h-12 text-primary" />
                      <div className="text-left">
                        <p className="font-medium truncate max-w-xs">{file.name}</p>
                        <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); removeFile(); }}>
                        <X className="w-5 h-5" />
                      </Button>
                    </div>
                    {preview && (
                      <div className="relative max-h-96 overflow-auto rounded-lg">
                        {/* Show the annotated image once available, otherwise the raw preview */}
                        <img
                          src={annotatedImage || preview}
                          alt={annotatedImage ? 'Annotated detection result' : 'Selected image preview'}
                          className="max-w-full h-auto"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-lg font-medium">Drag &amp; drop an image here</p>
                    <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      JPEG, PNG, WebP up to 10MB
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="annotated">Return Annotated Image</Label>
                  <Switch id="annotated" checked={returnAnnotated} onCheckedChange={setReturnAnnotated} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="save">Auto-save to Dashboard</Label>
                    <p className="text-xs text-muted-foreground">Saves automatically when detection completes. You can also save manually from the results panel.</p>
                  </div>
                  <Switch id="save" checked={saveToDb} onCheckedChange={setSaveToDb} />
                </div>

                <LocationPicker value={gps} onChange={setGps} />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 mt-6">
                <Button
                  onClick={handleDetect}
                  disabled={!file || isProcessing || aiStatus === 'offline'}
                  className="flex-1"
                  size="lg"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing... {progress}%
                    </>
                  ) : (
                    'Detect Potholes'
                  )}
                </Button>
                {file && !isProcessing && (
                  <Button variant="outline" onClick={removeFile}>
                    Clear
                  </Button>
                )}
              </div>

              {isProcessing && (
                <Progress value={progress} className="mt-4" />
              )}
            </CardContent>
          </Card>

          {/* Results */}
          <Card>
            <CardHeader>
              <CardTitle>Detection Results</CardTitle>
            </CardHeader>
            <CardContent>
              {file && !result && !isProcessing && (
                <div className="text-center py-12 text-muted-foreground">
                  <Image className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Upload an image and click &quot;Detect Potholes&quot; to see results</p>
                </div>
              )}

              {isProcessing && (
                <div className="text-center py-12">
                  <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
                  <p>Analyzing image...</p>
                  <Progress value={progress} className="mt-4" />
                </div>
              )}

              {result && (
                <div className="space-y-6">
                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Detections</p>
                      <p className="text-2xl font-bold">{result.detections.length}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Confidence</p>
                      <p className="text-2xl font-bold">
                        {result.detections.length > 0
                          ? `${(result.detections.reduce((a, b) => a + b.confidence, 0) / result.detections.length * 100).toFixed(1)}%`
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Inference Time</p>
                      <p className="text-2xl font-bold">{result.processing.latency_ms}ms</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Model</p>
                      <p className="text-sm font-bold mt-2">{result.model.name} {result.model.version}</p>
                    </div>
                  </div>

                  {/* Detections List */}
                  {result.detections.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="font-semibold">Detected Potholes</h3>
                      {result.detections.map((detection, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', getSeverityColor(detection.severity.level))}>
                                <CheckCircle className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <p className="font-medium">{detection.class_name} #{index + 1}</p>
                                <p className="text-sm text-muted-foreground">
                                  Confidence: {(detection.confidence * 100).toFixed(1)}% • Severity score: {detection.severity.score.toFixed(2)} (AI-estimated)
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={detection.severity.level.toLowerCase() as any} className={getSeverityColor(detection.severity.level)}>
                                {detection.severity.level}
                              </Badge>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">BBox:</span>
                              <span className="ml-2 font-mono">
                                [{detection.bbox.x1.toFixed(0)}, {detection.bbox.y1.toFixed(0)}, {detection.bbox.x2.toFixed(0)}, {detection.bbox.y2.toFixed(0)}]
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Severity Score:</span>
                              <span className="ml-2 font-mono">{detection.severity.score.toFixed(3)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Severity Conf:</span>
                              <span className="ml-2 font-mono">{detection.severity.confidence.toFixed(3)}</span>
                            </div>
                          </div>
                          {detection.segmentation && (
                            <div className="mt-3 text-sm">
                              <span className="text-muted-foreground">Segmentation Area:</span>
                              <span className="ml-2 font-mono">{detection.segmentation.area.toFixed(0)}px²</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {result.detections.length === 0 && !isProcessing && (
                    <div className="text-center py-8">
                      <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
                      <p className="text-lg font-medium">No potholes detected</p>
                      <p className="text-muted-foreground mt-1">Try lowering the confidence threshold or upload a different image</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-4 pt-4 border-t">
                    {result.detections.length > 0 && (
                      <Button
                        onClick={async () => {
                          setSaveState('saving');
                          try {
                            await saveDetections(result);
                          } catch (error) {
                            setSaveState('idle');
                            toast({
                              title: 'Save failed',
                              description: error instanceof Error ? error.message : 'Could not save detections',
                              variant: 'destructive',
                            });
                          }
                        }}
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
                            <CheckCircle className="w-4 h-4 mr-2" />
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
                    {annotatedImage && (
                      <Button variant="outline" onClick={downloadAnnotated}>
                        <Download className="w-4 h-4 mr-2" />
                        Download Annotated
                      </Button>
                    )}
                    <Button variant="outline" onClick={removeFile}>
                      <X className="w-4 h-4 mr-2" />
                      New Detection
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
