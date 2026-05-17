/**
 * Excel Report Service — DPI TRS/OEE Tracker
 * Generates professional .xlsx reports using ExcelJS
 *
 * Note: ExcelJS does not support embedded charts natively.
 * Data ranges are structured for easy manual chart insertion.
 * All formulas (DO, TP, TQ, TRS, TRG, TRE) are written as real Excel formulas.
 */

import ExcelJS from "exceljs";
import {
  db,
  productionEntriesTable,
  downtimeEventsTable,
  downtimeCategoriesTable,
  equipmentsTable,
  productsTable,
  cadencesTable,
  productionPlansTable,
} from "@workspace/db";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { calculateTrs, calculateTrsSafe, shiftDurationMinutes } from "../lib/trs-engine";
import { resolveDefaultPresentationId } from "../lib/cadence-lookup";

// ─── Theme ────────────────────────────────────────────────
const T = {
  primary:    "FF1E3A5F",  // dark navy
  secondary:  "FF2D5F8F",  // medium blue
  accent:     "FF4A9EE8",  // light blue
  green:      "FF00A651",
  greenLight: "FFD4EDDA",
  orange:     "FFF7941D",
  orangeLight:"FFFFF3CD",
  red:        "FFED1C24",
  redLight:   "FFF8D7DA",
  grey:       "FF6D6E71",
  greyLight:  "FFF5F5F5",
  white:      "FFFFFFFF",
  black:      "FF000000",
  border:     "FFCCCCCC",
  headerBg:   "FF1E3A5F",
  subheadBg:  "FF2D5F8F",
  rowAlt:     "FFF9FBFD",
};

// ─── Style helpers ────────────────────────────────────────
function headerStyle(fg = T.white, bg = T.headerBg): Partial<ExcelJS.Style> {
  return {
    font: { bold: true, color: { argb: fg }, size: 10, name: "Calibri" },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: bg } },
    alignment: { horizontal: "center", vertical: "middle", wrapText: true },
    border: {
      top:    { style: "thin", color: { argb: T.border } },
      bottom: { style: "thin", color: { argb: T.border } },
      left:   { style: "thin", color: { argb: T.border } },
      right:  { style: "thin", color: { argb: T.border } },
    },
  };
}

function dataStyle(bold = false, align: ExcelJS.Alignment["horizontal"] = "center"): Partial<ExcelJS.Style> {
  return {
    font: { bold, size: 10, name: "Calibri" },
    alignment: { horizontal: align, vertical: "middle" },
    border: {
      top:    { style: "hair", color: { argb: T.border } },
      bottom: { style: "hair", color: { argb: T.border } },
      left:   { style: "hair", color: { argb: T.border } },
      right:  { style: "hair", color: { argb: T.border } },
    },
  };
}

function pctStyle(bold = false): Partial<ExcelJS.Style> {
  return { ...dataStyle(bold), numFmt: "0.0%" };
}

function timeStyle(): Partial<ExcelJS.Style> {
  return { ...dataStyle(), numFmt: "0.0\" min\"" };
}

function applyConditionalFormatting(
  sheet: ExcelJS.Worksheet,
  range: string,
  greenMin = 0.85,
  orangeMin = 0.70,
) {
  sheet.addConditionalFormatting({
    ref: range,
    rules: [
      {
        type: "cellIs",
        operator: "greaterThanOrEqual" as ExcelJS.CellIsOperators,
        formulae: [String(greenMin)],
        priority: 1,
        style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: T.greenLight } },
                  font: { color: { argb: T.green }, bold: true } },
      },
      {
        type: "cellIs",
        operator: "greaterThanOrEqual" as ExcelJS.CellIsOperators,
        formulae: [String(orangeMin)],
        priority: 2,
        style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: T.orangeLight } },
                  font: { color: { argb: T.orange }, bold: true } },
      },
      {
        type: "cellIs",
        operator: "lessThan",
        formulae: [String(orangeMin)],
        priority: 3,
        style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: T.redLight } },
                  font: { color: { argb: T.red }, bold: true } },
      },
    ],
  });
}

function setTitleRow(
  sheet: ExcelJS.Worksheet,
  title: string,
  cols: number,
  row = 1,
) {
  const cell = sheet.getCell(row, 1);
  cell.value = title;
  cell.style = {
    font: { bold: true, size: 14, color: { argb: T.white }, name: "Calibri" },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: T.primary } },
    alignment: { horizontal: "left", vertical: "middle" },
  };
  sheet.mergeCells(row, 1, row, cols);
  sheet.getRow(row).height = 28;
}

function setSubtitleRow(
  sheet: ExcelJS.Worksheet,
  subtitle: string,
  cols: number,
  row = 2,
) {
  const cell = sheet.getCell(row, 1);
  cell.value = subtitle;
  cell.style = {
    font: { size: 10, color: { argb: T.white }, name: "Calibri" },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: T.secondary } },
    alignment: { horizontal: "left", vertical: "middle" },
  };
  sheet.mergeCells(row, 1, row, cols);
  sheet.getRow(row).height = 18;
}

// ─── Data fetching ────────────────────────────────────────
interface EntryWithMetrics {
  id: string;
  date: string;
  equipmentId: string;
  productId: string;
  batchNumber: string;
  shift: string;
  shiftStart: string;
  shiftEnd: string;
  quantityProduced: number;
  quantityConforming: number;
  quantityRejected: number;
  status: string;
  equipmentName: string | null;
  productName: string | null;
  operatorName: string | null;
  tT: number;
  tO: number;
  tR: number;
  tF: number;
  tN: number;
  tU: number;
  DO: number;
  TP: number;
  TQ: number;
  TRS: number;
  TRG: number;
  TRE: number;
  plannedMinutes: number;
  unplannedMinutes: number;
  cadenceGap: number;
  totalArrêts: number;
  /** Phase 6 hotfix: false when the underlying triplet has no active cadence
   *  (calculateTrsSafe returned null). Excel rows render "—" for TRS columns
   *  and these rows are excluded from synthese / equipment aggregates. */
  trsValid: boolean;
  downtimeEvents: Array<{
    categoryCode: string | null;
    categoryLabel: string | null;
    isPlanned: boolean;
    durationMinutes: number;
    impactType: string | null;
  }>;
}

