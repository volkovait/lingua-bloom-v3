import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getServerEnvironment } from "../config/server-env";

export class UnauthenticatedError extends Error {
  constructor() {
    super("A valid teacher session is required");
    this.name = "UnauthenticatedError";
  }
}

export async function createTeacherSupabaseClient() {
  const environment = getServerEnvironment();
  const cookieStore = await cookies();

  return createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot write cookies; middleware/Route Handlers refresh sessions.
          }
        }
      }
    }
  );
}

export async function requireTeacher() {
  const supabase = await createTeacherSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new UnauthenticatedError();
  return { teacher: data.user, supabase };
}
