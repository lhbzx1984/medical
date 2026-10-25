import type { Metadata } from "next";
import PlanningWorkspace from "@/components/planning/PlanningWorkspace";

export const metadata: Metadata = {
  title: "手术规划 · MedPlan Atlas",
  description: "病历输入 → AI 结构化规划 → 3D 模拟 → 专家反馈迭代",
};

export default function PlanningPage() {
  return <PlanningWorkspace />;
}
