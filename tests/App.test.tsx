import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { CompListPane } from "../src/components/CompListPane";
import generatedDataset from "../src/data/tft-set17.json";
import { getItemDisplay } from "../src/lib/items";
import { rankCompsBySimilarity } from "../src/lib/similarity";
import { COMPONENT_RECIPES } from "../shared/normalization";
import { datasetSchema } from "../shared/tft";
import {
  getCompPlaystyle,
  getCompRankTags,
  getPlaystyleLabel,
  getSourceAbbreviation,
  getSourceDisplayName
} from "../src/lib/compMeta";

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

function mockRect(element: Element | null, rect: Partial<DOMRect>) {
  if (!element) {
    throw new Error("Expected element for mocked layout rect");
  }

  const left = rect.left ?? 0;
  const top = rect.top ?? 0;
  const width = rect.width ?? Math.max((rect.right ?? left) - left, 0);
  const height = rect.height ?? Math.max((rect.bottom ?? top) - top, 0);
  const right = rect.right ?? left + width;
  const bottom = rect.bottom ?? top + height;

  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: left,
    y: top,
    left,
    top,
    right,
    bottom,
    width,
    height,
    toJSON: () => ({ left, top, right, bottom, width, height })
  } as DOMRect);
}

function getFirstBoardChampionId(phase: "early" | "mid" | "late") {
  const championId = dataset.comps
    .flatMap((comp) => comp.phases[phase].boardSlots.map((slot) => slot.championId))
    .find((candidate): candidate is string => Boolean(candidate));

  if (!championId) {
    throw new Error(`Expected at least one ${phase} board champion`);
  }

  return championId;
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
    localStorage.clear();
    window.history.pushState({}, "", "/");
    document.documentElement.removeAttribute("data-opnr-theme");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(dataset), { status: 200 }))
    );
  });

  it("serves the main application shell with reactive dot chrome", () => {
    window.history.pushState({}, "", "/");

    render(<App />);

    const canvas = screen.getByTestId("dot-test-canvas");
    expect(canvas.tagName).toBe("CANVAS");
    expect(canvas).toHaveAttribute("data-page", "dot-reactivity-test");
    expect(canvas).toHaveAttribute("data-layer-count", "1");
    expect(screen.getByRole("button", { name: /Open OPNR menu/i })).toBeInTheDocument();
    expect(screen.getByText(/OPNR\.GG/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Toggle Aptos theme/i)).toBeInTheDocument();
  });

  it("toggles and persists the Aptos theme mode", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByLabelText(/Toggle Aptos theme/i);

    expect(document.documentElement).toHaveAttribute("data-opnr-theme", "dark");

    await user.click(screen.getByLabelText(/Toggle Aptos theme/i));

    expect(document.documentElement).toHaveAttribute("data-opnr-theme", "light");
    expect(localStorage.getItem("opnr:aptos-theme:v1")).toBe("light");
  });

  it("warps the Aptos backdrop through pointer physics", async () => {
    render(<App />);

    await screen.findByLabelText(/Toggle Aptos theme/i);
    const shell = document.querySelector<HTMLElement>(".aptos-app-shell");
    expect(shell).toBeTruthy();
    if (!shell) {
      return;
    }

    fireEvent.pointerMove(shell, { clientX: 360, clientY: 220 });

    await waitFor(() => {
      expect(shell.style.getPropertyValue("--opnr-pointer-x")).not.toBe("");
      expect(shell.style.getPropertyValue("--opnr-warp-radius")).not.toBe("190px");
    });
  });

  it("renders a canvas-backed Aptos dot matrix renderer behind the shell", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByLabelText(/Toggle Aptos theme/i);
    const backdrop = screen.getByTestId("aptos-webgl-backdrop");

    expect(backdrop.tagName).toBe("CANVAS");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    expect(backdrop).toHaveAttribute("data-renderer", "clean-room-dot-matrix-field");
    expect(backdrop).toHaveAttribute("data-matrix", "dot");
    expect(backdrop).toHaveAttribute("data-layer-count", "1");
    expect(backdrop).toHaveAttribute("data-idle-motion", "static");
    expect(backdrop).toHaveAttribute("data-warp-mode", "fisheye-dot-displacement");
    expect(backdrop).toHaveAttribute("data-theme-mode", "dark");

    await user.click(screen.getByLabelText(/Toggle Aptos theme/i));

    expect(backdrop).toHaveAttribute("data-theme-mode", "light");
  });

  it("opens the bracket menu and resets persisted panel layout", async () => {
    const user = userEvent.setup();
    localStorage.setItem("opnr:aptos-panel-layout:v1", JSON.stringify({ filters: { x: 42, y: 12 } }));

    render(<App />);

    const panel = screen.getByTestId("aptos-panel-filters");
    expect(panel).toHaveStyle({ transform: "translate3d(42px, 12px, 0)" });

    await user.click(await screen.findByRole("button", { name: /Open OPNR menu/i }));

    const menu = screen.getByRole("menu", { name: /OPNR menu/i });
    expect(menu).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: /Reset layout/i })).toBeInTheDocument();

    await user.click(within(menu).getByRole("button", { name: /Reset layout/i }));

    expect(localStorage.getItem("opnr:aptos-panel-layout:v1")).toBeNull();
    expect(panel.getAttribute("style")).toBe("");
  });

  it("drags and persists Aptos lab panel positions", async () => {
    render(<App />);

    const dragHandle = await screen.findByRole("button", { name: /Drag filter instrument/i });
    const panel = screen.getByTestId("aptos-panel-filters");

    fireEvent.mouseDown(dragHandle, { clientX: 20, clientY: 20 });
    fireEvent.mouseMove(window, { clientX: 72, clientY: 61 });
    fireEvent.mouseUp(window, { clientX: 72, clientY: 61 });

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("opnr:aptos-panel-layout:v1") ?? "{}");
      expect(saved.filters?.x).toBeGreaterThan(0);
      expect(saved.filters?.y).toBeGreaterThan(0);
    });
    expect(panel.style.transform).toContain("translate3d(");
  });

  it("updates the layout debug dimensions from live panel resize reports", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "F9", code: "F9" });

    const debugPanel = await screen.findByLabelText("Temporary layout debug panel");
    const panelSelect = within(debugPanel).getByLabelText("Panel");
    await userEvent.selectOptions(panelSelect, "selectedComponents");

    window.dispatchEvent(
      new CustomEvent("opnr:aptos-panel-live-layout", {
        detail: {
          id: "selectedComponents",
          layout: { x: 0, y: 0, width: 364, height: 218 }
        }
      })
    );

    await waitFor(() => {
      expect(within(debugPanel).getByLabelText("width")).toHaveValue("364");
      expect(within(debugPanel).getByLabelText("height")).toHaveValue("218");
    });
  });

  it("collapses application panels into draggable top bars", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/");

    render(<App />);

    const panel = await screen.findByTestId("aptos-panel-selectedOverview");
    const body = panel.querySelector(".dot-test-detail-body");

    expect(panel).not.toHaveClass("is-collapsed");
    expect(body).not.toHaveAttribute("hidden");

    await user.click(screen.getByRole("button", { name: "Collapse build overview panel" }));

    expect(panel).toHaveClass("is-collapsed");
    expect(panel).toHaveAttribute("aria-expanded", "false");
    expect(body).toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: "Expand build overview panel" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("routes blocked panel top-bar clicks to the visible panel chrome", async () => {
    window.history.pushState({}, "", "/");

    render(<App />);

    const panel = await screen.findByTestId("aptos-panel-selectedComponents");
    const header = panel.querySelector(".dot-test-detail-drag-bar");
    const body = panel.querySelector(".dot-test-detail-body");
    const collapseButton = within(panel).getByRole("button", { name: "Collapse components panel" });
    const blocker = await screen.findByTestId("aptos-panel-inspector");
    const blockerBody = blocker.querySelector(".dot-test-detail-body");

    mockRect(panel, { left: 330, top: 463, width: 300, height: 226 });
    mockRect(header, { left: 330, top: 463, width: 300, height: 36 });
    mockRect(collapseButton, { left: 586, top: 469, width: 26, height: 24 });
    mockRect(body, { left: 330, top: 499, width: 300, height: 190 });
    mockRect(blocker, { left: 300, top: 430, width: 400, height: 250 });
    mockRect(blockerBody, { left: 300, top: 460, width: 400, height: 220 });

    const elementsFromPoint = vi.fn(() => [
      blockerBody as Element,
      collapseButton,
      header as Element,
      panel
    ]);
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: elementsFromPoint
    });

    const pointerEvent = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 599,
      clientY: 481
    });
    Object.defineProperty(pointerEvent, "pointerId", { value: 1 });

    fireEvent(blockerBody as Element, pointerEvent);

    expect(elementsFromPoint).toHaveBeenCalledWith(599, 481);
    await waitFor(() => expect(panel).toHaveClass("is-collapsed"));
    expect(panel).toHaveAttribute("aria-expanded", "false");
    expect(body).toHaveAttribute("hidden");
  });

  it("keeps preview columns on a shared spacing rail", async () => {
    window.history.pushState({}, "", "/");

    render(<App />);

    const row = await waitFor(() => {
      const result = document.querySelector<HTMLElement>(".comp-row.selection-mode .row-header-trigger");
      expect(result).toBeTruthy();
      return result as HTMLElement;
    });
    const previewCluster = row.querySelector<HTMLElement>(".selection-preview-cluster");
    expect(previewCluster).toBeTruthy();
    const previewCells = Array.from(previewCluster?.querySelectorAll<HTMLElement>("[data-preview-column]") ?? []);

    expect(previewCells.map((cell) => cell.dataset.previewColumn)).toEqual(["champions", "augments", "components"]);
    previewCells.forEach((cell) => {
      expect(cell).toHaveClass("selection-preview-cell");
    });
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

    fireEvent.change(input, { target: { value: firstComp.title } });

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

    expect(await screen.findByRole("button", { name: "Sort by source" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort by rank" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort by style" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort by comp name" })).toBeInTheDocument();
    const columnHeader = document.querySelector(".selection-list-columns") as HTMLElement;
    expect(within(columnHeader).getByText("Champions")).toBeInTheDocument();
    expect(within(columnHeader).getByText("Augments")).toBeInTheDocument();
    expect(within(columnHeader).getByText("Components")).toBeInTheDocument();
    expect(columnHeader).toHaveTextContent("Source");
    expect(columnHeader).toHaveTextContent("Rank");
    expect(columnHeader).toHaveTextContent("Style");
    expect(columnHeader).toHaveTextContent("Composition");
    expect(columnHeader).toHaveTextContent("Champions");
    expect(columnHeader).toHaveTextContent("Augments");
    expect(columnHeader).toHaveTextContent("Components");

    const firstComp = dataset.comps.find((candidate) => getCompRankTags(candidate).length > 0);
    if (!firstComp) {
      throw new Error("Expected fixture data to include at least one ranked comp");
    }
    const row = await waitFor(() => getCompRow(firstComp.title) as HTMLElement);

    expect(row.querySelector(".selection-source-readout")).toBeInTheDocument();
    const rankCell = within(row).getByTestId("rank-cell");
    const rank = getCompRankTags(firstComp)[0];

    expect(rankCell).toBeInTheDocument();
    expect(rank).toBeDefined();
    expect(rankCell.querySelector(".custom-rank-badge")).toHaveAttribute("data-rank-tier", rank.tier);
    expect(rankCell.querySelector(".rank-glyph")).toHaveTextContent(rank.tier);
    expect(row.querySelector(".selection-style-readout")).toBeInTheDocument();
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
    expect((document.querySelector(".comp-row .selection-source-readout") as HTMLElement).textContent).toMatch(
      /Academy|Mobalytics|TFTactics|TFTFlow/
    );

    await user.click(screen.getByRole("button", { name: "Sort by rank" }));
    expect(within(document.querySelector(".comp-row") as HTMLElement).getByTestId("rank-cell").querySelector(".custom-rank-badge")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sort by style" }));
    const firstStyle = dataset.comps
      .map((comp) => getPlaystyleLabel(getCompPlaystyle(comp)) ?? "--")
      .sort((left, right) => left.localeCompare(right))[0];
    expect(document.querySelector(".comp-row .selection-style-readout")).toHaveTextContent(firstStyle);
  });

  it("sorts selection rows by similarity score", async () => {
    const user = userEvent.setup();
    const comps = dataset.comps.slice(0, 3);
    const strongestComp = comps[1];

    render(
      <CompListPane
        comps={comps}
        dataset={dataset}
        phaseFilter="early"
        onQuickFilter={vi.fn()}
        selectionOnly
        similarityReadouts={{
          [comps[0].id]: { score: 2, percent: 18 },
          [strongestComp.id]: { score: 9, percent: 74 },
          [comps[2].id]: { score: 5, percent: 42 }
        }}
      />
    );

    const similaritySortButton = await screen.findByRole("button", { name: "Sort by similarity" });
    await user.click(screen.getByRole("button", { name: "Sort by comp name" }));
    await user.click(similaritySortButton);

    expect(similaritySortButton).toHaveAttribute("aria-sort", "descending");
    expect(document.querySelector(".comp-row h2")).toHaveTextContent(getDisplayTitle(strongestComp.title));
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

    expect(await screen.findByRole("button", { name: "Sort by comp name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort by source" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort by rank" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort by style" })).toBeInTheDocument();
    const columnHeader = document.querySelector(".selection-list-columns") as HTMLElement;
    expect(within(columnHeader).getByText("Champions")).toBeInTheDocument();
    expect(within(columnHeader).getByText("Augments")).toBeInTheDocument();
    expect(within(columnHeader).getByText("Components")).toBeInTheDocument();

    const firstComp = dataset.comps.find((candidate) => getCompRankTags(candidate).length > 0);
    if (!firstComp) {
      throw new Error("Expected fixture data to include at least one ranked comp");
    }
    const row = await waitFor(() => getCompRow(firstComp.title) as HTMLElement);

    expect(within(row).getByTestId("composition-cell")).toHaveTextContent(getDisplayTitle(firstComp.title));
    expect(row.querySelector(".selection-source-readout")).toHaveTextContent(
      getSourceDisplayName(firstComp.sources[0]?.name ?? "")
    );
    expect(within(row).getByTestId("rank-cell").querySelector(".custom-rank-badge")).toBeInTheDocument();
    expect(row.querySelector(".selection-style-readout")).toBeInTheDocument();
    expect(row.querySelector(".selection-title-line .selection-style-readout + h2")).toBeInTheDocument();
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

  it("switches to a phase-scoped similarity finder and ranks selected champion matches", async () => {
    const user = userEvent.setup();
    const championId = getFirstBoardChampionId("early");
    const champion = dataset.championsById[championId];
    const expectedTop = rankCompsBySimilarity(
      dataset.comps,
      dataset,
      {
        championIds: [championId],
        augmentIds: [],
        itemIds: [],
        componentIds: []
      },
      "early"
    )[0].comp;

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch to similarity view" }));
    expect(screen.getByRole("heading", { name: "Similarity finder" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: `Select champion ${champion.name}` }));

    const results = await screen.findAllByTestId("similarity-result");

    expect(results[0]).toHaveTextContent(getDisplayTitle(expectedTop.title));
    expect(results[0]).toHaveTextContent("Champions");
    expect(within(results[0]).getByAltText(champion.name)).toBeInTheDocument();
  });

  it("allows multiple similarity phase buttons to stay selected", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch to similarity view" }));
    await user.click(screen.getByRole("button", { name: "Rank similarity by mid board" }));

    expect(screen.getByRole("button", { name: "Rank similarity by early board" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Rank similarity by mid board" })).toHaveClass("active");

    await user.click(screen.getByRole("button", { name: "Rank similarity by early board" }));
    expect(screen.getByRole("button", { name: "Rank similarity by early board" })).not.toHaveClass("active");
    expect(screen.getByRole("button", { name: "Rank similarity by mid board" })).toHaveClass("active");

    await user.click(screen.getByRole("button", { name: "Rank similarity by mid board" }));
    expect(screen.getByRole("button", { name: "Rank similarity by mid board" })).toHaveClass("active");
  });

  it("can collapse the similarity picker sidebar", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch to similarity view" }));
    const collapseButton = screen.getByRole("button", { name: "Collapse similarity picker" });
    const shell = screen.getByLabelText("Similarity entity picker").closest(".similarity-shell");

    expect(shell).not.toHaveClass("sidebar-collapsed");

    await user.click(collapseButton);

    expect(shell).toHaveClass("sidebar-collapsed");
    expect(screen.getByRole("button", { name: "Expand similarity picker" })).toHaveAttribute("aria-expanded", "false");
  });

  it("hides selected sources in both comp and similarity views", async () => {
    const user = userEvent.setup();
    const sourceName = getSourceDisplayName(dataset.comps[0].sources[0]?.name ?? "");
    const sourceComps = dataset.comps.filter(
      (comp) => getSourceDisplayName(comp.sources[0]?.name ?? "") === sourceName
    );
    const visibleComp = dataset.comps.find((comp) => getSourceDisplayName(comp.sources[0]?.name ?? "") !== sourceName);

    expect(sourceComps.length).toBeGreaterThan(0);
    expect(visibleComp).toBeDefined();
    if (!visibleComp) {
      return;
    }

    render(<App />);

    await screen.findByText("Composition");
    await user.click(screen.getByRole("button", { name: `Hide source ${sourceName}` }));

    expect(document.querySelector(`[data-comp-id="${sourceComps[0].id}"]`)).not.toBeInTheDocument();
    expect(document.querySelector(`[data-comp-id="${visibleComp.id}"]`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to similarity view" }));
    const championId = getFirstBoardChampionId("early");
    const champion = dataset.championsById[championId];
    await user.click(screen.getByRole("button", { name: `Select champion ${champion.name}` }));

    await screen.findAllByTestId("similarity-result");
    expect(document.querySelector(`[data-comp-id="${sourceComps[0].id}"]`)).not.toBeInTheDocument();
    expect(document.querySelector(`[data-comp-id="${visibleComp.id}"]`)).toBeInTheDocument();
  });

  it("keeps sidebar selections image-first and allows duplicate component selection", async () => {
    const user = userEvent.setup();
    const champion = Object.values(dataset.championsById)[0];
    const unknownAugment = Object.values(dataset.augmentsById).find((augment) => augment.tier === "Unknown");
    const component = dataset.comps.flatMap((comp) => comp.componentDemand).find(Boolean);

    expect(component).toBeDefined();
    if (!component) {
      return;
    }

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch to similarity view" }));

    const championButton = screen.getByRole("button", { name: `Select champion ${champion.name}` });
    expect(within(championButton).queryByText(/\d+\s+cost/i)).not.toBeInTheDocument();

    if (unknownAugment) {
      const augmentButton = screen.getByRole("button", { name: `Select augment ${unknownAugment.name}` });
      expect(within(augmentButton).queryByText("Unknown")).not.toBeInTheDocument();
    }

    const componentButton = screen.getByRole("button", { name: `Select component ${component.label}` });
    await user.click(componentButton);
    await user.click(componentButton);

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(within(componentButton).getByText("2")).toBeInTheDocument();
  });

  it("does not show non-playable champion catalog entries in the similarity sidebar", async () => {
    const user = userEvent.setup();
    const nonPlayableChampion = Object.values(dataset.championsById).find((champion) => champion.cost > 5);

    expect(nonPlayableChampion).toBeDefined();
    if (!nonPlayableChampion) {
      return;
    }

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch to similarity view" }));

    expect(screen.queryByRole("button", { name: `Select champion ${nonPlayableChampion.name}` })).not.toBeInTheDocument();
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
    expect(within(row).getAllByLabelText(`Build rank ${rankedSource.name} ${rankedSource.tier}`)[0].querySelector(".custom-rank-badge, .rank-glyph")).toBeInTheDocument();
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
