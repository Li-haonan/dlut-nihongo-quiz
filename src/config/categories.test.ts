import { describe, it, expect } from 'vitest'
import {
  CATEGORIES,
  getCategoryMeta,
  NO_SHUFFLE_CATEGORIES,
  GROUPED_CATEGORIES,
} from './categories'

describe('CATEGORIES config', () => {
  it('exposes only the power AI question bank', () => {
    expect(CATEGORIES.map((c) => c.key)).toEqual(['power-ai'])
  })

  it('returns the power AI metadata', () => {
    const category = getCategoryMeta('power-ai')
    expect(category.long).toBe('电力人工智能')
    expect(category.bankFile).toBe('power-ai-question-bank.json')
  })

  it('configures power AI as a grouped, non-shuffled category', () => {
    expect(NO_SHUFFLE_CATEGORIES).toEqual(new Set(['power-ai']))
    expect(GROUPED_CATEGORIES).toEqual(new Set(['power-ai']))
  })
})
