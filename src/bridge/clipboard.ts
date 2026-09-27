import Clipboard from '@react-native-clipboard/clipboard';
import {CONFIG} from '../config';

type Handler = (text: string) => void | Promise<void>;

let timer: ReturnType<typeof setInterval> | null = null;
let lastSeen = '';
const handlers = new Set<Handler>();

export function onClipboardChange(fn: Handler): () => void {
  handlers.add(fn);
  ensurePolling();
  return () => {
    handlers.delete(fn);
    if (handlers.size === 0) stopPolling();
  };
}

function ensurePolling() {
  if (timer) return;
  timer = setInterval(async () => {
    try {
      const current = await Clipboard.getString();
      if (
        current &&
        current !== lastSeen &&
        !current.startsWith(CONFIG.bridge.sentinelPrefix)
      ) {
        lastSeen = current;
        for (const h of handlers) await h(current);
      }
    } catch (e) {
      console.warn('[clipboard] poll error:', e);
    }
  }, CONFIG.bridge.clipboardPollMs);
}

function stopPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}

export async function writeAnswer(text: string) {
  Clipboard.setString(text);
  lastSeen = text;
}
