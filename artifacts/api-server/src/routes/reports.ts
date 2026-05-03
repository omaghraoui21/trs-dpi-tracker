import { Router, IRouter, Request, Response } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { generateExcelReport, ExportOptions } from "../services/excelReportService";
import { z } from "zod";

const router: IRouter = Router();

const ExportRequestSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide (YYYY-MM-DD)"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide (YYYY-MM-DD)"),
  equipmentId: z.string().uuid().optional(),
  format: z.enum(["complete", "direction", "technical", "rawdata"]).default("complete"),
  withFormulas: z.boolean().default(true),
  withProtection: z.boolean().default(false),
  sourceSheetVisible: z.boolean().default(true),
});

router.post("/reports/export", requireAuth, requireRole("supervisor", "admin"), async (req: Request, res: Response): Promise<void> => {
  const parsed = ExportRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Paramètres invalides", details: parsed.error.issues });
    return;
  }

  const { from, to, equipmentId, format, withFormulas, withProtection, sourceSheetVisible } = parsed.data;
  const user = req.user!;

  const opts: ExportOptions = {
    from,
    to,
    equipmentId,
    format,
    withFormulas,
    withProtection,
    sourceSheetVisible,
    exportedBy: user.id,
    exportedByName: `${user.firstName} ${user.lastName}`,
  };

  const buffer = await generateExcelReport(opts);

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const formatLabel = format === "complete" ? "complet" : format === "direction" ? "direction" : format === "technical" ? "technique" : "rawdata";
  const filename = `rapport_TRS_${formatLabel}_${from}_${to}_${dateStr}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", buffer.length);
  res.end(buffer);
});

export default router;
