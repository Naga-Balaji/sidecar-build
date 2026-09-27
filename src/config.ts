export const CONFIG = {
  llm: {
    // 2048 keeps memory footprint modest on mobile (~120MB KV cache for 3B).
    // Raise to 4096 later if you need longer docs and have RAM headroom.
    contextSize: 2048,
    maxOutputTokens: 512,
    temperature: 0.2,
    threads: 4,
  },
  bridge: {
    clipboardPollMs: 400,
    sentinelPrefix: '::sidecar::',
  },
  demo: {
    airplaneOnly: true,
    showByteCounter: true,
  },
} as const;

export type Config = typeof CONFIG;
