import {getPersona} from '../core/persona';
import * as legal from './legalPrompts';
import * as general from './generalPrompts';

export function clauseReviewPrompt(text: string) {
  return getPersona() === 'legal' ? legal.clausePrompt(text) : general.clausePrompt(text);
}

export function docQaPrompt(
  question: string,
  excerpts: {source: string; text: string}[],
) {
  return getPersona() === 'legal'
    ? legal.docQaPrompt(question, excerpts)
    : general.docQaPrompt(question, excerpts);
}

export function chatSystem() {
  return getPersona() === 'legal' ? legal.SYSTEM_CHAT : general.SYSTEM_CHAT;
}
