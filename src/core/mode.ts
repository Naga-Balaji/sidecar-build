import AsyncStorage from '@react-native-async-storage/async-storage';

export type Mode = 'local' | 'cloud';

const KEY = 'sidecar.mode';
const listeners = new Set<(m: Mode) => void>();

let current: Mode = 'local';

AsyncStorage.getItem(KEY).then(v => {
  if (v === 'cloud' || v === 'local') {
    if (v !== current) {
      current = v;
      for (const l of listeners) l(current);
    }
  }
});

export function getMode(): Mode {
  return current;
}

export function setMode(m: Mode) {
  if (m === current) return;
  current = m;
  AsyncStorage.setItem(KEY, m).catch(() => {});
  for (const l of listeners) l(m);
}

export function onModeChange(fn: (m: Mode) => void): () => void {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}
