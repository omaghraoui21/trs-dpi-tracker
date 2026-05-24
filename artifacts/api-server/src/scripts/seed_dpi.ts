/**
 * DPI TERIAK EF — Seed configuration complète
 * Site El Fejja, Unité DPI, Formes inhalées poudre sèche.
 *
 * Idempotent: utilise onConflictDoNothing sur les clés uniques.
 *
 * Run direct:
 *   pnpm --filter @workspace/api-server exec npx tsx src/scripts/seed_dpi.ts
 *
 * Or call seedDpiConfig() from the API route.
 */
import {
  db,
  sitesTable,
  roomsTable,
  equipmentsTable,
  productsTable,
  cadencesTable,
  downtimeCategoriesTable,
  kpiTargetsTable,
  notificationRulesTable,
  planningActivityMappingsTable,
  productPresentationsTable,
  assemblyBomsTable,
  standardTimesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

export interface SeedResult {
  site: string;
  rooms: number;
  equipments: number;
  products: number;
  cadences: number;
  downtimeCategories: number;
  kpiTargets: number;
  notificationRules: number;
  planningMappings: number;
  presentations: number;
  assemblyBoms: number;
  standardTimes: number;
  warnings: string[];
}

export async function seedDpiConfig(): Promise<SeedResult> {
  const warnings: string[] = [];
  console.log("🌱 DPI seed — Site El Fejja…");

  // ── 1. Site ──────────────────────────────────────────────────────────────
  const existingSites = await db.select().from(sitesTable).where(eq(sitesTable.code, "EF"));
  let siteId: string;
  if (existingSites.length > 0) {
    siteId = existingSites[0].id;
    console.log("  ↩ Site EF déjà présent");
  } else {
    const [site] = await db
      .insert(sitesTable)
      .values({
        code: "EF",
        name: "Site El Fejja — DPI",
        location: "El Fejja, Tunisie",
      })
      .returning();
    siteId = site.id;
    console.log("  ✅ Site EF créé");
  }

  // ── 2. Locaux ─────────────────────────────────────────────────────────────
  const roomDefs = [
    { code: "A23", name: "Box de process — Pesée / Tamisage / Mélange", roomType: "production" },
    { code: "A26", name: "Stockage intermédiaire MP/SF", roomType: "storage" },
    { code: "A27", name: "Local géluleuse", roomType: "production" },
    {
      code: "BLISTER",
      name: "Local blistereuse — Conditionnement primaire",
      roomType: "production",
    },
    { code: "SEC", name: "Local conditionnement secondaire", roomType: "production" },
    { code: "A20", name: "Laverie — Nettoyage matériel", roomType: "utility" },
    { code: "A19", name: "Local matériel propre", roomType: "utility" },
    { code: "A18", name: "Local divers / archives", roomType: "utility" },
  ];

  const roomRows = await db
    .insert(roomsTable)
    .values(roomDefs.map((r) => ({ ...r, siteId })))
    .onConflictDoNothing()
    .returning();

  // Reload to get all rooms (including pre-existing)
  const allRooms = await db.select().from(roomsTable).where(eq(roomsTable.siteId, siteId));
  const roomByCode = Object.fromEntries(allRooms.map((r) => [r.code, r]));
  console.log(`  ✅ Locaux: ${allRooms.map((r) => r.code).join(", ")}`);

  // ── 3. Équipements ────────────────────────────────────────────────────────
  const equipDefs = [
    {
      code: "GEL-HH-MODUC",
      name: "Géluleuse Harro Höfliger Modu-C",
      equipmentType: "geluleuse",
      trsObjective: "75",
      roomCode: "A27",
      description: "Remplissage capsules HPMC taille 3 — DPI",
    },
    {
      code: "BLI-IMA-TR135S",
      name: "Blistereuse IMA TR135 S",
      equipmentType: "blistereuse",
      trsObjective: "75",
      roomCode: "BLISTER",
      description: "Conditionnement primaire blister gélules DPI — cadence ref 120 blisters/min",
    },
    {
      code: "TAM-RUSSELL",
      name: "Tamis Russell Finex",
      equipmentType: "tamiseur",
      trsObjective: "80",
      roomCode: "A23",
      description: "Tamisage/désagglomération poudre DPI — maille 250 µm",
    },
    {
      code: "MEL-INVERSINA-20L",
      name: "Mélangeur Inversina 20 L",
      equipmentType: "melangeur",
      trsObjective: "80",
      roomCode: "A23",
      description: "Mélange poudre DPI — capacité 20 L",
    },
    {
      code: "F0171",
      name: "Hotte à flux laminaire F0171",
      equipmentType: "hotte",
      trsObjective: "90",
      roomCode: "A23",
      description: "Prélèvement / protection produit — EQU-07-36/02",
    },
    {
      code: "SEC-L1",
      name: "Ligne conditionnement secondaire 1",
      equipmentType: "conditionnement",
      trsObjective: "70",
      roomCode: "SEC",
      description: "Mise en boîte / étuyage / vignettage",
    },
    {
      code: "SEC-L2",
      name: "Ligne conditionnement secondaire 2",
      equipmentType: "conditionnement",
      trsObjective: "70",
      roomCode: "SEC",
      description: "Assemblage Combifor et conditionnement tertiaire",
    },
  ];

  await db
    .insert(equipmentsTable)
    .values(
      equipDefs.map((e) => ({
        code: e.code,
        name: e.name,
        equipmentType: e.equipmentType,
        trsObjective: e.trsObjective,
        siteId,
        roomId: roomByCode[e.roomCode]?.id ?? null,
        description: e.description,
      })),
    )
    .onConflictDoNothing();

  const allEquips = await db
    .select()
    .from(equipmentsTable)
    .where(eq(equipmentsTable.siteId, siteId));
  const equipByCode = Object.fromEntries(allEquips.map((e) => [e.code, e]));
  console.log(`  ✅ Équipements: ${allEquips.map((e) => e.code).join(", ")}`);

  // ── 4. Produits ───────────────────────────────────────────────────────────
  const productDefs = [
    {
      code: "AEROFOR-12",
      name: "Aerofor 12 µg",
      dosage: "12 µg",
      pharmaceuticalForm: "poudre pour inhalation en gélule (DPI)",
      description:
        "Formoterol fumarate dihydrate — capsule HPMC taille 3 — fill weight ~25 mg — support lactose inhalation grade",
    },
    {
      code: "AERONIDE-200",
      name: "Aeronide 200 µg",
      dosage: "200 µg",
      pharmaceuticalForm: "poudre pour inhalation en gélule (DPI)",
      description: "Capsule HPMC taille 3 — taille lot à confirmer",
    },
    {
      code: "AERONIDE-400",
      name: "Aeronide 400 µg",
      dosage: "400 µg",
      pharmaceuticalForm: "poudre pour inhalation en gélule (DPI)",
      description: "Capsule HPMC taille 3 — taille lot à confirmer",
    },
    {
      code: "COMBIFOR-12-200",
      name: "Combifor 12/200 µg",
      dosage: "12/200 µg",
      pharmaceuticalForm: "produit assemblé DPI — kit inhalation",
      description: "Assemblage pochette Aerofor 12 + pochette Aeronide 200",
    },
    {
      code: "COMBIFOR-12-400",
      name: "Combifor 12/400 µg",
      dosage: "12/400 µg",
      pharmaceuticalForm: "produit assemblé DPI — kit inhalation",
      description: "Assemblage pochette Aerofor 12 + pochette Aeronide 400",
    },
  ];

  await db.insert(productsTable).values(productDefs).onConflictDoNothing();
  const allProducts = await db.select().from(productsTable);
  const prodByCode = Object.fromEntries(allProducts.map((p) => [p.code, p]));
  console.log(`  ✅ Produits: ${Object.keys(prodByCode).join(", ")}`);

  // ── 5. Cadences ───────────────────────────────────────────────────────────
  // Blistereuse: 120 blisters/min = 7200 blisters/h (confirmé)
  // Géluleuse: à confirmer — non seedé
  const bli = equipByCode["BLI-IMA-TR135S"];
  let cadenceCount = 0;
  if (bli) {
    const cadenceDefs = ["AEROFOR-12", "AERONIDE-200", "AERONIDE-400"].map((code) => ({
      productId: prodByCode[code].id,
      equipmentId: bli.id,
      theoreticalCadence: "7200",
      validatedCadence: "7200",
      unit: "blisters/h",
      validFrom: "2026-01-01",
    }));
    await db.insert(cadencesTable).values(cadenceDefs).onConflictDoNothing();
    cadenceCount = cadenceDefs.length;
    warnings.push(
      "Cadence géluleuse non confirmée — à saisir dans Admin → Cadences après validation process",
    );
  }
  console.log(`  ✅ Cadences blistereuse: ${cadenceCount} (géluleuse: à confirmer)`);

  // ── 6. Catégories d'arrêts DPI (45) ────────────────────────────────────────
  const downtimeDefs = [
    // — Famille Panne équipement —
    {
      code: "BOUCH",
      label: "Bouchage poudre",
      famille: "Panne équipement",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "DO/TP",
      displayOrder: 1,
    },
    {
      code: "ECOUL",
      label: "Mauvais écoulement poudre",
      famille: "Panne équipement",
      impactType: "tN" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "TP",
      displayOrder: 2,
    },
    {
      code: "POUDRE_COLLANTE",
      label: "Poudre collante / mauvaise fluidité",
      famille: "Panne équipement",
      impactType: "tN" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "TP",
      displayOrder: 3,
    },
    {
      code: "SEGREG",
      label: "Suspicion ségrégation poudre",
      famille: "Contrôle qualité",
      impactType: "TQ" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "TQ",
      displayOrder: 4,
    },

    // — Famille Panne équipement (suite) —
    {
      code: "AG",
      label: "Arrêt géluleuse",
      famille: "Panne équipement",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 10,
    },
    {
      code: "REGL_GEL",
      label: "Réglage géluleuse",
      famille: "Réglage/changement",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "DO/TP",
      displayOrder: 11,
    },
    {
      code: "ALIM_GEL",
      label: "Problème alimentation gélules",
      famille: "Panne équipement",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO/TP",
      displayOrder: 12,
    },
    {
      code: "POIDS_HORS_TENDANCE",
      label: "Poids gélules hors tendance",
      famille: "Contrôle qualité",
      impactType: "TQ" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "TQ/TP",
      displayOrder: 13,
    },
    {
      code: "REJET_GELULE",
      label: "Rejet gélules / défaut capsules",
      famille: "Contrôle qualité",
      impactType: "TQ" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "TQ",
      displayOrder: 14,
    },
    {
      code: "DEDUSTER",
      label: "Problème deduster",
      famille: "Panne équipement",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO/TP",
      displayOrder: 15,
    },
    {
      code: "VACUUM",
      label: "Problème vacuum / aspiration",
      famille: "Panne équipement",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO/TP",
      displayOrder: 16,
    },

    // — Famille Panne équipement (blistereuse) —
    {
      code: "AB",
      label: "Arrêt blistereuse",
      famille: "Panne équipement",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 20,
    },
    {
      code: "CHG_PVC",
      label: "Changement bobine PVC",
      famille: "Réglage/changement",
      impactType: "tR" as const,
      isPlanned: true,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 21,
    },
    {
      code: "CHG_ALU",
      label: "Changement bobine aluminium",
      famille: "Réglage/changement",
      impactType: "tR" as const,
      isPlanned: true,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 22,
    },
    {
      code: "CHG_COMBIFOR",
      label: "Changement / assemblage Combifor",
      famille: "Réglage/changement",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "DO/TP",
      displayOrder: 23,
    },
    {
      code: "CAMERA",
      label: "Problème caméra / lecture blister",
      famille: "Panne équipement",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "DO/TQ",
      displayOrder: 24,
    },
    {
      code: "THERMOFORMAGE",
      label: "Problème thermoformage PVC",
      famille: "Panne équipement",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO/TQ",
      displayOrder: 25,
    },
    {
      code: "SCELLAGE",
      label: "Problème scellage aluminium",
      famille: "Contrôle qualité",
      impactType: "TQ" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "TQ/DO",
      displayOrder: 26,
    },
    {
      code: "DECALAGE",
      label: "Décalage impression / positionnement",
      famille: "Contrôle qualité",
      impactType: "TQ" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "TQ/DO",
      displayOrder: 27,
    },
    {
      code: "ALIM_BLISTERS",
      label: "Problème alimentation blister / articles",
      famille: "Attente matière/article",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 28,
    },

    // — Famille Nettoyage + Réglage/changement —
    {
      code: "CHSG",
      label: "Changement série",
      famille: "Réglage/changement",
      impactType: "tR" as const,
      isPlanned: true,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 30,
    },
    {
      code: "NET_COMP_LOCAL",
      label: "Nettoyage complet local",
      famille: "Nettoyage",
      impactType: "tR" as const,
      isPlanned: true,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 31,
    },
    {
      code: "NET_MAJ_EQ",
      label: "Nettoyage majeur équipement",
      famille: "Nettoyage",
      impactType: "tR" as const,
      isPlanned: true,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 32,
    },
    {
      code: "NET_MIN_EQ",
      label: "Nettoyage mineur équipement",
      famille: "Nettoyage",
      impactType: "tR" as const,
      isPlanned: true,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 33,
    },
    {
      code: "VA",
      label: "Vide d'atelier",
      famille: "Nettoyage",
      impactType: "tR" as const,
      isPlanned: true,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 34,
    },

    // — Famille Attente matière/article —
    {
      code: "MQCH",
      label: "Manque charge",
      famille: "Attente matière/article",
      impactType: "tO" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 40,
    },
    {
      code: "ATT_MP",
      label: "Attente matières premières pesées",
      famille: "Attente matière/article",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 41,
    },
    {
      code: "ATT_GEL",
      label: "Attente gélules vides",
      famille: "Attente matière/article",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 42,
    },
    {
      code: "ATT_PVC",
      label: "Attente bobine PVC",
      famille: "Attente matière/article",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 43,
    },
    {
      code: "ATT_ALU",
      label: "Attente aluminium",
      famille: "Attente matière/article",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 44,
    },
    {
      code: "ATT_ETUI",
      label: "Attente étuis / notices / articles",
      famille: "Attente matière/article",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 45,
    },

    // — Famille Panne équipement (maintenance) —
    {
      code: "IM",
      label: "Intervention maintenance",
      famille: "Panne équipement",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "DO",
      displayOrder: 50,
    },
    {
      code: "PANNE_MECA",
      label: "Panne mécanique",
      famille: "Panne équipement",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "DO",
      displayOrder: 51,
    },
    {
      code: "PANNE_ELEC",
      label: "Panne électrique / automatisme",
      famille: "Panne équipement",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "DO",
      displayOrder: 52,
    },
    {
      code: "UTIL",
      label: "Utilités / environnement (HVAC/air)",
      famille: "Panne équipement",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 53,
    },

    // — Famille Contrôle qualité —
    {
      code: "NQ",
      label: "Non qualité",
      famille: "Contrôle qualité",
      impactType: "TQ" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "TQ",
      displayOrder: 60,
    },
    {
      code: "OOS_POIDS",
      label: "OOS / dérive poids",
      famille: "Contrôle qualité",
      impactType: "TQ" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "TQ/TP",
      displayOrder: 61,
    },
    {
      code: "REBUT",
      label: "Rebut élevé",
      famille: "Contrôle qualité",
      impactType: "TQ" as const,
      isPlanned: false,
      requiresComment: true,
      impactKpi: "TQ",
      displayOrder: 62,
    },
    {
      code: "ATT_CQ",
      label: "Attente contrôle qualité",
      famille: "Contrôle qualité",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 63,
    },

    // — Famille Autre (performance) —
    {
      code: "SP",
      label: "Sous-performance cadence",
      famille: "Autre",
      impactType: "tN" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "TP",
      displayOrder: 70,
    },
    {
      code: "ECART_CADENCE",
      label: "Écart cadence",
      famille: "Autre",
      impactType: "tN" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "TP",
      displayOrder: 71,
    },
    {
      code: "MICRO_ARRETS",
      label: "Micro-arrêts répétitifs",
      famille: "Autre",
      impactType: "tN" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "TP",
      displayOrder: 72,
    },

    // — Famille Autre (organisation) —
    {
      code: "ORG",
      label: "Organisation / disponibilité personnel",
      famille: "Autre",
      impactType: "tF" as const,
      isPlanned: false,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 80,
    },
    {
      code: "PAUSE",
      label: "Pause",
      famille: "Autre",
      impactType: "tO" as const,
      isPlanned: true,
      requiresComment: false,
      impactKpi: "TRG",
      displayOrder: 81,
    },
    {
      code: "FORMATION",
      label: "Formation / briefing",
      famille: "Autre",
      impactType: "tR" as const,
      isPlanned: true,
      requiresComment: false,
      impactKpi: "DO",
      displayOrder: 82,
    },
  ];

  await db
    .insert(downtimeCategoriesTable)
    .values(downtimeDefs.map(({ displayOrder: _d, ...d }) => d))
    .onConflictDoNothing();

  const allCategories = await db.select().from(downtimeCategoriesTable);
  console.log(`  ✅ Catégories d'arrêts DPI: ${allCategories.length}`);

  // ── 7. Objectifs KPI ──────────────────────────────────────────────────────
  const gel = equipByCode["GEL-HH-MODUC"];
  const bli2 = equipByCode["BLI-IMA-TR135S"];

  const kpiDefs = [
    // Site-wide
    {
      kpiCode: "TRS",
      targetValue: "75",
      warningThreshold: "70",
      criticalThreshold: "60",
      validFrom: "2026-01-01",
      siteId,
    },
    {
      kpiCode: "DO",
      targetValue: "80",
      warningThreshold: "75",
      criticalThreshold: "65",
      validFrom: "2026-01-01",
      siteId,
    },
    {
      kpiCode: "TP",
      targetValue: "90",
      warningThreshold: "85",
      criticalThreshold: "75",
      validFrom: "2026-01-01",
      siteId,
    },
    {
      kpiCode: "TQ",
      targetValue: "98",
      warningThreshold: "95",
      criticalThreshold: "90",
      validFrom: "2026-01-01",
      siteId,
    },
    {
      kpiCode: "PLANNING",
      targetValue: "85",
      warningThreshold: "75",
      criticalThreshold: "65",
      validFrom: "2026-01-01",
      siteId,
    },

    // Géluleuse
    ...(gel
      ? [
          {
            kpiCode: "TRS",
            targetValue: "75",
            warningThreshold: "68",
            criticalThreshold: "60",
            validFrom: "2026-01-01",
            equipmentId: gel.id,
          },
          {
            kpiCode: "DO",
            targetValue: "80",
            warningThreshold: "72",
            criticalThreshold: "62",
            validFrom: "2026-01-01",
            equipmentId: gel.id,
          },
        ]
      : []),

    // Blistereuse
    ...(bli2
      ? [
          {
            kpiCode: "TRS",
            targetValue: "78",
            warningThreshold: "70",
            criticalThreshold: "62",
            validFrom: "2026-01-01",
            equipmentId: bli2.id,
          },
          {
            kpiCode: "DO",
            targetValue: "82",
            warningThreshold: "75",
            criticalThreshold: "65",
            validFrom: "2026-01-01",
            equipmentId: bli2.id,
          },
        ]
      : []),
  ];

  await db.insert(kpiTargetsTable).values(kpiDefs).onConflictDoNothing();
  console.log(`  ✅ Objectifs KPI: ${kpiDefs.length}`);

  // ── 8. Règles de notifications DPI ────────────────────────────────────────
  const notifDefs = [
    {
      ruleCode: "DPI-PANNE-15MIN",
      ruleName: "Panne équipement > 15 min",
      conditionExpression:
        "downtime.code IN ('AG','AB','PANNE_MECA','PANNE_ELEC') AND duration > 15",
      severity: "critical",
      thresholdValue: "15",
      targetRoles: "supervisor,admin",
      inAppEnabled: true,
    },
    {
      ruleCode: "DPI-BOUCH-10MIN",
      ruleName: "Arrêt bouchage > 10 min",
      conditionExpression: "downtime.code = 'BOUCH' AND duration > 10",
      severity: "critical",
      thresholdValue: "10",
      targetRoles: "supervisor,operator",
      inAppEnabled: true,
    },
    {
      ruleCode: "DPI-MICRO-5X",
      ruleName: "Micro-arrêts > 5 occurrences / poste",
      conditionExpression: "downtime.code = 'MICRO_ARRETS' AND count > 5",
      severity: "warning",
      thresholdValue: "5",
      targetRoles: "supervisor",
      inAppEnabled: true,
    },
    {
      ruleCode: "DPI-TP-70",
      ruleName: "TP < 70%",
      conditionExpression: "kpi.TP < 70",
      severity: "critical",
      thresholdValue: "70",
      targetRoles: "supervisor,admin",
      inAppEnabled: true,
    },
    {
      ruleCode: "DPI-DO-80",
      ruleName: "DO < 80%",
      conditionExpression: "kpi.DO < 80",
      severity: "warning",
      thresholdValue: "80",
      targetRoles: "supervisor",
      inAppEnabled: true,
    },
    {
      ruleCode: "DPI-TQ-98",
      ruleName: "TQ < 98%",
      conditionExpression: "kpi.TQ < 98",
      severity: "critical",
      thresholdValue: "98",
      targetRoles: "supervisor,admin",
      inAppEnabled: true,
    },
    {
      ruleCode: "DPI-PLANNING-75",
      ruleName: "Respect planning < 75%",
      conditionExpression: "kpi.PLANNING < 75",
      severity: "warning",
      thresholdValue: "75",
      targetRoles: "supervisor",
      inAppEnabled: true,
    },
    {
      ruleCode: "DPI-NET-DEPASSE",
      ruleName: "Nettoyage dépasse standard",
      conditionExpression:
        "activity.type IN ('nettoyage_local','nettoyage_complet') AND duration > standard",
      severity: "warning",
      thresholdValue: null,
      targetRoles: "supervisor",
      inAppEnabled: true,
    },
    {
      ruleCode: "DPI-PVC-DEPASSE",
      ruleName: "Changement bobine PVC dépasse standard",
      conditionExpression: "downtime.code = 'CHG_PVC' AND duration > standard",
      severity: "warning",
      thresholdValue: null,
      targetRoles: "supervisor",
      inAppEnabled: true,
    },
    {
      ruleCode: "DPI-ACTIVITE-30MIN",
      ruleName: "Activité planifiée non démarrée > 30 min",
      conditionExpression: "activity.status = 'planned' AND delay > 30",
      severity: "warning",
      thresholdValue: "30",
      targetRoles: "supervisor",
      inAppEnabled: true,
    },
    {
      ruleCode: "DPI-A26-SATURE",
      ruleName: "A26 saturé",
      conditionExpression: "room.code = 'A26' AND status = 'Saturé'",
      severity: "warning",
      thresholdValue: null,
      targetRoles: "supervisor",
      inAppEnabled: true,
    },
    {
      ruleCode: "DPI-ATT-MATIERE-30MIN",
      ruleName: "Attente matière / articles > 30 min",
      conditionExpression:
        "downtime.code IN ('ATT_MP','ATT_GEL','ATT_PVC','ATT_ALU','ATT_ETUI') AND duration > 30",
      severity: "warning",
      thresholdValue: "30",
      targetRoles: "supervisor",
      inAppEnabled: true,
    },
  ];

  await db.insert(notificationRulesTable).values(notifDefs).onConflictDoNothing();
  console.log(`  ✅ Règles notifications DPI: ${notifDefs.length}`);

  // ── 9. Mappings planning Excel ────────────────────────────────────────────
  const mappingDefs = [
    {
      activityLabel: "PRODUCTION AEROFOR",
      mappedActivityType: "production",
      defaultUnit: "gelules",
      isProductive: true,
      excludedFromTrs: false,
      triggersStatus: true,
      equipmentCode: "GEL-HH-MODUC",
    },
    {
      activityLabel: "PRODUCTION AERONIDE",
      mappedActivityType: "production",
      defaultUnit: "gelules",
      isProductive: true,
      excludedFromTrs: false,
      triggersStatus: true,
      equipmentCode: "GEL-HH-MODUC",
    },
    {
      activityLabel: "BLISTERAGE",
      mappedActivityType: "conditionnement_primaire",
      defaultUnit: "blisters",
      isProductive: true,
      excludedFromTrs: false,
      triggersStatus: true,
      equipmentCode: "BLI-IMA-TR135S",
    },
    {
      activityLabel: "CONDITIONNEMENT SEC",
      mappedActivityType: "conditionnement_secondaire",
      defaultUnit: "boites",
      isProductive: true,
      excludedFromTrs: false,
      triggersStatus: true,
      equipmentCode: "SEC-L1",
    },
    {
      activityLabel: "ASSEMBLAGE COMBIFOR",
      mappedActivityType: "production",
      defaultUnit: "kits",
      isProductive: true,
      excludedFromTrs: false,
      triggersStatus: true,
      equipmentCode: "SEC-L2",
    },
    {
      activityLabel: "NETTOYAGE LOCAL A23",
      mappedActivityType: "nettoyage_local",
      defaultUnit: null,
      isProductive: false,
      excludedFromTrs: false,
      triggersStatus: false,
      roomCode: "A23",
    },
    {
      activityLabel: "NETTOYAGE GELULEUSE",
      mappedActivityType: "nettoyage_complet",
      defaultUnit: null,
      isProductive: false,
      excludedFromTrs: false,
      triggersStatus: false,
      equipmentCode: "GEL-HH-MODUC",
    },
    {
      activityLabel: "NETTOYAGE BLISTEREUSE",
      mappedActivityType: "nettoyage_complet",
      defaultUnit: null,
      isProductive: false,
      excludedFromTrs: false,
      triggersStatus: false,
      equipmentCode: "BLI-IMA-TR135S",
    },
    {
      activityLabel: "MAINTENANCE PREVENTIVE",
      mappedActivityType: "maintenance_preventive",
      defaultUnit: null,
      isProductive: false,
      excludedFromTrs: false,
      triggersStatus: false,
    },
    {
      activityLabel: "MAINTENANCE CORRECTIVE",
      mappedActivityType: "maintenance_corrective",
      defaultUnit: null,
      isProductive: false,
      excludedFromTrs: false,
      triggersStatus: false,
    },
    {
      activityLabel: "VIDE ATELIER",
      mappedActivityType: "changement_serie",
      defaultUnit: null,
      isProductive: false,
      excludedFromTrs: false,
      triggersStatus: false,
    },
    {
      activityLabel: "QUALIFICATION",
      mappedActivityType: "qualification",
      defaultUnit: null,
      isProductive: false,
      excludedFromTrs: true,
      triggersStatus: false,
    },
    {
      activityLabel: "TAMISAGE",
      mappedActivityType: "production",
      defaultUnit: "kg",
      isProductive: true,
      excludedFromTrs: false,
      triggersStatus: true,
      equipmentCode: "TAM-RUSSELL",
    },
    {
      activityLabel: "MELANGE",
      mappedActivityType: "production",
      defaultUnit: "kg",
      isProductive: true,
      excludedFromTrs: false,
      triggersStatus: true,
      equipmentCode: "MEL-INVERSINA-20L",
    },
    {
      activityLabel: "JOUR OFF",
      mappedActivityType: "jour_off",
      defaultUnit: null,
      isProductive: false,
      excludedFromTrs: true,
      triggersStatus: false,
    },
  ];

  await db
    .insert(planningActivityMappingsTable)
    .values(
      mappingDefs.map((m) => ({
        activityLabel: m.activityLabel,
        mappedActivityType: m.mappedActivityType,
        defaultUnit: m.defaultUnit ?? undefined,
        isProductive: m.isProductive,
        excludedFromTrs: m.excludedFromTrs,
        triggersStatus: m.triggersStatus,
        equipmentId: m.equipmentCode ? (equipByCode[m.equipmentCode]?.id ?? null) : null,
        roomId: m.roomCode ? (roomByCode[m.roomCode]?.id ?? null) : null,
      })),
    )
    .onConflictDoNothing();
  console.log(`  ✅ Mappings planning: ${mappingDefs.length}`);

  // ── 10. Présentations produits ────────────────────────────────────────────
  const aerofor = prodByCode["AEROFOR-12"];
  const aeronide200 = prodByCode["AERONIDE-200"];
  const aeronide400 = prodByCode["AERONIDE-400"];
  const combifor200 = prodByCode["COMBIFOR-12-200"];
  const combifor400 = prodByCode["COMBIFOR-12-400"];

  const presentationDefs = [
    // Aerofor 12 µg
    {
      productId: aerofor.id,
      presentationName: "Aerofor 12 µg — Boîte de 30",
      presentationType: "boite",
      unit: "boite",
      unitsPerBox: 30,
      capsulesPerBlister: 10,
      needsConfirmation: true,
      isCombiforComponent: false,
      isCombiforFinishedProduct: false,
      comment: "Conversion blisters/boîte à confirmer",
    },
    {
      productId: aerofor.id,
      presentationName: "Aerofor 12 µg — Boîte de 60",
      presentationType: "boite",
      unit: "boite",
      unitsPerBox: 60,
      capsulesPerBlister: 10,
      needsConfirmation: true,
      isCombiforComponent: false,
      isCombiforFinishedProduct: false,
      comment: "Conversion blisters/boîte à confirmer",
    },
    {
      productId: aerofor.id,
      presentationName: "Aerofor 12 µg — Pochette pour Combifor",
      presentationType: "pochette",
      unit: "pochette",
      needsConfirmation: false,
      isCombiforComponent: true,
      isCombiforFinishedProduct: false,
      comment: "Composant Combifor 12/200 et 12/400",
    },

    // Aeronide 200 µg
    {
      productId: aeronide200.id,
      presentationName: "Aeronide 200 µg — Boîte de 60",
      presentationType: "boite",
      unit: "boite",
      unitsPerBox: 60,
      capsulesPerBlister: 10,
      needsConfirmation: true,
      isCombiforComponent: false,
      isCombiforFinishedProduct: false,
      comment: "Conversion à confirmer",
    },
    {
      productId: aeronide200.id,
      presentationName: "Aeronide 200 µg — Pochette pour Combifor 12/200",
      presentationType: "pochette",
      unit: "pochette",
      needsConfirmation: false,
      isCombiforComponent: true,
      isCombiforFinishedProduct: false,
      comment: "Composant Combifor 12/200",
    },

    // Aeronide 400 µg
    {
      productId: aeronide400.id,
      presentationName: "Aeronide 400 µg — Boîte de 60",
      presentationType: "boite",
      unit: "boite",
      unitsPerBox: 60,
      capsulesPerBlister: 10,
      needsConfirmation: true,
      isCombiforComponent: false,
      isCombiforFinishedProduct: false,
      comment: "Conversion à confirmer",
    },
    {
      productId: aeronide400.id,
      presentationName: "Aeronide 400 µg — Pochette pour Combifor 12/400",
      presentationType: "pochette",
      unit: "pochette",
      needsConfirmation: false,
      isCombiforComponent: true,
      isCombiforFinishedProduct: false,
      comment: "Composant Combifor 12/400",
    },

    // Combifor
    {
      productId: combifor200.id,
      presentationName: "Combifor 12/200 µg — Produit assemblé",
      presentationType: "boite",
      unit: "kit",
      needsConfirmation: false,
      isCombiforComponent: false,
      isCombiforFinishedProduct: true,
      comment: "1 kit = 1 pochette Aerofor 12 + 1 pochette Aeronide 200",
    },
    {
      productId: combifor400.id,
      presentationName: "Combifor 12/400 µg — Produit assemblé",
      presentationType: "boite",
      unit: "kit",
      needsConfirmation: false,
      isCombiforComponent: false,
      isCombiforFinishedProduct: true,
      comment: "1 kit = 1 pochette Aerofor 12 + 1 pochette Aeronide 400",
    },
  ];

  const insertedPresentations = await db
    .insert(productPresentationsTable)
    .values(presentationDefs)
    .onConflictDoNothing()
    .returning();

  const allPresentations = await db.select().from(productPresentationsTable);
  const presMap = Object.fromEntries(allPresentations.map((p) => [p.presentationName, p]));
  console.log(`  ✅ Présentations: ${allPresentations.length}`);

  // ── 11. BOM Combifor ──────────────────────────────────────────────────────
  const pochetteAerofor = presMap["Aerofor 12 µg — Pochette pour Combifor"];
  const pochetteAero200 = presMap["Aeronide 200 µg — Pochette pour Combifor 12/200"];
  const pochetteAero400 = presMap["Aeronide 400 µg — Pochette pour Combifor 12/400"];
  const combi200Pres = presMap["Combifor 12/200 µg — Produit assemblé"];
  const combi400Pres = presMap["Combifor 12/400 µg — Produit assemblé"];

  const bomDefs = [];
  if (pochetteAerofor && pochetteAero200 && combi200Pres) {
    bomDefs.push(
      {
        parentPresentationId: combi200Pres.id,
        componentPresentationId: pochetteAerofor.id,
        quantityRequired: 1,
        unit: "pochette",
        comment: "Composant 1/2 Combifor 12/200",
      },
      {
        parentPresentationId: combi200Pres.id,
        componentPresentationId: pochetteAero200.id,
        quantityRequired: 1,
        unit: "pochette",
        comment: "Composant 2/2 Combifor 12/200",
      },
    );
  }
  if (pochetteAerofor && pochetteAero400 && combi400Pres) {
    bomDefs.push(
      {
        parentPresentationId: combi400Pres.id,
        componentPresentationId: pochetteAerofor.id,
        quantityRequired: 1,
        unit: "pochette",
        comment: "Composant 1/2 Combifor 12/400",
      },
      {
        parentPresentationId: combi400Pres.id,
        componentPresentationId: pochetteAero400.id,
        quantityRequired: 1,
        unit: "pochette",
        comment: "Composant 2/2 Combifor 12/400",
      },
    );
  }

  if (bomDefs.length > 0) {
    await db.insert(assemblyBomsTable).values(bomDefs).onConflictDoNothing();
  }
  console.log(`  ✅ BOM Combifor: ${bomDefs.length} lignes`);

  // ── 12. Standards de temps (tous "À confirmer") ───────────────────────────
  const a23Id = roomByCode["A23"]?.id;
  const a27Id = roomByCode["A27"]?.id;
  const blisterId = roomByCode["BLISTER"]?.id;
  const gelId = equipByCode["GEL-HH-MODUC"]?.id;
  const bliId = equipByCode["BLI-IMA-TR135S"]?.id;
  const tamId = equipByCode["TAM-RUSSELL"]?.id;
  const melId = equipByCode["MEL-INVERSINA-20L"]?.id;

  const stdTimeDefs = [
    {
      activityType: "nettoyage_complet",
      roomId: a23Id,
      comment: "Nettoyage complet local A23 — à confirmer avec procédure",
      needsConfirmation: true,
    },
    {
      activityType: "nettoyage_majeur",
      equipmentId: gelId,
      comment: "Nettoyage majeur géluleuse Harro Höfliger — à confirmer",
      needsConfirmation: true,
    },
    {
      activityType: "nettoyage_mineur",
      equipmentId: gelId,
      comment: "Nettoyage mineur géluleuse — à confirmer",
      needsConfirmation: true,
    },
    {
      activityType: "nettoyage_complet",
      equipmentId: bliId,
      comment: "Nettoyage blistereuse IMA TR135 S — à confirmer",
      needsConfirmation: true,
    },
    {
      activityType: "changement_serie",
      equipmentId: bliId,
      comment: "Changement série blistereuse — bobine PVC à confirmer",
      needsConfirmation: true,
    },
    {
      activityType: "changement_serie",
      equipmentId: gelId,
      comment: "Changement série géluleuse — à confirmer",
      needsConfirmation: true,
    },
    {
      activityType: "production",
      equipmentId: tamId,
      comment: "Durée tamisage — dépend quantité lot — à confirmer",
      needsConfirmation: true,
    },
    {
      activityType: "production",
      equipmentId: melId,
      comment: "Durée mélange — dépend paramètre process — à confirmer",
      needsConfirmation: true,
    },
  ].filter((s) => s.equipmentId !== undefined || s.roomId !== undefined);

  await db
    .insert(standardTimesTable)
    .values(
      stdTimeDefs.map((s) => ({
        activityType: s.activityType,
        equipmentId: s.equipmentId ?? null,
        roomId: s.roomId ?? null,
        needsConfirmation: s.needsConfirmation,
        validationStatus: "provisional" as const,
        comment: s.comment,
        validFrom: "2026-01-01",
      })),
    )
    .onConflictDoNothing();
  console.log(`  ✅ Standards de temps (à confirmer): ${stdTimeDefs.length}`);

  const result: SeedResult = {
    site: "EF",
    rooms: allRooms.length,
    equipments: allEquips.length,
    products: allProducts.length,
    cadences: cadenceCount,
    downtimeCategories: allCategories.length,
    kpiTargets: kpiDefs.length,
    notificationRules: notifDefs.length,
    planningMappings: mappingDefs.length,
    presentations: allPresentations.length,
    assemblyBoms: bomDefs.length,
    standardTimes: stdTimeDefs.length,
    warnings,
  };

  console.log("\n🎉 Configuration DPI TERIAK EF chargée !");
  console.log(JSON.stringify(result, null, 2));
  return result;
}

// Run as standalone script
if (process.argv[1]?.endsWith("seed_dpi.ts")) {
  seedDpiConfig().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
