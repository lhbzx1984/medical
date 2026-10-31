/** 共享站立坐标系里的人体高度（米）：等于精细图谱皮肤的顶部，器官注册表（organ-models.ts）按这个坐标系取值。 */
export const REFERENCE_BODY_HEIGHT = 1.719;

/** 将参考体表包围盒适配到现有人体场景，脚底 y=0、头顶 y=REFERENCE_BODY_HEIGHT。 */
export function fitReferenceBody(min: readonly number[], max: readonly number[], height = REFERENCE_BODY_HEIGHT) {
  const size = max[1] - min[1];
  if (!Number.isFinite(size) || size <= 0) throw new Error("Invalid reference body bounds");
  return {
    scale: height / size,
    position: [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2] as [number, number, number],
  };
}
