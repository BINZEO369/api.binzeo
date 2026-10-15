import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/modules/identity/lib/supabase/server";
import { completeGoogleAccount } from "@/modules/identity/lib/google-account";

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (!code) return NextResponse.redirect(new URL("/signin?error=missing_code", req.url));

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent(error.message)}`, req.url));

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/signin?error=callback_user_missing", req.url));

    const metadata = user.user_metadata ?? {};
    const isGoogleUser = metadata.auth_provider === "google" || Boolean(metadata.google_sub);
    if (isGoogleUser) await completeGoogleAccount(user, req);

    return NextResponse.redirect(new URL(next, req.url));
  } catch (err) {
    console.error("[CALLBACK_ERROR]", err);
    return NextResponse.redirect(new URL("/signin?error=callback_failed", req.url));
  }
}
