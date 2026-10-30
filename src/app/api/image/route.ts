// 图像生成代理（agnes-image-2.5-flash）。
// 学习中心「生成教学插图」与规划工作台的示意图生成共用此路由。
import { NextRequest } from "next/server";
import { agnesConfigured, agnesImage } from "@/lib/agnes";
import { ORGANS, matchOrgan } from "@/lib/organ-models";
import { apiError, ApiError, assertSameOrigin, requireStore } from "@/lib/http";
import { readJson, textField, enumField } from "@/lib/validation";
import { ORGAN_IDS } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const store = await requireStore();
    const body = await readJson(req);
    const prompt = textField(body, "prompt", 4000);
    const size = enumField(body.size ?? "1K", ["1K", "2K", "3K", "4K"], "size");
    const ratio = enumField(body.ratio ?? "4:3", ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"], "ratio");
    const organId = body.organId === undefined ? undefined : enumField(body.organId, ORGAN_IDS, "organId");
    const style = enumField(body.style ?? "plain", ["teaching", "plain"], "style");
    if (!agnesConfigured()) throw new ApiError("AGNES_API_KEY 未配置", 503);
    if (!(await store.consumeAiQuota("image"))) throw new ApiError("请求过于频繁，请稍后再试", 429);
    const finalPrompt = style === "teaching" || organId
      ? [
          "医学科普教学插图：",
          prompt,
          organId ? `。主题器官：${ORGANS[matchOrgan(organId)].nameZh}` : "",
          "。要求：医学教育插画风格，解剖结构清晰准确、标注简洁（若含文字使用中文），配色柔和专业，白色或浅色背景，无血腥恐怖元素。",
        ].join("")
      : prompt;

    const result = await agnesImage({
      prompt: finalPrompt,
      size,
      ratio,
    }, req.signal);
    const url = result.url ?? (result.b64 ? `data:image/png;base64,${result.b64}` : "");
    req.signal.throwIfAborted();
    // 图片已生成并计费；记录历史失败时仍返回图片。
    const saved = await store.addGeneratedImage({ prompt: finalPrompt, url, organId }).catch(() => null);
    return Response.json({ url, id: saved?.id });
  } catch (error) { return apiError(error); }
}
