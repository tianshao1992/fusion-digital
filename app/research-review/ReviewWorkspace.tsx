"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/app/i18n";

type Run = { id: string; scope: string; status: string; triggerType: string; createdAt: string; version: number };
type Candidate = { id: string; researchRunId: string; action: string; targetType: string; targetId: string | null; rationale: string; confidenceBps: number; status: string; version: number; proposedJson: string; createdAt: string };
type ApiFailure = { error?: { message?: string } };

export default function ReviewWorkspace({ displayName }: { displayName: string }) {
  const { locale }=useI18n();
  const en=locale==='en';
  const [runs, setRuns] = useState<Run[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setMessage("");
    try {
      const [runResponse, candidateResponse] = await Promise.all([
        fetch("/api/research/runs?limit=40", { cache: "no-store" }),
        fetch("/api/research/candidates?status=needs_review,candidate,accepted,rejected&limit=100", { cache: "no-store" }),
      ]);
      if (!runResponse.ok || !candidateResponse.ok) {
        const payload = await (runResponse.ok ? candidateResponse : runResponse).json().catch(() => ({})) as ApiFailure;
        if ([401, 403].includes(runResponse.status) || [401, 403].includes(candidateResponse.status)) {
          setMessage(en?"This account has no reviewer/admin role. Identity sign-in does not grant review authority automatically.":"当前账号没有 reviewer / admin 权限。身份登录不会自动授予审核权。 ");
        } else {
          setUnavailable(true);
          setMessage((!en?payload.error?.message:null) ?? (en?"The research database is unavailable in this environment. The page remains accessible, but no synthetic records are shown.":"调研数据库在当前环境不可用。页面保持可访问，但不会显示模拟数据。 "));
        }
        return;
      }
      const runPayload = await runResponse.json() as { data: { runs: Run[] } };
      const candidatePayload = await candidateResponse.json() as { data: { candidates: Candidate[] } };
      setRuns(runPayload.data.runs); setCandidates(candidatePayload.data.candidates);
      if (!selected && candidatePayload.data.candidates[0]) setSelected(candidatePayload.data.candidates[0].id);
    } catch {
      setUnavailable(true); setMessage(en?"Unable to connect to the research-data service. The interface will not fall back to fabricated or browser-local candidates.":"无法连接调研数据服务。不会回退到伪造或浏览器本地候选。 ");
    } finally { setLoading(false); }
  }, [en, selected]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const current = useMemo(() => candidates.find((item) => item.id === selected) ?? null, [candidates, selected]);

  async function review(decision: "accept" | "reject" | "request_changes") {
    if (!current) return;
    const comment = decision === "request_changes" ? window.prompt(en?"Describe the required changes":"请输入需要修改的内容") : window.prompt(en?"Review note (optional)":"审核备注（可选）");
    if (decision === "request_changes" && !comment?.trim()) return;
    setMessage(en?"Recording an immutable review decision…":"正在登记不可变审核记录…");
    const response = await fetch(`/api/research/candidates/${encodeURIComponent(current.id)}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, expectedVersion: current.version, comment: comment?.trim() || undefined }),
    });
    const payload = await response.json().catch(() => ({})) as ApiFailure;
    if (!response.ok) { setMessage((!en?payload.error?.message:null) ?? (en?"Review failed. Refresh and try again.":"审核失败，请刷新后重试。 ")); return; }
    setMessage(decision === "accept" ? en?"The candidate is accepted but has not been published.":"候选已接受，但尚未发布。" : en?"The review record was saved.":"审核记录已保存。 ");
    await load();
  }

  return <section className="reviewWorkspace" aria-busy={loading}>
    <div className="reviewWorkspaceHead"><div><small>REVIEWER SESSION</small><h2>{en?`${displayName}, this is the candidate-change queue`:`${displayName}，这里是候选变更队列`}</h2></div><button onClick={() => void load()} disabled={loading}>{en?'Refresh data':'刷新数据'}</button></div>
    {message && <div className={`reviewNotice ${unavailable ? "unavailable" : ""}`} role="status"><b>{unavailable ? "DATA UNAVAILABLE" : "SYSTEM"}</b><span>{message}</span></div>}
    <div className="reviewStats"><div><b>{runs.length}</b><span>{en?'Recent runs':'最近运行'}</span></div><div><b>{candidates.filter((item) => item.status === "needs_review").length}</b><span>{en?'Awaiting review':'待审核'}</span></div><div><b>{candidates.filter((item) => item.action === "retire").length}</b><span>{en?'Retirement candidates · high risk':'退役候选 · 高风险'}</span></div><div><b>0</b><span>{en?'Automatic publications':'自动发布'}</span></div></div>
    <div className="reviewColumns">
      <section><header><span>RUNS</span><b>{en?'Research runs':'调研运行'}</b></header>{loading ? <p className="reviewEmpty">{en?'Loading…':'加载中…'}</p> : runs.length ? runs.map((run) => <article className="reviewRun" key={run.id}><div><b>{en?`Run ${run.id.slice(0,8)}`:run.scope}</b><span>{run.triggerType}</span></div><small>{run.status}</small><time>{formatDate(run.createdAt,en)}</time></article>) : <p className="reviewEmpty">{en?'No run records are available.':'当前没有运行记录。'}</p>}</section>
      <section><header><span>CANDIDATES</span><b>{en?'Candidate changes':'候选变更'}</b></header>{candidates.length ? candidates.map((candidate) => <button className={`reviewCandidate ${selected === candidate.id ? "selected" : ""}`} key={candidate.id} onClick={() => setSelected(candidate.id)}><span className={`action ${candidate.action}`}>{candidate.action}</span><b>{candidate.targetType}</b><small>{en?'Detailed rationale awaits an English editorial review.':candidate.rationale}</small><i>{candidate.status} · v{candidate.version}</i></button>) : <p className="reviewEmpty">{en?'No candidate records are available.':'当前没有候选记录。'}</p>}</section>
      <section className="reviewDetail"><header><span>EVIDENCE &amp; DECISION</span><b>{en?'Evidence and decision':'证据与决策'}</b></header>{current ? <><dl><div><dt>{en?'Action':'动作'}</dt><dd>{current.action}</dd></div><div><dt>{en?'Target':'目标'}</dt><dd>{current.targetType}</dd></div><div><dt>{en?'Confidence':'置信度'}</dt><dd>{(current.confidenceBps / 100).toFixed(1)}%</dd></div><div><dt>{en?'Version':'版本'}</dt><dd>{current.version}</dd></div></dl><h3>{en?'Proposal rationale':'提案理由'}</h3><p>{en?'This candidate contains source-language fields that require reviewer-approved English editorial text before international publication.':current.rationale}</p>{!en&&<details><summary>查看结构化提案</summary><pre>{prettyJson(current.proposedJson)}</pre></details>}{current.status === "needs_review" ? <div className="reviewActions"><button onClick={() => void review("accept")}>{en?'Accept candidate':'接受候选'}</button><button onClick={() => void review("request_changes")}>{en?'Request changes':'要求修改'}</button><button onClick={() => void review("reject")}>{en?'Reject':'拒绝'}</button></div> : <p className="reviewStatus">{en?`Status: ${current.status}. Only needs_review candidates can be reviewed.`:`状态：${current.status}。只有 needs_review 可提交审核。`}</p>}</> : <p className="reviewEmpty">{en?'Select a candidate to inspect its evidence.':'选择一条候选查看证据。'}</p>}</section>
    </div>
  </section>;
}

function formatDate(value: string,en:boolean) { return new Intl.DateTimeFormat(en?"en-US":"zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function prettyJson(value: string) { try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; } }
