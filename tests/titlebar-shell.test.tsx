import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TitleBar } from "../src/components/TitleBar";

function installShell() {
  const shell = {
    minimize: vi.fn(async () => undefined),
    toggleMaximize: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    isMaximized: vi.fn(async () => false),
    onMaximizedChange: vi.fn(() => () => undefined),
    openExternal: vi.fn(async () => undefined)
  };

  Object.defineProperty(window, "opnrShell", {
    configurable: true,
    value: shell
  });

  return shell;
}

describe("TitleBar shell bridge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "opnrShell");
  });

  it("keeps the frameless titlebar draggable in Tauri", () => {
    installShell();
    const { container } = render(<TitleBar />);

    expect(container.querySelector(".titlebar-drag")).toHaveAttribute("data-tauri-drag-region", "true");
  });

  it("routes chrome buttons through the desktop shell adapter", async () => {
    const shell = installShell();
    const user = userEvent.setup();

    render(<TitleBar variant="controls" />);
    await user.click(screen.getByRole("button", { name: "Minimize" }));
    await user.click(screen.getByRole("button", { name: "Maximize" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(shell.minimize).toHaveBeenCalledTimes(1);
    expect(shell.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(shell.close).toHaveBeenCalledTimes(1);
  });
});
