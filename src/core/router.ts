import type {LlmMessage} from './llm';
import {getLlm} from './llm';
import {cloudLlm, cloudKey} from './cloud';
import {getMode} from './mode';
import {getPersona} from './persona';

/**
 * Single entry point for inference. Legal persona ALWAYS forces local, even
 * if the user picked Cloud — legal content must not leave the device.
 */
export const router = {
  async complete(messages: LlmMessage[]): Promise<string> {
    if (shouldUseCloud()) return cloudLlm.complete(messages);
    return getLlm().complete(messages);
  },
  async stream(messages: LlmMessage[], onToken: (t: string) => void): Promise<string> {
    if (shouldUseCloud()) return cloudLlm.stream(messages, onToken);
    return getLlm().stream(messages, onToken);
  },
  effectiveBackend(): 'local' | 'cloud' {
    return shouldUseCloud() ? 'cloud' : 'local';
  },
  legalOverride(): boolean {
    return getPersona() === 'legal' && getMode() === 'cloud';
  },
};

function shouldUseCloud(): boolean {
  if (getPersona() === 'legal') return false;
  return getMode() === 'cloud' && cloudKey.has();
}
