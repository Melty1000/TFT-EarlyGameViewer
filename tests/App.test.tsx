import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import generatedDataset from "../src/data/tft-set17.json";
import { getItemDisplay } from "../src/lib/items";
import { COMPONENT_RECIPES } from "../shared/normalization";
import { datasetSchema } from "../shared/tft";
import { getCompPlaystyle, getCompRankTags, getPlaystyleLabel, getSourceAbbreviation } from "../src/lib/compMeta";

const dataset = datasetSchema.parse(generatedDataset);

function getCompRow(title: string) {
  const comp = dataset.comps.find((candidate) => candidate.title === title);
  if (comp) {
    return document.querySelector<HTMLElement>(`[data-comp-id="${comp.id}"]`);
  }

  return screen.getByRole("heading", { name: getDisplayTitle(title) }).closest("article");
}

function providerSuffixPattern() {
  return /\s\((Mobalytics|TFT Academy|TFTactics|TFTFlow|MetaTFT)\)$/;
}

function getDisplayTitle(title: string) {
  return title.replace(providerSuffixPattern(), "");
}

function augmentTierOrder(tier: string) {
  return ["S", "A", "B", "C", "D", "Unknown"].indexOf(tier);
}

async function ensureExpanded(user: ReturnType<typeof userEvent.setup>, title: string) {
  const displayTitle = getDisplayTitle(title);
  const initialRow = await waitFor(() => {
    const result = getCompRow(title);
    expect(result).toBeTruthy();
    return result as HTMLElement;
  });

  const toggle = within(initialRow).getByRole("button", { name: `Toggle comp ${displayTitle}` });
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

  it("compresses visible playstyle labels when the icon already carries the action", () => {
    expect(getPlaystyleLabel("Fast 8")).toBe("Level 8");
    expect(getPlaystyleLabel("Fast 9")).toBe("Level 9");
    expect(getPlaystyleLabel("3-Cost Reroll")).toBe("3-cost");
    expect(getPlaystyleLabel("5-slow-roll")).toBe("Level 5");
    expect(getPlaystyleLabel("Slow Roll (5)")).toBe("Level 5");
    expect(getPlaystyleLabel("Reroll Lvl 6")).toBe("Level 6");
    expect(getPlaystyleLabel("4-Cost Fast 8")).toBe("4-cost Level 8");
  });

  it("filters the comp list by query", async () => {
    const user = userEvent.setup();
    const [firstComp, secondComp] = dataset.comps;

    render(<App />);

    const input = await screen.findByLabelText(/Quick search/i);
    expect(await screen.findByRole("button", { name: `Toggle comp ${getDisplayTitle(firstComp.title)}` })).toBeInTheDocument();

    await user.type(input, firstComp.title);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: `Toggle comp ${getDisplayTitle(firstComp.title)}` })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: `Toggle comp ${getDisplayTitle(secondComp.title)}` })).not.toBeInTheDocument();
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
      expect(screen.getByRole("button", { name: `Toggle comp ${getDisplayTitle(compWithAugment.title)}` })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: `Toggle comp ${getDisplayTitle(compWithoutAugment.title)}` })
      ).not.toBeInTheDocument();
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

  it("places synergies and recommended augments above the inspector in expanded rows", async () => {
    const user = userEvent.setup();
    const comp = dataset.comps.find((candidate) => candidate.recommendedAugmentIds.length > 0);

    expect(comp).toBeDefined();
    if (!comp) {
      return;
    }

    render(<App />);

    const row = await ensureExpanded(user, comp.title);
    const supportGrid = row.querySelector(".detail-support-grid");
    const inspector = row.querySelector(".detail-full-inspector");

    expect(supportGrid).toBeInTheDocument();
    expect(inspector).toBeInTheDocument();
    expect(Boolean((supportGrid as Element).compareDocumentPosition(inspector as Node) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
      true
    );
  });

  it("renders loose levelling guide lines instead of dropping later steps", async () => {
    const user = userEvent.setup();
    const comp = dataset.comps.find((candidate) =>
      candidate.guide.overview.some((section) =>
        section.title === "Levelling guide" && section.lines.some((line) => /push level 7/i.test(line))
      )
    );

    expect(comp).toBeDefined();
    if (!comp) {
      return;
    }

    render(<App />);

    const row = await ensureExpanded(user, comp.title);

    expect(within(row).getByText("L7")).toBeInTheDocument();
    expect(within(row).getByText(/after core 3-stars/i)).toBeInTheDocument();
  });

  it("renders provider variants as separate build rows without source switching", async () => {
    const groupedTitle = "Invader Zed";
    const groupedComps = dataset.comps.filter((comp) => getDisplayTitle(comp.title) === groupedTitle);

    expect(groupedComps.length).toBeGreaterThan(1);

    render(<App />);

    await screen.findByText("Composition");

    const rows = groupedComps
      .map((comp) => document.querySelector<HTMLElement>(`[data-comp-id="${comp.id}"]`))
      .filter((row): row is HTMLElement => Boolean(row));

    expect(rows).toHaveLength(groupedComps.length);
    expect(screen.getAllByRole("heading", { name: groupedTitle })).toHaveLength(groupedComps.length);
    expect(screen.queryByRole("button", { name: /^View .* source for Invader Zed$/ })).not.toBeInTheDocument();
    const renderedSources = rows.map((row) => within(row).getByTestId("source-cell").textContent ?? "");
    for (const comp of groupedComps) {
      expect(renderedSources.some((sourceText) => sourceText.includes(getSourceAbbreviation(comp.sources[0]?.name ?? "")))).toBe(
        true
      );
    }
  });

  it("renders collapsed rows with separate source, rank, style, champion, augment, and component columns", async () => {
    render(<App />);

    expect(await screen.findByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Rank")).toBeInTheDocument();
    expect(screen.getByText("Style")).toBeInTheDocument();
    expect(screen.getByText("Composition")).toBeInTheDocument();
    expect(screen.getByText("Champions")).toBeInTheDocument();
    expect(screen.getByText("Augments")).toBeInTheDocument();
    expect(screen.getByText("Components")).toBeInTheDocument();

    const columnLabels = [...document.querySelectorAll(".list-columns > *")].map((element) => element.textContent?.trim());
    expect(columnLabels).toEqual(["Source", "Rank", "Style", "Composition", "Champions", "Augments", "Components"]);

    const firstComp = dataset.comps.find((candidate) => getCompRankTags(candidate).length > 0);
    if (!firstComp) {
      throw new Error("Expected fixture data to include at least one ranked comp");
    }
    const row = await waitFor(() => getCompRow(firstComp.title) as HTMLElement);

    expect(within(row).getByTestId("source-cell")).toBeInTheDocument();
    const rankCell = within(row).getByTestId("rank-cell");
    const rank = getCompRankTags(firstComp)[0];

    expect(rankCell).toBeInTheDocument();
    expect(rank).toBeDefined();
    expect(rankCell.querySelector(".rank-icon")?.getAttribute("src")).toContain(`assets/ranks/${rank.tier.toLowerCase()}.svg`);
    expect(within(row).getByTestId("style-cell")).toBeInTheDocument();
    expect(within(row).getByTestId("composition-cell")).toHaveTextContent(getDisplayTitle(firstComp.title));
  });

  it("sorts the comp list by composition name, source, rank, and style", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("button", { name: "Sort by comp name" });

    await user.click(screen.getByRole("button", { name: "Sort by comp name" }));
    const firstAlphaTitle = dataset.comps.map((comp) => getDisplayTitle(comp.title)).sort((left, right) =>
      left.localeCompare(right)
    )[0];
    expect(document.querySelector(".comp-row h2")).toHaveTextContent(firstAlphaTitle);

    await user.click(screen.getByRole("button", { name: "Sort by source" }));
    expect(within(document.querySelector(".comp-row") as HTMLElement).getByTestId("source-cell")).toHaveTextContent(/ACD|MOB|TAC|FLW|MTF/);

    await user.click(screen.getByRole("button", { name: "Sort by rank" }));
    expect(within(document.querySelector(".comp-row") as HTMLElement).getByTestId("rank-cell").querySelector(".rank-icon")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sort by style" }));
    const firstStyle = dataset.comps
      .map((comp) => getPlaystyleLabel(getCompPlaystyle(comp)) ?? "--")
      .sort((left, right) => left.localeCompare(right))[0];
    expect(within(document.querySelector(".comp-row") as HTMLElement).getByTestId("style-cell")).toHaveTextContent(
      firstStyle
    );
  });

  it("keeps separate provider build rows visible while source sort is active", async () => {
    const user = userEvent.setup();
    const groupedTitle = "Invader Zed";
    const groupedComps = dataset.comps.filter((comp) => getDisplayTitle(comp.title) === groupedTitle);

    render(<App />);

    await screen.findByRole("button", { name: "Sort by source" });
    await user.click(screen.getByRole("button", { name: "Sort by source" }));

    await waitFor(() => {
      for (const comp of groupedComps) {
        expect(document.querySelector(`[data-comp-id="${comp.id}"]`)).toBeInTheDocument();
      }
    });

    expect(screen.getAllByRole("heading", { name: groupedTitle })).toHaveLength(groupedComps.length);
    expect(screen.queryByRole("button", { name: /^View .* source for Invader Zed$/ })).not.toBeInTheDocument();
  });

  it("renders collapsed rows with separate source, rank, style, champion, augment, and component cells", async () => {
    render(<App />);

    expect(await screen.findByText("Composition")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Rank")).toBeInTheDocument();
    expect(screen.getByText("Style")).toBeInTheDocument();
    expect(screen.getByText("Champions")).toBeInTheDocument();
    expect(screen.getByText("Augments")).toBeInTheDocument();
    expect(screen.getByText("Components")).toBeInTheDocument();

    const firstComp = dataset.comps.find((candidate) => getCompRankTags(candidate).length > 0);
    if (!firstComp) {
      throw new Error("Expected fixture data to include at least one ranked comp");
    }
    const row = await waitFor(() => getCompRow(firstComp.title) as HTMLElement);

    expect(within(row).getByTestId("composition-cell")).toHaveTextContent(getDisplayTitle(firstComp.title));
    expect(within(row).getByTestId("source-cell")).toBeInTheDocument();
    expect(within(row).getByTestId("rank-cell").querySelector(".rank-icon")).toBeInTheDocument();
    expect(within(row).getByTestId("style-cell")).toBeInTheDocument();
  });

  it("shows the best-ranked augment previews before lower-ranked options", async () => {
    const comp = dataset.comps.find((candidate) => {
      if (candidate.recommendedAugmentIds.length <= 3) {
        return false;
      }
      const currentFirstThree = candidate.recommendedAugmentIds.slice(0, 3);
      const sortedFirstThree = [...candidate.recommendedAugmentIds]
        .sort((left, right) => {
          const leftTier = dataset.augmentsById[left]?.tier ?? "Unknown";
          const rightTier = dataset.augmentsById[right]?.tier ?? "Unknown";
          return augmentTierOrder(leftTier) - augmentTierOrder(rightTier);
        })
        .slice(0, 3);
      return currentFirstThree.join("|") !== sortedFirstThree.join("|");
    });

    expect(comp).toBeDefined();
    if (!comp) {
      return;
    }

    const expectedNames = [...comp.recommendedAugmentIds]
      .sort((left, right) => {
        const leftTier = dataset.augmentsById[left]?.tier ?? "Unknown";
        const rightTier = dataset.augmentsById[right]?.tier ?? "Unknown";
        return augmentTierOrder(leftTier) - augmentTierOrder(rightTier);
      })
      .slice(0, 3)
      .map((augmentId) => dataset.augmentsById[augmentId]?.name);

    render(<App />);

    const row = await waitFor(() => getCompRow(comp.title) as HTMLElement);
    const previewNames = [...row.querySelectorAll<HTMLImageElement>("[data-preview-kind='augment'] img")]
      .map((image) => image.alt);

    expect(previewNames).toEqual(expectedNames);
  });

  it("uses the same compact token structure for collapsed augments and components", async () => {
    const comp = dataset.comps.find((candidate) => candidate.recommendedAugmentIds.length > 0 && candidate.componentDemand.length > 0);

    expect(comp).toBeDefined();
    if (!comp) {
      return;
    }

    render(<App />);

    const row = await waitFor(() => getCompRow(comp.title) as HTMLElement);
    const augmentToken = row.querySelector("[data-preview-kind='augment']");
    const componentToken = row.querySelector("[data-preview-kind='component']");

    expect(augmentToken).toHaveClass("preview-token");
    expect(componentToken).toHaveClass("preview-token");
    expect(augmentToken?.querySelector(".preview-token-badge")).toBeInTheDocument();
    expect(componentToken?.querySelector(".preview-token-badge")).toBeInTheDocument();
  });

  it("positions board item icons in deterministic hex anchor slots", async () => {
    const user = userEvent.setup();
    const comp = dataset.comps.find((candidate) =>
      candidate.phases.late.boardSlots.some((slot) => slot.itemIds.length >= 3)
    );

    expect(comp).toBeDefined();
    if (!comp) {
      return;
    }

    render(<App />);

    const row = await ensureExpanded(user, comp.title);
    await user.click(within(row).getByRole("button", { name: `Show late board for ${comp.title}` }));

    const itemButtons = row.querySelectorAll<HTMLButtonElement>(".board-item-icon");
    expect(itemButtons.length).toBeGreaterThanOrEqual(3);
    expect([...itemButtons].some((button) => button.classList.contains("item-slot-1"))).toBe(true);
    expect([...itemButtons].some((button) => button.classList.contains("item-slot-2"))).toBe(true);
    expect([...itemButtons].some((button) => button.classList.contains("item-slot-3"))).toBe(true);
  });

  it("keeps duplicate units in the collapsed champion preview", async () => {
    const comp = dataset.comps.find((candidate) => candidate.title === "Two Tanky Urgot (TFT Academy)");

    expect(comp).toBeDefined();
    if (!comp) {
      return;
    }

    render(<App />);

    const row = await waitFor(() => getCompRow(comp.title) as HTMLElement);

    expect(within(row).getAllByAltText("Aatrox")).toHaveLength(2);
    expect(within(row).getAllByAltText("Akali")).toHaveLength(2);
  });

  it("renders duplicate board units and per-slot star targets", async () => {
    const user = userEvent.setup();
    const comp = dataset.comps.find((candidate) => candidate.title === "Two Tanky Urgot (TFT Academy)");

    expect(comp).toBeDefined();
    if (!comp) {
      return;
    }

    render(<App />);

    const row = await ensureExpanded(user, comp.title);
    await user.click(within(row).getByRole("button", { name: `Show late board for ${comp.title}` }));

    expect(within(row).getAllByRole("button", { name: "Inspect champion Maokai" })).toHaveLength(2);
    expect(within(row).getAllByRole("button", { name: "Inspect champion Urgot" })).toHaveLength(2);
    expect(within(row).getAllByTitle("Target: 3-star").length).toBeGreaterThanOrEqual(2);
    expect(within(row).getByText(/late board · 7 units/i)).toBeInTheDocument();
    expect(within(row).getAllByTitle(/Two Tanky/i).length).toBeGreaterThan(0);
  });

  it("resolves trait emblem item displays to local synergy icons", () => {
    const emblemItemId = dataset.comps
      .flatMap((comp) =>
        (["early", "mid", "late"] as const).flatMap((phase) =>
          comp.phases[phase].boardSlots.flatMap((slot) => slot.itemIds)
        )
      )
      .find((itemId) => itemId.endsWith("-emblem"));

    expect(emblemItemId).toBeDefined();
    if (!emblemItemId) {
      return;
    }

    const clonedDataset = datasetSchema.parse(structuredClone(dataset));
    delete clonedDataset.itemsById[emblemItemId];
    const item = getItemDisplay(clonedDataset, emblemItemId);

    expect(item.name).toMatch(/Emblem$/);
    expect(item.icon).toContain("assets/synergies/");
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
    const styleLabel = getPlaystyleLabel(style ?? null);
    const itemSlot = comp.phases.late.boardSlots.find((slot) =>
      slot.championId && slot.itemIds.some((itemId) => COMPONENT_RECIPES[itemId] || COMPONENT_RECIPES[itemId.replace(/-s-/g, "s-").replace(/-s$/g, "s")] || COMPONENT_RECIPES[itemId.replace(/-/g, "")])
    );

    expect(rankedSource).toBeDefined();
    expect(style).toBeDefined();
    expect(styleLabel).toBeDefined();
    expect(itemSlot).toBeDefined();
    if (!rankedSource || !style || !styleLabel || !itemSlot?.championId) {
      return;
    }

    const champion = dataset.championsById[itemSlot.championId];
    const item = dataset.itemsById[itemSlot.itemIds[0]];

    render(<App />);

    const row = await ensureExpanded(user, comp.title);

    expect(within(row).getAllByLabelText(`Build rank ${rankedSource.name} ${rankedSource.tier}`)[0]).toBeInTheDocument();
    expect(within(row).getAllByLabelText(`Build rank ${rankedSource.name} ${rankedSource.tier}`)[0].querySelector(".rank-icon")).toBeInTheDocument();
    expect(within(row).getAllByText(styleLabel)[0]).toBeInTheDocument();

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
      expect(screen.getByRole("button", { name: `Toggle comp ${getDisplayTitle(compWithAugment.title)}` })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: `Toggle comp ${getDisplayTitle(compWithoutAugment.title)}` })
      ).not.toBeInTheDocument();
    });
  });
});
