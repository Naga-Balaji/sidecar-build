import AsyncStorage from '@react-native-async-storage/async-storage';

export type Persona = 'general' | 'legal';

const KEY = 'sidecar.persona';
const listeners = new Set<(p: Persona) => void>();

let current: Persona = 'general';

// Hydrate on module load. We tolerate a small window where getPersona() returns
// the default before AsyncStorage returns; UI treats persona reactively via
// onPersonaChange so it updates once the async read completes.
AsyncStorage.getItem(KEY).then(v => {
  if (v === 'legal' || v === 'general') {
    if (v !== current) {
      current = v;
      for (const l of listeners) l(current);
    }
  }
});

export function getPersona(): Persona {
  return current;
}

export function setPersona(p: Persona) {
  if (p === current) return;
  current = p;
  AsyncStorage.setItem(KEY, p).catch(() => {});
  for (const l of listeners) l(p);
}

export function onPersonaChange(fn: (p: Persona) => void): () => void {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}
