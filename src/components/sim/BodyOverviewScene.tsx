"use client";

// 人体概览场景：写实人体体表（透视 / 实体）+ 器官按解剖位置摆放 + 可选的骨骼、血管层，用于
// 「手术模拟的人体层面」与「学习中心的全身概览」。体表加载期间以人形轮廓占位。
// 性别感知：女性模型包含程序化子宫附件（BodyParts3D 无女性生殖网格）。
import { Suspense } from "react";
import { Html } from "@react-three/drei";
import { ORGANS, ORGAN_LIST } from "@/lib/organ-models";
import type { AnatomyLayerState } from "@/lib/anatomy-layers";
import type { OrganId } from "@/lib/types";
import { AnatomyLayers } from "./AnatomyLayers";
import { OrganModel } from "./OrganModel";
import { BodyOutline } from "./BodyOutline";
import { FemaleReproductive } from "./FemaleReproductive";
import { ReferenceBody } from "./ReferenceBody";
import { StudioLighting } from "./StudioLighting";

export interface BodyOverviewSceneProps {
  /** 高亮脉冲的器官 */
  highlightOrgan?: string | null;
  /** 学习模式：点击器官回调 */
  onSelectOrgan?: (id: OrganId) => void;
  /** 调暗除聚焦器官外的所有器官 */
  focusMode?: boolean;
  /** 手术模拟：只展示患部器官（忽略其余器官） */
  onlyFocus?: boolean;
  /** 体表模式：hologram = 透视（玻璃质，可见内部）/ skin = 实体肤色体表；加载占位的人形轮廓同样按此模式 */
  shellMode?: "hologram" | "skin";
  /** 占位轮廓在 skin 模式下的淡出系数（1 = 实体外皮） */
  shellFade?: number;
  /** 显示可点击的器官文字标注 */
  showLabels?: boolean;
  /** 模型性别（女性呈现子宫附件与乳房轮廓） */
  sex?: "male" | "female";
  /** 是否渲染人体体表 */
  showShell?: boolean;
  showOrgans?: boolean;
  /** 打开的解剖层（骨骼 / 动脉 / 静脉）；缺省不显示 */
  layers?: AnatomyLayerState;
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
  if (organ.bodyParts?.length) {
    return (
      <>
        {organ.bodyParts.map((part, index) => (
          <OrganModel
            key={`${part.glb}-${index}`}
            organ={{ ...organ, glb: part.glb }}
            targetSize={part.size}
            position={part.position}
            rotation={organ.bodyRotation}
            highlight={highlight}
            dimmed={dimmed}
            onClick={onClick}
          />
        ))}
      </>
    );
  }
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
  layers,
}: BodyOverviewSceneProps) {
  const focus = (highlightOrgan ?? null) as OrganId | null;
  const organs = ORGAN_LIST.filter(
    (o) =>
      !o.isShell &&
      (!o.femaleOnly || sex === "female") &&
      !(focusMode && o.procedural) &&
      (!onlyFocus || o.id === focus)
  );
  return (
    <group>
      <StudioLighting />

      {/* 人体体表（男性 BodyParts3D 皮肤，女性 HuBMAP 体表）；加载期间显示人形轮廓 */}
      {showShell && (
        <Suspense
          fallback={<BodyOutline mode={shellMode} opacity={shellMode === "skin" ? shellFade : 1} sex={sex} />}
        >
          <ReferenceBody key={sex} sex={sex} solid={shellMode === "skin"} />
        </Suspense>
      )}

      {layers && <AnatomyLayers layers={layers} />}

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
  useReferenceModel = true,
  onSelectOrgan,
}: {
  organId: OrganId;
  useReferenceModel?: boolean;
  onSelectOrgan?: (id: OrganId) => void;
}) {
  const organ = ORGANS[organId];
  const closeupGlb = useReferenceModel ? organ.closeupGlb : undefined;
  return (
    <group>
      <StudioLighting />
      <Suspense fallback={null}>
        {organ.procedural && !closeupGlb ? (
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
            organ={closeupGlb ? { ...organ, glb: closeupGlb } : organ}
            targetSize={organ.closeupGlb ? 1.25 : 1.6}
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
