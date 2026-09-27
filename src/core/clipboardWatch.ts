import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sidecar.clipboard_watch';
const listeners = new Set<(on: boolean) => void>();

let enabled = true;
AsyncStorage.getItem(KEY).then(v => {
  const parsed = v === '0' ? false : true;
  if (parsed !== enabled) {
    enabled = parsed;
    for (const l of listeners) l(enabled);
  }
});

export function getClipboardWatch(): boolean {
  return enabled;
}

export function setClipboardWatch(on: boolean) {
  if (on === enabled) return;
  enabled = on;
  AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
  for (const l of listeners) l(enabled);
}

export function onClipboardWatchChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  fn(enabled);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Heuristic: does this clipboard text look like a secret we shouldn't run
 * through the reviewer? Common shapes: API keys, JWTs, long random tokens.
 */
export function looksLikeSecret(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // Explicit prefixes for well-known key formats
  const secretPrefixes = ['sk-', 'sk-or-', 'ghp_', 'ghs_', 'github_pat_', 'xoxb-', 'xoxp-', 'AKIA', 'AIza'];
  if (secretPrefixes.some(p => t.startsWith(p))) return true;
  // JWT: three base64 segments separated by dots
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t)) return true;
  // Long single token with no whitespace, mostly alphanumeric/underscore/dash
  const noWs = !/\s/.test(t);
  const alphaish = t.length >= 32 && /^[A-Za-z0-9_\-=+/]+$/.test(t);
  if (noWs && alphaish) return true;
  return false;
}
