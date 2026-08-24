import { NextResponse } from "next/server";

import { createTeacherSupabaseClient } from "@/src/auth/require-teacher";

export async function POST(request: Request) {
  const supabase = await createTeacherSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/auth/login", request.url), 303);
}
