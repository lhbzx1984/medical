import { createAuthClient } from "@/lib/auth";
export async function POST() {
  const client = await createAuthClient();
  await client.auth.signOut();
  return Response.json({ ok: true });
}
