// 手术知识库管理（预留接口的 HTTP 面）。
// GET  /api/knowledge?q=关键词   检索条目
// POST /api/knowledge           新增条目
// 注：向量检索接入见 src/lib/knowledge/index.ts 的说明。
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";


export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const store = getStore();
  const entries = await store.listKnowledge(q);
  return Response.json({
    entries,
    retriever: process.env.KNOWLEDGE_RETRIEVER ?? "keyword",
    store: store.kind,
  });
}

export async function POST(req: NextRequest) {
  let body: { title?: string; category?: string; content?: string; tags?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || typeof body.title !== "string" ||
      typeof body.content !== "string" || !body.title.trim() || !body.content.trim() ||
      (body.category !== undefined && typeof body.category !== "string")) {
    return Response.json({ error: "title 与 content 不能为空" }, { status: 400 });
  }
  if (body.title.length > 500 || body.content.length > 50000 || (body.category?.length ?? 0) > 100 ||
      (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.length > 10 ||
        body.tags.some((tag) => typeof tag !== "string" || tag.length > 100)))) {
    return Response.json({ error: "知识条目格式不正确或内容过长" }, { status: 400 });
  }
  const entry = await getStore().addKnowledge({
    title: body.title.trim(),
    category: body.category?.trim() || "guideline",
    content: body.content.trim(),
    tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 10) : [],
  });
  return Response.json({ entry }, { status: 201 });
}
