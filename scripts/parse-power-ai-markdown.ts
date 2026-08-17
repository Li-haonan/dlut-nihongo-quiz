import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const inputPath = path.resolve(
  __dirname,
  '../data/raw/power-ai-question-bank-dlut-quality-cleaned.md',
)
const outputPath = path.resolve(__dirname, '../public/power-ai-question-bank.json')

type QuestionType = 'single' | 'multi' | 'judgement'

const sections: Record<string, { type: QuestionType; groupId: string; title: string }> = {
  单选题: { type: 'single', groupId: 'power-ai-single', title: '电力人工智能 · 单选题' },
  多选题: { type: 'multi', groupId: 'power-ai-multi', title: '电力人工智能 · 多选题' },
  判断题: { type: 'judgement', groupId: 'power-ai-judge', title: '电力人工智能 · 判断题' },
}

const content = fs.readFileSync(inputPath, 'utf8').replace(/\r\n/g, '\n')
const blocks = content.split(/(?=^#{3,4}\s+(?:第)?\d+(?:题|\.)\s*)/m)
let currentSection: (typeof sections)[string] | undefined
const questions = []
const counters: Record<QuestionType, number> = { single: 0, multi: 0, judgement: 0 }

for (const block of blocks) {
  const sectionMatches = [...block.matchAll(/^##\s+(单选题|多选题|判断题)\s*$/gm)]
  const header = block.match(/^#{3,4}\s+(?:第)?(\d+)(?:题|\.)\s*(.*)$/m)
  if (!header || !currentSection) {
    if (sectionMatches.length) currentSection = sections[sectionMatches.at(-1)![1]]
    continue
  }

  const afterHeader = block.slice(header.index! + header[0].length).trim()
  const answerMatch = afterHeader.match(/^答案\s*[：:]\s*(.+?)\s*$/m)
  const explanationMatch = afterHeader.match(/^解析\s*[：:]\s*([\s\S]*?)(?=^##\s|\s*$)/m)
  if (!answerMatch || !explanationMatch) {
    throw new Error(`${currentSection.title}第 ${header[1]} 题缺少答案或解析`)
  }

  const beforeAnswer = afterHeader.slice(0, answerMatch.index).trim()
  const optionMatches = [...beforeAnswer.matchAll(/^([A-J])[.．、]\s*(.+)$/gm)]
  const firstOptionIndex = optionMatches[0]?.index
  const stemTail =
    firstOptionIndex === undefined ? beforeAnswer : beforeAnswer.slice(0, firstOptionIndex)
  const stem = [header[2], stemTail].filter(Boolean).join('\n').trim()
  const options = optionMatches.map((match) => ({ key: match[1], text: match[2].trim() }))

  let answerKey = answerMatch[1].replace(/[\s,，、.。]/g, '').toUpperCase()
  if (currentSection.type === 'judgement') {
    answerKey = answerKey === '对' ? '正确' : answerKey === '错' ? '错误' : answerKey
    options.push({ key: '正确', text: '正确' }, { key: '错误', text: '错误' })
  }
  if (!stem || !answerKey || (currentSection.type !== 'judgement' && options.length < 2)) {
    throw new Error(`${currentSection.title}第 ${header[1]} 题格式无效`)
  }

  counters[currentSection.type]++
  questions.push({
    id: `${currentSection.groupId}-q${String(counters[currentSection.type]).padStart(4, '0')}`,
    category: 'power-ai',
    groupId: currentSection.groupId,
    groupTitle: currentSection.title,
    numberInGroup: counters[currentSection.type],
    stem,
    options,
    answerKey,
    answerText: options
      .filter((option) => answerKey.includes(option.key))
      .map((option) => option.text)
      .join('；'),
    translation: '',
    explanation: explanationMatch[1].trim(),
    grammarPoints: [],
    tags: [currentSection.title.replace('电力人工智能 · ', '')],
    source: {
      file: path.basename(inputPath),
      group: currentSection.title,
      position: Number(header[1]),
    },
    status: 'ready',
    multiAnswer: currentSection.type === 'multi',
    questionType: currentSection.type,
  })

  // A section heading is part of the preceding question block; apply it to the next block.
  if (sectionMatches.length) currentSection = sections[sectionMatches.at(-1)![1]]
}

const expected: Record<QuestionType, number> = { single: 366, multi: 237, judgement: 286 }
for (const type of Object.keys(expected) as QuestionType[]) {
  if (counters[type] !== expected[type]) {
    throw new Error(`${type} 题量应为 ${expected[type]}，实际为 ${counters[type]}`)
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(questions, null, 2)}\n`)
console.log(
  `已生成 ${path.relative(process.cwd(), outputPath)}：单选 ${counters.single}，多选 ${counters.multi}，判断 ${counters.judgement}，共 ${questions.length} 题`,
)
