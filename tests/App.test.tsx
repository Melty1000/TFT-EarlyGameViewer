import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import generatedDataset from "../public/data/tft-set17.json";
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
});
