/* Onboarding Tour page — /repos/:repoId/tour. Thin route: all UI lives in
   _components/TourView. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { TourView } from "./_components/TourView";

export default function TourPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <TourView repoId={repoId} />;
}
