// 数据存储工厂：配置了 Supabase 环境变量则持久化，否则使用内置演示存储。
import type { DataStore } from "./base";
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";

const g = globalThis as unknown as { __medplanStore?: DataStore };

export function getStore(): DataStore {
  if (g.__medplanStore) return g.__medplanStore;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && /^https?:\/\//.test(url)) {
    g.__medplanStore = new SupabaseStore(url, key);
  } else {
    if (url || key) throw new Error("Supabase 配置不完整：需要有效的 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY");
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_MEMORY_STORE !== "true") {
      throw new Error("生产环境需要配置 Supabase；仅本地演示可显式设置 ALLOW_MEMORY_STORE=true（重启清空）");
    }
    g.__medplanStore = new MemoryStore();
  }
  return g.__medplanStore;
}
