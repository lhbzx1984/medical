import { ORGAN_LIST, ORGANS } from "./organ-models";
import type { OrganId } from "./types";

export type QuizKind = "system" | "english";
export function quizQuestion(organId: string, kind: string) {
  if (!Object.hasOwn(ORGANS, organId) || (kind !== "system" && kind !== "english")) return null;
  const organ = ORGANS[organId as OrganId];
  const answer = kind === "system" ? organ.system : organ.nameEn;
  const values = [...new Set(ORGAN_LIST.map((item) => kind === "system" ? item.system : item.nameEn))];
  const distractors = values.filter((value) => value !== answer).slice(0, 3);
  const options = [...distractors, answer].sort((a, b) => a.localeCompare(b));
  return { question: kind === "system" ? `${organ.nameZh}在本图谱中属于哪个系统？` : `${organ.nameZh}的英文名称是什么？`, options, answer };
}
