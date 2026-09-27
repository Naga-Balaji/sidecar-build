import {CONFIG} from '../config';
import {setLastLoadedPath} from './modelCatalog';

export type LlmMessage = {role: 'system' | 'user' | 'assistant'; content: string};
export type LlmProgress = {loaded: number; total: number; text: string};

export interface Llm {
  ready(onProgress?: (p: LlmProgress) => void): Promise<boolean>;
  loadFromPath(
    path: string,
    onProgress?: (p: LlmProgress) => void,
    displayName?: string,
  ): Promise<boolean>;
  complete(messages: LlmMessage[]): Promise<string>;
  stream(messages: LlmMessage[], onToken: (t: string) => void): Promise<string>;
}

class LlamaRnLlm implements Llm {
  private ctx: any = null;
  private loaded = false;
  private loading: Promise<boolean> | null = null;

  async ready(onProgress?: (p: LlmProgress) => void): Promise<boolean> {
    if (this.loaded) return true;
    onProgress?.({loaded: 0, total: 1, text: 'pick a .gguf from phone storage'});
    return false;
  }

  async loadFromPath(
    path: string,
    onProgress?: (p: LlmProgress) => void,
    displayName?: string,
  ): Promise<boolean> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        // Prefer the user-facing filename for guards. When picked via Android's
        // Document Picker, `path` is a content:// URI or a UUID cache file —
        // neither ends in ".gguf" even for a valid model.
        const guardName = (displayName ?? path.split('/').pop() ?? path).toLowerCase();
        const display = displayName ?? path.split('/').pop() ?? path;
        onProgress?.({loaded: 0.05, total: 1, text: `checking ${display}…`});

        // Guard against known-crashers in this llama.rn version. Gemma 3n's
        // MatFormer architecture isn't supported and crashes the JNI process
        // (uncatchable by JS). Bail early with a clear message.
        if (guardName.includes('gemma-3n') || guardName.includes('gemma3n')) {
          throw new Error(
            'Gemma 3n uses MatFormer, which this llama.rn version does not support (native crash risk). ' +
              'Try Qwen 2.5 1.5B Instruct or Llama 3.2 3B Instruct instead.',
          );
        }
        if (!guardName.endsWith('.gguf')) {
          throw new Error(
            `Not a .gguf file (name: "${display}"). Sidecar needs a llama.cpp GGUF model.`,
          );
        }

        if (this.ctx?.release) {
          onProgress?.({loaded: 0.1, total: 1, text: 'unloading previous model…'});
          try {
            await this.ctx.release();
          } catch {}
          this.ctx = null;
          this.loaded = false;
        }

        const {initLlama} = require('llama.rn');
        onProgress?.({loaded: 0.3, total: 1, text: `mmapping ${display} into memory…`});
        this.ctx = await initLlama({
          model: path,
          n_ctx: CONFIG.llm.contextSize,
          n_threads: CONFIG.llm.threads,
          n_gpu_layers: 0,
        });
        this.loaded = true;
        // Remember which model was loaded so we can auto-restore on next boot.
        setLastLoadedPath(path).catch(() => {});
        onProgress?.({loaded: 1, total: 1, text: 'ready'});
        return true;
      } catch (e: any) {
        console.warn('[llm] llama.rn load failed', e);
        this.loaded = false;
        onProgress?.({loaded: 0, total: 1, text: `failed: ${e?.message ?? e}`});
        return false;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  async complete(messages: LlmMessage[]): Promise<string> {
    if (!this.loaded || !this.ctx) return '[llm not loaded — pick a .gguf first]';
    const result = await this.ctx.completion({
      messages,
      n_predict: CONFIG.llm.maxOutputTokens,
      temperature: CONFIG.llm.temperature,
      stop: STOP_TOKENS,
    });
    return stripTail(result?.text ?? '');
  }

  async stream(messages: LlmMessage[], onToken: (t: string) => void): Promise<string> {
    if (!this.loaded || !this.ctx) {
      onToken('[llm not loaded — pick a .gguf first]');
      return '[llm not loaded]';
    }
    let full = '';
    await this.ctx.completion(
      {
        messages,
        n_predict: CONFIG.llm.maxOutputTokens,
        temperature: CONFIG.llm.temperature,
        stop: STOP_TOKENS,
      },
      (data: {token?: string}) => {
        const tok = data?.token ?? '';
        if (tok) {
          full += tok;
          onToken(tok);
        }
      },
    );
    return stripTail(full);
  }
}

// Every stop marker across the popular chat templates. llama.rn matches these
// during generation, but if the token boundary lands mid-marker we can still
// see a trailing fragment — hence stripTail as a belt-and-suspenders.
const STOP_TOKENS = [
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|end|>',
  '<|im_end|>',
  '<|im_start|>',
  '<|assistant|>',
  '<|user|>',
  '<|system|>',
  '<end_of_turn>',
  '<start_of_turn>',
];

/**
 * Chop everything from the first stop marker onwards (whether the marker made
 * it through in full or as a partial like "<|im_e"). Handles a few known
 * partial-fragment patterns explicitly so we don't leave dangling <| in the
 * user-visible output.
 */
function stripTail(text: string): string {
  let out = text;
  for (const stop of STOP_TOKENS) {
    const idx = out.indexOf(stop);
    if (idx >= 0) out = out.slice(0, idx);
  }
  // Trailing partial marker like "<|im_" or "<end_of_" — drop from the last
  // stray "<" onwards if it looks unclosed.
  const lastLt = out.lastIndexOf('<');
  if (lastLt >= 0) {
    const tail = out.slice(lastLt);
    const looksLikeMarker = /^<\|?[a-zA-Z_]+(?:\|>|>|$)?/.test(tail);
    const unclosed = !tail.includes('>');
    if (looksLikeMarker && unclosed) {
      out = out.slice(0, lastLt);
    }
  }
  return out.trim();
}

let singleton: Llm | null = null;
export function getLlm(): Llm {
  singleton ??= new LlamaRnLlm();
  return singleton;
}
