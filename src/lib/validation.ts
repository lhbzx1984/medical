import { ORGAN_IDS, type StructuredPlan } from "./types";
import { normalizeRegion } from "./organ-models";

export class ValidationError extends Error {
  readonly status = 400;
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("请求或结果必须是 JSON 对象");
  }
  return value as Record<string, unknown>;
}

export function textField(
  body: Record<string, unknown>, key: string, max = 2000, optional = false
): string {
  const value = body[key];
  if (optional && value === undefined) return "";
  if (typeof value !== "string" || (!optional && !value.trim()) || value.length > max) {
    throw new ValidationError(`${key} 必须是${optional ? "" : "非空"}字符串，且不超过 ${max} 字`);
  }
  return value.trim();
}

export function integerField(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} 必须是 ${min} 到 ${max} 的整数`);
  }
  return value;
}

export function enumField(value: unknown, allowed: readonly string[], name: string): string {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ValidationError(`${name} 的取值不受支持`);
  }
  return value;
}

export function stringList(value: unknown, name: string, max = 40, itemMax = 1000): string[] {
  if (!Array.isArray(value) || value.length > max) throw new ValidationError(`${name} 必须是最多 ${max} 项的数组`);
  return value.map((item) => textField({ item }, "item", itemMax));
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const reader = req.body?.getReader();
  if (!reader) throw new ValidationError("请求体不能为空");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128 * 1024) {
        await reader.cancel();
        throw new ValidationError("请求体不能超过 128 KB");
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder().decode(joined)); }
    catch { throw new ValidationError("请求体不是合法 JSON"); }
    return object(parsed);
  } finally { reader.releaseLock(); }
}

/** 生成、修订和历史文档共用边界校验，错误结构不得成为有效版本。 */
export function normalizePlan(value: unknown): StructuredPlan {
  const raw = object(value);
  if (!Array.isArray(raw.steps) || !raw.steps.length || raw.steps.length > 12) {
    throw new ValidationError("方案必须包含 1 到 12 个完整步骤");
  }
  if (!Array.isArray(raw.risks) || raw.risks.length > 12) throw new ValidationError("risks 必须是数组");
  const focusOrgan = enumField(textField(raw, "focusOrgan", 100).toLowerCase(), ORGAN_IDS, "focusOrgan");
  return {
    summary: textField(raw, "summary", 6000),
    diagnosis: textField(raw, "diagnosis", 4000),
    procedureName: textField(raw, "procedureName", 300),
    anesthesia: textField(raw, "anesthesia", 2000),
    position: textField(raw, "position", 2000),
    approach: textField(raw, "approach", 2000),
    region: normalizeRegion(textField(raw, "region", 100), focusOrgan),
    focusOrgan,
    instruments: stringList(raw.instruments, "instruments", 40),
    steps: raw.steps.map((step, i) => {
      const s = object(step);
      return { index: i + 1, name: textField(s, "name", 300), detail: textField(s, "detail", 6000),
        duration: textField(s, "duration", 200, true), risk: textField(s, "risk", 3000, true),
        keyPoints: stringList(s.keyPoints, "keyPoints", 20) };
    }),
    risks: raw.risks.map((item) => {
      const r = object(item);
      return { risk: textField(r, "risk", 3000), mitigation: textField(r, "mitigation", 4000) };
    }),
    postop: stringList(raw.postop, "postop", 40),
    simulationNotes: textField(raw, "simulationNotes", 6000, true),
  };
}
