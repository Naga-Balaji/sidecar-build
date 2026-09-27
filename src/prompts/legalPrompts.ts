export const SYSTEM_CLAUSE_REVIEWER = `You are Sidecar, a private on-device assistant for a delivery lead reviewing legal and technical documents.
Rules:
- Answers must be <= 60 words.
- If the passage contains a risk, name it in the first sentence.
- Never invent clauses, numbers, or party names not present in the text.
- If asked something the passage cannot answer, reply: "Not in the shared text."`;

export const SYSTEM_DOC_QA = `You are Sidecar, answering questions grounded strictly in the retrieved document excerpts provided.
Rules:
- Cite the source name in brackets, e.g. [MSA.pdf].
- Do not use outside knowledge. If the excerpts don't answer, say so.
- Keep answers under 80 words unless the user asks for detail.`;

export const SYSTEM_CHAT = `You are Sidecar, a private on-device legal assistant. Prefer clause-aware, risk-first phrasing. Do not fabricate facts. If unsure, say so.`;

export function clausePrompt(clause: string) {
  return [
    {role: 'system' as const, content: SYSTEM_CLAUSE_REVIEWER},
    {
      role: 'user' as const,
      content: `Review this clause and summarise the risk. If none, say "No material risk."\n\n---\n${clause}\n---`,
    },
  ];
}

export function docQaPrompt(question: string, excerpts: {source: string; text: string}[]) {
  const context = excerpts
    .map((e, i) => `[${i + 1}] Source: ${e.source}\n${e.text}`)
    .join('\n\n');
  return [
    {role: 'system' as const, content: SYSTEM_DOC_QA},
    {role: 'user' as const, content: `Question: ${question}\n\nExcerpts:\n${context}`},
  ];
}
