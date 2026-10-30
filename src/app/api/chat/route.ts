// 流式对话代理（agnes-2.5-flash）。
// 两种角色：learning = 医学学习导师；guidance = 手术指导顾问。
// API Key 仅在服务端使用；对话记录写入数据存储（Supabase 或演示存储）。
import { NextRequest } from "next/server";
import { agnesChatStream, agnesConfigured, iterateAgnesDelta, AgnesError } from "@/lib/agnes";
import { getStore } from "@/lib/store";
import { ORGANS, matchOrgan } from "@/lib/organ-models";
import type { ChatContext, ChatMsg } from "@/lib/types";
import { ORGAN_IDS } from "@/lib/types";
import { requireActor } from "@/lib/auth";
import { apiError, ApiError, limitAction } from "@/lib/http";
import { readJson, object, textField, integerField, enumField } from "@/lib/validation";

export const maxDuration = 300;

function learningSystem(ctx: ChatContext): string {
  const organ = ctx.organId ? ORGANS[matchOrgan(ctx.organId)] : undefined;
  const sceneText = organ
    ? `学生正在 3D 模型中学习「${organ.nameZh}（${organ.nameEn}，属${organ.system}）」。${organ.brief}\n回答时可引用 3D 模型中的方位描述（如上/下、前/后、内/外），帮助学生对照模型理解。`
    : ctx.organName
      ? `学生正在精细人体图谱中选中了结构「${ctx.organName}」（BodyParts3D 英文命名），请结合该结构讲解其解剖归属、毗邻与临床意义。`
      : "学生正在浏览人体 3D 解剖模型。";
  return [
    "你是「Atlas 医学导师」，一位耐心、严谨的医学院解剖学与外科学教授，面向医学本科生和低年资住院医师授课。",
    "回答要求：",
    "- 使用简体中文；重要解剖/术学术语首次出现时附英文原词。",
    "- 结构化输出：善用小标题、有序列表和表格；解释机制时先总后分。",
    "- 循序善诱：回答末尾可给出 1-2 个值得继续追问的思考题。",
    "- 教学严谨性：内容遵循经典解剖学/外科学教材共识；存在学术争议时说明。",
    "- 安全提示：涉及临床决策的内容需注明「仅供教学参考，临床以指南与带教医师意见为准」。",
    `\n当前学习场景：${sceneText}`,
  ].join("\n");
}

function guidanceSystem(ctx: ChatContext): string {
  return [
    "你是「手术指导顾问」，一名资深外科主任医师的 AI 助手，协助医生围绕当前病例讨论手术策略、风险与围术期处理。",
    "回答要求：",
    "- 使用简体中文，专业、克制、条理清晰；给出临床推理过程而不只是结论。",
    "- 结合下面提供的病例与方案上下文作答；上下文不足时先列出还需补充的信息。",
    "- 主动提示风险点与需要 MDT（多学科会诊）讨论的情形。",
    "- 每次回答末尾用一行「⚠️ 提醒：」注明本回答仅供决策参考，最终以主刀医师与 MDT 讨论为准。",
    ctx.planSummary
      ? `\n【当前病例上下文】\n${ctx.planTitle ?? ""}\n${ctx.planSummary}`
      : "\n【当前病例上下文】（暂无，可询问病例细节）",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    const body = await readJson(req);
    const mode = enumField(body.mode ?? "learning", ["learning", "guidance"], "mode") as "learning" | "guidance";
    if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 24) {
      throw new ApiError("messages 必须包含 1 到 24 条消息", 400);
    }
    const history: ChatMsg[] = body.messages.map((value) => {
      const m = object(value);
      return { role: enumField(m.role, ["user", "assistant"], "role") as "user" | "assistant",
        content: textField(m, "content", 12000) };
    });
    const lastUser = history[history.length - 1];
    if (lastUser.role !== "user") throw new ApiError("最后一条消息必须是用户提问", 400);
    const sessionId = textField(body, "sessionId", 100, true) || crypto.randomUUID();
    const rawContext = body.context === undefined ? {} : object(body.context);
    let context: ChatContext;
    const store = getStore();
    if (mode === "guidance") {
      const planId = textField(rawContext, "planId", 100);
      const detail = await store.getPlanDetail(planId, actor.id);
      if (!detail) throw new ApiError("未找到该病例或无权访问", 404);
      const versionNo = rawContext.planVersion === undefined ? detail.plan.currentVersion
        : integerField(rawContext.planVersion, 0, Number.MAX_SAFE_INTEGER, "planVersion");
      const version = detail.versions.find((v) => v.version === versionNo);
      if (versionNo && !version) throw new ApiError("未找到该方案版本", 404);
      context = { planId, planVersion: versionNo, planTitle: `${detail.plan.title}（v${versionNo}）`,
        planSummary: version ? JSON.stringify(version.content) : detail.patient.medicalRecord };
    } else {
      context = { organName: textField(rawContext, "organName", 300, true),
        organId: rawContext.organId === undefined ? undefined : enumField(rawContext.organId, ORGAN_IDS, "organId") };
    }
    if (!agnesConfigured()) throw new ApiError("AGNES_API_KEY 未配置，请配置后重启服务", 503);
    await limitAction(store, actor.id, "chat", 20);
    await store.ensureChatSession(sessionId, mode, lastUser.content.slice(0, 30), actor.id);
    const abort = new AbortController();
    const signal = AbortSignal.any([req.signal, abort.signal]);
    const system = mode === "learning" ? learningSystem(context) : guidanceSystem(context);
    const upstream = await agnesChatStream([{ role: "system", content: system }, ...history],
      { temperature: 0.7, maxTokens: 4096, signal });
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        let assistantText = "";
        try {
          for await (const delta of iterateAgnesDelta(upstream)) {
            if (cancelled) break;
            assistantText += delta;
            if (assistantText.length > 64000) throw new AgnesError("对话服务返回内容过长");
            send({ delta });
          }
          if (!cancelled) {
            signal.throwIfAborted();
            if (!assistantText.trim()) throw new AgnesError("对话服务返回了空回答，请重试");
            await store.addChatMessages(sessionId, [
              { role: "user", content: lastUser.content }, { role: "assistant", content: assistantText },
            ], actor.id);
            send({ done: true });
          }
        } catch (error) {
          if (!cancelled) send({ error: error instanceof AgnesError ? error.message
            : error instanceof Error && error.name === "TimeoutError" ? "对话服务响应超时，请重试"
            : "回答中断或保存失败，请重试" });
        } finally {
          if (!cancelled) controller.close();
        }
      },
      cancel() { cancelled = true; abort.abort(); },
    });
    return new Response(stream, { headers: {
      "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform",
    } });
  } catch (error) { return apiError(error); }
}
