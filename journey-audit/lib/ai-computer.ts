/**
 * ai-computer.ts — Anthropic Computer Use tool-loop helper (Tester vendor).
 *
 * VENDORED from Master/mesh/engine/ai-computer.js (origin: 2026-04-24
 * commit landing IM P2.10 in Master). When Master ships a meaningful
 * upstream change, port the diff here. Keep behavior parity unless a
 * Tester-specific tweak is documented inline.
 *
 * Why vendored not imported: Tester is a published npm package
 * (`@aledan007/tester`); it cannot depend on a Master-internal module.
 *
 * Reference: https://docs.anthropic.com/en/docs/build-with-claude/computer-use
 *
 * Beta header: computer-use-2025-01-24. Tool: computer_20250124.
 */

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const COMPUTER_USE_BETA = "computer-use-2025-01-24";
const COMPUTER_TOOL_TYPE = "computer_20250124";
const INTERLEAVED_THINKING_BETA = "interleaved-thinking-2025-05-14";

export interface ScreenshotResult {
  data: string;
  media_type: string;
}

export interface NormalizedAction {
  action: string;
  coordinate: number[] | null;
  text: string | null;
  raw: Record<string, unknown>;
}

export interface ExecutionOutcome {
  success?: boolean;
  error?: string;
  note?: string;
}

export interface ComputerUseTool {
  type: string;
  name: string;
  display_width_px: number;
  display_height_px: number;
  display_number?: number;
}

export interface ProgressInfo {
  turn: number;
  stopReason?: string;
  text: string;
  toolCalls: number;
}

export interface RunComputerUseAgentParams {
  model: string;
  maxTokens?: number;
  systemPrompt: string;
  userGoal: string;
  displayWidth: number;
  displayHeight: number;
  displayNumber?: number | null;
  takeScreenshot: () => Promise<ScreenshotResult>;
  executeAction: (op: NormalizedAction) => Promise<ExecutionOutcome | undefined>;
  maxTurns?: number;
  thinkingBudget?: number | null;
  onProgress?: (info: ProgressInfo) => void;
  apiKey?: string;
}

export interface RunComputerUseAgentResult {
  success: boolean;
  turns: number;
  finalText?: string;
  tokens: { input: number; output: number; cacheRead: number; cacheCreation: number };
  error?: string;
}

/**
 * Sonnet 4.5+ / Opus 4.x support extended thinking. Older models silently
 * skip the budget — this matches Master/mesh/engine/ai-provider.js
 * supportsExtendedThinking().
 */
function supportsExtendedThinking(model: string): boolean {
  return /claude-(opus-4|sonnet-4|opus-3-7|sonnet-3-7)/i.test(model);
}

export function buildComputerTool({
  displayWidth,
  displayHeight,
  displayNumber = null,
}: {
  displayWidth: number;
  displayHeight: number;
  displayNumber?: number | null;
}): ComputerUseTool {
  if (!Number.isInteger(displayWidth) || displayWidth <= 0) throw new Error("displayWidth positive integer required");
  if (!Number.isInteger(displayHeight) || displayHeight <= 0) throw new Error("displayHeight positive integer required");
  const tool: ComputerUseTool = {
    type: COMPUTER_TOOL_TYPE,
    name: "computer",
    display_width_px: displayWidth,
    display_height_px: displayHeight,
  };
  if (displayNumber !== null && displayNumber !== undefined) tool.display_number = displayNumber;
  return tool;
}

export function normalizeComputerAction(input: unknown): NormalizedAction {
  if (!input || typeof input !== "object") throw new Error("computer action input required");
  const obj = input as Record<string, unknown>;
  if (typeof obj.action !== "string") throw new Error("computer.action string required");
  return {
    action: obj.action,
    coordinate: Array.isArray(obj.coordinate) ? (obj.coordinate as number[]) : null,
    text: typeof obj.text === "string" ? obj.text : null,
    raw: obj,
  };
}

