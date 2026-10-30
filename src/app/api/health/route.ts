// 服务健康检查 / 配置状态。
import { connection } from "next/server";
import { agnesConfigured, CHAT_MODEL, IMAGE_MODEL } from "@/lib/agnes";
import { getStore } from "@/lib/store";
import { authConfigured } from "@/lib/auth";
import { apiError } from "@/lib/http";

export async function GET() {
  await connection();
  try {
    const store = getStore();
    return Response.json({
      ok: true,
      store: store.kind,
      agnesConfigured: agnesConfigured(),
      authConfigured: authConfigured(),
      models: { chat: CHAT_MODEL, image: IMAGE_MODEL },
      knowledgeRetriever: process.env.KNOWLEDGE_RETRIEVER ?? "keyword",
    });
  } catch (error) { return apiError(error); }
}
