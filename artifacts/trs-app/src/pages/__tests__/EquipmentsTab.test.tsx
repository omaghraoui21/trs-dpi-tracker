/** @vitest-environment jsdom */

// Smoke tests for the EquipmentsTab component (Phase 2 — equipments lifecycle).
//
// Required devDeps (declared in artifacts/trs-app/package.json):
//   @testing-library/react, @testing-library/dom, jsdom
//
// The tests mock @workspace/api-client-react so no network or QueryClient is
// needed: each generated hook is replaced by a fixture-driven fake whose
// most-recent-call args we can assert against. Likewise, useQueryClient is
// stubbed to a no-op invalidateQueries.
//
// We deliberately render the real Radix-based Switch/Dialog primitives — they
// work under jsdom for the interactions we test (click + initial render).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

type Equipment = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  trsObjective: number;
  equipmentType?: string | null;
  roomId?: string | null;
  roomLabel?: string | null;
  isActive: boolean;
};

// ---------------------------------------------------------------------------
// Fixture state (mutable so each test can swap data / capture mutation handlers)
// ---------------------------------------------------------------------------
type MutationOptions = {
  mutation?: {
    onSuccess?: (...args: unknown[]) => void;
    onError?: (err: unknown) => void;
  };
};

type CapturedMutation = {
  mutate: ReturnType<typeof vi.fn>;
  mutateAsync: ReturnType<typeof vi.fn>;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  options: MutationOptions | undefined;
};

type ListSpyFn = (params?: { includeInactive?: boolean }) => void;

const state: {
  equipments: Equipment[];
  listSpy: ReturnType<typeof vi.fn<ListSpyFn>>;
  deleteCaptured: CapturedMutation | null;
  reactivateCaptured: CapturedMutation | null;
  createCaptured: CapturedMutation | null;
  updateCaptured: CapturedMutation | null;
} = {
  equipments: [],
  listSpy: vi.fn<ListSpyFn>(),
  deleteCaptured: null,
  reactivateCaptured: null,
  createCaptured: null,
  updateCaptured: null,
};

function makeMutation(opts: MutationOptions | undefined): CapturedMutation {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    isError: false,
    error: null,
    options: opts,
  };
}

vi.mock("@workspace/api-client-react", () => {
  return {
    useListEquipments: (params?: { includeInactive?: boolean }) => {
      state.listSpy(params);
      return { data: state.equipments };
    },
    useCreateEquipment: (opts?: MutationOptions) => {
      state.createCaptured = makeMutation(opts);
      return state.createCaptured;
    },
    useUpdateEquipment: (opts?: MutationOptions) => {
      state.updateCaptured = makeMutation(opts);
      return state.updateCaptured;
    },
    useDeleteEquipment: (opts?: MutationOptions) => {
      state.deleteCaptured = makeMutation(opts);
      return state.deleteCaptured;
    },
    useReactivateEquipment: (opts?: MutationOptions) => {
      state.reactivateCaptured = makeMutation(opts);
      return state.reactivateCaptured;
    },
    getListEquipmentsQueryKey: (params?: { includeInactive?: boolean }) =>
      ["/api/equipments", ...(params ? [params] : [])] as const,
    // ── Other hooks/keys touched by sibling tabs in admin.tsx (not used here
    // but imported at module top) ─────────────────────────────────────────
    useListUsers: () => ({ data: [] }),
    useCreateUser: () => makeMutation(undefined),
    useUpdateUser: () => makeMutation(undefined),
    useDeleteUser: () => makeMutation(undefined),
    useListProducts: () => ({ data: [] }),
    useCreateProduct: () => makeMutation(undefined),
    useUpdateProduct: () => makeMutation(undefined),
    useListCadences: () => ({ data: [] }),
    useUpsertCadence: () => makeMutation(undefined),
    useCreateCadence: () => makeMutation(undefined),
    useReactivateCadence: () => makeMutation(undefined),
    useDeleteCadence: () => makeMutation(undefined),
    useValidateCadence: () => makeMutation(undefined),
    useListProductPresentations: () => ({ data: [] }),
    useListDowntimeCategories: () => ({ data: [] }),
    useCreateDowntimeCategory: () => makeMutation(undefined),
    useUpdateDowntimeCategory: () => makeMutation(undefined),
    useListMonthlyClosures: () => ({ data: [] }),
    useCreateMonthlyClosure: () => makeMutation(undefined),
    getListUsersQueryKey: () => ["/api/users"] as const,
    getListProductsQueryKey: () => ["/api/products"] as const,
    getListCadencesQueryKey: () => ["/api/cadences"] as const,
    getListDowntimeCategoriesQueryKey: () => ["/api/downtime-categories"] as const,
    getListMonthlyClosuresQueryKey: () => ["/api/monthly-closures"] as const,
  };
});

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

