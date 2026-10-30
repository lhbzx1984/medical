import { createClient } from "@supabase/supabase-js";
import { ApiError } from "./http";

export const SESSION_COOKIE = "medplan_session";
export type Actor = { id: string; name: string; role: "user" | "expert" | "admin" };

export function authConfigured(): boolean {
  return Boolean((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
}

export function authClient(signal?: AbortSignal) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ApiError("尚未配置登录服务，请先配置 Supabase Auth", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) }) } });
}

export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  // Next may build req.url with its internal hostname; forms use the public Host.
  const url = new URL(req.url);
  const protocol = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.slice(0, -1);
  const expectedOrigin = `${protocol}://${req.headers.get("host") || url.host}`;
  if (req.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== expectedOrigin)) {
    throw new ApiError("不允许跨站提交", 403);
  }
}

export function authFailure(error: { status?: number } | null, unauthorized: string): ApiError {
  if (error?.status === 429) return new ApiError("登录请求过于频繁，请稍后重试", 429);
  if (error && (!error.status || error.status >= 500)) return new ApiError("登录服务暂不可用，请稍后重试", 503);
  return new ApiError(unauthorized, 401);
}

export async function requireActor(req: Request, role?: "expert" | "admin"): Promise<Actor> {
  if (!["GET", "HEAD"].includes(req.method)) assertSameOrigin(req);
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const cookie = req.headers.get("cookie")?.split(";").map((v) => v.trim())
    .find((v) => v.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  const token = bearer || cookie;
  if (!token) throw new ApiError("请先登录", 401);
  const { data, error } = await authClient(req.signal).auth.getUser(token);
  req.signal.throwIfAborted();
  if (error || !data.user) throw authFailure(error, "登录已过期，请重新登录");
  const user = data.user;
  const userRole = ["expert", "admin"].includes(user.app_metadata?.role) ? user.app_metadata.role as "expert" | "admin" : "user";
  if (role && userRole !== "admin" && userRole !== role) throw new ApiError("当前账号没有该操作权限", 403);
  const fullName = user.user_metadata?.full_name;
  return { id: user.id, name: typeof fullName === "string" && fullName.trim() ? fullName.trim() : user.email || "登录用户", role: userRole };
}

export function sessionCookie(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.max(0, maxAge)}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
