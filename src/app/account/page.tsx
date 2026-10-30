"use client";
import { useState } from "react";
export default function AccountPage() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form);
    const currentPassword = String(fields.get("currentPassword") ?? "");
    const newPassword = String(fields.get("newPassword") ?? "");
    if (newPassword !== fields.get("confirmation")) { setError("两次输入的新密码不一致"); return; }
    setBusy(true); setError(""); setSuccess(false);
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "密码修改失败");
      form.reset(); setSuccess(true);
    } catch (e) { setError(e instanceof Error ? e.message : "密码修改失败"); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-md p-8"><h1 className="mb-5 text-2xl font-semibold">账号设置</h1>
    <form onSubmit={submit} className="space-y-4">
      <label className="block">当前密码<input className="input w-full" name="currentPassword" type="password" autoComplete="current-password" required /></label>
      <label className="block">新密码（10 至 128 位）<input className="input w-full" name="newPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
      <label className="block">确认新密码<input className="input w-full" name="confirmation" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
      {error && <p role="alert" className="text-red-400">{error}</p>}{success && <p role="status">密码已修改。</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "保存中…" : "修改密码"}</button>
    </form></main>;
}
