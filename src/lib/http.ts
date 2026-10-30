import { AgnesError } from "./agnes";
import { ValidationError } from "./validation";
import type { DataStore } from "./store/base";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function apiError(error: unknown): Response {
  if (error instanceof ApiError || error instanceof AgnesError || error instanceof ValidationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.name === "StoreConflictError") {
    return Response.json({ error: "方案已更新，请刷新后重试" }, { status: 409 });
  }
  if (error instanceof Error && error.name === "StoreAccessError") {
    return Response.json({ error: "无权访问该数据" }, { status: 403 });
  }
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
    return Response.json({ error: error.name === "TimeoutError" ? "请求超时，请稍后重试" : "请求已取消" },
      { status: error.name === "TimeoutError" ? 504 : 499 });
  }
  console.error("API operation failed", error instanceof Error ? error.name : "UnknownError");
  return Response.json({ error: "服务暂不可用，请检查服务配置或稍后重试" }, { status: 503 });
}

export async function limitAction(store: DataStore, ownerId: string, action: string, limit: number) {
  if (!await store.consumeRateLimit(ownerId, action, limit, 60)) throw new ApiError("请求过于频繁，请一分钟后重试", 429);
}
