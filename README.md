# 电力行业人工智能业务理论题库

[![CI](https://github.com/tianxingleo/dlut-nihongo-quiz/actions/workflows/ci.yml/badge.svg)](https://github.com/tianxingleo/dlut-nihongo-quiz/actions/workflows/ci.yml)
[![Deploy](https://github.com/tianxingleo/dlut-nihongo-quiz/actions/workflows/deploy.yml/badge.svg)](https://github.com/tianxingleo/dlut-nihongo-quiz/actions/workflows/deploy.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Made with Vue](https://img.shields.io/badge/made%20with-Vue%203-42b883.svg)](https://vuejs.org/)

面向 **2026 年南京市职工技能大赛**的电力行业人工智能业务理论在线刷题工具。题库解析经过第二轮质量清洗，适合参赛职工日常练习、查漏补缺和考前复习。

## 题库信息

| 题型     |    题数 |
| -------- | ------: |
| 单选题   |     366 |
| 多选题   |     237 |
| 判断题   |     286 |
| **合计** | **889** |

题库源文件为 [`data/raw/power-ai-question-bank-dlut-quality-cleaned.md`](data/raw/power-ai-question-bank-dlut-quality-cleaned.md)，由脚本生成应用运行时使用的 JSON。标准答案保持原题口径，解析已进行第二轮质量清洗。

## 功能

- 顺序、随机、错题重刷、弱点突破和未做题练习
- 按单选题、多选题、判断题分组刷题
- 智能错题本、掌握度追踪和正确率分析
- 自动保存答题进度，支持导入、导出学习数据
- IndexedDB 本地存储，支持离线使用
- 响应式界面和键盘快捷操作
- 可选 AI 助手，辅助生成更详细的题目解析

## 在线使用

**https://tianxingleo.top/dlut-nihongo-quiz/**

无需安装；首次加载题库后即可在浏览器本地保存学习进度。

## 本地运行

需要 Node.js 18+（CI 使用 Node.js 24）。

```bash
git clone https://github.com/tianxingleo/dlut-nihongo-quiz.git
cd dlut-nihongo-quiz
npm install
npm run dev
```

常用命令：

| 命令                     | 作用                       |
| ------------------------ | -------------------------- |
| `npm run dev`            | 启动本地开发服务器         |
| `npm run build`          | 执行类型检查并构建生产版本 |
| `npm run test`           | 运行 Vitest 测试           |
| `npm run parse:power-ai` | 将 Markdown 题库生成 JSON  |
| `npm run generate:meta`  | 更新题库数量元数据         |
| `npm run audit:banks`    | 检查题库结构和重复题       |
| `npm run format:check`   | 检查代码格式               |

> `public/power-ai-question-bank.json` 是生成文件，请勿手动修改。更新 Markdown 后运行 `npm run parse:power-ai && npm run generate:meta`。

## 技术栈

- Vue 3、TypeScript、Vite
- Vue Router
- Dexie / IndexedDB
- Vitest

## 项目文档

- [项目结构](docs/project-structure.md)
- [题库维护](docs/question-bank.md)
- [部署说明](docs/deployment.md)
- [贡献指南](CONTRIBUTING.md)

## 版权与免责声明

- **代码**采用 [Apache License 2.0](LICENSE) 许可。
- **题目内容**版权归原著作权人所有，本项目仅用于学习交流、技能训练和个人复习，不用于商业用途。
- 如权利人认为内容侵犯其权益，请通过 [Issues](https://github.com/tianxingleo/dlut-nihongo-quiz/issues) 联系仓库所有者。
- 本项目用于合规复习，不鼓励或协助任何形式的考试作弊。

## English Summary

A Vue 3, TypeScript, Vite, and Dexie quiz app for the **Power Industry Artificial Intelligence Business Theory** portion of the 2026 Nanjing Workers' Skills Competition. It contains 889 quality-reviewed questions: 366 single-answer, 237 multiple-answer, and 286 true/false questions. Features include several practice modes, a wrong-answer notebook, mastery analytics, local progress storage, offline access, and optional AI-assisted explanations.
