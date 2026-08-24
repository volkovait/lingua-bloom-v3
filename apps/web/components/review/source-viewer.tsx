import type { DocumentIR, SourceRef } from "@lingua-bloom/contracts";

export function SourceViewer({
  signedUrl,
  document,
  selectedRefs
}: {
  readonly signedUrl: string | null;
  readonly document: DocumentIR | null;
  readonly selectedRefs: readonly SourceRef[];
}) {
  const selectedBlocks = new Set(selectedRefs.map((ref) => ref.blockId));
  const selectedPage = selectedRefs.find((ref) => ref.pageIndex != null)?.pageIndex;
  const pdfUrl = signedUrl
    ? `${signedUrl}#page=${String((selectedPage ?? 0) + 1)}&view=FitH`
    : null;

  return (
    <section className="review-panel source-panel" aria-labelledby="source-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Оригинал</p>
          <h2 id="source-title">PDF и исходные блоки</h2>
        </div>
        {selectedPage != null ? (
          <span className="provenance-badge">Страница {selectedPage + 1}</span>
        ) : null}
      </div>
      {pdfUrl ? (
        <iframe className="pdf-frame" src={pdfUrl} title="Исходный PDF" />
      ) : (
        <p>PDF недоступен.</p>
      )}
      {document ? (
        <div className="source-blocks" aria-label="Извлечённый текст">
          {document.blocks.map((block) => (
            <article
              className={
                selectedBlocks.has(block.id) ? "source-block is-highlighted" : "source-block"
              }
              id={`source-${block.id}`}
              key={block.id}
            >
              <small>
                Страница {(block.pageIndex ?? 0) + 1} · блок {block.order + 1}
              </small>
              <p>{block.rawText || "[пустой блок]"}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
