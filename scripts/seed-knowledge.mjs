// 从现有种子源导入，固定 ID 保证重跑不重复，也不覆盖管理员已审核的修改。
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";
import ts from "typescript";

export function readSeedEntries() {
  const source = readFileSync(new URL("../src/lib/knowledge/seed.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const localModule = { exports: {} };
  new Function("exports", "module", compiled)(localModule.exports, localModule);
  return localModule.exports.SEED_KNOWLEDGE;
}

export async function seedKnowledge(client, entries = readSeedEntries()) {
  const rows = entries.map((entry) => {
    const bytes = createHash("sha256").update(`medplan-knowledge:${entry.title}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 15) | 80;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = bytes.toString("hex");
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return { ...entry, id };
  });
  const { error } = await client.from("knowledge_entries").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`知识种子导入失败: ${error.message}`);
  return rows.length;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    nextEnv.loadEnvConfig(fileURLToPath(new URL("..", import.meta.url)));
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("需要 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY；先执行 supabase/schema.sql");
    const count = await seedKnowledge(createClient(url, key, { auth: { persistSession: false } }));
    console.log(`已处理 ${count} 条知识种子；已有相同 ID 的记录保持原样。`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "知识种子导入失败");
    process.exitCode = 1;
  }
}
