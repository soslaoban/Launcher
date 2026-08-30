# 启动器开发说明

## 当前基线

- 应用版本：`4.3.0`
- 前端：React + TypeScript + Vite
- 桌面端：Tauri 2 + Rust
- 目标平台：Windows x64
- 数据 schema：`3`

本文只描述当前实现与维护流程。用户功能和运行方法见 [README.md](./README.md)。

## 架构

当前项目保持两层结构：

```text
React / App.tsx
  ├─ 应用、分类和偏好状态
  ├─ 搜索、排序、视图和表单交互
  ├─ 浏览器 localStorage 降级
  └─ Tauri invoke 调用
          │
          ▼
Rust / src-tauri/src/lib.rs
  ├─ JSON 状态读取、迁移和原子写入
  ├─ 窗口尺寸持久化
  ├─ 文件校验、启动和目录扫描
  ├─ .lnk 解析与 Windows Shell 图标读取
  └─ 托盘、全局快捷键、开机启动和单实例
```

前端目前集中在 `App.tsx`，没有额外状态管理库。Rust 命令由 `generate_handler!` 统一注册。

## 桌面命令

| 命令 | 用途 |
| --- | --- |
| `frontend_ready` | 前端完成初始化后显示主窗口 |
| `load_launcher_state` | 读取并迁移 `launcher-state.json` |
| `save_launcher_state` | 校验 schema 后原子写入状态 |
| `load_window_size` | 读取有效窗口尺寸 |
| `save_window_size` | 保存 `480x360` 到 `16384x16384` 范围内的物理尺寸 |
| `path_exists` | 检查 `.exe`/`.bat` 是否为现存普通文件 |
| `resolve_shortcut` | 解析 `.lnk` 目标与启动信息 |
| `read_application_icon` | 读取 Windows Shell 图标并返回 PNG data URL |
| `discover_applications` | 递归发现 `.exe`、`.bat` 和 `.lnk` |
| `launch_app` | 使用参数数组及有效工作目录启动文件 |
| `open_directory` | 使用资源管理器打开目录 |
| `open_log_directory` | 创建并打开日志目录 |
| `get_autostart` / `set_autostart` | 查询或修改开机启动 |
| `set_tray_icon` | 将品牌图标同步到托盘 |

## 状态格式

桌面状态保存在 Tauri `app_data_dir` 下的 `launcher-state.json`：

```json
{
  "schemaVersion": 3,
  "apps": [],
  "categories": [],
  "preferences": {
    "theme": "system",
    "anime": {},
    "background": {},
    "brandName": "启动器",
    "brandIcon": "",
    "view": "all",
    "sort": "name",
    "layout": "grid",
    "sidebarCollapsed": false
  }
}
```

维护要求：

- 修改持久化结构时递增 `CURRENT_SCHEMA_VERSION`。
- 为每个旧版本提供顺序迁移，不直接覆盖或静默丢弃未知字段。
- 高于当前支持版本的数据必须拒绝加载。
- 继续使用同目录临时文件和重命名完成状态替换。

## 启动文件约束

- 直接启动项只接受现存普通文件 `.exe` 和 `.bat`，扩展名不区分大小写。
- `.lnk` 必须能解析到受支持的本地目标。
- 路径保存和启动前会移除首尾空白、包裹引号及多余尾部分隔符。
- 请求的工作目录无效时回退到启动文件所在目录。
- 启动参数从前端解析为数组后传入 Rust，禁止在前端拼接 shell 命令。

## 系统集成生命周期

主窗口初始为隐藏状态，前端状态加载完成后调用 `frontend_ready` 显示窗口，避免初始化闪烁。

- 关闭窗口：保存尺寸、隐藏窗口并阻止进程退出。
- 托盘左键或“显示启动器”：显示、取消最小化并聚焦主窗口。
- `Ctrl+Alt+Space`：执行同一窗口唤起逻辑。
- 再次启动 EXE：单实例插件通知现有进程显示窗口，第二个进程退出。
- 设置品牌图标：前端保存偏好，同时调用 `set_tray_icon`；下次启动也会从状态文件恢复。
- 托盘“退出”：调用 `app.exit(0)` 真正结束进程。

## 常用命令

```powershell
# 前端类型检查与生产构建
npm run build

# 桌面开发模式
npm run tauri:dev

# Rust 测试
cargo test --manifest-path src-tauri/Cargo.toml

# 完整发布构建
npm run tauri:build

# 清理 Rust/Tauri 构建缓存
cargo clean --manifest-path src-tauri/Cargo.toml
```

PowerShell 执行策略阻止 `npm.ps1` 时，可将命令中的 `npm` 替换为 `npm.cmd`。

## 测试范围

Rust 单元测试当前覆盖：

- 状态文件重复写入与 schema 迁移。
- 未来 schema 拒绝。
- 路径清理、缺失文件及非启动文件拒绝。
- Windows EXE 启动及无效工作目录回退。
- 带空格路径的 BAT 实际执行。
- Windows EXE 图标读取及 PNG 编码。
- 自定义托盘图标解码、尺寸归一化及无效数据拒绝。

前端没有独立测试框架，`npm run build` 是最低验证要求。涉及布局或主题时还应在至少一个桌面尺寸和一个窄窗口尺寸下人工回归。

## 发布检查

1. 确认 `package.json`、`Cargo.toml` 和 `tauri.conf.json` 版本一致。
2. 运行 `npm run build`。
3. 运行 `cargo test --manifest-path src-tauri/Cargo.toml`。
4. 运行 `npm run tauri:build`。
5. 验证独立 EXE 首次启动可见，重复启动保持单实例。
6. 验证关闭后进程留在托盘，左键托盘可恢复窗口。
7. 验证自定义品牌图标在托盘立即更新且重启后保留。
8. 分别添加并启动 `.exe`、`.bat` 和可解析的 `.lnk`。
9. 检查 MSI 和 NSIS 安装包版本、安装、升级和卸载。
10. 正式发布前完成代码签名。

## 可再生文件

以下内容不应提交：

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `src-tauri/gen/`
- `*.tsbuildinfo`

`src-tauri/icons/` 只保留 `tauri.conf.json` 中打包明确引用的图标。

## 已知技术债

- `App.tsx` 同时承担状态、业务流程和视图，继续扩展前应按领域拆分。
- 目录扫描为同步递归实现，较大目录需要后台任务、进度、取消和符号链接策略。
- 导入流程缺少去重、冲突预览和批量确认。
- 启动日志主要保存在 WebView localStorage，尚未统一写入 Rust 日志目录。
- 窗口只保存尺寸，尚未保存位置和显示器标识。
- 前端参数解析尚未覆盖所有 Windows 引号与转义边界。
- 安装包未签名，也没有 CI 发布流水线。
