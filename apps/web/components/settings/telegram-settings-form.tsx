"use client";

import type { TelegramSettingsView } from "@lingua-bloom/contracts";
import * as React from "react";

export function TelegramSettingsForm() {
  const [view, setView] = React.useState<TelegramSettingsView | null>(null);
  const [enabled, setEnabled] = React.useState(true);
  const [chatId, setChatId] = React.useState("");
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState<"save" | "test" | null>(null);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    void load();
  }, []);

  async function load() {
    const response = await fetch("/api/settings/telegram", { cache: "no-store" });
    const data = (await response.json()) as TelegramSettingsView & { message?: string };
    if (!response.ok) {
      setError(data.message ?? "Не удалось загрузить настройки");
      return;
    }
    setView(data);
    setEnabled(data.enabled);
    setChatId(data.chatId);
  }

  async function save(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    setError("");
    setMessage("");
    const response = await fetch("/api/settings/telegram", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled,
        chatId,
        ...(token.trim() ? { replacementBotToken: token.trim() } : {})
      })
    });
    const data = (await response.json()) as TelegramSettingsView & { message?: string };
    setBusy(null);
    if (!response.ok) {
      setError(data.message ?? "Не удалось сохранить настройки");
      return;
    }
    setView(data);
    setToken("");
    setMessage("Настройки сохранены. Токен больше не отображается.");
  }

  async function testMessage() {
    setBusy("test");
    setError("");
    setMessage("");
    const response = await fetch("/api/settings/telegram/test", { method: "POST" });
    const data = (await response.json()) as { message?: string };
    setBusy(null);
    if (!response.ok) {
      setError(data.message ?? "Тестовое сообщение не отправлено");
      return;
    }
    setMessage("Тестовое сообщение отправлено в Telegram.");
  }

  if (!view && !error) return <p role="status">Загружаем настройки…</p>;

  return (
    <form className="telegram-settings-card" onSubmit={(event) => void save(event)}>
      <div className="telegram-settings-status">
        <span
          aria-hidden="true"
          className={`telegram-status-dot${view?.tokenConfigured ? " is-connected" : ""}`}
        />
        <div>
          <strong>{view?.tokenConfigured ? "Бот подключён" : "Бот ещё не подключён"}</strong>
          <span>
            {view?.tokenConfigured
              ? "Токен сохранён и скрыт. Можно отправить тестовое сообщение."
              : "Добавьте Chat ID и Bot Token, чтобы получать результаты."}
          </span>
        </div>
      </div>
      <label className="telegram-toggle">
        <input
          className="telegram-toggle-input"
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target.checked);
          }}
        />
        <span aria-hidden="true" className="telegram-toggle-track">
          <span />
        </span>
        <span className="telegram-toggle-copy">
          <strong>Отправлять результаты в Telegram</strong>
          <small>Новые ученические попытки будут приходить в выбранный чат.</small>
        </span>
      </label>
      <div className="telegram-settings-fields">
        <label className="telegram-field">
          <span className="telegram-field-heading">
            <span>Chat ID</span>
            <small>Куда отправлять</small>
          </span>
          <input
            className="telegram-settings-control"
            type="text"
            name="telegram-chat-id"
            value={chatId}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder="-1001234567890"
            aria-describedby="telegram-chat-id-help"
            onChange={(event) => {
              setChatId(event.target.value);
            }}
            required
          />
          <small id="telegram-chat-id-help">
            Для группы ID обычно начинается с <code>-100</code>.
          </small>
        </label>
        <label className="telegram-field">
          <span className="telegram-field-heading">
            <span>Bot Token</span>
            <small>{view?.tokenConfigured ? "Сохранён" : "Обязательное поле"}</small>
          </span>
          <input
            className="telegram-settings-control"
            type="password"
            name="telegram-bot-token"
            value={token}
            autoComplete="new-password"
            placeholder={
              view?.tokenConfigured ? "Оставьте пустым, чтобы сохранить текущий" : "123456:ABC…"
            }
            aria-describedby="telegram-bot-token-help"
            onChange={(event) => {
              setToken(event.target.value);
            }}
            required={!view?.tokenConfigured}
          />
          <small id="telegram-bot-token-help">
            Токен зашифрован и не отображается после сохранения.
          </small>
        </label>
      </div>
      <aside className="settings-help" aria-label="Как подключить Telegram-бота">
        <strong>Как подключить</strong>
        <ol>
          <li>
            Создайте бота через <code>@BotFather</code>.
          </li>
          <li>
            Напишите боту <code>/start</code> или добавьте его в нужную группу.
          </li>
          <li>Укажите Chat ID и сохраните настройки.</li>
        </ol>
      </aside>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="student-notice" role="status">
          {message}
        </p>
      ) : null}
      <div className="settings-actions">
        <button className="primary-link" disabled={busy != null} type="submit">
          {busy === "save" ? "Сохраняем…" : "Сохранить"}
        </button>
        <button
          className="secondary-link"
          disabled={busy != null || !view?.tokenConfigured || !enabled}
          type="button"
          onClick={() => void testMessage()}
        >
          {busy === "test" ? "Отправляем…" : "Отправить тест"}
        </button>
      </div>
    </form>
  );
}
