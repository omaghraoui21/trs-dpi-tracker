/**
 * RESET — Vide toutes les données de la base de données.
 *
 * Garde uniquement un utilisateur admin pour permettre la reconnexion.
 * Après le reset, relancer seed_dpi.ts pour charger la configuration DPI.
 *
 * Run:
 *   pnpm --filter @workspace/api-server exec npx tsx src/scripts/reset.ts
 */
import bcrypt from "bcrypt";
import { sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

const TABLES = [
  // Transactionnel — dépend de tout
  "audit_log",
  "notifications",
  "kpi_daily",
  "kpi_monthly",
  "downtime_events",
  "activity_downtimes",
  "production_entries",
  "activities",
  "daily_entries",
  "equipment_status_events",
  "room_status_events",
  "planning_imports",
  "production_plans",
  "monthly_closures",
  "annual_calendar_events",
  // Config / référentiel
  "notification_rules",
  "kpi_targets",
  "standard_times",
  "assembly_boms",
  "product_presentations",
  "planning_activity_mappings",
  "cadences",
  "downtime_categories",
  "equipments",
  "rooms",
  "products",
  "users",
  "sites",
  "app_settings",
  "roles",
] as const;

async function main() {
  console.log("⚠️  RESET — Suppression de toutes les données…\n");

  for (const table of TABLES) {
    await db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
    console.log(`  ✓ ${table}`);
  }

  // Recréer l'admin pour ne pas être bloqué
  const hash = await bcrypt.hash("Admin@2026!", 12);
  await db.insert(usersTable).values({
    email: "admin@dpi.local",
    passwordHash: hash,
    firstName: "Admin",
    lastName: "DPI",
    fullName: "Admin DPI",
    role: "admin",
  });

  console.log("\n✅ Base vidée.");
  console.log("   Admin recréé : admin@dpi.local / Admin@2026!");
  console.log("\n👉 Relancer seed_dpi.ts pour charger la configuration DPI :\n");
  console.log(
    "   pnpm --filter @workspace/api-server exec npx tsx src/scripts/seed_dpi.ts\n",
  );

  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Erreur reset :", e);
  process.exit(1);
});
