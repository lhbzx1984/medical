"use client";

// 术前手术规划工作台（功能一主界面）。
// 流程：录入病历与初步方案 → AI 生成结构化规划（知识库增强）→ 3D 模拟（人体→器官）
//       → 专家反馈 → AI 修订出新版本 → 再模拟，全程版本可追溯。
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlanDetail, SimulationRun, SurgicalPlan } from "@/lib/types";
import { ORGANS, matchOrgan } from "@/lib/organ-models";
import PatientForm, { CaseFormValue } from "./PatientForm";
import PlanDocument from "./PlanDocument";
import PlanComparison from "./PlanComparison";

const SimulationStage = dynamic(() => import("@/components/sim/SimulationStage"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full min-h-[460px] place-items-center text-sm text-[var(--muted)]">
      正在初始化 3D 引擎…
    </div>
  ),
});

const ChatPanel = dynamic(() => import("@/components/chat/ChatPanel"), { ssr: false });

const STATUS_LABEL: Record<SurgicalPlan["status"], { text: string; cls: string }> = {
  draft: { text: "待生成", cls: "!text-[var(--muted)]" },
  simulated: { text: "已模拟", cls: "!text-[var(--accent-2)]" },
  refined: { text: "已迭代", cls: "!text-[var(--accent)]" },
  finalized: { text: "已定稿", cls: "!text-[var(--ok)]" },
};

