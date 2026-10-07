/* /eval — Eval Dashboard (all agents). Thin route; the view is colocated. */
import { EvalDashboardView } from "./_components/EvalDashboardView";

export default function EvalPage() {
  return <EvalDashboardView />;
}
