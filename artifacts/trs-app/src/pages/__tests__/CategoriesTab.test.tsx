/** @vitest-environment jsdom */

// Smoke tests for the CategoriesTab component (Phase 4 — downtime categories
// lifecycle).
//
// Required devDeps (declared in artifacts/trs-app/package.json):
//   @testing-library/react, @testing-library/dom, jsdom
//
// The tests mock @workspace/api-client-react so no network or QueryClient is
// needed: each generated hook is replaced by a fixture-driven fake whose
// most-recent-call args we can assert against. Likewise, useQueryClient is
// stubbed to a no-op invalidateQueries.
//
// Round-trip persistence test (case 5) takes the EDIT-MODE FALLBACK path
// documented in FEAT-002 step 5: rather than fight Radix Select rendering
// under jsdom (the SelectContent portals into the body and the SelectItem
// click handlers are awkward to drive without a full pointer-event polyfill),
// we open the dialog in EDIT mode against a fixture that already has
// { isQuickShortcut: true, shortcutEquipments: "A27", impactKpi: "TRS" }
// populated. We then assert the Switch is checked, the Input shows "A27",
// and the Select trigger displays "TRS" — proving the round-trip wiring
// from list -> openEdit -> form state -> rendered controls. The same case
// then clicks Enregistrer and asserts updateCat.mutateAsync received the
// fully-shaped { id, data: { ... } } payload, proving the write path end
// to end. Case 6 mirrors that with a null-impactKpi fixture to lock the
// `form.impactKpi || null` empty-string-to-null normalization in handleSave.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

