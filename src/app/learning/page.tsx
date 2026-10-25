import type { Metadata } from "next";
import LearningCenter from "@/components/learn/LearningCenter";

export const metadata: Metadata = {
  title: "学习中心 · MedPlan Atlas",
  description: "3D 解剖浏览与 AI 医学导师问答",
};

export default function LearningPage() {
  return <LearningCenter />;
}
