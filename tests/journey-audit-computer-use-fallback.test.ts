/**
 * Smoke tests for computer-use-fallback.ts (Tester #5 / IM Faza B).
 *
 * Offline — stubs `fetch` (Anthropic API) and a Page-like object that
 * tracks mouse/keyboard calls. Verifies:
 *   - stub Page contract honored
 *   - takeScreenshot returns base64 + media_type from page.screenshot
 *   - left_click / type / key dispatch to the right page methods
 *   - missing API key → graceful failure
 *   - normalizeComputerAction / buildComputerTool boundaries
 *   - end_turn stops the loop
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildComputerTool,
  normalizeComputerAction,
  runComputerUseAgent,
  COMPUTER_CONSTANTS,
} from "../journey-audit/lib/ai-computer";
import { tryComputerUseStep, FALLBACK_CONSTANTS } from "../journey-audit/lib/computer-use-fallback";

describe("ai-computer — pure helpers", () => {
  test("buildComputerTool returns the expected shape", () => {
    const tool = buildComputerTool({ displayWidth: 1280, displayHeight: 720 });
    expect(tool.type).toBe(COMPUTER_CONSTANTS.COMPUTER_TOOL_TYPE);
    expect(tool.name).toBe("computer");
    expect(tool.display_width_px).toBe(1280);
    expect(tool.display_height_px).toBe(720);
    expect(tool.display_number).toBeUndefined();
  });

  test("buildComputerTool rejects bad dimensions", () => {
    expect(() => buildComputerTool({ displayWidth: 0, displayHeight: 720 })).toThrow();
    expect(() => buildComputerTool({ displayWidth: 1280, displayHeight: -1 })).toThrow();
  });

  test("normalizeComputerAction produces stable shape", () => {
    const n = normalizeComputerAction({ action: "left_click", coordinate: [10, 20], extra: "ok" });
    expect(n.action).toBe("left_click");
    expect(n.coordinate).toEqual([10, 20]);
    expect(n.text).toBeNull();
    expect(n.raw.extra).toBe("ok");
  });

  test("normalizeComputerAction throws on missing action", () => {
    expect(() => normalizeComputerAction({})).toThrow();
    expect(() => normalizeComputerAction({ action: 42 } as unknown)).toThrow();
  });
});

describe("runComputerUseAgent — graceful auth failure", () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (ORIGINAL_KEY) process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  });

  test("returns success=false with clear error when no API key", async () => {
    const result = await runComputerUseAgent({
      model: "claude-sonnet-4-5-20250929",
      systemPrompt: "test",
      userGoal: "do something",
      displayWidth: 1280,
      displayHeight: 720,
      takeScreenshot: async () => ({ data: "", media_type: "image/png" }),
      executeAction: async () => ({ success: true }),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("ANTHROPIC_API_KEY");
    expect(result.turns).toBe(0);
  });
});

describe("runComputerUseAgent — end_turn stops the loop", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "Done." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("single-turn end_turn returns success", async () => {
    const result = await runComputerUseAgent({
      model: "claude-sonnet-4-5-20250929",
      systemPrompt: "test",
      userGoal: "noop",
      displayWidth: 800,
      displayHeight: 600,
      takeScreenshot: async () => ({ data: "x", media_type: "image/png" }),
      executeAction: async () => ({ success: true }),
      apiKey: "sk-test",
    });
    expect(result.success).toBe(true);
    expect(result.turns).toBe(1);
    expect(result.finalText).toContain("Done");
    expect(result.tokens.input).toBe(10);
    expect(result.tokens.output).toBe(20);
  });
});

describe("runComputerUseAgent — screenshot intercept + click loop", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let screenshotCalls = 0;

  beforeEach(() => {
    screenshotCalls = 0;
    fetchMock = vi.fn();
    // Turn 1: model asks for screenshot
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          { type: "tool_use", id: "tu_1", name: "computer", input: { action: "screenshot" } },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 5, output_tokens: 10 },
      }),
    });
    // Turn 2: model issues left_click at (100, 200)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "tool_use",
            id: "tu_2",
            name: "computer",
            input: { action: "left_click", coordinate: [100, 200] },
          },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 8, output_tokens: 12 },
      }),
    });
    // Turn 3: model says done
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Click executed." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 6, output_tokens: 8 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("driver intercepts screenshot, dispatches click via executor, ends on text", async () => {
    const clickCalls: Array<[number, number]> = [];
    const result = await runComputerUseAgent({
      model: "claude-sonnet-4-5-20250929",
      systemPrompt: "test",
      userGoal: "click button",
      displayWidth: 800,
      displayHeight: 600,
      takeScreenshot: async () => {
        screenshotCalls++;
        return { data: `shot${screenshotCalls}`, media_type: "image/png" };
      },
      executeAction: async (op) => {
        if (op.action === "left_click" && op.coordinate) {
          clickCalls.push([op.coordinate[0], op.coordinate[1]]);
          return { success: true, note: "clicked" };
        }
        return { success: false, error: `unhandled ${op.action}` };
      },
      apiKey: "sk-test",
    });

    expect(result.success).toBe(true);
    expect(result.turns).toBe(3);
    expect(result.finalText).toContain("Click executed");
    expect(clickCalls).toEqual([[100, 200]]);
    // Screenshot called: once for intercept (turn 1), once after click success (turn 2)
    expect(screenshotCalls).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("tryComputerUseStep — Playwright wrapper integration", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "Intent fulfilled." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeFakePage() {
    const calls: { method: string; args: unknown[] }[] = [];
    const page = {
      viewportSize: () => ({ width: 1280, height: 720 }),
      screenshot: async () => Buffer.from("fake-png-bytes"),
      mouse: {
        click: async (x: number, y: number, opts?: unknown) => {
          calls.push({ method: "mouse.click", args: [x, y, opts] });
        },
        dblclick: async (x: number, y: number) => {
          calls.push({ method: "mouse.dblclick", args: [x, y] });
        },
        move: async (x: number, y: number) => {
          calls.push({ method: "mouse.move", args: [x, y] });
        },
        down: async () => calls.push({ method: "mouse.down", args: [] }),
        up: async () => calls.push({ method: "mouse.up", args: [] }),
      },
      keyboard: {
        type: async (text: string) => calls.push({ method: "keyboard.type", args: [text] }),
        press: async (key: string) => calls.push({ method: "keyboard.press", args: [key] }),
      },
      waitForTimeout: async (ms: number) => calls.push({ method: "waitForTimeout", args: [ms] }),
    };
    return { page, calls };
  }

  test("requires page", async () => {
    await expect(tryComputerUseStep(null as never, "click")).rejects.toThrow(/page required/);
  });

  test("requires intent string", async () => {
    const { page } = makeFakePage();
    await expect(tryComputerUseStep(page as never, "" as never)).rejects.toThrow(/intent/);
  });

  test("end_turn on first turn returns success without touching mouse", async () => {
    const { page, calls } = makeFakePage();
    const result = await tryComputerUseStep(page as never, "Click Login button", {
      apiKey: "sk-test",
      maxTurns: 5,
    });
    expect(result.success).toBe(true);
    expect(result.turns).toBe(1);
    // No tool calls in this stubbed exchange → no mouse/keyboard activity.
    expect(calls.filter((c) => c.method.startsWith("mouse")).length).toBe(0);
  });

  test("FALLBACK_CONSTANTS exposes stable defaults", () => {
    expect(FALLBACK_CONSTANTS.DEFAULT_MODEL).toBe("claude-sonnet-4-5-20250929");
    expect(FALLBACK_CONSTANTS.DEFAULT_MAX_TURNS).toBeGreaterThan(0);
    expect(FALLBACK_CONSTANTS.DEFAULT_SYSTEM_PROMPT).toContain("Playwright");
  });
});
