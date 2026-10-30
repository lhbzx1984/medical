import { authClient, authConfigured, authFailure, assertSameOrigin, requireActor, sessionCookie } from "@/lib/auth";
import { apiError, ApiError } from "@/lib/http";
import { readJson, textField } from "@/lib/validation";
import { connection } from "next/server";

export async function GET(req: Request) {
  await connection();
  if (!authConfigured()) return Response.json({ authenticated: false, configured: false });
  try {
    const actor = await requireActor(req);
    return Response.json({ authenticated: true, configured: true, user: actor });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return Response.json({ authenticated: false, configured: true });
    }
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = await readJson(req);
    const email = textField(body, "email", 254);
    const password = body.password;
    if (typeof password !== "string" || !password.length || password.length > 200) {
      throw new ApiError("请输入有效的密码", 400);
    }
    const { data, error } = await authClient(req.signal).auth.signInWithPassword({ email, password });
    req.signal.throwIfAborted();
    if (error || !data.session) throw authFailure(error, "登录失败，请核对账号和密码");
    return Response.json({ authenticated: true }, {
      headers: { "Set-Cookie": sessionCookie(data.session.access_token, data.session.expires_in) },
    });
  } catch (error) { return apiError(error); }
}

export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    return Response.json({ authenticated: false }, { headers: { "Set-Cookie": sessionCookie("", 0) } });
  } catch (error) { return apiError(error); }
}