// EquipmentsTab is exported from admin.tsx (see Phase 2 imports section).
import { EquipmentsTab } from "../admin";

beforeEach(() => {
  state.equipments = [];
  state.listSpy = vi.fn<ListSpyFn>();
  state.deleteCaptured = null;
  state.reactivateCaptured = null;
  state.createCaptured = null;
  state.updateCaptured = null;
});

describe("EquipmentsTab", () => {
  it("renders an Actif badge for an active row and Inactif for an inactive row", () => {
    state.equipments = [
      {
        id: "eq-active",
        name: "Press A",
        code: "P-A",
        trsObjective: 80,
        isActive: true,
      },
      {
        id: "eq-inactive",
        name: "Press B",
        code: "P-B",
        trsObjective: 70,
        isActive: false,
      },
    ];

    render(<EquipmentsTab />);

    expect(screen.getByText("Actif")).toBeTruthy();
    expect(screen.getByText("Inactif")).toBeTruthy();
  });

  it("toggling 'Afficher les inactifs' calls useListEquipments with the new params", () => {
    state.equipments = [
      { id: "eq-1", name: "Press A", code: "P-A", trsObjective: 80, isActive: true },
    ];

    render(<EquipmentsTab />);

    // Initial render: hook called with includeInactive=false
    const initialCall = state.listSpy.mock.calls[state.listSpy.mock.calls.length - 1];
    expect(initialCall[0]).toEqual({ includeInactive: false });

    // The Switch is the only role=switch element on the tab.
    const toggle = screen.getByRole("switch", { name: /afficher les inactifs/i });
    fireEvent.click(toggle);

    const latestCall = state.listSpy.mock.calls[state.listSpy.mock.calls.length - 1];
    expect(latestCall[0]).toEqual({ includeInactive: true });
  });

  it("clicking 'Réactiver' on an inactive row calls reactivateEquipment.mutate with { id }", () => {
    state.equipments = [
      {
        id: "eq-inactive",
        name: "Press B",
        code: "P-B",
        trsObjective: 70,
        isActive: false,
      },
    ];

    render(<EquipmentsTab />);

    const button = screen.getByRole("button", { name: /réactiver/i });
    fireEvent.click(button);

    expect(state.reactivateCaptured).not.toBeNull();
    expect(state.reactivateCaptured!.mutate).toHaveBeenCalledWith({ id: "eq-inactive" });
  });

  it("renders an inline 409 error message when deleteEquipment.onError fires", () => {
    state.equipments = [
      { id: "eq-1", name: "Press A", code: "P-A", trsObjective: 80, isActive: true },
    ];

    render(<EquipmentsTab />);

    expect(state.deleteCaptured).not.toBeNull();
    const onError = state.deleteCaptured!.options?.mutation?.onError;
    expect(typeof onError).toBe("function");

    const err = {
      response: { data: { error: "Cet équipement a 3 saisies de production liées." } },
    };
    act(() => {
      onError!(err);
    });

    expect(screen.getByText("Cet équipement a 3 saisies de production liées.")).toBeTruthy();
  });
});
