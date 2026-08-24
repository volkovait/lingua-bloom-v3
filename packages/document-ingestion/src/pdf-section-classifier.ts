import type { DocumentIR, SectionSpec } from "@lingua-bloom/contracts";

export function classifyPdfSections(document: DocumentIR): SectionSpec[] {
  const sections: SectionSpec[] = [];
  let answerKeyMode = false;
  for (const block of document.blocks) {
    const text = block.rawText.trim();
    let kind: SectionSpec["kind"] = "unknown";
    let confidence = 0.65;
    if (/^answer\s*key\b/i.test(text)) {
      answerKeyMode = true;
      kind = "answerKey";
      confidence = 1;
    } else if (/^example\b/i.test(text)) {
      kind = "example";
      confidence = 1;
    } else if (/^[1-9]\d*\s+(choose|put|complete)\b/i.test(text)) {
      answerKeyMode = false;
      kind = "instruction";
      confidence = 1;
    } else if (answerKeyMode) {
      kind = "answerKey";
      confidence = 0.95;
    } else if (/^[1-9]\d*\s+/.test(text) || /_{3,}/.test(text)) {
      kind = "exercise";
      confidence = 0.9;
    }
    sections.push({
      id: `section:${block.id}`,
      kind,
      blockIds: [block.id],
      confidence
    });
  }
  return sections;
}
