import type { Category } from '../types/question'

export interface TreeNode {
  type: 'group' | 'leaf'
  key: string
  label: string
  icon?: string
  children?: TreeNode[]
  category?: Category
  subBank?: string | null
  requireUnlock?: boolean
  route?: string
}

export const COURSE_TREE: TreeNode[] = [
  {
    type: 'leaf',
    key: 'power-ai',
    label: '电力人工智能',
    category: 'power-ai',
    subBank: null,
    icon: '电',
  },
]

export function findLeafByKey(key: string): TreeNode | undefined {
  const stack = [...COURSE_TREE]
  while (stack.length) {
    const n = stack.pop()!
    if (n.type === 'leaf' && n.key === key) return n
    if (n.children) stack.push(...n.children)
  }
  return undefined
}

export function findLeafByCategory(category: Category): TreeNode | undefined {
  const stack = [...COURSE_TREE]
  while (stack.length) {
    const n = stack.pop()!
    if (n.type === 'leaf' && n.category === category) return n
    if (n.children) stack.push(...n.children)
  }
  return undefined
}
