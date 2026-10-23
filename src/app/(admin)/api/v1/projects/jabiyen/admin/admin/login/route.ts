// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createJabiyenAuthClient, getJabiyenAdmin, supabase } from "@/admin/jabiyen/admin-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jsonOptions = { headers: { "Cache-Control": "no-store" } };

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Enter a valid admin email and password" }, { status: 400, ...jsonOptions });
  }

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 72) {
    return NextResponse.json({ success: false, error: "Enter a valid admin email and password" }, { status: 422, ...jsonOptions });
  }

  try {
    const authClient = createJabiyenAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data?.user || !data?.session) {
      return NextResponse.json({ success: false, error: "Invalid admin email or password" }, { status: 401, ...jsonOptions });
    }

    const { data: admin, error: adminError } = await getJabiyenAdmin(data.user.id);
    if (adminError) {
      return NextResponse.json({ success: false, error: "Could not verify JABIYEN admin access" }, { status: 503, ...jsonOptions });
    }
    if (!admin || admin.is_active !== true) {
      return NextResponse.json({ success: false, error: "This account does not have active JABIYEN admin access" }, { status: 403, ...jsonOptions });
    }

    return NextResponse.json({
      success: true,
      data: {
        session: data.session,
        user: { id: data.user.id, email: data.user.email },
        admin: { id: admin.id, email: admin.email, full_name: admin.full_name, role: admin.role },
      },
    }, jsonOptions);
  } catch {
    return NextResponse.json({ success: false, error: "JABIYEN admin sign-in could not be completed" }, { status: 500, ...jsonOptions });
  }
}
