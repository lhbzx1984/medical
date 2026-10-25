// 一次性接线脚本：女性生殖结构接入 AtlasViewer / SimulationStage / PlanningWorkspace
import fs from "node:fs";

// ── AtlasViewer ──
let a = fs.readFileSync("src/components/atlas/AtlasViewer.tsx", "utf8");
a = a.replace(
  'import { OrbitControls } from "@react-three/drei";',
  'import { OrbitControls } from "@react-three/drei";\nimport { FemaleReproductive } from "@/components/sim/FemaleReproductive";'
);
a = a.replace(
  "  const [focusGoal, setFocusGoal] = useState<FocusGoal | null>(null);",
  "  const [focusGoal, setFocusGoal] = useState<FocusGoal | null>(null);\n  const [femaleSel, setFemaleSel] = useState(false);"
);
a = a.replace(
  `          <Suspense fallback={null}>
            {chunks.map((c) => (`,
  `          {sex === "female" && visibleSystems.has("reproductive") && (
            <Suspense fallback={null}>
              <FemaleReproductive
                position={[0, 0.955, -0.01]}
                targetSize={0.13}
                highlight={femaleSel}
                onClick={(e) => {
                  e.stopPropagation();
                  setFemaleSel(true);
                  setSelected(null);
                  const t = new THREE.Vector3(0, 0.955, -0.01);
                  setFocusGoal((prev) => {
                    const dir = prev
                      ? prev.pos.clone().sub(prev.target).normalize()
                      : new THREE.Vector3(0.18, 0.3, 1).normalize();
                    return { target: t, pos: t.clone().add(dir.multiplyScalar(0.42)), key: Date.now() };
                  });
                }}
              />
            </Suspense>
          )}
          <Suspense fallback={null}>
            {chunks.map((c) => (`
);
a = a.replace(
  `                  const gi = pickPart(e.face?.a ?? 0, c.geo);
                  if (gi !== null) {
                    setSelected(gi);`,
  `                  const gi = pickPart(e.face?.a ?? 0, c.geo);
                  if (gi !== null) {
                    setFemaleSel(false);
                    setSelected(gi);`
);
a = a.replace("onPointerMissed={() => setSelected(null)}", "onPointerMissed={() => { setSelected(null); setFemaleSel(false); }}");
a = a.replace(
  "  const resetView = () => {\n    setSelected(null);",
  "  const resetView = () => {\n    setSelected(null);\n    setFemaleSel(false);"
);
a = a.replace(
  "  const selectedInfo: StructureInfo | null = useMemo(() => {",
  `  const femaleInfo: StructureInfo | null = useMemo(() => {
    if (!femaleSel) return null;
    const sys = ATLAS_SYSTEMS.find((s) => s.id === "reproductive");
    return {
      name: sex === "female" ? "子宫与附件（女性）" : "子宫与附件",
      systemId: "reproductive",
      systemZh: sys?.nameZh ?? "生殖系统",
      systemDesc:
        "女性内生殖器官（程序化建模）：梨形肌性子宫，双侧输卵管连接卵巢。受激素调控产生月经并孕育胎儿。",
      conceptId: "Female-Internal",
      sizeMm: [75, 50, 40],
    };
  }, [femaleSel, sex]);

  const selectedInfo: StructureInfo | null = useMemo(() => {`
);
a = a.replace("  }, [selected, loaded]);", "  }, [selected, loaded]);\n  const shownInfo = femaleInfo ?? selectedInfo;");
a = a.replaceAll("{selectedInfo && (", "{shownInfo && (");
a = a.replaceAll("{selectedInfo.name}", "{shownInfo.name}");
a = a.replaceAll("SYSTEM_COLOR[selectedInfo.systemId]", "SYSTEM_COLOR[shownInfo.systemId]");
a = a.replaceAll("{selectedInfo.systemZh} · {selectedInfo.conceptId}", "{shownInfo.systemZh} · {shownInfo.conceptId}");
a = a.replaceAll('{selectedInfo.sizeMm.join(" × ")} mm', '{shownInfo.sizeMm.join(" × ")} mm');
a = a.replaceAll("{selectedInfo.systemDesc}", "{shownInfo.systemDesc}");
a = a.replaceAll("onSelectStructure(selectedInfo)", "onSelectStructure(shownInfo)");
fs.writeFileSync("src/components/atlas/AtlasViewer.tsx", a);
console.log("atlas female:", a.includes("FemaleReproductive"), "| shownInfo:", a.includes("shownInfo"), "| dirty selectedInfo refs:", (a.match(/selectedInfo\./g) ?? []).length);

