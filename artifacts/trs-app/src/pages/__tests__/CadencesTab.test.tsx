/** @vitest-environment jsdom */

/**
 * Smoke tests for the CadencesTab component (Phase 5 - cadences triplet).
 *
 * Required devDeps (declared in artifacts/trs-app/package.json):
 *   @testing-library/react, @testing-library/dom, jsdom
 *
 * The tests mock @workspace/api-client-react so no network or QueryClient is
 * needed: each generated hook is replaced by a fixture-driven fake.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ─── Fixture state ───────────────────────────────────────────────────────────

type Cadence = {
  id: string;
  productId: string;
  equipmentId: string;
  presentationId?: string | null;
  productName?: string | null;
  equipmentName?: string | null;
  presentationName?: string | null;
  theoreticalCadence: number;
  validatedCadence: number;
  unit: string;
  isActive: boolean;
  validatedAt?: string | null;
  validatedBy?: string | null;
  notes?: string | null;
};

type MutationOptions = {
  mutation?: {
    onSuccess?: (...args: unknown[]) => void;
    onError?: (err: unknown) => void;
  };
};

function makeMutation(opts?: MutationOptions) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    isError: false,
    error: null,
    options: opts,
  };
}

const state: {
  cadences: Cadence[];
  products: Array<{ id: string; name: string }>;
  equipments: Array<{ id: string; name: string }>;
  presentations: Array<{ id: string; presentationName: string }>;
} = {
  cadences: [],
  products: [],
  equipments: [],
  presentations: [],
};

vi.mock("@workspace/api-client-react", () => ({
  useListCadences: () => ({ data: state.cadences }),
  useListProducts: () => ({ data: state.products }),
  useListEquipments: () => ({ data: state.equipments }),
  useListProductPresentations: () => ({ data: state.presentations }),
  useCreateCadence: () => makeMutation(),
  useReactivateCadence: () => makeMutation(),
  useDeleteCadence: () => makeMutation(),
  useValidateCadence: () => makeMutation(),
  getListCadencesQueryKey: () => ["/api/cadences"] as const,
  getListProductPresentationsQueryKey: () => ["/api/product-presentations"] as const,
  // ── Other hooks/keys used by sibling tabs in admin.tsx ──────────────────
  useListUsers: () => ({ data: [] }),
  useCreateUser: () => makeMutation(),
  useUpdateUser: () => makeMutation(),
  useDeleteUser: () => makeMutation(),
  useListDowntimeCategories: () => ({ data: [] }),
  useCreateDowntimeCategory: () => makeMutation(),
  useUpdateDowntimeCategory: () => makeMutation(),
  useDeleteDowntimeCategory: () => makeMutation(),
  useReactivateDowntimeCategory: () => makeMutation(),
  useCreateEquipment: () => makeMutation(),
  useUpdateEquipment: () => makeMutation(),
  useDeleteEquipment: () => makeMutation(),
  useReactivateEquipment: () => makeMutation(),
  useCreateProduct: () => makeMutation(),
  useUpdateProduct: () => makeMutation(),
  useDeleteProduct: () => makeMutation(),
  useReactivateProduct: () => makeMutation(),
  useUpsertCadence: () => makeMutation(),
  useListMonthlyClosures: () => ({ data: [] }),
  useCreateMonthlyClosure: () => makeMutation(),
  getListUsersQueryKey: () => ["/api/users"] as const,
  getListEquipmentsQueryKey: () => ["/api/equipments"] as const,
  getListProductsQueryKey: () => ["/api/products"] as const,
  getListDowntimeCategoriesQueryKey: () => ["/api/downtime-categories"] as const,
  getListMonthlyClosuresQueryKey: () => ["/api/monthly-closures"] as const,
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

import { CadencesTab } from "../admin";

beforeEach(() => {
  state.cadences = [];
  state.products = [];
  state.equipments = [];
  state.presentations = [];
});

describe("CadencesTab smoke tests", () => {
  it("renders table headers including Presentation column", () => {
    state.cadences = [];
    render(<CadencesTab />);

    expect(screen.getByText("Produit")).toBeTruthy();
    expect(screen.getByText("Equipement")).toBeTruthy();
    expect(screen.getByText("Presentation")).toBeTruthy();
    expect(screen.getByText("Cadence theorique")).toBeTruthy();
    expect(screen.getByText("Cadence validee")).toBeTruthy();
    expect(screen.getByText("Actions")).toBeTruthy();
  });

  it("displays active badge for active cadences", () => {
    state.cadences = [
      {
        id: "cad-1",
        productId: "p1",
        equipmentId: "e1",
        presentationId: "pres-1",
        productName: "Produit A",
        equipmentName: "Machine 1",
        presentationName: "Boite 30",
        theoreticalCadence: 1000,
        validatedCadence: 950,
        unit: "units/hour",
        isActive: true,
        validatedAt: "2025-01-15T10:00:00Z",
        validatedBy: "user-1",
      },
    ];
    render(<CadencesTab />);

    expect(screen.getByText("Actif")).toBeTruthy();
  });

  it("displays inactive badge for inactive cadences", () => {
    state.cadences = [
      {
        id: "cad-2",
        productId: "p1",
        equipmentId: "e2",
        presentationId: "pres-2",
        productName: "Produit A",
        equipmentName: "Machine 2",
        presentationName: "Blister 10",
        theoreticalCadence: 800,
        validatedCadence: 750,
        unit: "units/hour",
        isActive: false,
        validatedAt: null,
        validatedBy: null,
      },
    ];
    render(<CadencesTab />);

    expect(screen.getByText("Inactif")).toBeTruthy();
  });

  it("shows validated timestamp when present", () => {
    state.cadences = [
      {
        id: "cad-1",
        productId: "p1",
        equipmentId: "e1",
        presentationId: "pres-1",
        productName: "Produit A",
        equipmentName: "Machine 1",
        presentationName: "Boite 30",
        theoreticalCadence: 1000,
        validatedCadence: 950,
        unit: "units/hour",
        isActive: true,
        validatedAt: "2025-01-15T10:00:00Z",
        validatedBy: "user-1",
      },
    ];
    render(<CadencesTab />);

    // The date is rendered as fr-FR locale (15/01/2025)
    expect(screen.getByText("15/01/2025")).toBeTruthy();
  });

  it("renders 'Nouvelle cadence' button", () => {
    render(<CadencesTab />);

    const button = screen.getByRole("button", { name: /nouvelle cadence/i });
    expect(button).toBeTruthy();
  });
});
