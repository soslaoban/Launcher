# 启动器（Launcher）

面向 Windows 的本地应用启动器，用于集中管理和快速启动 `.exe` 应用、`.bat` 批处理及指向它们的 `.lnk` 快捷方式。

项目使用 React、TypeScript、Vite 和 Tauri 2 构建。应用清单与设置保存在本机，不依赖云端服务。

## 功能

### 启动项管理

- 通过系统文件选择器、拖拽或目录扫描添加 `.exe`、`.bat` 和 `.lnk`。
- 解析 `.lnk` 的目标路径、参数、工作目录和图标位置。
- 编辑名称、分类、启动参数、工作目录、备注及自定义图标。
- 启动前检查文件是否存在；路径失效时支持重新定位。
- 从启动器移除记录时不会删除磁盘上的源文件。
- 自动读取 Windows 文件图标，读取失败时使用文字图标。

### 浏览与操作

- 所有应用、最近使用、收藏和自定义分类。
- 按名称、最近使用、启动次数或添加时间排序。
- 网格、列表和紧凑视图。
- 搜索名称、路径、备注和启动参数。
- 记录启动次数和最近启动时间。
- 支持 JSON 清单导入、导出及启动日志导出。

### 外观

- 跟随系统、浅色、深色、二次元和赛博朋克主题。
- 自定义背景图片、纯色、适配方式、透明度、遮罩和模糊。
- 二次元主题可调整场景、卡片样式、装饰、动效、图标大小及间距。
- 自定义启动器名称和品牌图标；品牌图标会同步到系统托盘。

### Windows 集成

- 关闭主窗口后隐藏到系统托盘。
- 左键单击托盘图标、托盘菜单或 `Ctrl+Alt+Space` 可显示并聚焦窗口。
- 支持开机自动启动。
- 单实例运行：再次启动 EXE 会拉起已有窗口。
- 保存并恢复最近一次有效窗口尺寸。

## 环境要求

- Windows 10/11 x64
- Node.js 20.19+ 或 22.12+
- Rust 1.77.2 或更高版本
- Tauri 在 Windows 上需要的 WebView2 与 C++ 构建工具

首次准备环境可参考 [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)。

## 开发运行

安装依赖：

```powershell
npm install
```

启动桌面开发模式：

```powershell
npm run tauri:dev
```

仅启动浏览器预览：

```powershell
npm run dev
```

浏览器预览不能读取真实 Windows 文件图标、解析快捷方式或启动本地程序。

## 构建与测试

前端生产构建：

```powershell
npm run build
```

Rust 测试：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

生成独立 EXE、MSI 和 NSIS 安装包：

```powershell
npm run tauri:build
```

主要产物位于：

```text
src-tauri/target/release/app.exe
src-tauri/target/release/bundle/msi/
src-tauri/target/release/bundle/nsis/
```

`src-tauri/target/` 和 `src-tauri/gen/` 是可再生目录，不提交到 Git。需要释放构建缓存时运行：

```powershell
cargo clean --manifest-path src-tauri/Cargo.toml
```

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+K` | 聚焦搜索框 |
| `Ctrl+Alt+Space` | 全局显示并聚焦启动器 |
| 方向键 | 在应用之间移动选择 |
| `Enter` | 启动当前应用 |
| `Delete` | 移除当前应用，操作前会确认 |
| `Esc` | 关闭当前弹窗 |

## 数据与隐私

桌面版使用 Tauri 应用数据目录中的文件：

- `launcher-state.json`：应用、分类及界面偏好，当前 schema 版本为 `3`。
- `launcher-window.json`：最近一次有效窗口尺寸。

状态文件使用临时文件替换方式写入，并包含旧版本数据迁移。应用不会上传启动项路径或使用记录。

“打开日志目录”使用 `%LOCALAPPDATA%\Launcher\logs`。前端保留最近 50 条启动事件，可从设置页导出。

## 项目结构

```text
.
├─ src/
│  ├─ App.tsx             # 界面、状态与桌面命令调用
│  ├─ main.tsx            # React 入口
│  └─ styles.css          # 主题和响应式样式
├─ src-tauri/
│  ├─ capabilities/       # Tauri 权限清单
│  ├─ icons/              # 打包所需图标
│  ├─ src/lib.rs          # 状态、启动、扫描、图标和系统集成
│  ├─ src/main.rs         # Windows 桌面入口
│  ├─ Cargo.toml
│  └─ tauri.conf.json
├─ DEVELOPMENT.md         # 架构、测试与发布说明
└─ package.json
```

## 当前限制

- 仅支持 Windows 启动文件 `.exe`、`.bat`，以及指向它们的 `.lnk`。
- 仅包含 Shell namespace、没有可读取本地目标的快捷方式无法导入。
- 目录扫描会递归读取所选目录，当前没有进度显示、取消或导入前去重预览。
- 项目内置的演示应用路径可能不存在，桌面版会将其标记为不可用。
- 安装包尚未签名，Windows 可能显示未知发布者提示。

详细开发说明见 [DEVELOPMENT.md](./DEVELOPMENT.md)。
