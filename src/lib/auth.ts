import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** 认证服务故障或限流时保留原状态，不能被当成"未登录"或"密码错误"。 */
export function authFailureStatus(error: { status?: number; name?: string } | null | undefined): 429 | 503 | null {
  if (!error) return null;
  if (error.status === 429) return 429;
  if ((typeof error.status === "number" && error.status >= 500) || error.name === "AuthRetryableFetchError") return 503;
  return null;
}

export class AuthUnavailableError extends Error {
  constructor(readonly status: 429 | 503) {
    super(status === 429 ? "认证服务请求过于频繁，请稍后重试" : "认证服务暂不可用，请稍后重试");
    this.name = "AuthUnavailableError";
  }
}

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
      // 浏览器端不使用 Supabase 客户端，会话 Cookie 对脚本不可见，降低 XSS 窃取会话的风险。
      setAll(values) { for (const { name, value, options } of values) jar.set(name, value, { ...options, httpOnly: true }); },
    },
  });
}
