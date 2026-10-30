"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

export default function AuthControls() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth", { cache: "no-store" }).then(async (res) => {
      if (!res.ok) throw new Error("登录服务暂不可用");
      const result = await res.json();
      if (alive) { setUser(result.user ?? null); setConfigured(result.configured !== false); }
    }).catch(() => { if (alive) setError("登录服务暂不可用，请稍后重试"); });
    return () => { alive = false; };
  }, []);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.get("email"), password: values.get("password") }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "登录失败");
      window.location.reload();
    } catch (e) { setError(e instanceof Error ? e.message : "登录失败"); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth", { method: "DELETE" });
      if (!res.ok) throw new Error("退出失败，请重试");
      window.location.reload();
    } catch (e) { setError(e instanceof Error ? e.message : "退出失败"); dialog.current?.showModal(); }
    finally { setBusy(false); }
  };

  return <>
    {user ? <button className="btn !px-2 !text-[12px]" onClick={logout} disabled={busy} title={`${user.name} · ${user.role}`}>
      退出
    </button> : <button className="btn !px-2 !text-[12px]" onClick={() => dialog.current?.showModal()}>登录</button>}
    <dialog ref={dialog} aria-labelledby="login-title" className="panel m-auto w-[min(420px,calc(100%_-_32px))] p-6 text-[var(--text)] backdrop:bg-black/50">
      <form onSubmit={login} className="space-y-4">
        <h2 id="login-title" className="text-lg font-bold text-[var(--heading)]">账号登录</h2>
        {!configured && <p className="text-sm">尚未配置登录服务，请联系项目维护人员。公开解剖模型仍可浏览。</p>}
        {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
        <label className="label">邮箱<input className="input mt-1" name="email" type="email" autoComplete="username" required maxLength={254} /></label>
        <label className="label">密码<input className="input mt-1" name="password" type="password" autoComplete="current-password" required maxLength={200} /></label>
        <p className="text-xs text-[var(--muted)]">专家与知识库管理权限以登录账号为准。</p>
        <div className="flex justify-end gap-2">
          <button className="btn" type="button" onClick={() => dialog.current?.close()}>关闭</button>
          <button className="btn btn-primary" type="submit" disabled={!configured || busy}>{busy ? "登录中…" : "登录"}</button>
        </div>
      </form>
    </dialog>
  </>;
}
