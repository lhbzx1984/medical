"use client";

// 通用流式对话面板：对接 /api/chat（agnes-2.5-flash，SSE）。
// mode="learning" 为医学学习导师；mode="guidance" 为手术指导顾问。
// 学习模式额外提供「AI 生成教学插图」（agnes-image-2.5-flash）。
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatContext, ChatMode, ChatMsg } from "@/lib/types";
import { ORGANS, matchOrgan } from "@/lib/organ-models";

interface Msg extends ChatMsg {
  image?: string; // 生成的插图 URL
  error?: boolean;
}

export default function ChatPanel({
  mode,
  context,
  className,
  quickPrompts,
}: {
  mode: ChatMode;
  context?: ChatContext;
  className?: string;
  quickPrompts?: string[];
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [genImage, setGenImage] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // 流式增量更新时跟随最新消息。
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, streaming]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || streaming || genImage || abortRef.current) return;
    const history: Msg[] = [...msgs, { role: "user", content }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const payload = {
        mode, sessionId, context,
        messages: history.filter((m) => !m.error && m.content.trim()).slice(-24)
          .map(({ role, content: c }) => ({ role, content: c.slice(0, 12000) })),
      };
      // Keep the newest question while staying below the server's request byte limit.
      while (payload.messages.length > 1 && new TextEncoder().encode(JSON.stringify(payload)).byteLength > 120 * 1024) {
        payload.messages.shift();
      }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `请求失败 (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let completed = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() ?? "";
          for (const evt of events) {
            const line = evt.trim();
            if (!line.startsWith("data:")) continue;
            let payload: {
              delta?: string;
              done?: boolean;
              error?: string;
            };
            try {
              payload = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            if (payload.error) throw new Error(payload.error);
            if (payload.delta) {
              acc += payload.delta;
              setMsgs((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: acc };
                return next;
              });
            }
            if (payload.done) completed = true;
          }
        }
        if (!completed) throw new Error("回答意外中断，请重试");
      } finally {
        reader.releaseLock();
      }
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "AbortError"
          ? "（已停止生成）"
          : `⚠️ ${e instanceof Error ? e.message : String(e)}`;
      setMsgs((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = { role: "assistant", content: last?.content ? `${last.content}\n\n${msg}` : msg, error: true };
        return next;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const generateIllustration = async () => {
    if (genImage || streaming || abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const organ = context?.organId
      ? ORGANS[matchOrgan(context.organId)]
      : undefined;
    const prompt = organ
      ? `${organ.nameZh}（${organ.nameEn}）解剖教学插图：清晰展示其形态、位置与毗邻结构`
      : context?.organName
        ? `${context.organName} 解剖教学插图：清晰展示其形态、位置与毗邻结构`
        : "人体解剖概览教学插图：展示主要器官系统在体内的位置与分布";
    setGenImage(true);
    setMsgs((prev) => [
      ...prev,
      { role: "user", content: `🎨 生成教学插图：${prompt}` },
      { role: "assistant", content: "正在生成教学插图…" },
    ]);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          organId: context?.organId,
          style: "teaching",
          size: "1K",
          ratio: "4:3",
        }),
        signal: controller.signal,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "生成失败");
      setMsgs((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: `已生成教学插图：`, image: data.url };
        return next;
      });
    } catch (e) {
      setMsgs((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: e instanceof Error && e.name === "AbortError" ? "（已停止生成）"
            : `⚠️ 插图生成失败：${e instanceof Error ? e.message : String(e)}`,
          error: true,
        };
        return next;
      });
    } finally {
      setGenImage(false);
      abortRef.current = null;
    }
  };

  const contextLabel =
    mode === "guidance"
      ? context?.planTitle
        ? `病例上下文：${context.planTitle}`
        : "手术指导顾问"
      : context?.organName
        ? `当前结构：${context.organName}`
        : "AI 医学导师";

  return (
    <div className={`flex min-h-0 flex-col ${className ?? ""}`}>
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-[var(--line)] px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[15px]">{mode === "guidance" ? "🧑‍⚕️" : "🎓"}</span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-[var(--heading)]">
              {mode === "guidance" ? "手术指导顾问" : "AI 医学导师"}
            </div>
            <div className="truncate text-[10.5px] text-[var(--muted)]">{contextLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {mode === "learning" && (
            <button
              className="btn !px-2.5 !py-1 !text-[11.5px]"
              onClick={generateIllustration}
              disabled={genImage || streaming}
              title="生成教学插图"
            >
              {genImage ? "生成中…" : "🎨 生成插图"}
            </button>
          )}
          <button
            className="btn !px-2.5 !py-1 !text-[11.5px]"
            onClick={() => {
              if (!streaming && !genImage) {
                setMsgs([]);
                setSessionId(crypto.randomUUID());
              }
            }}
            disabled={streaming || genImage}
            title="清空对话"
          >
            清空
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
        {msgs.length === 0 && (
          <div className="mt-6 text-center">
            <div className="mb-2 text-3xl">{mode === "guidance" ? "🧑‍⚕️" : "🎓"}</div>
            <div className="mb-1 text-[13.5px] font-semibold text-[var(--heading)]">
              {mode === "guidance" ? "围绕当前病例，随时向顾问提问" : "向 AI 医学导师提问"}
            </div>
            <div className="mx-auto max-w-[280px] text-[12px] leading-5 text-[var(--muted)]">
              {mode === "guidance"
                ? "可以询问术式选择、风险控制、围术期处理等问题，回答将结合当前病例上下文。"
                : "问题会自动关联你正在浏览的 3D 结构，支持解剖、生理、临床关联等各类问题。"}
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5 px-2">
              {(quickPrompts ??
                (mode === "guidance"
                  ? ["这个术式的主要风险点有哪些？", "术中若遇到大出血如何处理？", "术后需要重点观察哪些指标？"]
                  : ["这个器官的血液供应来自哪里？", "它的毗邻结构有哪些，有什么临床意义？", "相关的常见疾病有哪些？"]
              )).map((q) => (
                <button
                  key={q}
                  className="chip !cursor-pointer hover:!border-[var(--accent)] hover:!text-[var(--heading)]"
                  onClick={() => send(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[92%] rounded-xl px-3 py-2 text-[13px] ${
                m.role === "user"
                  ? "bg-[var(--accent-2)] text-white"
                  : m.error
                    ? "border border-[var(--danger)]/50 bg-[var(--danger)]/10 text-[var(--danger)]"
                    : "panel-2"
              }`}
            >
              {m.role === "user" ? (
                <span className="whitespace-pre-wrap">{m.content}</span>
              ) : (
                <>
                  <div className="md-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || "…"}</ReactMarkdown>
                  </div>
                  {m.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.image}
                      alt="AI 生成的教学插图"
                      className="mt-2 w-full rounded-lg border border-[var(--line)]"
                    />
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        {(streaming || genImage) && (
          <div className="flex items-center gap-1.5 pl-1 text-[11.5px] text-[var(--muted)]">
            <span className="rec-dot text-[var(--accent)]">●</span> 智能体思考中…
            <button className="ml-1 underline hover:text-[var(--heading)]" onClick={() => abortRef.current?.abort()}>
              停止
            </button>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="border-t border-[var(--line)] p-2.5">
        <div className="flex items-end gap-2">
          <textarea
            className="textarea max-h-28 min-h-[40px] flex-1"
            rows={1}
            placeholder={
              mode === "guidance" ? "向手术指导顾问提问…" : "向 AI 医学导师提问…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <button
            className="btn btn-primary !px-3.5 !py-2"
            onClick={() => send(input)}
            disabled={streaming || genImage || !input.trim()}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
