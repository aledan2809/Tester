import { readFileSync } from 'fs'
const data = JSON.parse(readFileSync('/c/Projects/Tester/reports/pro-coach-test/results.json', 'utf8'))
console.log('Score:', data.summary.overallScore)
console.log('Passed/Total:', data.summary.passed + '/' + data.summary.totalScenarios)
const failed = data.scenarios.filter(s => s.status === 'failed' || s.status === 'error')
for (const s of failed) {
  console.log('\nFAIL:', s.name || 'UNDEF', '| status:', s.status, '| err:', s.error || '(none)')
  for (const st of (s.steps || [])) {
    if (!st.success) console.log('  step', st.stepIndex, st.action + ':', st.error)
  }
}
const cat = {}
for (const s of data.scenarios) { cat[s.category] = (cat[s.category]||0)+1 }
console.log('\nCategories:', JSON.stringify(cat))
console.log('\nAll scenarios:')
for (const s of data.scenarios) {
  console.log(' ', s.status === 'passed' ? '✓' : '✗', s.name || 'UNDEF', '|', s.category)
}
