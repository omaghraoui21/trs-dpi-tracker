/** @vitest-environment jsdom */

// Smoke tests for the ProductsTab component (Phase 3 — products lifecycle).
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

type Product = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  dosage?: string | null;
  pharmaceuticalForm?: string | null;
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
  products: Product[];
  listSpy: ReturnType<typeof vi.fn<ListSpyFn>>;
  deleteCaptured: CapturedMutation | null;
  reactivateCaptured: CapturedMutation | null;
  createCaptured: CapturedMutation | null;
  updateCaptured: CapturedMutation | null;
} = {
  products: [],
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
    useListProducts: (params?: { includeInactive?: boolean }) => {
      state.listSpy(params);
      return { data: state.products };
    },
    useCreateProduct: (opts?: MutationOptions) => {
      state.createCaptured = makeMutation(opts);
      return state.createCaptured;
    },
    useUpdateProduct: (opts?: MutationOptions) => {
      state.updateCaptured = makeMutation(opts);
      return state.updateCaptured;
    },
    useDeleteProduct: (opts?: MutationOptions) => {
      state.deleteCaptured = makeMutation(opts);
      return state.deleteCaptured;
    },
    useReactivateProduct: (opts?: MutationOptions) => {
      state.reactivateCaptured = makeMutation(opts);
      return state.reactivateCaptured;
    },
    getListProductsQueryKey: (params?: { includeInactive?: boolean }) =>
      ["/api/products", ...(params ? [params] : [])] as const,
    // ── Other hooks/keys touched by sibling tabs in admin.tsx (not used here
    // but imported at module top) ─────────────────────────────────────────
    useListUsers: () => ({ data: [] }),
    useCreateUser: () => makeMutation(undefined),
    useUpdateUser: () => makeMutation(undefined),
    useDeleteUser: () => makeMutation(undefined),
    useListEquipments: () => ({ data: [] }),
    useCreateEquipment: () => makeMutation(undefined),
    useUpdateEquipment: () => makeMutation(undefined),
    useDeleteEquipment: () => makeMutation(undefined),
    useReactivateEquipment: () => makeMutation(undefined),
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
    getListEquipmentsQueryKey: () => ["/api/equipments"] as const,
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

// ProductsTab is exported from admin.tsx (Phase 3 imports section).
import { ProductsTab } from "../admin";

beforeEach(() => {
  state.products = [];
  state.listSpy = vi.fn<ListSpyFn>();
  state.deleteCaptured = null;
  state.reactivateCaptured = null;
  state.createCaptured = null;
  state.updateCaptured = null;
});

describe("ProductsTab", () => {
  it("renders an Actif badge for an active row and Inactif for an inactive row", () => {
    state.products = [
      {
        id: "prod-active",
        name: "Doliprane",
        code: "DOL",
        isActive: true,
      },
      {
        id: "prod-inactive",
        name: "Aspirine",
        code: "ASP",
        isActive: false,
      },
    ];

    render(<ProductsTab />);

    expect(screen.getByText("Actif")).toBeTruthy();
    expect(screen.getByText("Inactif")).toBeTruthy();
  });

  it("toggling 'Afficher les inactifs' calls useListProducts with the new params", () => {
    state.products = [{ id: "prod-1", name: "Doliprane", code: "DOL", isActive: true }];

    render(<ProductsTab />);

    // Initial render: hook called with includeInactive=false
    const initialCall = state.listSpy.mock.calls[state.listSpy.mock.calls.length - 1];
    expect(initialCall[0]).toEqual({ includeInactive: false });

    // The Switch is the only role=switch element on the tab.
    const toggle = screen.getByRole("switch", { name: /afficher les inactifs/i });
    fireEvent.click(toggle);

    const latestCall = state.listSpy.mock.calls[state.listSpy.mock.calls.length - 1];
    expect(latestCall[0]).toEqual({ includeInactive: true });
  });

  it("clicking 'Réactiver' on an inactive row calls reactivateProduct.mutate with { id }", () => {
    state.products = [
      {
        id: "prod-inactive",
        name: "Aspirine",
        code: "ASP",
        isActive: false,
      },
    ];

    render(<ProductsTab />);

    const button = screen.getByRole("button", { name: /réactiver/i });
    fireEvent.click(button);

    expect(state.reactivateCaptured).not.toBeNull();
    expect(state.reactivateCaptured!.mutate).toHaveBeenCalledWith({ id: "prod-inactive" });
  });

  it("renders an inline 409 error message when deleteProduct.onError fires", () => {
    state.products = [{ id: "prod-1", name: "Doliprane", code: "DOL", isActive: true }];

    render(<ProductsTab />);

    expect(state.deleteCaptured).not.toBeNull();
    const onError = state.deleteCaptured!.options?.mutation?.onError;
    expect(typeof onError).toBe("function");

    const err = {
      response: { data: { error: "Ce produit a 3 saisies de production liées." } },
    };
    act(() => {
      onError!(err);
    });

    expect(screen.getByText("Ce produit a 3 saisies de production liées.")).toBeTruthy();
  });

  it("clears actionError when the create/edit dialog is closed after a save failure", async () => {
    state.products = [];

    render(<ProductsTab />);

    // Open the create dialog. This triggers a re-render that rebinds
    // state.createCaptured to the freshly-returned mutation object — the
    // reference the component closure now holds.
    const newButton = screen.getByRole("button", { name: /nouveau produit/i });
    fireEvent.click(newButton);

    expect(state.createCaptured).not.toBeNull();
    // Force the create mutation's mutateAsync to reject with a 409-shaped
    // error so handleSave's try/catch populates actionError. Mutating the
    // captured object in place is safe because the component holds a
    // reference to it (admin.tsx: `const createProduct = useCreateProduct()`).
    const err = {
      response: { data: { error: "Le code 'P-001' est déjà utilisé." } },
    };
    state.createCaptured!.mutateAsync = vi.fn().mockRejectedValueOnce(err);

    // Trigger handleSave by clicking Enregistrer; await the async catch.
    const saveButton = screen.getByRole("button", { name: /enregistrer/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    // The error text appears (it is rendered both inside the dialog and in
    // the table-level actionError slot above the table — getAllByText covers
    // both).
    expect(screen.getAllByText("Le code 'P-001' est déjà utilisé.").length).toBeGreaterThan(0);

    // Close the dialog via the Annuler button. Before the fix, this left the
    // error visible in the table-level slot; after the fix, actionError is
    // cleared on close.
    const cancelButton = screen.getByRole("button", { name: /annuler/i });
    fireEvent.click(cancelButton);

    expect(screen.queryByText("Le code 'P-001' est déjà utilisé.")).toBeNull();
  });
});
