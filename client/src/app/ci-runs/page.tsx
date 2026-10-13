/* /ci-runs — the global CI Runs page (SPEC-05 AC-17). Thin route; the view is colocated. */
import { CiRunsTable } from "./_components/CiRunsTable";

export default function CiRunsPage() {
  return <CiRunsTable />;
}
