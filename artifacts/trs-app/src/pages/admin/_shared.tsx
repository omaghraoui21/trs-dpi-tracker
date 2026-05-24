import { CheckCircle, XCircle, Plus } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function roleBadge(role: string) {
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

export function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function SectionHeader({
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

export function StatusBadge({ active }: { active: boolean }) {
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
export async function apiFetch(url: string, method = "GET", body?: unknown): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return customFetch<any>(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiDelete(url: string) {
  await customFetch(url, { method: "DELETE" });
}
