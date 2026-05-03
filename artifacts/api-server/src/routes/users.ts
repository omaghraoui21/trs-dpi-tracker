import { Router, IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { hashPassword } from "../lib/auth";
import { CreateUserBody, UpdateUserBody, GetUserParams, UpdateUserParams, DeleteUserParams } from "@workspace/api-zod";
import { isUniqueViolation } from "../lib/db-errors";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

router.get("/users", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
    res.json(users.map(formatUser));
  } catch (err) {
    req.log.error({ err }, "List users error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { password, email, ...rest } = parsed.data;
    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(usersTable).values({ ...rest, email: email.toLowerCase().trim(), passwordHash }).returning();
    res.status(201).json(formatUser(user));
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Un utilisateur avec cet email existe déjà" });
      return;
    }
    req.log.error({ err }, "Create user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/users/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const params = GetUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(formatUser(user));
  } catch (err) {
    req.log.error({ err }, "Get user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/users/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const params = UpdateUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { password, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };
    if (password) updateData.passwordHash = await hashPassword(password);
    const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, params.data.id)).returning();
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(formatUser(user));
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Un utilisateur avec cet email existe déjà" });
      return;
    }
    req.log.error({ err }, "Update user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/users/:id/reset-password", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const id = req.params["id"] as string;
    if (!id) { res.status(400).json({ error: "ID requis" }); return; }
    const { password } = req.body as { password?: string };
    if (!password || password.length < 8) {
      res.status(400).json({ error: "Le mot de passe doit faire au moins 8 caractères" });
      return;
    }
    const passwordHash = await hashPassword(password);
    const [user] = await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }
    req.log.info({ targetUserId: id, by: req.user!.id }, "Password reset by admin");
    writeAudit({ userId: req.user!.id, tableName: "users", recordId: id, action: "reset_password",
      reason: `Réinitialisé par admin ${req.user!.email}` });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Reset password error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/users/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const params = DeleteUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    // Prevent self-deactivation
    if (params.data.id === req.user!.id) {
      res.status(400).json({ error: "Cannot deactivate your own account" });
      return;
    }
    await db.update(usersTable).set({ isActive: false }).where(eq(usersTable.id, params.data.id));
    res.sendStatus(204);
  } catch (err) {
    req.log.error({ err }, "Delete user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
