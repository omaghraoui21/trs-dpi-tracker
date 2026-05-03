import { Router, IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, verifyPassword } from "../lib/auth";
import { requireAuth } from "../middlewares/auth";
import { LoginBody } from "@workspace/api-zod";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  try {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Email et mot de passe requis" });
      return;
    }
    const { email, password } = parsed.data;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
    // Always run bcrypt compare to prevent timing-based user enumeration
    const dummyHash = "$2b$12$invalidhashfortimingnormalization000000000000000000000000";
    const passwordOk = user
      ? await verifyPassword(password, user.passwordHash)
      : await verifyPassword(password, dummyHash).then(() => false);
    if (!user || !user.isActive || !passwordOk) {
      res.status(401).json({ error: "Identifiants invalides" });
      return;
    }
    const token = await signToken({ sub: user.id, email: user.email, role: user.role });
    writeAudit({ userId: user.id, tableName: "users", recordId: user.id, action: "login",
      newValues: { email: user.email, role: user.role } });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
      },
      token,
    });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ success: true });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;
