"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PlanDocument from "@/components/planning/PlanDocument";
import type { PlanDetail } from "@/lib/types";

function PrintPlanContent() {
  const { id, version } = useParams<{ id: string; version: string }>();
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/plans/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as PlanDetail & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "加载失败");
        setDetail(data);
      }).catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "加载失败");
      });
    return () => controller.abort();
  }, [id]);
  const selected = detail?.versions.find((v) => String(v.version) === version);
  return <main className="print-page mx-auto w-full max-w-4xl p-6">
    <div className="print-controls mb-4 flex flex-wrap items-center gap-3">
      <h1 className="text-xl font-semibold">方案打印 / 保存 PDF</h1>
      <button className="btn btn-primary" disabled={!selected} onClick={() => window.print()}>打印或保存为 PDF</button>
      <span className="text-sm text-[var(--muted)]">在打印窗口选择“另存为 PDF”。</span>
    </div>
    {error && <p role="alert">{error}</p>}
    {!error && !detail && <p>正在加载方案…</p>}
    {detail && !selected && <p role="alert">未找到该版本。</p>}
    {selected && detail && <>
      <p className="mb-4 text-sm">MedPlan Atlas · 教学演示资料，AI 内容不构成临床决策依据。患者姓名显示当前病例资料。</p>
      <PlanDocument version={selected} patientName={detail.patient.name} />
    </>}
  </main>;
}

export default function PrintPlanPage() {
  return <Suspense fallback={<p className="p-6">正在加载方案…</p>}><PrintPlanContent /></Suspense>;
}
