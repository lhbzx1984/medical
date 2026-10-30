import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createAuthClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("请配置 SUPABASE_URL 和 SUPABASE_ANON_KEY");
  // 高权限密钥会绕过 RLS，不能作为用户客户端的 API key。
  let role = "";
  try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role ?? ""; } catch { /* publishable key */ }
  if (role === "service_role" || key.startsWith("sb_secret_")) {
    throw new Error("SUPABASE_ANON_KEY 必须为匿名或 publishable 密钥");
  }
  const jar = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() { return jar.getAll(); },
      setAll(values) { for (const { name, value, options } of values) jar.set(name, value, options); },
    },
  });
}
