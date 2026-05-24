import { useQuery } from "@tanstack/react-query";
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
