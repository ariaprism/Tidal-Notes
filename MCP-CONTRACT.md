# Tidal Notes MCP

Bubble 通过 Streamable HTTP MCP 访问 Tidal-Notes。服务端代码位于
`supabase/functions/tidal-notes-mcp/index.ts`，线上地址为：

`https://nhptfkluxwbssxkovfad.supabase.co/functions/v1/tidal-notes-mcp`

## 认证

请求必须携带 `Authorization: Bearer <token>`。函数源码只保存高熵 token 的
SHA-256，不保存 token 原文；原文保存在 Bubble 的 MCP 服务器配置中。

Tidal 网页本身使用 Supabase Auth 的邮箱/密码登录。浏览器只保存 Supabase 会话与
上次使用的邮箱，不保存密码；REST 请求使用用户 access token。`entries/messages`
只授权带有 `app_metadata.tidal_notes_access=true` 的已登录用户，匿名用户没有表权限。
当前关闭访客注册，新用户必须由项目管理员创建并显式授予该标记。

## 工具

- `browse_notes(n=5, tag?, mode=recent|random)`：返回最多 10 篇摘要预览。
- `read_note(id)`：返回一篇完整正文和全部批注。
- `read_notes_by_date(date)`：返回某日全部完整随笔和批注。
- `search_notes(keyword, tag?)`：按正文包含搜索，最多返回 50 条摘要，并返回
  `total` 与 `truncated`。
- `write_comment(note_id, text)`：以 `role=assistant` 新增批注，最多 2000 字。

预览统一返回 `id / date / tag / preview`，`tag` 在数据库中映射为
`entries.category`。批注作者映射为 `user → 小狐狸`、`assistant|ai → 小鱼`。
没有编辑或删除批注工具，也没有任意 SQL 工具。

## 当前状态

- 线上 Edge Function：`ACTIVE`，`verify_jwt=false`，由函数内 Bearer Token 哈希校验。
- Bubble 已保存为“Tidal”，调用叙事为“小鱼翻了翻你的小册子”。
- 真实联调覆盖认证拒绝、5 个工具发现、最近/随机预览、单篇、按日期、50 条
  搜索截断和写批注；写入探针已按精确 id 清理。
- `entries/messages` 的 `allow all` 已移除；匿名访问被拒绝，网页由 Supabase Auth
  会话通过 RLS 读写。MCP 使用 Edge Function 的服务端数据库连接，不受前端 RLS
  影响，真实 `browse_notes` 回归已通过。
