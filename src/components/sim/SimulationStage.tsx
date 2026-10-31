"use client";

// 3D 手术模拟舞台：
//  - 人体层面只聚焦患部（只渲染手术涉及的器官 + 切口定位环 + 器械动画）
//  - 器官层面为患部器官特写，按动作类型（切开/止血/缝合/冲洗…）播放器械动画
//  - 右侧「手术步骤」描述栏：步骤列表 + 当前步骤的解说与器械清单
// 状态（当前步骤/播放中）由父组件持有。
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Grid, Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { ORGANS, matchOrgan } from "@/lib/organ-models";
import { normalizeSimSteps } from "@/lib/planning-prompt";
import type { SimulationRun } from "@/lib/types";
import { BodyOverviewScene } from "./BodyOverviewScene";
import { OrganModel } from "./OrganModel";
import { FemaleReproductive } from "./FemaleReproductive";
import { InstrumentRig, RegionMarker, instrumentIds } from "./instruments";
import { StudioLighting } from "./StudioLighting";

export interface SimulationStageProps {
  simulation: SimulationRun | null;
  stepIndex: number;
  playing: boolean;
  onStepIndex: (i: number) => void;
  onPlaying: (p: boolean) => void;
  /** 患者性别（女性患部为子宫时呈现程序化模型） */
  sex?: "male" | "female";
}

interface CameraGoal {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  key: string;
}

/** 动画和切步共用这一计时，暂停只保留已播放的时间。 */
export function advancePlayback(
  state: { elapsedSec: number; started: boolean },
  deltaSec: number,
  playing: boolean,
  durationSec: number
) {
  const duration = Math.max(3, durationSec);
  const elapsedSec = playing ? Math.min(duration, state.elapsedSec + Math.max(0, deltaSec)) : state.elapsedSec;
  const started = state.started || playing;
  return {
    elapsedSec,
    started,
    progress: started ? Math.min(1, elapsedSec / duration) : 0.45,
    completed: playing && state.elapsedSec < duration && elapsedSec >= duration,
  };
}

function goalForStep(sim: SimulationRun | null, stepIndex: number): CameraGoal {
  const step = sim?.steps[stepIndex];
  const organ = ORGANS[matchOrgan(sim?.focusOrgan ?? "skin")];
  if (step?.view === "organ") {
    // 器官层面：患部器官在原点放大展示
    return {
      pos: new THREE.Vector3(0.3, 0.22, 2.1),
      target: new THREE.Vector3(0, 0, 0),
      key: `organ-${stepIndex}`,
    };
  }
  // 人体层面：聚焦患部（相机推向该器官的解剖位置）
  const target = new THREE.Vector3(...organ.bodyPosition);
  const dir = new THREE.Vector3(0.3, 0.22, 1).normalize();
  return {
    pos: target.clone().add(dir.multiplyScalar(organ.bodySize * 2.0 + 0.55)),
    target,
    key: `overview-${stepIndex}`,
  };
}

function CameraRig({ goal }: { goal: CameraGoal }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const animRef = useRef(false);
  const goalRef = useRef(goal);
  useEffect(() => {
    goalRef.current = goal;
    animRef.current = true;
  }, [goal]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => (animRef.current = false);
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [controls]);

  useFrame((_, dt) => {
    if (!animRef.current || !controls) return;
    const k = 1 - Math.exp(-dt * 2.6);
    camera.position.lerp(goalRef.current.pos, k);
    controls.target.lerp(goalRef.current.target, k);
    controls.update();
    if (
      camera.position.distanceTo(goalRef.current.pos) < 0.012 &&
      controls.target.distanceTo(goalRef.current.target) < 0.012
    ) {
      animRef.current = false;
    }
  });
  return null;
}

const ACTION_LABEL: Record<string, string> = {
  position: "体位摆放",
  trocar: "建立通道",
  explore: "探查定位",
  cut: "切开离断",
  coagulate: "电凝止血",
  dissect: "组织分离",
  resect: "切除剪断",
  clamp: "钳夹结扎",
  suture: "缝合",
  irrigate: "冲洗吸引",
  extract: "标本取出",
  none: "讲解",
};

