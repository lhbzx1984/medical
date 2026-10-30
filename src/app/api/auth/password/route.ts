import { createAuthClient } from "@/lib/auth";

export async function POST(req: Request) {
  const client = await createAuthClient();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) return Response.json({ error: "请先登录" }, { status: 401 });
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "请求格式不正确" }, { status: 400 });
  const { currentPassword, newPassword } = body as Record<string, unknown>;
  if (typeof currentPassword !== "string" || !currentPassword || currentPassword.length > 1024 ||
      typeof newPassword !== "string" || newPassword.length < 10 || newPassword.length > 128 || newPassword === currentPassword) {
    return Response.json({ error: "请输入当前密码及 10 至 128 位的新密码" }, { status: 400 });
  }
  const { error } = await client.auth.updateUser({ current_password: currentPassword, password: newPassword });
  if (error) return Response.json({ error: "密码修改失败，请检查当前密码及新密码是否符合要求" }, { status: 400 });
  return Response.json({ ok: true });
}
