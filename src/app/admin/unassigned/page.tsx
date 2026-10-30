"use client";
import { useEffect, useState } from "react";
type Patient = { id: string; name: string; created_at: string };
export default function UnassignedCases() {
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/admin/unassigned").then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error ?? "加载失败"); return data; })
      .then((data) => { if (active) setPatients(data.patients ?? []); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "加载失败"); });
    return () => { active = false; };
  }, []);
  async function assign(patient: Patient) {
    const ownerId = (owners[patient.id] ?? "").trim();
    if (!window.confirm(`将“${patient.name}”分配给用户 ${ownerId}？请先核对用户 ID。`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/admin/unassigned", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId: patient.id, ownerId }) });
      const data = await res.json() as { error?: string }; if (!res.ok) throw new Error(data.error ?? "分配失败");
      setPatients((previous) => previous?.filter((p) => p.id !== patient.id) ?? []); setNotice("病例已分配。");
    } catch (err) { setError(err instanceof Error ? err.message : "分配失败"); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl space-y-4 p-6"><h1 className="text-xl font-semibold">分配旧病例</h1>
    <p className="text-sm text-[var(--muted)]">仅显示未分配的旧病例，最多 100 条。请先在用户管理中核对用户 ID；分配后病例将对该用户可见。</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!patients && !error && <p>正在加载…</p>}{patients?.length === 0 && <p>没有待分配病例。</p>}
    {patients?.map((patient) => <div className="panel space-y-2 p-4" key={patient.id}>
      <p className="font-semibold">{patient.name} · {new Date(patient.created_at).toLocaleDateString("zh-CN")}</p>
      <p className="break-all text-xs text-[var(--muted)]">病例 ID：{patient.id}</p>
      <label className="block">归属用户 ID<input className="input w-full" value={owners[patient.id] ?? ""} onChange={(e) => setOwners((prev) => ({ ...prev, [patient.id]: e.target.value }))} /></label>
      <button className="btn btn-primary" disabled={busy || !(owners[patient.id] ?? "").trim()} onClick={() => void assign(patient)}>分配病例</button>
    </div>)}
  </main>;
}
