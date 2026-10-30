// 手术知识库管理（预留接口的 HTTP 面）。
// GET  /api/knowledge?q=关键词   检索条目
// POST /api/knowledge           禁止普通用户修改共享知识库
// 注：向量检索接入见 src/lib/knowledge/index.ts 的说明。
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";


export async function GET(req: NextRequest) {
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

export async function POST() {
  const store = await getStore();
  if (!store) return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json({ error: "知识库由管理员维护" }, { status: 403 });
}
