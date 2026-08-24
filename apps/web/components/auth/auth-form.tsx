"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type SyntheticEvent } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { createBrowserSupabaseClient } from "@/src/auth/browser-client";
import { safeNextPath } from "@/src/auth/safe-next-path";

type AuthMode = "login" | "sign-up";

export function AuthForm({ mode }: { readonly mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const callbackError = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(callbackError);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isLogin = mode === "login";

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!isLogin && password !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }
    if (password.length < 6) {
      setError("Пароль должен содержать не менее 6 символов.");
      return;
    }

    setPending(true);
    const supabase = createBrowserSupabaseClient();
    if (isLogin) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(localizeAuthError(signInError.message));
        setPending(false);
        return;
      }
      router.replace(nextPath);
      router.refresh();
      return;
    }

    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", nextPath);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callback.toString() }
    });
    if (signUpError) {
      setError(localizeAuthError(signUpError.message));
      setPending(false);
      return;
    }
    if (data.session) {
      router.replace(nextPath);
      router.refresh();
      return;
    }
    setMessage("Проверьте почту и подтвердите адрес, затем вернитесь ко входу.");
    setPending(false);
  }

  async function handleGoogleSignIn() {
    setError(null);
    setPending(true);
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", nextPath);
    const { error: oauthError } = await createBrowserSupabaseClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() }
    });
    if (oauthError) {
      setError(localizeAuthError(oauthError.message));
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand" aria-label="Lingua Bloom">
        <BrandLogo priority size="large" />
        <p>Создавайте интерактивные уроки из собственных материалов.</p>
      </section>

      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">Для преподавателей</p>
        <h1 id="auth-title">{isLogin ? "Войти в аккаунт" : "Создать аккаунт"}</h1>
        <p className="auth-description">
          {isLogin
            ? "Продолжите работу с материалами и уроками."
            : "Сохраняйте импорты, проверяйте ответы и публикуйте уроки."}
        </p>

        <button
          className="google-button"
          type="button"
          onClick={() => {
            void handleGoogleSignIn();
          }}
          disabled={pending}
        >
          <GoogleMark />
          Продолжить с Google
        </button>

        <div className="auth-divider">
          <span>или по электронной почте</span>
        </div>

        <form
          className="auth-form"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <label>
            Электронная почта
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="teacher@example.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
              disabled={pending}
              required
            />
          </label>
          <label>
            Пароль
            <input
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder="Не менее 6 символов"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              disabled={pending}
              required
            />
          </label>
          {!isLogin ? (
            <label>
              Повторите пароль
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                }}
                disabled={pending}
                required
              />
            </label>
          ) : null}

          {error ? (
            <p className="auth-alert" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="auth-success" role="status">
              {message}
            </p>
          ) : null}

          <button className="auth-submit" type="submit" disabled={pending}>
            {pending ? "Подождите…" : isLogin ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>

        <p className="auth-switch">
          {isLogin ? "Нет аккаунта?" : "Уже есть аккаунт?"}{" "}
          <Link
            href={`${isLogin ? "/auth/sign-up" : "/auth/login"}?next=${encodeURIComponent(nextPath)}`}
          >
            {isLogin ? "Зарегистрироваться" : "Войти"}
          </Link>
        </p>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285f4"
        d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.3h5.9a5.1 5.1 0 0 1-2.2 3.3v2.8h3.6c2.1-2 3.3-4.8 3.3-8.2Z"
      />
      <path
        fill="#34a853"
        d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .6-2.2 1-3.7 1a6.5 6.5 0 0 1-6.2-4.5H2.2V17A11 11 0 0 0 12 23Z"
      />
      <path fill="#fbbc05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8l3.6-2.8Z" />
      <path
        fill="#ea4335"
        d="M12 5.4c1.6 0 3.1.5 4.2 1.6l3.2-3.1A10.6 10.6 0 0 0 12 1a11 11 0 0 0-9.8 6.1l3.6 2.8A6.5 6.5 0 0 1 12 5.4Z"
      />
    </svg>
  );
}

function localizeAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "Неверная почта или пароль.";
  if (normalized.includes("email not confirmed"))
    return "Сначала подтвердите адрес электронной почты.";
  if (normalized.includes("user already registered"))
    return "Аккаунт с такой почтой уже существует.";
  return message;
}
