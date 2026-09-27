import AsyncStorage from '@react-native-async-storage/async-storage';

export type LlmMessage = {role: 'system' | 'user' | 'assistant'; content: string};

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OR_MODEL = 'deepseek/deepseek-chat-v3.1';
const KEY_STORAGE = 'sidecar.openrouter_key';

let cachedKey = '';
let hydrated = false;
const hydration = AsyncStorage.getItem(KEY_STORAGE).then(v => {
  cachedKey = v ?? '';
  hydrated = true;
});

export const cloudKey = {
  get(): string {
    return cachedKey;
  },
  async ensureHydrated() {
    if (!hydrated) await hydration;
  },
  async set(v: string) {
    cachedKey = v.trim();
    if (cachedKey) await AsyncStorage.setItem(KEY_STORAGE, cachedKey);
    else await AsyncStorage.removeItem(KEY_STORAGE);
  },
  has(): boolean {
    return !!cachedKey;
  },
};

export const cloudLlm = {
  async complete(messages: LlmMessage[]): Promise<string> {
    await cloudKey.ensureHydrated();
    if (!cachedKey) {
      throw new Error('No OpenRouter key saved yet. Add one in the mode bar.');
    }
    let res: Response;
    try {
      res = await fetch(OR_URL, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({model: OR_MODEL, messages, stream: false}),
      });
    } catch (e: any) {
      throw new Error(`Network reach to OpenRouter failed: ${e?.message ?? e}. Check phone Wi-Fi.`);
    }
    const bodyText = await res.text();
    if (!res.ok) {
      // Try to pull OpenRouter's structured error out of the body for a
      // friendlier message. Otherwise show the status + first 200 chars.
      let hint = bodyText.slice(0, 200);
      try {
        const j = JSON.parse(bodyText);
        hint = j?.error?.message ?? hint;
      } catch {}
      throw new Error(`OpenRouter ${res.status}: ${hint}`);
    }
    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch {
      throw new Error(`OpenRouter returned non-JSON: ${bodyText.slice(0, 200)}`);
    }
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string') {
      throw new Error(`Unexpected OpenRouter response shape: ${bodyText.slice(0, 200)}`);
    }
    return answer;
  },

  async stream(messages: LlmMessage[], onToken: (t: string) => void): Promise<string> {
    // RN fetch doesn't reliably expose SSE body readers, so we non-stream and
    // emit the whole answer at once. UI still renders the bubble immediately
    // and the answer replaces the streaming placeholder in one go.
    const full = await this.complete(messages);
    onToken(full);
    return full;
  },
};

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cachedKey}`,
    'HTTP-Referer': 'https://sidecar.local',
    'X-Title': 'Sidecar',
  };
}
