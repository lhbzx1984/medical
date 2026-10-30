"use client";
import { useState } from "react";
import type { PlanVersion, StructuredPlan } from "@/lib/types";

const fields: { key: keyof StructuredPlan; label: string }[] = [
  { key: "summary", label: "摘要" }, { key: "diagnosis", label: "诊断" },
  { key: "procedureName", label: "术式" }, { key: "anesthesia", label: "麻醉" },
  { key: "position", label: "体位" }, { key: "approach", label: "入路" },
  { key: "region", label: "手术区域" }, { key: "focusOrgan", label: "聚焦器官" },
  { key: "instruments", label: "器械" }, { key: "steps", label: "手术步骤" },
  { key: "risks", label: "风险与对策" }, { key: "postop", label: "术后处理" },
  { key: "simulationNotes", label: "模拟说明" },
];
function display(value: StructuredPlan[keyof StructuredPlan]): string {
  if (typeof value === "string") return value || "—";
  if (!Array.isArray(value) || value.length === 0) return "—";
  return value.map((item) => {
    if (typeof item === "string") return `• ${item}`;
    if ("name" in item) return `${item.index}. ${item.name}\n${item.detail}\n${item.duration ? `时间：${item.duration}\n` : ""}${item.risk ? `风险：${item.risk}\n` : ""}${item.keyPoints?.join("；") ?? ""}`;
    return `风险：${item.risk}\n对策：${item.mitigation}`;
  }).join("\n\n");
}
export default function PlanComparison({ versions, selected }: { versions: PlanVersion[]; selected: PlanVersion }) {
  const [baselineId, setBaselineId] = useState("");
  const candidates = versions.filter((v) => v.id !== selected.id);
  const baseline = candidates.find((v) => v.id === baselineId) ?? candidates[candidates.length - 1];
  if (!baseline) return <p className="panel p-4">至少需要两个版本才能对比。</p>;
  const changed = fields.filter(({ key }) => JSON.stringify(baseline.content[key]) !== JSON.stringify(selected.content[key]));
  return <section className="space-y-3 pb-6">
    <div className="panel flex flex-wrap items-center gap-3 p-4">
      <label htmlFor="comparison-base">对比版本</label>
      <select id="comparison-base" className="input" value={baseline.id} onChange={(event) => setBaselineId(event.target.value)}>
        {candidates.map((v) => <option key={v.id} value={v.id}>v{v.version}</option>)}
      </select>
      <span>与当前选择的 v{selected.version} 比较 · {changed.length} 项变化</span>
    </div>
    {changed.length === 0 && <p className="panel p-4">方案内容没有变化。</p>}
    {changed.map(({ key, label }) => <div key={key} className="panel p-4">
      <h3 className="mb-2 font-semibold">{label}</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="panel-2 p-3"><div className="mb-2 text-xs text-[var(--muted)]">v{baseline.version}</div><div className="whitespace-pre-wrap break-words text-sm">{display(baseline.content[key])}</div></div>
        <div className="panel-2 p-3"><div className="mb-2 text-xs text-[var(--muted)]">v{selected.version}</div><div className="whitespace-pre-wrap break-words text-sm">{display(selected.content[key])}</div></div>
      </div>
    </div>)}
  </section>;
}
