import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import blastMessages from "../../../../../../../../messages/en/blast.json";
import { BlastRadiusGraph } from "./BlastRadiusGraph";

afterEach(() => cleanup());

function renderGraph(downstream: DownstreamImpact[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: blastMessages }}>
      <BlastRadiusGraph downstream={downstream} />
    </NextIntlClientProvider>,
  );
}

describe("BlastRadiusGraph", () => {
  it("draws a node per changed symbol, caller, and affected endpoint/cron, plus a legend", () => {
    renderGraph([
      {
        symbol: "chargeCard",
        callers: [{ name: "handlePayment", file: "src/routes/payments.ts", line: 10 }],
        endpoints_affected: ["POST /payments"],
        crons_affected: ["retry-failed-charges"],
      },
    ]);

    const svg = screen.getByRole("img", { name: "Blast radius graph" });
    expect(svg).toBeInTheDocument();
    expect(screen.getByText("chargeCard")).toBeInTheDocument();
    expect(screen.getByText("handlePayment")).toBeInTheDocument();
    expect(screen.getByText("POST /payments")).toBeInTheDocument();
    expect(screen.getByText("retry-failed-charges")).toBeInTheDocument();

    // Legend renders its three labels.
    expect(screen.getByText("changed symbol")).toBeInTheDocument();
    expect(screen.getByText("callers")).toBeInTheDocument();
    expect(screen.getByText("endpoints affected")).toBeInTheDocument();
  });

  it("shows the empty state when every symbol has zero callers, drawing no svg", () => {
    renderGraph([{ symbol: "unusedHelper", callers: [], endpoints_affected: [], crons_affected: [] }]);

    expect(screen.getByText(/no downstream callers to graph/i)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).not.toBeInTheDocument();
  });
});
