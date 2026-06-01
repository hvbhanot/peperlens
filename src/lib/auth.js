import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// Loads the current user from the session cookie, or null. Server-side only.
export async function getCurrentUser() {
  const session = await getSession();
  if (!session?.uid) return null;
  const user = await prisma.user.findUnique({ where: { id: session.uid } });
  return user ?? null;
}

// Throws a Response-friendly sentinel when unauthenticated; route handlers
// translate this into a 401.
export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
