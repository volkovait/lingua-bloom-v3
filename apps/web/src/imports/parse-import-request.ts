import {
  validatePdfByteSize,
  validatePdfPageCount,
  validateTextCharacterCount
} from "@lingua-bloom/lesson-pipeline";

export interface ParsedImportRequest {
  readonly title: string;
  readonly idempotencyKey: string;
  readonly kind: "pdf" | "text";
  readonly mimeType: "application/pdf" | "text/plain";
  readonly bytes: Uint8Array;
}

export class InvalidImportRequestError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "InvalidImportRequestError";
  }
}

export interface ParseImportDependencies {
  readonly countPdfPages: (bytes: Uint8Array) => Promise<number>;
}

const defaultDependencies: ParseImportDependencies = {
  countPdfPages: async (bytes) => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // PDF.js transfers the supplied buffer to its worker. Parse a copy so the
    // original bytes remain available for hashing and durable source storage.
    const loadingTask = getDocument({ data: bytes.slice(), useWorkerFetch: false });
    try {
      return (await loadingTask.promise).numPages;
    } catch {
      throw new InvalidImportRequestError("PDF is malformed or unsupported");
    } finally {
      await loadingTask.destroy();
    }
  }
};

export async function parseImportRequest(
  formData: FormData,
  dependencies: ParseImportDependencies = defaultDependencies
): Promise<ParsedImportRequest> {
  const title = valueAsString(formData.get("title")).trim();
  const idempotencyKey = valueAsString(formData.get("idempotencyKey"));
  const sourceText = valueAsString(formData.get("sourceText"));
  const fileEntry = formData.get("sourceFile");
  const sourceFile = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

  if (!title || title.length > 200)
    throw new InvalidImportRequestError("title must contain 1–200 characters");
  if (idempotencyKey.length < 16 || idempotencyKey.length > 128) {
    throw new InvalidImportRequestError("idempotencyKey must contain 16–128 characters");
  }
  if (Boolean(sourceFile) === Boolean(sourceText)) {
    throw new InvalidImportRequestError("Provide exactly one of sourceFile or sourceText");
  }

  if (sourceFile) {
    if (sourceFile.type !== "application/pdf")
      throw new InvalidImportRequestError("Only PDF files are supported");
    validatePdfByteSize(sourceFile.size);
    const bytes = new Uint8Array(await sourceFile.arrayBuffer());
    validatePdfPageCount(await dependencies.countPdfPages(bytes));
    return {
      title,
      idempotencyKey,
      kind: "pdf",
      mimeType: "application/pdf",
      bytes
    };
  }

  validateTextCharacterCount(sourceText);
  const bytes = new TextEncoder().encode(sourceText);
  return { title, idempotencyKey, kind: "text", mimeType: "text/plain", bytes };
}

function valueAsString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
