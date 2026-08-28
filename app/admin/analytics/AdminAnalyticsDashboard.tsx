"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/app/i18n";
import {
  ANALYTICS_REPORT_DAYS,
  parseAnalyticsReport,
  type AnalyticsBreakdownRow,
  type AnalyticsReport,
  type AnalyticsReportDays,
} from "@/app/analytics/contracts";
import AnalyticsCharts from "./AnalyticsCharts";

type ErrorEnvelope = { error?: { message?: string } };
type Props = { adminIdentity: { displayName: string; email: string } };

async function requestReport(days: AnalyticsReportDays, signal: AbortSignal, en: boolean) {
  const response = await fetch(`/api/analytics/report?days=${days}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const serverMessage = payload && typeof payload === "object" && "error" in payload
      ? (payload as ErrorEnvelope).error?.message
      : null;
    if (response.status === 401 || response.status === 403) {
      throw new Error(en
        ? "Your administrator session is no longer authorized. Sign in again or ask an owner to verify your role."
        : "当前管理员会话已失去授权，请重新登录或请站点负责人核验角色。");
    }
    throw new Error(en && serverMessage
      ? serverMessage
      : en
        ? `The analytics service is temporarily unavailable (${response.status}).`
        : `访问分析服务暂时不可用（${response.status}）。`);
  }
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    throw new Error(en ? "The analytics service returned an unrecognized response." : "访问分析服务返回了无法识别的数据。");
  }
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object" || !("report" in data)) {
    throw new Error(en ? "The analytics service returned an unrecognized response." : "访问分析服务返回了无法识别的数据。");
  }
  try {
    return parseAnalyticsReport((data as { report: unknown }).report);
  } catch {
    throw new Error(en ? "The analytics service returned an invalid report." : "访问分析服务返回了无效报表。");
  }
}

function formatNumber(value: number, en: boolean) {
  return new Intl.NumberFormat(en ? "en-US" : "zh-CN", { maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number, en: boolean) {
  return new Intl.NumberFormat(en ? "en-US" : "zh-CN", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDateTime(value: string | null, en: boolean) {
  if (!value) return en ? "No events yet" : "暂无事件";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(en ? "en-US" : "zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function contentLabel(path: string, contentKey: string | null) {
  return contentKey ? `${path}#${contentKey}` : path;
}

function Breakdown({
  title,
  rows,
  en,
  kind,
}: {
  title: string;
  rows: AnalyticsBreakdownRow[];
  en: boolean;
  kind: "source" | "device";
}) {
  const max = Math.max(1, ...rows.map((row) => row.pageViews));
  const sourceLabels: Record<string, string> = {
    club: en ? "fusiondigital.club relay" : "club 域名转发",
  };
  const deviceLabels: Record<string, string> = en ? {
    desktop: "Desktop",
    tablet: "Tablet",
    mobile: "Mobile",
    other: "Other",
  } : {
    desktop: "桌面端",
    tablet: "平板",
    mobile: "移动端",
    other: "其他",
  };
  const labels = kind === "source" ? sourceLabels : deviceLabels;
  return (
    <section className="analyticsBreakdownCard">
      <header><span>{kind === "source" ? "SOURCE" : "DEVICE"}</span><h3>{title}</h3></header>
      {rows.length ? <ul>
        {rows.map((row) => <li key={row.key}>
          <div><b>{labels[row.key] ?? row.key}</b><span>{formatNumber(row.pageViews, en)} PV · {formatNumber(row.visitors, en)} {en ? "visitors" : "访客"}</span></div>
          <i aria-hidden="true"><span style={{ width: `${Math.max(2, row.pageViews / max * 100)}%` }} /></i>
        </li>)}
      </ul> : <p className="analyticsInlineEmpty">{en ? "No breakdown data in this window." : "所选时段暂无分类数据。"}</p>}
    </section>
  );
}

export default function AdminAnalyticsDashboard({ adminIdentity }: Props) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [days, setDays] = useState<AnalyticsReportDays>(30);
  const [revision, setRevision] = useState(0);
  const requestKey = `${days}:${en ? "en" : "zh"}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    report: AnalyticsReport | null;
    error: string | null;
  }>({ key: "", report: null, error: null });
  const loading = result.key !== requestKey;
  const report = loading ? null : result.report;
  const error = loading ? null : result.error;

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    requestReport(days, controller.signal, en)
      .then((value) => setResult({ key: requestKey, report: value, error: null }))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setResult({
          key: requestKey,
          report: null,
          error: cause instanceof Error ? cause.message : (en ? "Unable to load analytics." : "无法加载访问分析。"),
        });
      });
    return () => controller.abort();
  }, [days, en, requestKey]);

  const kpis = useMemo(() => report ? [
    { key: "dau", code: "DAU", label: en ? "Active visitors today" : "今日活跃访客", value: formatNumber(report.summary.dau, en), note: en ? "Shanghai day" : "上海时区自然日" },
    { key: "wau", code: "WAU", label: en ? "Rolling 7-day active visitors" : "近七日活跃访客", value: formatNumber(report.summary.wau, en), note: en ? "Last seven Shanghai days" : "滚动七日窗口" },
    { key: "mau", code: "MAU", label: en ? "Active visitors this month" : "本月活跃访客", value: formatNumber(report.summary.mau, en), note: en ? "Calendar month" : "当前自然月" },
    { key: "visitors", code: "UV", label: en ? "Unique visitors" : "独立访客", value: formatNumber(report.summary.visitors, en), note: en ? `${report.days}-day window` : `${report.days} 天窗口` },
    { key: "pageViews", code: "PV", label: en ? "Page views" : "页面访问次数", value: formatNumber(report.summary.pageViews, en), note: en ? "Approved public routes" : "已批准的公开路径" },
    { key: "sessions", code: "SESS", label: en ? "Sessions" : "访问会话", value: formatNumber(report.summary.sessions, en), note: en ? "Pseudonymous sessions" : "匿名化会话" },
    { key: "engagement", code: "ENG", label: en ? "Average engagement" : "平均有效停留", value: `${formatNumber(report.summary.averageEngagedSeconds, en)} s`, note: en ? "Reported engagement events" : "基于有效停留事件" },
    { key: "bounce", code: "BR", label: en ? "Single-page rate" : "单页会话率", value: formatPercent(report.summary.bounceRate, en), note: en ? "Sessions with one page view" : "仅一次页面访问的会话" },
  ] : [], [en, report]);

  return (
    <>
      <header className="analyticsHero">
        <div className="analyticsHeroCopy">
          <p>FUSIONDIGITAL / ADMIN ANALYTICS</p>
          <h1>{en ? <>Understand what people explore,<br /><em>without exposing who they are.</em></> : <>看清用户在探索什么，<br /><em>而不是暴露用户是谁。</em></>}</h1>
          <div className="analyticsPrivacyNote">
            <b>{en ? "PRIVACY BOUNDARY" : "隐私边界"}</b>
            <span>{en
              ? "Only approved routes, semantic content keys, coarse device class, referrer category and pseudonymous identifiers are reported. Raw IP addresses, hostnames, query strings and direct identities are not displayed."
              : "只统计已批准路径、语义内容键、粗粒度设备类型、来源分类和匿名标识；不展示原始 IP、主机名、查询参数或直接身份。"}</span>
          </div>
        </div>
        <aside className="analyticsAdminCard">
          <span>{en ? "AUTHORIZED OPERATOR" : "已授权操作人"}</span>
          <strong>{adminIdentity.displayName}</strong>
          <small>{adminIdentity.email}</small>
          <i>{en ? "ADMIN · SERVER VERIFIED" : "ADMIN · 服务端已核验"}</i>
        </aside>
      </header>

      <section className="analyticsConsole" aria-labelledby="analytics-console-title">
        <div className="analyticsConsoleHeader">
          <div>
            <p>01 / REPORT WINDOW</p>
            <h2 id="analytics-console-title">{en ? "Visit intelligence console" : "访问洞察控制台"}</h2>
            <span>{report
              ? `${report.startDate} → ${report.endDate} · ${report.timeZone} · ${en ? "updated" : "最近入库"} ${formatDateTime(report.updatedAt, en)}`
              : en ? "Select an observation window; reports are requested only after authorization." : "选择观察窗口；报表只会在完成授权后请求。"}</span>
          </div>
          <div className="analyticsRange" role="group" aria-label={en ? "Report window" : "报表时间范围"}>
            {ANALYTICS_REPORT_DAYS.map((value) => <button
              type="button"
              key={value}
              className={days === value ? "isActive" : ""}
              aria-pressed={days === value}
              disabled={loading && days === value}
              onClick={() => setDays(value)}
            >{value}{en ? "D" : "天"}</button>)}
          </div>
        </div>

        {loading && <div className="analyticsState analyticsLoading" role="status" aria-live="polite">
          <span aria-hidden="true" />
          <div><b>{en ? "Calculating the authorized report" : "正在计算授权报表"}</b><small>{en ? "Aggregating activity, content and session journeys…" : "聚合活跃、内容与访问路径…"}</small></div>
        </div>}

        {!loading && error && <div className="analyticsState analyticsError" role="alert">
          <div><b>{en ? "The report could not be loaded" : "报表加载失败"}</b><p>{error}</p><small>{en ? "The console stays empty when authorization or storage cannot be verified." : "当授权或存储无法核验时，控制台保持空白。"}</small></div>
          <button type="button" onClick={reload}>{en ? "Retry" : "重试"}</button>
        </div>}

        {!loading && !error && report && <>
          <p className="srOnly" role="status">{en ? `${report.days}-day analytics report loaded.` : `${report.days} 天访问报表已加载。`}</p>
          <div className="analyticsKpis" role="list" aria-label={en ? "Key visit metrics" : "核心访问指标"}>
            {kpis.map((kpi) => <article role="listitem" key={kpi.key}><header><span>{kpi.code}</span><small>{kpi.label}</small></header><strong>{kpi.value}</strong><p>{kpi.note}</p></article>)}
          </div>

          {report.summary.pageViews === 0 ? <div className="analyticsState analyticsEmpty">
            <b>{en ? "No recorded visits in this window" : "所选时段暂无访问记录"}</b>
            <p>{en ? "No sample or mock records are substituted. Choose a longer window after real events have been collected." : "系统不会用示例或模拟数据填充；真实事件入库后可选择更长时间范围查看。"}</p>
          </div> : <AnalyticsCharts report={report} />}

          <section className="analyticsDataSection" aria-labelledby="analytics-content-title">
            <header><div><p>05 / CONTENT DETAIL</p><h2 id="analytics-content-title">{en ? "What people visited" : "用户分别访问了哪些信息"}</h2></div><span>{en ? "Path and approved content key only" : "只展示路径与已批准内容键"}</span></header>
            {report.topContent.length ? <div className="analyticsTableScroll"><table className="analyticsDataTable analyticsContentTable">
              <caption className="srOnly">{en ? "Content visits ranked by views" : "按访问次数排序的内容访问表"}</caption>
              <thead><tr><th>#</th><th>{en ? "Path / content" : "路径 / 内容"}</th><th>{en ? "Views" : "访问次数"}</th><th>{en ? "Visitors" : "访客"}</th><th>{en ? "Avg engagement" : "平均有效停留"}</th></tr></thead>
              <tbody>{report.topContent.map((row, index) => <tr key={`${row.path}:${row.contentKey ?? "page"}`}><td>{String(index + 1).padStart(2, "0")}</td><th scope="row"><code>{row.displayLabel ? `${row.path}#${row.displayLabel}` : contentLabel(row.path, row.contentKey)}</code></th><td>{formatNumber(row.views, en)}</td><td>{formatNumber(row.visitors, en)}</td><td>{formatNumber(row.averageEngagedSeconds, en)} s</td></tr>)}</tbody>
            </table></div> : <p className="analyticsInlineEmpty">{en ? "No content visits in this window." : "所选时段暂无内容访问。"}</p>}
          </section>

          <div className="analyticsBreakdowns">
            <Breakdown title={en ? "Collection source" : "采集来源"} rows={report.sourceBreakdown} en={en} kind="source" />
            <Breakdown title={en ? "Coarse device class" : "粗粒度设备类型"} rows={report.deviceBreakdown} en={en} kind="device" />
          </div>

          <section className="analyticsDataSection analyticsSessions" aria-labelledby="analytics-sessions-title">
            <header><div><p>07 / RECENT JOURNEYS</p><h2 id="analytics-sessions-title">{en ? "Pseudonymous session journeys" : "匿名化近期访问路径"}</h2></div><span>{en ? "Newest first · retained raw events are time-limited" : "按最近访问排序 · 原始事件限时保留"}</span></header>
            {report.recentSessions.length ? <div className="analyticsTableScroll"><table className="analyticsDataTable analyticsSessionTable">
              <caption className="srOnly">{en ? "Recent pseudonymous visitor sessions" : "近期匿名访客会话"}</caption>
              <thead><tr><th>{en ? "Visitor / time" : "访客 / 时间"}</th><th>{en ? "Session" : "会话"}</th><th>{en ? "Source" : "来源"}</th><th>{en ? "Journey" : "访问路径"}</th></tr></thead>
              <tbody>{report.recentSessions.map((session) => <tr key={`${session.sessionLabel}:${session.startedAt}`}>
                <th scope="row"><b>{session.visitorLabel}</b><small>{formatDateTime(session.startedAt, en)} → {formatDateTime(session.endedAt, en)}</small></th>
                <td><b>{session.sessionLabel} · {session.pageViews} PV · {formatNumber(session.engagedSeconds, en)} s</b><small>{session.deviceClass} · {session.referrerSource ?? (en ? "direct / unknown" : "直接访问 / 未知")}</small></td>
                <td><span className={`analyticsSourceBadge is-${session.source}`}>{session.source}</span></td>
                <td><ol aria-label={en ? "Session journey" : "会话访问路径"}>{session.journey.map((step, index) => <li key={`${step}:${index}`}><code>{step}</code></li>)}</ol></td>
              </tr>)}</tbody>
            </table></div> : <p className="analyticsInlineEmpty">{en ? "No recent sessions in this window." : "所选时段暂无近期会话。"}</p>}
          </section>

          <div className="analyticsFootnote">
            <b>{en ? "METRIC BOUNDARY" : "指标口径"}</b>
            <p>{en
              ? "DAU is the current Shanghai calendar day; WAU is the rolling seven-day window; MAU is the current Shanghai calendar month. Visitors and sessions are pseudonymous client identifiers, not authenticated people. Single-page rate counts sessions containing one page view."
              : "DAU 为上海时区当日，WAU 为滚动七日，MAU 为上海时区当前自然月。访客与会话依据匿名客户端标识计算，不等同于已认证自然人；单页会话率指只有一次页面访问的会话占比。"}</p>
            <Link href="/account">{en ? "Return to account center" : "返回账户中心"} →</Link>
          </div>
        </>}
      </section>
    </>
  );
}
