import type { User } from "@supabase/supabase-js";
import { AuthUnavailableError, authFailureStatus, createAuthClient } from "@/lib/auth";
import { SupabaseStore } from "./supabase";

function actorName(user: User): string {
  const fullName = user.user_metadata?.full_name;
  return typeof fullName === "string" && fullName.trim() ? fullName.trim() : user.email || "登录用户";
}

// 每次请求都建立独立客户端，绝不缓存用户会话或使用 service_role。
export async function getStore(): Promise<SupabaseStore | null> {
  const client = await createAuthClient();
  const { data: { user }, error } = await client.auth.getUser();
  const unavailable = authFailureStatus(error);
  if (unavailable) throw new AuthUnavailableError(unavailable);
  if (error || !user) return null;
  const { data: version, error: migrationError } = await client.rpc("medplan_security_version");
  if (migrationError || version !== 1) throw new Error("数据库尚未完成用户隔离迁移");
  return new SupabaseStore(client, { id: user.id, name: actorName(user) });
}