function StageContent({
  sim,
  stepIndex,
  playing,
  onComplete,
  sex = "male",
}: {
  sim: SimulationRun;
  stepIndex: number;
  playing: boolean;
  onComplete: () => void;
  sex?: "male" | "female";
}) {
  const step = sim.steps[stepIndex];
  const view = step?.view ?? "overview";
  const focusId = matchOrgan(sim.focusOrgan);
  const organ = ORGANS[focusId];
  const overviewView = view === "overview";
  const cameraGoal = useMemo(() => goalForStep(sim, stepIndex), [sim, stepIndex]);

  // 步骤内进度（驱动器械动画）；切换步骤时清零
  const progressRef = useRef(0.45);
  const playbackRef = useRef({ elapsedSec: 0, started: false });
  useEffect(() => {
    playbackRef.current = { elapsedSec: 0, started: false };
    progressRef.current = 0.45;
  }, [sim.id, stepIndex]);
  useEffect(() => {
    if (playing && playbackRef.current.elapsedSec >= Math.max(3, step?.durationSec ?? 10)) {
      playbackRef.current = { elapsedSec: 0, started: false };
    }
  }, [playing, step?.durationSec]);
  useFrame((_, dt) => {
    const next = advancePlayback(playbackRef.current, dt, playing, step?.durationSec ?? 10);
    playbackRef.current = next;
    progressRef.current = next.progress;
    if (next.completed) onComplete();
  });

  const ids = useMemo(
    () => instrumentIds(step?.instruments ?? []),
    [step?.instruments]
  );
  const showRig = ids.length > 0 && step?.action !== "position" && step?.action !== "none";
  // 器官特写时焦点在器官朝向相机的一侧，避免器械没入器官体内
  const focusPos: [number, number, number] = overviewView
    ? organ.bodyPosition
    : [0, 0.05, 0.5];

  return (
    <>
      <CameraRig goal={cameraGoal} />
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={0.1}
        maxDistance={7}
        target={[0, 1.05, 0]}
      />

      {overviewView ? (
        <>
          {/* 人体层面：只聚焦患部器官 + 人形轮廓 + 切口定位环 */}
          <BodyOverviewScene
            highlightOrgan={focusId}
            onlyFocus
            showShell
            showOrgans
            sex={sex}
          />
          <RegionMarker position={focusPos} scale={1} progressRef={progressRef} />
        </>
      ) : (
        <>
          <StudioLighting />
          <Suspense fallback={null}>
            {organ.procedural ? (
              <FemaleReproductive targetSize={1.35} highlight />
            ) : (
              <OrganModel organ={organ} targetSize={1.35} highlight />
            )}
          </Suspense>
        </>
      )}

      {/* 手术器械动画 */}
      {showRig && (
        <Suspense fallback={null}>
          <InstrumentRig
            ids={ids}
            action={step?.action ?? "explore"}
            focus={focusPos}
            scale={overviewView ? 0.16 : 0.55}
            progressRef={progressRef}
          />
        </Suspense>
      )}

      <ContactShadows position={[0, 0.001, 0]} opacity={0.4} scale={3.2} blur={2.4} far={1.1} />
      <Grid
        position={[0, 0, 0]}
        args={[7, 7]}
        cellSize={0.12}
        cellThickness={0.6}
        cellColor="#152238"
        sectionSize={0.6}
        sectionThickness={1}
        sectionColor="#1d3054"
        fadeDistance={7.5}
        fadeStrength={1.4}
        infiniteGrid
      />
    </>
  );
}

function LoadingHint() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2 text-xs text-[var(--muted)]">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#22406b] border-t-[var(--accent)]" />
        正在加载 3D 模型…
      </div>
    </Html>
  );
}

