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

export const getListRoomsQueryKey = () => ["/api/rooms"] as const;

export function useListRooms() {
  return useQuery({
    queryKey: getListRoomsQueryKey(),
    queryFn: ({ signal }) => customFetch<Room[]>("/api/rooms", { signal }),
  });
}
