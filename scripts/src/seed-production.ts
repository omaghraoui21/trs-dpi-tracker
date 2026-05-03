/**
 * Seed de production minimal — Site El Fejja DPI
 *
 * Ce script crée uniquement les données essentielles pour la mise en production :
 *   - 1 compte admin
 *   - 1 compte superviseur
 *   - 1 compte opérateur
 *
 * Usage :
 *   DATABASE_URL=<prod_url> SESSION_SECRET=<secret> pnpm --filter @workspace/scripts run seed-prod
 *
 * ⚠️  Vérifier d'abord que la base est vide (ou que les emails n'existent pas déjà).
 */

import { db, usersTable } from "@workspace/db";
import bcrypt from "bcrypt";

const BCRYPT_ROUNDS = 12;

async function hashPwd(plain: string) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function main() {
  console.log("🌱 Seed de production — Site El Fejja DPI");

  const existingUsers = await db.select({ id: usersTable.id }).from(usersTable);
  if (existingUsers.length > 0) {
    console.warn(`⚠️  La base contient déjà ${existingUsers.length} utilisateur(s). Seed annulé pour éviter les doublons.`);
    console.warn("   Supprimez les données existantes ou utilisez le script de reset avant de relancer.");
    process.exit(1);
  }

  const users = [
    {
      email: "admin@dpi.local",
      firstName: "Admin",
      lastName: "DPI",
      role: "admin" as const,
      password: process.env.ADMIN_PASSWORD ?? "ChangeMe123!",
    },
    {
      email: "superviseur@dpi.local",
      firstName: "Superviseur",
      lastName: "DPI",
      role: "supervisor" as const,
      password: process.env.SUPERVISOR_PASSWORD ?? "ChangeMe123!",
    },
    {
      email: "operateur@dpi.local",
      firstName: "Opérateur",
      lastName: "DPI",
      role: "operator" as const,
      password: process.env.OPERATOR_PASSWORD ?? "ChangeMe123!",
    },
  ];

  for (const u of users) {
    const passwordHash = await hashPwd(u.password);
    await db.insert(usersTable).values({
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      passwordHash,
      isActive: true,
    });
    console.log(`  ✓ ${u.role.padEnd(10)} ${u.email}`);
  }

  console.log("\n✅ Seed terminé.");
  console.log("⚠️  Changez les mots de passe via l'interface Admin avant toute utilisation en production.");
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Erreur lors du seed :", err);
  process.exit(1);
});
