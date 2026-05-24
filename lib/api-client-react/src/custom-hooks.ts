import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export interface RoomEquipment {
  id: string;
  code: string;
  name: string;
  trsObjective: number;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  roomType: string | null;
  equipments: RoomEquipment[];
}

interface EquipmentApiItem {
  id: string;
  code: string;
  name: string;
  trsObjective: number;
  isActive?: boolean;
  roomId?: string | null;
  roomCode?: string | null;
  roomName?: string | null;
}

// Derives room hierarchy from /api/equipments (stable endpoint).
// Groups by roomId when available (new API); falls back to a single
// flat group when the backend doesn't yet return room fields.
export const getListRoomsQueryKey = () => ["/api/equipments", "rooms-view"] as const;

export function useListRooms() {
  return useQuery({
    queryKey: getListRoomsQueryKey(),
    queryFn: async ({ signal }) => {
      const equipments = await customFetch<EquipmentApiItem[]>("/api/equipments", { signal });
      const active = equipments.filter((e) => e.isActive !== false);

      const roomMap = new Map<string, Room>();

      for (const eq of active) {
        const roomId = eq.roomId ?? "__no_room__";
        const roomCode = eq.roomCode ?? "";
        const roomName = eq.roomName ?? "Équipements";

        if (!roomMap.has(roomId)) {
          roomMap.set(roomId, {
            id: roomId,
            code: roomCode,
            name: roomName,
            roomType: null,
            equipments: [],
          });
        }

        roomMap.get(roomId)!.equipments.push({
          id: eq.id,
          code: eq.code,
          name: eq.name,
          trsObjective: eq.trsObjective,
        });
      }

      return Array.from(roomMap.values()).sort((a, b) => a.code.localeCompare(b.code));
    },
  });
}

// ─── Operator cycle phase order ──────────────────────────────────────────────

export type CyclePhase = "VIDE_LIGNE" | "REMPLISSAGE" | "LOT" | "NETTOYAGE" | "DESINFECTION";

export const DEFAULT_CYCLE_ORDER: CyclePhase[] = [
  "VIDE_LIGNE",
  "REMPLISSAGE",
  "LOT",
  "NETTOYAGE",
  "DESINFECTION",
];

export const getCycleOrderQueryKey = () => ["/api/admin/cycle-order"] as const;

export function useCycleOrder() {
  return useQuery({
    queryKey: getCycleOrderQueryKey(),
    queryFn: ({ signal }) =>
      customFetch<{ order: CyclePhase[] }>("/api/admin/cycle-order", { signal }),
    staleTime: 60_000,
  });
}

export function useUpdateCycleOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: CyclePhase[]) =>
      customFetch<{ order: CyclePhase[] }>("/api/admin/cycle-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getCycleOrderQueryKey() });
    },
  });
}