async function fetchEntriesWithMetrics(
  from: string,
  to: string,
  equipmentId?: string,
): Promise<EntryWithMetrics[]> {
  const filters: ReturnType<typeof eq>[] = [
    gte(productionEntriesTable.date, from) as unknown as ReturnType<typeof eq>,
    lte(productionEntriesTable.date, to) as unknown as ReturnType<typeof eq>,
    eq(productionEntriesTable.status, "validated") as ReturnType<typeof eq>,
  ];
  if (equipmentId) {
    filters.push(eq(productionEntriesTable.equipmentId, equipmentId) as ReturnType<typeof eq>);
  }

  const entries = await db
    .select({
      id: productionEntriesTable.id,
      date: productionEntriesTable.date,
      equipmentId: productionEntriesTable.equipmentId,
      productId: productionEntriesTable.productId,
      batchNumber: productionEntriesTable.batchNumber,
      shift: productionEntriesTable.shift,
      shiftStart: productionEntriesTable.shiftStart,
      shiftEnd: productionEntriesTable.shiftEnd,
      quantityProduced: productionEntriesTable.quantityProduced,
      quantityConforming: productionEntriesTable.quantityConforming,
      quantityRejected: productionEntriesTable.quantityRejected,
      status: productionEntriesTable.status,
      equipmentName: equipmentsTable.name,
      productName: productsTable.name,
    })
    .from(productionEntriesTable)
    .leftJoin(equipmentsTable, eq(productionEntriesTable.equipmentId, equipmentsTable.id))
    .leftJoin(productsTable, eq(productionEntriesTable.productId, productsTable.id))
    .where(and(...filters));

  if (entries.length === 0) return [];

  const entryIds = entries.map(e => e.id);

  const downtimes = await db
    .select({
      entryId: downtimeEventsTable.entryId,
      durationMinutes: downtimeEventsTable.durationMinutes,
      isPlanned: downtimeCategoriesTable.isPlanned,
      categoryCode: downtimeCategoriesTable.code,
      categoryLabel: downtimeCategoriesTable.label,
      impactType: downtimeCategoriesTable.impactType,
    })
    .from(downtimeEventsTable)
    .leftJoin(downtimeCategoriesTable, eq(downtimeEventsTable.categoryId, downtimeCategoriesTable.id))
    .where(and(
      inArray(downtimeEventsTable.entryId, entryIds),
      eq(downtimeEventsTable.isDeleted, false),
    ));

  // Phase 6 hotfix: triplet-keyed cadence lookup (productId:equipmentId:presentationId)
  // with deterministic default presentation per productId via cadence-lookup helpers.
  // Replaces previous pair-only key which silently picked an arbitrary cadence row
  // when multiple presentations existed for the same (product, equipment).
  const cadenceMap = new Map<string, number>();
  const allCadences = await db
    .select({
      productId: cadencesTable.productId,
      equipmentId: cadencesTable.equipmentId,
      presentationId: cadencesTable.presentationId,
      validatedCadence: cadencesTable.validatedCadence,
    })
    .from(cadencesTable)
    .where(eq(cadencesTable.isActive, true));
  for (const c of allCadences) {
    if (c.presentationId) {
      cadenceMap.set(
        `${c.productId}:${c.equipmentId}:${c.presentationId}`,
        parseFloat(c.validatedCadence as unknown as string),
      );
    }
  }

  // Memoize default presentation per productId (avoids N+1 inside the per-entry loop).
  const defaultPresentationCache = new Map<string, string | null>();
  const uniqueProductIds = [...new Set(entries.map(e => e.productId))];
  for (const pid of uniqueProductIds) {
    defaultPresentationCache.set(pid, await resolveDefaultPresentationId(pid));
  }

  return entries.map(entry => {
    const entryDowntimes = downtimes.filter(d => d.entryId === entry.id);
    const plannedMinutes = entryDowntimes.filter(d => d.isPlanned).reduce((s, d) => s + d.durationMinutes, 0);
    const unplannedMinutes = entryDowntimes.filter(d => !d.isPlanned).reduce((s, d) => s + d.durationMinutes, 0);
    const presentationId = defaultPresentationCache.get(entry.productId) ?? null;
    const validatedCadence = presentationId
      ? cadenceMap.get(`${entry.productId}:${entry.equipmentId}:${presentationId}`) ?? 0
      : 0;
    const shiftDuration = shiftDurationMinutes(entry.shiftStart, entry.shiftEnd);
    // Phase 6 hotfix: fail-loud on missing cadence. metrics === null → row marked invalid.
    const { metrics: safeMetrics } = calculateTrsSafe({
      shiftDurationMinutes: shiftDuration,
      plannedDowntimeMinutes: plannedMinutes,
      unplannedDowntimeMinutes: unplannedMinutes,
      quantityProduced: entry.quantityProduced,
      quantityConforming: entry.quantityConforming,
      validatedCadence,
    });
    const trsValid = safeMetrics !== null;
    // Fallback to zero-metrics shape when invalid so downstream sheet builders
    // still have numeric placeholders; the trsValid flag drives display + aggregation.
    const metrics = safeMetrics ?? calculateTrs({
      shiftDurationMinutes: shiftDuration,
      plannedDowntimeMinutes: plannedMinutes,
      unplannedDowntimeMinutes: unplannedMinutes,
      quantityProduced: entry.quantityProduced,
      quantityConforming: entry.quantityConforming,
      validatedCadence: 0,
    });

    return {
      ...entry,
      equipmentName: entry.equipmentName ?? null,
      productName: entry.productName ?? null,
      operatorName: null,
      tT: metrics.tT,
      tO: metrics.tO,
      tR: metrics.tR,
      tF: metrics.tF,
      tN: metrics.tN,
      tU: metrics.tU,
      DO: metrics.DO,
      TP: metrics.TP,
      TQ: metrics.TQ,
      TRS: metrics.TRS,
      TRG: metrics.TRG,
      TRE: metrics.TRE,
      plannedMinutes,
      unplannedMinutes,
      cadenceGap: metrics.cadenceGap,
      totalArrêts: entryDowntimes.length,
      trsValid,
      downtimeEvents: entryDowntimes.map(d => ({
        categoryCode: d.categoryCode ?? null,
        categoryLabel: d.categoryLabel ?? null,
        isPlanned: d.isPlanned ?? false,
        durationMinutes: d.durationMinutes,
        impactType: d.impactType ?? null,
      })),
    };
  });
}

// ─── Sheet builders ───────────────────────────────────────

