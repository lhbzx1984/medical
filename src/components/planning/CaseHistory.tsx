"use client";
import { useEffect, useState } from "react";
type Edit = { id: string; createdAt: string; name: string; gender: string; age: number; medicalRecord: string; preliminaryPlan: string };
export default function CaseHistory({ planId }: { planId: string }) {
  const [edits, setEdits] = useState<Edit[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/plans/${encodeURIComponent(planId)}/history`, { signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "加载失败"); return data; })
      .then((data) => setEdits(data.edits ?? []))
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "加载失败"); });
    return () => controller.abort();
  }, [planId]);
  return <section className="panel space-y-3 p-4"><h2 className="font-semibold">病例修改历史</h2>
    <p className="text-sm text-[var(--muted)]">显示最近 100 次修改之前的病例资料。已有方案版本不会因病例编辑而改变。</p>
    {error && <p role="alert">{error}</p>}{!error && !edits && <p>正在加载…</p>}
    {edits?.length === 0 && <p>暂无修改记录。</p>}
    {edits?.map((edit) => <details key={edit.id} className="panel-2 p-3"><summary className="cursor-pointer">{new Date(edit.createdAt).toLocaleString("zh-CN")} 修改前</summary>
      <p className="mt-2">{edit.name} · {edit.gender || "未填写"} · {edit.age || "未填写"} 岁</p>
      <h3 className="mt-3 font-semibold">病历摘要</h3><p className="whitespace-pre-wrap break-words">{edit.medicalRecord || "—"}</p>
      <h3 className="mt-3 font-semibold">初步方案</h3><p className="whitespace-pre-wrap break-words">{edit.preliminaryPlan || "—"}</p>
    </details>)}
  </section>;
}
