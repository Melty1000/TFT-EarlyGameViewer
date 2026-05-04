import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import generatedDataset from "../src/data/tft-set17.json";
import { getAssignedItemHolders, getDetailPanelGuideGroups } from "../src/lib/detailPanelContent";
import { getItemDisplay } from "../src/lib/items";
import { getSimilarityEntitySections } from "../src/lib/similarityOptions";
import { getPlaystyleLabel, getSourceDisplayName } from "../src/lib/compMeta";
import { COMPONENT_LABELS, PHASES, type PhaseKey } from "../shared/normalization";
import { datasetSchema, type Comp } from "../shared/tft";

const dataset = datasetSchema.parse(generatedDataset);
const originalElementsFromPoint = document.elementsFromPoint;

function providerSuffixPattern() {
  return /\s\((Mobalytics|TFT Academy|TFTactics|TFTFlow|MetaTFT)\)$/;
}

function getDisplayTitle(title: string) {
  return title.replace(providerSuffixPattern(), "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getCompRow(comp: Comp) {
  return document.querySelector<HTMLElement>(`[data-comp-id="${comp.id}"]`);
}

async function getRenderedCompRow(comp: Comp) {
  return waitFor(() => {
    const row = getCompRow(comp);
    expect(row).toBeTruthy();
    return row as HTMLElement;
  });
}

async function waitForBrowserRows() {
  await screen.findByText("Composition");
  await screen.findAllByRole("button", { name: /Select comp /i });
}

async function selectComp(user: ReturnType<typeof userEvent.setup>, comp: Comp) {
  await waitForBrowserRows();
  const row = await getRenderedCompRow(comp);
  await user.click(within(row).getByRole("button", { name: `Select comp ${getDisplayTitle(comp.title)}` }));

  await waitFor(() => expect(getCompRow(comp)).toHaveClass("is-selected"));
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

function phaseChampionIds(comp: Comp, phase: PhaseKey) {
  return comp.phases[phase].boardSlots
    .map((slot) => slot.championId)
    .filter((championId): championId is string => Boolean(championId));
}

function nativeBoardPhases(comp: Comp) {
  return PHASES.filter((phase) => phaseChampionIds(comp, phase).length > 0);
}

function findUniqueDisplayComp() {
  const counts = new Map<string, number>();

  for (const comp of dataset.comps) {
    const title = getDisplayTitle(comp.title);
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }

  const comp = dataset.comps.find((candidate) => counts.get(getDisplayTitle(candidate.title)) === 1);
  if (!comp) {
    throw new Error("Expected at least one uniquely named comp in the generated dataset");
  }

  return comp;
}

function findCompWithDifferentEarlyAndLateBoards() {
  const comp = dataset.comps.find((candidate) => {
    const earlyIds = new Set(phaseChampionIds(candidate, "early"));
    const lateIds = phaseChampionIds(candidate, "late");
    return earlyIds.size > 0 && lateIds.some((championId) => !earlyIds.has(championId));
  });

  if (!comp) {
    throw new Error("Expected at least one comp with distinct early and late board data");
  }

  return comp;
}

function findRecipeHolderCase() {
  for (const phase of ["late", "mid", "early"] as const) {
    for (const comp of dataset.comps) {
      const holders = getAssignedItemHolders(comp, dataset, phase);
      const holder = holders.find((candidate) => candidate.items.some((item) => item.recipe.length > 0));
      const item = holder?.items.find((candidate) => candidate.recipe.length > 0);

      if (holder && item) {
        return { comp, phase, holder, item };
      }
    }
  }

  throw new Error("Expected at least one assigned item holder with a recipe");
}

function findChampionRecommendedItemInspectorCase() {
  for (const phase of ["late", "mid", "early"] as const) {
    for (const comp of dataset.comps) {
      for (const slot of comp.phases[phase].boardSlots) {
        if (!slot.championId) {
          continue;
        }

        const champion = dataset.championsById[slot.championId];
        const recommendedItemId = champion?.recommendedItemIds.find(
          (itemId) => dataset.itemsById[itemId] && !slot.itemIds.includes(itemId)
        );
        if (champion && recommendedItemId) {
          return { comp, phase, champion, recommendedItem: dataset.itemsById[recommendedItemId] };
        }
      }
    }
  }

  throw new Error("Expected at least one board champion with Mobalytics recommended items beyond its board-slot items");
}

function findGamePlanCase() {
  for (const phase of ["late", "mid", "early"] as const) {
    for (const comp of dataset.comps) {
      const { gamePlan } = getDetailPanelGuideGroups(comp, phase);
      const noteCount = gamePlan.reduce((count, section) => count + section.lines.length, 0);

      if (noteCount >= 2) {
        return { comp, phase, gamePlan, noteCount };
      }
    }
  }

  throw new Error("Expected at least one comp with game plan notes");
}

function findTftFlowCompWithLimitedNativeBoards() {
  const comp = dataset.comps.find((candidate) => {
    const source = getSourceDisplayName(candidate.sources[0]?.name ?? "");
    const phases = nativeBoardPhases(candidate);
    return source === "TFTFlow" && phases.length > 0 && phases.length < PHASES.length;
  });

  if (!comp) {
    throw new Error("Expected at least one TFTFlow comp with provider-native board phases only");
  }

  return comp;
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

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: originalElementsFromPoint
    });
  });

  it("serves the current test shell with the canvas renderer and main panels", async () => {
    render(<App />);

    const canvas = screen.getByTestId("dot-test-canvas");
    expect(canvas.tagName).toBe("CANVAS");
    expect(canvas).toHaveAttribute("data-page", "dot-reactivity-test");
    expect(canvas).toHaveAttribute("data-layer-count", "1");
    expect(canvas).toHaveAttribute("data-idle-motion", "static");
    expect(canvas).toHaveAttribute("data-warp-mode", "velocity-spin-dot-displacement");
    expect(screen.getByRole("button", { name: /Open OPNR menu/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Toggle Aptos theme/i)).toBeInTheDocument();

    await waitForBrowserRows();

    expect(screen.getByTestId("aptos-panel-browser")).toBeInTheDocument();
    expect(screen.getByTestId("aptos-panel-buildControls")).toBeInTheDocument();
    expect(screen.getByTestId("aptos-panel-selectedOverview")).toBeInTheDocument();
    expect(screen.getByTestId("aptos-panel-selectedBoard")).toBeInTheDocument();
    expect(screen.getByTestId("aptos-panel-selectedComponents")).toBeInTheDocument();
    expect(screen.getByTestId("aptos-panel-selectedSimilarities")).toBeInTheDocument();
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

  it("keeps obsolete evidence and list phase controls out of the current UI", async () => {
    render(<App />);

    await waitForBrowserRows();

    const browser = screen.getByTestId("aptos-panel-browser");
    const controls = screen.getByTestId("aptos-panel-buildControls");

    expect(within(browser).queryByText(/\bevidence\b/i)).not.toBeInTheDocument();
    expect(within(browser).queryByText(/\bsignals?\b/i)).not.toBeInTheDocument();
    expect(within(controls).queryByRole("group", { name: /List Phase/i })).not.toBeInTheDocument();
    expect(within(controls).getByLabelText("Search")).toBeInTheDocument();
  });

  it("opens the bracket menu and resets persisted panel layout", async () => {
    const user = userEvent.setup();
    localStorage.setItem("opnr:aptos-panel-layout:v1", JSON.stringify({ buildControls: { x: 42, y: 12 } }));

    render(<App />);

    const panel = await screen.findByTestId("aptos-panel-buildControls");
    expect(panel).toHaveStyle({ transform: "translate3d(42px, 12px, 0)" });

    await user.click(screen.getByRole("button", { name: /Open OPNR menu/i }));

    const menu = screen.getByRole("menu", { name: /OPNR menu/i });
    expect(within(menu).getByRole("button", { name: /Reset layout/i })).toBeInTheDocument();

    await user.click(within(menu).getByRole("button", { name: /Reset layout/i }));

    expect(localStorage.getItem("opnr:aptos-panel-layout:v1")).toBeNull();
    await waitFor(() => expect(panel.getAttribute("style")).toBe(""));
  });

  it("locks panel dragging, collapsing, and resizing from the bracket menu", async () => {
    const user = userEvent.setup();

    render(<App />);

    const panel = await screen.findByTestId("aptos-panel-selectedOverview");
    const dragHandle = within(panel).getByRole("button", { name: /Drag build overview/i });
    const collapseButton = within(panel).getByRole("button", { name: "Collapse build overview panel" });
    const resizeHandle = panel.querySelector<HTMLButtonElement>(".dot-test-resize-corner");

    expect(resizeHandle).toBeTruthy();
    expect(resizeHandle).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Open OPNR menu/i }));
    const lockButton = within(screen.getByRole("menu", { name: /OPNR menu/i })).getByRole("button", {
      name: /Lock panels/i
    });

    await user.click(lockButton);

    await waitFor(() => expect(panel).toHaveClass("is-layout-locked"));
    expect(localStorage.getItem("opnr:aptos-panel-lock:v1")).toBe("locked");
    expect(dragHandle).toHaveAttribute("aria-disabled", "true");
    expect(collapseButton).toBeDisabled();
    expect(resizeHandle).toBeDisabled();

    const layoutBeforeDragAttempt = localStorage.getItem("opnr:aptos-panel-layout:v1");
    fireEvent.mouseDown(dragHandle, { clientX: 20, clientY: 20 });
    fireEvent.mouseMove(window, { clientX: 120, clientY: 120 });
    fireEvent.mouseUp(window, { clientX: 120, clientY: 120 });

    expect(localStorage.getItem("opnr:aptos-panel-layout:v1")).toBe(layoutBeforeDragAttempt);

    await user.click(screen.getByRole("button", { name: /Open OPNR menu/i }));
    await user.click(within(screen.getByRole("menu", { name: /OPNR menu/i })).getByRole("button", {
      name: /Unlock panels/i
    }));

    await waitFor(() => expect(panel).not.toHaveClass("is-layout-locked"));
    expect(localStorage.getItem("opnr:aptos-panel-lock:v1")).toBeNull();
    expect(dragHandle).toHaveAttribute("aria-disabled", "false");
    expect(collapseButton).not.toBeDisabled();
    expect(resizeHandle).not.toBeDisabled();
  });

  it("drags and persists current panel positions", async () => {
    render(<App />);

    const dragHandle = await screen.findByRole("button", { name: /Drag build overview/i });
    const panel = screen.getByTestId("aptos-panel-selectedOverview");

    mockRect(panel, { left: 22, top: 64, width: 380, height: 282 });
    mockRect(dragHandle, { left: 22, top: 64, width: 380, height: 36 });

    fireEvent.mouseDown(dragHandle, { clientX: 20, clientY: 20 });
    await waitFor(() => expect(panel).toHaveClass("is-dragging"));
    fireEvent.mouseMove(window, { clientX: 72, clientY: 61 });
    fireEvent.mouseUp(window, { clientX: 72, clientY: 61 });

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("opnr:aptos-panel-layout:v1") ?? "{}");
      expect(saved.selectedOverview?.x).toBeGreaterThan(0);
      expect(saved.selectedOverview?.y).toBeGreaterThan(0);
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

    render(<App />);

    const panel = await screen.findByTestId("aptos-panel-selectedOverview");
    const body = panel.querySelector(".dot-test-detail-body");

    expect(panel).not.toHaveClass("is-collapsed");
    expect(body).not.toHaveAttribute("hidden");

    await user.click(within(panel).getByRole("button", { name: "Collapse build overview panel" }));

    expect(panel).toHaveClass("is-collapsed");
    expect(panel).toHaveAttribute("aria-expanded", "false");
    expect(body).toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: "Expand build overview panel" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("routes blocked panel top-bar clicks to the visible panel chrome", async () => {
    render(<App />);

    const panel = await screen.findByTestId("aptos-panel-selectedComponents");
    const header = panel.querySelector(".dot-test-detail-drag-bar");
    const body = panel.querySelector(".dot-test-detail-body");
    const collapseButton = within(panel).getByRole("button", { name: "Collapse items panel" });
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

  it("keeps preview columns on the current shared spacing rail", async () => {
    render(<App />);

    await waitForBrowserRows();

    const row = await waitFor(() => {
      const result = document.querySelector<HTMLElement>(".comp-row.selection-mode .row-header-trigger");
      expect(result).toBeTruthy();
      return result as HTMLElement;
    });
    const previewCluster = row.querySelector<HTMLElement>(".selection-preview-cluster");
    const previewCells = Array.from(previewCluster?.querySelectorAll<HTMLElement>("[data-preview-column]") ?? []);

    expect(previewCells.map((cell) => cell.dataset.previewColumn)).toEqual(["champions", "augments", "components"]);
    previewCells.forEach((cell) => {
      expect(cell).toHaveClass("selection-preview-cell");
    });
  });

  it("filters the build browser by the current search control", async () => {
    const uniqueComp = findUniqueDisplayComp();
    const hiddenComp = dataset.comps.find((candidate) => getDisplayTitle(candidate.title) !== getDisplayTitle(uniqueComp.title));

    if (!hiddenComp) {
      throw new Error("Expected a second comp for filter coverage");
    }

    render(<App />);

    await waitForBrowserRows();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: getDisplayTitle(uniqueComp.title) } });

    await waitFor(() => {
      expect(getCompRow(uniqueComp)).toBeInTheDocument();
      expect(getCompRow(hiddenComp)).not.toBeInTheDocument();
    });
  });

  it("hides and restores provider rows from the source visibility control", async () => {
    const user = userEvent.setup();
    const sourceName = getSourceDisplayName(dataset.comps[0].sources[0]?.name ?? "");
    const sourceComp = dataset.comps.find(
      (comp) => getSourceDisplayName(comp.sources[0]?.name ?? "") === sourceName
    );
    const otherComp = dataset.comps.find(
      (comp) => getSourceDisplayName(comp.sources[0]?.name ?? "") !== sourceName
    );

    if (!sourceComp || !otherComp) {
      throw new Error("Expected comps from at least two sources");
    }

    render(<App />);

    await waitForBrowserRows();
    expect(getCompRow(sourceComp)).toBeInTheDocument();
    expect(getCompRow(otherComp)).toBeInTheDocument();

    const sourceGroup = screen.getByRole("group", { name: "Source visibility" });
    await user.click(within(sourceGroup).getByRole("button", { name: sourceName }));

    await waitFor(() => {
      expect(getCompRow(sourceComp)).not.toBeInTheDocument();
      expect(getCompRow(otherComp)).toBeInTheDocument();
    });

    await user.click(within(sourceGroup).getByRole("button", { name: sourceName }));
    await waitFor(() => expect(getCompRow(sourceComp)).toBeInTheDocument());
  });

  it("dedupes Meepsie in the similarity panel and ranks the browser from that panel", async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitForBrowserRows();

    const similarityPanel = screen.getByTestId("aptos-panel-selectedSimilarities");
    const searchInput = within(similarityPanel).getByLabelText("Search similarity filter options");
    fireEvent.change(searchInput, { target: { value: "Meepsie" } });

    const meepsieButtons = within(similarityPanel).getAllByRole("button", { name: "Toggle champion Meepsie" });
    expect(meepsieButtons).toHaveLength(1);

    await user.click(meepsieButtons[0]);

    await waitFor(() => {
      expect(within(similarityPanel).getByText("1 selected")).toBeInTheDocument();
      expect(within(screen.getByTestId("aptos-panel-browser")).getByText(/Similarity ranked records/i)).toBeInTheDocument();
    });
    expect(within(screen.getByTestId("aptos-panel-browser")).getByRole("button", { name: "Sort by similarity" }))
      .toHaveAttribute("aria-sort", "descending");
  });

  it("allows duplicate component picks in the current similarity panel", async () => {
    const user = userEvent.setup();
    const componentLabel = COMPONENT_LABELS["sparring-gloves"];

    render(<App />);

    const similarityPanel = await screen.findByTestId("aptos-panel-selectedSimilarities");
    const componentButton = within(similarityPanel).getByRole("button", {
      name: `Toggle component ${componentLabel}`
    });

    await user.click(componentButton);
    await user.click(componentButton);

    await waitFor(() => {
      expect(within(similarityPanel).getByText("2 selected")).toBeInTheDocument();
      expect(within(componentButton).getByText("2")).toBeInTheDocument();
    });

    fireEvent.contextMenu(componentButton);
    await waitFor(() => {
      expect(within(similarityPanel).getByText("1 selected")).toBeInTheDocument();
      expect(within(componentButton).getByText("1")).toBeInTheDocument();
    });
  });

  it("keeps board view phase controls independent from build browser phase controls", async () => {
    const user = userEvent.setup();
    const comp = findCompWithDifferentEarlyAndLateBoards();
    const lateChampionId = phaseChampionIds(comp, "late").find((championId) => !phaseChampionIds(comp, "early").includes(championId));
    const lateChampion = lateChampionId ? dataset.championsById[lateChampionId] : null;

    if (!lateChampion) {
      throw new Error("Expected a late-only champion for board phase coverage");
    }

    render(<App />);

    await selectComp(user, comp);

    const boardPanel = screen.getByTestId("aptos-panel-selectedBoard");
    expect(within(boardPanel).getByRole("button", { name: `Inspect champion ${lateChampion.name}` })).toBeInTheDocument();

    const buildPhaseControl = screen.getByRole("group", { name: "Build Phase" });
    await user.click(within(buildPhaseControl).getByRole("button", { name: "early" }));

    await waitFor(() => {
      expect(within(buildPhaseControl).getByRole("button", { name: "early" })).toHaveClass("active");
      expect(within(boardPanel).getByRole("button", { name: `Inspect champion ${lateChampion.name}` })).toBeInTheDocument();
      expect(within(boardPanel).getByText("late board")).toBeInTheDocument();
    });
  });

  it("shows only provider-native board phases for TFTFlow comps", async () => {
    const user = userEvent.setup();
    const comp = findTftFlowCompWithLimitedNativeBoards();
    const phases = nativeBoardPhases(comp);

    render(<App />);

    await selectComp(user, comp);

    const boardPanel = screen.getByTestId("aptos-panel-selectedBoard");
    const boardPhaseControl = within(boardPanel).getByRole("group", { name: "Board Phase" });
    const buttonLabels = within(boardPhaseControl).getAllByRole("button").map((button) => button.textContent?.trim());

    expect(buttonLabels).toEqual(phases);
    for (const phase of PHASES.filter((candidate) => !phases.includes(candidate))) {
      expect(within(boardPhaseControl).queryByRole("button", { name: phase })).not.toBeInTheDocument();
    }
  });

  it("renders game plan notes as a tactical action stack", async () => {
    const user = userEvent.setup();
    const { comp, phase, gamePlan, noteCount } = findGamePlanCase();

    render(<App />);

    await selectComp(user, comp);
    if (phase !== "late") {
      await user.click(within(screen.getByRole("group", { name: "Build Phase" })).getByRole("button", { name: phase }));
    }

    const gamePlanPanel = screen.getByTestId("aptos-panel-selectedGamePlan");
    const actionStack = within(gamePlanPanel).getByRole("list", { name: `${phase} game plan actions` });
    const rows = within(actionStack).getAllByRole("listitem");

    expect(within(gamePlanPanel).getByText(`${phase} plan`)).toBeInTheDocument();
    expect(within(gamePlanPanel).getByText(`${noteCount} actions`)).toBeInTheDocument();
    expect(rows).toHaveLength(noteCount);
    expect(rows[0]).toHaveTextContent("01");
    expect(rows[0]).toHaveTextContent(gamePlan[0].title);
    const firstLineMatch = gamePlan[0].lines[0].match(/^(.+?):\s*(.+)$/);
    if (firstLineMatch) {
      expect(rows[0]).toHaveTextContent(firstLineMatch[1]);
      expect(rows[0]).toHaveTextContent(firstLineMatch[2]);
    } else {
      expect(rows[0]).toHaveTextContent(gamePlan[0].lines[0]);
    }
  });

  it("renders item holders with compact recipe icons in the Items panel", async () => {
    const user = userEvent.setup();
    const { comp, phase, holder, item } = findRecipeHolderCase();

    render(<App />);

    await selectComp(user, comp);
    if (phase !== "late") {
      await user.click(within(screen.getByRole("group", { name: "Build Phase" })).getByRole("button", { name: phase }));
    }

    const itemsPanel = screen.getByTestId("aptos-panel-selectedComponents");
    const holderGroup = await within(itemsPanel).findByRole("group", {
      name: `${holder.champion.name} assigned items`
    });
    const itemButton = within(holderGroup).getByRole("button", {
      name: new RegExp(`Inspect ${escapeRegExp(item.item.name)} on ${escapeRegExp(holder.champion.name)}\\. Recipe:`)
    });

    expect(itemButton).toHaveClass("has-recipe");
    expect(itemButton.querySelectorAll(".dot-test-holder-item-recipe img")).toHaveLength(item.recipe.length);
  });

  it("renders Mobalytics champion recommended items in the inspector", async () => {
    const user = userEvent.setup();
    const { comp, phase, champion, recommendedItem } = findChampionRecommendedItemInspectorCase();

    render(<App />);

    await selectComp(user, comp);
    const boardPanel = screen.getByTestId("aptos-panel-selectedBoard");
    if (phase !== "late") {
      await user.click(within(boardPanel).getByRole("button", { name: phase }));
    }

    await user.click(within(boardPanel).getAllByRole("button", { name: `Inspect champion ${champion.name}` })[0]);

    const inspectorPanel = screen.getByTestId("aptos-panel-inspector");
    expect(await within(inspectorPanel).findByTestId("inspector-title")).toHaveTextContent(champion.name);
    expect(within(inspectorPanel).getByText("Recommended items")).toBeInTheDocument();
    expect(within(inspectorPanel).getByAltText(recommendedItem.name)).toBeInTheDocument();
  });

  it("resolves trait emblem item displays from synergy fallback data", () => {
    const clonedDataset = datasetSchema.parse(JSON.parse(JSON.stringify(dataset)));
    const trait = Object.values(clonedDataset.synergiesById)[0];
    const emblemId = `${trait.id}-emblem`;

    delete clonedDataset.itemsById[emblemId];

    const emblem = getItemDisplay(clonedDataset, emblemId);

    expect(emblem.name).toBe(`${trait.name} Emblem`);
    expect(emblem.icon).toBe(trait.icon);
    expect(emblem.description).toContain(trait.name);
  });

  it("builds current similarity options without duplicate visible champion labels", () => {
    const championSection = getSimilarityEntitySections(dataset).find((section) => section.kind === "champion");

    expect(championSection).toBeDefined();
    if (!championSection) {
      return;
    }

    const names = championSection.options.map((option) => option.name);
    expect(names.filter((name) => name === "Meepsie")).toHaveLength(1);
    expect(new Set(names).size).toBe(names.length);
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
});