function buildParamsSheet(
  wb: ExcelJS.Workbook,
  opts: ExportOptions,
  entries: EntryWithMetrics[],
) {
  const ws = wb.addWorksheet("Paramètres", { properties: { tabColor: { argb: T.grey } } });
  ws.views = [{ state: "normal" }];
  setTitleRow(ws, "Paramètres du rapport", 3);
  setSubtitleRow(ws, `Généré le ${new Date().toLocaleString("fr-FR")}`, 3);

  ws.getColumn(1).width = 35;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 20;

  const rows: [string, string | number][] = [
    ["Date de début", opts.from],
    ["Date de fin", opts.to],
    ["Équipement", opts.equipmentId ?? "Tous"],
    ["Format rapport", opts.format],
    ["Exporté par", opts.exportedByName],
    ["Version rapport", "v2.0"],
    ["Application", "DPI TRS/OEE Tracker"],
    ["Norme", "NF E 60-182"],
    ["", ""],
    ["— Formules de calcul", ""],
    ["TRS", "= tU / tR  (= DO × TP × TQ)"],
    ["TRG", "= tU / tO"],
    ["TRE", "= tU / tT"],
    ["DO (Disponibilité)", "= tF / tR"],
    ["TP (Performance)", "= tN / tF"],
    ["TQ (Qualité)", "= tU / tN"],
    ["tT (Temps calendrier)", "1440 min (24h)"],
    ["tO (Temps ouverture)", "Durée poste"],
    ["tR (Temps requis)", "tO - arrêts planifiés"],
    ["tF (Temps fonctionnement)", "tR - arrêts non planifiés"],
    ["tN (Temps net)", "Qté produite / cadence"],
    ["tU (Temps utile)", "Qté conforme / cadence"],
    ["", ""],
    ["— Seuils couleurs", ""],
    ["Vert (conforme)", "≥ 85%"],
    ["Orange (vigilance)", "70% – 84.9%"],
    ["Rouge (critique)", "< 70%"],
    ["", ""],
    ["— Données rapport", ""],
    ["Nombre d'entrées validées", entries.length],
    ["Période couverte", `${opts.from} → ${opts.to}`],
  ];

  let rowIdx = 3;
  for (const [label, value] of rows) {
    const r = ws.getRow(rowIdx++);
    r.height = 18;
    if (label.startsWith("—")) {
      ws.mergeCells(rowIdx - 1, 1, rowIdx - 1, 3);
      r.getCell(1).value = label;
      r.getCell(1).style = headerStyle(T.white, T.secondary);
    } else if (label === "") {
      r.height = 6;
    } else {
      r.getCell(1).value = label;
      r.getCell(1).style = dataStyle(true, "left");
      r.getCell(2).value = value;
      r.getCell(2).style = dataStyle(false, "left");
    }
  }
}

function buildSourceDataSheet(
  wb: ExcelJS.Workbook,
  entries: EntryWithMetrics[],
  visible: boolean,
) {
  const ws = wb.addWorksheet("Données Sources", {
    properties: { tabColor: { argb: T.grey } },
    state: visible ? "visible" : "veryHidden",
  });

  const COLS = [
    { header: "Date", key: "date", width: 12 },
    { header: "Équipement", key: "equip", width: 22 },
    { header: "Produit", key: "prod", width: 20 },
    { header: "Lot", key: "lot", width: 14 },
    { header: "Poste", key: "shift", width: 8 },
    { header: "tT (min)", key: "tT", width: 10 },
    { header: "tO (min)", key: "tO", width: 10 },
    { header: "tR (min)", key: "tR", width: 10 },
    { header: "tF (min)", key: "tF", width: 10 },
    { header: "tN (min)", key: "tN", width: 10 },
    { header: "tU (min)", key: "tU", width: 10 },
    { header: "Qté planifiée", key: "qtyPlan", width: 14 },
    { header: "Qté produite", key: "qtyProd", width: 14 },
    { header: "Qté conforme", key: "qtyCon", width: 14 },
    { header: "Rebuts", key: "qtyRej", width: 10 },
    { header: "Arrêts planifiés (min)", key: "planDown", width: 20 },
    { header: "Arrêts non planifiés (min)", key: "unplanDown", width: 24 },
    { header: "Nb arrêts", key: "nbArrêts", width: 12 },
  ];

  COLS.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });

  setTitleRow(ws, "Données Sources — Entrées de production validées", COLS.length);
  const hRow = ws.getRow(2);
  hRow.height = 32;
  COLS.forEach((c, i) => {
    hRow.getCell(i + 1).value = c.header;
    hRow.getCell(i + 1).style = headerStyle();
  });

  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: COLS.length } };
  ws.views = [{ state: "frozen", ySplit: 2 }];

  entries.forEach((e, idx) => {
    const row = ws.addRow([
      e.date, e.equipmentName, e.productName, e.batchNumber, e.shift,
      e.tT, e.tO, e.tR, e.tF, e.tN, e.tU,
      0, e.quantityProduced, e.quantityConforming, e.quantityRejected,
      e.plannedMinutes, e.unplannedMinutes, e.totalArrêts,
    ]);
    row.height = 17;
    row.eachCell(cell => {
      cell.style = idx % 2 === 0
        ? { ...dataStyle(false, "center"), fill: { type: "pattern", pattern: "solid", fgColor: { argb: T.rowAlt } } }
        : dataStyle(false, "center");
    });
    row.getCell(1).style = { ...dataStyle(false, "center"), numFmt: "dd/mm/yyyy" };
    row.getCell(2).style = dataStyle(false, "left");
    row.getCell(3).style = dataStyle(false, "left");
    row.getCell(4).style = { ...dataStyle(false, "center"), font: { name: "Courier New", size: 9 } };
  });
}

