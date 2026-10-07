import { supabase } from './supabase';
import type { MediaKind } from './types';

export const BUCKET = 'media';
export const SIGNED_URL_TTL = 30 * 60; // seconds
export const MAX_ATTACHMENTS = 12;

export interface PreparedMedia {
  kind: MediaKind;
  blob: Blob;
  mime: string;
  width?: number;
  height?: number;
  durationMs?: number;
  previewUrl: string;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image decode failed'));
    };
    img.src = url;
  });
}

/**
 * Downscale and re-encode a photo in the browser before upload.
 * Re-encoding through a canvas also drops EXIF metadata (incl. GPS location).
 * Modern browsers apply EXIF orientation when decoding, so the result is upright.
 */
export async function compressImage(file: File, maxSide = 2048, quality = 0.82): Promise<PreparedMedia> {
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality),
  );
  return { kind: 'image', blob, mime: 'image/jpeg', width, height, previewUrl: URL.createObjectURL(blob) };
}

/** Prefer AAC-in-MP4: it plays on iOS Safari and Android Chrome alike. */
export function pickAudioMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

export function baseMime(mime: string): string {
  return mime.split(';')[0].trim();
}

function extFor(mime: string): string {
  switch (baseMime(mime)) {
    case 'image/jpeg':
      return 'jpg';
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'm4a';
    case 'audio/webm':
      return 'webm';
    case 'audio/ogg':
      return 'ogg';
    default:
      return 'bin';
  }
}

/** Upload one file into {us}/{memory}/ and record it in memory_media. */
export async function attachMedia(usId: string, memoryId: string, item: PreparedMedia, position: number) {
  const mime = baseMime(item.mime);
  const path = `${usId}/${memoryId}/${crypto.randomUUID()}.${extFor(mime)}`;
  const up = await supabase.storage.from(BUCKET).upload(path, item.blob, { contentType: mime, upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase.from('memory_media').insert({
    memory_id: memoryId,
    kind: item.kind,
    storage_path: path,
    mime,
    width: item.width ?? null,
    height: item.height ?? null,
    duration_ms: item.durationMs ?? null,
    position,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
}

/** Best effort: files are already unreadable once their row is gone. */
export async function removeFiles(paths: string[]) {
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

/** Upload a perspective voice clip into {us}/{memory}/p/ and return its path. */
export async function uploadPerspectiveAudio(usId: string, memoryId: string, item: PreparedMedia): Promise<string> {
  const mime = baseMime(item.mime);
  const path = `${usId}/${memoryId}/p/${crypto.randomUUID()}.${extFor(mime)}`;
  const up = await supabase.storage.from(BUCKET).upload(path, item.blob, { contentType: mime, upsert: false });
  if (up.error) throw up.error;
  return path;
}

/** Your own photo: avatars/{you}/… The previous file is removed once the new one is in place. */
export async function setAvatar(userId: string, file: File | null, previous?: string | null) {
  let path: string | null = null;
  if (file) {
    const img = await compressImage(file, 1024);
    path = `avatars/${userId}/${crypto.randomUUID()}.jpg`;
    const up = await supabase.storage.from(BUCKET).upload(path, img.blob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw up.error;
  }
  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
  if (error) {
    if (path) await removeFiles([path]);
    throw error;
  }
  if (previous) await removeFiles([previous]).catch(() => undefined);
}

/** A relationship's photo: covers/{us}/… Any current member may change it; everyone sees the same one. */
export async function setCover(usId: string, file: File | null) {
  let path: string | null = null;
  if (file) {
    const img = await compressImage(file, 1600);
    path = `covers/${usId}/${crypto.randomUUID()}.jpg`;
    const up = await supabase.storage.from(BUCKET).upload(path, img.blob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw up.error;
  }
  const { error } = await supabase.rpc('set_us_cover', { p_us: usId, p_path: path });
  if (error) {
    if (path) await removeFiles([path]);
    throw error;
  }
}
