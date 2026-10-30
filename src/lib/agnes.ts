// Agnes API 服务端集成层。
// ⚠️ 本文件只能在 Next.js 服务端（API Route / Server Component）中使用，
//    API Key 通过环境变量注入，绝不能打包进浏览器代码。
import type { ChatMsg } from "./types";

export const AGNES_BASE_URL =
  process.env.AGNES_API_BASE_URL ?? "https://apihub.agnes-ai.com";

/** 文本对话模型 */
export const CHAT_MODEL = "agnes-2.5-flash";
/** 图像生成模型 */
export const IMAGE_MODEL = "agnes-image-2.5-flash";

export function agnesConfigured(): boolean {
  return Boolean(process.env.AGNES_API_KEY);
}

function authHeaders(): Record<string, string> {
  const key = process.env.AGNES_API_KEY;
  if (!key) {
    throw new AgnesError("AGNES_API_KEY 未配置，请在 .env.local 中设置", 500);
  }
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export class AgnesError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

// ─── Chat Completions（agnes-2.5-flash，OpenAI 兼容）────────────────────────

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(240_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function providerJson(res: Response): Promise<Record<string, unknown>> {
  let data: unknown;
  try { data = await res.json(); }
  catch (error) {
    if (error instanceof SyntaxError) throw new AgnesError("Agnes 返回了无效的 JSON 数据");
    throw error;
  }
  if (!isObject(data)) throw new AgnesError("Agnes 返回了无效的数据结构");
  if (data.error) throw new AgnesError("Agnes 服务返回错误，请稍后重试");
  return data;
}

/** 发起流式对话请求，返回上游 Response（SSE），由调用方转发或解析。 */
export async function agnesChatStream(
  messages: ChatMsg[],
  opts: ChatOptions = {}
): Promise<Response> {
  const res = await fetch(`${AGNES_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      stream: true,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4096,
    }),
    signal: requestSignal(opts.signal),
  });
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    throw new AgnesError(`对话服务暂不可用（上游 ${res.status}）`);
  }
  return res;
}

/** 非流式对话，返回完整文本。 */
export async function agnesChat(messages: ChatMsg[], opts: ChatOptions = {}): Promise<string> {
  const res = await fetch(`${AGNES_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 4096,
    }),
    signal: requestSignal(opts.signal),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new AgnesError(`对话服务暂不可用（上游 ${res.status}）`);
  }
  const data = await providerJson(res);
  const choice = Array.isArray(data.choices) ? data.choices[0] : undefined;
  const message = isObject(choice) ? choice.message : undefined;
  const content = isObject(message) ? message.content : undefined;
  if (typeof content !== "string" || !content.trim()) throw new AgnesError("Agnes Chat 返回了空内容");
  return content;
}

/**
 * 解析上游 OpenAI 兼容 SSE 流，逐段产出文本增量。
 */
export async function* iterateAgnesDelta(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) throw new AgnesError("回答意外中断，请重试");
      buffer += decoder.decode(value, { stream: true });
      // SSE 事件以空行分隔
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (const evt of events) {
        for (const line of evt.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") return;
          if (!payload) continue;
          let json: unknown;
          try { json = JSON.parse(payload); }
          catch { throw new AgnesError("对话服务返回了无效的流式数据"); }
          if (!isObject(json)) throw new AgnesError("对话服务返回了无效的流式结构");
          if (json.error) throw new AgnesError("对话服务返回错误，请稍后重试");
          if (!Array.isArray(json.choices)) throw new AgnesError("对话服务返回了无效的流式结构");
          const choice = json.choices[0];
          if (choice !== undefined && !isObject(choice)) throw new AgnesError("对话服务返回了无效的流式结构");
          const deltaObject = isObject(choice) ? choice.delta : undefined;
          if (deltaObject != null && !isObject(deltaObject)) throw new AgnesError("对话服务返回了无效的流式结构");
          const delta = isObject(deltaObject) ? deltaObject.content : undefined;
          if (delta != null && typeof delta !== "string") throw new AgnesError("对话服务返回了无效的文本增量");
          if (typeof delta === "string" && delta) yield delta;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// ─── 结构化 JSON 输出 ────────────────────────────────────────────────────────

/** 提取模型回复中的 JSON（容忍 ```json 代码围栏与前后解释文字）。 */
export function extractJson<T>(text: string): T {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new AgnesError("模型输出中未找到 JSON 对象");
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

/** 要求模型输出 JSON 并解析。 */
export async function agnesChatJSON<T>(
  messages: ChatMsg[],
  opts: ChatOptions = {}
): Promise<T> {
  const text = await agnesChat(messages, { ...opts, temperature: opts.temperature ?? 0.2 });
  try {
    return extractJson<T>(text);
  } catch {
    throw new AgnesError("AI 未返回有效的 JSON 方案，请重新生成");
  }
}

// ─── Image Generations（agnes-image-2.5-flash）──────────────────────────────

export interface ImageRequest {
  prompt: string;
  /** 推荐档位: 1K / 2K / 3K / 4K，也兼容 1024x768 这类精确尺寸 */
  size?: string;
  /** 1:1 | 3:4 | 4:3 | 16:9 | 9:16 | 2:3 | 3:2 | 21:9 */
  ratio?: string;
  /** 图生图 / 多图合成：输入图像 URL 或 Data URI */
  images?: string[];
  /** 需要 Base64 返回时为 true */
  returnBase64?: boolean;
}

export interface ImageResult {
  url?: string;
  b64?: string;
}

export async function agnesImage(req: ImageRequest, signal?: AbortSignal): Promise<ImageResult> {
  const extraBody: Record<string, unknown> = {};
  if (req.images?.length) extraBody.image = req.images;
  extraBody.response_format = req.returnBase64 ? "b64_json" : "url";

  const res = await fetch(`${AGNES_BASE_URL}/v1/images/generations`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt: req.prompt,
      size: req.size ?? "1K",
      ...(req.ratio ? { ratio: req.ratio } : {}),
      extra_body: extraBody,
    }),
    // 图像生成可能需要数十秒
    signal: requestSignal(signal),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new AgnesError(`图像服务暂不可用（上游 ${res.status}）`);
  }
  const data = await providerJson(res);
  const item = Array.isArray(data.data) ? data.data[0] : undefined;
  const url = isObject(item) && typeof item.url === "string" ? item.url.trim() : "";
  const b64 = isObject(item) && typeof item.b64_json === "string" ? item.b64_json.trim() : "";
  if (!url && !b64) {
    throw new AgnesError("Agnes Image 未返回图像数据");
  }
  if (url) {
    let parsed: URL;
    try { parsed = new URL(url); }
    catch { throw new AgnesError("Agnes Image 返回了无效的图像地址"); }
    if (!["https:", "http:"].includes(parsed.protocol)) throw new AgnesError("Agnes Image 返回了不支持的图像地址协议");
  }
  if (b64 && (b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64))) {
    throw new AgnesError("Agnes Image 返回了无效的 Base64 数据");
  }
  return { url: url || undefined, b64: b64 || undefined };
}