function buildDashboardTrsSheet(
  wb: ExcelJS.Workbook,
  entries: EntryWithMetrics[],
  srcSheetName: string,
) {
  const ws = wb.addWorksheet("Dashboard TRS", { properties: { tabColor: { argb: T.primary } } });

  const COLS = [
    { header: "Date",            width: 12 },
    { header: "Jour",            width: 10 },
    { header: "Équipement",      width: 22 },
    { header: "Produit",         width: 18 },
    { header: "Lot",             width: 14 },
    { header: "Poste",           width: 7  },
    { header: "Qté planifiée",   width: 14 },
    { header: "Qté produite",    width: 14 },
    { header: "Qté conforme",    width: 14 },
    { header: "Rebuts",          width: 10 },
    { header: "tT (min)",        width: 10 },
    { header: "tO (min)",        width: 10 },
    { header: "tR (min)",        width: 10 },
    { header: "tF (min)",        width: 10 },
    { header: "tN (min)",        width: 10 },
    { header: "tU (min)",        width: 10 },
    { header: "DO",              width: 9  },
    { header: "TP",              width: 9  },
    { header: "TQ",              width: 9  },
    { header: "TRS",             width: 10 },
    { header: "TRG",             width: 10 },
    { header: "TRE",             width: 10 },
    { header: "Nb Arrêts",       width: 11 },
    { header: "Statut",          width: 12 },
  ];

  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  setTitleRow(ws, "Dashboard TRS — Suivi journalier", COLS.length);
  setSubtitleRow(ws, "Formules: DO=tF/tR  TP=tN/tF  TQ=tU/tN  TRS=tU/tR  TRG=tU/tO  TRE=tU/tT", COLS.length);

  const hRow = ws.getRow(3);
  hRow.height = 32;
  COLS.forEach((c, i) => {
    hRow.getCell(i + 1).value = c.header;
    hRow.getCell(i + 1).style = headerStyle();
  });

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLS.length } };
  ws.views = [{ state: "frozen", ySplit: 3 }];

  const JOURS = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
  const srcRef = `'${srcSheetName}'`;

  // Column indexes in source sheet (1-based): tR=8, tF=9, tN=10, tU=11, tO=7
  entries.forEach((e, idx) => {
    const r = idx + 4; // data starts row 4
    const srcRow = idx + 3; // data starts row 3 in source sheet (row 1=title, row 2=headers)

    const dateVal = new Date(e.date + "T12:00:00");
    const jour = JOURS[dateVal.getDay()];

    // Column references in source sheet
    const tT_ref  = `${srcRef}!F${srcRow}`;
    const tO_ref  = `${srcRef}!G${srcRow}`;
    const tR_ref  = `${srcRef}!H${srcRow}`;
    const tF_ref  = `${srcRef}!I${srcRow}`;
    const tN_ref  = `${srcRef}!J${srcRow}`;
    const tU_ref  = `${srcRef}!K${srcRow}`;

    const row = ws.getRow(r);
    row.height = 17;

    const cells: (string | number | { formula: string } | null)[] = [
      e.date,
      jour,
      e.equipmentName,
      e.productName,
      e.batchNumber,
      e.shift,
      0,                              // qty planifiée
      e.quantityProduced,
      e.quantityConforming,
      e.quantityRejected,
      { formula: tT_ref },
      { formula: tO_ref },
      { formula: tR_ref },
      { formula: tF_ref },
      { formula: tN_ref },
      { formula: tU_ref },
      // Phase 6 hotfix: render dash placeholder when cadence is missing — never a phantom 0%.
      e.trsValid ? { formula: `=IF(${tR_ref}>0,${tF_ref}/${tR_ref},0)` } : "—",  // DO
      e.trsValid ? { formula: `=IF(${tF_ref}>0,${tN_ref}/${tF_ref},0)` } : "—",  // TP
      e.trsValid ? { formula: `=IF(${tN_ref}>0,${tU_ref}/${tN_ref},0)` } : "—",  // TQ
      e.trsValid ? { formula: `=IF(${tR_ref}>0,${tU_ref}/${tR_ref},0)` } : "—",  // TRS
      e.trsValid ? { formula: `=IF(${tO_ref}>0,${tU_ref}/${tO_ref},0)` } : "—",  // TRG
      e.trsValid ? { formula: `=IF(${tT_ref}>0,${tU_ref}/${tT_ref},0)` } : "—",  // TRE
      e.totalArrêts,
      !e.trsValid ? "— Cadence absente" : e.TRS >= 0.85 ? "✔ Conforme" : e.TRS >= 0.70 ? "⚠ Vigilance" : "✖ Critique",
    ];

    cells.forEach((val, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = val as ExcelJS.CellValue;
      cell.style = dataStyle(false, "center");
    });

    row.getCell(1).style  = { ...dataStyle(false,"center"), numFmt: "dd/mm/yyyy" };
    row.getCell(2).style  = dataStyle(false,"center");
    row.getCell(3).style  = dataStyle(false,"left");
    row.getCell(4).style  = dataStyle(false,"left");
    row.getCell(5).style  = { ...dataStyle(false,"center"), font: { name:"Courier New", size:9 } };

    const pctCols = [17, 18, 19, 20, 21, 22]; // DO,TP,TQ,TRS,TRG,TRE
    pctCols.forEach(col => {
      row.getCell(col).style = pctStyle();
    });
    const timeCols = [11,12,13,14,15,16];
    timeCols.forEach(col => {
      row.getCell(col).style = timeStyle();
    });
    // Status color
    const statusCell = row.getCell(24);
    if (e.TRS >= 0.85) {
      statusCell.style = { ...dataStyle(true,"center"), font: { bold:true, color:{ argb:T.green }, name:"Calibri", size:10 } };
    } else if (e.TRS >= 0.70) {
      statusCell.style = { ...dataStyle(true,"center"), font: { bold:true, color:{ argb:T.orange }, name:"Calibri", size:10 } };
    } else {
      statusCell.style = { ...dataStyle(true,"center"), font: { bold:true, color:{ argb:T.red }, name:"Calibri", size:10 } };
    }
  });

  // Conditional formatting on TRS, DO, TP, TQ columns
  const lastRow = entries.length + 3;
  if (entries.length > 0) {
    ["Q","R","S","T"].forEach(col => {
      applyConditionalFormatting(ws, `${col}4:${col}${lastRow}`);
    });
  }

  // Totals row
  if (entries.length > 0) {
    const totRow = ws.addRow([]);
    totRow.height = 20;
    totRow.getCell(1).value = "TOTAL / MOYENNE";
    totRow.getCell(1).style = headerStyle(T.white, T.secondary);
    ws.mergeCells(entries.length + 4, 1, entries.length + 4, 6);
    const startR = 4; const endR = entries.length + 3;
    totRow.getCell(8).value  = { formula: `=SUM(H${startR}:H${endR})` };
    totRow.getCell(9).value  = { formula: `=SUM(I${startR}:I${endR})` };
    totRow.getCell(10).value = { formula: `=SUM(J${startR}:J${endR})` };
    totRow.getCell(11).value = { formula: `=SUM(K${startR}:K${endR})` };
    [8,9,10,11].forEach(c => { totRow.getCell(c).style = { ...dataStyle(true), fill:{ type:"pattern", pattern:"solid", fgColor:{ argb:T.greyLight } } }; });
    totRow.getCell(20).value = { formula: `=IF(SUM(M${startR}:M${endR})>0,SUM(P${startR}:P${endR})/SUM(M${startR}:M${endR}),0)` };
    totRow.getCell(20).style = { ...pctStyle(true), fill:{ type:"pattern", pattern:"solid", fgColor:{ argb:T.greyLight } } };
  }
}

