export const PROGRESS_CODE_PREFIX = 'DLUTPROG:'
export const MAX_PROGRESS_CODE_LENGTH = 1000

export interface ProgressSummary {
  exportedAt: string
  attempts: number
  learnedQuestions: number
  wrongQuestions: number
  bookmarks: number
  tagStats: number
  sessions: number
}

const GROUPS = [
  { prefix: 'power-ai-single-q', count: 366 },
  { prefix: 'power-ai-multi-q', count: 237 },
  { prefix: 'power-ai-judge-q', count: 286 },
] as const
const QUESTION_COUNT = GROUPS.reduce((sum, group) => sum + group.count, 0)
const BITS_PER_QUESTION = 4
const INDEX_BITS = 10
const HEADER_BYTES = 4
const SPARSE_HEADER_BYTES = 6

type BackupData = {
  version: number
  exportedAt?: string
  questionStats: Array<Record<string, unknown>>
  settings: Array<Record<string, unknown>>
}

function parseBackup(json: string): BackupData {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('无法生成进度码：本地数据不是有效 JSON')
  }
  if (!value || typeof value !== 'object') throw new Error('本地数据结构无效')
  const data = value as Record<string, unknown>
  if (!Array.isArray(data.questionStats) || !Array.isArray(data.settings)) {
    throw new Error('本地数据缺少学习进度')
  }
  return data as BackupData
}

function questionIndex(id: string): number | null {
  let offset = 0
  for (const group of GROUPS) {
    if (id.startsWith(group.prefix)) {
      const number = Number(id.slice(group.prefix.length))
      if (Number.isInteger(number) && number >= 1 && number <= group.count) {
        return offset + number - 1
      }
    }
    offset += group.count
  }
  return null
}

function questionId(index: number): string {
  let offset = 0
  for (const group of GROUPS) {
    if (index < offset + group.count) {
      return `${group.prefix}${String(index - offset + 1).padStart(4, '0')}`
    }
    offset += group.count
  }
  throw new Error('进度码包含未知题目')
}

function writeBits(bytes: Uint8Array, bitOffset: number, value: number, width = BITS_PER_QUESTION) {
  for (let bit = 0; bit < width; bit += 1) {
    if (value & (1 << bit)) bytes[(bitOffset + bit) >> 3] |= 1 << ((bitOffset + bit) & 7)
  }
}

function readBits(bytes: Uint8Array, bitOffset: number, width = BITS_PER_QUESTION): number {
  let value = 0
  for (let bit = 0; bit < width; bit += 1) {
    if (bytes[(bitOffset + bit) >> 3] & (1 << ((bitOffset + bit) & 7))) value |= 1 << bit
  }
  return value
}

type ProgressState = { mastery: number; bookmarked: boolean; wrong: boolean; attempted: boolean }

/** Maps only valid/actionable state combinations into 14 of the 16 nibble values. */
function encodeState(stat: Record<string, unknown>): number {
  const mastery = Math.min(5, Math.max(0, Number(stat.masteryLevel) || 0))
  const bookmarkBit = stat.isBookmarked === true ? 1 : 0
  if (mastery === 0) return bookmarkBit
  if (mastery === 1) return 2 + bookmarkBit
  if (mastery === 2) return 4 + (Number(stat.wrongCount) > 0 ? 2 : 0) + bookmarkBit
  return 8 + (mastery - 3) * 2 + bookmarkBit
}

function decodeState(value: number): ProgressState {
  if (value < 2) return { mastery: 0, bookmarked: value === 1, wrong: false, attempted: false }
  if (value < 4) return { mastery: 1, bookmarked: value === 3, wrong: true, attempted: true }
  if (value < 8) {
    return {
      mastery: 2,
      bookmarked: value % 2 === 1,
      wrong: value >= 6,
      attempted: true,
    }
  }
  if (value < 14) {
    return {
      mastery: 3 + Math.floor((value - 8) / 2),
      bookmarked: value % 2 === 1,
      wrong: false,
      attempted: true,
    }
  }
  throw new Error('进度码包含保留状态')
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('进度码编码无效')
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (char) =>
      char.charCodeAt(0),
    )
  } catch {
    throw new Error('进度码编码无效')
  }
}

/**
 * Four bits per known question. Attempted is derived from mastery, and historical
 * wrong flags are discarded once mastery reaches 3 because the wrong-book logic
 * already considers those questions resolved.
 * This intentionally transfers the useful learning state rather than unbounded raw history.
 */
