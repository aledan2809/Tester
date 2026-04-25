/**
 * computer-use-fallback.ts — Playwright wrapper around the Computer Use
 * helper. When Playwright/CSS selectors fail (dynamic modal, lazy-load,
 * unpredictable DOM), hand the loop to Claude Vision: capture screenshot,
 * ask Claude where to click, execute via page.mouse / page.keyboard,
 * repeat until end_turn.
 *
 * Single entry point: `tryComputerUseStep(page, intent, options?)`.
 *
 * Gating: callers should only invoke this when env
 * TESTER_COMPUTER_USE_FALLBACK=1 is set; the helper itself does not
 * gate (callers can wrap or not wrap as they see fit). This keeps the
 * helper testable in isolation.
 *
 * Anthropic credit: every call to this helper costs Sonnet/Opus tokens
 * (vision + tool loop). Use with discretion — wrap inside a try/catch
 * for the Playwright primary path first, fallback only on failure.
 */

import type { Page } from "@playwright/test";
import {
  runComputerUseAgent,
  type NormalizedAction,
  type ScreenshotResult,
  type ExecutionOutcome,
  type RunComputerUseAgentResult,
} from "./ai-computer";

export interface TryComputerUseStepOptions {
  /** Sonnet 4.5+ or Opus 4.x. Default: claude-sonnet-4-5-20250929. */
  model?: string;
  /** Hard cap on agent turns. Default 12 (one-shot resolution should
   * fit; if more is needed, the step is probably mis-specified). */
  maxTurns?: number;
  /** Override system prompt. Default: a concise journey-audit prompt. */
  systemPrompt?: string;
  /** Optional progress callback for telemetry. */
  onProgress?: (turnInfo: { turn: number; stopReason?: string; toolCalls: number }) => void;
  /** Override Anthropic API key (test injection). */
  apiKey?: string;
}

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const DEFAULT_MAX_TURNS = 12;
const DEFAULT_SYSTEM_PROMPT = `You are guiding a journey-audit through a web app where the
Playwright primary path failed. Take a screenshot first to see the page.
Then perform exactly the user's stated intent — nothing more. If the
intent is ambiguous (e.g. multiple matching buttons), pick the most
prominent / first-looking one. Stop after the action succeeds and the
expected next page state is visible. Be conservative: do not navigate
away unless the intent says so.`;

/**
 * Try to fulfill the given intent on the page using Claude Computer Use.
 *
 * @param page Playwright Page (or Page-like with screenshot/mouse/keyboard).
 * @param intent Natural-language description of what to do, e.g.
 *               "Click the Login button on the top-right of the page".
 * @returns RunComputerUseAgentResult including success flag + turns +
 *          tokens consumed + finalText.
 */
export async function tryComputerUseStep(
  page: Page,
  intent: string,
  options: TryComputerUseStepOptions = {},
): Promise<RunComputerUseAgentResult> {
  if (!page) throw new Error("page required");
  if (!intent || typeof intent !== "string") throw new Error("intent (string) required");

  const viewport = page.viewportSize?.() || { width: 1280, height: 720 };

  const takeScreenshot = async (): Promise<ScreenshotResult> => {
    const buf = await page.screenshot({ type: "png" });
    return {
      data: Buffer.from(buf).toString("base64"),
      media_type: "image/png",
    };
  };

  const executeAction = async (op: NormalizedAction): Promise<ExecutionOutcome> => {
    try {
      switch (op.action) {
        case "left_click": {
          if (!op.coordinate || op.coordinate.length < 2) {
            return { success: false, error: "left_click requires coordinate [x, y]" };
          }
          const [x, y] = op.coordinate;
          await page.mouse.click(x, y);
          return { success: true, note: `clicked (${x}, ${y})` };
        }
        case "right_click": {
          if (!op.coordinate || op.coordinate.length < 2) {
            return { success: false, error: "right_click requires coordinate [x, y]" };
          }
          const [x, y] = op.coordinate;
          await page.mouse.click(x, y, { button: "right" });
          return { success: true, note: `right-clicked (${x}, ${y})` };
        }
        case "double_click": {
          if (!op.coordinate || op.coordinate.length < 2) {
            return { success: false, error: "double_click requires coordinate [x, y]" };
          }
          const [x, y] = op.coordinate;
          await page.mouse.dblclick(x, y);
          return { success: true, note: `double-clicked (${x}, ${y})` };
        }
        case "mouse_move": {
          if (!op.coordinate || op.coordinate.length < 2) {
            return { success: false, error: "mouse_move requires coordinate [x, y]" };
          }
          const [x, y] = op.coordinate;
          await page.mouse.move(x, y);
          return { success: true, note: `moved to (${x}, ${y})` };
        }
        case "left_click_drag": {
          if (!op.coordinate || op.coordinate.length < 2) {
            return { success: false, error: "left_click_drag requires coordinate [x, y]" };
          }
          const [x, y] = op.coordinate;
          await page.mouse.down();
          await page.mouse.move(x, y);
          await page.mouse.up();
          return { success: true, note: `dragged to (${x}, ${y})` };
        }
        case "type": {
          if (!op.text) {
            return { success: false, error: "type requires text" };
          }
          await page.keyboard.type(op.text);
          return { success: true, note: `typed ${op.text.length} chars` };
        }
        case "key": {
          if (!op.text) {
            return { success: false, error: "key requires text (key name)" };
          }
          await page.keyboard.press(op.text);
          return { success: true, note: `pressed ${op.text}` };
        }
        case "wait": {
          // Anthropic computer tool wait is in seconds (per docs).
          // Cap at 5s to avoid runaway sleeps.
          const seconds = Math.min(5, Number((op.raw as Record<string, unknown>).duration ?? 1));
          await page.waitForTimeout(seconds * 1000);
          return { success: true, note: `waited ${seconds}s` };
        }
        case "cursor_position": {
          // No direct API to read cursor position from Playwright; ignore.
          return { success: true, note: "cursor_position not tracked (no-op)" };
        }
        default:
          return { success: false, error: `unsupported action: ${op.action}` };
      }
    } catch (err) {
      return { success: false, error: (err as Error).message || String(err) };
    }
  };

  const userGoal = `Intent: ${intent}\n\nWhen the action is complete, stop. Do not perform additional steps beyond the intent.`;

  return runComputerUseAgent({
    model: options.model || DEFAULT_MODEL,
    maxTokens: 4096,
    systemPrompt: options.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    userGoal,
    displayWidth: viewport.width,
    displayHeight: viewport.height,
    takeScreenshot,
    executeAction,
    maxTurns: options.maxTurns || DEFAULT_MAX_TURNS,
    onProgress: options.onProgress
      ? (info) => options.onProgress!({ turn: info.turn, stopReason: info.stopReason, toolCalls: info.toolCalls })
      : undefined,
    apiKey: options.apiKey,
  });
}

export const FALLBACK_CONSTANTS = {
  DEFAULT_MODEL,
  DEFAULT_MAX_TURNS,
  DEFAULT_SYSTEM_PROMPT,
} as const;
