<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { exportData, importData, clearAllData } from '../db/database'
import { getCategoryCounts } from '../services/quizEngine'
import { CATEGORIES } from '../config/categories'
import { UI } from '../constants'
import { useToast } from '../composables/useToast'
import { useSettings } from '../composables/useSettings'
import { useAI } from '../composables/useAI'
import { AI_DEFAULTS } from '../types/ai'
import { createSyncCode, parseSyncCode, type SyncSummary } from '../services/syncCode'
import type { Category } from '../types/question'
import type { AIConfig } from '../types/ai'

const { showToast } = useToast()
const { darkMode, dailyGoal, toggleDark, saveDailyGoal, applyTheme, loadSettings } = useSettings()
const { aiEnabled, aiConfig, saveAIConfig, toggleAI, testConnection: testAIConnection } = useAI()
const counts = ref<Record<Category, number>>({} as Record<Category, number>)
const confirmClear = ref(false)
let clearTimer: ReturnType<typeof setTimeout> | null = null
const appVersion = import.meta.env.PACKAGE_VERSION || '0.0.0'
const showSyncImport = ref(false)
const syncCodeInput = ref('')
const syncSummary = ref<SyncSummary | null>(null)
const decodedSyncJson = ref('')
const syncError = ref('')
const syncImportMode = ref<'merge' | 'overwrite'>('merge')
const syncing = ref(false)

// AI 配置表单
const aiForm = ref<AIConfig>({
  apiKey: '',
  baseUrl: AI_DEFAULTS.baseUrl,
  model: AI_DEFAULTS.model,
  maxTokens: AI_DEFAULTS.maxTokens,
  temperature: AI_DEFAULTS.temperature,
})
const showApiKey = ref(false)
const testingConnection = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

onMounted(async () => {
  try {
    await loadSettings()
    applyTheme()
    // 5 个分类并发加载，不再串行 await 5 次
    counts.value = await getCategoryCounts()

    // 加载 AI 配置
    if (aiConfig.value) {
      aiForm.value = { ...aiConfig.value }
    }
  } catch (e) {
    // 设置页加载失败不阻断页面，题库计数会显示 "—"
    console.warn('设置页加载失败:', e)
    applyTheme()
  }
})

onUnmounted(() => {
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }
})

async function refreshCounts() {
  try {
    counts.value = await getCategoryCounts()
  } catch (e) {
    // 刷新失败不阻断页面
    console.warn('刷新题库计数失败:', e)
  }
}