type Category = {
  id: string;
  code: string;
  label: string;
  description?: string | null;
  famille?: string | null;
  impactType: "tO" | "tR" | "tF" | "tN" | "tU" | "TQ";
  impactKpi?: string | null;
  isPlanned: boolean;
  requiresComment: boolean;
  isActive: boolean;
  isQuickShortcut?: boolean;
  shortcutEquipments?: string | null;
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
  categories: Category[];
  listSpy: ReturnType<typeof vi.fn<ListSpyFn>>;
  deleteCaptured: CapturedMutation | null;
  reactivateCaptured: CapturedMutation | null;
  createCaptured: CapturedMutation | null;
  updateCaptured: CapturedMutation | null;
} = {
  categories: [],
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
    useListDowntimeCategories: (params?: { includeInactive?: boolean }) => {
      state.listSpy(params);
      return { data: state.categories };
    },
    useCreateDowntimeCategory: (opts?: MutationOptions) => {
      state.createCaptured = makeMutation(opts);
      return state.createCaptured;
    },
    useUpdateDowntimeCategory: (opts?: MutationOptions) => {
      state.updateCaptured = makeMutation(opts);
      return state.updateCaptured;
    },
    useDeleteDowntimeCategory: (opts?: MutationOptions) => {
      state.deleteCaptured = makeMutation(opts);
      return state.deleteCaptured;
    },
    useReactivateDowntimeCategory: (opts?: MutationOptions) => {
      state.reactivateCaptured = makeMutation(opts);
      return state.reactivateCaptured;
    },
    getListDowntimeCategoriesQueryKey: (params?: { includeInactive?: boolean }) =>
      ["/api/downtime-categories", ...(params ? [params] : [])] as const,
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
    useListProducts: () => ({ data: [] }),
    useCreateProduct: () => makeMutation(undefined),
    useUpdateProduct: () => makeMutation(undefined),
    useDeleteProduct: () => makeMutation(undefined),
    useReactivateProduct: () => makeMutation(undefined),
    useListCadences: () => ({ data: [] }),
    useUpsertCadence: () => makeMutation(undefined),
    useListMonthlyClosures: () => ({ data: [] }),
    useCreateMonthlyClosure: () => makeMutation(undefined),
    getListUsersQueryKey: () => ["/api/users"] as const,
    getListEquipmentsQueryKey: () => ["/api/equipments"] as const,
    getListProductsQueryKey: () => ["/api/products"] as const,
    getListCadencesQueryKey: () => ["/api/cadences"] as const,
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

// CategoriesTab is exported from admin.tsx (Phase 4 imports section).
import { CategoriesTab } from "../admin";

beforeEach(() => {
  state.categories = [];
  state.listSpy = vi.fn<ListSpyFn>();
  state.deleteCaptured = null;
  state.reactivateCaptured = null;
  state.createCaptured = null;
  state.updateCaptured = null;
});

describe("CategoriesTab", () => {
  it("renders an Actif badge for an active row and Inactif for an inactive row", () => {
    state.categories = [
      {
        id: "cat-active",
        code: "PANNE",
        label: "Panne machine",
        impactType: "tF",
        isPlanned: false,
        requiresComment: false,
        isActive: true,
      },
      {
        id: "cat-inactive",
        code: "OBSOLETE",
        label: "Catégorie obsolète",
        impactType: "tF",
        isPlanned: false,
        requiresComment: false,
        isActive: false,
      },
    ];

    render(<CategoriesTab />);

    expect(screen.getByText("Actif")).toBeTruthy();
    expect(screen.getByText("Inactif")).toBeTruthy();
  });

  it("toggling 'Afficher les inactifs' calls useListDowntimeCategories with the new params", () => {
    state.categories = [
      {
        id: "cat-1",
        code: "PANNE",
        label: "Panne machine",
        impactType: "tF",
        isPlanned: false,
        requiresComment: false,
        isActive: true,
      },
    ];

    render(<CategoriesTab />);

    // Initial render: hook called with includeInactive=false
    const initialCall = state.listSpy.mock.calls[state.listSpy.mock.calls.length - 1];
    expect(initialCall[0]).toEqual({ includeInactive: false });

    // The Switch is the only role=switch element on the tab.
    const toggle = screen.getByRole("switch", { name: /afficher les inactifs/i });
    fireEvent.click(toggle);

    const latestCall = state.listSpy.mock.calls[state.listSpy.mock.calls.length - 1];
    expect(latestCall[0]).toEqual({ includeInactive: true });
  });

  it("clicking 'Réactiver' on an inactive row calls reactivateCat.mutate with { id }", () => {
    state.categories = [
      {
        id: "cat-inactive",
        code: "OBSOLETE",
        label: "Catégorie obsolète",
        impactType: "tF",
        isPlanned: false,
        requiresComment: false,
        isActive: false,
      },
    ];

    render(<CategoriesTab />);

    const button = screen.getByRole("button", { name: /réactiver/i });
    fireEvent.click(button);

    expect(state.reactivateCaptured).not.toBeNull();
    expect(state.reactivateCaptured!.mutate).toHaveBeenCalledWith({ id: "cat-inactive" });
  });

  it("renders an inline 409 error message when deleteCat.onError fires", () => {
    state.categories = [
      {
        id: "cat-1",
        code: "PANNE",
        label: "Panne machine",
        impactType: "tF",
        isPlanned: false,
        requiresComment: false,
        isActive: true,
      },
    ];

    render(<CategoriesTab />);

    expect(state.deleteCaptured).not.toBeNull();
    const onError = state.deleteCaptured!.options?.mutation?.onError;
    expect(typeof onError).toBe("function");

    const err = {
      response: { data: { error: "Cette catégorie a 4 événements d'arrêt liés." } },
    };
    act(() => {
      onError!(err);
    });

    expect(screen.getByText("Cette catégorie a 4 événements d'arrêt liés.")).toBeTruthy();
  });

  it("round-trips isQuickShortcut + shortcutEquipments + impactKpi in EDIT mode", async () => {
    // FALLBACK path (see file docstring): driving the Radix Select via
    // fireEvent under jsdom is fragile, so we pre-populate the fixture and
    // open the dialog in EDIT mode. This proves the openEdit -> form state ->
    // rendered controls round-trip — the same wiring that backs the create
    // flow's mutateAsync payload.
    state.categories = [
      {
        id: "cat-1",
        code: "PANNE",
        label: "Panne machine",
        impactType: "tF",
        impactKpi: "TRS",
        isPlanned: false,
        requiresComment: false,
        isActive: true,
        isQuickShortcut: true,
        shortcutEquipments: "A27",
      },
    ];

    render(<CategoriesTab />);

    // The Edit button now exposes an accessible name via `title="Modifier"`,
    // so we no longer have to query the lucide-react SVG class.
    const editButton = screen.getByRole("button", { name: /modifier/i });
    fireEvent.click(editButton);

    // Switch should be checked (Radix Switch maps `checked` -> aria-checked).
    const switches = screen.getAllByRole("switch");
    const quickShortcutSwitch = switches.find((s) =>
      s.closest("div")?.textContent?.includes("Raccourci rapide opérateur"),
    );
    expect(quickShortcutSwitch).toBeDefined();
    expect(quickShortcutSwitch!.getAttribute("aria-checked")).toBe("true");

    // shortcutEquipments Input shows "A27".
    const shortcutInput = screen.getByPlaceholderText(/A27, A28/);
    expect((shortcutInput as HTMLInputElement).value).toBe("A27");

    // KPI Select trigger renders the value "TRS".
    // Radix Select renders the SelectValue inside the trigger button.
    const kpiTrigger = screen
      .getAllByRole("combobox")
      .find((el) => el.textContent?.includes("TRS"));
    expect(kpiTrigger).toBeDefined();

    // Write path: clicking Enregistrer must ship the form payload to
    // updateCat.mutateAsync. This proves handleSave constructs
    // { id, data: { impactKpi, isQuickShortcut, shortcutEquipments, ... } }
    // correctly when the form was populated from openEdit. The expression
    // `form.impactKpi || null` evaluates to the literal "TRS" here (truthy
    // string survives the `||`), not null. See case 6 below for the
    // null-normalization branch.
    //
    // Note: the mock factory rebinds `state.updateCaptured` on every render,
    // so we capture the reference held by the component closure BEFORE
    // clicking save, then assert against that captured object.
    const captured = state.updateCaptured!;
    const saveButton = screen.getByRole("button", { name: /enregistrer/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(captured.mutateAsync).toHaveBeenCalledTimes(1);
    expect(captured.mutateAsync.mock.calls[0][0]).toEqual({
      id: "cat-1",
      data: expect.objectContaining({
        impactKpi: "TRS",
        isQuickShortcut: true,
        shortcutEquipments: "A27",
      }),
    });
  });

  it("normalizes empty impactKpi to null when saving an EDIT against a fixture without impactKpi", async () => {
    // Companion case to the round-trip above: when the source row has
    // impactKpi: null, openEdit seeds form.impactKpi to "" (empty string),
    // and handleSave's `form.impactKpi || null` MUST collapse that empty
    // string to a literal `null` on the wire (not undefined, not "").
    state.categories = [
      {
        id: "cat-1",
        code: "PANNE",
        label: "Panne machine",
        impactType: "tF",
        impactKpi: null,
        isPlanned: false,
        requiresComment: false,
        isActive: true,
        isQuickShortcut: false,
        shortcutEquipments: null,
      },
    ];

    render(<CategoriesTab />);

    const editButton = screen.getByRole("button", { name: /modifier/i });
    fireEvent.click(editButton);

    const captured = state.updateCaptured!;
    const saveButton = screen.getByRole("button", { name: /enregistrer/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(captured.mutateAsync).toHaveBeenCalledTimes(1);
    expect(captured.mutateAsync.mock.calls[0][0]).toEqual({
      id: "cat-1",
      data: expect.objectContaining({
        impactKpi: null,
        isQuickShortcut: false,
        shortcutEquipments: null,
      }),
    });
  });
});
