"use client";

// 医学学习中心（功能二主界面）：
// 全身概览（真实人体外皮 + 可点击器官标注）/ 器官特写 / 精细人体图谱（2,234 结构）
// 三种浏览模式 + AI 医学导师问答。
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { ORGAN_LIST, ORGANS } from "@/lib/organ-models";
import type { OrganId } from "@/lib/types";
import type { StructureInfo } from "@/components/atlas/AtlasViewer";
import OrganQuiz from "./OrganQuiz";

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

export default function LearningCenter() {
  const [mode, setMode] = useState<ViewMode>("overview");
  const [quizOrgan, setQuizOrgan] = useState<OrganId | null>(null);
  const [organId, setOrganId] = useState<OrganId>("heart");
  /** 概览中选中的器官（null = 外皮实体状态） */
  const [selectedId, setSelectedId] = useState<OrganId | null>(null);
  const [structCtx, setStructCtx] = useState<StructureInfo | null>(null);
  const [sex, setSex] = useState<"male" | "female">(() => {
    try { return localStorage.getItem("mp-sex") === "female" ? "female" : "male"; } catch { return "male"; }
  });

  const switchSex = useCallback((v: "male" | "female") => {
    setSex(v);
    try { localStorage.setItem("mp-sex", v); } catch {}
  }, []);

  const organ = ORGANS[organId];
  const overviewTarget = selectedId ? ORGANS[selectedId] : null;

  /** 左栏卡片 / 特写按钮 → 器官特写模式 */
  const openCloseup = useCallback((id: OrganId) => {
    setOrganId(id);
    setStructCtx(null);
    setMode("organ");
  }, []);

  /** 概览中点击标注 / 3D 器官 → 选中并聚焦（保持概览，外皮淡出） */
  const focusOrgan = useCallback((id: OrganId) => {
    setSelectedId(id);
  }, []);

  const chatContext = useMemo(() => {
    if (structCtx) {
      return { organName: `${structCtx.name}（${structCtx.systemZh}）` };
    }
    if (mode === "overview" && overviewTarget) {
      return {
        organId: overviewTarget.id,
        organName: `${overviewTarget.nameZh}（${overviewTarget.nameEn}）`,
      };
    }
    if (mode === "overview") {
      return { organName: "全身概览（完整人体）" };
    }
    return { organId: organ.id, organName: `${organ.nameZh}（${organ.nameEn}）` };
  }, [structCtx, organ, mode, overviewTarget]);

  return (
    <div className="mx-auto flex h-[calc(100vh-56px-49px)] max-w-[1720px] gap-3 p-3">
      {quizOrgan && <OrganQuiz key={quizOrgan} organId={quizOrgan} onClose={() => setQuizOrgan(null)} />}
      {/* 左侧：模式与器官选择 */}
      <aside className="panel hidden w-56 shrink-0 flex-col overflow-y-auto p-3 md:flex">
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
              ["overview", "🗺️ 全身概览", "2D 解剖图 · 男女分视角"],
              ["organ", "🫀 器官特写", "单器官 360° 观察"],
              ["atlas", "🧬 精细人体图谱", "2,234 结构 · 爆炸视图"],
            ] as [ViewMode, string, string][]
          ).map(([id, label, desc]) => (
            <button
              key={id}
              onClick={() => {
                setMode(id);
                if (id !== "atlas") setStructCtx(null);
                if (id !== "overview") setSelectedId(null);
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
                organId === o.id && mode !== "atlas"
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
          数据来源：BodyParts3D 4.0（CC BY 4.0）；器官 GLB 模型来自 thebuggeddev/anatomy。
        </div>
      </aside>

      {/* 中间：3D 视图 */}
      <main className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
          <span className="text-[14px] font-bold text-[var(--heading)]">
            {mode === "atlas"
              ? "精细人体图谱"
              : mode === "organ"
                ? `器官特写 · ${organ.nameZh}（${organ.nameEn}）`
                : "全身概览 · 点击文字标注查看器官"}
          </span>
          {(mode === "organ" || (mode === "overview" && selectedId)) && <button className="btn ml-auto !py-1 !text-xs" onClick={() => setQuizOrgan(mode === "organ" ? organId : selectedId)}>学习自测</button>}
          <span className="chip ml-auto hidden sm:inline-flex">
            {mode === "atlas" ? "BodyParts3D 4.0 · 15 系统" : `${organ.system}`}
          </span>
        </div>

        <div className="relative min-h-0 flex-1">
          {mode === "atlas" ? (
            <div className="absolute inset-0 p-3">
              <AtlasViewer
                sex={sex}
                onSelectStructure={(info) => {
                  setStructCtx(info);
                }}
              />
            </div>
          ) : (
            <>
              {mode === "overview" ? (
                <Anatomy2D
                  sex={sex}
                  selectedId={selectedId}
                  onSelect={focusOrgan}
                  onClearSelect={() => setSelectedId(null)}
                  onEnterCloseup={openCloseup}
                />
              ) : (
                <LearnCanvas
                  mode="organ"
                  organId={organId}
                  selectedId={selectedId}
                  onSelect={focusOrgan}
                  onClearSelect={() => setSelectedId(null)}
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
                          ? "完整人体 · 2D 解剖图"
                          : `${organ.nameZh} · ${organ.nameEn}`}
                    </div>
                    <div className="mt-0.5 text-[12.5px] leading-6 text-[var(--text)]">
                      {overviewTarget
                        ? overviewTarget.brief
                        : mode === "overview"
                          ? "点击器官旁的文字标注查看详情；性别切换可对比男性 / 女性解剖结构。"
                          : organ.brief}
                    </div>
                  </div>
                  {mode === "overview" && (
                    <div className="pointer-events-auto flex flex-col items-end gap-1.5">
                      {overviewTarget && (
                        <button
                          className="btn btn-primary !py-1 !text-[11.5px]"
                          onClick={() => openCloseup(overviewTarget.id)}
                        >
                          进入特写 →
                        </button>
                      )}
                      <div className="text-right text-[11px] text-[var(--muted)]">
                        点击标注查看器官
                        <br />
                        再次点击取消选择
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
      <aside className="panel hidden w-[360px] shrink-0 flex-col overflow-hidden lg:flex">
        <ChatPanel
          key={structCtx ? `${structCtx.name}` : mode === "overview" ? selectedId ?? "overview" : organId}
          mode="learning"
          context={chatContext}
          className="h-full"
        />
      </aside>
    </div>
  );
}
