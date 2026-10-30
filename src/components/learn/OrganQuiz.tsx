"use client";
import { useCallback, useEffect, useState } from "react";
import { ORGANS } from "@/lib/organ-models";
import { quizQuestion, type QuizKind } from "@/lib/quiz";
import type { OrganId } from "@/lib/types";

type Attempt = { organ_id: OrganId; question_type: QuizKind; answer: string; correct: boolean; created_at: string };
export default function OrganQuiz({ organId, onClose }: { organId: OrganId; onClose: () => void }) {
  const [kind, setKind] = useState<QuizKind>("system");
  const [question, setQuestion] = useState<{ question: string; options: string[] } | null>(null);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{ correct: boolean; answer: string } | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const history = useCallback(async () => {
    const res = await fetch("/api/learning/quiz?history=1");
    const data = await res.json() as { attempts?: Attempt[]; error?: string };
    if (!res.ok) throw new Error(data.error ?? "加载记录失败");
    setAttempts(data.attempts ?? []);
  }, []);
  useEffect(() => {
    let active = true;
    fetch(`/api/learning/quiz?organ=${encodeURIComponent(organId)}&kind=${kind}`)
      .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error ?? "加载失败"); return data; })
      .then((data) => { if (active) setQuestion(data); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "加载失败"); });
    return () => { active = false; };
  }, [organId, kind]);
  useEffect(() => {
    let active = true;
    fetch("/api/learning/quiz?history=1")
      .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error ?? "加载记录失败"); return data; })
      .then((data) => { if (active) setAttempts(data.attempts ?? []); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "加载记录失败"); });
    return () => { active = false; };
  }, []);
  async function submit() {
    if (!answer || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/learning/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organ: organId, kind, answer }) });
      const data = await res.json() as { correct: boolean; answer: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "提交失败");
      setResult(data); await history();
    } catch (err) { setError(err instanceof Error ? err.message : "提交失败"); } finally { setBusy(false); }
  }
  function chooseKind(next: QuizKind) { if (next === kind || busy) return; setQuestion(null); setAnswer(""); setResult(null); setError(""); setKind(next); }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="quiz-title" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <div className="panel max-h-[90vh] w-full max-w-xl overflow-y-auto p-5">
      <div className="mb-4 flex items-center justify-between"><h2 id="quiz-title" className="text-lg font-semibold">{ORGANS[organId].nameZh} · 学习自测</h2><button autoFocus className="btn" onClick={onClose}>关闭</button></div>
      <div className="mb-4 flex gap-2"><button className="btn" disabled={busy} aria-pressed={kind === "system"} onClick={() => chooseKind("system")}>系统归属</button><button className="btn" disabled={busy} aria-pressed={kind === "english"} onClick={() => chooseKind("english")}>英文名称</button></div>
      {error && <p className="mb-3 text-red-400" role="alert">{error}</p>}
      {question && <fieldset disabled={!!result || busy}><legend className="mb-3 font-semibold">{question.question}</legend>
        {question.options.map((option) => <label key={option} className="mb-2 flex items-center gap-2"><input type="radio" name="quiz-answer" value={option} checked={answer === option} onChange={() => setAnswer(option)} />{option}</label>)}
      </fieldset>}
      {!result && <button className="btn btn-primary mt-3" onClick={() => void submit()} disabled={!answer || busy}>{busy ? "保存中…" : "提交答案"}</button>}
      {result && <div className="panel-2 mt-3 p-3" role="status">{result.correct ? "回答正确" : `回答有误，正确答案：${result.answer}`}</div>}
      <div className="mt-5 border-t border-[var(--line)] pt-3"><h3 className="font-semibold">最近练习（最多 200 条）</h3>
        <p className="mt-1 text-sm">已答 {attempts.length} 题 · 错误 {attempts.filter((a) => !a.correct).length} 题</p>
        <ul className="mt-2 space-y-1 text-sm">{attempts.filter((a) => !a.correct).slice(0, 8).map((item, index) => {
          const q = quizQuestion(item.organ_id, item.question_type);
          return <li key={`${item.created_at}-${index}`}>{q?.question ?? "练习题"} 你的答案：{item.answer}；正确答案：{q?.answer ?? "—"}</li>;
        })}</ul>
      </div>
    </div>
  </div>;
}