export function createProgressCode(backupJson: string): string {
  const data = parseBackup(backupJson)
  const states = new Uint8Array(QUESTION_COUNT)
  const exportedDays = Math.floor(Date.now() / 86_400_000)
  const dailyGoal = data.settings.find((setting) => setting.key === 'dailyGoal')
  const dailyGoalValue = Math.min(
    200,
    Math.max(0, Number(dailyGoal?.value ? JSON.parse(String(dailyGoal.value)) : 0)),
  )

  for (const stat of data.questionStats) {
    const index = questionIndex(String(stat.questionId || ''))
    if (index === null) continue
    states[index] = encodeState(stat)
  }

  const populated = Array.from(states.entries()).filter(([, value]) => value !== 0)
  const denseLength = HEADER_BYTES + Math.ceil((QUESTION_COUNT * BITS_PER_QUESTION) / 8)
  const sparseLength =
    SPARSE_HEADER_BYTES + Math.ceil((populated.length * (INDEX_BITS + BITS_PER_QUESTION)) / 8)
  let bytes: Uint8Array

  if (sparseLength < denseLength) {
    bytes = new Uint8Array(sparseLength)
    bytes[0] = 1 // sparse mode
    bytes[1] = exportedDays >> 8
    bytes[2] = exportedDays & 0xff
    bytes[3] = dailyGoalValue
    bytes[4] = populated.length >> 8
    bytes[5] = populated.length & 0xff
    populated.forEach(([index, value], position) => {
      const offset = SPARSE_HEADER_BYTES * 8 + position * (INDEX_BITS + BITS_PER_QUESTION)
      writeBits(bytes, offset, index, INDEX_BITS)
      writeBits(bytes, offset + INDEX_BITS, value)
    })
  } else {
    bytes = new Uint8Array(denseLength)
    bytes[0] = 0 // dense mode
    bytes[1] = exportedDays >> 8
    bytes[2] = exportedDays & 0xff
    bytes[3] = dailyGoalValue
    states.forEach((value, index) =>
      writeBits(bytes, HEADER_BYTES * 8 + index * BITS_PER_QUESTION, value),
    )
  }

  const code = `${PROGRESS_CODE_PREFIX}3:${toBase64Url(bytes)}`
  if (code.length > MAX_PROGRESS_CODE_LENGTH) throw new Error('进度码超过 1000 字符')
  return code
}

export function parseProgressCode(code: string): { json: string; summary: ProgressSummary } {
  const normalized = code.trim().replace(/\s+/g, '')
  if (!normalized.startsWith(PROGRESS_CODE_PREFIX)) throw new Error('进度码前缀无效')
  const match = normalized.slice(PROGRESS_CODE_PREFIX.length).match(/^3:(.+)$/)
  if (!match) throw new Error('仅支持当前 DLUTPROG:3: 进度码')
  const bytes = fromBase64Url(match[1])
  const denseLength = HEADER_BYTES + Math.ceil((QUESTION_COUNT * BITS_PER_QUESTION) / 8)
  const states: Array<ProgressState | undefined> = new Array(QUESTION_COUNT)

  if (bytes[0] === 0) {
    if (bytes.length !== denseLength) throw new Error('进度码长度无效')
    for (let index = 0; index < QUESTION_COUNT; index += 1) {
      const value = readBits(bytes, HEADER_BYTES * 8 + index * BITS_PER_QUESTION)
      if (value) states[index] = decodeState(value)
    }
  } else if (bytes[0] === 1) {
    if (bytes.length < SPARSE_HEADER_BYTES) throw new Error('进度码长度无效')
    const count = (bytes[4] << 8) | bytes[5]
    const expectedLength =
      SPARSE_HEADER_BYTES + Math.ceil((count * (INDEX_BITS + BITS_PER_QUESTION)) / 8)
    if (bytes.length !== expectedLength) throw new Error('进度码长度无效')
    for (let position = 0; position < count; position += 1) {
      const offset = SPARSE_HEADER_BYTES * 8 + position * (INDEX_BITS + BITS_PER_QUESTION)
      const index = readBits(bytes, offset, INDEX_BITS)
      if (index >= QUESTION_COUNT || states[index]) throw new Error('进度码题目索引无效')
      states[index] = decodeState(readBits(bytes, offset + INDEX_BITS))
    }
  } else {
    throw new Error('进度码模式无效')
  }

  const questionStats: Array<Record<string, unknown>> = []
  for (let index = 0; index < QUESTION_COUNT; index += 1) {
    const state = states[index]
    if (!state) continue
    const { mastery: masteryLevel, attempted, wrong } = state
    questionStats.push({
      questionId: questionId(index),
      attemptCount: attempted ? 1 : 0,
      correctCount: attempted && !wrong ? 1 : 0,
      wrongCount: wrong ? 1 : 0,
      lastSelectedKey: '',
      lastCorrect: attempted && !wrong,
      lastAttemptAt: '',
      masteryLevel,
      reviewDueAt: '',
      isBookmarked: state.bookmarked,
    })
  }

  const exportedAt = new Date(((bytes[1] << 8) | bytes[2]) * 86_400_000).toISOString()
  const settings = bytes[3] ? [{ key: 'dailyGoal', value: JSON.stringify(bytes[3]) }] : []
  const learned = questionStats.filter((stat) => Number(stat.attemptCount) > 0).length
  const data = {
    version: 2,
    exportedAt,
    attempts: [],
    questionStats,
    tagStats: [],
    sessions: [],
    settings,
  }
  return {
    json: JSON.stringify(data),
    summary: {
      exportedAt,
      attempts: learned,
      learnedQuestions: learned,
      wrongQuestions: questionStats.filter(
        (stat) => Number(stat.wrongCount) > 0 && Number(stat.masteryLevel) < 3,
      ).length,
      bookmarks: questionStats.filter((stat) => stat.isBookmarked === true).length,
      tagStats: 0,
      sessions: 0,
    },
  }
}
