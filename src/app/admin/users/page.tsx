"use client";
import { useCallback, useEffect, useState } from "react";
type User = { id: string; email: string; createdAt: string; bannedUntil: string | null; banned: boolean };
export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [target, setTarget] = useState<User | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/users?page=${page}`);
    const data = await res.json() as { users?: User[]; hasMore?: boolean; error?: string };
    if (!res.ok) throw new Error(data.error ?? "加载失败");
    setUsers(data.users ?? []); setHasMore(!!data.hasMore); setAllowed(true);
  }, [page]);
  useEffect(() => {
    let active = true;
    fetch(`/api/admin/users?page=${page}`).then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error ?? "加载失败"); return data; })
      .then((data) => { if (active) { setUsers(data.users ?? []); setHasMore(!!data.hasMore); setAllowed(true); } })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "加载失败"); });
    return () => { active = false; };
  }, [page]);
  async function run(body: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as { error?: string; warning?: string }; if (!res.ok) throw new Error([data.error ?? "操作失败", data.warning].filter(Boolean).join(" "));
      setPassword(""); setTemporaryPassword(""); setEmail(""); setTarget(null); setNotice(data.warning ? `操作已完成。${data.warning}` : "操作已完成。");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "操作失败"); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-4xl space-y-4 p-6"><h1 className="text-xl font-semibold">账号管理</h1>
    <p className="text-sm text-[var(--muted)]">禁止新登录不会撤销已有会话。请通过安全渠道交付临时密码，提醒用户登录后修改。</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {allowed && <><form className="panel space-y-3 p-4" onSubmit={(event) => { event.preventDefault(); void run({ action: "create", email, password }); }}>
      <h2 className="font-semibold">创建用户</h2><label className="block">邮箱<input className="input w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label className="block">临时密码<input className="input w-full" type="password" autoComplete="new-password" minLength={10} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      <button className="btn btn-primary" disabled={busy}>创建用户</button>
    </form>
    <section className="panel p-4"><h2 className="mb-3 font-semibold">用户列表</h2>
      {users.map((user) => <div key={user.id} className="panel-2 mb-2 flex flex-wrap items-center gap-2 p-3">
        <span className="min-w-0 flex-1 break-all">{user.email || user.id}{user.banned ? " · 禁止新登录" : ""}</span>
        <button className="btn" disabled={busy} onClick={() => { setTarget(user); setTemporaryPassword(""); }}>重置密码</button>
        <button className="btn" disabled={busy} onClick={() => { const banned = !!user.banned; if (window.confirm(`${banned ? "允许" : "禁止"} ${user.email || user.id} 新登录？`)) void run({ action: banned ? "enable" : "disable", userId: user.id }); }}>{user.banned ? "允许登录" : "禁止新登录"}</button>
      </div>)}
      <div className="mt-3 flex items-center gap-3"><button className="btn" disabled={page <= 1 || busy} onClick={() => setPage(page - 1)}>上一页</button><span>第 {page} 页</span><button className="btn" disabled={!hasMore || busy} onClick={() => setPage(page + 1)}>下一页</button></div>
    </section>
    {target && <form className="panel space-y-3 p-4" onSubmit={(event) => { event.preventDefault(); void run({ action: "reset", userId: target.id, password: temporaryPassword }); }}>
      <h2 className="font-semibold">为 {target.email || target.id} 重置密码</h2>
      <label className="block">临时密码<input className="input w-full" type="password" autoComplete="new-password" minLength={10} maxLength={128} value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} required /></label>
      <div className="flex gap-2"><button className="btn btn-primary" disabled={busy}>确认重置</button><button type="button" className="btn" onClick={() => { setTarget(null); setTemporaryPassword(""); }}>取消</button></div>
    </form>}</>}
  </main>;
}
