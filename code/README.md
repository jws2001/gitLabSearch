# GitLab 项目搜索 · uTools 插件

在 uTools 中快速搜索和打开你的 GitLab 项目。支持关键词 / 路径 / 描述 / 拼音首字母 / 驼峰缩写 模糊匹配。

## 功能（MVP）

- 关键词搜索：项目名、`path_with_namespace`、描述
- 模糊匹配：Fuse.js + 拼音首字母（如 `gls` 命中 `gitLabSearch`）
- 本地缓存：项目列表存入 `utools.db`，离线可用
- 快捷键打开：
  - `Enter` 项目主页
  - `Cmd/Ctrl + Enter` MR 列表
  - `Alt + Enter` Issues
  - `Shift + Enter` Pipelines
  - `Cmd/Ctrl + C` 复制 HTTPS clone 地址
  - `Cmd/Ctrl + Shift + C` 复制 SSH clone 地址
  - **`Cmd/Ctrl + Shift + Enter` 一键 git clone**（HTTPS 协议，后台执行）
  - `↑ / ↓` 列表导航、`Esc` 清空或退出
- 设置页：配置地址、Token、测试连接、默认克隆目录、立即同步、清除缓存

## 一键克隆说明

- 触发：在搜索页选中项目 → 按 `Cmd/Ctrl + Shift + Enter`
- 协议：使用 HTTPS URL（`http_url_to_repo`）
- 目标路径：`${默认克隆目录}/${项目名}`。若未设置默认目录，会弹出 macOS/Windows 的目录选择器
- 进度：顶部横幅实时显示 `git clone --progress` 输出
- 完成后：通知 + 「在 Finder 打开 / 复制路径」按钮
- 失败时：显示错误并提供「复制 git clone 命令」兜底

**注意**：私有仓库 HTTPS 克隆依赖系统的 git credential helper（macOS Keychain / Windows Credential Manager）。如果是首次对该 GitLab 实例做 HTTPS 克隆，建议先在终端手动 `git clone` 一次让系统存下凭证，之后插件一键克隆就能无感执行。否则可能因为需要交互式输入用户名/密码而失败（插件设置了 `GIT_TERMINAL_PROMPT=0` 禁止交互挂死，会直接报错）。

## 目录结构

```
gitLabSearch/
├── plugin.json              uTools 插件配置
├── preload.js               Node/utools 能力桥（暴露 window.services）
├── index.html               单页 SPA，内含「搜索」和「设置」两个 view
├── css/style.css            样式（自动跟随系统明暗）
├── js/
│   ├── utils.js             工具函数（高亮、防抖、时间等）
│   ├── search.js            Fuse 索引与查询
│   ├── main.js              搜索 view 交互 + 路由
│   └── settings.js          设置 view 交互
├── lib/
│   ├── fuse.min.js          Fuse.js 7.x
│   └── pinyin-pro.min.js    pinyin-pro 3.x
└── logo.png                 占位图标（128×128，可自行替换）
```

## 开发 / 加载方式

uTools 本地开发加载：

1. 打开 uTools → 设置（右上角齿轮）→ 开发者 → 开发者工具。
2. 点击「新增本地项目」→ 选择本目录（`gitLabSearch/`）。
3. 在 uTools 主输入框输入 `gl-setup` 进入设置页。

## Personal Access Token 生成

1. 打开 GitLab：用户头像 → **Preferences** → **Access Tokens**。
2. 创建 token，scope 勾选至少 `read_api`（如需查看用户信息可加 `read_user`）。
3. 复制生成的 token（形如 `glpat-xxxxxx…`），粘贴到设置页并点「测试连接」。

## 首次使用

1. `gl-setup` 打开设置页，填写 GitLab 地址（默认 `https://gitlab.com`，也支持自建实例如 `https://gitlab.mycorp.com`）和 Token。
2. 点「测试连接」确认 Token 有效。
3. 点「保存」→「立即同步」，等待拉取完成。
4. 在 uTools 主输入框输入 `gl`、`gitlab` 或 `gitlab搜索` 进入搜索页。

## 数据位置

所有数据存放在 uTools 插件数据库（`utools.db`）中，键：

| 键 | 说明 |
|---|---|
| `config:gitlab` | `{ baseUrl, token, cloneDir, lastSyncAt }` |
| `projects:list` | `{ items: [...], updatedAt }` |
| `history:search` | `{ items: string[] }`（最多 20 条） |

点「清除缓存」会清掉 `projects:list` 和 `history:search`（保留配置）。

## 已知限制 / 未做

本版本聚焦 MVP，以下功能留给后续迭代：

- 收藏置顶、标签分组、Group 过滤
- MR / Issue 快搜（如 `!123`、`#456`）
- 多 GitLab 实例同时管理
- 定时自动增量同步（当前仅提供「立即同步」按钮）
- 完整主题适配（当前仅跟随系统明暗配色）
- 项目头像本地持久化缓存（当前走浏览器缓存直链）
- HTTPS 克隆失败时自动回退 SSH / 自动嵌入 token

## License

MIT
