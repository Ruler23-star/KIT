# 知行 · 个人知识、灵感与 Todo 工作台

这是一个本地优先的个人知识工作台。知识文档、灵感、Todo、来源关系和图片均保存在当前项目目录。

## 启动

双击 `启动工作台.bat`，等待浏览器打开 `http://localhost:3000`。

也可以在终端运行：

```powershell
pnpm dev
```

## 本地数据

- SQLite 数据库：`data/knowledge.db`
- 图片：`data/uploads/`
- 备份目录：`data/backups/`

AI 功能通过 ChatGPT/Codex 内置浏览器的 Site tools（WebMCP）使用，不需要 OpenAI API Key。普通浏览器可以使用全部非 AI 功能。

