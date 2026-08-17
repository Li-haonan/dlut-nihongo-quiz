const SYNC_PREFIX = 'DLUTSYNC:'
const SYNC_VERSION = 1
const SENSITIVE_SETTING_KEYS = new Set(['aiConfig'])

export interface SyncSummary {
  exportedAt: string
  attempts: number
  learnedQuestions: number
  wrongQuestions: number
  bookmarks: number
  tagStats: number
  sessions: number
}

type BackupData = Record<string, unknown> & {
  version: number
  exportedAt?: string
  attempts?: unknown[]
  questionStats?: unknown[]
  tagStats?: unknown[]
  sessions?: unknown[]
  settings?: unknown[]
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error('同步码编码无效')
  }
  try {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
  } catch {
    throw new Error('同步码编码无效')
  }
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持解压同步码')
  try {
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    throw new Error('同步码已损坏或不完整')
  }
}

function validateBackup(data: unknown): asserts data is BackupData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('同步数据结构无效')
  }
  const obj = data as Record<string, unknown>
  if (typeof obj.version !== 'number') throw new Error('同步数据缺少版本信息')
  for (const key of ['attempts', 'questionStats', 'tagStats', 'sessions', 'settings']) {
    if (!Array.isArray(obj[key])) throw new Error(`同步数据中的 ${key} 格式无效`)
  }
  for (const stat of obj.questionStats as unknown[]) {
    if (
      !stat ||
      typeof stat !== 'object' ||
      typeof (stat as Record<string, unknown>).questionId !== 'string'
    ) {
      throw new Error('同步数据中的题目统计格式无效')
    }
  }
  for (const setting of obj.settings as unknown[]) {
    if (
      !setting ||
      typeof setting !== 'object' ||
      typeof (setting as Record<string, unknown>).key !== 'string' ||
      typeof (setting as Record<string, unknown>).value !== 'string'
    ) {
      throw new Error('同步数据中的设置格式无效')
    }
  }
}

function removeSensitiveSettings(data: BackupData): BackupData {
  return {
    ...data,
    settings: (data.settings ?? []).filter((setting) => {
      if (!setting || typeof setting !== 'object') return true
      return !SENSITIVE_SETTING_KEYS.has(String((setting as Record<string, unknown>).key))
    }),
  }
}

export async function createSyncCode(backupJson: string): Promise<string> {
  let parsed: unknown
  try {
    parsed = JSON.parse(backupJson)
  } catch {
    throw new Error('无法生成同步码：本地数据不是有效 JSON')
  }
  validateBackup(parsed)
  const payload = JSON.stringify({
    syncVersion: SYNC_VERSION,
    data: removeSensitiveSettings(parsed),
  })
  const bytes = new TextEncoder().encode(payload)
  const compressed = await gzip(bytes)
  return `${SYNC_PREFIX}${compressed ? 'G' : 'B'}:${bytesToBase64(compressed ?? bytes)}`
}

export async function parseSyncCode(code: string): Promise<{ json: string; summary: SyncSummary }> {
  const normalized = code.trim().replace(/\s+/g, '')
  if (!normalized.startsWith(SYNC_PREFIX)) throw new Error(`同步码必须以 ${SYNC_PREFIX} 开头`)
  const match = normalized.slice(SYNC_PREFIX.length).match(/^([GB]):(.+)$/)
  if (!match) throw new Error('同步码格式无效')
  let bytes = base64ToBytes(match[2])
  if (match[1] === 'G') bytes = await gunzip(bytes)

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error('同步码内容不是有效数据')
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    (payload as Record<string, unknown>).syncVersion !== SYNC_VERSION
  ) {
    throw new Error('同步码版本不受支持')
  }
  const data = (payload as Record<string, unknown>).data
  validateBackup(data)
  const safeData = removeSensitiveSettings(data)
  const stats = safeData.questionStats as Array<Record<string, unknown>>
  return {
    json: JSON.stringify(safeData),
    summary: {
      exportedAt: typeof safeData.exportedAt === 'string' ? safeData.exportedAt : '',
      attempts: safeData.attempts!.length,
      learnedQuestions: stats.filter((item) => Number(item.attemptCount) > 0).length,
      wrongQuestions: stats.filter(
        (item) => Number(item.wrongCount) > 0 && Number(item.masteryLevel) < 3,
      ).length,
      bookmarks: stats.filter((item) => item.isBookmarked === true).length,
      tagStats: safeData.tagStats!.length,
      sessions: safeData.sessions!.length,
    },
  }
}

export { SYNC_PREFIX }
