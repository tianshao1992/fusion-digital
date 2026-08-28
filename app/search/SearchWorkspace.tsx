"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useAgentWorkspace } from "@/app/components/agent-workspace/AgentWorkspace";
import { useI18n } from "@/app/i18n";
import { trackAnalyticsContent } from "@/app/analytics/client";
import type { SearchHit } from "./search-core";

type SearchResponse = { count: number; results: SearchHit[] };

const domainValues = ["", "physics", "engineering", "control", "diagnostics", "energy", "auxiliary", "data", "hmi", "integration", "ai-native", "facilities"] as const;
const typeValues = ["", "work", "paper", "code", "tool", "device", "framework"] as const;

export default function SearchWorkspace() {
  const { locale } = useI18n();
  const agentWorkspace = useAgentWorkspace();
  const copy = locale === "en" ? EN : ZH;
  const examples = copy.examples;
  const [query, setQuery] = useState("EXL-50U");
  const [domain, setDomain] = useState("");
  const [type, setType] = useState("");
  const [citedOnly, setCitedOnly] = useState(true);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const requestId = useRef(0);

  // Re-project the initial result set whenever the UI language changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void runSearch(query); }, [locale]);

  async function runSearch(nextQuery = query) {
    const current = ++requestId.current;
    setSearching(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ q: nextQuery, limit: "24", citedOnly: String(citedOnly), locale });
      if (domain) params.set("domain", domain);
      if (type) params.set("type", type);
      const response = await fetch(`/api/search?${params}`, { headers: { Accept: "application/json", "X-FusionDigital-Locale": locale } });
      const payload = await response.json() as SearchResponse & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || copy.searchFailed);
      if (current === requestId.current) {
        setResults(payload.results);
        const resultBucket = payload.results.length === 0 ? "0" : payload.results.length < 5 ? "1-4" : payload.results.length < 15 ? "5-14" : "15+";
        trackAnalyticsContent(
          "search",
          `domain=${domain || "all"}|type=${type || "all"}|cited=${citedOnly ? "yes" : "no"}|results=${resultBucket}`,
        );
      }
    } catch (reason) {
      if (current === requestId.current) setMessage(reason instanceof Error ? reason.message : copy.searchRetry);
    } finally {
      if (current === requestId.current) setSearching(false);
    }
  }

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    await runSearch();
  }

  return <div className="searchWorkspace">
    <form className="searchConsole" onSubmit={submitSearch} role="search">
      <label className="queryField">
        <span>{copy.queryLabel}</span>
        <textarea value={query} onChange={(event) => setQuery(event.target.value.slice(0, 600))} maxLength={600} rows={2} placeholder={copy.placeholder} />
        <small>{query.length} / 600</small>
      </label>
      <div className="searchControls">
        <select aria-label={copy.domainAria} value={domain} onChange={(event) => setDomain(event.target.value)}>{domainValues.map((value) => <option key={value} value={value}>{copy.domains[value]}</option>)}</select>
        <select aria-label={copy.typeAria} value={type} onChange={(event) => setType(event.target.value)}>{typeValues.map((value) => <option key={value} value={value}>{copy.types[value]}</option>)}</select>
        <label className="citedToggle"><input type="checkbox" checked={citedOnly} onChange={(event) => setCitedOnly(event.target.checked)} />{copy.citedOnly}</label>
        <button type="submit" disabled={searching}>{searching ? copy.searching : copy.search}</button>
      </div>
      <div className="queryExamples"><button className="agentLaunch" type="button" onClick={() => agentWorkspace.open({
        context: { path: '/search', title: copy.chatContext, focusLabel: query, focusDescription: `${copy.domainAria}: ${copy.domains[domain as keyof typeof copy.domains]} · ${copy.typeAria}: ${copy.types[type as keyof typeof copy.types]}` },
        draft: query,
        filters: { domain: domain || undefined, type: type || undefined, citedOnly: true },
        onEvidenceResults: setResults,
      })}>{copy.openAgent}</button>{examples.map((example) => <button type="button" key={example} onClick={() => { setQuery(example); void runSearch(example); }}>{example}</button>)}</div>
    </form>

    {message && <p className="searchMessage" role="alert">{message}</p>}
    <section className="resultSection">
      <div className="resultHeader"><div><p>CURATED KNOWLEDGE</p><h2>{copy.results}</h2></div><span>{searching ? "…" : results.length} {copy.records}</span></div>
      {!searching && results.length === 0 ? <div className="emptyResults"><b>{copy.noMatches}</b><p>{copy.noMatchesHint}</p></div> : null}
      <div className="resultList">{results.map((result) => <article key={result.id}>
        <div className="resultMeta"><span>{copy.types[result.entityType]}</span>{result.domains.map((item) => <i key={item}>{copy.domains[item as keyof typeof copy.domains] || item}</i>)}{result.year && <time>{result.year}</time>}</div>
        <h3><a href={result.route}>{result.title}</a></h3>
        <p>{result.excerpt}</p>
        {result.devices.length ? <div className="resultDevices">{result.devices.slice(0, 5).map((device) => <span key={device}>{device}</span>)}</div> : null}
        <footer><a href={result.route}>{copy.openRecord} ↗</a><span>{result.sources.length} {copy.sources}</span>{result.evidenceLevel && <span>{result.evidenceLevel}</span>}{result.deploymentLevel && <span>{result.deploymentLevel}</span>}</footer>
        {result.sources.length ? <details><summary>{copy.viewSources}</summary><div>{result.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>)}</div></details> : null}
      </article>)}</div>
    </section>
  </div>;
}

