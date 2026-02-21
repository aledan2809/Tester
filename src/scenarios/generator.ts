/**
 * AI Scenario Generator
 * Uses Claude API to generate intelligent test scenarios from discovered elements.
 * Falls back to built-in templates if AI is unavailable.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SiteMap, TestScenario, DiscoveredPage } from '../core/types'
import { generateTemplateScenarios } from './templates'

let client: Anthropic | null = null

function getClient(apiKey?: string): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY })
  }
  return client
}

/**
 * Generate test scenarios from a site map.
 * Uses AI for intelligent scenario generation, with template fallback.
 */
export async function generateScenarios(
  siteMap: SiteMap,
  apiKey?: string,
  model = 'claude-sonnet-4-5-20250929',
): Promise<TestScenario[]> {
  // Always generate template-based scenarios
  const templateScenarios = generateTemplateScenarios(siteMap)

  // If no API key, return templates only
  if (!apiKey && !process.env.ANTHROPIC_API_KEY) {
    return templateScenarios
  }

  try {
    // Generate AI scenarios for pages with interactive elements
    const interactivePages = siteMap.pages.filter(
      p => p.forms.length > 0 || p.buttons.length > 0 || p.isLoginPage
    )

    if (interactivePages.length === 0) {
      return templateScenarios
    }

    // Batch pages to avoid token limits (max 5 pages per API call)
    const batches = chunk(interactivePages, 5)
    const aiScenarios: TestScenario[] = []

    for (const batch of batches) {
      const scenarios = await generateAiScenariosForPages(batch, siteMap.baseUrl, apiKey, model)
      aiScenarios.push(...scenarios)
    }

    // Merge: AI scenarios + templates (deduplicate by URL)
    return mergeScenarios(aiScenarios, templateScenarios)
  } catch (err) {
    console.warn('[generator] AI scenario generation failed, using templates:', err instanceof Error ? err.message : err)
    return templateScenarios
  }
}

/**
 * Generate AI scenarios for a batch of pages.
 */
async function generateAiScenariosForPages(
  pages: DiscoveredPage[],
  baseUrl: string,
  apiKey?: string,
  model = 'claude-sonnet-4-5-20250929',
): Promise<TestScenario[]> {
  const anthropic = getClient(apiKey)

  const pageDescriptions = pages.map(p => ({
    url: p.url,
    title: p.title,
    forms: p.forms.map(f => ({
      fields: f.fields.map(field => ({
        name: field.name,
        type: field.type,
        required: field.required,
        label: field.label,
      })),
      method: f.method,
      submitSelector: f.submitSelector,
    })),
    buttons: p.buttons.map(b => ({ text: b.text, selector: b.selector })),
    isLoginPage: p.isLoginPage,
    isMfaPage: p.isMfaPage,
  }))

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `You are a QA test automation expert. Generate functional test scenarios for these web pages.

Website: ${baseUrl}

Pages to test:
${JSON.stringify(pageDescriptions, null, 2)}

Generate test scenarios as a JSON array. Each scenario should have:
- id: string (format: "AI-001", "AI-002", etc.)
- name: short descriptive name
- description: what this test verifies
- category: one of "auth", "navigation", "forms", "functionality", "error_handling"
- priority: "critical", "high", "medium", or "low"
- steps: array of {action, target?, value?, description}
  - action: "navigate", "click", "fill", "select", "wait", "pressKey"
  - target: CSS selector
  - value: text to type, URL to navigate, etc.
- assertions: array of {type, target?, expected?, operator?, description}
  - type: "element_exists", "element_visible", "text_contains", "url_contains", "no_console_errors", "no_network_errors"
- tags: string array

Guidelines:
- Test both positive AND negative paths (valid + invalid input)
- For forms: test required field validation, email format, edge cases
- For login: test wrong credentials, empty fields
- For buttons: test that clicking produces expected UI changes
- Use CSS selectors from the discovered elements
- Keep scenarios focused and independent
- Max 3-5 scenarios per page

Respond with ONLY the JSON array, no markdown wrapping.`,
    }],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

  // Parse JSON (handle potential markdown wrapping)
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  try {
    const parsed = JSON.parse(jsonMatch[0]) as TestScenario[]
    return parsed.filter(s => s.id && s.name && s.steps?.length > 0)
  } catch {
    console.warn('[generator] Failed to parse AI response as JSON')
    return []
  }
}

// ─── Helpers ────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

function mergeScenarios(aiScenarios: TestScenario[], templateScenarios: TestScenario[]): TestScenario[] {
  // AI scenarios take priority. Keep template scenarios for pages not covered by AI.
  const aiUrls = new Set<string>()

  for (const s of aiScenarios) {
    const navStep = s.steps.find(step => step.action === 'navigate')
    if (navStep?.value) aiUrls.add(navStep.value)
  }

  const uniqueTemplates = templateScenarios.filter(s => {
    const navStep = s.steps.find(step => step.action === 'navigate')
    // Keep template if AI didn't generate a scenario for this URL
    // Always keep cross-page checks (broken links, console errors)
    if (!navStep?.value) return true
    return !aiUrls.has(navStep.value)
  })

  return [...aiScenarios, ...uniqueTemplates]
}
