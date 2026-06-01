import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  const user = await prisma.user.findUnique({ where: { email } });
  // Constant-ish response: don't reveal whether the email exists.
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!ok) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ id: user.id, email: user.email });
}
