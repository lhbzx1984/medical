import { createAuthClient } from "@/lib/auth";
import { apiError, assertSameOrigin } from "@/lib/http";
export async function POST(req: Request) {
  try { assertSameOrigin(req); } catch (error) { return apiError(error); }
  const client = await createAuthClient();
  await client.auth.signOut();
  return Response.json({ ok: true });
}
