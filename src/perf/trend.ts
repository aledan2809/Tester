/**
 * T-010 — Historical trend storage.
 *
 * Appends a JSONL record per run to `coverage/perf-trend.jsonl`. Each
 * line: `{ ts: ISO, runs: PerfRun[] }`. Reader collapses to per-route
 * time series + computes week-over-week deltas for reports.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { PerfRun, PerfMetrics, PerfMetricKey } from './budget'

const METRIC_KEYS: PerfMetricKey[] = ['fcp_ms', 'lcp_ms', 'tti_ms', 'cls', 'transfer_bytes']

export interface TrendRecord {
  ts: string
  runs: PerfRun[]
}

export function defaultTrendPath(projectRoot: string): string {
  return path.join(projectRoot, 'coverage', 'perf-trend.jsonl')
}

export function appendTrendRecord(projectRoot: string, record: TrendRecord): string {
  const file = defaultTrendPath(projectRoot)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8')
  return file
}

export function readTrend(projectRoot: string): TrendRecord[] {
  const file = defaultTrendPath(projectRoot)
  if (!fs.existsSync(file)) return []
  const out: TrendRecord[] = []
  const raw = fs.readFileSync(file, 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed) as TrendRecord
      if (parsed && typeof parsed.ts === 'string' && Array.isArray(parsed.runs)) {
        out.push(parsed)
      }
    } catch {
      // skip corrupt line
    }
  }
  return out
}

export interface TimeSeriesPoint {
  ts: string
  metrics: PerfMetrics
}

export function perRouteSeries(records: TrendRecord[]): Record<string, TimeSeriesPoint[]> {
  const out: Record<string, TimeSeriesPoint[]> = {}
  for (const rec of records) {
    for (const r of rec.runs) {
      if (!out[r.route]) out[r.route] = []
      out[r.route].push({ ts: rec.ts, metrics: r.metrics })
    }
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.ts < b.ts ? -1 : 1))
  return out
}

export interface WeekOverWeekEntry {
  route: string
  metric: PerfMetricKey
  prev_week_median: number
  curr_week_median: number
  delta: number
  percent: number
}

function median(nums: number[]): number | undefined {
  if (nums.length === 0) return undefined
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function computeWeekOverWeek(
  records: TrendRecord[],
  now: Date = new Date(),
): WeekOverWeekEntry[] {
  const series = perRouteSeries(records)
  const weekMs = 7 * 24 * 60 * 60 * 1000
  const currStart = now.getTime() - weekMs
  const prevStart = now.getTime() - 2 * weekMs
  const entries: WeekOverWeekEntry[] = []
  for (const [route, points] of Object.entries(series)) {
    for (const m of METRIC_KEYS) {
      const curr: number[] = []
      const prev: number[] = []
      for (const p of points) {
        const t = Date.parse(p.ts)
        if (Number.isNaN(t)) continue
        const v = p.metrics[m]
        if (typeof v !== 'number' || !Number.isFinite(v)) continue
        if (t >= currStart) curr.push(v)
        else if (t >= prevStart) prev.push(v)
      }
      const cm = median(curr)
      const pm = median(prev)
      if (cm === undefined || pm === undefined) continue
      const delta = cm - pm
      const percent = pm !== 0 ? (delta / pm) * 100 : 0
      entries.push({
        route,
        metric: m,
        prev_week_median: pm,
        curr_week_median: cm,
        delta,
        percent,
      })
    }
  }
  return entries.sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent))
}

export function renderTrendMarkdown(entries: WeekOverWeekEntry[]): string {
  const lines: string[] = []
  lines.push(`## Perf trend — week over week`)
  lines.push('')
  if (entries.length === 0) {
    lines.push('_Not enough data: need samples in both the current + prior week windows._')
    return lines.join('\n')
  }
  lines.push(`| Route | Metric | Prev median | Curr median | Δ | Δ% |`)
  lines.push(`|-------|--------|-------------|-------------|----|----|`)
  for (const e of entries.slice(0, 30)) {
    const sign = e.delta > 0 ? '+' : ''
    lines.push(
      `| \`${e.route}\` | ${e.metric} | ${e.prev_week_median} | ${e.curr_week_median} | ${sign}${e.delta} | ${sign}${e.percent.toFixed(1)}% |`,
    )
  }
  return lines.join('\n')
}
