// 手术知识库管理（预留接口的 HTTP 面）。
// GET  /api/knowledge?q=关键词   检索条目
// POST /api/knowledge           新增条目
// 注：向量检索接入见 src/lib/knowledge/index.ts 的说明。
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { requireActor } from "@/lib/auth";
import { readJson, textField, enumField, stringList } from "@/lib/validation";
import { apiError, limitAction } from "@/lib/http";


export async function GET(req: NextRequest) {
  try {
  await requireActor(req);
  const q = textField({ q: new URL(req.url).searchParams.get("q") ?? "" }, "q", 200, true);
  const store = getStore();
  const entries = await store.listKnowledge(q);
  return Response.json({
    entries,
    retriever: process.env.KNOWLEDGE_RETRIEVER ?? "keyword",
    store: store.kind,
  });
  } catch (error) { return apiError(error); }
}

export async function POST(req: NextRequest) {
  try {
  const actor = await requireActor(req, "admin");
  const body = await readJson(req);
  const input = { title: textField(body, "title", 200),
    category: enumField(body.category ?? "guideline", ["procedure", "instrument", "guideline", "anatomy"], "category"),
    content: textField(body, "content", 20000), tags: stringList(body.tags ?? [], "tags", 10, 60) };
  const store = getStore();
  await limitAction(store, actor.id, "knowledge-write", 10);
  const entry = await store.addKnowledge(input);
  return Response.json({ entry }, { status: 201 });
  } catch (error) { return apiError(error); }
}
