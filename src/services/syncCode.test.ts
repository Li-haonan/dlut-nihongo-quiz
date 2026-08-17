import { describe, expect, it } from 'vitest'
import { createSyncCode, parseSyncCode, SYNC_PREFIX } from './syncCode'

const backup = JSON.stringify({
  version: 2,
  exportedAt: '2026-08-17T00:00:00.000Z',
  attempts: [{ questionId: 'q1' }],
  questionStats: [
    { questionId: 'q1', attemptCount: 2, wrongCount: 1, masteryLevel: 1, isBookmarked: true },
  ],
  tagStats: [{ tag: 'grammar' }],
  sessions: [{ mode: 'random' }],
  settings: [
    { key: 'dailyGoal', value: '20' },
    { key: 'aiConfig', value: JSON.stringify({ apiKey: 'secret' }) },
  ],
})

describe('sync code', () => {
  it('round trips migratable data and removes sensitive AI configuration', async () => {
    const code = await createSyncCode(backup)
    expect(code.startsWith(SYNC_PREFIX)).toBe(true)

    const decoded = await parseSyncCode(code)
    expect(decoded.summary).toMatchObject({
      attempts: 1,
      learnedQuestions: 1,
      wrongQuestions: 1,
      bookmarks: 1,
    })
    expect(decoded.json).toContain('dailyGoal')
    expect(decoded.json).not.toContain('secret')
    expect(decoded.json).not.toContain('aiConfig')
  })

  it('rejects invalid prefixes and invalid table structures', async () => {
    await expect(parseSyncCode('WRONG:value')).rejects.toThrow('DLUTSYNC:')
    const malformed = JSON.stringify({ version: 2, attempts: {} })
    await expect(createSyncCode(malformed)).rejects.toThrow('attempts')
  })
})