const ZH = {
  queryLabel: "检索或提出一个研究问题", placeholder: "输入装置、工具、论文、控制任务或自然语言问题…", domainAria: "知识域", typeAria: "实体类型",
  citedOnly: "仅显示有原始来源的记录", searching: "检索中…", search: "确定性检索", searchFailed: "检索失败", searchRetry: "检索失败，请稍后重试。",
  chatContext: "知识检索与证据问答", results: "检索结果", records: "条", noMatches: "没有匹配记录", noMatchesHint: "尝试减少筛选项，或使用英文缩写、装置名、代码名和论文题名。",
  openRecord: "打开知识记录", sources: "个来源", viewSources: "查看原始来源",
  openAgent: "在智能体侧栏继续追问 ✦",
  examples: ["EXL-50U 位形控制有哪些证据？", "DINA、MEQ 与实时控制的关系", "聚变诊断如何验证数字孪生？", "哪些工程工具具有公开代码？"],
  domains: { "": "全部知识域", physics: "物理模拟", engineering: "工程仿真", control: "集成控制", diagnostics: "诊断感知", energy: "能量转化", auxiliary: "辅机模拟", data: "数据基座", hmi: "人机交互", integration: "总体集成", "ai-native": "智能原生", facilities: "全球装置" },
  types: { "": "全部类型", work: "研究工作", paper: "论文", code: "代码", tool: "工具", device: "装置", framework: "集成框架" },
} as const;

const EN = {
  queryLabel: "Search or ask a research question", placeholder: "Enter a device, tool, paper, control task, or natural-language question…", domainAria: "Knowledge domain", typeAria: "Entity type",
  citedOnly: "Only show records with primary sources", searching: "Searching…", search: "Deterministic search", searchFailed: "Search failed", searchRetry: "Search failed. Please try again.",
  chatContext: "Knowledge search and evidence-grounded Q&A", results: "Search results", records: "records", noMatches: "No matching records", noMatchesHint: "Try fewer filters, or use an English acronym, device name, code name, or paper title.",
  openRecord: "Open knowledge record", sources: "sources", viewSources: "View original sources",
  openAgent: "Continue in the Agent sidebar ✦",
  examples: ["What evidence supports EXL-50U shape control?", "Compare DINA and MEQ for real-time control", "How can diagnostics validate a fusion digital twin?", "Which engineering tools have public code?"],
  domains: { "": "All knowledge domains", physics: "Physics modelling", engineering: "Engineering simulation", control: "Integrated control", diagnostics: "Diagnostics and sensing", energy: "Energy conversion", auxiliary: "Auxiliary systems", data: "Data foundation", hmi: "Human-machine interaction", integration: "System integration", "ai-native": "AI-native", facilities: "Global facilities" },
  types: { "": "All entity types", work: "Research work", paper: "Paper", code: "Code", tool: "Tool", device: "Device", framework: "Framework" },
} as const;
