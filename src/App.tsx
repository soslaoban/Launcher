import { type ReactNode, useEffect, useMemo, useState } from 'react'
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
  MoreHorizontal,
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

type Theme = 'light' | 'dark' | 'cyber'
type View = 'all' | 'recent' | 'favorites' | string
type Sort = 'name' | 'recent' | 'count' | 'added'

type AppRecord = {
  id: string
  name: string
  executablePath: string
  categoryId: string
  icon: string
  isFavorite: boolean
  notes: string
  arguments: string
  workingDirectory: string
  launchCount: number
  lastLaunchedAt: string | null
  createdAt: string
  healthy: boolean
}

type Category = { id: string; name: string }

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

function formatTime(value: string | null) {
  if (!value) return '尚未启动'
  return value
}

export default function App() {
  const [apps, setApps] = useState<AppRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '').apps || starterApps } catch { return starterApps }
  })
  const [categories, setCategories] = useState<Category[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '').categories || starterCategories } catch { return starterCategories }
  })
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('launcher-theme') as Theme) || 'light')
  const [view, setView] = useState<View>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('name')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [modal, setModal] = useState<'add' | 'edit' | 'settings' | null>(null)
  const [editing, setEditing] = useState<AppRecord | null>(null)
  const [toast, setToast] = useState('')
  const [launching, setLaunching] = useState<string | null>(null)

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ apps, categories, schemaVersion: 1 })) }, [apps, categories])
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('launcher-theme', theme) }, [theme])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2800); return () => clearTimeout(timer) }, [toast])

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
      if (sort === 'recent') return Number(!!b.lastLaunchedAt) - Number(!!a.lastLaunchedAt) || b.launchCount - a.launchCount
      return b.createdAt.localeCompare(a.createdAt)
    })
  }, [apps, query, sort, view])

  const viewTitle = view === 'all' ? '所有应用' : view === 'recent' ? '最近使用' : view === 'favorites' ? '收藏' : categories.find((c) => c.id === view)?.name || '所有应用'

  const showToast = (message: string) => setToast(message)
  const launchApp = (app: AppRecord) => {
    if (!app.healthy) { showToast('目标路径不可用，请重新定位文件'); return }
    setLaunching(app.id)
    setTimeout(() => {
      setLaunching(null)
      setApps((current) => current.map((item) => item.id === app.id ? { ...item, launchCount: item.launchCount + 1, lastLaunchedAt: '刚刚' } : item))
      showToast(`已启动 ${app.name}`)
    }, 650)
  }
  const toggleFavorite = (id: string) => setApps((current) => current.map((item) => item.id === id ? { ...item, isFavorite: !item.isFavorite } : item))
  const removeApp = (app: AppRecord) => {
    if (window.confirm(`确定从启动器移除“${app.name}”吗？\n\n只删除启动器记录，不删除磁盘上的 exe 文件。`)) {
      setApps((current) => current.filter((item) => item.id !== app.id)); showToast('已从启动器移除')
    }
  }
  const addCategory = () => {
    const name = window.prompt('新分类名称')?.trim()
    if (!name) return
    const id = `category-${Date.now()}`
    setCategories((current) => [...current, { id, name }]); setView(id); showToast('分类已创建')
  }
  const deleteCategory = (category: Category) => {
    const destinationCategory = categories.find((item) => item.id !== category.id)
    const destinationName = destinationCategory?.name || '未分类'
    if (!window.confirm(`删除分类“${category.name}”？应用会移动到“${destinationName}”。`)) return
    setCategories((current) => current.filter((item) => item.id !== category.id))
    setApps((current) => current.map((item) => item.categoryId === category.id ? { ...item, categoryId: destinationCategory?.id || '' } : item))
    if (view === category.id) setView('all')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Zap size={18} fill="currentColor" /></div><div><div className="brand-title">启动器</div><div className="brand-subtitle">LAUNCHER / LOCAL APPS</div></div></div>
        <div className="topbar-actions"><label className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索应用、路径或备注" /><kbd>Ctrl K</kbd></label><button className="icon-btn" title="帮助"><CircleHelp size={18} /></button><button className="icon-btn" title="设置" onClick={() => setModal('settings')}><Settings size={18} /></button><div className="window-dots"><span></span><span></span><span className="close-dot"></span></div></div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <button className="add-app-btn" onClick={() => { setEditing(null); setModal('add') }}><Plus size={18} /> 添加应用</button>
          <div className="side-section"><div className="side-label">快速访问</div><SideItem icon={<AppWindow size={17} />} label="所有应用" count={categoryCounts.all} active={view === 'all'} onClick={() => setView('all')} /><SideItem icon={<Clock3 size={17} />} label="最近使用" count={categoryCounts.recent} active={view === 'recent'} onClick={() => setView('recent')} /><SideItem icon={<Star size={17} />} label="收藏" count={categoryCounts.favorites} active={view === 'favorites'} onClick={() => setView('favorites')} /></div>
          <div className="side-section categories"><div className="side-label side-label-row"><span>我的分类</span><button className="mini-btn" title="新建分类" onClick={addCategory}><Plus size={15} /></button></div>{categories.map((cat) => <SideItem key={cat.id} icon={<span className="category-dot" />} label={cat.name} count={categoryCounts[cat.id] || 0} active={view === cat.id} onClick={() => setView(cat.id)} onDelete={() => deleteCategory(cat)} />)}<button className="new-category" onClick={addCategory}><Plus size={15} /> 新建分类</button></div>
          <div className="sidebar-footer"><div className="sync-status"><span className="status-dot"></span><span>数据已保存到本机</span></div><div className="version">v0.1.0 MVP</div></div>
        </aside>
        <main className="main-content">
          <div className="content-header"><div><div className="eyebrow">APPLICATION LIBRARY</div><h1>{viewTitle}</h1><p>{visibleApps.length} 个应用 <span className="muted-separator">/</span> {query ? `正在搜索“${query}”` : '按你的工作流整理'}</p></div><div className="header-controls"><div className="select-wrap"><SlidersHorizontal size={15} /><select value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="name">按名称排序</option><option value="recent">最近使用</option><option value="count">使用次数</option><option value="added">添加时间</option></select><ChevronDown size={14} /></div><div className="layout-toggle"><button className={layout === 'grid' ? 'active' : ''} onClick={() => setLayout('grid')} title="网格视图"><Grid2X2 size={17} /></button><button className={layout === 'list' ? 'active' : ''} onClick={() => setLayout('list')} title="列表视图"><List size={18} /></button></div></div></div>
          {visibleApps.length ? <div className={`apps-container ${layout}`}>{visibleApps.map((app) => <AppCard key={app.id} app={app} categoryName={categories.find((c) => c.id === app.categoryId)?.name || '未分类'} launching={launching === app.id} onLaunch={() => launchApp(app)} onFavorite={() => toggleFavorite(app.id)} onEdit={() => { setEditing(app); setModal('edit') }} onRemove={() => removeApp(app)} onToast={showToast} layout={layout} />)}</div> : <EmptyState query={query} onAdd={() => { setEditing(null); setModal('add') }} />}
          <div className="content-footer"><span>最后同步于刚刚</span><span className="footer-separator">·</span><button onClick={() => showToast('已刷新应用状态')}><RotateCcw size={13} /> 刷新状态</button></div>
        </main>
      </div>
      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
      {modal && <Modal title={modal === 'settings' ? '设置' : modal === 'edit' ? '编辑应用' : '添加应用'} onClose={() => setModal(null)}><>{modal === 'settings' ? <SettingsPanel theme={theme} setTheme={setTheme} onClose={() => setModal(null)} /> : <AppForm app={editing} categories={categories} onCancel={() => setModal(null)} onSave={(record) => { setApps((current) => editing ? current.map((item) => item.id === record.id ? record : item) : [record, ...current]); setModal(null); showToast(editing ? '应用已更新' : '应用已添加') }} />}</></Modal>}
    </div>
  )
}

