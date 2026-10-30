import { getStore } from "@/lib/store";
import { quizQuestion } from "@/lib/quiz";

export async function GET(req: Request) {
  const store = await getStore();
  if (!store) return Response.json({ error: "请先登录" }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.get("history") === "1") return Response.json({ attempts: await store.listLearningAttempts() });
  const organ = url.searchParams.get("organ") ?? "";
  const kind = url.searchParams.get("kind") ?? "";
  const q = quizQuestion(organ, kind);
  if (!q) return Response.json({ error: "未知的器官或题型" }, { status: 400 });
  return Response.json({ question: q.question, options: q.options });
}

export async function POST(req: Request) {
  const store = await getStore();
  if (!store) return Response.json({ error: "请先登录" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.organ !== "string" || typeof body.kind !== "string" || typeof body.answer !== "string")
    return Response.json({ error: "答案格式不正确" }, { status: 400 });
  const q = quizQuestion(body.organ, body.kind);
  if (!q || !q.options.includes(body.answer)) return Response.json({ error: "答案不在选项中" }, { status: 400 });
  const correct = body.answer === q.answer;
  await store.addLearningAttempt(body.organ, body.kind, body.answer, correct);
  return Response.json({ correct, answer: q.answer });
}
