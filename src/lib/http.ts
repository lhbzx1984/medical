import { AgnesError } from "@/lib/agnes";
import { getStore } from "@/lib/store";
import type { SupabaseStore } from "@/lib/store/supabase";
import { ValidationError } from "@/lib/validation";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function apiError(error: unknown): Response {
  if (error instanceof ApiError || error instanceof AgnesError || error instanceof ValidationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  // 按名称识别存储层错误，避免同一错误类在不同打包实例中 instanceof 失效。
  if (error instanceof Error && error.name === "RevisionConflictError") return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof Error && error.name === "CaseNotFoundError") return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof Error && error.name === "AuthUnavailableError") {
    return Response.json({ error: error.message }, { status: (error as Error & { status?: number }).status === 429 ? 429 : 503 });
  }
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
    return Response.json({ error: error.name === "TimeoutError" ? "请求超时，请稍后重试" : "请求已取消" },
      { status: error.name === "TimeoutError" ? 504 : 499 });
  }
  console.error("API operation failed", error instanceof Error ? error.name : "UnknownError");
  return Response.json({ error: "服务暂不可用，请检查服务配置或稍后重试" }, { status: 503 });
}

/** 登录会话由 Supabase Auth Cookie 提供；未登录或会话过期返回 401。 */
export async function requireStore(): Promise<SupabaseStore> {
  const store = await getStore();
  if (!store) throw new ApiError("请先登录", 401);
  return store;
}

/** 状态修改请求必须来自本站，作为 SameSite Cookie 之外的第二层 CSRF 防护。 */
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
