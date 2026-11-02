"use client";

// 学习中心 3D 画布：全身概览（写实人体体表 + 可点击器官标注 + 可选骨骼 / 血管层）与器官特写两种模式。
// 概览中点击文字标注 / 3D 器官 → 外皮淡出并聚焦该器官；点空白处恢复外皮。
import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { ORGANS } from "@/lib/organ-models";
import type { AnatomyLayerState } from "@/lib/anatomy-layers";
import type { OrganId } from "@/lib/types";
import { BodyOverviewScene, OrganCloseupScene } from "@/components/sim/BodyOverviewScene";
import { Suspense } from "react";
import { ExtraOrgans } from "./ExtraOrgans";
import { EXTRA_ORGANS, type ExtraOrganId, extraBodyFit } from "@/lib/extra-organs";

interface Props {
  mode: "overview" | "organ";
  organId: OrganId;
  useReferenceModel?: boolean;
  showLabels?: boolean;
  showBodySurface?: boolean;
  /** 概览中打开的解剖层 */
  layers?: AnatomyLayerState;
  /** 概览中当前选中的器官（null = 外皮实体状态） */
  selectedId: OrganId | null;
  extraSelected?: ExtraOrganId | null;
  onSelectExtra?: (id: ExtraOrganId) => void;
  onSelect: (id: OrganId) => void;
  onClearSelect: () => void;
  sex?: "male" | "female";
}

/** 相机焦点：概览选中器官后飞向该器官，清除后回到全身 */
function CameraFocus({ mode, selectedId, extraSelected, sex }: { mode: "overview" | "organ"; selectedId: OrganId | null; extraSelected: ExtraOrganId | null; sex: "male" | "female" }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const anim = useRef(false);

  useEffect(() => {
    if (mode === "overview" && selectedId) {
      const o = ORGANS[selectedId];
      const target = new THREE.Vector3(...o.bodyPosition);
      const dir = new THREE.Vector3(0.22, 0.18, 1).normalize();
      goal.current = {
        target,
        pos: target.clone().add(dir.multiplyScalar(o.bodySize * 2.2 + 0.5)),
      };
    } else if (mode === "overview" && extraSelected && EXTRA_ORGANS[extraSelected].centers[sex]) {
      const fit = extraBodyFit(sex);
      const center = EXTRA_ORGANS[extraSelected].centers[sex]!;
      const target = new THREE.Vector3(...center).add(new THREE.Vector3(...fit.position)).multiplyScalar(fit.scale);
      const distance = EXTRA_ORGANS[extraSelected].focusDistance ?? 0.68;
      const direction = new THREE.Vector3(0.16, 0.13, 0.65).normalize();
      goal.current = { target, pos: target.clone().add(direction.multiplyScalar(distance)) };
    } else if (mode === "overview") {
      goal.current = {
        target: new THREE.Vector3(0, 1.0, 0),
        pos: new THREE.Vector3(0.55, 1.5, 2.95),
      };
    } else {
      goal.current = {
        target: new THREE.Vector3(0, 0, 0),
        pos: new THREE.Vector3(0.35, 0.25, 2.35),
      };
    }
    anim.current = true;
  }, [mode, selectedId, extraSelected, sex]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => (anim.current = false);
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [controls]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!anim.current || !g || !controls) return;
    const k = 1 - Math.exp(-dt * 3);
    camera.position.lerp(g.pos, k);
    controls.target.lerp(g.target, k);
    controls.update();
    if (camera.position.distanceTo(g.pos) < 0.01 && controls.target.distanceTo(g.target) < 0.01) {
      anim.current = false;
    }
  });
  return null;
}

export default function LearnCanvas({
  mode,
  organId,
  useReferenceModel = true,
  showLabels = false,
  showBodySurface = false,
  layers,
  selectedId,
  extraSelected = null,
  onSelectExtra,
  onSelect,
  onClearSelect,
  sex = "male",
}: Props) {
  const overview = mode === "overview";
  return (
    <div className="vp absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,#35485a_0%,#182636_48%,#0b1523_100%)]">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0.55, 1.5, 2.95], fov: 40, near: 0.01, far: 60 }}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => {
          if (overview && (selectedId || extraSelected)) onClearSelect();
        }}
      >
        <CameraFocus mode={mode} selectedId={overview ? selectedId : null} extraSelected={overview ? extraSelected : null} sex={sex} />
        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={overview ? 0.45 : 0.6}
          maxDistance={6}
          target={[0, overview ? 1.0 : 0, 0]}
        />
        {overview && !showBodySurface && onSelectExtra && (
          <Suspense fallback={null}>
            <ExtraOrgans sex={sex} selected={extraSelected} onSelect={onSelectExtra} />
          </Suspense>
        )}
        {overview ? (
          <BodyOverviewScene
            showShell
            showOrgans={!showBodySurface}
            highlightOrgan={selectedId ?? (extraSelected ? "__extra__" : null)}
            focusMode={extraSelected !== null}
            onSelectOrgan={(id) => id === selectedId ? onClearSelect() : onSelect(id)}
            shellMode={showBodySurface ? "skin" : "hologram"}
            showLabels={showLabels}
            sex={sex}
            layers={layers}
          />
        ) : (
          <OrganCloseupScene organId={organId} useReferenceModel={useReferenceModel} onSelectOrgan={onSelect} />
        )}
      </Canvas>
    </div>
  );
}