function SideItem({ icon, label, count, active, onClick, onDelete }: { icon: ReactNode; label: string; count: number; active: boolean; onClick: () => void; onDelete?: () => void }) {
  return <button className={`side-item ${active ? 'active' : ''}`} onClick={onClick}><span className="side-item-icon">{icon}</span><span className="side-item-label">{label}</span><span className="side-item-count">{count}</span>{onDelete && <span className="side-item-delete" onClick={(e) => { e.stopPropagation(); onDelete() }}><Trash2 size={13} /></span>}</button>
}

function AppCard({ app, categoryName, launching, onLaunch, onFavorite, onEdit, onRemove, onToast, layout }: { app: AppRecord; categoryName: string; launching: boolean; onLaunch: () => void; onFavorite: () => void; onEdit: () => void; onRemove: () => void; onToast: (text: string) => void; layout: 'grid' | 'list' }) {
  return <article className={`app-card ${!app.healthy ? 'is-invalid' : ''} ${layout === 'list' ? 'list-card' : ''}`}><div className="card-main"><div className={`app-icon icon-${app.id}`}><span>{app.icon}</span></div><div className="app-info"><div className="app-name-row"><h3 title={app.name}>{app.name}</h3>{app.isFavorite && <Star size={14} className="favorite-indicator" fill="currentColor" />}</div><div className="app-meta"><span>{categoryName}</span><span className="meta-dot">·</span><span>{formatTime(app.lastLaunchedAt)}</span></div><p>{app.notes}</p></div><button className={`favorite-btn ${app.isFavorite ? 'active' : ''}`} title={app.isFavorite ? '取消收藏' : '收藏'} onClick={onFavorite}><Star size={17} fill={app.isFavorite ? 'currentColor' : 'none'} /></button></div>{!app.healthy && <div className="invalid-banner"><span className="invalid-icon">!</span><span>文件路径不可用</span><button onClick={() => onToast('请在编辑中重新选择 .exe 文件')}>重新定位</button></div>}<div className="card-bottom"><div className="launch-count"><Play size={12} fill="currentColor" /> 启动 {app.launchCount} 次</div><div className="card-actions"><button className="text-action" onClick={onLaunch} disabled={launching || !app.healthy}><Play size={14} fill="currentColor" /> {launching ? '启动中…' : '启动'}</button><button className="more-btn" title="更多操作" onClick={() => { const action = window.prompt('输入操作：edit 编辑 / folder 打开目录 / delete 删除'); if (action === 'edit') onEdit(); if (action === 'folder') onToast('已请求打开所在目录'); if (action === 'delete') onRemove() }}><MoreHorizontal size={18} /></button></div></div></article>
}

