import { supabase, AUTH_STORAGE_KEY } from './supabase';

/**
 * Moving your identity to another device with a short code (no email needed).
 * See supabase/migrations/20261007000500_device_transfer.sql for the whole story.
 *
 * The code never leaves the two devices: the server gets a hash of it (to find the
 * transfer) and the session encrypted with a key derived from it.
 */

// no I, O, 0 or 1: easy to read aloud and to type
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const PARKED_KEY = 'us-moving';

export interface Parked {
  code: string;
  lookup: string;
  refreshToken: string;
  expiresAt: string;
}

export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join('');
}

const enc = new TextEncoder();

async function lookupFor(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`us-transfer:lookup:${code}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function keyFor(code: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('us-transfer:key'), iterations: 150_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function seal(code: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(code), enc.encode(text)));
  const all = new Uint8Array(iv.length + data.length);
  all.set(iv);
  all.set(data, iv.length);
  return btoa(String.fromCharCode(...all));
}

async function unseal(code: string, sealed: string): Promise<string> {
  const all = Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await keyFor(code), all.slice(12));
  return new TextDecoder().decode(plain);
}

export function readParked(): Parked | null {
  try {
    const raw = localStorage.getItem(PARKED_KEY);
    return raw ? (JSON.parse(raw) as Parked) : null;
  } catch {
    return null;
  }
}

function clearParked() {
  try {
    localStorage.removeItem(PARKED_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Hand this device's session over. Afterwards this device is signed out (without telling
 * the server, which would end the session for the new device too) until the code is
 * used, cancelled, or runs out.
 */
export async function startMove(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) throw new Error('not signed in');
  const code = newCode();
  const lookup = await lookupFor(code);
  const sealed = await seal(code, JSON.stringify({ refresh_token: session.refresh_token }));
  const { data: expiresAt, error } = await supabase.rpc('create_device_transfer', { p_lookup: lookup, p_payload: sealed });
  if (error || !expiresAt) throw error ?? new Error('could not start');

  const parked: Parked = { code, lookup, refreshToken: session.refresh_token, expiresAt: expiresAt as string };
  localStorage.setItem(PARKED_KEY, JSON.stringify(parked));
  // stop using the session here: no refreshes, and forget it locally
  supabase.auth.stopAutoRefresh();
  localStorage.removeItem(AUTH_STORAGE_KEY);
  window.location.assign('/login');
}

export type MoveStatus = 'waiting' | 'taken' | 'over';

export async function moveStatus(parked: Parked): Promise<MoveStatus> {
  const { data } = await supabase.rpc('device_transfer_status', { p_lookup: parked.lookup });
  return (data as MoveStatus) ?? 'over';
}

/** Cancel (or notice it ran out) and take the session back, if nobody else took it. */
export async function takeBack(parked: Parked): Promise<'back' | 'gone'> {
  const { data, error } = await supabase.rpc('cancel_device_transfer', { p_lookup: parked.lookup });
  if (error) throw error;
  clearParked();
  if (!data) return 'gone';
  const { error: e2 } = await supabase.auth.refreshSession({ refresh_token: parked.refreshToken });
  if (e2) return 'gone';
  return 'back';
}

/** The moved session landed somewhere else: nothing to take back here. */
export function forgetParked() {
  clearParked();
}

/** On the new device. */
export async function arrive(input: string): Promise<boolean> {
  const code = normalizeCode(input);
  if (code.length !== CODE_LENGTH) return false;
  const { data: sealed } = await supabase.rpc('take_device_transfer', { p_lookup: await lookupFor(code) });
  if (!sealed) return false;
  try {
    const { refresh_token } = JSON.parse(await unseal(code, sealed as string)) as { refresh_token: string };
    const { error } = await supabase.auth.refreshSession({ refresh_token });
    return !error;
  } catch {
    return false;
  }
}
