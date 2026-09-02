import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { MAX_PDF_PAGES, MAX_TEXT_CODE_POINTS } from "@lingua-bloom/contracts";
import { describe, expect, test, vi } from "vitest";

import { parseImportRequest } from "../../src/imports/parse-import-request";

describe("import admission limits", () => {
  test("rejects an oversized PDF while still in the admission parser", async () => {
    const countPdfPages = vi.fn(() => Promise.resolve(MAX_PDF_PAGES + 1));
    const form = importForm();
    form.set(
      "sourceFile",
      new File(["%PDF-test"], "too-many-pages.pdf", { type: "application/pdf" })
    );

    await expect(parseImportRequest(form, { countPdfPages })).rejects.toMatchObject({
      code: "SOURCE_TOO_LARGE",
      limitType: "pdfPages",
      limit: MAX_PDF_PAGES,
      actual: MAX_PDF_PAGES + 1
    });
    expect(countPdfPages).toHaveBeenCalledOnce();
  });

  test("counts normalized Unicode code points and rejects before workflow code can run", async () => {
    const exact = importForm();
    exact.set("sourceText", `${"😀".repeat(MAX_TEXT_CODE_POINTS - 1)}\r\n`);
    await expect(parseImportRequest(exact)).resolves.toMatchObject({ kind: "text" });

    const oversized = importForm();
    oversized.set("sourceText", `${"😀".repeat(MAX_TEXT_CODE_POINTS)}\r\n`);
    await expect(parseImportRequest(oversized)).rejects.toMatchObject({
      code: "SOURCE_TOO_LARGE",
      limitType: "textCharacters",
      limit: MAX_TEXT_CODE_POINTS,
      actual: MAX_TEXT_CODE_POINTS + 1
    });
  });

  test("the route admits input before storage and dispatch", async () => {
    const route = await readFile(
      resolve(import.meta.dirname, "../../app/api/imports/route.ts"),
      "utf8"
    );
    expect(route.indexOf("parseImportRequest(")).toBeGreaterThan(-1);
    expect(route.indexOf("parseImportRequest(")).toBeLessThan(route.indexOf("repository.persist("));
    expect(route.indexOf("parseImportRequest(")).toBeLessThan(route.indexOf("inngest.send("));
  });
});

function importForm(): FormData {
  const form = new FormData();
  form.set("title", "Admission limit");
  form.set("idempotencyKey", "admission-limit-test-key");
  return form;
}
