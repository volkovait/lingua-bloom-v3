import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/src/auth/safe-next-path";
import { getServerEnvironment } from "@/src/config/server-env";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));
  if (!code) return authError(request, "Ссылка авторизации недействительна.", nextPath);

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  const environment = getServerEnvironment();
  const supabase = createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return authError(request, error.message, nextPath);
  return response;
}

function authError(request: NextRequest, message: string, nextPath: string) {
  const target = new URL("/auth/login", request.url);
  target.searchParams.set("error", message);
  target.searchParams.set("next", nextPath);
  return NextResponse.redirect(target);
}
