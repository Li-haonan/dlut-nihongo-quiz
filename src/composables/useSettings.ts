/**
 * 类型安全的设置访问
 *
 * 封装 darkMode / dailyGoal 的读写与主题切换，消除 SettingsPage 和 HomePage 中的重复逻辑。
 */
import { ref, onMounted } from 'vue'
import { getSetting, setSetting } from '../db/database'
import { STORAGE_KEYS } from '../constants'

const darkMode = ref(false)
const dailyGoal = ref(30)
let initialized = false

let themeTransitionTimer: ReturnType<typeof setTimeout> | null = null

function applyTheme() {
  // 添加过渡动画
  document.documentElement.style.transition = 'background-color 0.3s ease, color 0.3s ease'
  document.documentElement.setAttribute('data-theme', darkMode.value ? 'dark' : 'light')
  // 清除之前的定时器，避免快速切换时累积
  if (themeTransitionTimer) clearTimeout(themeTransitionTimer)
  // 动画结束后移除过渡，避免影响其他样式变化
  themeTransitionTimer = setTimeout(() => {
    document.documentElement.style.transition = ''
    themeTransitionTimer = null
  }, 300)
}

async function loadSettings() {
  darkMode.value = await getSetting(STORAGE_KEYS.DARK_MODE, false)
  dailyGoal.value = await getSetting(STORAGE_KEYS.DAILY_GOAL, 30)
  applyTheme()
  // 同步到 localStorage 供 index.html 暗色防闪烁脚本使用
  syncDarkModeToLocalStorage()
  initialized = true
}

async function toggleDark() {
  darkMode.value = !darkMode.value
  await setSetting(STORAGE_KEYS.DARK_MODE, darkMode.value)
  syncDarkModeToLocalStorage()
  applyTheme()
}

/** 同步暗色模式到 localStorage，供 index.html 内联脚本检测，防止页面刷新闪烁 */
function syncDarkModeToLocalStorage() {
  try {
    localStorage.setItem('quiz-dark-mode', String(darkMode.value))
  } catch {
    // localStorage 不可用时忽略
  }
}

async function saveDailyGoal(val?: number) {
  const finalVal = val ?? dailyGoal.value
  const clamped = Math.max(1, Math.min(200, Math.round(finalVal)))
  dailyGoal.value = clamped
  await setSetting(STORAGE_KEYS.DAILY_GOAL, clamped)
}

export function useSettings() {
  // 仅首次调用时加载，后续共享同一份 ref
  onMounted(async () => {
    if (!initialized) {
      await loadSettings()
    }
  })

  return {
    darkMode,
    dailyGoal,
    toggleDark,
    saveDailyGoal,
    applyTheme,
    loadSettings,
  }
}