export default function PlanningWorkspace() {
  const [plans, setPlans] = useState<SurgicalPlan[]>([]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | SurgicalPlan["status"]>("all");
  const filteredPlans = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return plans.filter((plan) =>
      Boolean(plan.archivedAt) === showArchived &&
      (statusFilter === "all" || plan.status === statusFilter) &&
      (!term || `${plan.title} ${plan.patientName}`.toLocaleLowerCase().includes(term))
    );
  }, [plans, search, statusFilter, showArchived]);
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"plan" | "sim" | "feedback" | "compare">("plan");
  const [versionIdx, setVersionIdx] = useState(0); // detail.versions 下标
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(true);

  // 专家反馈表单
  const [expertName, setExpertName] = useState("李主任");
  const [comment, setComment] = useState("");

  const loadPlans = useCallback(async () => {
    const res = await fetch("/api/plans");
    const data = (await res.json()) as { plans?: SurgicalPlan[]; error?: string };
    if (!res.ok) { setError(data.error ?? "加载病例失败"); return; }
    setPlans(data.plans ?? []);
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const selectPlan = useCallback(async (id: string) => {
    setBusy("加载病例…");
    setError(null);
    try {
      const res = await fetch(`/api/plans/${id}`);
      const data = (await res.json()) as PlanDetail & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setDetail(data);
      setCreating(false);
      setEditing(false);
      setVersionIdx(Math.max(0, data.versions.length - 1));
      setStepIdx(0);
      setPlaying(false);
      setTab(data.versions.length ? "plan" : "plan");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  const refreshDetail = useCallback(async (planId: string) => {
    const res = await fetch(`/api/plans/${planId}`);
    const data = (await res.json()) as PlanDetail & { error?: string };
    if (res.ok) {
      setDetail(data);
      setVersionIdx(Math.max(0, data.versions.length - 1));
    }
    return data;
  }, []);

  const createCase = async (v: CaseFormValue) => {
    setBusy("创建病例…");
    setError(null);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: v.patientName,
          gender: v.gender,
          age: Number(v.age) || 0,
          medicalRecord: v.medicalRecord,
          preliminaryPlan: v.preliminaryPlan,
        }),
      });
      const data = (await res.json()) as { plan?: SurgicalPlan; error?: string };
      if (!res.ok || !data.plan) throw new Error(data.error ?? "创建失败");
      await loadPlans();
      await selectPlan(data.plan.id);
      await generate(data.plan.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const saveCase = async (v: CaseFormValue) => {
    if (!detail) return;
    setBusy("保存病例…"); setError(null);
    try {
      const res = await fetch(`/api/plans/${detail.plan.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, age: Number(v.age) || 0, expectedUpdatedAt: detail.plan.updatedAt }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      await selectPlan(detail.plan.id);
      await loadPlans();
      setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
    finally { setBusy(null); }
  };

  const setFinalized = async () => {
    if (!detail || !currentVersion) return;
    const finalized = detail.plan.status !== "finalized";
    setBusy(finalized ? "定稿中…" : "撤销定稿中…"); setError(null);
    try {
      const res = await fetch(`/api/plans/${detail.plan.id}/finalize`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalized, version: detail.plan.currentVersion, expectedUpdatedAt: detail.plan.updatedAt }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "操作失败");
      await selectPlan(detail.plan.id);
      await loadPlans();
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
    finally { setBusy(null); }
  };

  const setArchived = async () => {
    if (!detail) return;
    const archived = !detail.plan.archivedAt;
    setBusy(archived ? "归档病例…" : "恢复病例…"); setError(null);
    try {
      const res = await fetch(`/api/plans/${detail.plan.id}/archive`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived, expectedUpdatedAt: detail.plan.updatedAt }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "操作失败");
      await loadPlans();
      await selectPlan(detail.plan.id);
      setShowArchived(archived);
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
    finally { setBusy(null); }
  };

  const generate = async (planId?: string) => {
    const id = planId ?? detail?.plan.id;
    if (!id) return;
    setBusy("AI 正在生成手术规划（含知识库检索与模拟编排）…");
    setError(null);
    setTab("plan");
    try {
      const res = await fetch(`/api/plans/${id}/generate`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "生成失败");
      await refreshDetail(id);
      await loadPlans();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const submitFeedback = async () => {
    if (!detail || !comment.trim()) return;
    setBusy("专家反馈修订中（AI 重新规划并编排模拟）…");
    setError(null);
    try {
      const res = await fetch(`/api/plans/${detail.plan.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expertName, comment, version: currentVersion?.version }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "反馈提交失败");
      setComment("");
      await refreshDetail(detail.plan.id);
      await loadPlans();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const currentVersion = detail?.versions[versionIdx] ?? null;
  const simulation: SimulationRun | null = useMemo(() => {
    if (!detail) return null;
    const v = currentVersion?.version;
    return (
      [...detail.simulations].reverse().find((s) => s.version === v) ??
      detail.simulations[detail.simulations.length - 1] ??
      null
    );
  }, [detail, currentVersion]);
  const focusOrgan = ORGANS[matchOrgan(simulation?.focusOrgan ?? "skin")];

  const planContext = useMemo(() => {
    if (!detail) return undefined;
    const latest = detail.versions[detail.versions.length - 1];
    return {
      planTitle: `${detail.plan.title}（v${latest?.version ?? 0}）`,
      planSummary: latest
        ? `诊断：${latest.content.diagnosis}；拟施术式：${latest.content.procedureName}；方案摘要：${latest.content.summary}`
        : `患者：${detail.patient.name}；病历：${detail.patient.medicalRecord.slice(0, 200)}`,
    };
  }, [detail]);

  return (
    <div className="mx-auto flex h-[calc(100vh-56px-49px)] max-w-[1720px] gap-3 p-3">
      {/* 左侧：病例列表 */}
      <aside className="panel hidden w-60 shrink-0 flex-col overflow-hidden md:flex">
        <div className="border-b border-[var(--line)] p-3">
          <button
            className="btn btn-primary w-full"
            onClick={() => {
              setCreating(true);
              setDetail(null);
            }}
          >
            ＋ 新建规划病例
          </button>
        </div>
        <div className="space-y-2 border-b border-[var(--line)] p-3">
          <label className="sr-only" htmlFor="case-search">搜索病例</label>
          <input id="case-search" type="search" className="input w-full" placeholder="搜索姓名或方案名称"
            value={search} onChange={(event) => setSearch(event.target.value)} />
          <label className="sr-only" htmlFor="case-status">筛选方案状态</label>
          <select id="case-status" className="input w-full" value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | SurgicalPlan["status"])}>
            <option value="all">全部状态</option>
            <option value="draft">待生成</option>
            <option value="simulated">已模拟</option>
            <option value="refined">已迭代</option>
            <option value="finalized">已定稿</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />查看已归档病例
          </label>
          <p className="text-xs text-[var(--muted)]" aria-live="polite">显示 {filteredPlans.length} 个病例</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {plans.length === 0 && (
            <div className="px-2 py-6 text-center text-[12px] text-[var(--muted)]">
              {showArchived ? "暂无归档病例" : "暂无病例，点击上方按钮创建"}
            </div>
          )}
          {plans.length > 0 && filteredPlans.length === 0 && (
            <div className="px-2 py-6 text-center text-[12px] text-[var(--muted)]">没有符合条件的病例</div>
          )}
          {filteredPlans.map((p) => {
            const st = STATUS_LABEL[p.status];
            return (
              <button
                key={p.id}
                onClick={() => void selectPlan(p.id)}
                className={`mb-1.5 w-full rounded-lg border p-2.5 text-left transition-colors ${
                  detail?.plan.id === p.id
                    ? "border-[var(--accent)] bg-[var(--chip-bg)]"
                    : "border-transparent hover:bg-[var(--btn-bg-hover)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold text-[var(--heading)]">{p.title}</span>
                  <span className={`chip !shrink-0 !text-[10.5px] ${st.cls}`}>{st.text}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
                  <span>
                    {p.patientName} · v{p.currentVersion}
                  </span>
                  <span>{new Date(p.updatedAt).toLocaleDateString("zh-CN")}</span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="border-t border-[var(--line)] p-3 text-[11px] leading-5 text-[var(--muted)]">
          流程：病历 → AI 规划 → 3D 模拟 → 专家反馈 → 迭代
        </div>
      </aside>

      {/* 主区 */}
      <main className="flex min-w-0 flex-1 flex-col">
        {editing && detail ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {error && <p role="alert" className="panel mb-3 p-3 text-red-400">{error}</p>}
            <PatientForm key={detail.plan.id} initialValue={{ patientName: detail.patient.name,
              gender: detail.patient.gender, age: String(detail.patient.age || ""),
              medicalRecord: detail.patient.medicalRecord, preliminaryPlan: detail.patient.preliminaryPlan }}
              onSubmit={saveCase} busy={busy} onCancel={() => setEditing(false)} />
          </div>
        ) : creating && !detail ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            <PatientForm
              onSubmit={createCase}
              busy={busy}
              onCancel={() => setCreating(false)}
            />
          </div>
        ) : !detail ? (
          <div className="panel grid min-h-0 flex-1 place-items-center p-8 text-center">
            <div>
              <div className="mb-3 text-5xl">🩺</div>
              <div className="mb-1.5 text-[16px] font-bold text-[var(--heading)]">术前手术方案规划</div>
              <p className="mx-auto mb-5 max-w-[420px] text-[13px] leading-6 text-[var(--muted)]">
                从左侧选择一个病例，或新建规划病例：录入病历与初步方案后，AI
                将结合手术知识库生成结构化规划，并自动完成「从人体到器官」的 3D 模拟。
              </p>
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                ＋ 新建规划病例
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 病例头 + Tab */}
            <div className="panel mb-3 shrink-0 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-bold text-[var(--heading)]">
                    {detail.plan.title}
                  </div>
                  <div className="text-[11.5px] text-[var(--muted)]">
                    {detail.patient.name} · {detail.patient.gender}
                    {detail.patient.age ? ` · ${detail.patient.age} 岁` : ""} ·{" "}
                    {detail.plan.status === "draft" ? "待生成" : `当前 v${detail.plan.currentVersion}`}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button className="btn !py-1 !text-[12px]" disabled={!!busy || detail.plan.status === "finalized"} onClick={() => setEditing(true)}>编辑病例</button>
                  {detail.versions.length > 0 && <button className="btn !py-1 !text-[12px]" disabled={!!busy || (detail.plan.status !== "finalized" && currentVersion?.version !== detail.plan.currentVersion)} onClick={() => void setFinalized()}>{detail.plan.status === "finalized" ? "撤销定稿" : "确认定稿"}</button>}
                  <button className="btn !py-1 !text-[12px]" disabled={!!busy} onClick={() => void setArchived()}>{detail.plan.archivedAt ? "恢复病例" : "归档病例"}</button>
                  {detail.versions.length === 0 ? (
                    <button
                      className="btn btn-primary"
                      onClick={() => void generate()}
                      disabled={!!busy || detail.plan.status === "finalized"}
                    >
                      ✨ AI 生成手术规划
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      {detail.versions.map((v, i) => (
                        <button
                          key={v.id}
                          onClick={() => {
                            setVersionIdx(i);
                            setStepIdx(0);
                            setPlaying(false);
                          }}
                          className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                            i === versionIdx
                              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                              : "bg-[var(--btn-bg-hover)] text-[var(--muted)] hover:text-[var(--heading)]"
                          }`}
                          title={v.changelog}
                        >
                          v{v.version}
                        </button>
                      ))}
                      <button
                        className="btn !py-1 !text-[12px]"
                        onClick={() => void generate()}
                        disabled={!!busy || detail.plan.status === "finalized"}
                        title="AI 重新生成（知识库增强）"
                      >
                        ↻ 重新生成
                      </button>
                    </div>
                  )}
                  <button
                    className="btn !py-1 !text-[12px] lg:hidden"
                    onClick={() => setChatOpen((o) => !o)}
                  >
                    {chatOpen ? "收起顾问" : "指导顾问"}
                  </button>
                </div>
              </div>
              <div className="mt-2 flex border-b border-[var(--line)]">
                <button
                  className={`tab ${tab === "plan" ? "active" : ""}`}
                  onClick={() => setTab("plan")}
                >
                  📋 手术方案
                </button>
                <button className={`tab ${tab === "compare" ? "active" : ""}`}
                  onClick={() => setTab("compare")} disabled={detail.versions.length < 2}>
                  版本对比
                </button>
                <button
                  className={`tab ${tab === "sim" ? "active" : ""}`}
                  onClick={() => setTab("sim")}
                >
                  🫀 3D 模拟
                  {simulation ? ` · ${focusOrgan.nameZh}` : ""}
                </button>
                <button
                  className={`tab ${tab === "feedback" ? "active" : ""}`}
                  onClick={() => setTab("feedback")}
                >
                  💬 专家反馈与迭代
                  {detail.feedbacks.length ? ` (${detail.feedbacks.length})` : ""}
                </button>
              </div>
            </div>

            {/* 内容区 */}
            <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
              {detail.plan.status === "finalized" && <p className="panel mb-3 p-3 text-sm">已定稿{detail.plan.finalizedVersion ? `：v${detail.plan.finalizedVersion}` : ""}。如需修改，请先撤销定稿。</p>}
              {error && (
                <div className="panel mb-3 border-red-900/60 bg-[#2a1215] px-4 py-2.5 text-[13px] text-red-200">
                  {error}
                </div>
              )}

              {tab === "plan" &&
                (currentVersion ? (
                  <PlanDocument
                    version={currentVersion}
                    patientName={detail.patient.name}
                  />
                ) : (
                  <div className="panel grid place-items-center p-10 text-center">
                    <div>
                      <div className="mb-2 text-4xl">✨</div>
                      <div className="mb-1 text-[15px] font-bold text-[var(--heading)]">
                        病例已就绪，等待生成手术规划
                      </div>
                      <p className="mx-auto mb-4 max-w-[400px] text-[12.5px] leading-6 text-[var(--muted)]">
                        AI 将检索手术知识库，结合病历与初步方案生成包含步骤、器械、风险与术后处理的结构化规划，
                        并自动编排 3D 模拟脚本。
                      </p>
                      <button
                        className="btn btn-primary"
                        onClick={() => void generate()}
                        disabled={!!busy}
                      >
                        {busy ?? "✨ 生成手术规划"}
                      </button>
                    </div>
                  </div>
                ))}

              {tab === "compare" && currentVersion && (
                <PlanComparison key={detail.plan.id} versions={detail.versions} selected={currentVersion} />
              )}

              {tab === "sim" && (
                <div className="h-[calc(100%-8px)] min-h-[500px]">
                  <SimulationStage
                    simulation={simulation}
                    stepIndex={stepIdx}
                    playing={playing}
                    onStepIndex={setStepIdx}
                    onPlaying={setPlaying}
                    sex={detail.patient.gender === "女" ? "female" : "male"}
                  />
                </div>
              )}

              {tab === "feedback" && (
                <div className="space-y-3 pb-6">
                  {/* 反馈表单 */}
                  <div className="panel p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-[13.5px] font-bold text-[var(--heading)]">
                        提交专家反馈（针对 v{currentVersion?.version ?? "-"}）
                      </div>
                      {currentVersion && (
                        <span className="chip">
                          当前版本来源：
                          {currentVersion.source === "ai" ? "AI 生成" : "专家修订"}
                        </span>
                      )}
                    </div>
                    <div className="mb-3 grid gap-3 sm:grid-cols-[180px_1fr]">
                      <div>
                        <label className="label">专家姓名</label>
                        <input
                          className="input"
                          value={expertName}
                          onChange={(e) => setExpertName(e.target.value)}
                          placeholder="如：李主任"
                        />
                      </div>
                      <div>
                        <label className="label">反馈意见（切口选择、步骤顺序、风险防范…）</label>
                        <textarea
                          className="textarea min-h-[92px]"
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="示例：患者 CRP 较高，建议术前 30 分钟加用头孢曲松预防感染；离断系膜前先用超声刀预凝；术后延长观察 24 小时再进食…"
                        />
                      </div>
                    </div>
                    {currentVersion && currentVersion.version !== detail.plan.currentVersion && (
                      <p className="text-sm text-[var(--muted)]">请选择最新版本后提交反馈。</p>
                    )}
                    <div className="flex justify-end">
                      <button
                        className="btn btn-primary"
                        onClick={submitFeedback}
                        disabled={!comment.trim() || !!busy || !currentVersion || currentVersion.version !== detail.plan.currentVersion || detail.plan.status === "finalized"}
                      >
                        {busy ?? "提交反馈并由 AI 修订方案"}
                      </button>
                    </div>
                  </div>

                  {/* 反馈历史 */}
                  {detail.feedbacks.length > 0 && (
                    <div className="panel p-4">
                      <div className="mb-3 text-[13.5px] font-bold text-[var(--heading)]">反馈与迭代历史</div>
                      <div className="step-rail space-y-3">
                        {detail.feedbacks.map((f) => {
                          const nextVersion = detail.versions.find((v) => v.version === f.version + 1);
                          return (
                            <div key={f.id} className="relative flex gap-3.5">
                              <div className="z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#3a5a3a] bg-[#122412] text-[13px]">
                                👨‍⚕️
                              </div>
                              <div className="panel-2 min-w-0 flex-1 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[13px] font-semibold text-[var(--heading)]">
                                    {f.expertName}
                                  </span>
                                  <span className="chip">针对 v{f.version}</span>
                                  <span className="ml-auto text-[11px] text-[var(--muted)]">
                                    {new Date(f.createdAt).toLocaleString("zh-CN")}
                                  </span>
                                </div>
                                <div className="mt-1.5 text-[12.5px] leading-6 text-[var(--text)]">
                                  {f.comment}
                                </div>
                                {nextVersion?.changelog && (
                                  <div className="mt-2 border-l-2 border-l-[var(--accent)] pl-2.5 text-[12px] leading-5 text-[var(--accent)]">
                                    → v{nextVersion.version} 修订：{nextVersion.changelog}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* 右侧：手术指导顾问 */}
      {chatOpen && detail && (
        <aside className="panel hidden w-[360px] shrink-0 flex-col overflow-hidden lg:flex">
          <ChatPanel
            mode="guidance"
            context={planContext}
            className="h-full"
            quickPrompts={[
              "当前方案有哪些需要警惕的风险点？",
              "如果术中发现情况比预期复杂，备选方案是什么？",
              "这个患者的围术期管理有什么建议？",
            ]}
          />
        </aside>
      )}

      {/* 全局忙态遮罩 */}
      {busy && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(4,8,15,0.6)] dark:bg-[rgba(4,8,15,0.72)] backdrop-blur-sm">
          <div className="panel flex items-center gap-4 px-8 py-6">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#22406b] border-t-[var(--accent)]" />
            <div>
              <div className="text-[14px] font-semibold text-[var(--heading)]">{busy}</div>
              <div className="mt-0.5 text-[12px] text-[var(--muted)]">
                智能体思考中 · 全程知识库增强
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
