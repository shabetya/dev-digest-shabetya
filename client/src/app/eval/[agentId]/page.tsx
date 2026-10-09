/* /eval/[agentId] — per-agent eval dashboard. Thin route; the view is colocated. */
"use client";

import { useParams } from "next/navigation";
import { AgentEvalView } from "./_components/AgentEvalView";

export default function AgentEvalPage() {
  const { agentId } = useParams<{ agentId: string }>();
  return <AgentEvalView agentId={agentId} />;
}