async function handleExport() {
  const data = await exportData()
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `japanese-quiz-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  showToast('导出成功', 'success')
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('复制失败')
}

async function handleCopySyncCode() {
  syncing.value = true
  try {
    const code = await createSyncCode(await exportData())
    await copyText(code)
    showToast(`同步码已复制（${code.length.toLocaleString()} 字符）`, 'success')
  } catch (error) {
    console.warn('复制同步码失败:', error)
    showToast('复制失败，请检查剪贴板权限', 'error')
  } finally {
    syncing.value = false
  }
}

function openSyncImport() {
  showSyncImport.value = true
  syncCodeInput.value = ''
  syncSummary.value = null
  decodedSyncJson.value = ''
  syncError.value = ''
}

function closeSyncImport() {
  if (!syncing.value) showSyncImport.value = false
}

async function inspectSyncCode() {
  syncError.value = ''
  syncSummary.value = null
  decodedSyncJson.value = ''
  if (!syncCodeInput.value.trim()) {
    syncError.value = '请先粘贴同步码'
    return
  }
  syncing.value = true
  try {
    const result = await parseSyncCode(syncCodeInput.value)
    decodedSyncJson.value = result.json
    syncSummary.value = result.summary
  } catch (error) {
    syncError.value = error instanceof Error ? error.message : '同步码无效'
  } finally {
    syncing.value = false
  }
}

async function confirmSyncImport() {
  if (!decodedSyncJson.value || !syncSummary.value) return
  syncing.value = true
  try {
    await importData(decodedSyncJson.value, { merge: syncImportMode.value === 'merge' })
    await refreshCounts()
    showSyncImport.value = false
    showToast(syncImportMode.value === 'merge' ? '同步数据已合并' : '同步数据已覆盖导入', 'success')
  } catch (error) {
    console.warn('同步码导入失败:', error)
    syncError.value = '导入失败，本地数据未被更改'
  } finally {
    syncing.value = false
  }
}

function handleImport() {
  // 导入前显示确认提示，支持选择导入模式
  const mode = confirm(
    '选择导入模式：\n\n' +
      '【确定】= 覆盖模式（清空现有数据后导入）\n' +
      '【取消】= 合并模式（保留现有数据，合并导入）\n\n' +
      '注意：系统会在导入前自动备份当前数据。',
  )

  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const text = await file.text()
    try {
      if (mode) {
        // 覆盖模式
        await importData(text)
        showToast('导入成功（覆盖模式）', 'success')
      } else {
        // 合并模式
        await importData(text, { merge: true })
        showToast('导入成功（合并模式）', 'success')
      }
      // 刷新页面数据
      await refreshCounts()
    } catch {
      showToast('导入失败，请检查文件格式', 'error')
    }
  }
  input.click()
}

async function handleClear() {
  if (!confirmClear.value) {
    confirmClear.value = true
    clearTimer = setTimeout(() => {
      confirmClear.value = false
      clearTimer = null
    }, UI.CLEAR_CONFIRM_TIMEOUT)
    return
  }
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }
  await clearAllData()
  confirmClear.value = false
  // 清空数据后刷新页面状态
  counts.value = Object.fromEntries(CATEGORIES.map((c) => [c.key, 0])) as Record<Category, number>
  showToast('数据已清空', 'success')
}

// AI 配置相关函数
async function handleSaveAIConfig() {
  try {
    await saveAIConfig(aiForm.value)
    showToast('AI 配置已保存', 'success')
    testResult.value = null
  } catch {
    showToast('保存失败', 'error')
  }
}

async function handleTestConnection() {
  testingConnection.value = true
  testResult.value = null

  try {
    // 先保存配置
    await saveAIConfig(aiForm.value)
    // 测试连接
    testResult.value = await testAIConnection()
  } catch {
    testResult.value = { success: false, message: '测试失败' }
  } finally {
    testingConnection.value = false
  }
}

async function handleToggleAI(enabled: boolean) {
  if (enabled && !aiForm.value.apiKey) {
    showToast('请先配置 API Key', 'error')
    return
  }
  await toggleAI(enabled)
  showToast(enabled ? 'AI 功能已启用' : 'AI 功能已禁用', 'success')
}

const totalCount = computed(() => Object.values(counts.value).reduce((a, b) => a + b, 0))
</script>
<template>
  <div class="settings-page">
    <header class="page-header">
      <h1>设置</h1>
    </header>

    <div class="section">
      <h2>题库信息</h2>
      <div v-for="c in CATEGORIES" :key="c.key" class="info-row">
        <span>{{ c.long }}</span>
        <span>{{ counts[c.key] || '—' }} 题</span>
      </div>
      <div class="info-row total">
        <span>合计</span><span>{{ totalCount }} 题</span>
      </div>
      <div class="info-row">
        <span>版本</span><span>v{{ appVersion }}</span>
      </div>
    </div>

    <div class="section">
      <h2>外观</h2>
      <button class="toggle-row" role="switch" :aria-checked="darkMode" @click="toggleDark">
        <span>深色模式</span>
        <span class="toggle-state">{{ darkMode ? '开' : '关' }}</span>
      </button>
    </div>

    <div class="section">
      <h2>学习目标</h2>
      <div class="goal-row">
        <span>每日答题目标</span>
        <div class="goal-input-group">
          <input
            v-model.number="dailyGoal"
            type="number"
            min="1"
            max="200"
            class="goal-input"
            :class="{ 'input-error': dailyGoal < 1 || dailyGoal > 200 }"
            @change="saveDailyGoal()"
            @blur="saveDailyGoal()"
          />
          <span class="goal-unit">题/天</span>
        </div>
      </div>
      <p v-if="dailyGoal < 1 || dailyGoal > 200" class="validation-hint">请输入 1-200 之间的数字</p>
    </div>

    <div class="section">
      <h2>数据管理</h2>
      <div class="action-row">
        <button class="btn btn-outline" @click="handleExport">导出备份</button>
        <button class="btn btn-outline" @click="handleImport">导入备份</button>
      </div>
      <div class="action-row sync-actions">
        <button class="btn btn-accent" :disabled="syncing" @click="handleCopySyncCode">
          {{ syncing ? '处理中…' : '复制同步码' }}
        </button>
        <button class="btn btn-outline" @click="openSyncImport">导入同步码</button>
      </div>
      <p class="sync-hint">用于在设备间迁移学习进度、错题、收藏与统计，不包含 API Key。</p>
      <div class="action-row">
        <button class="btn btn-outline danger" @click="handleClear">
          {{ confirmClear ? '再次点击确认清空' : '清空所有数据' }}
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showSyncImport" class="modal-backdrop" @click.self="closeSyncImport">
        <section class="sync-modal" role="dialog" aria-modal="true" aria-labelledby="sync-title">
          <div class="modal-header">
            <h2 id="sync-title">导入同步码</h2>
            <button class="modal-close" aria-label="关闭" @click="closeSyncImport">×</button>
          </div>
          <template v-if="!syncSummary">
            <label for="sync-code" class="sync-label">粘贴以 DLUTSYNC: 开头的同步码</label>
            <textarea
              id="sync-code"
              v-model="syncCodeInput"
              class="sync-textarea"
              rows="7"
              placeholder="DLUTSYNC:…"
              autocomplete="off"
              spellcheck="false"
              @input="syncError = ''"
            />
            <p v-if="syncError" class="sync-error" role="alert">{{ syncError }}</p>
            <button
              class="btn btn-accent modal-primary"
              :disabled="syncing"
              @click="inspectSyncCode"
            >
              {{ syncing ? '正在校验…' : '校验并查看摘要' }}
            </button>
          </template>
          <template v-else>
            <p class="summary-title">即将导入以下数据</p>
            <dl class="sync-summary">
              <div>
                <dt>答题记录</dt>
                <dd>{{ syncSummary.attempts }} 条</dd>
              </div>
              <div>
                <dt>已学习题目</dt>
                <dd>{{ syncSummary.learnedQuestions }} 题</dd>
              </div>
              <div>
                <dt>错题 / 收藏</dt>
                <dd>{{ syncSummary.wrongQuestions }} / {{ syncSummary.bookmarks }} 题</dd>
              </div>
              <div>
                <dt>标签统计 / 会话</dt>
                <dd>{{ syncSummary.tagStats }} / {{ syncSummary.sessions }}</dd>
              </div>
              <div v-if="syncSummary.exportedAt">
                <dt>生成时间</dt>
                <dd>{{ new Date(syncSummary.exportedAt).toLocaleString() }}</dd>
              </div>
            </dl>
            <div class="import-mode" role="radiogroup" aria-label="导入方式">
              <label
                ><input v-model="syncImportMode" type="radio" value="merge" /> 合并（推荐）</label
              >
              <label
                ><input v-model="syncImportMode" type="radio" value="overwrite" />
                覆盖本地数据</label
              >
            </div>
            <p class="sync-hint">导入前会自动备份当前数据；同步码中的敏感配置会被忽略。</p>
            <p v-if="syncError" class="sync-error" role="alert">{{ syncError }}</p>
            <div class="modal-actions">
              <button class="btn btn-outline" :disabled="syncing" @click="syncSummary = null">
                返回修改
              </button>
              <button class="btn btn-accent" :disabled="syncing" @click="confirmSyncImport">
                {{ syncing ? '正在导入…' : '确认导入' }}
              </button>
            </div>
          </template>
        </section>
      </div>
    </Teleport>

    <div class="section">
      <h2>AI 助手</h2>
      <p class="ai-description">配置 AI 后，可以在做题时获取详细解析，也可以进行自由问答。</p>

      <div class="ai-toggle-row">
        <span>启用 AI 功能</span>
        <button
          class="toggle-btn"
          :class="{ active: aiEnabled }"
          @click="handleToggleAI(!aiEnabled)"
        >
          {{ aiEnabled ? '已启用' : '未启用' }}
        </button>
      </div>

      <div class="ai-config-form">
        <div class="form-group">
          <label for="ai-api-key">API Key</label>
          <div class="api-key-input">
            <input
              id="ai-api-key"
              v-model="aiForm.apiKey"
              :type="showApiKey ? 'text' : 'password'"
              placeholder="输入你的 API Key"
              @change="testResult = null"
            />
            <button class="toggle-visibility" @click="showApiKey = !showApiKey">
              {{ showApiKey ? '隐藏' : '显示' }}
            </button>
          </div>
          <span class="form-hint">支持 DeepSeek、OpenAI 等兼容格式的 API</span>
        </div>

        <div class="form-group">
          <label for="ai-base-url">API 地址</label>
          <input
            id="ai-base-url"
            v-model="aiForm.baseUrl"
            type="text"
            placeholder="https://api.deepseek.com"
          />
          <span class="form-hint">DeepSeek: https://api.deepseek.com</span>
        </div>

        <div class="form-group">
          <label for="ai-model">模型名称</label>
          <input id="ai-model" v-model="aiForm.model" type="text" placeholder="deepseek-chat" />
          <span class="form-hint">DeepSeek: deepseek-chat | OpenAI: gpt-4o-mini</span>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="ai-max-tokens">最大 Token 数</label>
            <input
              id="ai-max-tokens"
              v-model.number="aiForm.maxTokens"
              type="number"
              min="256"
              max="8192"
              step="256"
            />
          </div>
          <div class="form-group">
            <label for="ai-temperature">温度 (0-2)</label>
            <input
              id="ai-temperature"
              v-model.number="aiForm.temperature"
              type="number"
              min="0"
              max="2"
              step="0.1"
            />
          </div>
        </div>

        <div class="ai-actions">
          <button class="btn btn-accent" @click="handleSaveAIConfig">保存配置</button>
          <button
            class="btn btn-outline"
            :disabled="!aiForm.apiKey || testingConnection"
            @click="handleTestConnection"
          >
            {{ testingConnection ? '测试中...' : '测试连接' }}
          </button>
        </div>

        <div
          v-if="testResult"
          class="test-result"
          :class="testResult.success ? 'success' : 'error'"
          role="alert"
        >
          {{ testResult.message }}
        </div>
      </div>
    </div>

    <div class="section">
      <h2>快捷键</h2>
      <div class="shortcut-list">
        <div class="shortcut"><kbd>A/B/C/D 或 1/2/3/4</kbd><span>选择选项</span></div>
        <div class="shortcut"><kbd>E 或 5</kbd><span>多选第五选项</span></div>
        <div class="shortcut"><kbd>Enter</kbd><span>提交 / 下一题</span></div>
        <div class="shortcut"><kbd>N</kbd><span>下一题</span></div>
        <div class="shortcut"><kbd>P</kbd><span>上一题</span></div>
        <div class="shortcut"><kbd>B</kbd><span>收藏题目</span></div>
      </div>
    </div>

    <div class="section">
      <h2>关于</h2>
      <p class="about-text">
        本项目面向 2026 年南京市职工技能大赛，提供 889
        道电力行业人工智能业务理论练习题，支持多种刷题模式、智能错题本和掌握度分析。所有学习数据均存储在浏览器本地。
      </p>
    </div>
  </div>
</template>
<style scoped>
.settings-page {
  max-width: 560px;
  margin: 0 auto;
}
.page-header {
  margin-bottom: 24px;
}
h1 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
}

.section {
  margin-bottom: 20px;
  padding: 18px 22px;
  border: 1px solid var(--border);
  background: var(--bg-card);
}
.section h2 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 14px;
  color: var(--text-secondary);
}
.info-row.total {
  border-top: 1px solid var(--border);
  margin-top: 4px;
  padding-top: 10px;
  font-weight: 600;
  color: var(--text-primary);
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  padding: 6px 0;
  font-size: 14px;
  color: var(--text-secondary);
  user-select: none;
  background: none;
  border: none;
  width: 100%;
  text-align: left;
  font-family: inherit;
}
.toggle-row:hover .toggle-state {
  border-color: var(--accent);
}
.toggle-state {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  padding: 3px 14px;
  border: 1px solid var(--border);
  transition:
    border-color 0.18s var(--ease-ink),
    color 0.18s var(--ease-ink);
}

.action-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.action-row .btn {
  flex: 1;
}
.sync-hint {
  margin: 4px 0 12px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(0 0 0 / 55%);
}
.sync-modal {
  width: min(100%, 520px);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  padding: 20px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  box-shadow: 0 20px 60px rgb(0 0 0 / 25%);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.modal-header h2 {
  font-size: 17px;
}
.modal-close {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 22px;
  cursor: pointer;
}
.sync-label,
.summary-title {
  display: block;
  margin-bottom: 8px;
  color: var(--text-secondary);
  font-size: 13px;
}
.sync-textarea {
  display: block;
  width: 100%;
  resize: vertical;
  padding: 12px;
  border: 1px solid var(--border);
  background: var(--bg-hover);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.sync-textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.sync-error {
  margin-top: 8px;
  color: var(--wrong);
  font-size: 13px;
}
.modal-primary {
  width: 100%;
  margin-top: 14px;
}
.sync-summary {
  margin-bottom: 14px;
  border-top: 1px solid var(--border);
}
.sync-summary div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.sync-summary dt {
  color: var(--text-muted);
}
.sync-summary dd {
  color: var(--text-primary);
  text-align: right;
}
.import-mode {
  display: grid;
  gap: 8px;
  margin: 14px 0;
}
.import-mode label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.goal-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: 14px;
  color: var(--text-secondary);
}
.goal-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.goal-input {
  width: 64px;
  padding: 4px 8px;
  font-size: 14px;
  text-align: center;
  background: var(--bg-hover);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-family: var(--font-mono);
  transition: border-color 0.18s var(--ease-ink);
}
.goal-input:focus {
  outline: none;
  border-color: var(--accent);
}
.goal-unit {
  font-size: 13px;
  color: var(--text-muted);
}
.input-error {
  border-color: var(--wrong) !important;
}
.validation-hint {
  color: var(--wrong);
  font-size: 12px;
  margin-top: 4px;
}

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.shortcut {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 14px;
}
.shortcut kbd {
  padding: 3px 8px;
  background: var(--bg-hover);
  font-family: var(--font-mono);
  font-size: 12px;
  border: 1px solid var(--border);
  min-width: 64px;
  text-align: center;
}
.shortcut span {
  color: var(--text-secondary);
}

.about-text {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.8;
}
.about-links {
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
.about-links a {
  color: var(--accent);
}
.sep {
  color: var(--border);
}

/* AI 配置样式 */
.ai-description {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 16px;
  line-height: 1.6;
}

.ai-toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  color: var(--text-secondary);
}

.toggle-btn {
  padding: 4px 14px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.18s var(--ease-ink);
}

.toggle-btn.active {
  color: var(--accent);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.ai-config-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.form-group input {
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-primary);
  font-family: var(--font-mono);
  transition: border-color 0.18s var(--ease-ink);
}

.form-group input:focus {
  outline: none;
  border-color: var(--accent);
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.api-key-input {
  display: flex;
  gap: 8px;
}

.api-key-input input {
  flex: 1;
}

.toggle-visibility {
  padding: 8px 12px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.18s var(--ease-ink);
}

.toggle-visibility:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.ai-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.test-result {
  padding: 10px 14px;
  font-size: 13px;
  border-left: 3px solid;
}

.test-result.success {
  border-left-color: var(--correct);
  background: color-mix(in srgb, var(--correct) 10%, transparent);
  color: var(--correct);
}

.test-result.error {
  border-left-color: var(--wrong);
  background: color-mix(in srgb, var(--wrong) 8%, transparent);
  color: var(--wrong);
}

@media (max-width: 480px) {
  .form-row {
    grid-template-columns: 1fr;
  }
  .section {
    padding: 16px;
  }
  .action-row,
  .modal-actions {
    flex-direction: column;
  }
  .action-row .btn,
  .modal-actions .btn {
    width: 100%;
    min-height: 44px;
  }
  .modal-backdrop {
    align-items: end;
    padding: 0;
  }
  .sync-modal {
    width: 100%;
    max-height: 88dvh;
    padding: 18px 16px max(18px, env(safe-area-inset-bottom));
    border-width: 1px 0 0;
  }
}
</style>
