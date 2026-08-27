import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { SourceViewer } from "./source-viewer";

describe("SourceViewer", () => {
  test("renders immutable pasted text without a PDF frame", () => {
    const rawText = "1. She (to study) English.\n2. We (to go)";
    const html = renderToStaticMarkup(
      <SourceViewer kind="text" signedUrl={null} rawText={rawText} />
    );
    expect(html).toContain("Исходный текст");
    expect(html).toContain("1. She (to study) English.");
    expect(html).not.toContain("<iframe");
  });

  test("keeps the existing PDF preview", () => {
    const html = renderToStaticMarkup(
      <SourceViewer kind="pdf" signedUrl="https://example.test/source.pdf" rawText={null} />
    );
    expect(html).toContain("Предпросмотр PDF");
    expect(html).toContain("<iframe");
  });
});
