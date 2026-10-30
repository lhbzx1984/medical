import { AuthUnavailableError, authFailureStatus, createAuthClient } from "@/lib/auth";
import { apiError, assertSameOrigin } from "@/lib/http";

export async function POST(req: Request) {
  try { assertSameOrigin(req); } catch (error) { return apiError(error); }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string" ||
      body.email.length > 320 || body.password.length > 1024) {
    return Response.json({ error: "请输入邮箱和密码" }, { status: 400 });
  }
  const client = await createAuthClient();
  const { error } = await client.auth.signInWithPassword({ email: body.email, password: body.password });
  const unavailable = authFailureStatus(error);
  if (unavailable) return apiError(new AuthUnavailableError(unavailable));
  if (error) return Response.json({ error: "登录失败，请检查邮箱和密码" }, { status: 401 });
  return Response.json({ ok: true });
}
