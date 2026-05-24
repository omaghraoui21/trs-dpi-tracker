import { useLocation } from "wouter";
import { LotListView } from "@/components/lots/LotListView";

// Unified entry point for "today's lots". The operator-facing UX (start a
// new cycle, resume a draft) lives at /entry which owns the session flow.
// /lots is the read-and-browse counterpart that any role can reach from
// the sidebar without entering the session orchestrator.
export default function LotsPage() {
  const [, navigate] = useLocation();
  return <LotListView onNew={() => navigate("/entry")} onResume={() => navigate("/entry")} />;
}
