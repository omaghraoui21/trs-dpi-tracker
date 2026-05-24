/**
 * DEMO seed script — inserts GENERIC reference data for development/testing.
 *
 * WARNING: This seed creates generic pharmaceutical products (Amoxicilline,
 * Paracetamol, etc.) that are NOT DPI products. For the real DPI El Fejja
 * configuration, use seed_dpi.ts instead.
 *
 * All demo products and equipments are marked isActive=false and tagged
 * [DEMO] in description to avoid polluting production referentials.
 *
 * Run: pnpm --filter @workspace/api-server exec npx tsx src/scripts/seed.ts
 */
import bcrypt from "bcrypt";
import {
  db,
  usersTable,
  equipmentsTable,
  productsTable,
  cadencesTable,
  downtimeCategoriesTable,
  sitesTable,
  roomsTable,
} from "@workspace/db";

const ROUNDS = 12;

async function main() {
  console.log("🌱 Seeding database...");

  console.warn("\n⚠️  This is the DEMO seed. For DPI production, use seed_dpi.ts instead.\n");

  // ── Sites (DEMO) ────────────────────────────────────────────────────────────
  const [site] = await db
    .insert(sitesTable)
    .values({
      code: "SITE-01",
      name: "[DEMO] Site Pharma Principal",
      location: "France",
    })
    .returning();
  console.log("✅ Site:", site.code);

  // ── Rooms ──────────────────────────────────────────────────────────────────
  const roomDefs = [
    { code: "A23", name: "Local A23 — Pesée & Fabrication", roomType: "production" },
    { code: "A26", name: "Local A26 — Conditionnement primaire", roomType: "production" },
    { code: "A20", name: "Local A20 — Conditionnement secondaire", roomType: "production" },
    { code: "A19", name: "Local A19 — Conditionnement tertiaire", roomType: "production" },
  ];
  const rooms = await db
    .insert(roomsTable)
    .values(roomDefs.map((r) => ({ ...r, siteId: site.id })))
    .returning();
  console.log("✅ Rooms:", rooms.map((r) => r.code).join(", "));

  // ── Equipments ─────────────────────────────────────────────────────────────
  const equipDefs = [
    {
      code: "GEL-001",
      name: "[DEMO] Géluleuse Harro Höfliger",
      equipmentType: "geluleuse",
      trsObjective: "75",
      roomCode: "A23",
    },
    {
      code: "BLI-001",
      name: "[DEMO] Blistereuse IMA TR135 S",
      equipmentType: "blistereuse",
      trsObjective: "75",
      roomCode: "A26",
    },
    {
      code: "LCS-001",
      name: "[DEMO] Ligne conditionnement secondaire 1",
      equipmentType: "conditionnement",
      trsObjective: "70",
      roomCode: "A20",
    },
    {
      code: "LCS-002",
      name: "[DEMO] Ligne conditionnement secondaire 2",
      equipmentType: "conditionnement",
      trsObjective: "70",
      roomCode: "A20",
    },
  ];
  const equips = await db
    .insert(equipmentsTable)
    .values(
      equipDefs.map((e) => {
        const room = rooms.find((r) => r.code === e.roomCode);
        return {
          code: e.code,
          name: e.name,
          equipmentType: e.equipmentType,
          trsObjective: e.trsObjective,
          siteId: site.id,
          roomId: room?.id ?? null,
          isActive: false,
          description: "[DEMO] Donnée de démonstration — ne pas utiliser en production DPI",
        };
      }),
    )
    .returning();
  console.log("✅ Equipments:", equips.map((e) => e.code).join(", "));

  // ── Products ───────────────────────────────────────────────────────────────
  const productDefs = [
    {
      code: "PROD-001",
      name: "[DEMO] Amoxicilline 500mg",
      dosage: "500mg",
      pharmaceuticalForm: "gélule",
      isActive: false,
      description: "[DEMO] Produit générique de test",
    },
    {
      code: "PROD-002",
      name: "[DEMO] Paracétamol 1000mg",
      dosage: "1000mg",
      pharmaceuticalForm: "comprimé",
      isActive: false,
      description: "[DEMO] Produit générique de test",
    },
    {
      code: "PROD-003",
      name: "[DEMO] Ibuprofène 400mg",
      dosage: "400mg",
      pharmaceuticalForm: "comprimé",
      isActive: false,
      description: "[DEMO] Produit générique de test",
    },
    {
      code: "PROD-004",
      name: "[DEMO] Oméprazole 20mg",
      dosage: "20mg",
      pharmaceuticalForm: "gélule",
      isActive: false,
      description: "[DEMO] Produit générique de test",
    },
    {
      code: "PROD-005",
      name: "[DEMO] Metformine 850mg",
      dosage: "850mg",
      pharmaceuticalForm: "comprimé",
      isActive: false,
      description: "[DEMO] Produit générique de test",
    },
  ];
  const products = await db.insert(productsTable).values(productDefs).returning();
  console.log("✅ Products:", products.map((p) => p.code).join(", "));

  // ── Cadences ───────────────────────────────────────────────────────────────
  // Cadence: couples produit × équipement (géluleuse et blistereuse principalement)
  const gel = equips.find((e) => e.code === "GEL-001")!;
  const bli = equips.find((e) => e.code === "BLI-001")!;
  const cadenceDefs = products.flatMap((p) => [
    {
      productId: p.id,
      equipmentId: gel.id,
      theoreticalCadence: "150000",
      validatedCadence: "130000",
      unit: "gélules/h",
      validFrom: "2024-01-01",
    },
    {
      productId: p.id,
      equipmentId: bli.id,
      theoreticalCadence: "60000",
      validatedCadence: "55000",
      unit: "blisters/h",
      validFrom: "2024-01-01",
    },
  ]);
  await db.insert(cadencesTable).values(cadenceDefs);
  console.log("✅ Cadences:", cadenceDefs.length);

  // ── Downtime Categories ───────────────────────────────────────────────────
  const categories = [
    {
      code: "NET-PLAN",
      label: "Nettoyage planifié",
      impactType: "tR" as const,
      isPlanned: true,
      requiresComment: false,
      impactKpi: "DO",
    },
    {
      code: "MAINT-PREV",
      label: "Maintenance préventive",
      impactType: "tR" as const,
      isPlanned: true,
      requiresComment: true,
      impactKpi: "DO",
    },
    {
      code: "REGLAGE",
      label: "Réglage / mise en route",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO",
    },
    {
      code: "PANNE",
      label: "Panne équipement",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "DO",
    },
    {
      code: "ATTENTE-MAT",
      label: "Attente matière première",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO",
    },
    {
      code: "ATTENTE-DOC",
      label: "Attente documentation",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO",
    },
    {
      code: "MICRO-ARRET",
      label: "Micro-arrêt",
      impactType: "tN" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "TP",
    },
    {
      code: "RALENTIS",
      label: "Ralentissement cadence",
      impactType: "tN" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "TP",
    },
    {
      code: "REBUT",
      label: "Rebuts / non-conformes",
      impactType: "tU" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "TQ",
    },
    {
      code: "REPROCESSING",
      label: "Retraitement lots",
      impactType: "tU" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "TQ",
    },
    {
      code: "FERMETURE",
      label: "Fermeture usine",
      impactType: "tO" as const,
      isPlanned: true,
      requiresComment: false,
      impactKpi: "TRG",
    },
    {
      code: "REUNION",
      label: "Réunion / formation",
      impactType: "tR" as const,
      isPlanned: true,
      requiresComment: false,
      impactKpi: "DO",
    },
  ];
  await db.insert(downtimeCategoriesTable).values(categories);
  console.log("✅ Downtime categories:", categories.length);

  // ── Users ──────────────────────────────────────────────────────────────────
  const userDefs = [
    {
      email: "admin@dpi.local",
      password: "admin123",
      firstName: "Admin",
      lastName: "DPI",
      role: "admin" as const,
    },
    {
      email: "superviseur@dpi.local",
      password: "super123",
      firstName: "Marie",
      lastName: "Dupont",
      role: "supervisor" as const,
    },
    {
      email: "operateur@dpi.local",
      password: "oper123",
      firstName: "Jean",
      lastName: "Martin",
      role: "operator" as const,
    },
  ];
  for (const u of userDefs) {
    const passwordHash = await bcrypt.hash(u.password, ROUNDS);
    const [user] = await db
      .insert(usersTable)
      .values({
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        fullName: `${u.firstName} ${u.lastName}`,
        role: u.role,
      })
      .returning();
    console.log(`✅ User: ${user.email} (${user.role})`);
  }

  console.log("\n🎉 Seed complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
