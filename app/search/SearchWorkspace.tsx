"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { SearchHit } from "./search-core";

type SearchResponse = { count: number; results: SearchHit[] };
type Citation = { ref: string; label: string; url: string; kind: string; entryTitle: string };
type AskResponse = {
  mode: "ai-grounded" | "retrieval-only";
  answer: string;
  caveats?: string[];
  citations: Citation[];
  results: SearchHit[];
  notice?: string;
  error?: { message: string };
};

const domains = [
  ["", "全部知识域"], ["physics", "物理模拟"], ["engineering", "工程仿真"], ["control", "集成控制"],
  ["diagnostics", "诊断感知"], ["energy", "能量转化"], ["auxiliary", "辅机模拟"], ["data", "数据基座"],
  ["hmi", "人机交互"], ["integration", "总体集成"], ["ai-native", "智能原生"], ["facilities", "全球装置"],
] as const;
const types = [["", "全部类型"], ["work", "研究工作"], ["paper", "论文"], ["code", "代码"], ["tool", "工具"], ["device", "装置"], ["framework", "框架"]] as const;
const examples = ["EXL-50U 位形控制有哪些证据？", "DINA、MEQ 与实时控制的关系", "聚变诊断如何验证数字孪生？", "哪些工程工具具有公开代码？"];

export default function SearchWorkspace() {
  const [query, setQuery] = useState("EXL-50U");
  const [domain, setDomain] = useState("");
  const [type, setType] = useState("");
  const [citedOnly, setCitedOnly] = useState(true);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [message, setMessage] = useState("");
  const requestId = useRef(0);

  useEffect(() => { void runSearch("EXL-50U"); }, []);

  async function runSearch(nextQuery = query) {
    const current = ++requestId.current;
    setSearching(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ q: nextQuery, limit: "24", citedOnly: String(citedOnly) });
      if (domain) params.set("domain", domain);
      if (type) params.set("type", type);
      const response = await fetch(`/api/search?${params}`, { headers: { Accept: "application/json" } });
      const payload = await response.json() as SearchResponse & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "检索失败");
      if (current === requestId.current) setResults(payload.results);
    } catch (reason) {
      if (current === requestId.current) setMessage(reason instanceof Error ? reason.message : "检索失败，请稍后重试。");
    } finally {
      if (current === requestId.current) setSearching(false);
    }
  }

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    setAnswer(null);
    await runSearch();
  }

  async function ask() {
    if (query.trim().length < 2) return setMessage("请输入至少两个字符的问题。");
    setAsking(true);
    setAnswer(null);
    setMessage("");
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ question: query, filters: { domain: domain || undefined, type: type || undefined, citedOnly: true } }),
      });
      const payload = await response.json() as AskResponse;
      if (!response.ok && !payload.answer) throw new Error(payload.error?.message || "问答服务暂时不可用。");
      setAnswer(payload);
      if (payload.results?.length) setResults(payload.results);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "问答服务暂时不可用。");
    } finally {
      setAsking(false);
    }
  }

  return <div className="searchWorkspace">
    <form className="searchConsole" onSubmit={submitSearch} role="search">
      <label className="queryField">
        <span>检索或提出一个研究问题</span>
        <textarea value={query} onChange={(event) => setQuery(event.target.value.slice(0, 300))} maxLength={300} rows={2} placeholder="输入装置、工具、论文、控制任务或自然语言问题…" />
        <small>{query.length} / 300</small>
      </label>
      <div className="searchControls">
        <select aria-label="知识域" value={domain} onChange={(event) => setDomain(event.target.value)}>{domains.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="实体类型" value={type} onChange={(event) => setType(event.target.value)}>{types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label className="citedToggle"><input type="checkbox" checked={citedOnly} onChange={(event) => setCitedOnly(event.target.checked)} />仅显示有原始来源的记录</label>
        <button type="submit" disabled={searching}>{searching ? "检索中…" : "确定性检索"}</button>
        <button type="button" className="askButton" onClick={ask} disabled={asking}>{asking ? "证据合成中…" : "询问 FusionDigital"}</button>
      </div>
      <div className="queryExamples">{examples.map((example) => <button type="button" key={example} onClick={() => { setQuery(example); setAnswer(null); void runSearch(example); }}>{example}</button>)}</div>
    </form>

    {message && <p className="searchMessage" role="alert">{message}</p>}

    {answer && <section className="answerPanel" aria-live="polite">
      <header><div><p>GROUNDED ANSWER</p><h2>基于站内证据的回答</h2></div><span className={answer.mode === "ai-grounded" ? "aiMode" : "retrievalMode"}>{answer.mode === "ai-grounded" ? "AI 证据合成" : "确定性检索回退"}</span></header>
      <div className="answerText">{answer.answer.split("\n").map((line, index) => <p key={`${index}-${line.slice(0, 20)}`}>{line}</p>)}</div>
      {answer.notice && <p className="answerNotice">{answer.notice}</p>}
      {answer.caveats?.length ? <div className="answerCaveats"><b>边界与不确定性</b><ul>{answer.caveats.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      <div className="citationGrid">{answer.citations.map((citation) => <a key={`${citation.ref}-${citation.url}`} href={citation.url} target="_blank" rel="noreferrer"><b>{citation.ref}</b><span>{citation.label}</span><small>{citation.entryTitle}</small></a>)}</div>
    </section>}

    <section className="resultSection">
      <div className="resultHeader"><div><p>CURATED KNOWLEDGE</p><h2>检索结果</h2></div><span>{searching ? "…" : results.length} 条</span></div>
      {!searching && results.length === 0 ? <div className="emptyResults"><b>没有匹配记录</b><p>尝试减少筛选项，或使用英文缩写、装置名、代码名和论文题名。</p></div> : null}
      <div className="resultList">{results.map((result) => <article key={result.id}>
        <div className="resultMeta"><span>{typeLabel(result.entityType)}</span>{result.domains.map((item) => <i key={item}>{domainLabel(item)}</i>)}{result.year && <time>{result.year}</time>}</div>
        <h3><a href={result.route}>{result.title}</a></h3>
        <p>{result.excerpt}</p>
        {result.devices.length ? <div className="resultDevices">{result.devices.slice(0, 5).map((device) => <span key={device}>{device}</span>)}</div> : null}
        <footer><a href={result.route}>打开知识记录 ↗</a><span>{result.sources.length} 个来源</span>{result.evidenceLevel && <span>{result.evidenceLevel}</span>}{result.deploymentLevel && <span>{result.deploymentLevel}</span>}</footer>
        {result.sources.length ? <details><summary>查看原始来源</summary><div>{result.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>)}</div></details> : null}
      </article>)}</div>
    </section>
  </div>;
}

function typeLabel(value: SearchHit["entityType"]) {
  return ({ work: "研究工作", paper: "论文", code: "代码", tool: "工具", device: "装置", framework: "集成框架" } as const)[value];
}
function domainLabel(value: string) {
  return Object.fromEntries(domains)[value] || value;
}
