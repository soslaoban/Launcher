import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppWindow,
  ArrowDownAZ,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FolderOpen,
  Grid2X2,
  List,
  Maximize2,
  Minus,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { getCurrentWindow } from '@tauri-apps/api/window'

type Theme = 'system' | 'light' | 'dark' | 'anime' | 'cyber'
type AnimeVariant = 'sakura' | 'sky' | 'moon'
type AnimeCardStyle = 'ribbon' | 'polaroid' | 'glass' | 'transparent'
type AnimeDensity = 'airy' | 'dense'
type AnimeDecoration = 'none' | 'sparkle' | 'tape' | 'sticker'
type AnimeMotion = 'none' | 'float' | 'breathe' | 'shimmer'
type AnimeIconSpacing = 'tight' | 'normal' | 'loose'
type AnimeCardSize = 'small' | 'medium' | 'large'
type AnimeGridSpacing = 'tight' | 'normal' | 'wide'
type View = 'all' | 'recent' | 'favorites' | string
type Sort = 'name' | 'recent' | 'count' | 'added'
type Layout = 'grid' | 'list' | 'compact'
type BackgroundMode = 'cover' | 'contain' | 'center' | 'repeat'

type BackgroundSettings = {
  image: string
  color: string
  mode: BackgroundMode
  opacity: number
  overlay: number
  blur: number
}

type AnimeSettings = {
  variant: AnimeVariant
  cardStyle: AnimeCardStyle
  density: AnimeDensity
  decoration: AnimeDecoration
  motion: AnimeMotion
  iconSpacing: AnimeIconSpacing
  cardSize: AnimeCardSize
  gridSpacing: AnimeGridSpacing
}

type AppRecord = {
  id: string
  name: string
  executablePath: string
  categoryId: string
  icon: string
  iconPath?: string
  iconSource?: 'system' | 'custom'
  isFavorite: boolean
  notes: string
  arguments: string
  workingDirectory: string
  launchCount: number
  lastLaunchedAt: string | null
  createdAt: string
  healthy: boolean
}

type LaunchAppArgs = {
  executablePath: string
  arguments: string[]
  workingDirectory?: string
}

type ShortcutDetails = {
  targetPath: string
  arguments: string
  workingDirectory: string
  iconLocation: string
}

type DiscoveredApplication = {
  name: string
  executablePath: string
  arguments: string
  workingDirectory: string
  iconPath?: string
}

type LauncherState = {
  schemaVersion: number
  apps: AppRecord[]
  categories: Category[]
  preferences?: {
    theme?: Theme
    anime?: AnimeSettings
    background?: BackgroundSettings
    brandName?: string
    brandIcon?: string
    view?: View
    sort?: Sort
    layout?: Layout
    sidebarCollapsed?: boolean
  }
  isNew?: boolean
}

type Category = { id: string; name: string }
type CategoryModal = { mode: 'add' | 'rename'; category?: Category }

const starterCategories: Category[] = [
  { id: 'dev', name: '开发工具' },
  { id: 'design', name: '设计创作' },
  { id: 'utility', name: '效率工具' },
]

const starterApps: AppRecord[] = [
  { id: 'vscode', name: 'Visual Studio Code', executablePath: 'C:\\Program Files\\Microsoft VS Code\\Code.exe', categoryId: 'dev', icon: 'VS', isFavorite: true, notes: '代码编辑器与开发环境', arguments: '', workingDirectory: 'C:\\Program Files\\Microsoft VS Code', launchCount: 48, lastLaunchedAt: '刚刚', createdAt: '2026-08-20', healthy: true },
  { id: 'figma', name: 'Figma', executablePath: 'C:\\Users\\Admin\\AppData\\Local\\Figma\\Figma.exe', categoryId: 'design', icon: 'Fi', isFavorite: true, notes: '界面设计与协作', arguments: '', workingDirectory: 'C:\\Users\\Admin\\AppData\\Local\\Figma', launchCount: 23, lastLaunchedAt: '今天 10:42', createdAt: '2026-08-21', healthy: true },
  { id: 'notion', name: 'Notion', executablePath: 'D:\\Apps\\Notion\\Notion.exe', categoryId: 'utility', icon: 'N', isFavorite: false, notes: '知识库与项目管理', arguments: '', workingDirectory: 'D:\\Apps\\Notion', launchCount: 16, lastLaunchedAt: '昨天', createdAt: '2026-08-22', healthy: true },
  { id: 'postman', name: 'Postman', executablePath: 'C:\\Tools\\Postman\\Postman.exe', categoryId: 'dev', icon: 'P', isFavorite: false, notes: 'API 调试工具', arguments: '', workingDirectory: 'C:\\Tools\\Postman', launchCount: 9, lastLaunchedAt: '8 月 26 日', createdAt: '2026-08-23', healthy: true },
  { id: 'photoshop', name: 'Adobe Photoshop', executablePath: 'C:\\Program Files\\Adobe\\Photoshop\\Photoshop.exe', categoryId: 'design', icon: 'Ps', isFavorite: false, notes: '图像处理与视觉设计', arguments: '', workingDirectory: 'C:\\Program Files\\Adobe\\Photoshop', launchCount: 7, lastLaunchedAt: null, createdAt: '2026-08-24', healthy: false },
  { id: 'terminal', name: 'Windows Terminal', executablePath: 'C:\\Windows\\System32\\wt.exe', categoryId: 'dev', icon: '>_', isFavorite: false, notes: '命令行工作区', arguments: '', workingDirectory: 'C:\\Windows\\System32', launchCount: 31, lastLaunchedAt: '8 月 24 日', createdAt: '2026-08-24', healthy: true },
]

const STORAGE_KEY = 'launcher-mvp-state'
const APP_VERSION = '4.3.0'
const DEFAULT_BACKGROUND: BackgroundSettings = { image: '', color: '#f5f7fb', mode: 'cover', opacity: 0.22, overlay: 0.86, blur: 0 }
const DEFAULT_ANIME: AnimeSettings = { variant: 'sakura', cardStyle: 'ribbon', density: 'airy', decoration: 'sparkle', motion: 'float', iconSpacing: 'normal', cardSize: 'medium', gridSpacing: 'normal' }

declare global {
  interface Window {
    __TAURI__?: { core?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown> } }
  }
}