function buildDowntimeSheet(
  wb: ExcelJS.Workbook,
  entries: EntryWithMetrics[],
) {
  const ws = wb.addWorksheet("Arrêts", { properties: { tabColor: { argb: T.red } } });

  const COLS = [
    { header: "Date",            width: 12 },
    { header: "Équipement",      width: 22 },
    { header: "Produit",         width: 18 },
    { header: "Lot",             width: 14 },
    { header: "Code arrêt",      width: 14 },
    { header: "Libellé arrêt",   width: 30 },
    { header: "Planifié",        width: 11 },
    { header: "Durée (min)",     width: 12 },
    { header: "Impact KPI",      width: 14 },
    { header: "Criticité",       width: 12 },
    { header: "Commentaire",     width: 30 },
  ];

  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  setTitleRow(ws, "Arrêts de production", COLS.length);
  setSubtitleRow(ws, "Mise en forme : Vert=planifié, Orange=non planifié impact ≤30 min, Rouge=non planifié impact >30 min", COLS.length);

  const hRow = ws.getRow(3);
  hRow.height = 32;
  COLS.forEach((c, i) => { hRow.getCell(i + 1).value = c.header; hRow.getCell(i + 1).style = headerStyle(); });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLS.length } };
  ws.views = [{ state: "frozen", ySplit: 3 }];

  let rowIdx = 4;
  for (const entry of entries) {
    for (const dt of entry.downtimeEvents) {
      const row = ws.getRow(rowIdx++);
      row.height = 17;
      const isPlanned = dt.isPlanned;
      const isCritical = !isPlanned && dt.durationMinutes > 30;

      const bgColor = isPlanned ? T.greenLight : isCritical ? T.redLight : T.orangeLight;
      const fgColor = isPlanned ? T.green     : isCritical ? T.red      : T.orange;
      const rowStyle: Partial<ExcelJS.Style> = {
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } },
        font: { color: { argb: fgColor }, name: "Calibri", size: 10 },
        alignment: { horizontal: "center", vertical: "middle" },
        border: { top: { style: "hair", color: { argb: T.border } }, bottom: { style: "hair", color: { argb: T.border } }, left: { style: "hair", color: { argb: T.border } }, right: { style: "hair", color: { argb: T.border } } },
      };

      const vals = [
        entry.date, entry.equipmentName, entry.productName, entry.batchNumber,
        dt.categoryCode, dt.categoryLabel,
        isPlanned ? "Planifié" : "Non planifié",
        dt.durationMinutes,
        dt.impactType,
        isPlanned ? "Faible" : isCritical ? "Critique" : "Modéré",
        "",
      ];
      vals.forEach((v, ci) => {
        row.getCell(ci + 1).value = v as ExcelJS.CellValue;
        row.getCell(ci + 1).style = { ...rowStyle, alignment: { ...rowStyle.alignment, horizontal: ci < 4 ? "left" : "center" } };
      });
      row.getCell(1).style = { ...rowStyle, numFmt: "dd/mm/yyyy" };
    }
  }
}

function buildParetoSheet(wb: ExcelJS.Workbook, entries: EntryWithMetrics[]) {
  const ws = wb.addWorksheet("Pareto Arrêts", { properties: { tabColor: { argb: T.orange } } });

  const COLS = [
    { header: "Type d'arrêt",       width: 30 },
    { header: "Code",               width: 12 },
    { header: "Nb occurrences",     width: 16 },
    { header: "Durée totale (min)", width: 20 },
    { header: "% contribution",     width: 18 },
    { header: "% cumulé",          width: 12 },
    { header: "Planifié",           width: 11 },
    { header: "Impact KPI",         width: 14 },
  ];

  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  setTitleRow(ws, "Analyse Pareto — Causes d'arrêts", COLS.length);
  setSubtitleRow(ws, "Trié par durée totale décroissante — Loi de Pareto 80/20", COLS.length);

  const hRow = ws.getRow(3);
  hRow.height = 32;
  COLS.forEach((c, i) => { hRow.getCell(i + 1).value = c.header; hRow.getCell(i + 1).style = headerStyle(); });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLS.length } };
  ws.views = [{ state: "frozen", ySplit: 3 }];

  // Aggregate by category
  const map = new Map<string, { label: string; code: string; count: number; duration: number; isPlanned: boolean; impactType: string | null }>();
  for (const entry of entries) {
    for (const dt of entry.downtimeEvents) {
      const key = dt.categoryCode ?? "INCONNU";
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        existing.duration += dt.durationMinutes;
      } else {
        map.set(key, { label: dt.categoryLabel ?? key, code: key, count: 1, duration: dt.durationMinutes, isPlanned: dt.isPlanned, impactType: dt.impactType });
      }
    }
  }

  const sorted = Array.from(map.values()).sort((a, b) => b.duration - a.duration);
  const totalDuration = sorted.reduce((s, v) => s + v.duration, 0);

  let rowIdx = 4;
  sorted.forEach((item, idx) => {
    const r = rowIdx++;
    const row = ws.getRow(r);
    row.height = 17;

    row.getCell(1).value = item.label;
    row.getCell(2).value = item.code;
    row.getCell(3).value = item.count;
    row.getCell(4).value = item.duration;
    row.getCell(5).value = { formula: `=IF($D$${r}>0,D${r}/SUM($D$4:$D$${3+sorted.length}),0)` };
    row.getCell(6).value = idx === 0
      ? { formula: `=E${r}` }
      : { formula: `=F${r - 1}+E${r}` };
    row.getCell(7).value = item.isPlanned ? "Planifié" : "Non planifié";
    row.getCell(8).value = item.impactType;

    [1,2].forEach(c => { row.getCell(c).style = dataStyle(false,"left"); });
    [3,4].forEach(c => { row.getCell(c).style = dataStyle(false,"center"); });
    [5,6].forEach(c => { row.getCell(c).style = pctStyle(); });
    [7,8].forEach(c => { row.getCell(c).style = dataStyle(false,"center"); });

    // Color: 80% cumulative = Pareto line
    const cumPct = sorted.slice(0, idx + 1).reduce((s, v) => s + v.duration, 0) / (totalDuration || 1);
    if (cumPct <= 0.8) {
      for (let c = 1; c <= 8; c++) {
        const cs = row.getCell(c).style as Partial<ExcelJS.Style>;
        row.getCell(c).style = { ...cs, fill: { type: "pattern", pattern: "solid", fgColor: { argb: T.redLight } } };
      }
    }
  });

  // Totals
  if (sorted.length > 0) {
    const totRow = ws.addRow(["TOTAL", "", sorted.reduce((s,v)=>s+v.count,0), totalDuration, 1, "", "", ""]);
    totRow.height = 20;
    totRow.eachCell(cell => { cell.style = { ...dataStyle(true), fill: { type:"pattern", pattern:"solid", fgColor: { argb: T.greyLight } } }; });
    totRow.getCell(5).style = { ...pctStyle(true), fill: { type:"pattern", pattern:"solid", fgColor: { argb: T.greyLight } } };
  }

  // Note about charts
  const noteRow = ws.addRow([]);
  ws.mergeCells(noteRow.number, 1, noteRow.number, 8);
  noteRow.getCell(1).value = "ℹ️ Pour générer le graphique Pareto : sélectionner colonnes A:F → Insertion → Graphique → Histogramme groupé + courbe (axe secondaire pour % cumulé)";
  noteRow.getCell(1).style = { font:{ italic:true, color:{ argb:T.grey }, size:9, name:"Calibri" }, alignment:{ horizontal:"left" } };
}

