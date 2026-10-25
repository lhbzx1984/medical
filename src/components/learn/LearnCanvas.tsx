"use client";

// 学习中心 3D 画布：全身概览（真实肤色外皮 + 可点击器官标注）与器官特写两种模式。
// 概览中点击文字标注 / 3D 器官 → 外皮淡出并聚焦该器官；点空白处恢复外皮。
import { Suspense, useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { ORGANS } from "@/lib/organ-models";
import type { OrganId } from "@/lib/types";
import { BodyOverviewScene, OrganCloseupScene } from "@/components/sim/BodyOverviewScene";

interface Props {
  mode: "overview" | "organ";
  organId: OrganId;
  /** 概览中当前选中的器官（null = 外皮实体状态） */
  selectedId: OrganId | null;
  onSelect: (id: OrganId) => void;
  onClearSelect: () => void;
  sex?: "male" | "female";
}

/** 相机焦点：概览选中器官后飞向该器官，清除后回到全身 */
function CameraFocus({ mode, selectedId }: { mode: "overview" | "organ"; selectedId: OrganId | null }) {
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
  }, [mode, selectedId]);

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
  selectedId,
  onSelect,
  onClearSelect,
  sex = "male",
}: Props) {
  const overview = mode === "overview";
  return (
    <div className="vp absolute inset-0 bg-gradient-to-b from-[#0a1322] to-[#070d18]">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0.55, 1.5, 2.95], fov: 40, near: 0.01, far: 60 }}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => {
          if (overview && selectedId) onClearSelect();
        }}
      >
        <CameraFocus mode={mode} selectedId={overview ? selectedId : null} />
        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={overview ? 0.45 : 0.6}
          maxDistance={6}
          target={[0, overview ? 1.0 : 0, 0]}
        />
        {overview ? (
          <BodyOverviewScene
            highlightOrgan={selectedId}
            onSelectOrgan={onSelect}
            shellMode="skin"
            shellFade={selectedId ? 0.22 : 1}
            showLabels
            sex={sex}
          />
        ) : (
          <OrganCloseupScene organId={organId} onSelectOrgan={onSelect} />
        )}
      </Canvas>
    </div>
  );
}