// ── SimulationStage ──
let sim = fs.readFileSync("src/components/sim/SimulationStage.tsx", "utf8");
sim = sim.replace(
  'import { OrganModel } from "./OrganModel";',
  'import { OrganModel } from "./OrganModel";\nimport { FemaleReproductive } from "./FemaleReproductive";'
);
sim = sim.replace(
  `export interface SimulationStageProps {
  simulation: SimulationRun | null;
  stepIndex: number;
  playing: boolean;
  onStepIndex: (i: number) => void;
  onPlaying: (p: boolean) => void;
}`,
  `export interface SimulationStageProps {
  simulation: SimulationRun | null;
  stepIndex: number;
  playing: boolean;
  onStepIndex: (i: number) => void;
  onPlaying: (p: boolean) => void;
  /** 患者性别（女性患部为子宫时呈现程序化模型） */
  sex?: "male" | "female";
}`
);
sim = sim.replace(
  `function StageContent({
  sim,
  stepIndex,
  playing,
}: {
  sim: SimulationRun;
  stepIndex: number;
  playing: boolean;
}) {`,
  `function StageContent({
  sim,
  stepIndex,
  playing,
  sex = "male",
}: {
  sim: SimulationRun;
  stepIndex: number;
  playing: boolean;
  sex?: "male" | "female";
}) {`
);
sim = sim.replace(
  `          <BodyOverviewScene
            highlightOrgan={focusId}
            onlyFocus
            showShell
            showOrgans
          />`,
  `          <BodyOverviewScene
            highlightOrgan={focusId}
            onlyFocus
            showShell
            showOrgans
            sex={sex}
          />`
);
sim = sim.replace(
  `          <Suspense fallback={null}>
            <OrganModel organ={organ} targetSize={1.35} highlight />
          </Suspense>`,
  `          <Suspense fallback={null}>
            {organ.procedural ? (
              <FemaleReproductive targetSize={1.35} highlight />
            ) : (
              <OrganModel organ={organ} targetSize={1.35} highlight />
            )}
          </Suspense>`
);
sim = sim.replace(
  `export default function SimulationStage({
  simulation,
  stepIndex,
  playing,
  onStepIndex,
  onPlaying,
}: SimulationStageProps) {`,
  `export default function SimulationStage({
  simulation,
  stepIndex,
  playing,
  onStepIndex,
  onPlaying,
  sex = "male",
}: SimulationStageProps) {`
);
sim = sim.replace(
  "            <StageContent sim={simulation} stepIndex={stepIndex} playing={playing} />",
  "            <StageContent sim={simulation} stepIndex={stepIndex} playing={playing} sex={sex} />"
);
fs.writeFileSync("src/components/sim/SimulationStage.tsx", sim);
console.log("sim sex:", sim.includes("sex={sex}"), "| procedural:", sim.includes("organ.procedural"));

// ── PlanningWorkspace ──
let p = fs.readFileSync("src/components/planning/PlanningWorkspace.tsx", "utf8");
p = p.replace(
  `                  <SimulationStage
                    simulation={simulation}
                    stepIndex={stepIdx}
                    playing={playing}
                    onStepIndex={setStepIdx}
                    onPlaying={setPlaying}
                  />`,
  `                  <SimulationStage
                    simulation={simulation}
                    stepIndex={stepIdx}
                    playing={playing}
                    onStepIndex={setStepIdx}
                    onPlaying={setPlaying}
                    sex={detail.patient.gender === "女" ? "female" : "male"}
                  />`
);
fs.writeFileSync("src/components/planning/PlanningWorkspace.tsx", p);
console.log("workspace sex:", p.includes('gender === "女"'));
