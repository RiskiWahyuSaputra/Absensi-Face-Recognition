import { env } from "../config/env";

export interface QualityCheckResult {
  passed: boolean;
  face_count: number;
  brightness: number;
  sharpness: number;
  face_size: number;
  quality_score: number;
  reasons: string[];
  bbox?: { x: number; y: number; w: number; h: number; confidence: number } | null;
}

export interface LivenessResult {
  is_live: boolean;
  score: number;
  method: string;
  blink_or_motion_detected?: boolean | null;
  reason?: string | null;
}

export interface FaceAnalyzeResult {
  face_detected: boolean;
  face_count: number;
  bbox?: { x: number; y: number; w: number; h: number; confidence: number } | null;
  liveness: LivenessResult;
  embedding: number[] | null;
  quality?: QualityCheckResult | null;
  model_info: Record<string, string>;
}

async function postFaceService<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(`${env.faceServiceUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.faceServiceApiKey,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Face service error (${resp.status}): ${errText}`);
  }
  return (await resp.json()) as T;
}

export async function checkFaceQuality(
  imageBase64: string
): Promise<QualityCheckResult> {
  return postFaceService<QualityCheckResult>("/api/v1/quality-check", {
    image_base64: imageBase64,
  });
}

export async function analyzeFace(params: {
  imageBase64: string;
  secondaryImageBase64?: string;
  livenessThreshold?: number;
}): Promise<FaceAnalyzeResult> {
  return postFaceService<FaceAnalyzeResult>("/api/v1/analyze", {
    image_base64: params.imageBase64,
    secondary_image_base64: params.secondaryImageBase64,
    liveness_threshold: params.livenessThreshold,
  });
}

export async function checkFaceServiceHealth(): Promise<Record<string, unknown>> {
  const resp = await fetch(`${env.faceServiceUrl}/health`);
  if (!resp.ok) {
    throw new Error(`Face service unhealthy: ${resp.status}`);
  }
  return (await resp.json()) as Record<string, unknown>;
}
