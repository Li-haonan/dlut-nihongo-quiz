import { createSyncCode, parseSyncCode, type SyncSummary } from './syncCode'

export const SHORT_SYNC_PREFIX = 'DLUT-'
const REQUEST_TIMEOUT_MS = 15_000

type FetchLike = typeof fetch

function relayUrl(): string {
  return String(import.meta.env.VITE_SYNC_RELAY_URL || '')
    .trim()
    .replace(/\/+$/, '')
}

function normalizeShortCode(value: string): string {
  const compact = value.trim().toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
  if (!/^DLUT-(?:[A-Z2-9]{4}-){2}[A-Z2-9]{4}$/.test(compact)) {
    throw new Error('短同步码格式无效，应类似 DLUT-ABCD-EFGH-JK23')
  }
  return compact
}

async function request(url: string, options: RequestInit, fetcher: FetchLike): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetcher(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('同步服务响应超时，请稍后重试')
    }
    throw new Error('无法连接同步服务，请检查网络后重试')
  } finally {
    clearTimeout(timer)
  }
}

export function isShortSyncCode(value: string): boolean {
  return value.trim().toUpperCase().startsWith(SHORT_SYNC_PREFIX)
}

/** Uploads the already compressed portable code; the relay only stores opaque text. */
export async function createShortSyncCode(
  backupJson: string,
  endpoint = relayUrl(),
  fetcher: FetchLike = fetch,
): Promise<string> {
  if (!endpoint) throw new Error('短同步服务尚未配置，请联系站点管理员')
  const payload = await createSyncCode(backupJson)
  const response = await request(
    endpoint.replace(/\/+$/, ''),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    },
    fetcher,
  )
  if (!response.ok) throw new Error(response.status === 413 ? '同步数据过大' : '生成短同步码失败')
  const result = (await response.json()) as { code?: unknown }
  if (typeof result.code !== 'string') throw new Error('同步服务返回了无效数据')
  return normalizeShortCode(result.code)
}

export async function parseTransferCode(
  code: string,
  endpoint = relayUrl(),
  fetcher: FetchLike = fetch,
): Promise<{ json: string; summary: SyncSummary }> {
  if (!isShortSyncCode(code)) return parseSyncCode(code)
  if (!endpoint) throw new Error('短同步服务尚未配置，请联系站点管理员')
  const normalized = normalizeShortCode(code)
  const response = await request(
    `${endpoint.replace(/\/+$/, '')}/${encodeURIComponent(normalized)}`,
    { method: 'GET' },
    fetcher,
  )
  if (response.status === 404) throw new Error('短同步码不存在或已过期')
  if (!response.ok) throw new Error('读取短同步码失败，请稍后重试')
  const result = (await response.json()) as { payload?: unknown }
  if (typeof result.payload !== 'string') throw new Error('同步服务返回了无效数据')
  return parseSyncCode(result.payload)
}
