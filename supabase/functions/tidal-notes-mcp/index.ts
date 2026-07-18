import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import postgres from "postgres"

const PROTOCOL_VERSION = "2025-03-26"
const SERVER_INFO = { name: "tidal-notes", version: "1.0.0" }
const ACCESS_TOKEN_SHA256 = "6dcf37b4ade9ced5a6b894cde914cbd47a2b9316f4d0355f09144b886fc00bc6"
const MAX_BROWSE_NOTES = 10
const MAX_SEARCH_RESULTS = 50
const MAX_COMMENT_CHARS = 2000

const connectionString = Deno.env.get("SUPABASE_DB_URL")
if (!connectionString) throw new Error("SUPABASE_DB_URL is unavailable")
const sql = postgres(connectionString, { max: 1, idle_timeout: 5, prepare: false })

type RpcRequest = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

type EntryRow = {
  id: string
  date: string
  category: string
  content: string
  created_at?: string
}

const TOOLS = [
  {
    name: "browse_notes",
    description: "翻开潮汐随笔。返回最近或随机浮上来的摘要列表，不含完整正文；想读某篇时请继续调用 read_note。",
    inputSchema: {
      type: "object",
      properties: {
        n: { type: "integer", minimum: 1, maximum: MAX_BROWSE_NOTES, default: 5, description: "返回篇数，默认 5，最多 10。" },
        tag: { type: "string", description: "可选的标签精确筛选。" },
        mode: { type: "string", enum: ["recent", "random"], default: "recent", description: "recent 看最近随笔；random 从潮水里随机捞取。" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_note",
    description: "点进一篇随笔，按 id 读取完整正文和全部批注，并区分小狐狸与小鱼。通常先通过 browse_notes 或 search_notes 取得 id。",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "随笔 id。" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "read_notes_by_date",
    description: "读取某一天的全部随笔；每篇都返回完整正文和全部批注。",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "日期，格式 YYYY-MM-DD。" } },
      required: ["date"],
      additionalProperties: false,
    },
  },
  {
    name: "search_notes",
    description: "按正文关键词搜索潮汐随笔，可叠加标签筛选。返回摘要列表，不含完整正文；想读某篇时请继续调用 read_note。最多返回 50 条，并用 total 与 truncated 告知是否截断。",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "要在正文中查找的文字，按字面包含匹配。" },
        tag: { type: "string", description: "可选的标签精确筛选。" },
      },
      required: ["keyword"],
      additionalProperties: false,
    },
  },
  {
    name: "write_comment",
    description: "以小鱼身份给指定随笔留下批注。落笔不改。批注写下后不提供编辑或删除工具。",
    inputSchema: {
      type: "object",
      properties: {
        note_id: { type: "string", description: "要批注的随笔 id。" },
        text: { type: "string", minLength: 1, maxLength: MAX_COMMENT_CHARS, description: "批注正文，最多 2000 字。" },
      },
      required: ["note_id", "text"],
      additionalProperties: false,
    },
  },
]

function jsonRpc(id: RpcRequest["id"], result: unknown, status = 200) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, { status })
}

function rpcError(id: RpcRequest["id"], code: number, message: string, status = 200) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status })
}

function toolResult(value: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    ...(isError ? { isError: true } : {}),
  }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
}

async function authorized(req: Request) {
  const auth = req.headers.get("authorization") || ""
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return !!match && await sha256(match[1].trim()) === ACCESS_TOKEN_SHA256
}

function textArg(args: Record<string, unknown>, name: string, required = false) {
  const value = typeof args[name] === "string" ? args[name].trim() : ""
  if (required && !value) throw new Error(`${name} 不能为空。`)
  return value
}

function preview(content: string) {
  const normalized = String(content || "").replace(/\s+/gu, " ").trim()
  const chars = Array.from(normalized)
  return chars.length > 40 ? chars.slice(0, 40).join("") + "……" : normalized
}

function previewEntry(row: EntryRow) {
  return { id: row.id, date: row.date, tag: row.category, preview: preview(row.content) }
}

function authorFor(role: string) {
  return role === "assistant" || role === "ai" ? "小鱼" : "小狐狸"
}

async function commentsFor(entryId: string) {
  const rows = await sql`
    select role, content, created_at
    from public.messages
    where entry_id = ${entryId}
    order by created_at asc, id asc
  `
  return rows.map(row => ({
    author: authorFor(String(row.role || "")),
    text: String(row.content || ""),
    created_at: row.created_at,
  }))
}

async function fullEntry(row: EntryRow) {
  return {
    id: row.id,
    date: row.date,
    tag: row.category,
    content: row.content,
    comments: await commentsFor(row.id),
  }
}

