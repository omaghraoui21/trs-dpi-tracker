import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { toast } from "@/hooks/use-toast";
import NotFound from "@/pages/not-found";

// Route-level code splitting — each page chunk is loaded on first visit only
const LoginPage     = lazy(() => import("@/pages/login"));
const EntryPage     = lazy(() => import("@/pages/entry"));
const SupervisorPage = lazy(() => import("@/pages/supervisor"));
const AnalysisPage  = lazy(() => import("@/pages/analysis"));
const AdminPage     = lazy(() => import("@/pages/admin"));
const PlanningPage  = lazy(() => import("@/pages/planning"));
const ProductionPage = lazy(() => import("@/pages/production"));
const CalendarPage       = lazy(() => import("@/pages/calendar"));
const DailyEntriesPage   = lazy(() => import("@/pages/daily-entries"));

// ─── Global React Query error handler ────────────────────────────────────────
function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Une erreur inattendue est survenue";
}

function shouldShowToast(err: unknown): boolean {
  const msg = extractMessage(err);
  // 401 is handled by AuthContext (redirect to login) — don't double-toast
  if (msg.includes("401") || msg.toLowerCase().includes("unauthorized")) return false;
  // 404 errors are handled inline by each component
  if (msg.includes("404")) return false;
  return true;
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err) => {
      if (!shouldShowToast(err)) return;
      toast({
        title: "Erreur de chargement",
        description: extractMessage(err),
        variant: "destructive",
      });
    },
  }),
  mutationCache: new MutationCache({
    // Mutations show their own inline errors — only surface truly unexpected ones
    onError: (err) => {
      if (!shouldShowToast(err)) return;
      // Only fire for 500-class errors; 4xx are handled inline by each form
      const msg = extractMessage(err);
      if (msg.includes("500") || msg.toLowerCase().includes("internal server")) {
        toast({
          title: "Erreur serveur",
          description: "Une erreur interne est survenue. Veuillez réessayer.",
          variant: "destructive",
        });
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ─── Spinner de chargement de page ───────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
    </div>
  );
}

function RootRedirect() {
  const { user } = useAuth();
  if (!user) return <Redirect to="/login" />;
  switch (user.role) {
    case "operator":   return <Redirect to="/entry" />;
    case "supervisor": return <Redirect to="/supervisor" />;
    case "admin":      return <Redirect to="/admin" />;
    default:           return <Redirect to="/login" />;
  }
}

function Router() {
  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/login" component={LoginPage} />

          <Route path="/">
            <ProtectedRoute><RootRedirect /></ProtectedRoute>
          </Route>

          <Route path="/entry">
            <ProtectedRoute allowedRoles={["operator", "supervisor", "admin"]}>
              <ErrorBoundary><EntryPage /></ErrorBoundary>
            </ProtectedRoute>
          </Route>

          <Route path="/supervisor">
            <ProtectedRoute allowedRoles={["supervisor", "admin"]}>
              <ErrorBoundary><SupervisorPage /></ErrorBoundary>
            </ProtectedRoute>
          </Route>

          <Route path="/analysis">
            <ProtectedRoute allowedRoles={["supervisor", "admin"]}>
              <ErrorBoundary><AnalysisPage /></ErrorBoundary>
            </ProtectedRoute>
          </Route>

          <Route path="/admin">
            <ProtectedRoute allowedRoles={["admin"]}>
              <ErrorBoundary><AdminPage /></ErrorBoundary>
            </ProtectedRoute>
          </Route>

          <Route path="/planning">
            <ProtectedRoute allowedRoles={["supervisor", "admin"]}>
              <ErrorBoundary><PlanningPage /></ErrorBoundary>
            </ProtectedRoute>
          </Route>

          <Route path="/production">
            <ProtectedRoute allowedRoles={["supervisor", "admin"]}>
              <ErrorBoundary><ProductionPage /></ErrorBoundary>
            </ProtectedRoute>
          </Route>

          <Route path="/calendar">
            <ProtectedRoute allowedRoles={["supervisor", "admin"]}>
              <ErrorBoundary><CalendarPage /></ErrorBoundary>
            </ProtectedRoute>
          </Route>

          <Route path="/daily-entries">
            <ProtectedRoute allowedRoles={["supervisor", "admin"]}>
              <ErrorBoundary><DailyEntriesPage /></ErrorBoundary>
            </ProtectedRoute>
          </Route>

          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <ErrorBoundary>
              <Router />
            </ErrorBoundary>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
