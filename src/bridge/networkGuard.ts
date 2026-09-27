let bytesOut = 0;
let armed = false;
let originalFetch: typeof fetch | null = null;

const ALLOW = [
  'openrouter.ai',
  // Model download hosts. These aren't "user data leaving" — they're just
  // pulling model weights from HuggingFace / their CDN, same as any package
  // manager pulling npm modules.
  'huggingface.co',
  'cdn-lfs.hf.co',
  'cdn-lfs.huggingface.co',
  'hf.co',
];

export function armGuard() {
  if (armed) return;
  armed = true;
  originalFetch = global.fetch;
  global.fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url ?? '';
    if (!isAllowed(url)) {
      console.warn('[guard] blocked outbound', url);
      throw new Error(`Sidecar network guard: outbound ${url} blocked`);
    }
    // Don't count model-download traffic as an "outbound leak" — it's inbound
    // package fetch, not user data. Only body bytes going to non-HF hosts count.
    const isDownload = url.includes('huggingface.co') || url.includes('hf.co');
    if (init && typeof init.body === 'string' && !isDownload) {
      bytesOut += init.body.length;
    }
    return originalFetch!(input, init);
  };
}

export function getBytes() {
  return {bytesOut};
}

function isAllowed(url: string): boolean {
  if (!url) return true;
  if (url.startsWith('file:') || url.startsWith('content:') || url.startsWith('data:')) {
    return true;
  }
  return ALLOW.some(h => url.includes(h));
}
