import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { LevellingGuideContent, parseLevellingGuideLine } from "../src/components/DetailPane";

describe("LevellingGuideContent", () => {
  test("renders extra route notes as labelled notes instead of numbered fallback rows", () => {
    render(
      <LevellingGuideContent
        section={{
          title: "Levelling guide",
          lines: [
            "Level 4 at 2-1 - hold pairs",
            "Stay level 5 through 3-1 - slow roll above 50 gold",
            "Level 6 after hitting core 3-stars",
            "Push levels after stabilizing"
          ]
        }}
      />
    );

    expect(screen.getByText("Push levels after stabilizing")).toBeInTheDocument();
    expect(screen.getByText("NOTE")).toBeInTheDocument();
    expect(screen.queryByText("01")).not.toBeInTheDocument();
  });

  test("leaves conditional provider leveling advice intact as notes", () => {
    const conditionalLine =
      "If high HP, consider waiting until 5-5 to go level 9. If low HP and can afford to go 9, do so.";

    expect(parseLevellingGuideLine(conditionalLine)).toBeNull();

    render(
      <LevellingGuideContent
        section={{
          title: "Levelling guide",
          lines: ["Level to 8. Roll for desired comp until stable.", conditionalLine]
        }}
      />
    );

    expect(screen.getByText(conditionalLine)).toBeInTheDocument();
    expect(screen.queryByText(/go \./i)).not.toBeInTheDocument();
  });
});
