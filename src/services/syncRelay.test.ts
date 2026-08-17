import { describe, expect, it, vi } from 'vitest'
import { createShortSyncCode, parseTransferCode } from './syncRelay'

const backup = JSON.stringify({
  version: 1,
  exportedAt: '2026-08-17T00:00:00.000Z',
  attempts: [],
  questionStats: [],
  tagStats: [],
  sessions: [],
  settings: [],
})

describe('short sync relay', () => {
  it('uploads an opaque portable payload and returns a short code', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).payload).toMatch(/^DLUTSYNC:/)
      return new Response(JSON.stringify({ code: 'DLUT-ABCD-EFGH-JK23' }))
    }) as typeof fetch

    await expect(createShortSyncCode(backup, 'https://relay.test/sync', fetcher)).resolves.toBe(
      'DLUT-ABCD-EFGH-JK23',
    )
  })

  it('downloads and validates the long payload behind a short code', async () => {
    const { createSyncCode } = await import('./syncCode')
    const payload = await createSyncCode(backup)
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ payload }))) as typeof fetch
    const result = await parseTransferCode(
      'dlut-abcd-efgh-jk23',
      'https://relay.test/sync',
      fetcher,
    )
    expect(result.summary.attempts).toBe(0)
  })
})
