import { createDetection, createDetectionMedia, uploadFile, getCurrentUser, getUserPreferences } from './supabase';
import type { Detection, DetectionSource } from '@/types';

export interface GpsInfo {
  lat: number;
  lng: number;
  accuracy?: number | null;
}

export interface PendingMedia {
  original?: Blob | null;
  annotated?: Blob | null;
}

export interface SaveDetectionsResult {
  savedCount: number;
  mediaCount: number;
  warnings: string[];
}

function extForMime(mime: string | undefined, fallback: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'video/mp4') return 'mp4';
  if (mime === 'video/webm') return 'webm';
  return fallback;
}

/**
 * Persist AI detections to the `detections` table and, when media blobs are
 * supplied, upload them to the `detection-images` bucket and record
 * `detection_media` rows so the dashboard can show real thumbnails.
 *
 * Storage/media failures are collected into `warnings` instead of failing the
 * whole save — the detection row itself is the source of truth.
 */
export async function saveDetectionsWithMedia(params: {
  userId: string;
  detections: Detection[];
  detectionType: 'image' | 'video' | 'live';
  source: DetectionSource;
  gps?: GpsInfo | null;
  sessionId?: string | null;
  extraMetadata?: Record<string, unknown>;
  getMediaFor?: (detection: Detection, index: number) => PendingMedia | null | Promise<PendingMedia | null>;
}): Promise<SaveDetectionsResult> {
  const { userId, detections, detectionType, source, gps, sessionId, extraMetadata, getMediaFor } = params;

  const warnings: string[] = [];
  let savedCount = 0;
  let mediaCount = 0;

  for (let index = 0; index < detections.length; index++) {
    const detection = detections[index];
    const { data: record, error } = await createDetection({
      user_id: userId,
      session_id: sessionId ?? null,
      detection_type: detectionType,
      severity_level: detection.severity.level,
      severity_score: detection.severity.score,
      severity_confidence: detection.severity.confidence,
      confidence: detection.confidence,
      latitude: gps?.lat ?? null,
      longitude: gps?.lng ?? null,
      location_accuracy: gps?.accuracy ?? null,
      source,
      status: 'active',
      metadata: {
        bbox: detection.bbox,
        segmentation: detection.segmentation,
        track_id: detection.track_id ?? null,
        ...extraMetadata,
      } as unknown as import('@/types/database').Json,
    });

    if (error || !record) {
      throw new Error(error?.message || 'Failed to create detection record');
    }
    savedCount++;

    if (!getMediaFor) continue;
    const media = await getMediaFor(detection, index);
    if (!media) continue;

    const detectionId = record.id;
    const baseDir = `${userId}/${detectionId}`;

    if (media.original) {
      const ext = extForMime(media.original.type, 'jpg');
      const path = `${baseDir}/original.${ext}`;
      const { error: uploadError } = await uploadFile('detection-images', path, media.original);
      if (uploadError) {
        warnings.push(`Evidence upload failed: ${uploadError.message}`);
      } else {
        const { error: mediaError } = await createDetectionMedia({
          detection_id: detectionId,
          storage_path: path,
          media_type: 'image',
          file_size: media.original.size,
          mime_type: media.original.type || 'image/jpeg',
        });
        if (mediaError) warnings.push(`Media record failed: ${mediaError.message}`);
        else mediaCount++;
      }
    }

    if (media.annotated) {
      const ext = extForMime(media.annotated.type, 'jpg');
      const path = `${baseDir}/annotated.${ext}`;
      const { error: uploadError } = await uploadFile('detection-images', path, media.annotated);
      if (uploadError) {
        warnings.push(`Annotated upload failed: ${uploadError.message}`);
      } else {
        const { error: mediaError } = await createDetectionMedia({
          detection_id: detectionId,
          storage_path: path,
          media_type: 'annotated_image',
          annotated_path: path,
          file_size: media.annotated.size,
          mime_type: media.annotated.type || 'image/jpeg',
        });
        if (mediaError) warnings.push(`Media record failed: ${mediaError.message}`);
        else mediaCount++;
      }
    }
  }

  return { savedCount, mediaCount, warnings };
}

/** Convert a base64 data URL (canvas or server annotated image) to a Blob. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export type DetectionDefaults = {
  inference_mode: 'auto' | 'browser' | 'cloud';
  inference_fps: number;
  confidence_threshold: number;
  enable_gps: boolean;
  auto_save_detections: boolean;
} | null;

/**
 * Load the detection defaults the user saved on the Settings page so
 * detection pages actually start with those values.
 */
export async function getDetectionDefaults(): Promise<DetectionDefaults> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;
    const { data } = await getUserPreferences(user.id);
    if (!data) return null;
    return {
      inference_mode: (data.inference_mode as 'auto' | 'browser' | 'cloud') || 'auto',
      inference_fps: data.inference_fps ?? 5,
      confidence_threshold: Number(data.confidence_threshold ?? 0.25),
      enable_gps: data.enable_gps ?? true,
      auto_save_detections: data.auto_save_detections ?? false,
    };
  } catch {
    return null;
  }
}
