import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcrypt";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET) throw new Error("SESSION_SECRET environment variable is required");
if (JWT_SECRET.length < 32)
  throw new Error("SESSION_SECRET must be at least 32 characters for production security");

const JWT_SECRET_KEY = new TextEncoder().encode(JWT_SECRET);

const BCRYPT_ROUNDS = 12;

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export async function signToken(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(JWT_SECRET_KEY);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_KEY, { algorithms: ["HS256"] });
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getUserFromToken(token: string) {
  const payload = await verifyToken(token);
  if (!payload) return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, payload.sub));
  if (!user || !user.isActive) return null;
  return user;
}

export function extractToken(
  authHeader?: string,
  cookies?: Record<string, unknown>,
): string | null {
  const cookieToken = cookies?.["auth_token"];
  if (typeof cookieToken === "string" && cookieToken.trim()) return cookieToken;

  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}