function EmptyState({ query, onAdd }: { query: string; onAdd: () => void }) { return <div className="empty-state"><div className="empty-icon"><Search size={28} /></div><h2>{query ? '没有找到匹配的应用' : '还没有应用'}</h2><p>{query ? '试试其他关键词，或检查应用名称和路径。' : '把常用的 .exe 文件集中到这里，一键开始工作。'}</p>{!query && <button className="add-app-btn empty-cta" onClick={onAdd}><Plus size={18} /> 添加第一个应用</button>}</div> }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="modal-header"><h2>{title}</h2><button className="icon-btn" onClick={onClose} title="关闭"><X size={19} /></button></div>{children}</div></div> }

function AppForm({ app, categories, onCancel, onSave }: { app: AppRecord | null; categories: Category[]; onCancel: () => void; onSave: (record: AppRecord) => void }) {
  const [name, setName] = useState(app?.name || '')
  const [path, setPath] = useState(app?.executablePath || '')
  const [categoryId, setCategoryId] = useState(app?.categoryId || categories[0]?.id || '')
  const [notes, setNotes] = useState(app?.notes || '')
  const [args, setArgs] = useState(app?.arguments || '')
  const save = () => {
    if (!name.trim() || !path.trim()) return
    onSave({ id: app?.id || `app-${Date.now()}`, name: name.trim(), executablePath: path.trim(), categoryId, icon: app?.icon || name.trim().slice(0, 2).toUpperCase(), isFavorite: app?.isFavorite || false, notes: notes.trim() || '未添加备注', arguments: args.trim(), workingDirectory: app?.workingDirectory || path.trim().split('\\').slice(0, -1).join('\\'), launchCount: app?.launchCount || 0, lastLaunchedAt: app?.lastLaunchedAt || null, createdAt: app?.createdAt || new Date().toISOString().slice(0, 10), healthy: true })
  }
  return <div className="form"><label>应用名称<input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：Visual Studio Code" autoFocus /></label><label>可执行文件路径<div className="path-input"><input value={path} onChange={(e) => setPath(e.target.value)} placeholder="选择 .exe 文件" /><button title="选择文件" onClick={() => setPath(path || 'C:\\Program Files\\YourApp\\App.exe')}><FolderOpen size={17} /></button></div></label><label>所属分类<select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label><label>启动参数 <span className="label-hint">可选</span><input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="例如：--profile work" /></label><label>备注 <span className="label-hint">可选</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="写点便于识别的说明" rows={3} /></label><div className="form-note"><CircleHelp size={15} /> 首版使用浏览器本地存储模拟数据；接入 Tauri 后会改为调用 Windows 原生文件选择器与进程启动。</div><div className="form-actions"><button className="secondary-btn" onClick={onCancel}>取消</button><button className="primary-btn" onClick={save} disabled={!name.trim() || !path.trim()}><Check size={16} /> 保存应用</button></div></div>
}

function SettingsPanel({ theme, setTheme, onClose }: { theme: Theme; setTheme: (theme: Theme) => void; onClose: () => void }) { return <div className="settings-panel"><div className="settings-section"><div className="settings-title">外观主题</div><div className="theme-options">{(['light', 'dark', 'cyber'] as Theme[]).map((item) => <button key={item} className={`theme-option theme-${item} ${theme === item ? 'selected' : ''}`} onClick={() => setTheme(item)}><span className="theme-swatch"></span><span>{item === 'light' ? '浅色' : item === 'dark' ? '深色' : '赛博朋克'}</span>{theme === item && <Check size={15} />}</button>)}</div></div><div className="settings-section"><div className="settings-title">数据管理</div><button className="setting-row" onClick={() => { const blob = new Blob([localStorage.getItem(STORAGE_KEY) || '{}'], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'launcher-backup.json'; anchor.click(); URL.revokeObjectURL(url) }}><span><ArrowDownAZ size={17} /> 导出应用清单</span><ChevronDown size={15} className="rotate-270" /></button><button className="setting-row" onClick={() => alert('导入功能将在 Tauri 版本接入文件选择器后开放')}><span><FolderOpen size={17} /> 导入应用清单</span><ChevronDown size={15} className="rotate-270" /></button></div><div className="settings-section"><div className="settings-title">关于</div><div className="about-row"><Zap size={17} /> <span>启动器 MVP <small>本地优先 · v0.1.0</small></span></div></div><div className="form-actions"><button className="primary-btn" onClick={onClose}>完成</button></div></div> }
