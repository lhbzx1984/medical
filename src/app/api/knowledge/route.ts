// 手术知识库管理（预留接口的 HTTP 面）。
// GET  /api/knowledge?q=关键词   检索条目
// POST /api/knowledge           由管理员新增或更新条目
// 注：向量检索接入见 src/lib/knowledge/index.ts 的说明。
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { getAdminStore } from "@/lib/admin";


export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("manage") === "1") {
    const auth = await getAdminStore();
    if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
    return Response.json({ entries: await auth.store.listKnowledge() });
  }
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const store = await getStore();
  if (!store) return Response.json({ error: "请先登录" }, { status: 401 });
  const entries = await store.listKnowledge(q);
  return Response.json({
    entries,
    retriever: process.env.KNOWLEDGE_RETRIEVER ?? "keyword",
    store: store.kind,
  });
}

export async function POST(req: Request) {
  const auth = await getAdminStore();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "条目格式不正确" }, { status: 400 });
  const v = body as Record<string, unknown>;
  const shortText = (x: unknown, max: number) => typeof x === "string" && x.length <= max;
  if ((v.id !== undefined && (typeof v.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.id))) ||
      !shortText(v.title, 500) || !(v.title as string).trim() || !shortText(v.content, 50000) || !(v.content as string).trim() ||
      !shortText(v.category, 100) || !shortText(v.sourceName, 500) || !shortText(v.sourceUrl, 2000) || !shortText(v.sourceVersion, 200) ||
      (v.reviewStatus !== "approved" && v.reviewStatus !== "unreviewed") ||
      !Array.isArray(v.tags) || v.tags.length > 10 || v.tags.some((tag) => !shortText(tag, 100))) {
    return Response.json({ error: "条目字段格式不正确或内容过长" }, { status: 400 });
  }
  if (v.reviewStatus === "approved" && !(v.sourceName as string).trim()) return Response.json({ error: "审核通过时必须填写来源" }, { status: 400 });
  if (v.sourceUrl) {
    try { const url = new URL(v.sourceUrl as string); if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(); }
    catch { return Response.json({ error: "来源链接必须为 HTTP 或 HTTPS 地址" }, { status: 400 }); }
  }
  await auth.store.saveKnowledge({ id: v.id as string | undefined, title: (v.title as string).trim(), category: v.category as string,
    content: v.content as string, tags: v.tags as string[], sourceName: (v.sourceName as string).trim(),
    sourceUrl: v.sourceUrl as string, sourceVersion: v.sourceVersion as string,
    reviewStatus: v.reviewStatus as "unreviewed" | "approved", reviewedBy: v.reviewStatus === "approved" ? auth.userId : "",
    reviewedAt: v.reviewStatus === "approved" ? new Date().toISOString() : null });
  return Response.json({ ok: true });
}
