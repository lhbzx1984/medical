"use client";

// 医学学习中心（功能二主界面）：
// 全身概览（真实人体外皮 + 可点击器官标注）/ 器官特写 / 精细人体图谱（2,234 结构）
// 三种浏览模式 + AI 医学导师问答。
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { ORGAN_LIST, ORGANS } from "@/lib/organ-models";
import type { OrganId } from "@/lib/types";
import type { StructureInfo } from "@/components/atlas/AtlasViewer";
import OrganQuiz from "./OrganQuiz";
import { overviewStructure, type OverviewId } from "./Anatomy2D";

const Anatomy2D = dynamic(() => import("./Anatomy2D"), {
  ssr: false,
});
const LearnCanvas = dynamic(() => import("./LearnCanvas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm text-[var(--muted)]">
      正在初始化 3D 引擎…
    </div>
  ),
});
const AtlasViewer = dynamic(() => import("@/components/atlas/AtlasViewer"), {
  ssr: false,
});
const ChatPanel = dynamic(() => import("@/components/chat/ChatPanel"), { ssr: false });

type ViewMode = "overview" | "organ" | "atlas";
type Sex = "male" | "female";

function subscribeSex(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("medplan-sex", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("medplan-sex", onChange);
  };
}

function storedSex(): Sex {
  try { return localStorage.getItem("mp-sex") === "female" ? "female" : "male"; } catch { return "male"; }
}

