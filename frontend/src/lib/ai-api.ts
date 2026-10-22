import type {
  AIResponse,
  AIHealthResponse,
  AIModelInfo,
  JobStatusResponse,
  ImageDetectionRequest,
  VideoDetectionRequest,
  LiveFrameRequest,
  SeverityRequest,
  Severity,
  Detection,
  ModelInfo,
  ProcessingInfo,
} from '@/types';

// Default to the same-origin proxy so the AI service secret stays server-side.
// Set NEXT_PUBLIC_AI_API_URL to a full URL only for direct trusted access.
const AI_API_URL = process.env.NEXT_PUBLIC_AI_API_URL || '/api/ai';
const AI_SERVICE_SECRET = process.env.AI_SERVICE_SECRET;

class AIApiClient {
  private baseUrl: string;
  private secret: string | undefined;

  constructor(baseUrl: string, secret?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secret = secret;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.secret) {
      (headers as Record<string, string>)['X-AI-Service-Secret'] = this.secret;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  private async requestFormData<T>(
    endpoint: string,
    formData: FormData
  ): Promise<T> {
    const headers: HeadersInit = {};
    if (this.secret) {
      headers['X-AI-Service-Secret'] = this.secret;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      body: formData,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // Health & Model Info
  async health(): Promise<AIHealthResponse> {
    return this.request<AIHealthResponse>('/health');
  }

  async ready(): Promise<{ ready: boolean; model_loaded: boolean }> {
    return this.request('/ready');
  }

  async modelInfo(): Promise<AIModelInfo> {
    return this.request<AIModelInfo>('/model');
  }

  // Image Detection
  async predictImage(request: ImageDetectionRequest): Promise<AIResponse> {
    const formData = new FormData();
    formData.append('file', request.file);
    // Use nullish checks so a threshold of 0 is actually sent to the service
    if (request.confidence_threshold != null) {
      formData.append('confidence_threshold', String(request.confidence_threshold));
    }
    if (request.iou_threshold != null) {
      formData.append('iou_threshold', String(request.iou_threshold));
    }
    if (request.return_annotated) {
      formData.append('return_annotated', 'true');
    }

    return this.requestFormData<AIResponse>('/predict/image', formData);
  }

  // Live Frame Detection
  async predictFrame(request: LiveFrameRequest): Promise<AIResponse> {
    return this.request<AIResponse>('/predict/frame', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Frame with Tracking
  async trackFrame(request: LiveFrameRequest): Promise<AIResponse> {
    return this.request<AIResponse>('/track/frame', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Video Detection (Async)
  async predictVideo(request: VideoDetectionRequest): Promise<{ job_id: string }> {
    const formData = new FormData();
    formData.append('file', request.file);
    if (request.confidence_threshold != null) {
      formData.append('confidence_threshold', String(request.confidence_threshold));
    }
    if (request.iou_threshold != null) {
      formData.append('iou_threshold', String(request.iou_threshold));
    }
    if (request.inference_fps != null) {
      formData.append('inference_fps', String(request.inference_fps));
    }
    if (request.return_annotated) {
      formData.append('return_annotated', 'true');
    }

    return this.requestFormData<{ job_id: string }>('/predict/video', formData);
  }

  // Job Status
  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    return this.request<JobStatusResponse>(`/jobs/${jobId}`);
  }

  // Severity Estimation
  async estimateSeverity(request: SeverityRequest): Promise<Severity> {
    return this.request<Severity>('/severity', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Cancel Job
  async cancelJob(jobId: string): Promise<{ cancelled: boolean }> {
    return this.request<{ cancelled: boolean }>(`/jobs/${jobId}/cancel`, {
      method: 'POST',
    });
  }
}

// Singleton instance
export const aiApi = new AIApiClient(AI_API_URL, AI_SERVICE_SECRET);

// Standalone wrappers used by detection pages
export async function predictImage(request: ImageDetectionRequest): Promise<AIResponse> {
  return aiApi.predictImage(request);
}

export async function predictFrame(request: LiveFrameRequest): Promise<AIResponse> {
  return aiApi.predictFrame(request);
}

export async function trackFrame(request: LiveFrameRequest): Promise<AIResponse> {
  return aiApi.trackFrame(request);
}

export async function predictVideo(request: VideoDetectionRequest): Promise<{ job_id: string }> {
  return aiApi.predictVideo(request);
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  return aiApi.getJobStatus(jobId);
}

// The AI service reports result_url as "/api/jobs/<id>/result" (a path on its
// own origin). Through the same-origin proxy the equivalent is /api/ai/jobs/...
export function getJobResultUrl(jobId: string): string {
  return `${AI_API_URL}/jobs/${jobId}/result`;
}

// Helper functions
export async function checkAIServiceHealth(): Promise<boolean> {
  try {
    const health = await aiApi.health();
    return health.status === 'healthy' && health.model_loaded;
  } catch {
    return false;
  }
}

// Returns service availability plus the model name so the UI can flag
// DEMO-mode results (model name "DEMO-MockDetector").
export async function checkAIServiceHealthStatus(): Promise<{ online: boolean; modelName: string }> {
  try {
    const health = await aiApi.health();
    return {
      online: health.status === 'healthy' && health.model_loaded,
      modelName: health.model_info?.name || '',
    };
  } catch {
    return { online: false, modelName: '' };
  }
}

export async function waitForJobCompletion(
  jobId: string,
  onProgress?: (progress: number, status: string) => void,
  maxWaitMs = 300000,
  pollIntervalMs = 2000
): Promise<JobStatusResponse> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const status = await aiApi.getJobStatus(jobId);
    
    if (onProgress) {
      onProgress(status.progress, status.status);
    }
    
    if (status.status === 'completed') {
      return status;
    }
    
    if (status.status === 'failed' || status.status === 'cancelled') {
      throw new Error(status.error_message || `Job ${status.status}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  throw new Error('Job timed out');
}

// Image processing helpers
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64.split(',')[1] || base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

export function createImageBitmapFromFile(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

export function resizeImage(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  maxWidth: number,
  maxHeight: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  
  let { width, height } = source;
  
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width *= ratio;
    height *= ratio;
  }
  
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(source, 0, 0, width, height);
  
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.8): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), type, quality);
  });
}

export function canvasToBase64(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.8): string {
  return canvas.toDataURL(type, quality);
}

// Validation
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Unsupported file type. Please upload JPEG, PNG, or WebP.' };
  }
  
  if (file.size > maxSize) {
    return { valid: false, error: 'File too large. Maximum size is 10MB.' };
  }
  
  return { valid: true };
}

export function validateVideoFile(file: File): { valid: boolean; error?: string } {
  const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
  const maxSize = 500 * 1024 * 1024; // 500MB
  
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Unsupported file type. Please upload MP4, WebM, or MOV.' };
  }
  
  if (file.size > maxSize) {
    return { valid: false, error: 'File too large. Maximum size is 500MB.' };
  }
  
  return { valid: true };
}