export default function SimulationStage({
  simulation,
  stepIndex,
  playing,
  onStepIndex,
  onPlaying,
  sex = "male",
}: SimulationStageProps) {
  const completedRef = useRef(false);
  useEffect(() => { completedRef.current = false; }, [simulation?.id, stepIndex]);
  const steps = simulation?.steps ?? [];
  try {
    if (simulation) {
      if (typeof simulation.focusOrgan !== "string" || !Array.isArray(simulation.steps)) throw new Error("模拟元数据无效");
      if (steps.length) normalizeSimSteps(steps);
    }
  } catch {
    return <div role="alert" className="panel p-4 text-[var(--warn)]">该历史模拟脚本格式不完整，暂时无法播放。请重新生成方案，原有记录会保留。</div>;
  }
  const step = steps[stepIndex];
  const focusId = matchOrgan(simulation?.focusOrgan ?? "skin");
  const organ = ORGANS[focusId];

  if (!simulation || !steps.length) {
    return (
      <div className="grid h-full min-h-[460px] place-items-center text-sm text-[var(--muted)]">
        当前版本暂无模拟脚本
      </div>
    );
  }

  return (
    <div className="vp flex h-full min-h-[460px] w-full overflow-hidden rounded-xl border border-[var(--line)] bg-gradient-to-b from-[#0a1322] to-[#070d18]">
      {/* 3D 视口 */}
      <div className="relative min-w-0 flex-1">
        <Canvas
          dpr={[1, 2]}
          camera={{ position: [0.6, 1.55, 2.7], fov: 42, near: 0.01, far: 60 }}
          gl={{ antialias: true, alpha: true }}
        >
          <Suspense fallback={<LoadingHint />}>
            <StageContent
              sim={simulation} stepIndex={stepIndex} playing={playing} sex={sex}
              onComplete={() => {
                if (stepIndex + 1 < steps.length) onStepIndex(stepIndex + 1);
                else {
                  completedRef.current = true;
                  onPlaying(false);
                }
              }}
            />
          </Suspense>
        </Canvas>

        {/* 顶部状态 */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
          <span
            className={`chip ${step?.view === "organ" ? "!border-[var(--accent)] !text-[var(--accent)]" : "!border-[#24406b] !text-[#7fb2f5]"}`}
          >
            {step?.view === "organ" ? `器官层面 · ${organ.nameZh}` : "人体层面 · 患部聚焦"}
          </span>
          <span className="chip">
            步骤 {stepIndex + 1}/{steps.length}
          </span>
          {step?.action && ACTION_LABEL[step.action] && (
            <span className="chip !text-[var(--accent)]">{ACTION_LABEL[step.action]}</span>
          )}
          {playing && (
            <span className="chip !text-[var(--accent)]">
              <span className="rec-dot">●</span> 模拟播放中
            </span>
          )}
        </div>

        <div className="pointer-events-none absolute right-3 top-3 text-[11px] text-[var(--muted)]">
          拖拽旋转 · 滚轮缩放
        </div>

        {/* 底部播放控制 + 当前步解说 */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(5,9,17,0.94)] to-transparent px-4 pb-3 pt-8">
          <div className="mb-2 flex items-center gap-2">
            <button
              className="btn !px-3"
              onClick={() => onStepIndex(Math.max(0, stepIndex - 1))}
              disabled={stepIndex === 0}
              title="上一步"
            >
              ⏮
            </button>
            <button
              className="btn btn-primary !px-4"
              onClick={() => {
                if (completedRef.current && !playing) onStepIndex(0);
                onPlaying(!playing);
              }}
            >
              {playing ? "⏸ 暂停" : "▶ 播放模拟"}
            </button>
            <button
              className="btn !px-3"
              onClick={() => {
                onPlaying(false);
                onStepIndex(Math.min(steps.length - 1, stepIndex + 1));
              }}
              disabled={stepIndex === steps.length - 1}
              title="下一步"
            >
              ⏭
            </button>
            <div className="ml-1 flex flex-1 gap-1 overflow-x-auto pb-1 lg:hidden">
              {steps.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onPlaying(false);
                    onStepIndex(i);
                  }}
                  className={`shrink-0 rounded-md px-2.5 py-1 text-[11.5px] transition-colors ${
                    i === stepIndex
                      ? "bg-[var(--accent-soft)] !text-[var(--accent)]"
                      : i < stepIndex
                        ? "bg-[var(--chip-bg)] !text-[var(--muted)]"
                        : "bg-[var(--btn-bg)] !text-[var(--muted)]"
                  }`}
                >
                  {i + 1}. {s.name}
                </button>
              ))}
            </div>
          </div>
          <div className="panel-2 px-3.5 py-2.5">
            <div className="mb-0.5 flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-[var(--heading)]">
                {stepIndex + 1}. {step?.name}
              </span>
              {step?.action && ACTION_LABEL[step.action] ? (
                <span className="chip !py-0 !text-[10.5px]">{ACTION_LABEL[step.action]}</span>
              ) : null}
              {step?.instruments?.length ? (
                <span className="flex flex-wrap gap-1">
                  {step.instruments.map((t) => (
                    <span key={t} className="chip !py-0 !text-[10.5px]">
                      {t}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
            <div className="text-[12.5px] leading-6 text-[var(--text)]">{step?.narration}</div>
          </div>
        </div>
      </div>

      {/* 右侧：手术步骤描述栏 */}
      <aside className="hidden w-[290px] shrink-0 flex-col border-l border-[#1d2a47] bg-[#0b1220] lg:flex">
        <div className="flex items-center justify-between border-b border-[#1d2a47] px-3.5 py-2.5">
          <span className="text-[12.5px] font-bold text-[var(--heading)]">
            手术步骤 · 共 {steps.length} 步
          </span>
          <span className="chip !text-[10.5px]">{organ.nameZh}术区</span>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {steps.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                onPlaying(false);
                onStepIndex(i);
              }}
              className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                i === stepIndex
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-transparent hover:bg-[var(--btn-bg-hover)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[12.5px] font-semibold ${
                    i === stepIndex ? "text-[var(--accent)]" : "text-[var(--heading)]"
                  }`}
                >
                  {i + 1}. {s.name}
                </span>
                <span className="chip !shrink-0 !px-1.5 !py-0 !text-[10px]">
                  {s.view === "organ" ? "器官" : "人体"}
                </span>
              </div>
              {s.instruments?.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {s.instruments.map((t) => (
                    <span key={t} className="chip !px-1.5 !py-0 !text-[10px]">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          ))}
        </div>
        <div className="border-t border-[#1d2a47] p-3">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            当前操作
          </div>
          <div className="text-[12.5px] font-semibold text-[var(--heading)]">
            {step?.name}
          </div>
          <div className="mt-1 text-[11.5px] leading-5 text-[var(--text)]">
            {step?.narration}
          </div>
          {step?.durationSec ? (
            <div className="mt-2">
              <span className="chip !py-0 !text-[10px]">⏱ {step.durationSec}s</span>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