export default function LearningCenter() {
  const [mode, setMode] = useState<ViewMode>("overview");
  const [quizOrgan, setQuizOrgan] = useState<OrganId | null>(null);
  const [organId, setOrganId] = useState<OrganId>("heart");
  /** 概览中选中的器官（null = 外皮实体状态） */
  const [selected, setSelected] = useState<{ id: OverviewId; sex: Sex } | null>(null);
  const [structure, setStructure] = useState<{ info: StructureInfo; sex: Sex } | null>(null);
  const sex = useSyncExternalStore(subscribeSex, storedSex, () => "male" as const);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [useReferenceModel, setUseReferenceModel] = useState(true);
  const [overviewView, setOverviewView] = useState<"2d" | "3d">("2d");
  const [show3DLabels, setShow3DLabels] = useState(false);

  const switchSex = useCallback((v: Sex) => {
    try { localStorage.setItem("mp-sex", v); } catch {}
    window.dispatchEvent(new Event("medplan-sex"));
    setSelected(null);
    setStructure(null);
    if (v === "male" && organId === "uterus") setOrganId("heart");
  }, [organId]);

  const chosenOrgan = ORGANS[organId];
  const organ = chosenOrgan.femaleOnly && sex !== "female" ? ORGANS.heart : chosenOrgan;
  const selectedId = mode === "overview" && selected?.sex === sex ? selected.id : null;
  const structCtx = mode === "atlas" && structure?.sex === sex ? structure.info : null;
  const overviewTarget = selectedId ? overviewStructure(selectedId) : null;
  // 自测题按 3D 器官出题；乳腺等没有对应器官模型的概览结构不提供自测入口。
  const quizTarget: OrganId | null = mode === "organ" ? organId : mode === "overview" ? overviewTarget?.modelId ?? null : null;

  /** 左栏卡片 / 特写按钮 → 器官特写模式 */
  const openCloseup = useCallback((id: OrganId) => {
    setOrganId(id);
    setStructure(null);
    setSelected(null);
    setMode("organ");
    setControlsOpen(false);
  }, []);

  /** 概览中点击标注 / 3D 器官 → 选中并聚焦（保持概览，外皮淡出） */
  const focusOrgan = useCallback((id: OverviewId) => {
    setSelected({ id, sex });
  }, [sex]);

  const chatContext = useMemo(() => {
    if (structCtx) {
      return { organName: `${structCtx.name}（${structCtx.systemZh}）` };
    }
    if (mode === "overview" && overviewTarget) {
      return {
        organId: overviewTarget.modelId ?? undefined,
        organName: `${overviewTarget.nameZh}（${overviewTarget.nameEn}）`,
      };
    }
    if (mode === "overview") {
      return { organName: "全身概览（完整人体）" };
    }
    if (mode === "atlas") {
      return { organName: "精细人体图谱（未选择结构）" };
    }
    return { organId: organ.id, organName: `${organ.nameZh}（${organ.nameEn}）` };
  }, [structCtx, organ, mode, overviewTarget]);

  return (
    <div className="mx-auto flex h-[calc(100dvh-56px-49px)] max-w-[1720px] gap-3 p-3">
      {quizOrgan && <OrganQuiz key={quizOrgan} organId={quizOrgan} onClose={() => setQuizOrgan(null)} />}
      {/* 左侧：模式与器官选择 */}
      <aside id="learning-controls" aria-label="学习模式与器官" className={`panel ${controlsOpen ? "fixed bottom-4 left-3 top-20 z-40 flex w-64 max-w-[calc(100vw-24px)]" : "hidden"} shrink-0 flex-col overflow-y-auto p-3 md:static md:flex md:w-56`}>
        <button className="btn mb-3 self-end md:hidden" onClick={() => setControlsOpen(false)}>关闭模型选择</button>
        <div className="mb-3">
          <div className="label !mt-0">模型性别</div>
          <div className="grid grid-cols-2 gap-1">
            {(["male", "female"] as const).map((v) => (
              <button
                key={v}
                onClick={() => switchSex(v)}
                className={`rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition-colors ${
                  sex === v
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--line)] text-[var(--muted)] hover:bg-[var(--btn-bg-hover)]"
                }`}
              >
                {v === "male" ? "♂ 男性" : "♀ 女性"}
              </button>
            ))}
          </div>
          {sex === "female" && (
            <div className="mt-1.5 text-[10px] leading-4 text-[var(--muted)]">
              女性模式：图谱中已隐藏男性生殖结构
            </div>
          )}
        </div>
        <div className="mb-3 grid grid-cols-1 gap-1.5">
          {(
            [
              ["overview", "🗺️ 全身概览", "2D 解剖图 / 3D 器官同屏"],
              ["organ", "🫀 器官特写", "单器官 360° 观察"],
              ["atlas", "🧬 精细人体图谱", "2,234 结构 · 爆炸视图"],
            ] as [ViewMode, string, string][]
          ).map(([id, label, desc]) => (
            <button
              key={id}
              onClick={() => {
                setMode(id);
                setControlsOpen(false);
                if (id !== "atlas") setStructure(null);
                if (id !== "overview") setSelected(null);
              }}
              className={`rounded-lg border p-2.5 text-left transition-colors ${
                mode === id
                  ? "border-[var(--accent)] bg-[var(--chip-bg)]"
                  : "border-[var(--line)] hover:bg-[var(--btn-bg-hover)]"
              }`}
            >
              <div className={`text-[13px] font-semibold ${mode === id ? "text-[var(--accent)]" : "text-[var(--heading)]"}`}>
                {label}
              </div>
              <div className="mt-0.5 text-[10.5px] text-[var(--muted)]">{desc}</div>
            </button>
          ))}
        </div>

        <div className="mb-1.5 text-[12px] font-semibold text-[var(--muted)]">器官模型</div>
        <div className="grid grid-cols-2 gap-1.5">
          {ORGAN_LIST.filter((o) => !o.femaleOnly || sex === "female").map((o) => (
            <button
              key={o.id}
              onClick={() => openCloseup(o.id)}
              className={`group overflow-hidden rounded-lg border transition-colors ${
                organ.id === o.id && mode !== "atlas"
                  ? "border-[var(--accent)] bg-[var(--chip-bg)]"
                  : "border-[var(--line)] hover:bg-[var(--btn-bg-hover)]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={o.thumb}
                alt={o.nameZh}
                className="h-16 w-full bg-[#0a1322] object-cover"
                loading="lazy"
              />
              <div className="px-1.5 py-1 text-[11px] text-[var(--text)]">{o.nameZh}</div>
            </button>
          ))}
        </div>

        <div className="mt-3 border-t border-[var(--line)] pt-3 text-[10.5px] leading-5 text-[var(--muted)]">
          数据来源：BodyParts3D 4.0、HuBMAP Human Reference Atlas（CC BY 4.0）、Innerscene（CC0）及 thebuggeddev/anatomy，详见项目说明。
          <br />模型为参考或简化示意，个体解剖存在差异，仅供教学。
        </div>
      </aside>

      {/* 中间：3D 视图 */}
      <main className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
          <button className="btn !px-2 !py-1 md:hidden" aria-expanded={controlsOpen} aria-controls="learning-controls" onClick={() => setControlsOpen((open) => !open)}>模型选择</button>
          <span className="text-[14px] font-bold text-[var(--heading)]">
            {mode === "atlas"
              ? "精细人体图谱"
              : mode === "organ"
                ? `器官特写 · ${organ.nameZh}（${organ.nameEn}）`
                : overviewView === "3d" ? "全身概览 · 3D 器官同屏" : "全身概览 · 点击文字标注查看器官"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {mode === "overview" && (
              <div className="flex gap-1" role="group" aria-label="全身概览视图">
                {(["2d", "3d"] as const).map((view) => (
                  <button
                    key={view}
                    className={`btn !py-1 !text-xs ${overviewView === view ? "!border-[var(--accent)] !text-[var(--accent)]" : ""}`}
                    aria-pressed={overviewView === view}
                    onClick={() => { setOverviewView(view); setSelected(null); }}
                  >
                    {view === "2d" ? "2D 解剖图" : "3D 同屏"}
                  </button>
                ))}
              </div>
            )}
            {mode === "overview" && overviewView === "3d" && (
              <button className="btn !py-1 !text-xs" aria-pressed={show3DLabels} onClick={() => setShow3DLabels((show) => !show)}>
                {show3DLabels ? "隐藏标注" : "显示标注"}
              </button>
            )}
            {quizTarget && <button className="btn !py-1 !text-xs" onClick={() => setQuizOrgan(quizTarget)}>学习自测</button>}
            {mode === "organ" && organ.closeupGlb && (
              <button className="btn !py-1 !text-xs" onClick={() => setUseReferenceModel((current) => !current)}>
                {useReferenceModel ? "查看原模型" : "查看参考模型"}
              </button>
            )}
            <button className="btn !px-2 !py-1 xl:hidden" aria-expanded={chatOpen} aria-controls="learning-chat" onClick={() => setChatOpen((open) => !open)}>AI 导师</button>
            {mode !== "overview" && (
              <span className="chip hidden sm:inline-flex">
                {mode === "atlas" ? "BodyParts3D 4.0 · 15 系统" : organ.system}
              </span>
            )}
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          {mode === "atlas" ? (
            <div className="absolute inset-0 p-3">
              <AtlasViewer
                key={sex}
                sex={sex}
                onSelectStructure={(info) => {
                  setStructure({ info, sex });
                }}
              />
            </div>
          ) : (
            <>
              {mode === "overview" && overviewView === "2d" ? (
                <Anatomy2D
                  sex={sex}
                  selectedId={selectedId}
                  onSelect={focusOrgan}
                  onClearSelect={() => setSelected(null)}
                  onEnterCloseup={openCloseup}
                />
              ) : (
                <LearnCanvas
                  mode={mode === "overview" ? "overview" : "organ"}
                  organId={organ.id}
                  useReferenceModel={useReferenceModel}
                  showLabels={show3DLabels}
                  selectedId={mode === "overview" && selectedId !== "breast" ? selectedId : null}
                  onSelect={focusOrgan}
                  onClearSelect={() => setSelected(null)}
                  sex={sex}
                />
              )}
              {/* 底部信息条（视口内，保持深色） */}
              <div className="vp pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(5,9,17,0.94)] to-transparent px-4 pb-3 pt-10">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="max-w-[72%]">
                    <div className="text-[15px] font-bold text-[var(--heading)]">
                      {overviewTarget
                        ? `${overviewTarget.nameZh} · ${overviewTarget.nameEn}`
                        : mode === "overview"
                          ? overviewView === "3d" ? "完整人体 · 3D 器官同屏" : "完整人体 · 2D 解剖图"
                          : `${organ.nameZh} · ${organ.nameEn}`}
                    </div>
                    {mode === "organ" && useReferenceModel && organ.referenceLabel && <div className="text-[11px] text-[var(--muted)]">{organ.referenceLabel} · 个体解剖存在差异</div>}
                    <div className="mt-0.5 text-[12.5px] leading-6 text-[var(--text)]">
                      {overviewTarget
                        ? overviewTarget.brief
                        : mode === "overview"
                          ? overviewView === "3d" ? "拖拽旋转、滚轮缩放，点击器官查看详情；模型为参考示意，器官可能存在重叠。" : "点击器官旁的文字标注查看详情；性别切换可对比男性 / 女性解剖结构。"
                          : organ.brief}
                    </div>
                  </div>
                  {mode === "overview" && (
                    <div className="pointer-events-auto flex flex-col items-end gap-1.5">
                      {overviewView === "3d" && overviewTarget && (
                        <button className="btn !py-1 !text-[11.5px]" onClick={() => setSelected(null)}>返回全身</button>
                      )}
                      {overviewTarget?.modelId && (
                        <button
                          className="btn btn-primary !py-1 !text-[11.5px]"
                          onClick={() => { if (overviewTarget.modelId) openCloseup(overviewTarget.modelId); }}
                        >
                          进入特写 →
                        </button>
                      )}
                      {overviewTarget && !overviewTarget.modelId && <span className="text-[11px] text-[var(--muted)]">暂无特写模型</span>}
                      <div className="text-right text-[11px] text-[var(--muted)]">
                        {overviewView === "3d" ? "拖拽旋转 · 点击器官" : "点击标注查看器官"}
                        <br />
                        {overviewView === "3d" ? "点击空白返回全身" : "再次点击取消选择"}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* 右侧：AI 医学导师 */}
      <aside id="learning-chat" aria-label="AI 医学导师" className={`panel ${chatOpen ? "fixed inset-x-3 bottom-4 top-20 z-40 flex" : "hidden"} shrink-0 flex-col overflow-hidden xl:static xl:flex xl:w-[360px]`}>
        <button className="btn m-2 self-end xl:hidden" onClick={() => setChatOpen(false)}>关闭导师</button>
        <ChatPanel
          key={`${sex}-${mode}-${structCtx ? structCtx.conceptId || structCtx.name : mode === "overview" ? selectedId ?? "overview" : organ.id}`}
          mode="learning"
          context={chatContext}
          className="h-full"
        />
      </aside>
    </div>
  );
}
