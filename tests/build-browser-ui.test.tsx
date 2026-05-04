import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import generatedDataset from "../src/data/tft-set17.json";
import { CompListPane } from "../src/components/CompListPane";
import { datasetSchema } from "../shared/tft";

const dataset = datasetSchema.parse(generatedDataset);

describe("build browser UI cleanup", () => {
  it("does not expose provider evidence counts in selection rows", () => {
    const comp = dataset.comps.find((candidate) => candidate.sources[0]?.evidence.length > 0);

    expect(comp).toBeDefined();
    if (!comp) {
      return;
    }

    render(
      <CompListPane
        comps={[comp]}
        dataset={dataset}
        phaseFilter="all"
        onQuickFilter={vi.fn()}
        selectionOnly
      />
    );

    expect(screen.queryByText(/\bevidence\b/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bsignals?\b/i)).not.toBeInTheDocument();
  });
});