function buildSyntheseSheet(
  wb: ExcelJS.Workbook,
  entries: EntryWithMetrics[],
  opts: ExportOptions,
) {
  const ws = wb.addWorksheet("Synthèse Direction", { properties: { tabColor: { argb: T.accent } } });
  ws.views = [{ state: "normal" }];

  setTitleRow(ws, "Synthèse Direction — Rapport TRS/OEE", 8);
  setSubtitleRow(ws, `Période : ${opts.from}  →  ${opts.to}  |  Exporté par : ${opts.exportedByName}  |  ${new Date().toLocaleDateString("fr-FR")}`, 8);

  ws.getColumn(1).width = 28;
  for (let i = 2; i <= 8; i++) ws.getColumn(i).width = 16;
  ws.getRow(1).height = 36;
  ws.getRow(2).height = 22;

  // Compute aggregates — Phase 6 hotfix: exclude rows with invalid (missing-cadence) TRS
  // from numerator AND denominator so monthly TRS is computed only over rows where the
  // cadence triplet is known. totalArrêts/totalQty stay over all rows (volume views).
  const validEntries = entries.filter(e => e.trsValid);
  const n = entries.length;
  const totalTR  = validEntries.reduce((s,e) => s + e.tR, 0);
  const totalTU  = validEntries.reduce((s,e) => s + e.tU, 0);
  const totalTF  = validEntries.reduce((s,e) => s + e.tF, 0);
  const totalTN  = validEntries.reduce((s,e) => s + e.tN, 0);
  const totalTO  = validEntries.reduce((s,e) => s + e.tO, 0);
  const totalTT  = validEntries.length * 1440;
  const totalArrêts = entries.reduce((s,e) => s + e.totalArrêts, 0);
  const totalDowntime = entries.reduce((s,e) => s + e.plannedMinutes + e.unplannedMinutes, 0);
  const totalQtyProd = entries.reduce((s,e) => s + e.quantityProduced, 0);
  const totalQtyCon  = entries.reduce((s,e) => s + e.quantityConforming, 0);

  const TRS = totalTR > 0 ? totalTU / totalTR : 0;
  const TRG = totalTO > 0 ? totalTU / totalTO : 0;
  const TRE = totalTT > 0 ? totalTU / totalTT : 0;
  const DO  = totalTR > 0 ? totalTF / totalTR : 0;
  const TP  = totalTF > 0 ? totalTN / totalTF : 0;
  const TQ  = totalTN > 0 ? totalTU / totalTN : 0;

  function kpiColor(val: number, green = 0.85, orange = 0.70): string {
    if (val >= green)  return T.greenLight;
    if (val >= orange) return T.orangeLight;
    return T.redLight;
  }
  function kpiFontColor(val: number, green = 0.85, orange = 0.70): string {
    if (val >= green)  return T.green;
    if (val >= orange) return T.orange;
    return T.red;
  }

  function kpiCard(
    ws: ExcelJS.Worksheet,
    row: number, col: number,
    title: string, value: number | string,
    isPercent = true,
    greenThresh = 0.85, orangeThresh = 0.70,
  ) {
    const numVal = typeof value === "number" ? value : 0;
    const bg = isPercent ? kpiColor(numVal, greenThresh, orangeThresh) : T.greyLight;
    const fg = isPercent ? kpiFontColor(numVal, greenThresh, orangeThresh) : T.primary;

    const titleCell = ws.getCell(row, col);
    titleCell.value = title;
    titleCell.style = {
      font: { bold: true, size: 9, color: { argb: T.white }, name: "Calibri" },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: T.secondary } },
      alignment: { horizontal: "center", vertical: "middle" },
    };
    ws.getRow(row).height = 20;

    const valCell = ws.getCell(row + 1, col);
    valCell.value = value;
    valCell.style = {
      font: { bold: true, size: 20, color: { argb: fg }, name: "Calibri" },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: bg } },
      alignment: { horizontal: "center", vertical: "middle" },
      numFmt: isPercent ? "0.0%" : "0",
    };
    ws.getRow(row + 1).height = 40;
    ws.mergeCells(row + 1, col, row + 2, col);
  }

  // KPI Cards section
  const kpiStartRow = 4;
  ws.getRow(kpiStartRow - 1).getCell(1).value = "KPI PRINCIPAUX";
  ws.getRow(kpiStartRow - 1).getCell(1).style = headerStyle(T.white, T.primary);
  ws.mergeCells(kpiStartRow - 1, 1, kpiStartRow - 1, 8);

  kpiCard(ws, kpiStartRow,     1, "TRS",   TRS,  true, 0.85, 0.70);
  kpiCard(ws, kpiStartRow,     2, "TRG",   TRG,  true, 0.85, 0.70);
  kpiCard(ws, kpiStartRow,     3, "TRE",   TRE,  true, 0.80, 0.65);
  kpiCard(ws, kpiStartRow,     4, "DO",    DO,   true, 0.90, 0.80);
  kpiCard(ws, kpiStartRow,     5, "TP",    TP,   true, 0.90, 0.80);
  kpiCard(ws, kpiStartRow,     6, "TQ",    TQ,   true, 0.98, 0.95);
  kpiCard(ws, kpiStartRow,     7, "Postes", n,    false);
  kpiCard(ws, kpiStartRow,     8, "Arrêts", totalArrêts, false);

  // Details section
  const detailRow = kpiStartRow + 5;
  ws.getRow(detailRow).getCell(1).value = "DÉTAIL QUANTITÉS";
  ws.getRow(detailRow).getCell(1).style = headerStyle(T.white, T.secondary);
  ws.mergeCells(detailRow, 1, detailRow, 8);
  ws.getRow(detailRow).height = 22;

  const details: [string, number | string, string?][] = [
    ["Quantité produite",    totalQtyProd, "0"],
    ["Quantité conforme",    totalQtyCon,  "0"],
    ["Quantité rebutée",     totalQtyProd - totalQtyCon, "0"],
    ["Durée totale arrêts",  `${Math.round(totalDowntime)} min (${(totalDowntime/60).toFixed(1)} h)`],
    ["Temps requis total",   `${Math.round(totalTR)} min`],
    ["Temps utile total",    `${Math.round(totalTU)} min`],
  ];

  details.forEach(([label, val, fmt], i) => {
    const r = detailRow + 1 + i;
    ws.getRow(r).height = 20;
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).style = dataStyle(true, "left");
    ws.mergeCells(r, 1, r, 2);
    ws.getCell(r, 3).value = val;
    ws.getCell(r, 3).style = fmt ? { ...dataStyle(true, "left"), numFmt: fmt } : dataStyle(false, "left");
    ws.mergeCells(r, 3, r, 8);
  });

  // Commentaire
  const commentRow = detailRow + details.length + 2;
  ws.getRow(commentRow).getCell(1).value = "COMMENTAIRE RESPONSABLE PRODUCTION";
  ws.getRow(commentRow).getCell(1).style = headerStyle(T.white, T.secondary);
  ws.mergeCells(commentRow, 1, commentRow, 8);
  ws.getRow(commentRow).height = 22;

  for (let i = 1; i <= 5; i++) {
    ws.getRow(commentRow + i).height = 24;
    ws.mergeCells(commentRow + i, 1, commentRow + i, 8);
    ws.getCell(commentRow + i, 1).style = {
      border: { top:{style:"thin",color:{argb:T.border}}, bottom:{style:"thin",color:{argb:T.border}}, left:{style:"thin",color:{argb:T.border}}, right:{style:"thin",color:{argb:T.border}} },
      fill: { type:"pattern", pattern:"solid", fgColor:{ argb:"FFFFF8DC" } },
      alignment: { horizontal:"left", vertical:"top", wrapText:true },
      font: { size:10, name:"Calibri", italic:true, color:{ argb:T.grey } },
    };
    if (i === 1) ws.getCell(commentRow + 1, 1).value = "Saisir commentaire ici...";
  }
}

