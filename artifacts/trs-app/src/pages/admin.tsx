import { useState, useMemo } from "react";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useListEquipments,
  useCreateEquipment,
  useUpdateEquipment,
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useListCadences,
  useUpsertCadence,
  useListDowntimeCategories,
  useCreateDowntimeCategory,
  useUpdateDowntimeCategory,
  useListMonthlyClosures,
  useCreateMonthlyClosure,
  getListUsersQueryKey,
  getListEquipmentsQueryKey,
  getListProductsQueryKey,
  getListCadencesQueryKey,
  getListDowntimeCategoriesQueryKey,
  getListMonthlyClosuresQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Edit,
  Lock,
  CheckCircle,
  XCircle,
  FlaskConical,
  Target,
  BookOpen,
  Bell,
  GitBranch,
  Settings,
  Users,
  Cpu,
  Package,
  Zap,
  ListChecks,
  Calendar,
  Play,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  Download,
  ShieldCheck,
  Clock,
  TriangleAlert,
  Trash2,
  FileText,
  Eraser,
  Filter,
  SquareCheck,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];
const IMPACT_TYPES = ["tO", "tR", "tF", "tN", "tU", "TQ"];
const KPI_CODES = ["TRS", "TRG", "TRE", "DO", "TP", "TQ", "PLANNING"];
const FAMILLE_OPTIONS = [
  "Arrêts non planifiés",
  "Problèmes de qualité",
  "Arrêt technique",
  "Attente et transition",
  "Utilités",
] as const;
import { customFetch } from "@workspace/api-client-react";

