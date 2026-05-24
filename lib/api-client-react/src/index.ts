export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter, customFetch } from "./custom-fetch";
export type { AuthTokenGetter, CustomFetchOptions } from "./custom-fetch";
export { useListRooms, getListRoomsQueryKey } from "./custom-hooks";
export type { Room, RoomEquipment } from "./custom-hooks";
