"use client";

// 学习中心 · 全身概览：2D 人体解剖图（男 / 女各一张，Agnes 生成）
// 扫描线 + 器官脉冲标注 + SVG 补充结构（男性大脑 / 女性子宫附件）
// 点击标注 → 选中器官（信息栏与 AI 导师联动）→ 可进入特写
import { BrainOverlay, UterusOverlay } from "@/components/site/AnatomyOverlays";
import { ORGANS } from "@/lib/organ-models";
import type { OrganId } from "@/lib/types";

export type OverviewId = OrganId | "breast";

export function overviewStructure(id: OverviewId) {
  if (id === "breast") return { id, modelId: null, nameZh: "乳腺", nameEn: "Breast", system: "乳腺组织", brief: "乳腺位于胸前部，由腺体、导管与周围支持组织组成。当前暂无独立的乳腺特写模型。" };
  return { ...ORGANS[id], modelId: id };
}

interface Label {
  name: string;
  organId: OverviewId;
  x: number; // 画面百分比
  y: number;
  side: "left" | "right";
}

const MALE_LABELS: Label[] = [
  { name: "大脑", organId: "brain", x: 52.5, y: 6.5, side: "right" },
  { name: "肺", organId: "lungs", x: 37, y: 31.5, side: "left" },
  { name: "心脏", organId: "heart", x: 54, y: 36.5, side: "right" },
  { name: "肝", organId: "liver", x: 40.5, y: 47.5, side: "left" },
  { name: "胃", organId: "stomach", x: 59.5, y: 49.5, side: "right" },
  { name: "肠", organId: "intestine", x: 52.5, y: 64, side: "right" },
];

const FEMALE_LABELS: Label[] = [
  { name: "大脑", organId: "brain", x: 53.5, y: 7.5, side: "right" },
  { name: "肺", organId: "lungs", x: 40.5, y: 33, side: "left" },
  { name: "心脏", organId: "heart", x: 56, y: 35.5, side: "right" },
  { name: "肝", organId: "liver", x: 42, y: 46.5, side: "left" },
  { name: "胃", organId: "stomach", x: 60.5, y: 49.5, side: "right" },
  { name: "肠", organId: "intestine", x: 53.5, y: 62.5, side: "right" },
  { name: "子宫", organId: "uterus", x: 58, y: 74.5, side: "right" },
  { name: "乳腺", organId: "breast", x: 64.5, y: 26.5, side: "right" },
];

export default function Anatomy2D({
  sex,
  selectedId,
  onSelect,
  onClearSelect,
  onEnterCloseup,
}: {
  sex: "male" | "female";
  selectedId: OverviewId | null;
  onSelect: (id: OverviewId) => void;
  onClearSelect: () => void;
  onEnterCloseup: (id: OrganId) => void;
}) {
  const labels = sex === "female" ? FEMALE_LABELS : MALE_LABELS;

  return (
    <div className="vp absolute inset-0 bg-gradient-to-b from-[#0a1322] to-[#070d18]">
      {/* 2D 解剖插画（保持 3:4 比例居中） */}
      <div className="relative mx-auto flex h-full justify-center">
        <div className="relative h-full aspect-[3/4]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sex === "female" ? "/cases/anatomy-female.png" : "/cases/anatomy-male.png"}
            alt={sex === "female" ? "女性人体解剖图" : "男性人体解剖图"}
            className="h-full w-full object-cover"
          />

          {/* SVG 补充结构 */}
          {sex === "male" && <BrainOverlay />}
          {sex === "female" && <UterusOverlay />}

          {/* 扫描线 */}
          <div className="scan-line absolute left-[6%] right-[6%] h-[2px] rounded-full bg-gradient-to-r from-transparent via-[#2dd4bf] to-transparent shadow-[0_0_14px_rgba(45,212,191,0.8)]" />

          {/* 器官标注 */}
          {labels.map((l, i) => {
            const active = selectedId === l.organId;
            return (
              <button
                key={l.name}
                onClick={() => (active ? onClearSelect() : onSelect(l.organId))}
                className="group absolute z-10"
                style={{
                  left: `${l.x}%`,
                  top: `${l.y}%`,
                  transform: `translate(${l.side === "left" ? "-100%" : "0"}, -50%)`,
                  animation: `floatSoft ${4.2 + (i % 4) * 0.45}s ease-in-out ${i * 0.3}s infinite`,
                }}
              >
                <span className="flex items-center gap-1.5">
                  {l.side === "left" && (
                    <span
                      className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold shadow-sm transition-colors ${
                        active
                          ? "border-[#2dd4bf] bg-[#0d2b2b] text-[#2dd4bf]"
                          : "border-[#2a4a6e] bg-[rgba(7,13,24,0.74)] text-[#dceafe] group-hover:border-[#2dd4bf] group-hover:text-[#2dd4bf]"
                      }`}
                    >
                      {l.name}
                    </span>
                  )}
                  <span className="organ-dot h-2.5 w-2.5 rounded-full bg-[#2dd4bf]" />
                  {l.side === "right" && (
                    <span
                      className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold shadow-sm transition-colors ${
                        active
                          ? "border-[#2dd4bf] bg-[#0d2b2b] text-[#2dd4bf]"
                          : "border-[#2a4a6e] bg-[rgba(7,13,24,0.74)] text-[#dceafe] group-hover:border-[#2dd4bf] group-hover:text-[#2dd4bf]"
                      }`}
                    >
                      {l.name}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 底部操作条 */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-[rgba(5,9,17,0.94)] to-transparent px-4 pb-3 pt-10">
        <div className="text-[11px] text-[var(--muted)]">
          {sex === "female"
            ? "女性解剖：含子宫、卵巢与乳腺结构"
            : "男性解剖：体循环与呼吸系统概览"}
        </div>
        {selectedId && overviewStructure(selectedId).modelId && (
          <button
            className="btn btn-primary !py-1 !text-[11.5px]"
            onClick={() => {
              const modelId = overviewStructure(selectedId).modelId;
              if (modelId) onEnterCloseup(modelId);
            }}
          >
            进入特写 →
          </button>
        )}
        {selectedId && !overviewStructure(selectedId).modelId && <span className="text-[11px] text-[var(--muted)]">暂无特写模型</span>}
      </div>
    </div>
  );
}
