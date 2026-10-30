"use client";

// 结构化手术方案文档渲染：摘要 / 基本信息 / 器械 / 步骤时间线 / 风险对策 / 术后处理。
import type { PlanVersion } from "@/lib/types";
import { ORGANS, matchOrgan } from "@/lib/organ-models";
import { normalizePlan } from "@/lib/validation";

function safeSourceUrl(value: string): string | null {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; }
  catch { return null; }
}

function InfoItem({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="panel-2 px-3 py-2">
      <div className="text-[11px] text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-[13px] font-medium text-[var(--heading)]">{value}</div>
    </div>
  );
}

export default function PlanDocument({
  version,
  patientName,
}: {
  version: PlanVersion;
  patientName?: string;
}) {
  let plan;
  try {
    plan = normalizePlan(version.content);
  } catch {
    return <div role="alert" className="panel p-4 text-[var(--warn)]">该历史方案格式不完整，暂时无法显示。请重新生成方案，原有记录会保留。</div>;
  }
  const knowledgeUsed = Array.isArray(version.knowledgeUsed) ? version.knowledgeUsed.filter((k) => typeof k === "string") : [];
  const organ = ORGANS[matchOrgan(plan.focusOrgan)];

  return (
    <div className="space-y-4 pb-6">
      {/* 版本头 */}
      <div className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--accent)]">
            v{version.version}
          </span>
          <span className="chip">
            {version.source === "ai" ? "🤖 AI 生成" : "👨‍⚕️ 专家反馈修订"}
          </span>
          <span className="chip">
            🧠 知识库引用 × {knowledgeUsed.length}
          </span>
          <span className="chip">🎯 模拟聚焦：{organ.nameZh}</span>
          <span className="ml-auto text-[11px] text-[var(--muted)]">
            {new Date(version.createdAt).toLocaleString("zh-CN")}
          </span>
        </div>
        {version.changelog && (
          <div className="panel-2 mb-3 border-l-2 border-l-[var(--accent)] px-3 py-2 text-[12.5px] leading-6 text-[var(--text)]">
            <span className="font-semibold text-[var(--heading)]">修订说明：</span>
            {version.changelog}
          </div>
        )}
        <h2 className="text-[18px] font-bold text-[var(--heading)]">{plan.procedureName}</h2>
        <div className="mt-1 text-[12.5px] text-[var(--muted)]">
          患者：{patientName ?? "—"} · {plan.diagnosis}
        </div>
        <p className="mt-2.5 text-[13px] leading-6 text-[var(--text)]">{plan.summary}</p>
      </div>

      {/* 基本信息 */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5">
        <InfoItem label="手术区域" value={plan.region} />
        <InfoItem label="麻醉方式" value={plan.anesthesia} />
        <InfoItem label="手术体位" value={plan.position} />
        <InfoItem label="手术入路" value={plan.approach} />
        <InfoItem label="预计步骤" value={`${plan.steps.length} 步`} />
      </div>

      {/* 器械 */}
      {plan.instruments.length > 0 && (
        <div className="panel p-4">
          <div className="mb-2.5 text-[13.5px] font-bold text-[var(--heading)]">关键器械与耗材</div>
          <div className="flex flex-wrap gap-1.5">
            {plan.instruments.map((s, i) => (
              <span key={i} className="chip">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 步骤时间线 */}
      {plan.steps.length > 0 && (
        <div className="panel p-4">
          <div className="mb-3 text-[13.5px] font-bold text-[var(--heading)]">手术步骤</div>
          <div className="step-rail space-y-3">
            {plan.steps.map((s) => (
              <div key={s.index} className="relative flex gap-3.5 pl-0">
                <div className="z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#2a5a86] bg-[#0f2137] text-[13px] font-bold text-[var(--accent)]">
                  {s.index}
                </div>
                <div className="panel-2 min-w-0 flex-1 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-[var(--heading)]">{s.name}</span>
                    {s.duration && <span className="chip">⏱ {s.duration}</span>}
                  </div>
                  {s.detail && (
                    <div className="mt-1.5 text-[12.5px] leading-6 text-[var(--text)]">{s.detail}</div>
                  )}
                  {s.risk && (
                    <div className="mt-1.5 text-[12px] leading-5 text-[var(--warn)]">
                      ⚠ 风险：{s.risk}
                    </div>
                  )}
                  {s.keyPoints.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {s.keyPoints.map((k, i) => (
                        <li key={i} className="text-[12px] leading-5 text-[var(--muted)]">
                          · {k}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 风险与对策 */}
      {plan.risks.length > 0 && (
        <div className="panel p-4">
          <div className="mb-2.5 text-[13.5px] font-bold text-[var(--heading)]">风险识别与对策</div>
          <div className="space-y-2">
            {plan.risks.map((r, i) => (
              <div key={i} className="panel-2 flex flex-col gap-1 p-3 sm:flex-row sm:gap-4">
                <div className="min-w-0 flex-1 text-[12.5px] leading-6 text-[var(--warn)]">
                  <span className="font-semibold">风险</span>：{r.risk}
                </div>
                <div className="min-w-0 flex-1 text-[12.5px] leading-6 text-[var(--ok)]">
                  <span className="font-semibold">对策</span>：{r.mitigation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 术后处理 */}
      {plan.postop.length > 0 && (
        <div className="panel p-4">
          <div className="mb-2.5 text-[13.5px] font-bold text-[var(--heading)]">术后处理要点</div>
          <ul className="space-y-1.5">
            {plan.postop.map((p, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-6 text-[var(--text)]">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 模拟要点 + 知识库引用 */}
      {(plan.simulationNotes || knowledgeUsed.length > 0) && (
        <div className="panel p-4">
          {plan.simulationNotes && (
            <>
              <div className="mb-1.5 text-[13.5px] font-bold text-[var(--heading)]">3D 模拟要点</div>
              <p className="text-[12.5px] leading-6 text-[var(--text)]">{plan.simulationNotes}</p>
            </>
          )}
          {knowledgeUsed.length > 0 && (
            <>
              <div className="mb-1.5 mt-3 text-[12.5px] font-semibold text-[var(--heading)]">
                引用的手术知识库条目
              </div>
              {version.knowledgeReferences?.length ? (
                <ul className="space-y-2">
                  {version.knowledgeReferences.map((reference) => {
                    const url = safeSourceUrl(reference.sourceUrl);
                    return <li key={reference.id} className="panel-2 p-3 text-[12.5px]">
                      <div className="font-semibold">{reference.title}</div>
                      <div className="mt-1 text-[var(--muted)]">
                        来源：{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="underline">{reference.sourceName || "查看来源"}</a> : (reference.sourceName || "未填写")}
                        {reference.sourceVersion && ` · 版本：${reference.sourceVersion}`}
                        {reference.reviewedBy && ` · 审核：${reference.reviewedBy}`}
                        {reference.reviewedAt && ` · ${new Date(reference.reviewedAt).toLocaleDateString("zh-CN")}`}
                      </div>
                    </li>;
                  })}
                </ul>
              ) : <div className="flex flex-wrap gap-1.5">
                {knowledgeUsed.map((k, i) => <span key={`${k}-${i}`} className="chip">📖 {k}（历史记录未保存来源）</span>)}
              </div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
