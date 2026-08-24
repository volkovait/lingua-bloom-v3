import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { MAX_PDF_BYTES, resolveIdempotentReplay } from "@lingua-bloom/lesson-pipeline";
import { describe, expect, test } from "vitest";

import { parseImportRequest } from "../../src/imports/parse-import-request";

describe("POST /api/imports contract", () => {
  test("requires teacher auth and idempotency in OpenAPI", async () => {
    const openapi = await readFile(
      resolve(
        import.meta.dirname,
        "../../../../specs/001-reliable-source-ingestion/contracts/openapi.yaml"
      ),
      "utf8"
    );
    expect(openapi).toContain("required: [title, idempotencyKey]");
    expect(openapi).toContain("- teacherSession: []");
  });

  test("parses text and rejects a missing idempotency key", async () => {
    const valid = new FormData();
    valid.set("title", "Text");
    valid.set("idempotencyKey", "0123456789abcdef");
    valid.set("sourceText", "Exercise 1");
    await expect(parseImportRequest(valid)).resolves.toMatchObject({ kind: "text" });

    valid.delete("idempotencyKey");
    await expect(parseImportRequest(valid)).rejects.toThrow("idempotencyKey");
  });

  test("accepts exact PDF/text limits and returns structured errors above them", async () => {
    const pdf = new FormData();
    pdf.set("title", "PDF");
    pdf.set("idempotencyKey", "0123456789abcdef");
    pdf.set("sourceFile", new File(["%PDF-test"], "test.pdf", { type: "application/pdf" }));
    await expect(
      parseImportRequest(pdf, { countPdfPages: () => Promise.resolve(20) })
    ).resolves.toMatchObject({ kind: "pdf" });
    await expect(
      parseImportRequest(pdf, { countPdfPages: () => Promise.resolve(21) })
    ).rejects.toMatchObject({
      code: "SOURCE_TOO_LARGE",
      limitType: "pdfPages",
      limit: 20,
      actual: 21
    });

    const exactByteLimitFile = new File(["%PDF-test"], "exact.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(exactByteLimitFile, "size", { value: MAX_PDF_BYTES });
    pdf.set("sourceFile", exactByteLimitFile);
    await expect(
      parseImportRequest(pdf, { countPdfPages: () => Promise.resolve(20) })
    ).resolves.toMatchObject({ kind: "pdf" });

    const aboveByteLimitFile = new File(["%PDF-test"], "large.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(aboveByteLimitFile, "size", { value: MAX_PDF_BYTES + 1 });
    pdf.set("sourceFile", aboveByteLimitFile);
    await expect(
      parseImportRequest(pdf, { countPdfPages: () => Promise.resolve(20) })
    ).rejects.toMatchObject({
      code: "SOURCE_TOO_LARGE",
      limitType: "pdfBytes",
      limit: MAX_PDF_BYTES,
      actual: MAX_PDF_BYTES + 1
    });

    const text = new FormData();
    text.set("title", "Text");
    text.set("idempotencyKey", "0123456789abcdef");
    text.set("sourceText", "😀".repeat(500_000));
    await expect(parseImportRequest(text)).resolves.toMatchObject({ kind: "text" });
    text.set("sourceText", "😀".repeat(500_001));
    await expect(parseImportRequest(text)).rejects.toMatchObject({
      code: "SOURCE_TOO_LARGE",
      limitType: "textCharacters",
      limit: 500_000,
      actual: 500_001
    });
  });

  test("replays an exact request and conflicts on a different fingerprint", () => {
    const existing = { fingerprint: "same", value: { runId: "run-1" } };
    expect(resolveIdempotentReplay(existing, "same")).toEqual({
      kind: "replay",
      value: { runId: "run-1" }
    });
    expect(resolveIdempotentReplay(existing, "different")).toEqual({ kind: "conflict" });
  });
});
