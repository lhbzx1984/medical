import { createClient } from "@supabase/supabase-js";
import { getAdminStore } from "@/lib/admin";

// The privileged client is created only after a server-side administrator check.
function adminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: Request) {
  const auth = await getAdminStore();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const client = adminClient();
  if (!client) return Response.json({ error: "未配置管理员服务密钥" }, { status: 503 });
  const page = Number(new URL(req.url).searchParams.get("page") ?? "1");
  if (!Number.isInteger(page) || page < 1 || page > 10000) return Response.json({ error: "页码不正确" }, { status: 400 });
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 50 });
  if (error) return Response.json({ error: "读取用户失败，请检查服务配置" }, { status: 502 });
  return Response.json({ users: data.users.map((user) => ({ id: user.id, email: user.email ?? "", createdAt: user.created_at, bannedUntil: user.banned_until ?? null, banned: !!user.banned_until && Date.parse(user.banned_until) > Date.now() })), page, hasMore: data.users.length === 50 });
}

export async function POST(req: Request) {
  const auth = await getAdminStore();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const client = adminClient();
  if (!client) return Response.json({ error: "未配置管理员服务密钥" }, { status: 503 });
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "请求格式不正确" }, { status: 400 });
  const v = body as Record<string, unknown>;
  const store = auth.store;
  async function audited(action: string, target: string, operation: () => Promise<{ error: unknown }>) {
    const operationId = crypto.randomUUID();
    try { await store.recordAdminAction(operationId, action, target, "requested"); }
    catch { return Response.json({ error: "无法记录管理员操作，请检查数据库迁移" }, { status: 503 }); }
    let operationError: unknown;
    try { operationError = (await operation()).error; } catch (error) { operationError = error; }
    let warning = "";
    try { await store.recordAdminAction(operationId, action, target, operationError ? "failed" : "succeeded"); }
    catch { warning = "操作结果的审计记录写入失败，请联系管理员核查。"; }
    if (operationError) return Response.json({ error: "账号操作失败，请检查服务配置", warning }, { status: 400 });
    return Response.json({ ok: true, warning });
  }
  if (v.action === "create") {
    if (typeof v.email !== "string" || v.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) ||
        typeof v.password !== "string" || v.password.length < 10 || v.password.length > 128)
      return Response.json({ error: "请输入有效邮箱和 10 至 128 位临时密码" }, { status: 400 });
    const email = v.email.trim(); const password = v.password;
    return audited("create", email, () => client.auth.admin.createUser({ email, password, email_confirm: true }));
  }
  if ((v.action !== "reset" && v.action !== "disable" && v.action !== "enable") || typeof v.userId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.userId))
    return Response.json({ error: "操作或用户 ID 不正确" }, { status: 400 });
  if (v.userId === auth.userId) return Response.json({ error: "请在账号设置中修改自己的密码，不能停用自己的账号" }, { status: 400 });
  if (v.action === "reset" && (typeof v.password !== "string" || v.password.length < 10 || v.password.length > 128))
    return Response.json({ error: "临时密码需为 10 至 128 位" }, { status: 400 });
  const attributes = v.action === "reset" ? { password: v.password as string } : { ban_duration: v.action === "disable" ? "876000h" : "none" };
  return audited(v.action as string, v.userId, () => client.auth.admin.updateUserById(v.userId as string, attributes));
}
