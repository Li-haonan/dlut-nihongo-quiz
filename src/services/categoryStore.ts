import { ref } from 'vue'
import type { Ref } from 'vue'
import { getSetting, setSetting } from '../db/database'
import { STORAGE_KEYS } from '../constants'
import type { Category } from '../types/question'
import { CATEGORIES } from '../config/categories'

const activeCategory: Ref<Category> = ref<Category>('power-ai')
const activeSubBankKey: Ref<string | null> = ref<string | null>(null)
let loadPromise: Promise<Category> | null = null

// 旧值 word/grammar 在 v0.4 合并到 japanese2 后已废弃，自动迁移到 japanese2。
function migrateLegacy(value: string | undefined): Category {
  return CATEGORIES.some((category) => category.key === value) ? (value as Category) : 'power-ai'
}

export async function loadActiveCategory(): Promise<Category> {
  // 用 promise 缓存防止并发调用时重复读取 IndexedDB
  if (!loadPromise) {
    loadPromise = (async () => {
      const stored = await getSetting(STORAGE_KEYS.ACTIVE_CATEGORY, 'power-ai' as Category)
      activeCategory.value = migrateLegacy(stored)
      return activeCategory.value
    })()
  }
  return loadPromise
}

export async function setActiveCategory(cat: Category): Promise<void> {
  activeCategory.value = cat
  activeSubBankKey.value = null
  await setSetting(STORAGE_KEYS.ACTIVE_CATEGORY, cat)
}

export function getActiveCategory(): Category {
  return activeCategory.value
}

export function useActiveCategory(): Ref<Category> {
  return activeCategory
}

export function getActiveSubBankKey(): string | null {
  return activeSubBankKey.value
}

export function setActiveSubBankKey(key: string | null): void {
  activeSubBankKey.value = key
}

export function useActiveSubBankKey(): Ref<string | null> {
  return activeSubBankKey
}
