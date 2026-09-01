export interface InlineChoicePrompt {
  readonly before: string;
  readonly after: string;
}

export function splitInlineChoicePrompt(prompt: string): InlineChoicePrompt | null {
  const matches = [...prompt.matchAll(/_{3,}/g)];
  if (matches.length !== 1) return null;
  const match = matches[0];
  if (!match) return null;
  return {
    before: prompt.slice(0, match.index),
    after: prompt.slice(match.index + match[0].length)
  };
}
