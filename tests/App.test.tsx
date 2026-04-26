import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import generatedDataset from "../src/data/tft-set17.json";
import { COMPONENT_RECIPES } from "../shared/normalization";
import { datasetSchema } from "../shared/tft";

const dataset = datasetSchema.parse(generatedDataset);

function getCompRow(title: string) {
  return screen.getByRole("heading", { name: title }).closest("article");
}

async function ensureExpanded(user: ReturnType<typeof userEvent.setup>, title: string) {
  const initialRow = await waitFor(() => {
    const result = getCompRow(title);
    expect(result).toBeTruthy();
    return result as HTMLElement;
  });

  const toggle = within(initialRow).getByRole("button", { name: `Toggle comp ${title}` });
  if (toggle.getAttribute("aria-expanded") !== "true") {
    await user.click(toggle);
  }

  return waitFor(() => {
    const row = getCompRow(title);
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByRole("button", { name: `Show overview for ${title}` })).toBeInTheDocument();
    return row as HTMLElement;
  });
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(dataset), { status: 200 }))
    );
  });

  it("filters the comp list by query", async () => {
    const user = userEvent.setup();
    const [firstComp, secondComp] = dataset.comps;

    render(<App />);

    const input = await screen.findByLabelText(/Quick search/i);
    expect(await screen.findByRole("button", { name: `Toggle comp ${firstComp.title}` })).toBeInTheDocument();

    await user.type(input, firstComp.title);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Toggle comp ${firstComp.title}` })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: `Toggle comp ${secondComp.title}` })).not.toBeInTheDocument();
    });
  });

  it("filters the comp list from a recommended augment action", async () => {
    const user = userEvent.setup();
    const compWithAugment = dataset.comps.find((comp) =>
      comp.recommendedAugmentIds.some((augmentId) => {
        const matches = dataset.comps.filter((candidate) => candidate.recommendedAugmentIds.includes(augmentId));
        return matches.length > 0 && matches.length < dataset.comps.length;
      })
    );

    expect(compWithAugment).toBeDefined();
    if (!compWithAugment) {
      return;
    }

    const augmentId = compWithAugment.recommendedAugmentIds.find((candidateAugmentId) => {
      const matches = dataset.comps.filter((candidate) => candidate.recommendedAugmentIds.includes(candidateAugmentId));
      return matches.length > 0 && matches.length < dataset.comps.length;
    });

    expect(augmentId).toBeDefined();
    if (!augmentId) {
      return;
    }

    const augment = dataset.augmentsById[augmentId];
    const compWithoutAugment = dataset.comps.find((comp) => !comp.recommendedAugmentIds.includes(augmentId));

    expect(augment).toBeDefined();
    expect(compWithoutAugment).toBeDefined();
    if (!augment || !compWithoutAugment) {
      return;
    }

    render(<App />);

    const row = await ensureExpanded(user, compWithAugment.title);
    fireEvent.contextMenu(within(row).getByRole("button", { name: `Inspect augment ${augment.name}` }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Toggle comp ${compWithAugment.title}` })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: `Toggle comp ${compWithoutAugment.title}` })).not.toBeInTheDocument();
    });
  });

  it("supports multiple expanded rows with row-local inspector state", async () => {
    const user = userEvent.setup();
    const [firstComp, secondComp] = dataset.comps;
    const firstChampion = dataset.championsById[firstComp.phases.early.championIds[0]];
    const secondChampion = dataset.championsById[secondComp.phases.early.championIds[0]];

    render(<App />);

    let firstRow = await ensureExpanded(user, firstComp.title);
    let secondRow = await ensureExpanded(user, secondComp.title);

    firstRow = (await waitFor(() => getCompRow(firstComp.title) as HTMLElement))!;
    secondRow = (await waitFor(() => getCompRow(secondComp.title) as HTMLElement))!;

    expect(within(firstRow).getByRole("button", { name: `Show overview for ${firstComp.title}` })).toBeInTheDocument();
    expect(within(secondRow).getByRole("button", { name: `Show overview for ${secondComp.title}` })).toBeInTheDocument();

    await user.click(within(firstRow).getByRole("button", { name: `Show early board for ${firstComp.title}` }));
    const firstChampionButton = within(firstRow).getAllByRole("button", { name: `Inspect champion ${firstChampion.name}` })[0];
    await user.click(firstChampionButton);

    await waitFor(() => {
      const updatedFirstRow = getCompRow(firstComp.title) as HTMLElement;
      expect(within(updatedFirstRow).getByTestId("inspector-title")).toHaveTextContent(firstChampion.name);
      expect(within(updatedFirstRow).getByText("Pinned")).toBeInTheDocument();
    });

    await user.click(within(secondRow).getByRole("button", { name: `Show early board for ${secondComp.title}` }));
    await user.hover(within(secondRow).getAllByRole("button", { name: `Inspect champion ${secondChampion.name}` })[0]);

    await waitFor(() => {
      const updatedSecondRow = getCompRow(secondComp.title) as HTMLElement;
      expect(within(updatedSecondRow).getByTestId("inspector-title")).toHaveTextContent(secondChampion.name);
    });

    await waitFor(() => {
      const updatedFirstRow = getCompRow(firstComp.title) as HTMLElement;
      expect(within(updatedFirstRow).getByTestId("inspector-title")).toHaveTextContent(firstChampion.name);
    });
  });

  it("shows overview guide content and phase-specific plan notes inside expanded rows", async () => {
    const user = userEvent.setup();
    const guidedComp = dataset.comps.find(
      (comp) => comp.guide.overview.length > 0 && comp.guide.phases.early.length > 0
    );

    expect(guidedComp).toBeDefined();
    if (!guidedComp) {
      return;
    }

    render(<App />);

    const row = await ensureExpanded(user, guidedComp.title);

    const overviewButton = within(row).getByRole("button", { name: `Show overview for ${guidedComp.title}` });
    expect(overviewButton).toHaveClass("active");
    expect(within(row).getByText(guidedComp.guide.overview[0].title)).toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: `Show early board for ${guidedComp.title}` }));

    expect(within(row).getByText(guidedComp.guide.phases.early[0].title)).toBeInTheDocument();
  });

  it("surfaces build rank, playstyle, recommended items, and item recipes", async () => {
    const user = userEvent.setup();
    const comp = dataset.comps.find((candidate) => {
      const hasRank = candidate.sources.some((source) => source.tier);
      const hasStyle = candidate.guide.overview
        .find((section) => section.title === "How to play")
        ?.lines.some((line) => line.startsWith("Style: "));
      const hasRecipeItem = candidate.phases.late.boardSlots.some((slot) =>
        slot.itemIds.some((itemId) => COMPONENT_RECIPES[itemId] || COMPONENT_RECIPES[itemId.replace(/-s-/g, "s-").replace(/-s$/g, "s")] || COMPONENT_RECIPES[itemId.replace(/-/g, "")])
      );
      return hasRank && hasStyle && hasRecipeItem;
    });

    expect(comp).toBeDefined();
    if (!comp) {
      return;
    }

    const rankedSource = comp.sources.find((source) => source.tier);
    const style = comp.guide.overview
      .find((section) => section.title === "How to play")
      ?.lines.find((line) => line.startsWith("Style: "))
      ?.replace(/^Style:\s*/i, "");
    const itemSlot = comp.phases.late.boardSlots.find((slot) =>
      slot.championId && slot.itemIds.some((itemId) => COMPONENT_RECIPES[itemId] || COMPONENT_RECIPES[itemId.replace(/-s-/g, "s-").replace(/-s$/g, "s")] || COMPONENT_RECIPES[itemId.replace(/-/g, "")])
    );

    expect(rankedSource).toBeDefined();
    expect(style).toBeDefined();
    expect(itemSlot).toBeDefined();
    if (!rankedSource || !style || !itemSlot?.championId) {
      return;
    }

    const champion = dataset.championsById[itemSlot.championId];
    const item = dataset.itemsById[itemSlot.itemIds[0]];

    render(<App />);

    const row = await ensureExpanded(user, comp.title);

    expect(within(row).getAllByLabelText(`Build rank ${rankedSource.name} ${rankedSource.tier}`)[0]).toBeInTheDocument();
    expect(within(row).getAllByText(style)[0]).toBeInTheDocument();

    await user.hover(within(row).getAllByRole("button", { name: `Inspect champion ${champion.name}` })[0]);
    expect(await within(row).findByText("Recommended items")).toBeInTheDocument();
    expect(within(row).getByText(item.name)).toBeInTheDocument();

    await user.hover(within(row).getAllByRole("button", { name: `Inspect item ${item.name}` })[0]);
    expect(await within(row).findByText("Recipe")).toBeInTheDocument();
    expect(within(row).getAllByLabelText(/^Recipe component /)).toHaveLength(2);
  });

  it("uses left click for inspector pins and right click for filter chips", async () => {
    const user = userEvent.setup();
    const compWithAugment = dataset.comps.find((comp) =>
      comp.recommendedAugmentIds.some((augmentId) => {
        const matches = dataset.comps.filter((candidate) => candidate.recommendedAugmentIds.includes(augmentId));
        return matches.length > 0 && matches.length < dataset.comps.length;
      })
    );

    expect(compWithAugment).toBeDefined();
    if (!compWithAugment) {
      return;
    }

    const augmentId = compWithAugment.recommendedAugmentIds.find((candidateAugmentId) => {
      const matches = dataset.comps.filter((candidate) => candidate.recommendedAugmentIds.includes(candidateAugmentId));
      return matches.length > 0 && matches.length < dataset.comps.length;
    });

    expect(augmentId).toBeDefined();
    if (!augmentId) {
      return;
    }

    const augment = dataset.augmentsById[augmentId];
    const compWithoutAugment = dataset.comps.find((comp) => !comp.recommendedAugmentIds.includes(augmentId));

    expect(augment).toBeDefined();
    expect(compWithoutAugment).toBeDefined();
    if (!augment || !compWithoutAugment) {
      return;
    }

    render(<App />);

    let row = await ensureExpanded(user, compWithAugment.title);
    const augmentButton = within(row).getByRole("button", { name: `Inspect augment ${augment.name}` });

    await user.click(augmentButton);

    await waitFor(() => {
      row = getCompRow(compWithAugment.title) as HTMLElement;
      expect(within(row).getByTestId("inspector-title")).toHaveTextContent(augment.name);
      expect(within(row).getByText("Pinned")).toBeInTheDocument();
    });

    fireEvent.contextMenu(within(row).getByRole("button", { name: `Inspect augment ${augment.name}` }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Toggle comp ${compWithAugment.title}` })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: `Toggle comp ${compWithoutAugment.title}` })).not.toBeInTheDocument();
    });
  });
});
