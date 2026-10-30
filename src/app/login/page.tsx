"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) });
      if (!response.ok) { setError("登录失败，请检查邮箱和密码"); return; }
      router.push("/planning"); router.refresh();
    } catch { setError("无法连接服务器，请稍后重试"); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-md p-8"><h1 className="mb-6 text-2xl font-semibold">登录</h1>
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label>邮箱<input className="input w-full" name="email" type="email" autoComplete="username" required /></label>
      <label>密码<input className="input w-full" name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p role="alert">{error}</p>}<button className="btn" disabled={busy}>{busy ? "登录中…" : "登录"}</button>
    </form><p className="mt-4 text-sm">请联系管理员创建账号。</p></main>;
}
