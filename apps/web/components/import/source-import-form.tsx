"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type SyntheticEvent } from "react";

const MAX_PDF_BYTES = 52_428_800;
const MAX_TEXT_CHARACTERS = 500_000;

interface ImportResponse {
  readonly runId: string;
}

export function SourceImportForm() {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const titleInput = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [titleInvalid, setTitleInvalid] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const titleValue = title.trim();
    if (!titleValue) {
      setTitleInvalid(true);
      titleInput.current?.focus();
      return;
    }
    setTitleInvalid(false);
    setPending(true);
    try {
      formData.set("title", titleValue);
      const fileEntry = formData.get("sourceFile");
      const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
      const sourceTextEntry = formData.get("sourceText");
      const sourceText = typeof sourceTextEntry === "string" ? sourceTextEntry : "";
      if (Boolean(file) === Boolean(sourceText)) {
        throw new Error("Выберите ровно один источник: PDF или вставленный текст.");
      }
      if (file) validatePdf(file);
      if (Array.from(sourceText).length > MAX_TEXT_CHARACTERS) {
        throw new Error(limitGuidance(`Текст превышает ${format(MAX_TEXT_CHARACTERS)} символов.`));
      }

      idempotencyKey.current ??= crypto.randomUUID();
      formData.set("idempotencyKey", idempotencyKey.current);
      const response = await fetch("/api/imports", { method: "POST", body: formData });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(readApiError(body));
      const result = parseImportResponse(body);
      router.push(`/imports/${result.runId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось начать импорт.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="import-form" onSubmit={(event) => void submit(event)} noValidate>
      <label className={titleInvalid ? "title-field is-invalid" : "title-field"}>
        <span className="field-label-row">
          <span>Название урока</span>
          {titleInvalid ? <span className="field-error-chip">Нужно заполнить</span> : null}
        </span>
        <input
          ref={titleInput}
          name="title"
          value={title}
          maxLength={200}
          aria-invalid={titleInvalid}
          onChange={(event) => {
            setTitle(event.target.value);
            if (event.target.value.trim()) setTitleInvalid(false);
          }}
        />
      </label>
      <fieldset>
        <legend>Исходный материал</legend>
        <label>
          <span>PDF-файл</span>
          <input name="sourceFile" type="file" accept="application/pdf,.pdf" />
          <small>До 20 страниц и 50 МиБ.</small>
        </label>
        <div className="source-divider" aria-hidden="true">
          или
        </div>
        <label>
          <span>Вставленный текст</span>
          <textarea name="sourceText" rows={10} maxLength={MAX_TEXT_CHARACTERS + 1} />
          <small>До {format(MAX_TEXT_CHARACTERS)} Unicode-символов.</small>
        </label>
      </fieldset>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending}>
        {pending ? "Проверяем источник…" : "Начать импорт"}
      </button>
    </form>
  );
}

function validatePdf(file: File) {
  if (file.type !== "application/pdf") throw new Error("Поддерживаются только PDF-файлы.");
  if (file.size > MAX_PDF_BYTES) throw new Error(limitGuidance("PDF превышает 50 МиБ."));
}

function parseImportResponse(value: unknown): ImportResponse {
  if (!value || typeof value !== "object" || !("runId" in value)) {
    throw new Error("Сервер вернул некорректный ответ.");
  }
  const runId = value.runId;
  if (typeof runId !== "string" || !runId) throw new Error("Сервер не вернул runId.");
  return { runId };
}

function readApiError(value: unknown): string {
  if (value && typeof value === "object" && "message" in value) {
    const message = value.message;
    if (typeof message === "string") return message;
  }
  return "Не удалось начать импорт.";
}

function limitGuidance(detail: string): string {
  return `${detail} Разделите материал на части: каждая часть станет самостоятельным уроком.`;
}

function format(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}
