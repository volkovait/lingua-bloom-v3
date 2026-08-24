import { Suspense } from "react";

import { AuthForm } from "@/components/auth/auth-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-page">
          <p>Загрузка…</p>
        </main>
      }
    >
      <AuthForm mode="login" />
    </Suspense>
  );
}
