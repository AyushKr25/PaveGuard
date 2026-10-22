'use client';

import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Video,
  Camera,
  RotateCcw,
  Download,
  Save,
  MapPin,
  X,
  AlertTriangle,
  Zap,
  Target,
  Settings,
  Maximize2,
  Clock,
  CheckCircle,
  Loader2,
  Pause,
} from 'lucide-react';
import { trackFrame, checkAIServiceHealthStatus } from '@/lib/ai-api';
import { getCurrentUser, createSession, updateSession } from '@/lib/supabase';
import {
  saveDetectionsWithMedia,
  getDetectionDefaults,
  type GpsInfo,
} from '@/lib/detection-save';
import { cn, getSeverityColor } from '@/lib/utils';
import type { Detection, AIResponse } from '@/types';
import { AppShell } from '@/components/app-shell';
import { LocationPicker } from '@/components/location-picker';

const SEVERITY_STROKE: Record<string, string> = {
  LOW: '#22c55e',
  MODERATE: '#f59e0b',
  HIGH: '#ef4444',
  CRITICAL: '#991b1b',
};

export default function LiveDetectionPage() {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  // Offscreen canvases: one for raw frame capture, one for video+overlay composition
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number>(0);
  const lastInferenceRef = useRef<number>(0);
  const detectionsRef = useRef<Detection[]>([]);
  const inferenceTimesRef = useRef<number[]>([]);
  const sessionStatsRef = useRef({ inferences: 0, cumulativeDetections: 0, startedAt: 0 });
  const sessionIdRef = useRef<string | null>(null);
  const savedKeysRef = useRef<Set<string>>(new Set());
  const lastAutoSaveRef = useRef(0);

  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraPermission, setCameraPermission] = useState<'prompt' | 'granted' | 'denied' | 'unavailable'>('prompt');
  const [inferenceMode, setInferenceMode] = useState<'auto' | 'browser' | 'cloud'>('cloud');
  const [inferenceFps, setInferenceFps] = useState(5);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.25);
  const [iouThreshold, setIouThreshold] = useState(0.45);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [stats, setStats] = useState({
    fps: 0,
    inferenceLatency: 0,
    currentDetections: 0,
    cumulativeDetections: 0,
    sessionDuration: 0,
  });
  const [gpsCoordinates, setGpsCoordinates] = useState<GpsInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveToDb, setSaveToDb] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [aiStatus, setAiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [aiModelName, setAiModelName] = useState('');

  // Refs mirroring state so the animation loop always reads current values
  const inferenceFpsRef = useRef(inferenceFps);
  const confidenceRef = useRef(confidenceThreshold);
  const iouRef = useRef(iouThreshold);
  const modeRef = useRef(inferenceMode);
  const aiOnlineRef = useRef(false);
  inferenceFpsRef.current = inferenceFps;
  confidenceRef.current = confidenceThreshold;
  iouRef.current = iouThreshold;
  modeRef.current = inferenceMode;
  aiOnlineRef.current = aiStatus === 'online';

  // AI service health (polled while offline so the badge recovers)
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const status = await checkAIServiceHealthStatus();
      if (!active) return;
      setAiStatus(status.online ? 'online' : 'offline');
      setAiModelName(status.modelName);
      if (!status.online) timer = setTimeout(check, 15_000);
    };
    check();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Apply the defaults saved on the Settings page. Location is deliberately
  // NOT auto-detected: it is set explicitly via the LocationPicker (GPS or
  // manual coordinates), so nothing fake is ever attached to a detection.
  useEffect(() => {
    (async () => {
      const defaults = await getDetectionDefaults();
      if (!defaults) return;
      setInferenceMode(defaults.inference_mode === 'browser' ? 'browser' : defaults.inference_mode === 'auto' ? 'auto' : 'cloud');
      setInferenceFps(defaults.inference_fps);
      setConfidenceThreshold(defaults.confidence_threshold);
      setSaveToDb(defaults.auto_save_detections);
    })();
  }, []);

  const getCaptureCanvas = useCallback(() => {
    if (!captureCanvasRef.current) captureCanvasRef.current = document.createElement('canvas');
    return captureCanvasRef.current;
  }, []);

  // Compose raw video frame + overlay boxes into a single evidence canvas
  const composeEvidence = useCallback((withOverlay: boolean): HTMLCanvasElement | null => {
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;
    if (!video || video.videoWidth === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (withOverlay && overlay && overlay.width === canvas.width) {
      ctx.drawImage(overlay, 0, 0);
    }
    return canvas;
  }, []);

  // Convert video frame to base64 (offscreen canvas — the visible overlay is untouched)
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = getCaptureCanvas();
    if (!video || video.videoWidth === 0) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  }, [getCaptureCanvas]);

  // Run inference on the current frame
  const runInference = useCallback(async () => {
    const base64 = captureFrame();
    if (!base64) return;

    const startTime = performance.now();

    try {
      const response: AIResponse = await trackFrame({
        image_base64: base64,
        confidence_threshold: confidenceRef.current,
        iou_threshold: iouRef.current,
        track: true,
        timestamp: Date.now(),
      });

      const latency = performance.now() - startTime;
      inferenceTimesRef.current.push(startTime);

      sessionStatsRef.current.inferences += 1;
      sessionStatsRef.current.cumulativeDetections += response.detections.length;

      detectionsRef.current = response.detections;
      setDetections(response.detections);
      setStats(prev => ({
        ...prev,
        inferenceLatency: Math.round(latency),
        currentDetections: response.detections.length,
        cumulativeDetections: sessionStatsRef.current.cumulativeDetections,
      }));
    } catch (err) {
      console.error('Inference error:', err);
    }
  }, [captureFrame]);

  // Main detection loop: a real requestAnimationFrame loop that runs inference
  // at the configured FPS and redraws the overlay every frame.
  useEffect(() => {
    if (!isRunning || isPaused) return;

    let stop = false;

    const drawOverlay = () => {
      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) return;

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      detectionsRef.current.forEach((detection) => {
        const { x1, y1, x2, y2 } = detection.bbox;
        const severity = detection.severity.level;
        const strokeColor = SEVERITY_STROKE[severity] || '#22c55e';

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 3;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        const label = `${detection.class_name} ${(detection.confidence * 100).toFixed(1)}% ${severity}`;
        ctx.font = 'bold 14px system-ui';
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = strokeColor;
        ctx.fillRect(x1, y1 - 28, textWidth + 16, 28);

        ctx.fillStyle = '#fff';
        ctx.fillText(label, x1 + 8, y1 - 8);

        if (detection.track_id) {
          const trackLabel = `ID: ${detection.track_id.slice(-6)}`;
          ctx.font = '12px system-ui';
          const trackWidth = ctx.measureText(trackLabel).width;
          ctx.fillStyle = strokeColor;
          ctx.fillRect(x1, y2, trackWidth + 12, 22);
          ctx.fillStyle = '#fff';
          ctx.fillText(trackLabel, x1 + 6, y2 + 16);
        }

        if (detection.segmentation?.points) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          detection.segmentation.points.forEach((point, i) => {
            if (i === 0) ctx.moveTo(point[0], point[1]);
            else ctx.lineTo(point[0], point[1]);
          });
          ctx.closePath();
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    };

    const loop = (t: number) => {
      if (stop) return;

      const interval = 1000 / Math.max(1, inferenceFpsRef.current);
      const canInfer =
        modeRef.current !== 'browser' && aiOnlineRef.current && !document.hidden;

      if (canInfer && t - lastInferenceRef.current >= interval) {
        lastInferenceRef.current = t;
        runInference();
      }

      drawOverlay();
      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => {
      stop = true;
      cancelAnimationFrame(animationRef.current);
    };
  }, [isRunning, isPaused, runInference]);

  // Measure real inference FPS (inferences completed in the last 2 seconds)
  // and refresh session duration once per second while running.
  useEffect(() => {
    if (!isRunning || isPaused) return;
    const tick = setInterval(() => {
      const now = performance.now();
      inferenceTimesRef.current = inferenceTimesRef.current.filter((ts) => now - ts < 2000);
      const measuredFps = inferenceTimesRef.current.length / 2;
      const duration = sessionStatsRef.current.startedAt
        ? Math.floor((Date.now() - sessionStatsRef.current.startedAt) / 1000)
        : 0;
      setStats(prev => ({
        ...prev,
        fps: Math.round(measuredFps * 10) / 10,
        sessionDuration: duration,
      }));
    }, 500);
    return () => clearInterval(tick);
  }, [isRunning, isPaused]);

  const persistDetections = useCallback(
    async (toSave: Detection[]) => {
      if (toSave.length === 0) {
        toast({ title: 'No detections', description: 'No potholes are visible to save right now.', variant: 'destructive' });
        return false;
      }
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated. Please sign in first.');

      const evidence = composeEvidence(true);
      const rawFrame = composeEvidence(false);
      const evidenceBlob: Blob | null = await new Promise((resolve) =>
        evidence ? evidence.toBlob((b) => resolve(b), 'image/jpeg', 0.9) : resolve(null)
      );
      const rawBlob: Blob | null = await new Promise((resolve) =>
        rawFrame ? rawFrame.toBlob((b) => resolve(b), 'image/jpeg', 0.9) : resolve(null)
      );

      const result = await saveDetectionsWithMedia({
        userId: user.id,
        detections: toSave,
        detectionType: 'live',
        source: 'camera',
        gps: gpsCoordinates,
        sessionId: sessionIdRef.current,
        getMediaFor: () => ({ original: rawBlob, annotated: evidenceBlob }),
      });

      toast({
        title: 'Saved to dashboard',
        description:
          `${result.savedCount} detection(s) · ${result.mediaCount} image(s) stored` +
          (gpsCoordinates ? ' · GPS attached' : '') +
          (result.warnings.length ? ` · ${result.warnings[0]}` : ''),
      });
      return true;
    },
    [composeEvidence, gpsCoordinates, toast]
  );

  // Manual save of the current detections
  const saveDetection = useCallback(async () => {
    setIsSaving(true);
    try {
      const ok = await persistDetections(detectionsRef.current);
      if (ok) {
        detectionsRef.current.forEach((d) => {
          savedKeysRef.current.add(d.track_id || `${Math.round(d.bbox.x1)},${Math.round(d.bbox.y1)},${Math.round(d.bbox.x2)},${Math.round(d.bbox.y2)}`);
        });
        setSavedCount((c) => c + detectionsRef.current.length);
      }
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }, [persistDetections, toast]);

  // Real auto-save: every 10 s, persist any tracks that have not been saved yet
  useEffect(() => {
    if (!saveToDb || !isRunning || isPaused) return;
    const tick = setInterval(async () => {
      if (Date.now() - lastAutoSaveRef.current < 10_000 || isSaving) return;
      const current = detectionsRef.current;
      const unsaved = current.filter((d) => {
        const key = d.track_id || `${Math.round(d.bbox.x1)},${Math.round(d.bbox.y1)},${Math.round(d.bbox.x2)},${Math.round(d.bbox.y2)}`;
        return !savedKeysRef.current.has(key);
      });
      if (unsaved.length === 0) return;
      lastAutoSaveRef.current = Date.now();
      setIsSaving(true);
      try {
        const ok = await persistDetections(unsaved);
        if (ok) {
          unsaved.forEach((d) => {
            savedKeysRef.current.add(d.track_id || `${Math.round(d.bbox.x1)},${Math.round(d.bbox.y1)},${Math.round(d.bbox.x2)},${Math.round(d.bbox.y2)}`);
          });
          setSavedCount((c) => c + unsaved.length);
        }
      } catch (err) {
        console.error('Auto-save failed:', err);
      } finally {
        setIsSaving(false);
      }
    }, 2000);
    return () => clearInterval(tick);
  }, [saveToDb, isRunning, isPaused, isSaving, persistDetections]);

  // Create a detection session when the camera starts
  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
      setCameraPermission('granted');

      sessionStatsRef.current = { inferences: 0, cumulativeDetections: 0, startedAt: Date.now() };
      savedKeysRef.current = new Set();
      setSavedCount(0);
      setIsRunning(true);

      // Record the session so the Sessions page shows real data
      try {
        const user = await getCurrentUser();
        if (user) {
          const { data, error } = await createSession({
            user_id: user.id,
            session_type: 'live',
            status: 'active',
          });
          if (!error && data) sessionIdRef.current = data.id;
        }
      } catch (e) {
        console.error('Failed to create session record:', e);
      }
    } catch (err) {
      setCameraPermission('denied');
      setError('Camera access denied. Please allow camera permissions in your browser settings.');
      toast({ title: 'Camera Error', description: 'Could not access camera', variant: 'destructive' });
    }
  }, [facingMode, toast]);

  const stopCamera = useCallback(async () => {
    // Finalize the session record with the real counters
    const statsSnap = sessionStatsRef.current;
    if (sessionIdRef.current) {
      try {
        await updateSession(sessionIdRef.current, {
          status: 'completed',
          ended_at: new Date().toISOString(),
          processed_frames: statsSnap.inferences,
          total_frames: statsSnap.inferences,
          total_detections: statsSnap.cumulativeDetections,
          unique_potholes: savedKeysRef.current.size,
        });
      } catch (e) {
        console.error('Failed to finalize session record:', e);
      }
      sessionIdRef.current = null;
    }

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    cancelAnimationFrame(animationRef.current);
    detectionsRef.current = [];
    setDetections([]);
    setIsRunning(false);
    setIsPaused(false);
    setStats({ fps: 0, inferenceLatency: 0, currentDetections: 0, cumulativeDetections: 0, sessionDuration: 0 });
  }, [stream]);

  // Stop the session cleanly when leaving the page
  useEffect(() => {
    return () => {
      if (sessionIdRef.current) {
        updateSession(sessionIdRef.current, {
          status: 'completed',
          ended_at: new Date().toISOString(),
          processed_frames: sessionStatsRef.current.inferences,
          total_frames: sessionStatsRef.current.inferences,
          total_detections: sessionStatsRef.current.cumulativeDetections,
          unique_potholes: savedKeysRef.current.size,
        }).catch(() => {});
      }
    };
  }, []);

  const switchCamera = useCallback(async () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    await new Promise(r => setTimeout(r, 100));
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
    } catch {
      toast({ title: 'Camera Error', description: 'Could not switch camera', variant: 'destructive' });
    }
  }, [facingMode, stream, toast]);

  // Capture screenshot of video + overlay (not just the transparent overlay)
  const captureScreenshot = useCallback(() => {
    const canvas = composeEvidence(true);
    if (!canvas) {
      toast({ title: 'Nothing to capture', description: 'Start the camera first.', variant: 'destructive' });
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `pothole-live-${Date.now()}.jpg`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Screenshot saved', description: 'Image downloaded' });
    }, 'image/jpeg', 0.9);
  }, [composeEvidence, toast]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    const container = document.querySelector('.live-container');
    if (!container) return;

    if (!fullscreen) {
      (container as HTMLElement).requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  }, [fullscreen]);

  // Handle fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Honest inference-mode resolution: what the label says is what actually runs
  const browserModeUnavailable = inferenceMode === 'browser';
  const inferenceActive = isRunning && !isPaused && !browserModeUnavailable && aiStatus === 'online';
  const effectiveModeLabel =
    inferenceMode === 'browser'
      ? 'Browser (ONNX) — unavailable in this build'
      : inferenceMode === 'auto'
        ? 'Auto → Cloud (FastAPI)'
        : 'Cloud (FastAPI)';

  return (
    <AppShell>
      {/* Header */}
      <header className="border-b bg-card px-4 py-3 sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Camera className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-xl font-bold">LIVE DETECTION</h1>
              <p className="text-xs text-muted-foreground">SmartPothole AI — Real-time Camera</p>
            </div>
            <Badge
              className={cn(
                aiStatus === 'online'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
              )}
            >
              {aiStatus === 'online' ? `AI online${aiModelName ? ` · ${aiModelName}` : ''}` : 'AI offline — inference paused'}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            {/* Stats */}
            <div className="hidden md:flex items-center gap-6 text-sm">
              <div className="flex items-center gap-1">
                <Zap className="w-4 h-4 text-yellow-500" />
                <span>{stats.fps.toFixed(1)} FPS</span>
              </div>
              <div className="flex items-center gap-1">
                <Target className="w-4 h-4 text-blue-500" />
                <span>{stats.inferenceLatency}ms</span>
              </div>
              <div className="flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span>{stats.currentDetections} current</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4 text-green-500" />
                <span>{formatDuration(stats.sessionDuration)}</span>
              </div>
            </div>

            {/* GPS */}
            {gpsCoordinates && (
              <Badge variant="secondary" className="gap-1">
                <MapPin className="w-3 h-3" />
                <span>{gpsCoordinates.lat.toFixed(5)}, {gpsCoordinates.lng.toFixed(5)}</span>
              </Badge>
            )}

            <Button variant="outline" size="icon" onClick={toggleFullscreen} title="Fullscreen">
              {fullscreen ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Camera View */}
          <div className="lg:col-span-3 live-container">
            <Card className="h-full overflow-hidden">
              <CardContent className="p-0 relative h-full">
                <div className="relative w-full aspect-video bg-black">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    autoPlay
                    playsInline
                    muted
                  />
                  <canvas
                    ref={overlayCanvasRef}
                    className="absolute top-0 left-0 w-full h-full pointer-events-none"
                  />

                  {/* Overlay indicators */}
                  {inferenceActive && (
                    <div className="absolute top-4 left-4 flex items-center gap-2 bg-green-500/90 text-white px-3 py-1 rounded-full text-sm font-medium">
                      <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      LIVE · {effectiveModeLabel}
                    </div>
                  )}

                  {isPaused && (
                    <div className="absolute top-4 left-4 bg-yellow-500/90 text-white px-3 py-1 rounded-full text-sm font-medium">
                      PAUSED
                    </div>
                  )}

                  {isRunning && !isPaused && !inferenceActive && (
                    <div className="absolute top-4 right-4 max-w-xs bg-amber-500/90 text-white px-3 py-2 rounded-lg text-xs font-medium">
                      {browserModeUnavailable
                        ? 'Browser (ONNX) inference is not available in this build — no ONNX model is bundled. Switch to Cloud or Auto to run detection.'
                        : 'AI service is offline — inference is paused. Start the ai-service (port 8000) or switch modes.'}
                    </div>
                  )}

                  {!isRunning && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 text-white p-8">
                      <Camera className="w-16 h-16 opacity-50" />
                      <div className="text-center">
                        <p className="text-xl font-medium">Camera Stopped</p>
                        <p className="text-muted-foreground mt-1">Click &quot;Start Camera&quot; to begin detection</p>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="absolute bottom-4 left-4 right-4 bg-red-500/90 text-white p-3 rounded-lg text-sm">
                      {error}
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="p-4 border-t bg-card flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {!isRunning ? (
                      <Button onClick={startCamera} size="lg" className="gap-2">
                        <Video className="w-5 h-5" />
                        Start Camera
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant={isPaused ? 'default' : 'outline'}
                          onClick={() => {
                            const next = !isPaused;
                            setIsPaused(next);
                            if (!next) lastInferenceRef.current = 0;
                          }}
                          size="lg"
                          className="gap-2"
                        >
                          {isPaused ? (
                            <>
                              <Video className="w-5 h-5" />
                              Resume
                            </>
                          ) : (
                            <>
                              <Pause className="w-5 h-5" />
                              Pause
                            </>
                          )}
                        </Button>
                        <Button variant="outline" onClick={stopCamera} size="lg" className="gap-2">
                          <X className="w-5 h-5" />
                          Stop
                        </Button>
                      </>
                    )}

                    <Button variant="outline" onClick={switchCamera} size="lg" className="gap-2" title="Switch Camera">
                      <RotateCcw className="w-5 h-5" />
                    </Button>

                    <Button variant="outline" onClick={captureScreenshot} size="lg" className="gap-2" disabled={!isRunning}>
                      <Download className="w-5 h-5" />
                      Capture
                    </Button>

                    <Button
                      onClick={saveDetection}
                      size="lg"
                      className="gap-2 bg-green-600 hover:bg-green-700"
                      disabled={detections.length === 0 || isSaving}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5" />
                          Save Detection{savedCount > 0 ? ` (${savedCount} saved)` : ''}
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      id="save-live"
                      checked={saveToDb}
                      onCheckedChange={setSaveToDb}
                      aria-label="Auto-save detections"
                    />
                    <Label htmlFor="save-live" className="text-sm">Auto-save</Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Settings */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="live-fps">Inference FPS: {inferenceFps}</Label>
                  <Slider
                    id="live-fps"
                    value={[inferenceFps]}
                    onValueChange={([v]) => setInferenceFps(v)}
                    min={1}
                    max={15}
                    step={1}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Target rate for AI frames. Actual: {stats.fps.toFixed(1)} fps (limited by inference speed)
                  </p>
                </div>

                <div>
                  <Label htmlFor="live-confidence">Confidence: {confidenceThreshold.toFixed(2)}</Label>
                  <Slider
                    id="live-confidence"
                    value={[confidenceThreshold]}
                    onValueChange={([v]) => setConfidenceThreshold(v)}
                    min={0.05}
                    max={0.95}
                    step={0.05}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="live-iou">IoU Threshold: {iouThreshold.toFixed(2)}</Label>
                  <Slider
                    id="live-iou"
                    value={[iouThreshold]}
                    onValueChange={([v]) => setIouThreshold(v)}
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    className="mt-1"
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Inference Mode</Label>
                  <select
                    value={inferenceMode}
                    onChange={(e) => setInferenceMode(e.target.value as any)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="cloud">Cloud (FastAPI)</option>
                    <option value="auto">Auto (uses Cloud)</option>
                    <option value="browser">Browser (ONNX)</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {browserModeUnavailable
                      ? 'Browser (ONNX) is not available in this build — detection is paused while selected.'
                      : `Running on: ${effectiveModeLabel}. Frames are sent to the AI service for inference.`}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Current Detections */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Current Detections ({detections.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detections.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No potholes detected</p>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {detections.map((detection, index) => (
                      <div key={detection.track_id || index} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={cn('w-8 h-8 rounded flex items-center justify-center', getSeverityColor(detection.severity.level))}>
                              <span className="text-white font-bold text-xs">{index + 1}</span>
                            </div>
                            <span className="font-medium text-sm">{detection.class_name}</span>
                          </div>
                          <Badge
                            variant={detection.severity.level.toLowerCase() as any}
                            className={cn(getSeverityColor(detection.severity.level), 'text-xs')}
                          >
                            {detection.severity.level}
                          </Badge>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground grid grid-cols-2 gap-1">
                          <span>Conf: {(detection.confidence * 100).toFixed(1)}%</span>
                          <span>Score: {detection.severity.score.toFixed(2)}</span>
                          {detection.track_id && (
                            <span className="col-span-2">Track: {detection.track_id.slice(-6)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Location */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LocationPicker value={gpsCoordinates} onChange={setGpsCoordinates} watch />
              </CardContent>
            </Card>

            {/* Session Stats */}
            {isRunning && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    Session Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Actual FPS</p>
                      <p className="text-2xl font-bold">{stats.fps.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">target {inferenceFps}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Inference</p>
                      <p className="text-2xl font-bold">{stats.inferenceLatency}ms</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Current</p>
                      <p className="text-2xl font-bold text-primary">{stats.currentDetections}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Duration</p>
                      <p className="text-2xl font-bold">{formatDuration(stats.sessionDuration)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Frames analyzed</p>
                      <p className="text-lg font-bold">{sessionStatsRef.current.inferences}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Saved
                      </p>
                      <p className="text-lg font-bold">{savedCount}</p>
                    </div>
                  </div>

                  {gpsCoordinates && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> GPS Location
                      </p>
                      <p className="text-sm font-mono">
                        {gpsCoordinates.lat.toFixed(6)}, {gpsCoordinates.lng.toFixed(6)}
                        <span className="text-muted-foreground ml-2">(±{Math.round(gpsCoordinates.accuracy || 0)}m)</span>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