function buildPlanningVsActualSheet(
  wb: ExcelJS.Workbook,
  entries: EntryWithMetrics[],
) {
  const ws = wb.addWorksheet("Planning vs Réalisé", { properties: { tabColor: { argb: T.secondary } } });

  const COLS = [
    { header: "Date",               width: 12 },
    { header: "Équipement",         width: 22 },
    { header: "Produit",            width: 18 },
    { header: "Lot",                width: 14 },
    { header: "Poste",              width: 8  },
    { header: "Qté planifiée",      width: 16 },
    { header: "Qté réalisée",       width: 16 },
    { header: "Écart",              width: 12 },
    { header: "Respect planning",   width: 18 },
    { header: "Statut",             width: 14 },
    { header: "Commentaire",        width: 30 },
  ];

  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  setTitleRow(ws, "Planning vs Réalisé", COLS.length);
  setSubtitleRow(ws, "Écart = Réalisé - Planifié  |  Respect planning = Réalisé / Planifié", COLS.length);

  const hRow = ws.getRow(3);
  hRow.height = 32;
  COLS.forEach((c, i) => { hRow.getCell(i + 1).value = c.header; hRow.getCell(i + 1).style = headerStyle(); });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLS.length } };
  ws.views = [{ state: "frozen", ySplit: 3 }];

  entries.forEach((e, idx) => {
    const r = idx + 4;
    const row = ws.getRow(r);
    row.height = 17;

    row.getCell(1).value = e.date;
    row.getCell(1).style = { ...dataStyle(false,"center"), numFmt:"dd/mm/yyyy" };
    row.getCell(2).value = e.equipmentName;
    row.getCell(2).style = dataStyle(false,"left");
    row.getCell(3).value = e.productName;
    row.getCell(3).style = dataStyle(false,"left");
    row.getCell(4).value = e.batchNumber;
    row.getCell(4).style = dataStyle(false,"center");
    row.getCell(5).value = e.shift;
    row.getCell(5).style = dataStyle(false,"center");
    row.getCell(6).value = 0; // qtyPlan — à compléter depuis planning
    row.getCell(6).style = dataStyle(false,"center");
    row.getCell(7).value = e.quantityProduced;
    row.getCell(7).style = dataStyle(false,"center");
    row.getCell(8).value = { formula: `=G${r}-F${r}` };
    row.getCell(8).style = dataStyle(false,"center");
    row.getCell(9).value = { formula: `=IF(F${r}>0,G${r}/F${r},0)` };
    row.getCell(9).style = pctStyle();
    row.getCell(10).value = { formula: `=IF(I${r}>=0.9,"✔ OK",IF(I${r}>=0.75,"⚠ Retard","✖ Écart"))` };
    row.getCell(10).style = dataStyle(false,"center");
    row.getCell(11).value = "";
    row.getCell(11).style = dataStyle(false,"left");
  });

  if (entries.length > 0) {
    applyConditionalFormatting(ws, `I4:I${entries.length + 3}`, 0.90, 0.75);
  }
}