// ─── Shared helpers ────────────────────────────────────────
function roleBadge(role: string) {
  const map: Record<string, string> = {
    admin: "bg-purple-500/20 text-purple-400",
    supervisor: "bg-sky-500/20 text-sky-400",
    operator: "bg-slate-500/20 text-slate-400",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", map[role] ?? "")}>
      {role}
    </span>
  );
}

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  onAdd,
  addLabel,
}: {
  title: string;
  count?: number;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <div className="flex justify-between items-center">
      <h3 className="font-semibold">
        {title}
        {count !== undefined ? ` (${count})` : ""}
      </h3>
      {onAdd && (
        <Button
          onClick={onAdd}
          className="h-10 gap-2 bg-sky-500 hover:bg-sky-400 text-white text-sm"
        >
          <Plus className="h-4 w-4" />
          {addLabel ?? "Nouveau"}
        </Button>
      )}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="flex items-center gap-1 text-green-500 text-xs">
      <CheckCircle className="h-3.5 w-3.5" />
      Actif
    </span>
  ) : (
    <span className="flex items-center gap-1 text-muted-foreground text-xs">
      <XCircle className="h-3.5 w-3.5" />
      Inactif
    </span>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function apiFetch(url: string, method = "GET", body?: unknown): Promise<any> {
  return customFetch<any>(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function apiDelete(url: string) {
  await customFetch(url, { method: "DELETE" });
}

// ─── Users Tab ─────────────────────────────────────────────
function UsersTab() {
  const qc = useQueryClient();
  const { data: users } = useListUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "operator" as "operator" | "supervisor" | "admin",
  });
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm({ email: "", password: "", firstName: "", lastName: "", role: "operator" });
    setOpen(true);
  };
  const openEdit = (u: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: "operator" | "supervisor" | "admin";
  }) => {
    setEditing(u.id);
    setForm({
      email: u.email,
      password: "",
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
    });
    setOpen(true);
  };
  const handleSave = async () => {
    if (editing)
      await updateUser.mutateAsync({
        id: editing,
        data: { ...form, password: form.password || undefined },
      });
    else await createUser.mutateAsync({ data: form });
    qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
    setOpen(false);
  };
  const handleReset = async () => {
    if (!resetId || resetPwd.length < 8) return;
    setResetLoading(true);
    try {
      await apiFetch(`/api/users/${resetId}/reset-password`, "PATCH", { password: resetPwd });
      setResetId(null);
      setResetPwd("");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Utilisateurs"
        count={users?.length}
        onAdd={openCreate}
        addLabel="Nouvel utilisateur"
      />
      <TableWrapper>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {["Nom", "Email", "Rôle", "Statut", ""].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users?.map(
              (u: {
                id: string;
                firstName: string;
                lastName: string;
                email: string;
                role: "operator" | "supervisor" | "admin";
                isActive: boolean;
              }) => (
                <tr
                  key={u.id}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                    {u.firstName} {u.lastName}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{u.email}</td>
                  <td className="px-4 py-3">{roleBadge(u.role)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge active={u.isActive} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        title="Modifier"
                        className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted"
                        onClick={() => openEdit(u)}
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        title="Réinitialiser mot de passe"
                        className="h-9 w-9 flex items-center justify-center rounded-lg text-amber-500 hover:bg-amber-500/10"
                        onClick={() => {
                          setResetId(u.id);
                          setResetPwd("");
                        }}
                      >
                        <Lock className="h-4 w-4" />
                      </button>
                      {u.isActive && (
                        <button
                          title="Désactiver"
                          className="h-9 w-9 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10"
                          onClick={() => {
                            deleteUser.mutate({ id: u.id });
                            qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
                          }}
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </TableWrapper>

      {/* Edit / Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier" : "Nouvel"} utilisateur</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {[
              { l: "Prénom", k: "firstName" },
              { l: "Nom", k: "lastName" },
              { l: "Email", k: "email", type: "email" },
              {
                l: editing ? "Nouveau mot de passe (optionnel)" : "Mot de passe",
                k: "password",
                type: "password",
              },
            ].map(({ l, k, type }) => (
              <div key={k} className="space-y-1.5">
                <Label>{l}</Label>
                <Input
                  type={type ?? "text"}
                  value={form[k as keyof typeof form] as string}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  className="h-11"
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Rôle</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, role: v as "operator" | "supervisor" | "admin" }))
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["operator", "supervisor", "admin"] as const).map((r) => (
                    <SelectItem key={r} value={r} className="py-3">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button className="h-11 bg-sky-500 hover:bg-sky-400 text-white" onClick={handleSave}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog
        open={!!resetId}
        onOpenChange={(v) => {
          if (!v) {
            setResetId(null);
            setResetPwd("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
            <DialogDescription>
              Définissez un nouveau mot de passe pour cet utilisateur (8 caractères minimum).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>
                Nouveau mot de passe{" "}
                <span className="text-muted-foreground text-xs">(8 caractères min.)</span>
              </Label>
              <Input
                type="password"
                value={resetPwd}
                onChange={(e) => setResetPwd(e.target.value)}
                className="h-11"
                placeholder="••••••••"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                setResetId(null);
                setResetPwd("");
              }}
            >
              Annuler
            </Button>
            <Button
              className="h-11 bg-amber-500 hover:bg-amber-400 text-white"
              onClick={handleReset}
              disabled={resetPwd.length < 8 || resetLoading}
            >
              {resetLoading ? "En cours…" : "Réinitialiser"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Equipments Tab ────────────────────────────────────────
function EquipmentsTab() {
  const qc = useQueryClient();
  const { data: equipments } = useListEquipments();
  const createEquipment = useCreateEquipment();
  const updateEquipment = useUpdateEquipment();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", description: "", trsObjective: 75 });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const deleteEquipment = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/equipments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListEquipmentsQueryKey() });
      setDeleteConfirm(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", code: "", description: "", trsObjective: 75 });
    setOpen(true);
  };
  const openEdit = (e: {
    id: string;
    name: string;
    code: string;
    description?: string | null;
    trsObjective: number;
  }) => {
    setEditing(e.id);
    setForm({
      name: e.name,
      code: e.code,
      description: e.description ?? "",
      trsObjective: e.trsObjective,
    });
    setOpen(true);
  };
  const handleSave = async () => {
    const payload = {
      name: form.name,
      code: form.code,
      description: form.description || undefined,
      trsObjective: Number(form.trsObjective),
    };
    if (editing) await updateEquipment.mutateAsync({ id: editing, data: payload });
    else await createEquipment.mutateAsync({ data: payload });
    qc.invalidateQueries({ queryKey: getListEquipmentsQueryKey() });
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Équipements"
        count={equipments?.length}
        onAdd={openCreate}
        addLabel="Nouvel équipement"
      />
      <TableWrapper>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {["Code", "Nom", "Objectif TRS", "Actif", ""].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {equipments?.map(
              (e: {
                id: string;
                name: string;
                code: string;
                description?: string | null;
                trsObjective: number;
                isActive: boolean;
              }) => (
                <tr
                  key={e.id}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs font-bold">{e.code}</td>
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3 tabular-nums">{e.trsObjective}%</td>
                  <td className="px-4 py-3">
                    {e.isActive ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end items-center gap-1">
                      {deleteConfirm === e.id ? (
                        <>
                          <span className="text-xs text-red-400 mr-1">Désactiver ?</span>
                          <button
                            className="h-8 px-2.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600"
                            onClick={() => deleteEquipment.mutate(e.id)}
                          >
                            Oui
                          </button>
                          <button
                            className="h-8 px-2.5 rounded-lg border border-border text-xs hover:bg-muted"
                            onClick={() => setDeleteConfirm(null)}
                          >
                            Non
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted"
                            onClick={() => openEdit(e)}
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          {e.isActive && (
                            <button
                              className="h-9 w-9 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10"
                              onClick={() => setDeleteConfirm(e.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </TableWrapper>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier" : "Nouvel"} équipement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {[
              { l: "Nom", k: "name" },
              { l: "Code", k: "code" },
              { l: "Description", k: "description" },
            ].map(({ l, k }) => (
              <div key={k} className="space-y-1.5">
                <Label>{l}</Label>
                <Input
                  value={form[k as keyof typeof form] as string}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  className="h-11"
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Objectif TRS (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={form.trsObjective}
                onChange={(e) => setForm((f) => ({ ...f, trsObjective: Number(e.target.value) }))}
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button className="h-11 bg-sky-500 hover:bg-sky-400 text-white" onClick={handleSave}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Products Tab ──────────────────────────────────────────
function ProductsTab() {
  const qc = useQueryClient();
  const { data: products } = useListProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", description: "" });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const deleteProduct = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
      setDeleteConfirm(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", code: "", description: "" });
    setOpen(true);
  };
  const openEdit = (p: { id: string; name: string; code: string; description?: string | null }) => {
    setEditing(p.id);
    setForm({ name: p.name, code: p.code, description: p.description ?? "" });
    setOpen(true);
  };
  const handleSave = async () => {
    const payload = {
      name: form.name,
      code: form.code,
      description: form.description || undefined,
    };
    if (editing) await updateProduct.mutateAsync({ id: editing, data: payload });
    else await createProduct.mutateAsync({ data: payload });
    qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Produits"
        count={products?.length}
        onAdd={openCreate}
        addLabel="Nouveau produit"
      />
      <TableWrapper>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {["Code", "Nom", "Description", "Actif", ""].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products?.map(
              (p: {
                id: string;
                name: string;
                code: string;
                description?: string | null;
                isActive: boolean;
              }) => (
                <tr
                  key={p.id}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs font-bold">{p.code}</td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-[180px] truncate">
                    {p.description}
                  </td>
                  <td className="px-4 py-3">
                    {p.isActive ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end items-center gap-1">
                      {deleteConfirm === p.id ? (
                        <>
                          <span className="text-xs text-red-400 mr-1">Désactiver ?</span>
                          <button
                            className="h-8 px-2.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600"
                            onClick={() => deleteProduct.mutate(p.id)}
                          >
                            Oui
                          </button>
                          <button
                            className="h-8 px-2.5 rounded-lg border border-border text-xs hover:bg-muted"
                            onClick={() => setDeleteConfirm(null)}
                          >
                            Non
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted"
                            onClick={() => openEdit(p)}
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          {p.isActive && (
                            <button
                              className="h-9 w-9 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10"
                              onClick={() => setDeleteConfirm(p.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </TableWrapper>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier" : "Nouveau"} produit</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {[
              { l: "Nom", k: "name" },
              { l: "Code", k: "code" },
              { l: "Description", k: "description" },
            ].map(({ l, k }) => (
              <div key={k} className="space-y-1.5">
                <Label>{l}</Label>
                <Input
                  value={form[k as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  className="h-11"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button className="h-11 bg-sky-500 hover:bg-sky-400 text-white" onClick={handleSave}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Cadences Tab ──────────────────────────────────────────
function CadencesTab() {
  const qc = useQueryClient();
  const { data: cadences } = useListCadences({});
  const { data: products } = useListProducts();
  const { data: equipments } = useListEquipments();
  const upsertCadence = useUpsertCadence();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    productId: "",
    equipmentId: "",
    theoreticalCadence: "",
    validatedCadence: "",
    unit: "units/hour",
  });

  const handleSave = async () => {
    await upsertCadence.mutateAsync({
      data: {
        productId: form.productId,
        equipmentId: form.equipmentId,
        theoreticalCadence: Number(form.theoreticalCadence),
        validatedCadence: Number(form.validatedCadence),
        unit: form.unit,
      },
    });
    qc.invalidateQueries({ queryKey: getListCadencesQueryKey({}) });
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Cadences"
        count={cadences?.length}
        onAdd={() => {
          setForm({
            productId: "",
            equipmentId: "",
            theoreticalCadence: "",
            validatedCadence: "",
            unit: "units/hour",
          });
          setOpen(true);
        }}
        addLabel="Nouvelle cadence"
      />
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5 text-xs text-amber-400">
        ℹ️ La modification crée une nouvelle version horodatée — l'historique des cadences est
        conservé (NF E 60-182)
      </div>
      <TableWrapper>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {[
                "Produit",
                "Équipement",
                "Cadence théorique",
                "Cadence validée",
                "Unité",
                "Active",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cadences?.map((c) => (
              <tr
                key={c.id}
                className="border-b border-border/50 hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3 whitespace-nowrap">{c.productName}</td>
                <td className="px-4 py-3 whitespace-nowrap">{c.equipmentName}</td>
                <td className="px-4 py-3 tabular-nums">{c.theoreticalCadence.toLocaleString()}</td>
                <td className="px-4 py-3 tabular-nums font-bold">
                  {c.validatedCadence.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{c.unit}</td>
                <td className="px-4 py-3">
                  {c.isActive !== false ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrapper>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadence produit/équipement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Produit</Label>
              <Select
                value={form.productId}
                onValueChange={(v) => setForm((f) => ({ ...f, productId: v }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((p: { id: string; name: string }) => (
                    <SelectItem key={p.id} value={p.id} className="py-3">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Équipement</Label>
              <Select
                value={form.equipmentId}
                onValueChange={(v) => setForm((f) => ({ ...f, equipmentId: v }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {equipments?.map((e: { id: string; name: string }) => (
                    <SelectItem key={e.id} value={e.id} className="py-3">
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {[
              { l: "Cadence théorique (u/h)", k: "theoreticalCadence" },
              { l: "Cadence validée (u/h)", k: "validatedCadence" },
              { l: "Unité", k: "unit" },
            ].map(({ l, k }) => (
              <div key={k} className="space-y-1.5">
                <Label>{l}</Label>
                <Input
                  type={k.includes("Cadence") ? "number" : "text"}
                  value={form[k as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  className="h-11"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button className="h-11 bg-sky-500 hover:bg-sky-400 text-white" onClick={handleSave}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Downtime Categories Tab ───────────────────────────────
function CategoriesTab() {
  const qc = useQueryClient();
  const { data: categories } = useListDowntimeCategories();
  const createCat = useCreateDowntimeCategory();
  const updateCat = useUpdateDowntimeCategory();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    label: "",
    description: "",
    famille: "",
    impactType: "tF" as "tO" | "tR" | "tF" | "tN" | "tU" | "TQ",
    isPlanned: false,
    requiresComment: false,
    isQuickShortcut: false,
    shortcutEquipments: "",
  });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const deleteCat = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/downtime-categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListDowntimeCategoriesQueryKey() });
      setDeleteConfirm(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      code: "",
      label: "",
      description: "",
      famille: "",
      impactType: "tF",
      isPlanned: false,
      requiresComment: false,
      isQuickShortcut: false,
      shortcutEquipments: "",
    });
    setOpen(true);
  };
  const openEdit = (c: {
    id: string;
    code: string;
    label: string;
    description?: string | null;
    famille?: string | null;
    impactType: "tO" | "tR" | "tF" | "tN" | "tU" | "TQ";
    isPlanned: boolean;
    requiresComment: boolean;
    isQuickShortcut?: boolean;
    shortcutEquipments?: string | null;
  }) => {
    setEditing(c.id);
    setForm({
      code: c.code,
      label: c.label,
      description: c.description ?? "",
      famille: c.famille ?? "",
      impactType: c.impactType,
      isPlanned: c.isPlanned,
      requiresComment: c.requiresComment,
      isQuickShortcut: c.isQuickShortcut ?? false,
      shortcutEquipments: c.shortcutEquipments ?? "",
    });
    setOpen(true);
  };
  const handleSave = async () => {
    const payload = {
      code: form.code,
      label: form.label,
      description: form.description || undefined,
      famille: form.famille || undefined,
      impactType: form.impactType,
      isPlanned: form.isPlanned,
      requiresComment: form.requiresComment,
      isQuickShortcut: form.isQuickShortcut,
      shortcutEquipments: form.shortcutEquipments || null,
    };
    if (editing) await apiFetch(`/api/downtime-categories/${editing}`, "PATCH", payload);
    else await apiFetch("/api/downtime-categories", "POST", payload);
    qc.invalidateQueries({ queryKey: getListDowntimeCategoriesQueryKey() });
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Catégories d'arrêt"
        count={categories?.length}
        onAdd={openCreate}
        addLabel="Nouvelle catégorie"
      />
      <TableWrapper>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {["Code", "Libellé", "Famille", "Impact", "Type", "Cmt requis", "Raccourci", ""].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {categories?.map(
              (c: {
                id: string;
                code: string;
                label: string;
                description?: string | null;
                famille?: string | null;
                impactType: "tO" | "tR" | "tF" | "tN" | "tU" | "TQ";
                isPlanned: boolean;
                requiresComment: boolean;
                isActive?: boolean;
                isQuickShortcut?: boolean;
                shortcutEquipments?: string | null;
              }) => (
                <tr
                  key={c.id}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs font-bold">{c.code}</td>
                  <td className="px-4 py-3">{c.label}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[140px] truncate">
                    {c.famille ?? <span className="text-border">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className="bg-slate-500/20 text-slate-400 text-xs">{c.impactType}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      className={
                        c.isPlanned
                          ? "bg-blue-500/20 text-blue-400 text-xs"
                          : "bg-red-500/20 text-red-400 text-xs"
                      }
                    >
                      {c.isPlanned ? "Planifié" : "Non planifié"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {c.requiresComment ? (
                      <CheckCircle className="h-4 w-4 text-amber-500" />
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.isQuickShortcut ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400">
                        {c.shortcutEquipments || "Tous"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end items-center gap-1">
                      {deleteConfirm === c.id ? (
                        <>
                          <span className="text-xs text-red-400 mr-1">Désactiver ?</span>
                          <button
                            className="h-8 px-2.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600"
                            onClick={() => deleteCat.mutate(c.id)}
                          >
                            Oui
                          </button>
                          <button
                            className="h-8 px-2.5 rounded-lg border border-border text-xs hover:bg-muted"
                            onClick={() => setDeleteConfirm(null)}
                          >
                            Non
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted"
                            onClick={() => openEdit(c)}
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          {c.isActive !== false && (
                            <button
                              className="h-9 w-9 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10"
                              onClick={() => setDeleteConfirm(c.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </TableWrapper>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier" : "Nouvelle"} catégorie d'arrêt</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {[
              { l: "Code", k: "code" },
              { l: "Libellé", k: "label" },
              { l: "Description", k: "description" },
            ].map(({ l, k }) => (
              <div key={k} className="space-y-1.5">
                <Label>{l}</Label>
                <Input
                  value={form[k as keyof typeof form] as string}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  className="h-11"
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Famille d'arrêt</Label>
              <Select
                value={form.famille || "__none__"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, famille: v === "__none__" ? "" : v }))
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Sélectionner une famille..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="py-3 text-muted-foreground">
                    — Non classifié
                  </SelectItem>
                  {FAMILLE_OPTIONS.map((f) => (
                    <SelectItem key={f} value={f} className="py-3">
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Impact temps</Label>
              <Select
                value={form.impactType}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    impactType: v as "tO" | "tR" | "tF" | "tN" | "tU" | "TQ",
                  }))
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMPACT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="py-3">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between border border-border rounded-lg p-4">
              <Label>Arrêt planifié</Label>
              <Switch
                checked={form.isPlanned}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isPlanned: v }))}
              />
            </div>
            <div className="flex items-center justify-between border border-border rounded-lg p-4">
              <Label>Commentaire obligatoire</Label>
              <Switch
                checked={form.requiresComment}
                onCheckedChange={(v) => setForm((f) => ({ ...f, requiresComment: v }))}
              />
            </div>
            <div className="flex items-center justify-between border border-border rounded-lg p-4">
              <div>
                <Label>Raccourci rapide opérateur</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Afficher comme bouton rapide dans la saisie
                </p>
              </div>
              <Switch
                checked={form.isQuickShortcut}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isQuickShortcut: v }))}
              />
            </div>
            {form.isQuickShortcut && (
              <div className="space-y-1.5">
                <Label>
                  Équipements concernés{" "}
                  <span className="text-muted-foreground font-normal">
                    (codes séparés par virgule, vide = tous)
                  </span>
                </Label>
                <Input
                  value={form.shortcutEquipments}
                  onChange={(e) => setForm((f) => ({ ...f, shortcutEquipments: e.target.value }))}
                  placeholder="Ex: A27, A28  ou laisser vide pour tous"
                  className="h-11 font-mono"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button className="h-11 bg-sky-500 hover:bg-sky-400 text-white" onClick={handleSave}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Closures Tab ──────────────────────────────────────────
function ClosuresTab() {
  const qc = useQueryClient();
  const { data: closures } = useListMonthlyClosures({});
  const { data: equipments } = useListEquipments();
  const createClosure = useCreateMonthlyClosure();
  const now = new Date();
  const [form, setForm] = useState({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    equipmentId: "none",
    comment: "",
  });
  const [open, setOpen] = useState(false);

  const handleLock = async () => {
    await createClosure.mutateAsync({
      data: {
        month: form.month,
        year: form.year,
        equipmentId: form.equipmentId === "none" ? undefined : form.equipmentId,
        comment: form.comment || undefined,
      },
    });
    qc.invalidateQueries({ queryKey: getListMonthlyClosuresQueryKey({}) });
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Fermetures mensuelles"
        count={closures?.length}
        onAdd={() => setOpen(true)}
        addLabel="Fermer un mois"
      />
      <TableWrapper>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {["Période", "Équipement", "Fermé par", "Date", "Commentaire"].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!closures || closures.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                  Aucune fermeture enregistrée
                </td>
              </tr>
            ) : (
              closures.map(
                (c: {
                  id: string;
                  month: number;
                  year: number;
                  equipmentId?: string | null;
                  lockedByName?: string | null;
                  lockedAt: string;
                  comment?: string | null;
                }) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">
                      {MONTHS[c.month - 1]} {c.year}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.equipmentId
                        ? (equipments?.find(
                            (e: { id: string; name: string }) => e.id === c.equipmentId,
                          )?.name ?? "—")
                        : "Tous"}
                    </td>
                    <td className="px-4 py-3">{c.lockedByName}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {new Date(c.lockedAt).toLocaleString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[160px] truncate">
                      {c.comment ?? "—"}
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </TableWrapper>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fermeture mensuelle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Mois</Label>
                <Select
                  value={String(form.month)}
                  onValueChange={(v) => setForm((f) => ({ ...f, month: Number(v) }))}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)} className="py-3">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Année</Label>
                <Input
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
                  className="h-11"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Équipement (optionnel)</Label>
              <Select
                value={form.equipmentId}
                onValueChange={(v) => setForm((f) => ({ ...f, equipmentId: v }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Tous les équipements" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="py-3">
                    Tous les équipements
                  </SelectItem>
                  {equipments?.map((e: { id: string; name: string }) => (
                    <SelectItem key={e.id} value={e.id} className="py-3">
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Commentaire</Label>
              <Input
                value={form.comment}
                onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                placeholder="Optionnel..."
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              className="h-11 bg-amber-500 hover:bg-amber-400 text-white gap-2"
              onClick={handleLock}
            >
              <Lock className="h-4 w-4" /> Fermer le mois
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Formulas Tab ──────────────────────────────────────────
type Formula = {
  id: string;
  indicatorCode: string;
  indicatorName: string;
  formulaExpression: string;
  formulaDescription?: string | null;
  variablesJson?: string | null;
  unit?: string | null;
  version: number;
  isActive: boolean;
  validationStatus: string;
  changeReason?: string | null;
};

function FormulasTab() {
  const qc = useQueryClient();
  const { data: formulas, refetch } = useQuery<Formula[]>({
    queryKey: ["formulas"],
    queryFn: () => apiFetch("/api/formulas"),
  });
  const [testOpen, setTestOpen] = useState(false);
  const [selectedFormula, setSelectedFormula] = useState<Formula | null>(null);
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<{
    result?: number;
    status: string;
    error?: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  async function runTest() {
    if (!selectedFormula) return;
    setTesting(true);
    try {
      const inputs: Record<string, number> = {};
      for (const [k, v] of Object.entries(testInputs)) inputs[k] = parseFloat(v) || 0;
      const result = await apiFetch(`/api/formulas/${selectedFormula.id}/test`, "POST", { inputs });
      setTestResult(result as { result?: number; status: string; error?: string });
    } catch (e) {
      setTestResult({ status: "error", error: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setTesting(false);
    }
  }

  const openTest = (f: Formula) => {
    setSelectedFormula(f);
    const vars: string[] = f.variablesJson ? (JSON.parse(f.variablesJson) as string[]) : [];
    const inputs: Record<string, string> = {};
    vars.forEach((v) => {
      inputs[v] = "";
    });
    setTestInputs(inputs);
    setTestResult(null);
    setTestOpen(true);
  };

  const versionBadge = (status: string) => {
    const map: Record<string, string> = {
      validated: "bg-green-500/20 text-green-400",
      draft: "bg-amber-500/20 text-amber-400",
      deprecated: "bg-slate-500/20 text-slate-400 line-through",
    };
    return <Badge className={cn("text-xs", map[status] ?? "bg-slate-500/20")}>{status}</Badge>;
  };

  const activeFormulas = formulas?.filter((f) => f.isActive) ?? [];
  const allFormulas = formulas ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold">Formules TRS/OEE ({activeFormulas.length} actives)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Norme NF E 60-182 — toute modification crée une nouvelle version historisée
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" className="h-10 gap-2 text-sm">
          <RefreshCw className="h-4 w-4" /> Recharger
        </Button>
      </div>

      <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg px-4 py-3 text-xs text-sky-400 space-y-1">
        <p className="font-semibold">ℹ️ Formules actives NF E 60-182</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-0.5 font-mono mt-1">
          {[
            "TRS = tU / tR",
            "TRG = tU / tO",
            "TRE = tU / tT",
            "DO = tF / tR",
            "TP = tN / tF",
            "TQ = tU / tN",
          ].map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
      </div>

      <TableWrapper>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {["Code", "Indicateur", "Formule", "Unité", "v.", "Statut", ""].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allFormulas.map((f) => (
              <tr
                key={f.id}
                className={cn(
                  "border-b border-border/50 hover:bg-muted/30 transition-colors",
                  !f.isActive && "opacity-40",
                )}
              >
                <td className="px-4 py-3 font-mono text-xs font-bold text-sky-400">
                  {f.indicatorCode}
                </td>
                <td className="px-4 py-3 text-sm">{f.indicatorName}</td>
                <td className="px-4 py-3 font-mono text-xs bg-muted/30 rounded">
                  {f.formulaExpression}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{f.unit ?? "—"}</td>
                <td className="px-4 py-3 text-xs font-mono">v{f.version}</td>
                <td className="px-4 py-3">{versionBadge(f.validationStatus)}</td>
                <td className="px-4 py-3">
                  {f.isActive && (
                    <button
                      className="h-9 px-3 rounded-lg text-xs gap-1.5 flex items-center hover:bg-muted border border-border"
                      onClick={() => openTest(f)}
                    >
                      <Play className="h-3 w-3 text-green-500" /> Tester
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrapper>

      {/* Test Modal */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-green-500" />
              Tester : {selectedFormula?.indicatorCode}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/40 rounded-lg px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Formule</p>
              <p className="font-mono text-sm font-bold">
                {selectedFormula?.indicatorCode} = {selectedFormula?.formulaExpression}
              </p>
            </div>
            {Object.keys(testInputs).length > 0 ? (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Variables</Label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(testInputs).map((v) => (
                    <div key={v} className="space-y-1">
                      <Label className="text-xs font-mono">{v}</Label>
                      <Input
                        type="number"
                        value={testInputs[v]}
                        onChange={(e) => setTestInputs((p) => ({ ...p, [v]: e.target.value }))}
                        className="h-10 font-mono"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Cette formule n'a pas de variables saisies (valeur constante).
              </p>
            )}
            {testResult && (
              <div
                className={cn(
                  "rounded-lg px-4 py-3 border",
                  testResult.status === "pass"
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-red-500/10 border-red-500/30",
                )}
              >
                {testResult.status === "pass" ? (
                  <p className="font-bold text-green-400 text-lg">
                    Résultat :{" "}
                    {typeof testResult.result === "number"
                      ? `${(testResult.result * 100).toFixed(2)}%`
                      : testResult.result}
                  </p>
                ) : (
                  <p className="text-red-400 text-sm">{testResult.error ?? "Erreur de calcul"}</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setTestOpen(false)}>
              Fermer
            </Button>
            <Button
              className="h-11 bg-green-600 hover:bg-green-500 text-white gap-2"
              onClick={runTest}
              disabled={testing}
            >
              {testing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Calculer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── KPI Targets Tab ───────────────────────────────────────
type KpiTarget = {
  id: string;
  kpiCode: string;
  targetValue: string;
  warningThreshold?: string | null;
  criticalThreshold?: string | null;
  validFrom: string;
  validTo?: string | null;
  isActive: boolean;
  equipmentId?: string | null;
  siteId?: string | null;
  productId?: string | null;
};

function KpiTargetsTab() {
  const qc = useQueryClient();
  const { data: equipments } = useListEquipments();
  const { data: targets, refetch } = useQuery<KpiTarget[]>({
    queryKey: ["kpi-targets"],
    queryFn: () => apiFetch("/api/kpi-targets"),
  });
  const createTarget = useMutation({
    mutationFn: (data: unknown) => apiFetch("/api/kpi-targets", "POST", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kpi-targets"] });
      void refetch();
    },
  });
  const deleteTarget = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/kpi-targets/${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kpi-targets"] });
      void refetch();
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    kpiCode: "TRS",
    equipmentId: "all",
    targetValue: "85",
    warningThreshold: "70",
    criticalThreshold: "60",
    validFrom: new Date().toISOString().slice(0, 10),
  });

  const handleSave = async () => {
    await createTarget.mutateAsync({
      kpiCode: form.kpiCode,
      equipmentId: form.equipmentId === "all" ? undefined : form.equipmentId,
      targetValue: Number(form.targetValue),
      warningThreshold: form.warningThreshold ? Number(form.warningThreshold) : undefined,
      criticalThreshold: form.criticalThreshold ? Number(form.criticalThreshold) : undefined,
      validFrom: form.validFrom,
      isActive: true,
    });
    setOpen(false);
  };

  const kpiColor = (code: string) => {
    const map: Record<string, string> = {
      TRS: "bg-sky-500/20 text-sky-400",
      DO: "bg-green-500/20 text-green-400",
      TP: "bg-amber-500/20 text-amber-400",
      TQ: "bg-purple-500/20 text-purple-400",
      TRG: "bg-blue-500/20 text-blue-400",
      TRE: "bg-indigo-500/20 text-indigo-400",
      PLANNING: "bg-orange-500/20 text-orange-400",
    };
    return map[code] ?? "bg-slate-500/20 text-slate-400";
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Objectifs KPI"
        count={targets?.filter((t) => t.isActive).length}
        onAdd={() => setOpen(true)}
        addLabel="Nouvel objectif"
      />

      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-2.5 text-xs text-blue-400">
        <span className="font-semibold">Priorité :</span> Équipement + Produit → Équipement →
        Produit → Site global
      </div>

      <TableWrapper>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {[
                "KPI",
                "Équipement",
                "Objectif",
                "Vigilance",
                "Critique",
                "Depuis",
                "Statut",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!targets || targets.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                  Aucun objectif défini
                </td>
              </tr>
            ) : (
              targets.map((t) => {
                const eqName = t.equipmentId
                  ? (equipments?.find((e: { id: string; name: string }) => e.id === t.equipmentId)
                      ?.name ?? t.equipmentId)
                  : "Global";
                return (
                  <tr
                    key={t.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Badge className={cn("text-xs", kpiColor(t.kpiCode))}>{t.kpiCode}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">{eqName}</td>
                    <td className="px-4 py-3 font-bold text-green-400">
                      {parseFloat(t.targetValue).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-amber-400">
                      {t.warningThreshold ? `${parseFloat(t.warningThreshold).toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-red-400">
                      {t.criticalThreshold ? `${parseFloat(t.criticalThreshold).toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
                      {t.validFrom}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge active={t.isActive} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="h-9 w-9 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10"
                        onClick={() => deleteTarget.mutate(t.id)}
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </TableWrapper>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvel objectif KPI</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Indicateur KPI</Label>
              <Select
                value={form.kpiCode}
                onValueChange={(v) => setForm((f) => ({ ...f, kpiCode: v }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KPI_CODES.map((k) => (
                    <SelectItem key={k} value={k} className="py-3">
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Équipement (optionnel)</Label>
              <Select
                value={form.equipmentId}
                onValueChange={(v) => setForm((f) => ({ ...f, equipmentId: v }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="py-3">
                    Tous (objectif global)
                  </SelectItem>
                  {equipments?.map((e: { id: string; name: string }) => (
                    <SelectItem key={e.id} value={e.id} className="py-3">
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { l: "Objectif (%)", k: "targetValue", hint: "85" },
                { l: "Vigilance (%)", k: "warningThreshold", hint: "70" },
                { l: "Critique (%)", k: "criticalThreshold", hint: "60" },
              ].map(({ l, k, hint }) => (
                <div key={k} className="space-y-1.5">
                  <Label className="text-xs">{l}</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    placeholder={hint}
                    value={form[k as keyof typeof form]}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                    className="h-11"
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Valide depuis</Label>
              <Input
                type="date"
                value={form.validFrom}
                onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button className="h-11 bg-sky-500 hover:bg-sky-400 text-white" onClick={handleSave}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Planning Mappings Tab ─────────────────────────────────
type PlanningMapping = {
  id: string;
  activityLabel: string;
  mappedActivityType?: string | null;
  equipmentId?: string | null;
  roomId?: string | null;
  defaultUnit?: string | null;
  isProductive: boolean;
  excludedFromTrs: boolean;
  triggersStatus: boolean;
  isActive: boolean;
  equipmentName?: string | null;
  roomName?: string | null;
};

function PlanningMappingsTab() {
  const qc = useQueryClient();
  const { data: equipments } = useListEquipments();
  const { data: mappings, refetch } = useQuery<PlanningMapping[]>({
    queryKey: ["planning-mappings"],
    queryFn: () => apiFetch("/api/planning-mappings"),
  });
  const createMapping = useMutation({
    mutationFn: (data: unknown) => apiFetch("/api/planning-mappings", "POST", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-mappings"] });
      void refetch();
    },
  });
  const deleteMapping = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/planning-mappings/${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-mappings"] });
      void refetch();
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    activityLabel: "",
    mappedActivityType: "production",
    equipmentId: "none",
    defaultUnit: "",
    isProductive: true,
    excludedFromTrs: false,
    triggersStatus: true,
  });

  const handleSave = async () => {
    await createMapping.mutateAsync({
      activityLabel: form.activityLabel,
      mappedActivityType: form.mappedActivityType || undefined,
      equipmentId: form.equipmentId === "none" ? undefined : form.equipmentId,
      defaultUnit: form.defaultUnit || undefined,
      isProductive: form.isProductive,
      excludedFromTrs: form.excludedFromTrs,
      triggersStatus: form.triggersStatus,
      isActive: true,
    });
    setOpen(false);
  };

  const ACTIVITY_TYPES = ["production", "cleaning", "maintenance", "changeover", "off", "other"];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Mappings Planning → Équipements"
        count={mappings?.filter((m) => m.isActive).length}
        onAdd={() => setOpen(true)}
        addLabel="Nouveau mapping"
      />
      <div className="bg-slate-500/10 border border-slate-500/20 rounded-lg px-4 py-2.5 text-xs text-muted-foreground">
        Associe les libellés du planning Excel importé à des équipements et types d'activité.
      </div>
      <TableWrapper>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {[
                "Libellé planning",
                "Type",
                "Équipement",
                "Unité",
                "Productif",
                "Exclu TRS",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!mappings || mappings.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                  Aucun mapping défini
                </td>
              </tr>
            ) : (
              mappings
                .filter((m) => m.isActive)
                .map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{m.activityLabel}</td>
                    <td className="px-4 py-3">
                      <Badge className="text-xs bg-sky-500/20 text-sky-400">
                        {m.mappedActivityType ?? "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">{m.equipmentName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {m.defaultUnit ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {m.isProductive ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {m.excludedFromTrs ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      ) : (
                        <span className="text-muted-foreground text-xs">Non</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="h-9 w-9 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10"
                        onClick={() => deleteMapping.mutate(m.id)}
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </TableWrapper>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau mapping planning</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Libellé dans le planning Excel</Label>
              <Input
                value={form.activityLabel}
                onChange={(e) => setForm((f) => ({ ...f, activityLabel: e.target.value }))}
                placeholder="ex: PROD GELULES"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type d'activité</Label>
              <Select
                value={form.mappedActivityType}
                onValueChange={(v) => setForm((f) => ({ ...f, mappedActivityType: v }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="py-3">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Équipement associé</Label>
              <Select
                value={form.equipmentId}
                onValueChange={(v) => setForm((f) => ({ ...f, equipmentId: v }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="py-3">
                    Non associé
                  </SelectItem>
                  {equipments?.map((e: { id: string; name: string }) => (
                    <SelectItem key={e.id} value={e.id} className="py-3">
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unité par défaut</Label>
              <Input
                value={form.defaultUnit}
                onChange={(e) => setForm((f) => ({ ...f, defaultUnit: e.target.value }))}
                placeholder="gélules / blisters / boîtes..."
                className="h-11"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { l: "Productif", k: "isProductive" },
                { l: "Exclu TRS", k: "excludedFromTrs" },
                { l: "Change statut", k: "triggersStatus" },
              ].map(({ l, k }) => (
                <div
                  key={k}
                  className="flex flex-col items-center gap-1.5 border border-border rounded-lg p-3"
                >
                  <Label className="text-xs">{l}</Label>
                  <Switch
                    checked={form[k as keyof typeof form] as boolean}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, [k]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button className="h-11 bg-sky-500 hover:bg-sky-400 text-white" onClick={handleSave}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Notification Rules Tab ────────────────────────────────
type NotifRule = {
  id: string;
  ruleCode: string;
  ruleName: string;
  conditionExpression: string;
  severity: "info" | "warning" | "critical";
  thresholdValue?: string | null;
  targetRoles: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  isActive: boolean;
};

function NotificationRulesTab() {
  const qc = useQueryClient();
  const { data: rules, refetch } = useQuery<NotifRule[]>({
    queryKey: ["notification-rules"],
    queryFn: () => apiFetch("/api/notification-rules"),
  });
  const toggleRule = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`/api/notification-rules/${id}`, "PATCH", { isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-rules"] });
      void refetch();
    },
  });
  const createRule = useMutation({
    mutationFn: (data: unknown) => apiFetch("/api/notification-rules", "POST", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-rules"] });
      void refetch();
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    ruleCode: "",
    ruleName: "",
    conditionExpression: "",
    severity: "warning" as "info" | "warning" | "critical",
    thresholdValue: "",
    targetRoles: "supervisor",
    inAppEnabled: true,
    emailEnabled: false,
  });

  const handleSave = async () => {
    await createRule.mutateAsync({
      ...form,
      thresholdValue: form.thresholdValue ? Number(form.thresholdValue) : undefined,
    });
    setOpen(false);
  };

  const severityBadge = (s: string) => {
    const map: Record<string, string> = {
      info: "bg-sky-500/20 text-sky-400",
      warning: "bg-amber-500/20 text-amber-400",
      critical: "bg-red-500/20 text-red-400",
    };
    return <Badge className={cn("text-xs", map[s] ?? "")}>{s}</Badge>;
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Règles d'alerte"
        count={rules?.filter((r) => r.isActive).length}
        onAdd={() => setOpen(true)}
        addLabel="Nouvelle règle"
      />
      <TableWrapper>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {["Code", "Règle", "Condition", "Seuil", "Criticité", "Cibles", "App", "Actif"].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {!rules || rules.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                  Chargement...
                </td>
              </tr>
            ) : (
              rules.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    "border-b border-border/50 hover:bg-muted/30 transition-colors",
                    !r.isActive && "opacity-50",
                  )}
                >
                  <td className="px-4 py-3 font-mono text-xs">{r.ruleCode}</td>
                  <td className="px-4 py-3 text-sm">{r.ruleName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {r.conditionExpression}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-sm">
                    {r.thresholdValue ? `${(parseFloat(r.thresholdValue) * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-4 py-3">{severityBadge(r.severity)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.targetRoles}</td>
                  <td className="px-4 py-3">
                    {r.inAppEnabled ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={r.isActive}
                      onCheckedChange={(v) => toggleRule.mutate({ id: r.id, isActive: v })}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableWrapper>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle règle d'alerte</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {[
              { l: "Code (unique)", k: "ruleCode", hint: "TRS_LOW" },
              { l: "Nom", k: "ruleName", hint: "TRS inférieur à l'objectif" },
              { l: "Expression condition", k: "conditionExpression", hint: "TRS < target" },
            ].map(({ l, k, hint }) => (
              <div key={k} className="space-y-1.5">
                <Label>{l}</Label>
                <Input
                  value={form[k as keyof typeof form] as string}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  placeholder={hint}
                  className="h-11"
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Criticité</Label>
                <Select
                  value={form.severity}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, severity: v as "info" | "warning" | "critical" }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["info", "warning", "critical"] as const).map((s) => (
                      <SelectItem key={s} value={s} className="py-3">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Seuil (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.thresholdValue}
                  onChange={(e) => setForm((f) => ({ ...f, thresholdValue: e.target.value }))}
                  placeholder="85"
                  className="h-11"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Rôles cibles</Label>
              <Input
                value={form.targetRoles}
                onChange={(e) => setForm((f) => ({ ...f, targetRoles: e.target.value }))}
                placeholder="supervisor,admin"
                className="h-11"
              />
            </div>
            <div className="flex items-center justify-between border border-border rounded-lg p-4">
              <Label>Notification in-app</Label>
              <Switch
                checked={form.inAppEnabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, inAppEnabled: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button className="h-11 bg-sky-500 hover:bg-sky-400 text-white" onClick={handleSave}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── DPI Config Tab ─────────────────────────────────────────
interface ConfigCheck {
  key: string;
  label: string;
  status: "confirmed" | "provisional";
  count: number;
  items: string[];
}

function DpiConfigTab() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | {
    success: boolean;
    message: string;
    data?: Record<string, unknown>;
  }>(null);
  const [status, setStatus] = useState<null | {
    ready: boolean;
    pendingCount: number;
    checks: ConfigCheck[];
  }>(null);

  async function loadStatus() {
    try {
      const data = await apiFetch("/api/admin/config-status");
      setStatus(data);
    } catch {
      /* silently ignore */
    }
  }

  async function handleLoad() {
    setLoading(true);
    setResult(null);
    try {
      const data = await apiFetch("/api/admin/load-dpi-config", "POST");
      setResult(data);
      await loadStatus();
    } catch (e: unknown) {
      setResult({ success: false, message: e instanceof Error ? e.message : "Erreur inconnue" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header banner */}
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-5">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-sky-500/20 flex items-center justify-center shrink-0">
            <Download className="h-5 w-5 text-sky-400" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-lg">Charger configuration DPI TERIAK EF</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Pré-charge la configuration complète pour l'unité DPI Site El Fejja : locaux,
              équipements, produits Aerofor/Aeronide/Combifor, 45 catégories d'arrêts DPI, cadences,
              objectifs KPI, règles d'alertes, mappings planning et standards de temps.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Opération idempotente — peut être relancée sans risque.
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <Button
            onClick={handleLoad}
            disabled={loading}
            className="h-11 gap-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {loading ? "Chargement en cours…" : "Charger configuration DPI TERIAK EF"}
          </Button>
          <Button variant="outline" className="h-11" onClick={loadStatus}>
            Vérifier statut
          </Button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div
          className={`rounded-xl border p-4 ${result.success ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}
        >
          <div className="flex items-center gap-2 font-medium">
            {result.success ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            {result.message}
          </div>
          {result.success && result.data && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              {Object.entries(result.data as Record<string, unknown>)
                .filter(([k]) => k !== "warnings")
                .map(([k, v]) => (
                  <div key={k} className="bg-background/50 rounded-lg p-2.5 border border-border">
                    <div className="text-muted-foreground text-xs capitalize">
                      {k.replace(/([A-Z])/g, " $1").trim()}
                    </div>
                    <div className="font-bold text-lg">{String(v)}</div>
                  </div>
                ))}
            </div>
          )}
          {result.success &&
            Array.isArray((result.data as Record<string, unknown>)?.warnings) &&
            ((result.data as Record<string, unknown>).warnings as string[]).length > 0 && (
              <div className="mt-3 space-y-1">
                {((result.data as Record<string, unknown>).warnings as string[]).map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-yellow-400">
                    <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {w}
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* Config status checks */}
      {status && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {status.ready ? (
              <ShieldCheck className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            )}
            <h3 className="font-semibold">
              {status.ready
                ? "Configuration prête pour la production"
                : `${status.pendingCount} élément(s) à confirmer avant production`}
            </h3>
          </div>
          <div className="grid gap-3">
            {status.checks.map((check) => (
              <div key={check.key} className="border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{check.label}</span>
                  </div>
                  <Badge
                    className={
                      check.status === "confirmed"
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                    }
                  >
                    {check.status === "confirmed" ? "Confirmé" : `${check.count} à confirmer`}
                  </Badge>
                </div>
                {check.items.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {check.items.slice(0, 5).map((item, i) => (
                      <li
                        key={i}
                        className="text-xs text-muted-foreground flex items-center gap-1.5"
                      >
                        <span className="h-1 w-1 rounded-full bg-yellow-400 shrink-0" />
                        {item}
                      </li>
                    ))}
                    {check.items.length > 5 && (
                      <li className="text-xs text-muted-foreground">
                        +{check.items.length - 5} autres…
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What's included */}
      <div className="border border-border rounded-xl p-4">
        <h3 className="font-semibold mb-3 text-sm">Inclus dans la configuration DPI TERIAK EF</h3>
        <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
          {[
            "Site El Fejja (EF)",
            "8 locaux (A23, A26, A27, Blistereuse, SEC, A20, A19, A18)",
            "7 équipements DPI",
            "5 produits (Aerofor 12, Aeronide 200/400, Combifor 12/200 et 12/400)",
            "45 catégories d'arrêts DPI",
            "Cadences blistereuse (120 blisters/min confirmé)",
            "9 présentations produits",
            "BOM assemblage Combifor",
            "12 règles d'alertes DPI",
            "15 mappings planning Excel",
            "Objectifs KPI par équipement",
            "8 standards de temps (à confirmer)",
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <CheckCircle className="h-3.5 w-3.5 text-sky-400 shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Lots Tab ─────────────────────────────────────────────────────────────────
type LotEntry = {
  id: string;
  date: string;
  equipmentId: string;
  equipmentName: string | null;
  productId: string;
  productName: string | null;
  batchNumber: string;
  shift: string;
  shiftStart: string;
  shiftEnd: string;
  quantityProduced: number;
  quantityConforming: number;
  quantityRejected: number;
  status: string;
  trsMetrics?: { TRS?: number } | null;
};

const ENTRY_STATUS_LIST = ["draft", "submitted", "validated", "rejected"] as const;
const ENTRY_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  submitted: "Soumis",
  validated: "Validé",
  rejected: "Rejeté",
};

function entryStatusBadge(status: string) {
  const map: Record<string, string> = {
    draft: "bg-slate-500/20 text-slate-400",
    submitted: "bg-amber-500/20 text-amber-500",
    validated: "bg-green-500/20 text-green-500",
    rejected: "bg-red-500/20 text-red-500",
  };
  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded-full font-medium",
        map[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {ENTRY_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function LotsTab() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = `${today.slice(0, 7)}-01`;

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editEntry, setEditEntry] = useState<LotEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<LotEntry | null>(null);
  const [editForm, setEditForm] = useState<Partial<LotEntry>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const { data: equipments } = useListEquipments();
  const { data: products } = useListProducts();

  const {
    data: entries,
    refetch,
    isLoading,
  } = useQuery<LotEntry[]>({
    queryKey: ["admin-lots", dateFrom, dateTo, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (statusFilter !== "all") params.set("status", statusFilter);
      return apiFetch(`/api/production-entries?${params}`);
    },
  });

  const filtered = useMemo(() => {
    if (!entries) return [];
    const q = search.toLowerCase().trim();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.batchNumber.toLowerCase().includes(q) ||
        (e.productName ?? "").toLowerCase().includes(q) ||
        (e.equipmentName ?? "").toLowerCase().includes(q),
    );
  }, [entries, search]);

  const openEdit = (e: LotEntry) => {
    setEditEntry(e);
    setEditForm({
      date: e.date,
      equipmentId: e.equipmentId,
      productId: e.productId,
      batchNumber: e.batchNumber,
      shift: e.shift,
      shiftStart: e.shiftStart,
      shiftEnd: e.shiftEnd,
      quantityProduced: e.quantityProduced,
      quantityConforming: e.quantityConforming,
      quantityRejected: e.quantityRejected,
      status: e.status,
    });
    setDialogError("");
  };

  const handleSave = async () => {
    if (!editEntry) return;
    setSaving(true);
    setDialogError("");
    try {
      await apiFetch(`/api/production-entries/${editEntry.id}`, "PATCH", editForm);
      await refetch();
      setEditEntry(null);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteEntry) return;
    setDeleting(true);
    setDialogError("");
    try {
      await apiDelete(`/api/production-entries/${deleteEntry.id}`);
      await refetch();
      setDeleteEntry(null);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  };

  const setNum = (key: keyof LotEntry) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEditForm((f) => ({ ...f, [key]: Number(e.target.value) }));
  const setStr = (key: keyof LotEntry) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEditForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-4">
      <SectionHeader title="Gestion des lots de production" count={filtered.length} />

      {/* Filtres */}
      <div className="bg-muted/30 border border-border rounded-xl p-3 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-11 px-3 bg-card border border-border rounded-lg text-sm"
        />
        <span className="text-muted-foreground text-sm">→</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-11 px-3 bg-card border border-border rounded-lg text-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-11 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="py-3">
              Tous statuts
            </SelectItem>
            {ENTRY_STATUS_LIST.map((s) => (
              <SelectItem key={s} value={s} className="py-3">
                {ENTRY_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Recherche lot / produit / équipement…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 w-64"
        />
        <button
          className="h-11 w-11 flex items-center justify-center rounded-lg border border-border hover:bg-muted"
          onClick={() => refetch()}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Tableau */}
      <TableWrapper>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {[
                "Date",
                "Équipement",
                "Produit",
                "Lot",
                "Poste",
                "Produit",
                "Conforme",
                "TRS",
                "Statut",
                "",
              ].map((h, i) => (
                <th
                  key={i}
                  className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">
                  Chargement…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">
                  Aucun lot pour cette période
                </td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-3 py-3 whitespace-nowrap font-mono text-xs">{e.date}</td>
                  <td className="px-3 py-3 whitespace-nowrap max-w-[110px] truncate text-xs text-muted-foreground">
                    {e.equipmentName ?? "—"}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap max-w-[110px] truncate text-xs">
                    {e.productName ?? "—"}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap font-mono text-xs font-medium">
                    {e.batchNumber}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    {e.shift}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums text-xs">
                    {e.quantityProduced.toLocaleString("fr-FR")}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums text-xs">
                    {e.quantityConforming.toLocaleString("fr-FR")}
                  </td>
                  <td
                    className="px-3 py-3 text-right whitespace-nowrap tabular-nums text-xs font-medium"
                    style={{
                      color:
                        e.trsMetrics?.TRS != null
                          ? e.trsMetrics.TRS >= 0.75
                            ? "#22c55e"
                            : e.trsMetrics.TRS >= 0.55
                              ? "#f97316"
                              : "#ef4444"
                          : undefined,
                    }}
                  >
                    {e.trsMetrics?.TRS != null ? `${(e.trsMetrics.TRS * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{entryStatusBadge(e.status)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                        title="Modifier"
                        onClick={() => openEdit(e)}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="h-8 w-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Supprimer"
                        onClick={() => {
                          setDeleteEntry(e);
                          setDialogError("");
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableWrapper>

      {/* Modal édition */}
      <Dialog
        open={editEntry !== null}
        onOpenChange={(v) => {
          if (!v) setEditEntry(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Modifier le lot <span className="font-mono">{editEntry?.batchNumber}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={editForm.date ?? ""}
                  onChange={setStr("date")}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Numéro de lot</Label>
                <Input
                  value={editForm.batchNumber ?? ""}
                  onChange={setStr("batchNumber")}
                  className="h-11 font-mono tracking-widest"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Équipement</Label>
              <Select
                value={editForm.equipmentId ?? ""}
                onValueChange={(v) => setEditForm((f) => ({ ...f, equipmentId: v }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Choisir un équipement" />
                </SelectTrigger>
                <SelectContent>
                  {(
                    equipments as Array<{ id: string; name: string; isActive: boolean }> | undefined
                  )
                    ?.filter((eq) => eq.isActive)
                    .map((eq) => (
                      <SelectItem key={eq.id} value={String(eq.id)} className="py-3">
                        {eq.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Produit</Label>
              <Select
                value={editForm.productId ?? ""}
                onValueChange={(v) => setEditForm((f) => ({ ...f, productId: v }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Choisir un produit" />
                </SelectTrigger>
                <SelectContent>
                  {(products as Array<{ id: string; name: string; isActive: boolean }> | undefined)
                    ?.filter((p) => p.isActive)
                    .map((p) => (
                      <SelectItem key={p.id} value={String(p.id)} className="py-3">
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Nom poste</Label>
                <Input value={editForm.shift ?? ""} onChange={setStr("shift")} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label>Début</Label>
                <Input
                  type="time"
                  value={editForm.shiftStart ?? ""}
                  onChange={setStr("shiftStart")}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fin</Label>
                <Input
                  type="time"
                  value={editForm.shiftEnd ?? ""}
                  onChange={setStr("shiftEnd")}
                  className="h-11"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["Qté produite", "quantityProduced"],
                  ["Qté conforme", "quantityConforming"],
                  ["Qté rebus", "quantityRejected"],
                ] as const
              ).map(([label, key]) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editForm[key] ?? 0}
                    onChange={setNum(key)}
                    className="h-11"
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select
                value={editForm.status ?? ""}
                onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTRY_STATUS_LIST.map((s) => (
                    <SelectItem key={s} value={s} className="py-3">
                      {ENTRY_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Modifier le statut recalculera les métriques TRS au prochain affichage.
              </p>
            </div>
            {dialogError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {dialogError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setEditEntry(null)}>
              Annuler
            </Button>
            <Button
              className="h-11 bg-sky-500 hover:bg-sky-400 text-white"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Enregistrement…" : "Enregistrer les corrections"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal suppression */}
      <Dialog
        open={deleteEntry !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteEntry(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le lot définitivement ?</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm">
              Lot <strong className="font-mono">{deleteEntry?.batchNumber}</strong> —{" "}
              {deleteEntry?.productName}
            </p>
            <p className="text-xs text-muted-foreground">
              {deleteEntry?.equipmentName} · {deleteEntry?.date} ·{" "}
              {ENTRY_STATUS_LABELS[deleteEntry?.status ?? ""] ?? deleteEntry?.status}
            </p>
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Cette action est <strong>irréversible</strong>. Toutes les données d'arrêts
                associées seront également supprimées.
              </span>
            </div>
            {dialogError && <p className="text-xs text-red-400">{dialogError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setDeleteEntry(null)}>
              Annuler
            </Button>
            <Button
              className="h-11 bg-red-500 hover:bg-red-400 text-white gap-2"
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? "Suppression…" : "Supprimer définitivement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Cleanup Tab ──────────────────────────────────────────
type CleanupEntry = {
  id: string;
  date: string;
  batchNumber: string;
  equipmentName: string | null;
  productName: string | null;
  status: string;
  quantityProduced: number;
};

function CleanupTab() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = `${new Date().getFullYear()}-01-01`;

  // ── Lots filters ─────────────────────────────────────
  const [dateFrom, setDateFrom] = useState(firstOfYear);
  const [dateTo, setDateTo] = useState(today);
  const [statusFilter, setStatusFilter] = useState("all");
  const [equipFilter, setEquipFilter] = useState("all");
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [deleteTotal, setDeleteTotal] = useState(0);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // ── Ref data ──────────────────────────────────────────
  const { data: equipments, refetch: refetchEq } = useListEquipments();
  const { data: products, refetch: refetchProd } = useListProducts();
  const { data: categories, refetch: refetchCat } = useListDowntimeCategories();
  const [refConfirm, setRefConfirm] = useState<{
    kind: string;
    label: string;
    ids: string[];
  } | null>(null);
  const [refDeleting, setRefDeleting] = useState(false);
  const [refFeedback, setRefFeedback] = useState<string | null>(null);

  const inactiveEquipments = useMemo(
    () =>
      (
        (equipments as Array<{ id: string; name: string; isActive: boolean }> | undefined) ?? []
      ).filter((e) => !e.isActive),
    [equipments],
  );
  const inactiveProducts = useMemo(
    () =>
      (
        (products as Array<{ id: string; name: string; isActive: boolean }> | undefined) ?? []
      ).filter((p) => !p.isActive),
    [products],
  );
  const inactiveCategories = useMemo(
    () =>
      (
        (categories as Array<{ id: string; label: string; isActive?: boolean }> | undefined) ?? []
      ).filter((c) => c.isActive === false),
    [categories],
  );

  // ── Lots query ────────────────────────────────────────
  const {
    data: entries,
    isFetching,
    refetch,
  } = useQuery<CleanupEntry[]>({
    queryKey: ["cleanup-lots", dateFrom, dateTo, statusFilter, equipFilter],
    queryFn: async () => {
      const p = new URLSearchParams({ dateFrom, dateTo });
      if (statusFilter !== "all") p.set("status", statusFilter);
      if (equipFilter !== "all") p.set("equipmentId", equipFilter);
      return apiFetch(`/api/production-entries?${p}`);
    },
    enabled: searched,
  });

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAll() {
    if (!entries) return;
    if (selected.size === entries.length) setSelected(new Set());
    else setSelected(new Set(entries.map((e) => e.id)));
  }

  async function doDeleteSelected() {
    const ids = [...selected];
    setDeleting(true);
    setDeleteTotal(ids.length);
    setDeleteProgress(0);
    setFeedback(null);
    let failed = 0;
    for (const id of ids) {
      try {
        await apiDelete(`/api/production-entries/${id}`);
      } catch {
        failed++;
      }
      setDeleteProgress((p) => p + 1);
    }
    setDeleting(false);
    setConfirmOpen(false);
    setSelected(new Set());
    await refetch();
    qc.invalidateQueries({ queryKey: ["admin-lots"] });
    setFeedback(
      failed === 0
        ? { type: "ok", msg: `${ids.length} lot(s) supprimé(s) avec succès.` }
        : { type: "err", msg: `${ids.length - failed} supprimé(s), ${failed} erreur(s).` },
    );
  }

  async function doDeleteRefData() {
    if (!refConfirm) return;
    setRefDeleting(true);
    let failed = 0;
    for (const id of refConfirm.ids) {
      try {
        const urlMap: Record<string, string> = {
          equipments: `/api/equipments/${id}`,
          products: `/api/products/${id}`,
          categories: `/api/downtime-categories/${id}`,
        };
        await apiDelete(urlMap[refConfirm.kind]);
      } catch {
        failed++;
      }
    }
    setRefDeleting(false);
    setRefConfirm(null);
    if (refConfirm.kind === "equipments") await refetchEq();
    if (refConfirm.kind === "products") await refetchProd();
    if (refConfirm.kind === "categories") await refetchCat();
    qc.invalidateQueries({ queryKey: getListEquipmentsQueryKey() });
    qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
    qc.invalidateQueries({ queryKey: getListDowntimeCategoriesQueryKey() });
    setRefFeedback(failed === 0 ? `Suppression réussie.` : `Partielle : ${failed} erreur(s).`);
    setTimeout(() => setRefFeedback(null), 4000);
  }

  const allSelected = !!entries?.length && selected.size === entries.length;
  const someSelected = selected.size > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Nettoyage des données</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Suppression définitive de lignes sur l'ensemble des entités de l'application.
        </p>
      </div>

      {/* ── Section 1 : Lots de production ── */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-muted/30 border-b border-border px-5 py-3 flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-red-400" />
          <span className="font-semibold text-sm">Lots de production</span>
          <span className="text-xs text-muted-foreground ml-1">
            — suppression irréversible avec tous les arrêts associés
          </span>
        </div>
        <div className="p-5 space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date début</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setSearched(false);
                }}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date fin</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setSearched(false);
                }}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Statut</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setSearched(false);
                }}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="py-2.5">
                    Tous les statuts
                  </SelectItem>
                  <SelectItem value="draft" className="py-2.5">
                    Brouillon
                  </SelectItem>
                  <SelectItem value="submitted" className="py-2.5">
                    Soumis
                  </SelectItem>
                  <SelectItem value="validated" className="py-2.5">
                    Validé
                  </SelectItem>
                  <SelectItem value="rejected" className="py-2.5">
                    Rejeté
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Équipement</Label>
              <Select
                value={equipFilter}
                onValueChange={(v) => {
                  setEquipFilter(v);
                  setSearched(false);
                }}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="py-2.5">
                    Tous
                  </SelectItem>
                  {(equipments as Array<{ id: string; name: string }> | undefined)?.map((eq) => (
                    <SelectItem key={eq.id} value={eq.id} className="py-2.5">
                      {eq.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="h-10 gap-2 bg-sky-600 hover:bg-sky-500 text-white"
            onClick={() => {
              setSearched(true);
              setSelected(new Set());
              setFeedback(null);
            }}
            disabled={isFetching}
          >
            <Filter className="h-3.5 w-3.5" />
            {isFetching ? "Recherche…" : "Rechercher"}
          </Button>

          {/* Feedback */}
          {feedback && (
            <div
              className={cn(
                "flex items-center gap-2 text-sm px-3 py-2 rounded-lg border",
                feedback.type === "ok"
                  ? "bg-green-500/10 border-green-500/30 text-green-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400",
              )}
            >
              {feedback.type === "ok" ? (
                <CheckCircle className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              {feedback.msg}
            </div>
          )}

          {/* Results */}
          {searched && entries && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{entries.length} lot(s) trouvé(s)</p>
                {someSelected && (
                  <Button
                    onClick={() => setConfirmOpen(true)}
                    className="h-9 gap-2 bg-red-600 hover:bg-red-500 text-white text-sm"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer {selected.size} sélectionné(s)
                  </Button>
                )}
              </div>
              {entries.length > 0 ? (
                <TableWrapper>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-3 py-3 w-10">
                          <button
                            onClick={toggleAll}
                            className="flex items-center justify-center text-muted-foreground hover:text-foreground"
                          >
                            {allSelected ? (
                              <SquareCheck className="h-4 w-4 text-sky-400" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        </th>
                        {["Date", "N° Lot", "Équipement", "Produit", "Statut", "Qté"].map((h) => (
                          <th
                            key={h}
                            className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e) => {
                        const isSelected = selected.has(e.id);
                        return (
                          <tr
                            key={e.id}
                            onClick={() => toggleSelect(e.id)}
                            className={cn(
                              "border-b border-border/50 cursor-pointer transition-colors",
                              isSelected ? "bg-red-500/8" : "hover:bg-muted/30",
                            )}
                          >
                            <td className="px-3 py-2.5 w-10">
                              <div className="flex items-center justify-center text-muted-foreground">
                                {isSelected ? (
                                  <SquareCheck className="h-4 w-4 text-red-400" />
                                ) : (
                                  <Square className="h-4 w-4" />
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                              {e.date}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs font-medium whitespace-nowrap">
                              {e.batchNumber}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground truncate max-w-[120px]">
                              {e.equipmentName ?? "—"}
                            </td>
                            <td className="px-3 py-2.5 text-xs truncate max-w-[120px]">
                              {e.productName ?? "—"}
                            </td>
                            <td className="px-3 py-2.5">{entryStatusBadge(e.status)}</td>
                            <td className="px-3 py-2.5 text-xs tabular-nums text-right">
                              {e.quantityProduced.toLocaleString("fr-FR")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrapper>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Aucun lot pour ce filtre.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Section 2 : Référentiels inactifs ── */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-muted/30 border-b border-border px-5 py-3 flex items-center gap-2">
          <Eraser className="h-4 w-4 text-orange-400" />
          <span className="font-semibold text-sm">Référentiels inactifs</span>
          <span className="text-xs text-muted-foreground ml-1">
            — suppression définitive des enregistrements désactivés
          </span>
        </div>
        <div className="p-5 space-y-3">
          {refFeedback && (
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border bg-green-500/10 border-green-500/30 text-green-400">
              <CheckCircle className="h-4 w-4 shrink-0" /> {refFeedback}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                kind: "equipments",
                label: "Équipements inactifs",
                icon: <Cpu className="h-4 w-4" />,
                items: inactiveEquipments,
                color: "text-orange-400",
                border: "border-orange-500/20",
              },
              {
                kind: "products",
                label: "Produits inactifs",
                icon: <Package className="h-4 w-4" />,
                items: inactiveProducts,
                color: "text-orange-400",
                border: "border-orange-500/20",
              },
              {
                kind: "categories",
                label: "Types d'arrêts inactifs",
                icon: <ListChecks className="h-4 w-4" />,
                items: inactiveCategories,
                color: "text-orange-400",
                border: "border-orange-500/20",
              },
            ].map(({ kind, label, icon, items, color, border }) => (
              <div key={kind} className={cn("border rounded-xl p-4 space-y-3", border)}>
                <div className="flex items-center gap-2">
                  <span className={color}>{icon}</span>
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <div
                  className={cn(
                    "text-3xl font-bold",
                    items.length > 0 ? "text-red-400" : "text-muted-foreground",
                  )}
                >
                  {items.length}
                </div>
                {items.length > 0 ? (
                  <>
                    <ul className="space-y-1 max-h-24 overflow-y-auto">
                      {items.map((it: { id: string; name?: string; label?: string }) => (
                        <li key={it.id} className="text-xs text-muted-foreground truncate">
                          · {it.name ?? it.label}
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant="outline"
                      className="h-9 w-full text-xs gap-1.5 text-red-400 border-red-500/30 hover:bg-red-500/10"
                      onClick={() =>
                        setRefConfirm({
                          kind,
                          label,
                          ids: items.map((it: { id: string }) => it.id),
                        })
                      }
                    >
                      <Trash2 className="h-3 w-3" /> Supprimer {items.length} inactif(s)
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Aucun enregistrement inactif.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Confirm: bulk lots delete ── */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(v) => {
          if (!v && !deleting) setConfirmOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm">
              Vous êtes sur le point de supprimer <strong>{selected.size} lot(s)</strong> et tous
              leurs arrêts associés.
            </p>
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Cette action est <strong>irréversible</strong>. Les données supprimées ne pourront
                pas être récupérées.
              </span>
            </div>
            {deleting && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Suppression en cours…</span>
                  <span>
                    {deleteProgress} / {deleteTotal}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full transition-all"
                    style={{
                      width: `${deleteTotal > 0 ? (deleteProgress / deleteTotal) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              Annuler
            </Button>
            <Button
              className="h-11 bg-red-600 hover:bg-red-500 text-white gap-2"
              onClick={doDeleteSelected}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4" />{" "}
              {deleting
                ? `Suppression (${deleteProgress}/${deleteTotal})…`
                : `Supprimer ${selected.size} lot(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm: reference data delete ── */}
      <Dialog
        open={refConfirm !== null}
        onOpenChange={(v) => {
          if (!v && !refDeleting) setRefConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer les enregistrements inactifs ?</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm">
              Supprimer{" "}
              <strong>
                {refConfirm?.ids.length} {refConfirm?.label.toLowerCase()}
              </strong>{" "}
              de façon définitive ?
            </p>
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Action <strong>irréversible</strong>. Assurez-vous qu'aucune donnée de production ne
                référence ces éléments.
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => setRefConfirm(null)}
              disabled={refDeleting}
            >
              Annuler
            </Button>
            <Button
              className="h-11 bg-red-600 hover:bg-red-500 text-white gap-2"
              onClick={doDeleteRefData}
              disabled={refDeleting}
            >
              <Trash2 className="h-4 w-4" /> {refDeleting ? "Suppression…" : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Admin Page — Sidebar layout ─────────────────────
const TABS = [
  { id: "dpi-config", label: "Config DPI EF", icon: Download, group: "Configuration" },
  { id: "formulas", label: "Formules TRS", icon: BookOpen, group: "Paramétrage" },
  { id: "kpi-targets", label: "Objectifs KPI", icon: Target, group: "Paramétrage" },
  { id: "notif-rules", label: "Règles Alertes", icon: Bell, group: "Paramétrage" },
  { id: "plan-mappings", label: "Mappings Planning", icon: GitBranch, group: "Paramétrage" },
  { id: "lots", label: "Lots de production", icon: FileText, group: "Exploitation" },
  { id: "cleanup", label: "Nettoyage", icon: Eraser, group: "Exploitation" },
  { id: "users", label: "Utilisateurs", icon: Users, group: "Référentiels" },
  { id: "equipments", label: "Équipements", icon: Cpu, group: "Référentiels" },
  { id: "products", label: "Produits", icon: Package, group: "Référentiels" },
  { id: "cadences", label: "Cadences", icon: Zap, group: "Référentiels" },
  { id: "categories", label: "Types d'arrêts", icon: ListChecks, group: "Référentiels" },
  { id: "closures", label: "Fermetures", icon: Calendar, group: "Référentiels" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>("dpi-config");

  const groups = ["Configuration", "Paramétrage", "Exploitation", "Référentiels"];

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r border-border bg-card/50 overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Administration
            </span>
          </div>
          {groups.map((group) => (
            <div key={group} className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5 px-2">
                {group}
              </p>
              {TABS.filter((t) => t.group === group).map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all mb-0.5",
                      active
                        ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-sky-400" : "text-muted-foreground",
                      )}
                    />
                    <span className="truncate">{tab.label}</span>
                    {active && <ChevronRight className="h-3 w-3 ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-5">
        <div className="max-w-5xl">
          {activeTab === "dpi-config" && <DpiConfigTab />}
          {activeTab === "formulas" && <FormulasTab />}
          {activeTab === "kpi-targets" && <KpiTargetsTab />}
          {activeTab === "notif-rules" && <NotificationRulesTab />}
          {activeTab === "plan-mappings" && <PlanningMappingsTab />}
          {activeTab === "lots" && <LotsTab />}
          {activeTab === "cleanup" && <CleanupTab />}
          {activeTab === "users" && <UsersTab />}
          {activeTab === "equipments" && <EquipmentsTab />}
          {activeTab === "products" && <ProductsTab />}
          {activeTab === "cadences" && <CadencesTab />}
          {activeTab === "categories" && <CategoriesTab />}
          {activeTab === "closures" && <ClosuresTab />}
        </div>
      </main>
    </div>
  );
}
