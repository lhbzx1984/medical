// 图像生成代理（agnes-image-2.5-flash）。
// 学习中心「生成教学插图」与规划工作台的示意图生成共用此路由。
import { NextRequest } from "next/server";
import { agnesConfigured, agnesImage } from "@/lib/agnes";
import { getStore } from "@/lib/store";
import { ORGANS, matchOrgan } from "@/lib/organ-models";

export const maxDuration = 300;

interface ImageRequestBody {
  prompt: string;
  size?: string;
  ratio?: string;
  organId?: string;
  /** 学习插图模式：附加医学教学风格 */
  style?: "teaching" | "plain";
}

export async function POST(req: NextRequest) {
  let body: ImageRequestBody;
  try {
    body = (await req.json()) as ImageRequestBody;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || typeof body.prompt !== "string" || body.prompt.length > 4000 ||
      (body.organId !== undefined && (typeof body.organId !== "string" || body.organId.length > 100)) ||
      (body.size !== undefined && (typeof body.size !== "string" || body.size.length > 32)) ||
      (body.ratio !== undefined && (typeof body.ratio !== "string" || body.ratio.length > 32)) ||
      (body.style !== undefined && body.style !== "teaching" && body.style !== "plain")) {
    return Response.json({ error: "图像请求格式不正确或内容过长" }, { status: 400 });
  }
  const prompt = body.prompt.trim();
  if (!prompt) return Response.json({ error: "prompt 不能为空" }, { status: 400 });
  if (!agnesConfigured()) {
    return Response.json({ error: "AGNES_API_KEY 未配置" }, { status: 500 });
  }

  const store = await getStore();
  if (!store) return Response.json({ error: "请先登录" }, { status: 401 });

  const finalPrompt =
    body.style === "teaching" || body.organId
      ? [
          "医学科普教学插图：",
          prompt,
          body.organId ? `。主题器官：${ORGANS[matchOrgan(body.organId)].nameZh}` : "",
          "。要求：医学教育插画风格，解剖结构清晰准确、标注简洁（若含文字使用中文），配色柔和专业，白色或浅色背景，无血腥恐怖元素。",
        ].join("")
      : prompt;

  try {
    const result = await agnesImage({
      prompt: finalPrompt,
      size: body.size ?? "1K",
      ratio: body.ratio ?? "4:3",
    });
    const url = result.url ?? (result.b64 ? `data:image/png;base64,${result.b64}` : "");
    const saved = await store
      .addGeneratedImage({ prompt: finalPrompt, url, organId: body.organId })
      .catch(() => null);
    return Response.json({ url, id: saved?.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `图像生成失败：${msg}` }, { status: 502 });
  }
}
