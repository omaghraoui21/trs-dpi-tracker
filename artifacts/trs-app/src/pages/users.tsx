import { useState } from "react";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Edit, Lock, XCircle } from "lucide-react";
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
import { roleBadge, TableWrapper, SectionHeader, StatusBadge, apiFetch } from "./admin/_shared";

export default function UsersPage() {
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
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Utilisateurs</h1>
        <p className="text-sm text-muted-foreground">
          Gestion des comptes utilisateurs · création, modification, réinitialisation
        </p>
      </div>

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
                          onClick={async () => {
                            try {
                              await deleteUser.mutateAsync({ id: u.id });
                              qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
                            } catch {
                              // error surfaced by global MutationCache.onError
                            }
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
