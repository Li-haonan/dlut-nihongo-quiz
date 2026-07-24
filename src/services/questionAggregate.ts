/**
 * 题目统计聚合层 — 分组/标签/语法点统计、分类计数、相关数据打包
 *
 * 依赖 questionRepository 的缓存 + Dexie 数据库。
 */
import type { Question, Category, QuestionStats } from '../types/question'
import { CATEGORIES } from '../config/categories'
import { db } from '../db/database'
import {
  getQuestions,
  loadQuestionBank,
  filterVisibleQuestions,
  onClearDerivedCaches,
} from './questionRepository'

// ─── 派生缓存 ─────────────────────────────────────────────
const groupsCache = new Map<Category, { groupId: string; groupTitle: string; count: number }[]>()
const tagsCache = new Map<Category, { tag: string; count: number }[]>()
const grammarPointsCache = new Map<Category, { point: string; count: number }[]>()

// 注册清除回调：题库重新加载时自动清除
onClearDerivedCaches(() => {
  groupsCache.clear()
  tagsCache.clear()
  grammarPointsCache.clear()
  cachedCounts = null
})

// ─── 分组统计 ─────────────────────────────────────────────
export function getAllGroups(
  category: Category = 'japanese2',
): { groupId: string; groupTitle: string; count: number }[] {
  const cached = groupsCache.get(category)
  if (cached) return cached
  const list = getQuestions(category)
  const map = new Map<string, { groupTitle: string; count: number }>()
  for (const q of list) {
    const existing = map.get(q.groupId)
    if (existing) existing.count++
    else map.set(q.groupId, { groupTitle: q.groupTitle, count: 1 })
  }
  const result = [...map.entries()].map(([groupId, v]) => ({
    groupId,
    groupTitle: v.groupTitle,
    count: v.count,
  }))
  groupsCache.set(category, result)
  return result
}

// ─── 标签统计 ─────────────────────────────────────────────
export function getAllTags(category: Category = 'japanese2'): { tag: string; count: number }[] {
  const cached = tagsCache.get(category)
  if (cached) return cached
  const map = new Map<string, number>()
  const list = getQuestions(category)
  for (const q of list) {
    for (const t of q.tags) {
      map.set(t, (map.get(t) || 0) + 1)
    }
  }
  const result = [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
  tagsCache.set(category, result)
  return result
}

// ─── 语法点统计 ───────────────────────────────────────────
export function getAllGrammarPoints(
  category: Category = 'japanese2',
): { point: string; count: number }[] {
  const cached = grammarPointsCache.get(category)
  if (cached) return cached
  const map = new Map<string, number>()
  const list = getQuestions(category)
  for (const q of list) {
    for (const p of q.grammarPoints) {
      map.set(p, (map.get(p) || 0) + 1)
    }
  }
  const result = [...map.entries()]
    .map(([point, count]) => ({ point, count }))
    .sort((a, b) => b.count - a.count)
  grammarPointsCache.set(category, result)
  return result
}

// ─── 分类计数 ─────────────────────────────────────────────
let cachedCounts: Record<Category, number> | null = null
let countsCacheTime = 0
const COUNTS_CACHE_TTL = 60_000 // 1 分钟 TTL

export async function getCategoryCounts(): Promise<Record<Category, number>> {
  // 缓存有效期内直接返回
  if (cachedCounts && Date.now() - countsCacheTime < COUNTS_CACHE_TTL) {
    return cachedCounts
  }

  try {
    const base = import.meta.env.BASE_URL
    const resp = await fetch(`${base}_meta.json`)
    if (resp.ok) {
      const meta = await resp.json()
      const result = {} as Record<Category, number>
      for (const c of CATEGORIES) {
        result[c.key] = meta[c.key]?.count ?? 0
      }
      cachedCounts = result
      countsCacheTime = Date.now()
      return result
    }
  } catch {
    console.warn('_meta.json 不存在或解析失败，走 fallback')
  }
  const entries = await Promise.all(
    CATEGORIES.map(async (c) => [c.key, (await loadQuestionBank(c.key)).length] as const),
  )
  const result = entries.reduce(
    (acc, [k, n]) => {
      acc[k] = n
      return acc
    },
    {} as Record<Category, number>,
  )
  cachedCounts = result
  countsCacheTime = Date.now()
  return result
}

// ─── 相关数据打包 ─────────────────────────────────────────
export interface RelevantData {
  questions: Question[]
  stats: QuestionStats[]
  statsMap: Map<string, QuestionStats>
}

/**
 * 把"题库 + 该分类相关 stats"打包，调用方一次返回，避免各页面各扫一遍。
 * 按当前分类的题目 ID 分块查询 questionStats，避免加载全表。
 */
export async function getRelevantData(
  category: Category,
  allStats?: QuestionStats[],
  options?: { isUnlocked?: boolean },
): Promise<RelevantData> {
  const allQuestions = await loadQuestionBank(category)
  const questions =
    options?.isUnlocked === false ? filterVisibleQuestions(allQuestions, false) : allQuestions
  const validIds = questions.map((q) => q.id)

  let stats: QuestionStats[]
  if (allStats) {
    // 调用方已传入预加载的 stats，直接过滤
    const idSet = new Set(validIds)
    stats = allStats.filter((s) => idSet.has(s.questionId))
  } else {
    // 按 ID 分块查询，避免全表扫描
    const BATCH_SIZE = 100
    stats = []
    for (let i = 0; i < validIds.length; i += BATCH_SIZE) {
      const batch = validIds.slice(i, i + BATCH_SIZE)
      const batchStats = await db.questionStats.bulkGet(batch)
      for (const s of batchStats) {
        if (s) stats.push(s)
      }
    }
  }
  return { questions, stats, statsMap: new Map(stats.map((s) => [s.questionId, s])) }
}
