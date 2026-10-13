import { ConfigureRunView } from "./_components/ConfigureRunView";

/* Route: /configure-run. Thin route entry — step 1 (repo → PR picker), step
   2 (agent multi-select with estimates), and the submit flow all live in
   the colocated ConfigureRunView. */
export default function ConfigureRunPage() {
  return <ConfigureRunView />;
}
