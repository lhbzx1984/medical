"use client";

// 人体概览场景：人形参照轮廓（全息 / 真实肤色）+ 器官按解剖位置摆放，用于
// 「手术模拟的人体层面」「首页英雄图」与「学习中心的全身概览」。
// 性别感知：女性模型包含程序化子宫附件（BodyParts3D 无女性生殖网格）。
import { Suspense } from "react";
import { Html } from "@react-three/drei";
import { ORGANS, ORGAN_LIST } from "@/lib/organ-models";
import type { OrganId } from "@/lib/types";
import { OrganModel } from "./OrganModel";
import { BodyOutline } from "./BodyOutline";
import { FemaleReproductive } from "./FemaleReproductive";

export interface BodyOverviewSceneProps {
  /** 高亮脉冲的器官 */
  highlightOrgan?: string | null;
  /** 学习模式：点击器官回调 */
  onSelectOrgan?: (id: OrganId) => void;
  /** 调暗除聚焦器官外的所有器官 */
  focusMode?: boolean;
  /** 手术模拟：只展示患部器官（忽略其余器官） */
  onlyFocus?: boolean;
  /** 轮廓模式：全息线框 / 真实肤色外皮 */
  shellMode?: "hologram" | "skin";
  /** skin 模式淡出系数（1 = 实体外皮） */
  shellFade?: number;
  /** 显示可点击的器官文字标注 */
  showLabels?: boolean;
  /** 模型性别（女性呈现子宫附件与乳房轮廓） */
  sex?: "male" | "female";
  /** 是否渲染人形参照轮廓 */
  showShell?: boolean;
  showOrgans?: boolean;
}

/** 可点击的器官文字标注（跟随器官位置，点击 = 选中该器官） */
function OrganLabels({
  selected,
  sex,
  onSelect,
}: {
  selected?: string | null;
  sex: "male" | "female";
  onSelect?: (id: OrganId) => void;
}) {
  return (
    <>
      {ORGAN_LIST.filter((o) => !o.isShell && (!o.femaleOnly || sex === "female")).map((o) => {
        const active = selected === o.id;
        return (
          <Html
            key={o.id}
            position={[
              o.bodyPosition[0],
              o.bodyPosition[1] + o.bodySize / 2 + 0.05,
              o.bodyPosition[2],
            ]}
            center
            distanceFactor={2.3}
            zIndexRange={[30, 0]}
            style={{ pointerEvents: "auto" }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(o.id);
              }}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[3px] text-[11px] font-medium transition-all ${
                active
                  ? "!border-[#2dd4bf] bg-[#0d2b2b] !text-[#2dd4bf] shadow-[0_0_12px_rgba(45,212,191,0.5)]"
                  : "border-[#3a4f78] bg-[rgba(10,17,30,0.82)] text-[#c6d3e8] hover:border-[#2dd4bf] hover:!text-[#2dd4bf]"
              }`}
              style={{ cursor: "pointer" }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: active ? "#2dd4bf" : "#7fa3d4" }}
              />
              {o.nameZh}
            </button>
          </Html>
        );
      })}
    </>
  );
}

function OrganByInfo({
  organ,
  highlight,
  dimmed,
  onSelect,
}: {
  organ: (typeof ORGAN_LIST)[number];
  highlight: boolean;
  dimmed?: boolean;
  onSelect?: (id: OrganId) => void;
}) {
  const onClick = onSelect
    ? (e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        onSelect(organ.id);
      }
    : undefined;
  if (organ.procedural) {
    return (
      <FemaleReproductive
        targetSize={organ.bodySize}
        position={organ.bodyPosition}
        highlight={highlight}
        onClick={onClick}
      />
    );
  }
  return (
    <OrganModel
      organ={organ}
      position={organ.bodyPosition}
      rotation={organ.bodyRotation}
      highlight={highlight}
      dimmed={dimmed}
      onClick={onClick}
    />
  );
}

export function BodyOverviewScene({
  highlightOrgan,
  onSelectOrgan,
  focusMode,
  onlyFocus,
  shellMode = "hologram",
  shellFade = 1,
  showLabels,
  sex = "male",
  showShell = true,
  showOrgans = true,
}: BodyOverviewSceneProps) {
  const focus = (highlightOrgan ?? null) as OrganId | null;
  const organs = ORGAN_LIST.filter(
    (o) =>
      !o.isShell &&
      (!o.femaleOnly || sex === "female") &&
      (!onlyFocus || o.id === focus)
  );
  return (
    <group>
      {/* 灯光 */}
      <ambientLight intensity={0.75} />
      <hemisphereLight args={["#bcd9ff", "#1a2233", 0.7]} />
      <directionalLight position={[2.5, 4, 3]} intensity={1.15} />
      <directionalLight position={[-3, 2, -2.5]} intensity={0.35} color="#9fd8ff" />

      {/* 人形参照轮廓 */}
      {showShell && (
        <BodyOutline mode={shellMode} opacity={shellMode === "skin" ? shellFade : 1} sex={sex} />
      )}

      <Suspense fallback={null}>
        {showOrgans &&
          organs.map((o) => (
            <OrganByInfo
              key={o.id}
              organ={o}
              highlight={highlightOrgan === o.id}
              dimmed={focusMode && highlightOrgan !== o.id && highlightOrgan !== null}
              onSelect={onSelectOrgan}
            />
          ))}
      </Suspense>

      {/* 器官文字标注（学习概览模式） */}
      {showLabels && showOrgans && (
        <Suspense fallback={null}>
          <OrganLabels selected={highlightOrgan} sex={sex} onSelect={onSelectOrgan} />
        </Suspense>
      )}
    </group>
  );
}

// 学习中心器官特写场景：单器官大视图
export function OrganCloseupScene({
  organId,
  onSelectOrgan,
}: {
  organId: OrganId;
  onSelectOrgan?: (id: OrganId) => void;
}) {
  const organ = ORGANS[organId];
  return (
    <group>
      <ambientLight intensity={0.7} />
      <hemisphereLight args={["#bcd9ff", "#1a2233", 0.7]} />
      <directionalLight position={[2, 3, 3]} intensity={1.2} />
      <directionalLight position={[-2.5, 1.5, -2]} intensity={0.4} color="#9fd8ff" />
      <Suspense fallback={null}>
        {organ.procedural ? (
          <FemaleReproductive
            targetSize={1.6}
            autoRotate
            onClick={
              onSelectOrgan
                ? (e: { stopPropagation: () => void }) => {
                    e.stopPropagation();
                    onSelectOrgan(organId);
                  }
                : undefined
            }
          />
        ) : (
          <OrganModel
            organ={organ}
            targetSize={1.6}
            autoRotate
            onClick={
              onSelectOrgan
                ? (e: { stopPropagation: () => void }) => {
                    e.stopPropagation();
                    onSelectOrgan(organId);
                  }
                : undefined
            }
          />
        )}
      </Suspense>
    </group>
  );
}