async function browseNotes(args: Record<string, unknown>) {
  const requested = Number(args.n ?? 5)
  const n = Number.isInteger(requested) ? Math.min(MAX_BROWSE_NOTES, Math.max(1, requested)) : 5
  const tag = textArg(args, "tag")
  const mode = args.mode === "random" ? "random" : "recent"
  let rows: EntryRow[]
  if (mode === "random") {
    rows = tag
      ? await sql<EntryRow[]>`select id, date, category, content from public.entries where category = ${tag} order by random() limit ${n}`
      : await sql<EntryRow[]>`select id, date, category, content from public.entries order by random() limit ${n}`
  } else {
    rows = tag
      ? await sql<EntryRow[]>`select id, date, category, content from public.entries where category = ${tag} order by date desc, created_at desc nulls last, id desc limit ${n}`
      : await sql<EntryRow[]>`select id, date, category, content from public.entries order by date desc, created_at desc nulls last, id desc limit ${n}`
  }
  return { mode, tag: tag || null, count: rows.length, notes: rows.map(previewEntry) }
}

async function readNote(args: Record<string, unknown>) {
  const id = textArg(args, "id", true)
  const rows = await sql<EntryRow[]>`
    select id, date, category, content
    from public.entries where id = ${id} limit 1
  `
  if (!rows.length) throw new Error(`没有找到 id 为 ${id} 的随笔。`)
  return await fullEntry(rows[0])
}

async function readNotesByDate(args: Record<string, unknown>) {
  const date = textArg(args, "date", true)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date 必须是 YYYY-MM-DD 格式。")
  const rows = await sql<EntryRow[]>`
    select id, date, category, content
    from public.entries where date = ${date}
    order by created_at asc nulls last, id asc
  `
  return { date, count: rows.length, notes: await Promise.all(rows.map(fullEntry)) }
}

async function searchNotes(args: Record<string, unknown>) {
  const keyword = textArg(args, "keyword", true)
  const tag = textArg(args, "tag")
  const countRows = tag
    ? await sql`select count(*)::int as count from public.entries where category = ${tag} and position(lower(${keyword}) in lower(coalesce(content, ''))) > 0`
    : await sql`select count(*)::int as count from public.entries where position(lower(${keyword}) in lower(coalesce(content, ''))) > 0`
  const total = Number(countRows[0]?.count || 0)
  const rows: EntryRow[] = tag
    ? await sql<EntryRow[]>`select id, date, category, content from public.entries where category = ${tag} and position(lower(${keyword}) in lower(coalesce(content, ''))) > 0 order by date desc, created_at desc nulls last, id desc limit ${MAX_SEARCH_RESULTS}`
    : await sql<EntryRow[]>`select id, date, category, content from public.entries where position(lower(${keyword}) in lower(coalesce(content, ''))) > 0 order by date desc, created_at desc nulls last, id desc limit ${MAX_SEARCH_RESULTS}`
  return { keyword, tag: tag || null, total, truncated: total > MAX_SEARCH_RESULTS, notes: rows.map(previewEntry) }
}

async function writeComment(args: Record<string, unknown>) {
  const noteId = textArg(args, "note_id", true)
  const text = textArg(args, "text", true)
  if (Array.from(text).length > MAX_COMMENT_CHARS) throw new Error(`text 不能超过 ${MAX_COMMENT_CHARS} 字。`)
  const note = await sql`select id from public.entries where id = ${noteId} limit 1`
  if (!note.length) throw new Error(`没有找到 id 为 ${noteId} 的随笔。`)
  const time = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date())
  const rows = await sql`
    insert into public.messages (entry_id, role, content, time)
    values (${noteId}, 'assistant', ${text}, ${time})
    returning id, entry_id, content, created_at
  `
  const saved = rows[0]
  return {
    saved: true,
    comment: {
      id: String(saved.id), note_id: saved.entry_id, author: "小鱼",
      text: saved.content, created_at: saved.created_at,
    },
  }
}

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "browse_notes": return await browseNotes(args)
    case "read_note": return await readNote(args)
    case "read_notes_by_date": return await readNotesByDate(args)
    case "search_notes": return await searchNotes(args)
    case "write_comment": return await writeComment(args)
    default: throw new Error(`没有名为 ${name} 的工具。`)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 })
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 })
  if (!await authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let rpc: RpcRequest
  try {
    rpc = await req.json()
  } catch {
    return rpcError(null, -32700, "Parse error", 400)
  }

  if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 })
  if (rpc.method === "initialize") {
    return jsonRpc(rpc.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
    })
  }
  if (rpc.method === "tools/list") return jsonRpc(rpc.id, { tools: TOOLS })
  if (rpc.method === "tools/call") {
    const params = rpc.params || {}
    const name = typeof params.name === "string" ? params.name : ""
    const args = params.arguments && typeof params.arguments === "object"
      ? params.arguments as Record<string, unknown>
      : {}
    try {
      return jsonRpc(rpc.id, toolResult(await callTool(name, args)))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return jsonRpc(rpc.id, toolResult({ error: message }, true))
    }
  }
  return rpcError(rpc.id, -32601, "Method not found")
})