function buildEquipmentStatusSheet(wb: ExcelJS.Workbook, entries: EntryWithMetrics[]) {
  const ws = wb.addWorksheet("Statut Équipements", { properties: { tabColor: { argb: T.green } } });

  const COLS = [
    { header: "Équipement / Local",  width: 30 },
    { header: "Statut",              width: 14 },
    { header: "Produit en cours",    width: 20 },
    { header: "Lot en cours",        width: 16 },
    { header: "Nb postes (période)", width: 20 },
    { header: "TRS moyen",           width: 14 },
    { header: "Nb arrêts",           width: 12 },
    { header: "Durée arrêts (min)",  width: 20 },
  ];

  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  setTitleRow(ws, "Statut Équipements & Locaux", COLS.length);
  setSubtitleRow(ws, "Vue agrégée par équipement sur la période sélectionnée", COLS.length);

  const hRow = ws.getRow(3);
  hRow.height = 32;
  COLS.forEach((c, i) => { hRow.getCell(i + 1).value = c.header; hRow.getCell(i + 1).style = headerStyle(); });
  ws.views = [{ state: "frozen", ySplit: 3 }];

  // Aggregate by equipment — Phase 6 hotfix: only sum TRS from rows with a valid
  // triplet cadence (trsValid). Other counters (count, totalArrêts, downtime) remain
  // over all rows so volume views stay accurate.
  const equipMap = new Map<string, {
    name: string; count: number; trsCount: number; sumTRS: number; totalArrêts: number;
    totalDowntime: number; lastProduct: string | null; lastLot: string;
  }>();
  for (const e of entries) {
    const key = e.equipmentId;
    const ex = equipMap.get(key);
    if (ex) {
      ex.count++;
      if (e.trsValid) { ex.sumTRS += e.TRS; ex.trsCount++; }
      ex.totalArrêts += e.totalArrêts;
      ex.totalDowntime += e.plannedMinutes + e.unplannedMinutes;
      ex.lastProduct = e.productName;
      ex.lastLot = e.batchNumber;
    } else {
      equipMap.set(key, {
        name: e.equipmentName ?? key,
        count: 1,
        trsCount: e.trsValid ? 1 : 0,
        sumTRS: e.trsValid ? e.TRS : 0,
        totalArrêts: e.totalArrêts,
        totalDowntime: e.plannedMinutes + e.unplannedMinutes,
        lastProduct: e.productName, lastLot: e.batchNumber,
      });
    }
  }

  // Known equipment list + aggregated data
  const known = [
    "Géluleuse Harro Höfliger",
    "Blistereuse IMA TR135 S",
    "A23 Box de process",
    "A26 Stockage intermédiaire",
    "A20 Laverie",
    "A19 Local matériel propre",
  ];

  let rowIdx = 4;
  for (const [, eq] of equipMap) {
    const row = ws.getRow(rowIdx++);
    row.height = 20;
    // Phase 6 hotfix: average only over rows with valid cadence (trsCount).
    // When zero valid rows, render dash instead of phantom 0%.
    const hasValid = eq.trsCount > 0;
    const avgTRS = hasValid ? eq.sumTRS / eq.trsCount : 0;

    row.getCell(1).value = eq.name;
    row.getCell(1).style = dataStyle(true, "left");
    row.getCell(2).value = eq.count > 0 ? "En production" : "Inactif";
    row.getCell(2).style = {
      ...dataStyle(true, "center"),
      font: { bold:true, color:{ argb: eq.count > 0 ? T.green : T.grey }, name:"Calibri", size:10 },
    };
    row.getCell(3).value = eq.lastProduct;
    row.getCell(3).style = dataStyle(false,"left");
    row.getCell(4).value = eq.lastLot;
    row.getCell(4).style = dataStyle(false,"center");
    row.getCell(5).value = eq.count;
    row.getCell(5).style = dataStyle(false,"center");
    if (hasValid) {
      row.getCell(6).value = avgTRS;
      row.getCell(6).style = pctStyle(true);
    } else {
      row.getCell(6).value = "—";
      row.getCell(6).style = dataStyle(true, "center");
    }
    row.getCell(7).value = eq.totalArrêts;
    row.getCell(7).style = dataStyle(false,"center");
    row.getCell(8).value = eq.totalDowntime;
    row.getCell(8).style = timeStyle();
  }

  // Add known equipment not yet in data
  for (const name of known) {
    const inMap = Array.from(equipMap.values()).find(e => e.name.includes(name.split(" ")[0]));
    if (!inMap) {
      const row = ws.getRow(rowIdx++);
      row.height = 20;
      row.getCell(1).value = name;
      row.getCell(1).style = dataStyle(true, "left");
      row.getCell(2).value = "Aucune donnée";
      row.getCell(2).style = { ...dataStyle(true, "center"), font: { bold:false, color:{ argb:T.grey }, name:"Calibri", size:10 } };
      for (let c = 3; c <= 8; c++) {
        row.getCell(c).value = "—";
        row.getCell(c).style = dataStyle(false,"center");
      }
    }
  }
}

// ─── Footer helper ────────────────────────────────────────
function addFooter(ws: ExcelJS.Worksheet, opts: ExportOptions) {
  ws.headerFooter.oddFooter = [
    `&L DPI TRS/OEE Tracker — Export ${new Date().toLocaleDateString("fr-FR")}`,
    `&C Période : ${opts.from} → ${opts.to}`,
    `&R Exporté par : ${opts.exportedByName} &P / &N`,
  ].join("");
}

// ─── Main export function ─────────────────────────────────
export interface ExportOptions {
  from: string;
  to: string;
  equipmentId?: string;
  format: "complete" | "direction" | "technical" | "rawdata";
  withFormulas: boolean;
  withProtection: boolean;
  sourceSheetVisible: boolean;
  exportedBy: string;
  exportedByName: string;
}

export async function generateExcelReport(opts: ExportOptions): Promise<Buffer> {
  const entries = await fetchEntriesWithMetrics(opts.from, opts.to, opts.equipmentId);

  const wb = new ExcelJS.Workbook();
  wb.creator = "DPI TRS/OEE Tracker";
  wb.lastModifiedBy = opts.exportedByName;
  wb.created = new Date();
  wb.modified = new Date();
  wb.properties.date1904 = false;

  const srcSheetName = "Données Sources";

  // Build sheets based on format
  if (opts.format === "complete" || opts.format === "direction") {
    buildSyntheseSheet(wb, entries, opts);
  }
  if (opts.format === "complete" || opts.format === "technical") {
    buildDashboardTrsSheet(wb, entries, srcSheetName);
    buildPlanningVsActualSheet(wb, entries);
    buildDowntimeSheet(wb, entries);
    buildParetoSheet(wb, entries);
    buildEquipmentStatusSheet(wb, entries);
  }
  if (opts.format === "complete") {
    buildSourceDataSheet(wb, entries, opts.sourceSheetVisible);
    buildParamsSheet(wb, opts, entries);
  }
  if (opts.format === "rawdata") {
    buildSourceDataSheet(wb, entries, true);
    buildParamsSheet(wb, opts, entries);
  }

  // Add footer to all sheets
  wb.eachSheet(ws => {
    addFooter(ws, opts);
    if (opts.withProtection) {
      ws.protect("DPI-TRS-2025", {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: false,
        sort: true,
        autoFilter: true,
      });
    }
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