function normalizePath(value: string) {
  return value.trim().replace(/^"|"$/g, '').replace(/\//g, '\\')
}

function normalizeExecutablePath(value: string) {
  const normalized = normalizePath(value)
  return normalized.length > 3 ? normalized.replace(/[\\/]+$/, '') : normalized
}

function parseArguments(value: string) {
  const matches = value.match(/"[^"\\]*(?:\\.[^"\\]*)*"|'[^']*'|\S+/g) || []
  return matches.map((part) => part.replace(/^['"]|['"]$/g, ''))
}

function readBackground(): BackgroundSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem('launcher-background') || '')
    return { ...DEFAULT_BACKGROUND, ...parsed }
  } catch { return DEFAULT_BACKGROUND }
}

function normalizeAnimeSettings(value: unknown): AnimeSettings {
  if (!value || typeof value !== 'object') return DEFAULT_ANIME
  const raw = value as Record<string, unknown>
  const legacyDecoration = raw.decorations === false ? 'none' : raw.decorations === true ? 'sparkle' : undefined
  const decoration = raw.decoration === 'none' || raw.decoration === 'sparkle' || raw.decoration === 'tape' || raw.decoration === 'sticker' ? raw.decoration : legacyDecoration
  const legacyMotion = raw.motion === false ? 'none' : raw.motion === true ? 'float' : undefined
  const motion = raw.motion === 'none' || raw.motion === 'float' || raw.motion === 'breathe' || raw.motion === 'shimmer' ? raw.motion : legacyMotion
  return {
    ...DEFAULT_ANIME,
    ...raw,
    decoration: decoration || DEFAULT_ANIME.decoration,
    motion: motion || DEFAULT_ANIME.motion,
    iconSpacing: raw.iconSpacing === 'tight' || raw.iconSpacing === 'normal' || raw.iconSpacing === 'loose' ? raw.iconSpacing : DEFAULT_ANIME.iconSpacing,
    cardSize: raw.cardSize === 'small' || raw.cardSize === 'medium' || raw.cardSize === 'large' ? raw.cardSize : DEFAULT_ANIME.cardSize,
    gridSpacing: raw.gridSpacing === 'tight' || raw.gridSpacing === 'normal' || raw.gridSpacing === 'wide' ? raw.gridSpacing : DEFAULT_ANIME.gridSpacing,
  } as AnimeSettings
}

function readAnimeSettings(): AnimeSettings {
  try { return normalizeAnimeSettings(JSON.parse(localStorage.getItem('launcher-anime-settings') || '')) } catch { return DEFAULT_ANIME }
}

async function invokeDesktop<T = unknown>(command: string, args: Record<string, unknown>): Promise<T | false> {
  if (!isTauri()) return false
  return invoke<T>(command, args)
}

function formatTime(value: string | null) {
  if (!value) return '尚未启动'
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const elapsed = Date.now() - new Date(value).getTime()
    if (elapsed < 60_000) return '刚刚'
    if (elapsed < 3_600_000) return `${Math.max(1, Math.floor(elapsed / 60_000))} 分钟前`
    const date = new Date(value)
    const today = new Date()
    if (date.toDateString() === today.toDateString()) return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  return value
}

function timestamp(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export default function App() {
  const [apps, setApps] = useState<AppRecord[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '')
      return Array.isArray(parsed.apps) ? parsed.apps : starterApps
    } catch { return starterApps }
  })
  const [categories, setCategories] = useState<Category[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '').categories || starterCategories } catch { return starterCategories }
  })
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('launcher-theme') as Theme) || 'light')
  const [anime, setAnime] = useState<AnimeSettings>(readAnimeSettings)
  const [background, setBackground] = useState<BackgroundSettings>(readBackground)
  const [brandName, setBrandName] = useState(() => localStorage.getItem('launcher-brand-name') || '启动器')
  const [brandIcon, setBrandIcon] = useState(() => localStorage.getItem('launcher-brand-icon') || '')
  const [view, setView] = useState<View>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('name')
  const [layout, setLayout] = useState<Layout>('grid')
  const [modal, setModal] = useState<'add' | 'edit' | 'settings' | null>(null)
  const [categoryModal, setCategoryModal] = useState<CategoryModal | null>(null)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [editing, setEditing] = useState<AppRecord | null>(null)
  const [toast, setToast] = useState('')
  const [launching, setLaunching] = useState<string | null>(null)
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const [storageReady, setStorageReady] = useState(() => !isTauri())
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const skipNextPersistRef = useRef(false)

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    void invokeDesktop<LauncherState>('load_launcher_state', {}).then((state) => {
      if (cancelled || !state) return
      if (!state.isNew && Array.isArray(state.apps) && Array.isArray(state.categories)) {
        skipNextPersistRef.current = true
        setApps(state.apps)
        setCategories(state.categories)
        if (state.preferences?.theme) setTheme(state.preferences.theme)
        if (state.preferences?.anime) setAnime(normalizeAnimeSettings(state.preferences.anime))
        if (state.preferences?.background) setBackground({ ...DEFAULT_BACKGROUND, ...state.preferences.background })
        if (state.preferences?.brandName) setBrandName(state.preferences.brandName)
        if (typeof state.preferences?.brandIcon === 'string') setBrandIcon(state.preferences.brandIcon)
        const savedView = state.preferences?.view
        if (savedView === 'all' || savedView === 'recent' || savedView === 'favorites' || state.categories.some((category) => category.id === savedView)) setView(savedView || 'all')
        if (state.preferences?.sort === 'name' || state.preferences?.sort === 'recent' || state.preferences?.sort === 'count' || state.preferences?.sort === 'added') setSort(state.preferences.sort)
        if (state.preferences?.layout === 'grid' || state.preferences?.layout === 'list' || state.preferences?.layout === 'compact') setLayout(state.preferences.layout)
        if (typeof state.preferences?.sidebarCollapsed === 'boolean') setSidebarCollapsed(state.preferences.sidebarCollapsed)
      }
      setStorageReady(true)
    }).catch(() => setStorageReady(true))
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!isTauri() || !storageReady) return
    const appWindow = getCurrentWindow()
    let disposed = false
    let unlisten: (() => void) | undefined
    void appWindow.onResized(({ payload }) => {
      if (payload.width >= 480 && payload.height >= 360) void invokeDesktop('save_window_size', { width: payload.width, height: payload.height }).catch(() => undefined)
    }).then((stopListening) => {
      if (disposed) stopListening(); else unlisten = stopListening
    }).catch(() => undefined)
    return () => { disposed = true; unlisten?.() }
  }, [storageReady])
  useEffect(() => {
    if (!storageReady) return
    if (skipNextPersistRef.current) { skipNextPersistRef.current = false; return }
    const state: LauncherState = { schemaVersion: 3, apps, categories, preferences: { theme, anime, background, brandName, brandIcon, view, sort, layout, sidebarCollapsed } }
    if (isTauri()) { void invokeDesktop('save_launcher_state', { state }).catch(() => undefined); return }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    localStorage.setItem('launcher-theme', theme)
    localStorage.setItem('launcher-anime-settings', JSON.stringify(anime))
    localStorage.setItem('launcher-background', JSON.stringify(background))
    localStorage.setItem('launcher-brand-name', brandName || '启动器')
    if (brandIcon) localStorage.setItem('launcher-brand-icon', brandIcon); else localStorage.removeItem('launcher-brand-icon')
  }, [anime, apps, background, brandIcon, brandName, categories, layout, sidebarCollapsed, sort, storageReady, theme, view])
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.animeVariant = anime.variant
    root.dataset.animeCard = anime.cardStyle
    root.dataset.animeDensity = anime.density
    root.dataset.animeDecoration = anime.decoration
    root.dataset.animeMotion = String(anime.motion)
    root.dataset.animeIconSpacing = anime.iconSpacing
    root.dataset.animeCardSize = anime.cardSize
    root.dataset.animeGridSpacing = anime.gridSpacing
  }, [anime, theme])
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--launcher-bg-image', background.image ? `url("${background.image}")` : 'none')
    root.style.setProperty('--launcher-bg-color', background.color)
    root.style.setProperty('--launcher-bg-opacity', String(background.opacity))
    root.style.setProperty('--launcher-bg-overlay', `${Math.round(background.overlay * 100)}%`)
    root.style.setProperty('--launcher-bg-blur', `${background.blur}px`)
    root.style.setProperty('--launcher-bg-size', background.mode === 'repeat' ? 'auto' : background.mode === 'center' ? 'auto' : background.mode)
    root.style.setProperty('--launcher-bg-repeat', background.mode === 'repeat' ? 'repeat' : 'no-repeat')
    root.style.setProperty('--launcher-bg-position', background.mode === 'center' ? 'center' : 'center')
  }, [background])
  useEffect(() => {
    if (!isTauri() || !storageReady) return
    let frame = 0
    let cancelled = false
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (!cancelled) void invokeDesktop('frontend_ready', {}).catch(() => undefined)
      })
    })
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [storageReady])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2800); return () => clearTimeout(timer) }, [toast])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus() }
      if (event.key === 'Escape') { setModal(null); setCategoryModal(null); setCategoryToDelete(null) }
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')
      if (!modal && !categoryModal && !typing && visibleApps.length) {
        const currentIndex = Math.max(0, visibleApps.findIndex((app) => app.id === selectedAppId))
        if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
          event.preventDefault()
          const columns = Math.max(1, Math.floor((document.querySelector('.apps-container')?.clientWidth || 1) / 270))
          const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? columns : -columns
          const nextIndex = Math.min(visibleApps.length - 1, Math.max(0, currentIndex + delta))
          const nextId = visibleApps[nextIndex].id
          setSelectedAppId(nextId)
          document.querySelector<HTMLElement>(`[data-app-id="${nextId}"]`)?.focus()
        }
        if (event.key === 'Enter' && !(event.target as HTMLElement | null)?.closest('button,[role="button"]')) launchApp(visibleApps[currentIndex])
        if (event.key === 'Delete') removeApp(visibleApps[currentIndex])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
  useEffect(() => {
    if (!isTauri() || !storageReady) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void Promise.all(apps.map(async (app) => {
        const executablePath = normalizeExecutablePath(app.executablePath)
        try {
          const healthy = await invokeDesktop<boolean>('path_exists', { path: executablePath })
          if (healthy !== true) return { ...app, executablePath, healthy: false }
          let iconPath = app.iconPath
          let iconSource = app.iconSource
          if (iconSource !== 'custom' && !iconPath?.startsWith('data:image/')) {
            try {
              const icon = await invokeDesktop<string>('read_application_icon', { path: executablePath })
              if (typeof icon === 'string' && icon.startsWith('data:image/')) { iconPath = icon; iconSource = 'system' }
            } catch { /* a missing shell icon must not invalidate the application */ }
          }
          return { ...app, executablePath, healthy: true, iconPath, iconSource }
        } catch {
          return { ...app, executablePath, healthy: false }
        }
      })).then((results) => {
        if (cancelled) return
        const refreshed = new Map(results.map((item) => [item.id, item]))
        setApps((current) => {
          let changed = false
          const next = current.map((app) => {
            const updated = refreshed.get(app.id)
            if (!updated) return app
            if (updated.executablePath !== app.executablePath || updated.healthy !== app.healthy || updated.iconPath !== app.iconPath || updated.iconSource !== app.iconSource) changed = true
            return updated
          })
          return changed ? next : current
        })
      })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [storageReady])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: apps.length, recent: apps.filter((a) => a.lastLaunchedAt).length, favorites: apps.filter((a) => a.isFavorite).length }
    categories.forEach((cat) => { counts[cat.id] = apps.filter((a) => a.categoryId === cat.id).length })
    return counts
  }, [apps, categories])

  const visibleApps = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const filtered = apps.filter((app) => {
      const inView = view === 'all' || (view === 'recent' && !!app.lastLaunchedAt) || (view === 'favorites' && app.isFavorite) || app.categoryId === view
      const inSearch = !normalized || [app.name, app.executablePath, app.notes, app.arguments].some((field) => field.toLowerCase().includes(normalized))
      return inView && inSearch
    })
    return filtered.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'count') return b.launchCount - a.launchCount
      if (sort === 'recent') return timestamp(b.lastLaunchedAt) - timestamp(a.lastLaunchedAt) || b.launchCount - a.launchCount
      return b.createdAt.localeCompare(a.createdAt)
    })
  }, [apps, query, sort, view])

  const viewTitle = view === 'all' ? '所有应用' : view === 'recent' ? '最近使用' : view === 'favorites' ? '收藏' : categories.find((c) => c.id === view)?.name || '所有应用'

  const showToast = (message: string) => setToast(message)
  const minimizeWindow = () => {
    if (!isTauri()) return
    void getCurrentWindow().minimize().catch((error) => showToast(`无法最小化窗口：${String(error).slice(0, 60)}`))
  }
  const toggleMaximizeWindow = () => {
    if (!isTauri()) return
    void getCurrentWindow().toggleMaximize().catch((error) => showToast(`无法切换窗口大小：${String(error).slice(0, 60)}`))
  }
  const closeWindow = () => {
    if (!isTauri()) return
    void getCurrentWindow().close().catch((error) => showToast(`无法关闭窗口：${String(error).slice(0, 60)}`))
  }
  const logEvent = (event: string, details: Record<string, unknown> = {}) => {
    try {
      const entries = JSON.parse(localStorage.getItem('launcher-logs') || '[]')
      const next = [{ at: new Date().toISOString(), event, ...details }, ...(Array.isArray(entries) ? entries : [])].slice(0, 50)
      localStorage.setItem('launcher-logs', JSON.stringify(next))
    } catch { /* logging must never block the main flow */ }
  }
  const launchApp = (app: AppRecord) => {
    if (!app.healthy) { showToast('目标路径不可用，请重新定位文件'); return }
    setLaunching(app.id)
    logEvent('launch-start', { appId: app.id, name: app.name })
    // Tauri exposes Rust command parameters to JavaScript in camelCase by default.
    const executablePath = normalizeExecutablePath(app.executablePath)
    const workingDirectory = normalizePath(app.workingDirectory)
    const launchArgs: LaunchAppArgs = {
      executablePath,
      arguments: parseArguments(app.arguments),
      workingDirectory: workingDirectory || undefined,
    }
    void invokeDesktop('launch_app', launchArgs)
      .then((desktopLaunch) => {
        if (!desktopLaunch) return new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 450))
        return true
      })
      .then(() => {
        setLaunching(null)
        setApps((current) => current.map((item) => item.id === app.id ? { ...item, launchCount: item.launchCount + 1, lastLaunchedAt: new Date().toISOString() } : item))
        logEvent('launch-success', { appId: app.id })
        showToast(`已启动 ${app.name}`)
      })
      .catch((error) => {
        setLaunching(null)
        logEvent('launch-failed', { appId: app.id, error: String(error) })
        showToast(`启动失败：${String(error).slice(0, 80)}`)
      })
  }
  const toggleFavorite = (id: string) => setApps((current) => current.map((item) => item.id === id ? { ...item, isFavorite: !item.isFavorite } : item))
  const removeApp = (app: AppRecord) => {
    if (window.confirm(`确定从启动器移除“${app.name}”吗？\n\n只删除启动器记录，不删除磁盘上的 exe 文件。`)) {
      setApps((current) => current.filter((item) => item.id !== app.id)); showToast('已从启动器移除')
    }
  }
  const addCategory = () => setCategoryModal({ mode: 'add' })
  const saveCategory = (name: string) => {
    const normalized = name.trim()
    if (!normalized) return
    const duplicate = categories.some((item) => item.name.toLowerCase() === normalized.toLowerCase() && item.id !== categoryModal?.category?.id)
    if (duplicate) { showToast('已存在同名分类'); return }
    if (categoryModal?.mode === 'rename' && categoryModal.category) {
      setCategories((current) => current.map((item) => item.id === categoryModal.category?.id ? { ...item, name: normalized } : item))
      showToast('分类已重命名')
    } else {
      const id = `category-${Date.now()}`
      setCategories((current) => [...current, { id, name: normalized }]); setView(id); showToast('分类已创建')
    }
    setCategoryModal(null)
  }
  const deleteCategory = (category: Category) => {
    setCategoryToDelete(category)
  }
  const confirmDeleteCategory = (deleteApps: boolean) => {
    const category = categoryToDelete
    if (!category) return
    const destinationCategory = categories.find((item) => item.id !== category.id)
    const destinationName = destinationCategory?.name || '未分类'
    setCategories((current) => current.filter((item) => item.id !== category.id))
    setApps((current) => deleteApps ? current.filter((item) => item.categoryId !== category.id) : current.map((item) => item.categoryId === category.id ? { ...item, categoryId: destinationCategory?.id || '' } : item))
    if (view === category.id) setView('all')
    setCategoryToDelete(null)
    showToast(deleteApps ? `分类及其 ${categoryCounts[category.id] || 0} 个应用已删除` : `分类已删除，应用已移到“${destinationName}”`)
  }
  const openAddApp = () => { setEditing(null); setPendingPath(''); setPendingShortcut(null); setModal('add') }
  const selectExecutablePath = (value: string) => {
    const path = normalizePath(value)
    if (!path.toLowerCase().endsWith('.exe')) { showToast('只能添加 .exe 文件或 .lnk 快捷方式'); return }
    const editingExisting = modal === 'edit' && !!editing
    if (!editingExisting) setEditing(null)
    setPendingPath(path)
    setPendingShortcut(null)
    setModal(editingExisting ? 'edit' : 'add')
  }
  const selectShortcutPath = async (value: string) => {
    if (!isTauri()) { showToast('浏览器预览无法解析 Windows 快捷方式'); return }
    try {
      const shortcut = await invokeDesktop<ShortcutDetails>('resolve_shortcut', { path: normalizePath(value) })
      if (!shortcut || !shortcut.targetPath.toLowerCase().endsWith('.exe')) throw new Error('快捷方式目标不是 .exe 文件')
      const editingExisting = modal === 'edit' && !!editing
      if (!editingExisting) setEditing(null)
      setPendingPath(normalizePath(shortcut.targetPath))
      setPendingShortcut(shortcut)
      setModal(editingExisting ? 'edit' : 'add')
    } catch (error) { showToast(`无法解析快捷方式：${String(error).slice(0, 70)}`) }
  }
  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    const path = (file as File & { path?: string }).path || file.name
    if (/\.lnk$/i.test(path)) void selectShortcutPath(path); else selectExecutablePath(path)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  const handleDroppedPaths = (paths: string[]) => {
    const path = paths.find((item) => /\.(exe|lnk)$/i.test(item))
    if (!path) { showToast('请拖入 .exe 文件或 .lnk 快捷方式'); return }
    if (/\.lnk$/i.test(path)) void selectShortcutPath(path); else selectExecutablePath(path)
  }
  const pickExecutable = async () => {
    if (!isTauri()) { fileInputRef.current?.click(); return }
    try {
      const selected = await open({
        title: '选择可执行文件或快捷方式',
        multiple: false,
        directory: false,
        filters: [{ name: 'Windows 可执行文件和快捷方式', extensions: ['exe', 'lnk'] }],
      })
      if (typeof selected === 'string') {
        if (/\.lnk$/i.test(selected)) await selectShortcutPath(selected); else selectExecutablePath(selected)
      }
    } catch (error) {
      showToast(`无法打开文件选择器：${String(error).slice(0, 70)}`)
    }
  }
  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    let unlisten: (() => void) | undefined
    void getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') handleDroppedPaths(event.payload.paths)
    }).then((stopListening) => {
      if (disposed) stopListening(); else unlisten = stopListening
    })
    return () => { disposed = true; unlisten?.() }
  }, [editing, modal])
  const [pendingPath, setPendingPath] = useState('')
  const [pendingShortcut, setPendingShortcut] = useState<ShortcutDetails | null>(null)
  const importState = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    const file = files[0]
    if (!file) return
    const isFolderImport = files.length > 1 || !file.name.toLowerCase().endsWith('.json')
    if (isFolderImport) {
      const candidates = files.filter((item) => /\.(exe|lnk)$/i.test(item.name))
      if (!candidates.length) { showToast('文件夹中没有找到 .exe 或 .lnk 文件'); event.target.value = ''; return }
      const relativeRoot = (candidates[0] as File & { webkitRelativePath?: string }).webkitRelativePath || candidates[0].name
      const folderName = relativeRoot.split('/')[0] || '导入应用'
      const categoryId = `category-${Date.now()}`
      const importedApps: AppRecord[] = candidates.map((item, index) => {
        const relativePath = (item as File & { webkitRelativePath?: string }).webkitRelativePath || item.name
        const isShortcut = /\.lnk$/i.test(item.name)
        const name = item.name.replace(/\.(exe|lnk)$/i, '')
        return { id: `app-${Date.now()}-${index}`, name, executablePath: relativePath, categoryId, icon: name.slice(0, 2).toUpperCase(), isFavorite: false, notes: '', arguments: '', workingDirectory: '', launchCount: 0, lastLaunchedAt: null, createdAt: new Date().toISOString().slice(0, 10), healthy: !isShortcut }
      })
      setCategories((current) => [...current, { id: categoryId, name: folderName }])
      setApps((current) => [...importedApps, ...current])
      setView(categoryId)
      showToast(`已从文件夹导入 ${importedApps.length} 个应用`)
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (!Array.isArray(parsed.apps) || !Array.isArray(parsed.categories)) throw new Error('invalid')
        const importedApps = parsed.apps.map((item: AppRecord) => {
          const executablePath = normalizeExecutablePath(String(item.executablePath || ''))
          return { ...item, executablePath, arguments: String(item.arguments || ''), notes: '', healthy: item.healthy !== false && executablePath.toLowerCase().endsWith('.exe') }
        })
        setApps(importedApps); setCategories(parsed.categories); setView('all'); logEvent('import-json', { count: importedApps.length }); showToast(`已导入 ${importedApps.length} 个应用`)
      } catch { showToast('导入失败：JSON 文件格式无效') }
    }
    reader.readAsText(file)
    event.target.value = ''
  }
  const importFolder = async () => {
    if (!isTauri()) { showToast('浏览器预览请使用文件夹选择器导入'); return }
    try {
      const selected = await open({ title: '选择应用目录', directory: true, multiple: false })
      if (typeof selected !== 'string') return
      const discovered = await invokeDesktop<DiscoveredApplication[]>('discover_applications', { path: selected })
      if (!Array.isArray(discovered) || !discovered.length) { showToast('目录中没有找到可用的 .exe 或 .lnk'); return }
      const categoryId = `category-${Date.now()}`
      const importedApps: AppRecord[] = discovered.map((item, index) => ({
        id: `app-${Date.now()}-${index}`,
        name: item.name,
        executablePath: normalizeExecutablePath(item.executablePath),
        categoryId,
        icon: item.name.slice(0, 2).toUpperCase(),
        iconPath: item.iconPath,
        iconSource: item.iconPath ? 'system' : undefined,
        isFavorite: false,
        notes: '',
        arguments: item.arguments || '',
        workingDirectory: normalizePath(item.workingDirectory),
        launchCount: 0,
        lastLaunchedAt: null,
        createdAt: new Date().toISOString().slice(0, 10),
        healthy: true,
      }))
      setCategories((current) => [...current, { id: categoryId, name: selected.split(/[\\/]/).pop() || '导入应用' }])
      setApps((current) => [...importedApps, ...current])
      setView(categoryId)
      showToast(`已从文件夹导入 ${importedApps.length} 个应用`)
    } catch (error) { showToast(`无法扫描应用目录：${String(error).slice(0, 70)}`) }
  }
  const refreshStatus = () => {
    if (!isTauri()) {
      setApps((current) => current.map((app) => {
        const executablePath = normalizeExecutablePath(app.executablePath)
        return { ...app, executablePath, healthy: executablePath.toLowerCase().endsWith('.exe') }
      }))
      logEvent('refresh-status', { mode: 'browser' })
      showToast('浏览器预览无法检查真实文件路径')
      return
    }
    void Promise.all(apps.map(async (app) => {
      try {
        const healthy = await invokeDesktop<boolean>('path_exists', { path: app.executablePath })
        return { id: app.id, healthy: healthy === true }
      } catch { return { id: app.id, healthy: false } }
    })).then((results) => {
      const status = new Map(results.map((result) => [result.id, result.healthy]))
      setApps((current) => current.map((app) => {
        const executablePath = normalizeExecutablePath(app.executablePath)
        return { ...app, executablePath, healthy: status.get(app.id) || false }
      }))
      logEvent('refresh-status', { mode: 'desktop', count: results.length })
      showToast('已刷新应用状态')
    })
  }
  const openDirectory = (app: AppRecord) => {
    const directory = app.workingDirectory || normalizeExecutablePath(app.executablePath).split('\\').slice(0, -1).join('\\')
    void invokeDesktop('open_directory', { path: directory }).then((opened) => {
      if (!opened) showToast(`所在目录：${directory || '未设置'}`)
    }).catch((error) => showToast(`无法打开目录：${String(error).slice(0, 70)}`))
  }
  const resetAppearance = () => {
    setTheme('system')
    setAnime(DEFAULT_ANIME)
    setBackground(DEFAULT_BACKGROUND)
    setBrandName('启动器')
    setBrandIcon('')
    showToast('外观已恢复默认')
  }

  return (
    <div className="app-shell">
      <header className="topbar" data-tauri-drag-region>
        <div className="topbar-leading"><button className="titlebar-btn" title={sidebarCollapsed ? '显示侧边栏' : '隐藏侧边栏'} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}><PanelLeft size={18} /></button><div className="brand"><div className={`brand-mark ${brandIcon ? 'has-custom-icon' : ''}`}>{brandIcon ? <img src={brandIcon} alt="" /> : <Zap size={18} fill="currentColor" />}</div><div><div className="brand-title">{brandName}</div></div></div></div>
        <div className="topbar-actions"><label className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索应用、路径或备注" /><kbd>Ctrl K</kbd></label><button className="icon-btn" title="帮助"><CircleHelp size={18} /></button><div className="window-controls"><button className="window-control" title="最小化" onClick={minimizeWindow}><Minus size={16} /></button><button className="window-control" title="最大化/还原" onClick={toggleMaximizeWindow}><Maximize2 size={15} /></button><button className="window-control close-control" title="关闭窗口" onClick={closeWindow}><X size={16} /></button></div></div>
      </header>
      <div className={`workspace ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <aside className="sidebar">
          <div className="side-section"><SideItem icon={<AppWindow size={17} />} label="所有应用" count={categoryCounts.all} active={view === 'all'} onClick={() => setView('all')} /><SideItem icon={<Clock3 size={17} />} label="最近使用" count={categoryCounts.recent} active={view === 'recent'} onClick={() => setView('recent')} /><SideItem icon={<Star size={17} />} label="收藏" count={categoryCounts.favorites} active={view === 'favorites'} onClick={() => setView('favorites')} /></div>
          <div className="side-section categories"><div className="side-label side-label-row"><span>我的分类</span><button className="mini-btn" title="新建分类" onClick={addCategory}><Plus size={15} /></button></div>{categories.map((cat) => <SideItem key={cat.id} icon={<span className="category-dot" />} label={cat.name} count={categoryCounts[cat.id] || 0} active={view === cat.id} onClick={() => setView(cat.id)} onDelete={() => deleteCategory(cat)} onRename={() => setCategoryModal({ mode: 'rename', category: cat })} />)}</div>
          <div className="sidebar-footer"><div className="sync-status"><span className="status-dot"></span><span>数据已保存到本机</span></div><div className="version">v{APP_VERSION}</div><button className="sidebar-settings" onClick={() => setModal('settings')}><Settings size={17} /><span>设置</span></button></div>
        </aside>
        <main className="main-content" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleFiles(event.dataTransfer.files) }}>
          <div className="content-header"><div><h1>{viewTitle}</h1></div><div className="header-controls"><div className="select-wrap"><SlidersHorizontal size={15} /><select value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="name">按名称排序</option><option value="recent">最近使用</option><option value="count">使用次数</option><option value="added">添加时间</option></select><ChevronDown size={14} /></div><div className="layout-toggle"><button className={layout === 'grid' ? 'active' : ''} onClick={() => setLayout('grid')} title="网格视图"><Grid2X2 size={17} /></button><button className={layout === 'list' ? 'active' : ''} onClick={() => setLayout('list')} title="列表视图"><List size={18} /></button><button className={layout === 'compact' ? 'active' : ''} onClick={() => setLayout('compact')} title="紧凑视图"><AppWindow size={17} /></button></div></div></div>
          {visibleApps.length ? <div className={`apps-container ${layout}`}>{visibleApps.map((app) => <AppCard key={app.id} app={app} categoryName={categories.find((c) => c.id === app.categoryId)?.name || '未分类'} launching={launching === app.id} selected={selectedAppId === app.id} onSelect={() => setSelectedAppId(app.id)} onLaunch={() => launchApp(app)} onFavorite={() => toggleFavorite(app.id)} onEdit={() => { setEditing(app); setModal('edit') }} onRemove={() => removeApp(app)} onRelocate={() => { setEditing(app); setModal('edit') }} onOpenDirectory={() => openDirectory(app)} onToast={showToast} layout={layout} />)}</div> : <EmptyState query={query} onAdd={openAddApp} />}
          <div className="content-footer"><span>最后同步于刚刚</span><span className="footer-separator">·</span><button onClick={refreshStatus}><RotateCcw size={13} /> 刷新状态</button></div>
        </main>
      </div>
      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
      <input ref={fileInputRef} className="visually-hidden" type="file" accept=".exe,.lnk" onChange={(event) => handleFiles(event.target.files)} />
      {modal && <Modal title={modal === 'settings' ? '设置' : modal === 'edit' ? '编辑应用' : '添加应用'} onClose={() => setModal(null)}><>{modal === 'settings' ? <SettingsPanel theme={theme} setTheme={setTheme} anime={anime} setAnime={setAnime} background={background} setBackground={setBackground} brandName={brandName} setBrandName={setBrandName} brandIcon={brandIcon} setBrandIcon={setBrandIcon} onReset={resetAppearance} onClose={() => setModal(null)} apps={apps} categories={categories} onImport={importState} onImportFolder={() => void importFolder()} onAddApp={openAddApp} /> : <AppForm app={editing} initialPath={pendingPath} shortcut={pendingShortcut} categories={categories} onPickFile={() => void pickExecutable()} onCancel={() => setModal(null)} onSave={(record) => { setApps((current) => editing ? current.map((item) => item.id === record.id ? record : item) : [record, ...current]); setPendingPath(''); setPendingShortcut(null); setModal(null); showToast(editing ? '应用已更新' : '应用已添加') }} />}</></Modal>}
      {categoryModal && <Modal title={categoryModal.mode === 'add' ? '新建分类' : '重命名分类'} onClose={() => setCategoryModal(null)}><CategoryForm category={categoryModal.category} onCancel={() => setCategoryModal(null)} onSave={saveCategory} /></Modal>}
      {categoryToDelete && <Modal title="删除分类" onClose={() => setCategoryToDelete(null)}><div className="form category-delete-form"><p>分类“{categoryToDelete.name}”下有 {categoryCounts[categoryToDelete.id] || 0} 个应用。</p><button className="setting-row" onClick={() => confirmDeleteCategory(false)}><span><FolderOpen size={17} /> 删除分类，保留应用</span><ChevronDown size={15} className="rotate-270" /></button><button className="setting-row danger-setting-row" onClick={() => confirmDeleteCategory(true)}><span><Trash2 size={17} /> 删除分类及所有应用</span><ChevronDown size={15} className="rotate-270" /></button><div className="form-actions"><button className="secondary-btn" onClick={() => setCategoryToDelete(null)}>取消</button></div></div></Modal>}
    </div>
  )
}

function SideItem({ icon, label, count, active, onClick, onDelete, onRename }: { icon: ReactNode; label: string; count: number; active: boolean; onClick: () => void; onDelete?: () => void; onRename?: () => void }) {
  return <button className={`side-item ${active ? 'active' : ''}`} onClick={onClick}><span className="side-item-icon">{icon}</span><span className="side-item-label">{label}</span><span className="side-item-count">{count}</span>{onRename && <span className="side-item-edit" title="重命名分类" onClick={(e) => { e.stopPropagation(); onRename() }}><Pencil size={12} /></span>}{onDelete && <span className="side-item-delete" title="删除分类" onClick={(e) => { e.stopPropagation(); onDelete() }}><Trash2 size={13} /></span>}</button>
}

function AppCard({ app, categoryName, launching, selected, onSelect, onLaunch, onFavorite, onEdit, onRemove, onRelocate, onOpenDirectory, onToast, layout }: { app: AppRecord; categoryName: string; launching: boolean; selected: boolean; onSelect: () => void; onLaunch: () => void; onFavorite: () => void; onEdit: () => void; onRemove: () => void; onRelocate: () => void; onOpenDirectory: () => void; onToast: (text: string) => void; layout: 'grid' | 'list' | 'compact' }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isCompact = layout === 'compact'
  const icon = app.iconPath ? <img src={app.iconPath} alt="" /> : <span>{app.icon}</span>
  const iconNode = <div className={`app-icon icon-${app.id}`} onContextMenu={(event) => { event.preventDefault(); setMenuOpen(true) }}>{icon}</div>
  if (isCompact) return <article data-app-id={app.id} tabIndex={-1} className={`app-card compact-card ${selected ? 'keyboard-selected' : ''} ${!app.healthy ? 'is-invalid' : ''}`} onFocus={onSelect} onContextMenu={(event) => { event.preventDefault(); setMenuOpen(true) }}><button className="compact-launch" onClick={onLaunch} disabled={!app.healthy} title={`启动 ${app.name}`}>{iconNode}<span className="compact-name">{app.name}</span></button>{menuOpen && <div className="card-menu compact-menu"><button onClick={() => { setMenuOpen(false); onFavorite() }}><Star size={14} /> {app.isFavorite ? '取消收藏' : '收藏'}</button><button onClick={() => { setMenuOpen(false); onEdit() }}><Pencil size={14} /> 编辑</button><button onClick={() => { setMenuOpen(false); onOpenDirectory() }}><FolderOpen size={14} /> 打开目录</button><button className="danger-action" onClick={() => { setMenuOpen(false); onRemove() }}><Trash2 size={14} /> 从启动器移除</button></div>}</article>
  return <article data-app-id={app.id} tabIndex={-1} className={`app-card ${selected ? 'keyboard-selected' : ''} ${!app.healthy ? 'is-invalid' : ''} ${layout === 'list' ? 'list-card' : ''}`}><div className="card-main card-main-clickable" onClick={onLaunch} role="button" tabIndex={app.healthy ? 0 : -1} onFocus={onSelect} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onLaunch() } }}>{iconNode}<div className="app-info"><div className="app-name-row"><h3 title={app.name}>{app.name}</h3>{app.isFavorite && <Star size={14} className="favorite-indicator" fill="currentColor" />}</div><div className="app-meta"><span>{categoryName}</span><span className="meta-dot">·</span><span>{formatTime(app.lastLaunchedAt)}</span></div><p>{app.notes}</p></div></div>{!app.healthy && <div className="invalid-banner"><span className="invalid-icon">!</span><span>文件路径不可用</span><button onClick={(event) => { event.stopPropagation(); onRelocate() }}>重新定位</button></div>}<div className="card-bottom"><div className="launch-count"><Play size={12} fill="currentColor" /> 启动 {app.launchCount} 次</div><div className="card-actions"><button className="text-action" onClick={onLaunch} disabled={launching || !app.healthy}><Play size={14} fill="currentColor" /> {launching ? '启动中…' : '启动'}</button><div className="menu-wrap"><button className="more-btn" title="更多操作" onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={18} /></button>{menuOpen && <div className="card-menu"><button onClick={() => { setMenuOpen(false); onFavorite() }}><Star size={14} /> {app.isFavorite ? '取消收藏' : '收藏'}</button><button onClick={() => { setMenuOpen(false); onEdit() }}><Pencil size={14} /> 编辑</button><button onClick={() => { setMenuOpen(false); onOpenDirectory() }}><FolderOpen size={14} /> 打开目录</button><button className="danger-action" onClick={() => { setMenuOpen(false); onRemove() }}><Trash2 size={14} /> 从启动器移除</button></div>}</div></div></div></article>
}

function EmptyState({ query, onAdd }: { query: string; onAdd: () => void }) { return <div className="empty-state"><div className="empty-icon"><Search size={28} /></div><h2>{query ? '没有找到匹配的应用' : '还没有应用'}</h2><p>{query ? '试试其他关键词，或检查应用名称和路径。' : '把常用的 .exe 文件集中到这里，一键开始工作。'}</p>{!query && <button className="add-app-btn empty-cta" onClick={onAdd}><Plus size={18} /> 添加第一个应用</button>}</div> }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="modal-header"><h2>{title}</h2><button className="icon-btn" onClick={onClose} title="关闭"><X size={19} /></button></div>{children}</div></div> }

function AppForm({ app, initialPath, shortcut, categories, onPickFile, onCancel, onSave }: { app: AppRecord | null; initialPath: string; shortcut: ShortcutDetails | null; categories: Category[]; onPickFile: () => void; onCancel: () => void; onSave: (record: AppRecord) => void }) {
  const [name, setName] = useState(app?.name || '')
  const [path, setPath] = useState(app?.executablePath || initialPath)
  const [categoryId, setCategoryId] = useState(app?.categoryId || categories[0]?.id || '')
  const [notes, setNotes] = useState(app?.notes || '')
  const [args, setArgs] = useState(app?.arguments || shortcut?.arguments || '')
  const [workingDirectory, setWorkingDirectory] = useState(app?.workingDirectory || shortcut?.workingDirectory || '')
  const [iconPath, setIconPath] = useState(app?.iconPath || '')
  const [iconSource, setIconSource] = useState<'system' | 'custom' | ''>(app?.iconSource || '')
  const [error, setError] = useState('')
  const iconInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (initialPath && (!app || initialPath !== app.executablePath)) {
      setPath(initialPath)
      if (!app) setWorkingDirectory(normalizePath(initialPath).split('\\').slice(0, -1).join('\\'))
      if (!app) setName((current) => current || initialPath.split(/[\\/]/).pop()?.replace(/\.exe$/i, '') || '')
    }
  }, [app, initialPath])
  useEffect(() => {
    if (!isTauri() || !path.toLowerCase().endsWith('.exe') || iconSource === 'custom') return
    let cancelled = false
    void invokeDesktop<string>('read_application_icon', { path: normalizePath(path) }).then((icon) => {
      if (!cancelled && typeof icon === 'string' && icon.startsWith('data:image/')) { setIconPath(icon); setIconSource('system') }
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [iconSource, path])
  const save = () => {
    if (!name.trim() || !path.trim()) return
    if (!path.trim().toLowerCase().endsWith('.exe')) { setError('目标文件必须是 .exe 可执行文件'); return }
    setError('')
    const executablePath = normalizeExecutablePath(path)
    onSave({ id: app?.id || `app-${Date.now()}`, name: name.trim(), executablePath, categoryId, icon: app?.icon || name.trim().slice(0, 2).toUpperCase(), iconPath: iconPath || undefined, iconSource: iconPath ? (iconSource || 'custom') : undefined, isFavorite: app?.isFavorite || false, notes: notes.trim(), arguments: args.trim(), workingDirectory: normalizePath(workingDirectory) || executablePath.split('\\').slice(0, -1).join('\\'), launchCount: app?.launchCount || 0, lastLaunchedAt: app?.lastLaunchedAt || null, createdAt: app?.createdAt || new Date().toISOString().slice(0, 10), healthy: true })
  }
  return <div className="form"><label>应用名称<input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：Visual Studio Code" autoFocus /></label><label>可执行文件路径<div className="path-input"><input value={path} onChange={(e) => { setPath(e.target.value); setError('') }} placeholder="选择 .exe 文件" /><button title="选择文件" onClick={onPickFile}><FolderOpen size={17} /></button></div></label>{error && <div className="form-error">{error}</div>}<label>工作目录 <span className="label-hint">可选</span><input value={workingDirectory} onChange={(e) => setWorkingDirectory(e.target.value)} placeholder="默认使用 exe 所在目录" /></label><label>应用图标 <span className="label-hint">可选</span><div className="icon-picker-row"><div className="icon-preview">{iconPath ? <img src={iconPath} alt="" /> : <span>{app?.icon || name.trim().slice(0, 2).toUpperCase() || '??'}</span>}</div><button className="secondary-btn" type="button" onClick={() => iconInputRef.current?.click()}><FolderOpen size={15} /> 选择图片</button>{iconPath && <button className="icon-btn" type="button" title="移除自定义图标" onClick={() => { setIconPath(''); setIconSource('') }}><X size={16} /></button>}<input ref={iconInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/x-icon" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { setIconPath(String(reader.result)); setIconSource('custom') }; reader.readAsDataURL(file); event.target.value = '' }} /></div></label><label>所属分类<select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label><label>启动参数 <span className="label-hint">可选</span><input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="例如：--profile work" /></label><label>备注 <span className="label-hint">可选</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="写点便于识别的说明" rows={3} /></label><div className="form-note"><CircleHelp size={15} /> 支持拖拽或选择 .exe / .lnk；桌面版会解析快捷方式并读取程序图标。</div><div className="form-actions"><button className="secondary-btn" onClick={onCancel}>取消</button><button className="primary-btn" onClick={save} disabled={!name.trim() || !path.trim()}><Check size={16} /> 保存应用</button></div></div>
}

function CategoryForm({ category, onCancel, onSave }: { category?: Category; onCancel: () => void; onSave: (name: string) => void }) { const [name, setName] = useState(category?.name || ''); return <div className="form"><label>分类名称<input value={name} onChange={(event) => setName(event.target.value)} autoFocus placeholder="例如：工作、游戏" /></label><div className="form-actions"><button className="secondary-btn" onClick={onCancel}>取消</button><button className="primary-btn" disabled={!name.trim()} onClick={() => onSave(name)}><Check size={16} /> 保存</button></div></div> }

function SettingsPanel({ theme, setTheme, anime, setAnime, background, setBackground, brandName, setBrandName, brandIcon, setBrandIcon, onReset, onClose, apps, categories, onImport, onImportFolder, onAddApp }: { theme: Theme; setTheme: (theme: Theme) => void; anime: AnimeSettings; setAnime: (settings: AnimeSettings) => void; background: BackgroundSettings; setBackground: (settings: BackgroundSettings) => void; brandName: string; setBrandName: (name: string) => void; brandIcon: string; setBrandIcon: (icon: string) => void; onReset: () => void; onClose: () => void; apps: AppRecord[]; categories: Category[]; onImport: (event: ChangeEvent<HTMLInputElement>) => void; onImportFolder: () => void; onAddApp: () => void }) {
  const iconInputRef = useRef<HTMLInputElement>(null)
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const [autostart, setAutostart] = useState(false)
  const [changingAutostart, setChangingAutostart] = useState(false)
  const updateBackground = (patch: Partial<BackgroundSettings>) => setBackground({ ...background, ...patch })
  const updateAnime = (patch: Partial<AnimeSettings>) => setAnime({ ...anime, ...patch })
  useEffect(() => {
    if (!isTauri()) return
    void invokeDesktop<boolean>('get_autostart', {}).then((enabled) => { if (typeof enabled === 'boolean') setAutostart(enabled) }).catch(() => undefined)
  }, [])
  const toggleAutostart = () => {
    if (!isTauri() || changingAutostart) return
    const next = !autostart
    setChangingAutostart(true)
    void invokeDesktop<boolean>('set_autostart', { enabled: next }).then((enabled) => { if (typeof enabled === 'boolean') setAutostart(enabled) }).finally(() => setChangingAutostart(false))
  }
  const exportLogs = () => {
    const logs = localStorage.getItem('launcher-logs') || '[]'
    const blob = new Blob([logs], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'launcher-logs.json'; anchor.click(); URL.revokeObjectURL(url)
  }
  return <div className="settings-panel">
    <div className="settings-section"><div className="settings-title">启动器标识</div><label className="brand-setting-label">显示名称<input className="brand-name-input" value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="启动器" /></label><div className="brand-icon-setting"><div className="brand-setting-preview">{brandIcon ? <img src={brandIcon} alt="" /> : <Zap size={19} />}</div><button className="secondary-btn" onClick={() => iconInputRef.current?.click()}><FolderOpen size={15} /> 更换图标</button>{brandIcon && <button className="icon-btn" title="恢复默认图标" onClick={() => setBrandIcon('')}><RotateCcw size={15} /></button>}<input ref={iconInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/x-icon" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setBrandIcon(String(reader.result)); reader.readAsDataURL(file); event.target.value = '' }} /></div></div>
    <div className="settings-section"><div className="settings-title">外观主题</div><div className="theme-options">{(['system', 'light', 'dark', 'anime', 'cyber'] as Theme[]).map((item) => <button key={item} className={`theme-option theme-${item} ${theme === item ? 'selected' : ''}`} onClick={() => setTheme(item)}><span className="theme-swatch"></span><span>{item === 'system' ? '跟随系统' : item === 'light' ? '浅色' : item === 'dark' ? '深色' : item === 'anime' ? '二次元' : '赛博朋克'}</span>{theme === item && <Check size={15} />}</button>)}</div></div>
    {theme === 'anime' && <div className="settings-section anime-customization"><div className="settings-title">二次元定制</div><div className="anime-setting-grid"><label>氛围<select value={anime.variant} onChange={(event) => updateAnime({ variant: event.target.value as AnimeVariant })}><option value="sakura">樱花放映室</option><option value="sky">晴空校园</option><option value="moon">月夜番外</option></select></label><label>卡片样式<select value={anime.cardStyle} onChange={(event) => updateAnime({ cardStyle: event.target.value as AnimeCardStyle })}><option value="ribbon">缎带票根</option><option value="polaroid">拍立得</option><option value="glass">玻璃立牌</option><option value="transparent">透明立牌</option></select></label><label>信息密度<select value={anime.density} onChange={(event) => updateAnime({ density: event.target.value as AnimeDensity })}><option value="airy">留白舒展</option><option value="dense">紧凑清单</option></select></label><label>场景装饰<select value={anime.decoration} onChange={(event) => updateAnime({ decoration: event.target.value as AnimeDecoration })}><option value="none">纯净留白</option><option value="sparkle">星屑纸纹</option><option value="tape">纸胶带</option><option value="sticker">贴纸角落</option></select></label><label>轻量动效<select value={anime.motion} onChange={(event) => updateAnime({ motion: event.target.value as AnimeMotion })}><option value="none">静止</option><option value="float">漂浮呼吸</option><option value="breathe">卡片呼吸</option><option value="shimmer">柔光扫过</option></select></label><label>图标间隔<select value={anime.iconSpacing} onChange={(event) => updateAnime({ iconSpacing: event.target.value as AnimeIconSpacing })}><option value="tight">紧凑</option><option value="normal">标准</option><option value="loose">舒展</option></select></label><label>卡片大小<select value={anime.cardSize} onChange={(event) => updateAnime({ cardSize: event.target.value as AnimeCardSize })}><option value="small">小巧</option><option value="medium">标准</option><option value="large">大图标</option></select></label><label>卡片间距<select value={anime.gridSpacing} onChange={(event) => updateAnime({ gridSpacing: event.target.value as AnimeGridSpacing })}><option value="tight">紧凑</option><option value="normal">标准</option><option value="wide">宽松</option></select></label></div></div>}
    <div className="settings-section"><div className="settings-title">背景</div><div className="background-controls"><label>纯色背景<input type="color" value={background.color} onChange={(event) => updateBackground({ color: event.target.value })} /></label><label>显示方式<select value={background.mode} onChange={(event) => updateBackground({ mode: event.target.value as BackgroundMode })}><option value="cover">填充</option><option value="contain">适应</option><option value="center">居中</option><option value="repeat">平铺</option></select></label><label>透明度 <output>{Math.round(background.opacity * 100)}%</output><input type="range" min="0" max="1" step="0.01" value={background.opacity} onChange={(event) => updateBackground({ opacity: Number(event.target.value) })} /></label><label>遮罩强度 <output>{Math.round(background.overlay * 100)}%</output><input type="range" min="0" max="1" step="0.01" value={background.overlay} onChange={(event) => updateBackground({ overlay: Number(event.target.value) })} /></label><label>模糊 <output>{background.blur}px</output><input type="range" min="0" max="20" step="1" value={background.blur} onChange={(event) => updateBackground({ blur: Number(event.target.value) })} /></label></div><div className="background-file-row"><button className="secondary-btn" onClick={() => backgroundInputRef.current?.click()}><FolderOpen size={15} /> {background.image ? '更换背景图片' : '选择背景图片'}</button>{background.image && <button className="icon-btn" title="移除背景图片" onClick={() => updateBackground({ image: '' })}><X size={16} /></button>}<input ref={backgroundInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 10 * 1024 * 1024) return; const reader = new FileReader(); reader.onload = () => updateBackground({ image: String(reader.result) }); reader.readAsDataURL(file); event.target.value = '' }} /></div></div>
    <div className="settings-section"><div className="settings-title">系统集成</div><label className="setting-row system-toggle"><span><AppWindow size={17} /> 开机自动启动<small>关闭窗口后保留在系统托盘，可用 Ctrl+Alt+Space 唤起</small></span><input type="checkbox" checked={autostart} disabled={!isTauri() || changingAutostart} onChange={toggleAutostart} /></label></div>
    <div className="settings-section"><div className="settings-title">数据管理</div><button className="setting-row" onClick={onAddApp}><span><Plus size={17} /> 添加应用</span><ChevronDown size={15} className="rotate-270" /></button><button className="setting-row" onClick={() => { const blob = new Blob([JSON.stringify({ apps, categories, schemaVersion: 2 }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'launcher-backup.json'; anchor.click(); URL.revokeObjectURL(url) }}><span><ArrowDownAZ size={17} /> 导出应用清单</span><ChevronDown size={15} className="rotate-270" /></button>{isTauri() ? <button className="setting-row" onClick={onImportFolder}><span><FolderOpen size={17} /> 导入文件夹</span><ChevronDown size={15} className="rotate-270" /></button> : <label className="setting-row setting-file-row"><span><FolderOpen size={17} /> 导入文件夹</span><input className="visually-hidden" type="file" accept=".exe,.lnk" multiple onChange={onImport} {...({ webkitdirectory: '', directory: '' } as any)} /><ChevronDown size={15} className="rotate-270" /></label>}<label className="setting-row setting-file-row"><span><FolderOpen size={17} /> 导入 JSON 清单</span><input className="visually-hidden" type="file" accept=".json,application/json" onChange={onImport} /><ChevronDown size={15} className="rotate-270" /></label><button className="setting-row" onClick={exportLogs}><span><ArrowDownAZ size={17} /> 导出启动日志</span><ChevronDown size={15} className="rotate-270" /></button><button className="setting-row" onClick={() => void invokeDesktop('open_log_directory', {}).then((opened) => { if (!opened) alert('桌面版可打开日志目录；当前浏览器预览未连接桌面文件系统。') })}><span><FolderOpen size={17} /> 打开日志目录</span><ChevronDown size={15} className="rotate-270" /></button></div>
    <div className="settings-section"><div className="settings-title">关于</div><div className="about-row"><Zap size={17} /> <span>启动器 <small>本地优先 · v{APP_VERSION}</small></span></div></div><div className="form-actions"><button className="secondary-btn" onClick={onReset}><RotateCcw size={15} /> 恢复默认</button><button className="primary-btn" onClick={onClose}>完成</button></div>
  </div>
}
