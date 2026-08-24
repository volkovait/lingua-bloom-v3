export interface WorkflowEvent {
  readonly sequence: number;
  readonly type: string;
  readonly status: string;
  readonly step: string | null;
  readonly occurredAt: string;
}

export function WorkflowLog({
  events,
  currentStep
}: {
  readonly events: readonly WorkflowEvent[];
  readonly currentStep: string | null;
}) {
  return (
    <section className="review-panel workflow-log" aria-labelledby="workflow-log-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Workflow</p>
          <h2 id="workflow-log-title">Журнал обработки</h2>
        </div>
        <span className="workflow-live" aria-live="polite">
          {currentStep ? `Сейчас: ${stepLabel(currentStep)}` : "Ожидание запуска"}
        </span>
      </div>
      {events.length === 0 ? (
        <p className="workflow-empty">События появятся после запуска обработки.</p>
      ) : (
        <ol className="workflow-events" aria-live="polite">
          {[...events].reverse().map((event, index) => (
            <li className={`workflow-event status-${event.status}`} key={event.sequence}>
              <span className="workflow-marker" aria-hidden="true" />
              <div>
                <strong>{stepLabel(event.step ?? event.type)}</strong>
                <p>{statusLabel(event.status)}</p>
              </div>
              <time dateTime={event.occurredAt}>
                {formatTime(event.occurredAt)}
                {index === 0 ? <span>последнее</span> : null}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function stepLabel(step: string) {
  const labels: Record<string, string> = {
    accepted: "Импорт принят",
    "redispatch-requested": "Повторный запуск запрошен",
    "build-document-ir": "Чтение структуры документа",
    "assemble-draft": "Сборка черновика",
    "wait-for-review": "Ожидание проверки преподавателя",
    "review-submission": "Сохранение исправлений",
    "review-complete": "Проверка завершена",
    "publish-version": "Публикация версии",
    "ingestion-failed": "Ошибка обработки"
  };
  return labels[step] ?? step.replaceAll("-", " ");
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    accepted: "Принято в обработку",
    processing: "Выполняется",
    awaiting_review: "Требуется проверка",
    blocked: "Остановлено проверкой",
    ready_to_publish: "Готово к публикации",
    completed: "Завершено",
    failed: "Завершилось ошибкой"
  };
  return labels[status] ?? status;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }).format(date);
}
