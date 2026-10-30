// 流式对话代理（agnes-2.5-flash）。
// 两种角色：learning = 医学学习导师；guidance = 手术指导顾问。
// API Key 仅在服务端使用；对话记录写入数据存储（Supabase 或演示存储）。
import { NextRequest } from "next/server";
import { agnesChatStream, agnesConfigured, iterateAgnesDelta, AgnesError } from "@/lib/agnes";
import { getStore } from "@/lib/store";
import { ORGANS, matchOrgan } from "@/lib/organ-models";
import type { ChatContext, ChatMsg } from "@/lib/types";

export const maxDuration = 300;

interface ChatRequestBody {
  mode?: "learning" | "guidance";
  sessionId?: string;
  messages: ChatMsg[];
  context?: ChatContext;
}

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
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !Array.isArray(body.messages) ||
      body.messages.length > 100 || body.messages.some((m) => !m ||
        (m.role !== "user" && m.role !== "assistant") ||
        typeof m.content !== "string" || m.content.length > 16000) ||
      (body.sessionId !== undefined && (typeof body.sessionId !== "string" || body.sessionId.length > 128)) ||
      (body.context !== undefined && (!body.context || typeof body.context !== "object" || Array.isArray(body.context) ||
        Object.values(body.context).some((v) => typeof v !== "string" || v.length > 16000)))) {
    return Response.json({ error: "对话请求格式不正确或内容过长" }, { status: 400 });
  }

  const mode = body.mode === "guidance" ? "guidance" : "learning";
  const history = (body.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-24); // 控制上下文长度

  if (!history.length) {
    return Response.json({ error: "messages 不能为空" }, { status: 400 });
  }
  if (!agnesConfigured()) {
    return Response.json(
      { error: "AGNES_API_KEY 未配置：请在 .env.local 中设置后重启服务" },
      { status: 500 }
    );
  }

  const system = mode === "learning" ? learningSystem(body.context ?? {}) : guidanceSystem(body.context ?? {});
  const payload: ChatMsg[] = [{ role: "system", content: system }, ...history];

  // 持久化（不阻塞主流程的错误）
  const store = await getStore();
  if (!store) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!(await store.consumeAiQuota("chat"))) {
    return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  const sessionId = body.sessionId;
  const lastUser = [...history].reverse().find((m) => m.role === "user");

  const upstream = await agnesChatStream(payload, { temperature: 0.7, maxTokens: 4096 });

  const encoder = new TextEncoder();
  let assistantText = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of iterateAgnesDelta(upstream)) {
          assistantText += delta;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (e) {
        const msg = e instanceof AgnesError ? e.message : "流式响应中断";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
      } finally {
        controller.close();
        if (sessionId && lastUser) {
          store
            .ensureChatSession(sessionId, mode, lastUser.content.slice(0, 30))
            .then(() =>
              store.addChatMessages(sessionId, [
                { role: "user", content: lastUser.content },
                { role: "assistant", content: assistantText },
              ])
            )
            .catch(() => {});
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
