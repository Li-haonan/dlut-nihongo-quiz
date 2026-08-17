import type { SyncSummary } from './syncCode'

export const PROGRESS_CODE_PREFIX = 'DLUTPROG:'
export const MAX_PROGRESS_CODE_LENGTH = 1000

const GROUPS = [
  { prefix: 'power-ai-single-q', count: 366 },
  { prefix: 'power-ai-multi-q', count: 237 },
  { prefix: 'power-ai-judge-q', count: 286 },
] as const
const QUESTION_COUNT = GROUPS.reduce((sum, group) => sum + group.count, 0)
const BITS_PER_QUESTION = 6
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

function writeBits(bytes: Uint8Array, bitOffset: number, value: number) {
  for (let bit = 0; bit < BITS_PER_QUESTION; bit += 1) {
    if (value & (1 << bit)) bytes[(bitOffset + bit) >> 3] |= 1 << ((bitOffset + bit) & 7)
  }
}

function readBits(bytes: Uint8Array, bitOffset: number): number {
  let value = 0
  for (let bit = 0; bit < BITS_PER_QUESTION; bit += 1) {
    if (bytes[(bitOffset + bit) >> 3] & (1 << ((bitOffset + bit) & 7))) value |= 1 << bit
  }
  return value
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
 * Six bits per known question: mastery (3), bookmark, has-wrong-answer, attempted.
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
    const mastery = Math.min(5, Math.max(0, Number(stat.masteryLevel) || 0))
    const value =
      mastery |
      (stat.isBookmarked === true ? 1 << 3 : 0) |
      (Number(stat.wrongCount) > 0 ? 1 << 4 : 0) |
      (Number(stat.attemptCount) > 0 ? 1 << 5 : 0)
    states[index] = value
  }

  const populated = Array.from(states.entries()).filter(([, value]) => value !== 0)
  const denseLength = HEADER_BYTES + Math.ceil((QUESTION_COUNT * BITS_PER_QUESTION) / 8)
  const sparseLength = SPARSE_HEADER_BYTES + populated.length * 2
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
      const packed = (index << BITS_PER_QUESTION) | value
      bytes[SPARSE_HEADER_BYTES + position * 2] = packed >> 8
      bytes[SPARSE_HEADER_BYTES + position * 2 + 1] = packed & 0xff
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

  const code = `${PROGRESS_CODE_PREFIX}2:${toBase64Url(bytes)}`
  if (code.length > MAX_PROGRESS_CODE_LENGTH) throw new Error('进度码超过 1000 字符')
  return code
}

export function parseProgressCode(code: string): { json: string; summary: SyncSummary } {
  const normalized = code.trim().replace(/\s+/g, '')
  if (!normalized.startsWith(PROGRESS_CODE_PREFIX)) throw new Error('进度码前缀无效')
  const match = normalized.slice(PROGRESS_CODE_PREFIX.length).match(/^([12]):(.+)$/)
  if (!match) throw new Error('进度码版本无效')
  const version = Number(match[1])
  const bytes = fromBase64Url(match[2])
  const denseLength = HEADER_BYTES + Math.ceil((QUESTION_COUNT * BITS_PER_QUESTION) / 8)
  const states = new Uint8Array(QUESTION_COUNT)

  if (version === 1) {
    if (bytes.length !== denseLength || bytes[0] !== 1) throw new Error('进度码长度或版本无效')
    for (let index = 0; index < QUESTION_COUNT; index += 1) {
      states[index] = readBits(bytes, HEADER_BYTES * 8 + index * BITS_PER_QUESTION)
    }
  } else if (bytes[0] === 0) {
    if (bytes.length !== denseLength) throw new Error('进度码长度无效')
    for (let index = 0; index < QUESTION_COUNT; index += 1) {
      states[index] = readBits(bytes, HEADER_BYTES * 8 + index * BITS_PER_QUESTION)
    }
  } else if (bytes[0] === 1) {
    if (bytes.length < SPARSE_HEADER_BYTES) throw new Error('进度码长度无效')
    const count = (bytes[4] << 8) | bytes[5]
    if (bytes.length !== SPARSE_HEADER_BYTES + count * 2) throw new Error('进度码长度无效')
    for (let position = 0; position < count; position += 1) {
      const packed =
        (bytes[SPARSE_HEADER_BYTES + position * 2] << 8) |
        bytes[SPARSE_HEADER_BYTES + position * 2 + 1]
      const index = packed >> BITS_PER_QUESTION
      if (index >= QUESTION_COUNT || states[index] !== 0) throw new Error('进度码题目索引无效')
      states[index] = packed & 0x3f
    }
  } else {
    throw new Error('进度码模式无效')
  }

  const questionStats: Array<Record<string, unknown>> = []
  for (let index = 0; index < QUESTION_COUNT; index += 1) {
    const value = states[index]
    if (value === 0) continue
    const masteryLevel = value & 7
    const attempted = Boolean(value & (1 << 5))
    const wrong = Boolean(value & (1 << 4))
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
      isBookmarked: Boolean(value & (1 << 3)),
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
