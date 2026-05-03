/**
 * Re-seeds user passwords with bcrypt hashes.
 * Run with: pnpm --filter @workspace/api-server exec npx tsx src/scripts/seed-passwords.ts
 */
import bcrypt from "bcrypt";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const ROUNDS = 12;

const seeds = [
  { email: "admin@dpi.local", password: "admin123" },
  { email: "superviseur@dpi.local", password: "super123" },
  { email: "operateur@dpi.local", password: "oper123" },
];

for (const s of seeds) {
  const hash = await bcrypt.hash(s.password, ROUNDS);
  await db.update(usersTable).set({ passwordHash: hash }).where(eq(usersTable.email, s.email));
  console.log(`Updated bcrypt hash for ${s.email}`);
}

console.log("Done.");
