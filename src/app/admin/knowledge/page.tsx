"use client";
import { useCallback, useEffect, useState } from "react";
import type { KnowledgeEntry } from "@/lib/types";

type Form = { id?: string; title: string; category: string; content: string; tags: string; sourceName: string; sourceUrl: string; sourceVersion: string; reviewStatus: "unreviewed" | "approved" };
const EMPTY: Form = { title: "", category: "guideline", content: "", tags: "", sourceName: "", sourceUrl: "", sourceVersion: "", reviewStatus: "unreviewed" };
export default function KnowledgeAdminPage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/knowledge?manage=1");
    const data = await response.json() as { entries?: KnowledgeEntry[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "加载失败");
    setEntries(data.entries ?? []); setAllowed(true);
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/knowledge?manage=1").then(async (response) => {
      const data = await response.json() as { entries?: KnowledgeEntry[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "加载失败");
      if (active) { setEntries(data.entries ?? []); setAllowed(true); }
    }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "加载失败"); });
    return () => { active = false; };
  }, []);
  const set = (field: keyof Form, value: string) => setForm((old) => ({ ...old, [field]: value }));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/knowledge", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tags: form.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean) }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "保存失败");
      await load(); setForm(EMPTY); setNotice("知识条目已保存。");
    } catch (err) { setError(err instanceof Error ? err.message : "保存失败"); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-5xl space-y-5 p-6"><h1 className="text-xl font-semibold">知识库管理</h1>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {allowed && <div className="grid gap-4 md:grid-cols-2">
      <section className="panel p-4"><h2 className="mb-3 font-semibold">已有条目</h2><div className="max-h-[70vh] space-y-2 overflow-y-auto">
        {entries.map((entry) => <button key={entry.id} className="panel-2 w-full p-3 text-left" onClick={() => { setNotice(""); setForm({ id: entry.id, title: entry.title, category: entry.category, content: entry.content, tags: entry.tags.join(", "), sourceName: entry.sourceName ?? "", sourceUrl: entry.sourceUrl ?? "", sourceVersion: entry.sourceVersion ?? "", reviewStatus: "unreviewed" }); }}>
          <span className="font-semibold">{entry.title}</span> · {entry.reviewStatus === "approved" ? "已审核" : "未审核"}
        </button>)}
        {entries.length === 0 && <p>暂无知识条目。</p>}
      </div></section>
      <form onSubmit={submit} className="panel space-y-3 p-4"><h2 className="font-semibold">{form.id ? "编辑条目" : "新增条目"}</h2>
        <p className="text-sm text-[var(--muted)]">保存编辑时默认退回未审核；核实内容和来源后可选择审核通过。</p>
        <label className="block">标题<input className="input w-full" required maxLength={500} value={form.title} onChange={(e) => set("title", e.target.value)} /></label>
        <label className="block">分类<input className="input w-full" maxLength={100} value={form.category} onChange={(e) => set("category", e.target.value)} /></label>
        <label className="block">内容<textarea className="textarea w-full min-h-32" required maxLength={50000} value={form.content} onChange={(e) => set("content", e.target.value)} /></label>
        <label className="block">标签（逗号分隔，最多 10 个）<input className="input w-full" value={form.tags} onChange={(e) => set("tags", e.target.value)} /></label>
        <label className="block">来源名称<input className="input w-full" required={form.reviewStatus === "approved"} maxLength={500} value={form.sourceName} onChange={(e) => set("sourceName", e.target.value)} /></label>
        <label className="block">来源链接<input className="input w-full" type="url" maxLength={2000} value={form.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} /></label>
        <label className="block">来源版本<input className="input w-full" maxLength={200} value={form.sourceVersion} onChange={(e) => set("sourceVersion", e.target.value)} /></label>
        <label className="block">审核状态<select className="input w-full" value={form.reviewStatus} onChange={(e) => set("reviewStatus", e.target.value)}><option value="unreviewed">未审核</option><option value="approved">审核通过</option></select></label>
        <div className="flex gap-2"><button className="btn btn-primary" disabled={busy}>{busy ? "保存中…" : "保存条目"}</button><button type="button" className="btn" onClick={() => setForm(EMPTY)}>新建</button></div>
      </form>
    </div>}
  </main>;
}
