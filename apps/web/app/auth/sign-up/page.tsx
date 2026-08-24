import { Suspense } from "react";

import { AuthForm } from "@/components/auth/auth-form";

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-page">
          <p>Загрузка…</p>
        </main>
      }
    >
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
