/**
 * T-000 — Lessons module public API.
 */

export type {
  Lesson,
  LessonSeverity,
  LessonStatus,
  LessonContext,
  DetectionType,
  DetectionRule,
  Prevention,
  AutoFix,
  Diagnosis,
  SymptomSignature,
  ScanMatch,
  LoaderError,
  LoaderResult,
} from './schema'

export { loadLessons, parseYamlLesson, findLessonsDir } from './loader'
export { scan, scanFile } from './scanner'
export { diagnose, diagnoseFile } from './diagnoser'
export type { DiagnosisMatch } from './diagnoser'
export { loadStats, recordHits, statsSummary, statsFilePath } from './stats'
export type { LessonStat, StatsMap } from './stats'
