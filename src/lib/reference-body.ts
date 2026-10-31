/** 将参考体表包围盒适配到现有人体场景，脚底 y=0、头顶 y=1.78。 */
export function fitReferenceBody(min: readonly number[], max: readonly number[]) {
  const height = max[1] - min[1];
  if (!Number.isFinite(height) || height <= 0) throw new Error("Invalid reference body bounds");
  return {
    scale: 1.78 / height,
    position: [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2] as [number, number, number],
  };
}
