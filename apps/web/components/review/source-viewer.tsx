import React from "react";

export function SourceViewer({
  kind,
  signedUrl,
  rawText
}: {
  readonly kind: "pdf" | "text";
  readonly signedUrl: string | null;
  readonly rawText: string | null;
}) {
  const pdfUrl = signedUrl ? `${signedUrl}#page=1&view=FitH` : null;
  const isText = kind === "text";

  return (
    <section className="review-panel source-panel" aria-labelledby="source-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Оригинал</p>
          <h2 id="source-title">{isText ? "Исходный текст" : "Предпросмотр PDF"}</h2>
        </div>
      </div>
      {isText && rawText != null ? (
        <pre className="text-source-frame">{rawText}</pre>
      ) : pdfUrl ? (
        <iframe className="pdf-frame" src={pdfUrl} title="Исходный PDF" />
      ) : (
        <p>{isText ? "Исходный текст недоступен." : "PDF недоступен."}</p>
      )}
    </section>
  );
}
