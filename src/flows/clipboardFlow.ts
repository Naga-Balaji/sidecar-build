import {router} from '../core/router';
import {onClipboardChange, writeAnswer} from '../bridge/clipboard';
import {clauseReviewPrompt} from '../prompts/systemPrompts';
import {getClipboardWatch, looksLikeSecret} from '../core/clipboardWatch';

export type FlowEvent =
  | {kind: 'input'; text: string}
  | {kind: 'answer'; text: string; latencyMs: number}
  | {kind: 'error'; error: string};

export function startClipboardFlow(onEvent: (e: FlowEvent) => void): () => void {
  let busy = false;
  return onClipboardChange(async text => {
    if (busy) return;
    if (!getClipboardWatch()) return;
    if (text.length < 40) return;
    if (looksLikeSecret(text)) {
      // Never analyse things that look like API keys / tokens / JWTs.
      return;
    }
    busy = true;
    const t0 = Date.now();
    onEvent({kind: 'input', text});
    try {
      let full = '';
      await router.stream(clauseReviewPrompt(text), tok => {
        full += tok;
      });
      const answer = full.trim();
      await writeAnswer(answer);
      onEvent({kind: 'answer', text: answer, latencyMs: Date.now() - t0});
    } catch (e: any) {
      onEvent({kind: 'error', error: e?.message ?? String(e)});
    } finally {
      busy = false;
    }
  });
}
