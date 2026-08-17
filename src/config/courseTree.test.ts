import { describe, it, expect } from 'vitest'
import { COURSE_TREE } from './courseTree'
import { CATEGORIES } from './categories'

describe('COURSE_TREE config', () => {
  it('exposes only the power AI question bank', () => {
    expect(COURSE_TREE).toHaveLength(1)
    expect(COURSE_TREE[0]).toMatchObject({
      type: 'leaf',
      key: 'power-ai',
      label: '电力人工智能',
      category: 'power-ai',
      subBank: null,
    })
  })

  it('points every category leaf to a visible category', () => {
    const visibleCategories = new Set(CATEGORIES.map((category) => category.key))
    for (const node of COURSE_TREE) {
      if (node.category) expect(visibleCategories.has(node.category)).toBe(true)
    }
  })
})
