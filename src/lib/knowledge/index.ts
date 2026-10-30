// 手术知识库接口（预留）。
//
// 设计目标：手术规划生成前对知识库做检索增强（RAG）。上层（/api/plans/[id]/generate
// 与 feedback）只依赖 KnowledgeRetriever 接口，检索实现可随时替换：
//
//   1. KeywordRetriever   —— 当前默认实现：对知识条目做词项重叠评分（无外部依赖）
//   2. VectorRetriever    —— 预留：Supabase pgvector / Agnes embedding 检索
//                            （实现 retrieve() 并在 getRetriever() 中注册即可，
//                              表 knowledge_entries 已预留 embedding vector 列）
//   3. ExternalRAGRetriever —— 预留：对接外部 RAG 服务（HTTP）
import type { KnowledgeEntry } from "../types";
import type { DataStore } from "../store/base";

export interface KnowledgeQuery {
  text: string;
  /** 可选：限定相关器官/术式关键词 */
  organ?: string;
  topK?: number;
}

export interface KnowledgeRetriever {
  readonly name: string;
  retrieve(query: KnowledgeQuery): Promise<KnowledgeEntry[]>;
}

const STOPWORDS = new Set([
  "的","了","在","是","与","和","及","或","对","向","从","被","将","已","并","等","请","需",
  "患者","病人","手术","进行","使用","可能","出现","明显","相关","治疗","检查",
  "the","a","an","of","in","on","for","to","with","and","or","is","are","be","by",
]);

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // 英文/数字词
  for (const w of text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []) tokens.push(w);
  // 中文 2-gram（简单且无需词典）
  const zh = text.replace(/[^\u4e00-\u9fff]/g, "");
  for (let i = 0; i < zh.length - 1; i++) tokens.push(zh.slice(i, i + 2));
  return tokens.filter((t) => !STOPWORDS.has(t));
}

/** 默认实现：关键词重叠评分检索（无向量依赖，演示开箱即用） */
export class KeywordRetriever implements KnowledgeRetriever {
  readonly name = "keyword-v1";
  constructor(private store: DataStore) {}

  async retrieve(query: KnowledgeQuery): Promise<KnowledgeEntry[]> {
    const all = (await this.store.listKnowledge()).filter((entry) => entry.reviewStatus === "approved");
    if (!all.length) return [];

    const qTokens = new Set([...tokenize(query.text), ...tokenize(query.organ ?? "")]);
    const scored = all.map((entry) => {
      const entryTokens = [
        ...tokenize(entry.title),
        ...tokenize(entry.content),
        ...tokenize(entry.tags.join(" ")),
      ];
      let hits = 0;
      for (const t of entryTokens) if (qTokens.has(t)) hits++;
      // 标题命中加权
      const titleBoost = tokenize(entry.title).some((t) => qTokens.has(t)) ? 4 : 0;
      return { entry, score: hits + titleBoost };
    });
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, query.topK ?? 4)
      .map((s) => s.entry);
  }
}

// 预留注册表：新增检索实现后在此登记，通过 KNOWLEDGE_RETRIEVER 环境变量切换。
const REGISTRY: Record<string, (store: DataStore) => KnowledgeRetriever> = {
  keyword: (store) => new KeywordRetriever(store),
  // vector: () => new VectorRetriever(),   // TODO: pgvector / Agnes embedding
};

export function getRetriever(store: DataStore): KnowledgeRetriever {
  const name = process.env.KNOWLEDGE_RETRIEVER ?? "keyword";
  const factory = REGISTRY[name] ?? REGISTRY.keyword;
  return factory(store);
}