export async function runComputerUseAgent(
  params: RunComputerUseAgentParams,
): Promise<RunComputerUseAgentResult> {
  const {
    model,
    maxTokens = 4096,
    systemPrompt,
    userGoal,
    displayWidth,
    displayHeight,
    displayNumber = null,
    takeScreenshot,
    executeAction,
    maxTurns = 40,
    thinkingBudget = null,
    onProgress = null,
    apiKey: explicitKey,
  } = params;

  if (!model) throw new Error("model required");
  if (!systemPrompt) throw new Error("systemPrompt required");
  if (!userGoal) throw new Error("userGoal required");
  if (typeof takeScreenshot !== "function") throw new Error("takeScreenshot function required");
  if (typeof executeAction !== "function") throw new Error("executeAction function required");

  const apiKey = explicitKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "ANTHROPIC_API_KEY not available",
      turns: 0,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    };
  }

  const computerTool = buildComputerTool({ displayWidth, displayHeight, displayNumber });
  const tools: ComputerUseTool[] = [computerTool];

  const wantsThinking = thinkingBudget && Number.isFinite(thinkingBudget) && thinkingBudget >= 1024;
  const thinkingEnabled = wantsThinking && supportsExtendedThinking(model);
  if (wantsThinking && !thinkingEnabled) {
    console.log(
      `[ai-computer] thinkingBudget=${thinkingBudget} ignored — model ${model} does not support extended thinking.`,
    );
  }

  const betas: string[] = [COMPUTER_USE_BETA];
  if (thinkingEnabled) betas.push(INTERLEAVED_THINKING_BETA);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": API_VERSION,
    "anthropic-beta": betas.join(","),
  };

  const messages: Array<{ role: string; content: unknown }> = [{ role: "user", content: userGoal }];
  const totals = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  let turn = 0;
  let finalText = "";

  while (turn < maxTurns) {
    turn++;

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      tools,
    };
    if (thinkingEnabled) {
      body.thinking = { type: "enabled", budget_tokens: thinkingBudget };
      if ((body.max_tokens as number) <= (thinkingBudget as number)) {
        body.max_tokens = (thinkingBudget as number) + 4096;
      }
    }

    const res = await fetch(MESSAGES_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `Computer-use API ${res.status}: ${errText.slice(0, 400)}`,
        turns: turn,
        tokens: totals,
        finalText,
      };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const usage = (data.usage as Record<string, number>) || {};
    totals.input += usage.input_tokens || 0;
    totals.output += usage.output_tokens || 0;
    totals.cacheRead += usage.cache_read_input_tokens || 0;
    totals.cacheCreation += usage.cache_creation_input_tokens || 0;

    const content = (data.content as Array<Record<string, unknown>>) || [];
    const textBlocks = content.filter((b) => b.type === "text");
    const toolUseBlocks = content.filter((b) => b.type === "tool_use");

    for (const t of textBlocks) {
      if (typeof t.text === "string" && t.text) finalText += (finalText ? "\n" : "") + t.text;
    }

    if (onProgress) {
      onProgress({
        turn,
        stopReason: data.stop_reason as string | undefined,
        text: textBlocks.map((t) => (t.text as string) || "").join("\n"),
        toolCalls: toolUseBlocks.length,
      });
    }

    if (toolUseBlocks.length === 0 || data.stop_reason === "end_turn") {
      return { success: true, turns: turn, finalText, tokens: totals };
    }

    messages.push({ role: "assistant", content });
    const toolResults: Array<Record<string, unknown>> = [];
    for (const block of toolUseBlocks) {
      const blockId = block.id as string;
      if (block.name !== "computer") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: blockId,
          content: JSON.stringify({ error: `unknown tool: ${block.name}` }),
          is_error: true,
        });
        continue;
      }

      let normalized: NormalizedAction;
      try {
        normalized = normalizeComputerAction(block.input);
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: blockId,
          content: JSON.stringify({ error: (err as Error).message }),
          is_error: true,
        });
        continue;
      }

      if (normalized.action === "screenshot") {
        try {
          const shot = await takeScreenshot();
          if (!shot?.data || !shot?.media_type) {
            throw new Error("takeScreenshot must return {data, media_type}");
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: blockId,
            content: [
              { type: "image", source: { type: "base64", media_type: shot.media_type, data: shot.data } },
            ],
          });
        } catch (err) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: blockId,
            content: JSON.stringify({ error: `screenshot failed: ${(err as Error).message}` }),
            is_error: true,
          });
        }
        continue;
      }

      try {
        const outcome = await executeAction(normalized);
        if (outcome?.success === false) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: blockId,
            content: JSON.stringify({ error: outcome.error || "action failed", note: outcome.note || null }),
            is_error: true,
          });
          continue;
        }
        const shot = await takeScreenshot();
        const payload: Array<Record<string, unknown>> = [];
        payload.push({
          type: "text",
          text: outcome?.note ? outcome.note : `ok: ${normalized.action}`,
        });
        payload.push({
          type: "image",
          source: { type: "base64", media_type: shot.media_type, data: shot.data },
        });
        toolResults.push({ type: "tool_result", tool_use_id: blockId, content: payload });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: blockId,
          content: JSON.stringify({ error: (err as Error).message || String(err) }),
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  return {
    success: false,
    error: `maxTurns (${maxTurns}) reached without end_turn`,
    turns: turn,
    tokens: totals,
    finalText,
  };
}

export const COMPUTER_CONSTANTS = {
  MESSAGES_URL,
  API_VERSION,
  COMPUTER_USE_BETA,
  COMPUTER_TOOL_TYPE,
} as const;
