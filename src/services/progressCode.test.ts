import { describe, expect, it } from 'vitest'
import { createProgressCode, MAX_PROGRESS_CODE_LENGTH, parseProgressCode } from './progressCode'

function fullBackup() {
  const groups = [
    ['single', 366],
    ['multi', 237],
    ['judge', 286],
  ] as const
  return JSON.stringify({
    version: 2,
    questionStats: groups.flatMap(([group, count]) =>
      Array.from({ length: count }, (_, index) => ({
        questionId: `power-ai-${group}-q${String(index + 1).padStart(4, '0')}`,
        attemptCount: 7,
        correctCount: 5,
        wrongCount: index % 2,
        masteryLevel: 1 + (index % 5),
        isBookmarked: index % 11 === 0,
      })),
    ),
    settings: [{ key: 'dailyGoal', value: '30' }],
  })
}

describe('compact progress code', () => {
  it('always fits the complete 889-question state under 1000 characters', () => {
    const code = createProgressCode(fullBackup())
    expect(code.length).toBeLessThanOrEqual(MAX_PROGRESS_CODE_LENGTH)
    expect(code.length).toBe(609)
  })

  it('restores learning, wrong-answer, bookmark, mastery, and daily-goal state', () => {
    const decoded = parseProgressCode(createProgressCode(fullBackup()))
    const data = JSON.parse(decoded.json)
    expect(data.questionStats).toHaveLength(889)
    expect(data.questionStats[0]).toMatchObject({
      questionId: 'power-ai-single-q0001',
      attemptCount: 1,
      masteryLevel: 1,
      isBookmarked: true,
    })
    expect(data.settings).toEqual([{ key: 'dailyGoal', value: '30' }])
  })

  it('uses sparse encoding for a typical partially completed bank', () => {
    const data = JSON.parse(fullBackup())
    data.questionStats = data.questionStats.slice(0, 100)
    const code = createProgressCode(JSON.stringify(data))
    expect(code.startsWith('DLUTSYNC3:')).toBe(true)
    expect(code.length).toBeLessThan(260)
    expect(parseProgressCode(code).summary.learnedQuestions).toBe(100)
  })

  it('continues to import version 3 codes using the former progress-code prefix', () => {
    const currentCode = createProgressCode(fullBackup())
    const legacyCode = currentCode.replace('DLUTSYNC3:', 'DLUTPROG:3:')

    expect(parseProgressCode(legacyCode).summary.learnedQuestions).toBe(889)
  })
})
