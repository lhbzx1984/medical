import "server-only";
import { createAuthClient } from "./auth";
import { SupabaseStore } from "./store/supabase";
export async function getAdminStore() {
  const client = await createAuthClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { error: "请先登录", status: 401 } as const;
  const { data: isAdmin, error: adminError } = await client.rpc("medplan_is_admin");
  if (adminError) return { error: "管理员权限检查失败，请确认数据库迁移", status: 503 } as const;
  if (isAdmin !== true) return { error: "需要管理员权限", status: 403 } as const;
  return { store: new SupabaseStore(client), userId: user.id } as const;
}
