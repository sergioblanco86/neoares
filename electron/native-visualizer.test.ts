import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ BrowserWindow: class {}, ipcMain: {}, MessageChannelMain: class {}, screen: {} }));
import { clampWindowBounds } from "./native-visualizer";

describe("native window geometry", () => {
  const primary = { x: 0, y: 0, width: 1147, height: 715 };
  const external = { x: -1920, y: -293, width: 1920, height: 1009 };
  it("keeps native negative monitor coordinates and clamps inside the matching work area", () => {
    expect(clampWindowBounds({ x: -1900, y: -280, width: 960, height: 600 }, [primary, external])).toEqual({ x: -1900, y: -280, width: 960, height: 600 });
  });
  it("recovers disconnected monitor/oversized bounds on the current display", () => {
    expect(clampWindowBounds({ x: -1900, y: -280, width: 2000, height: 2000 }, [primary])).toEqual(primary);
    expect(clampWindowBounds({ x: 9000, y: 9000, width: 800, height: 500 }, [primary])).toEqual({ x: 347, y: 215, width: 800, height: 500 });
  });
  it("enforces small-window minimums without exceeding a smaller work area", () => {
    expect(clampWindowBounds({ x: 0, y: 0, width: 50, height: 30 }, [primary])).toEqual({ x: 0, y: 0, width: 360, height: 240 });
    expect(clampWindowBounds({ x: 0, y: 0, width: 50, height: 30 }, [{ x: 0, y: 0, width: 320, height: 200 }])).toEqual({ x: 0, y: 0, width: 320, height: 200 });
  });
});
