import { createAuthClient } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string" ||
      body.email.length > 320 || body.password.length > 1024) {
    return Response.json({ error: "请输入邮箱和密码" }, { status: 400 });
  }
  const client = await createAuthClient();
  const { error } = await client.auth.signInWithPassword({ email: body.email, password: body.password });
  if (error) return Response.json({ error: "登录失败，请检查邮箱和密码" }, { status: 401 });
  return Response.json({ ok: true });
}
