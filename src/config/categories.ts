import type { Category, SubBankMeta } from '../types/question'

export interface CategoryMeta {
  key: Category
  short: string
  long: string
  desc: string
  icon: string
  bankFile: string
  groupOrder?: string[]
  groupViewTitle?: string
  groupViewHint?: string
  subBanks?: SubBankMeta[]
}

export const CATEGORIES: CategoryMeta[] = [
  {
    key: 'power-ai',
    short: '电力人工智能',
    long: '电力人工智能',
    desc: '889题 · 单选/多选/判断 · 电力行业人工智能业务理论',
    icon: '电',
    bankFile: 'power-ai-question-bank.json',
    groupOrder: ['power-ai-single', 'power-ai-multi', 'power-ai-judge'],
    groupViewTitle: '题型',
    groupViewHint: '按单选题、多选题和判断题分类练习。',
  },
]

const CATEGORY_MAP: Record<Category, CategoryMeta> = CATEGORIES.reduce(
  (acc, c) => {
    acc[c.key] = c
    return acc
  },
  {} as Record<Category, CategoryMeta>,
)

export function getCategoryMeta(cat: Category): CategoryMeta {
  return CATEGORY_MAP[cat]
}

export const NO_SHUFFLE_CATEGORIES: ReadonlySet<Category> = new Set(['power-ai'])

export const GROUPED_CATEGORIES: ReadonlySet<Category> = new Set(['power-ai'])
