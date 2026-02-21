/**
 * AI Element Finder
 * When CSS selectors fail, use Claude Vision to locate elements on the page.
 * Takes a screenshot, sends it to Claude with a description, gets coordinates back.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { ElementLocation } from './types'

let anthropicClient: Anthropic | null = null

function getClient(apiKey?: string): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY })
  }
  return anthropicClient
}

/**
 * Use Claude Vision to find an element on a page screenshot.
 * Returns bounding box coordinates for the element.
 */
export async function findElementByVision(
  screenshotBase64: string,
  description: string,
  apiKey?: string,
): Promise<ElementLocation | null> {
  const client = getClient(apiKey)

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 },
          },
          {
            type: 'text',
            text: `You are a UI element locator. Find the element described below in this screenshot and return its approximate bounding box coordinates.

Element to find: "${description}"

Respond with ONLY a JSON object (no markdown, no explanation):
{"x": <left px>, "y": <top px>, "width": <width px>, "height": <height px>, "confidence": <0.0-1.0>, "selector": "<best CSS selector guess>", "description": "<what you found>"}

If the element is not visible in the screenshot, respond with:
{"x": 0, "y": 0, "width": 0, "height": 0, "confidence": 0, "selector": "", "description": "Element not found"}`,
          },
        ],
      }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (parsed.confidence < 0.3) return null

    return {
      bbox: { x: parsed.x, y: parsed.y, width: parsed.width, height: parsed.height },
      confidence: parsed.confidence,
      suggestedSelector: parsed.selector || undefined,
      description: parsed.description || description,
    }
  } catch (err) {
    console.error('[element-finder] Vision API error:', err instanceof Error ? err.message : err)
    return null
  }
}
