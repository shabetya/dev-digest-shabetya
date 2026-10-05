/* Project Context page — /repos/:repoId/context. Thin route: all UI lives in
   _components/ContextView. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ContextView } from "./_components/ContextView";

export default function ContextPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ContextView repoId={repoId} />;
}
