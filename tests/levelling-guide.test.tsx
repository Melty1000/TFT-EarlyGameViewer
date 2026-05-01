import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { LevellingGuideContent } from "../src/components/DetailPane";

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
});
