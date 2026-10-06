import { t } from '../strings';
import type { UsPreset } from './types';

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function presetName(p: UsPreset | null): string {
  return p ? t.presets[p] : '';
}

export function displayName(name: string | null | undefined): string {
  return name && name.trim() ? name : t.common.unnamed;
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
