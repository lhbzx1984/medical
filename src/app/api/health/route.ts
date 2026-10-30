// 服务健康检查 / 配置状态。
import { connection } from "next/server";
import { agnesConfigured, CHAT_MODEL, IMAGE_MODEL } from "@/lib/agnes";

export async function GET() {
  await connection();
  return Response.json({
    ok: true,
    store: "supabase",
    agnesConfigured: agnesConfigured(),
    authConfigured: Boolean((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)),
    models: { chat: CHAT_MODEL, image: IMAGE_MODEL },
    knowledgeRetriever: process.env.KNOWLEDGE_RETRIEVER ?? "keyword",
  });
}
