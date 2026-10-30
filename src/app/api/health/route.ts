// 服务健康检查 / 配置状态。
import { connection, type NextRequest } from "next/server";
import { agnesConfigured, CHAT_MODEL, IMAGE_MODEL } from "@/lib/agnes";

export async function GET(_req: NextRequest) {
  await connection();
  return Response.json({
    ok: true,
    store: "supabase",
    agnesConfigured: agnesConfigured(),
    models: { chat: CHAT_MODEL, image: IMAGE_MODEL },
    knowledgeRetriever: process.env.KNOWLEDGE_RETRIEVER ?? "keyword",
  });
}
