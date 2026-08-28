"use client";

import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { useI18n } from "@/app/i18n";
import type { AnalyticsReport } from "@/app/analytics/contracts";
import ScientificChart from "@/app/components/charts/ScientificChart";

type Props = { report: AnalyticsReport };
const FONT = '"Microsoft YaHei UI","Microsoft YaHei","Noto Sans SC",Arial,sans-serif';
const SERIES_COLORS = ["#65e6d2", "#ff8738", "#9f94bc"];

function labelContent(path: string, contentKey: string | null, displayLabel?: string | null) {
  return displayLabel ? `${path}#${displayLabel}` : contentKey ? `${path}#${contentKey}` : path;
}

export default function AnalyticsCharts({ report }: Props) {
  const { locale } = useI18n();
  const en = locale === "en";
  const top = report.topContent.slice(0, 12);
  const heatmap = report.hourlyHeatmap;

  const dailyOption = useMemo<EChartsCoreOption>(() => ({
    backgroundColor: "transparent",
    color: SERIES_COLORS,
    aria: { enabled: true, decal: { show: true } },
    tooltip: { trigger: "axis", confine: true },
    legend: { top: 8, data: en ? ["Page views", "Visitors", "Sessions"] : ["页面访问", "访客", "会话"] },
    grid: { left: 58, right: 24, top: 58, bottom: 52 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: report.daily.map((point) => point.date.slice(5)),
      axisLabel: { hideOverlap: true },
      name: en ? "Shanghai calendar date" : "上海时区日期",
      nameLocation: "middle",
      nameGap: 34,
    },
    yAxis: { type: "value", minInterval: 1, name: en ? "Count" : "次数" },
    series: [
      { name: en ? "Page views" : "页面访问", type: "line", smooth: 0.22, showSymbol: report.days <= 30, symbolSize: 5, lineStyle: { width: 2.5 }, areaStyle: { opacity: 0.08 }, data: report.daily.map((point) => point.pageViews) },
      { name: en ? "Visitors" : "访客", type: "line", smooth: 0.22, showSymbol: report.days <= 30, symbolSize: 5, lineStyle: { width: 2 }, data: report.daily.map((point) => point.visitors) },
      { name: en ? "Sessions" : "会话", type: "line", smooth: 0.22, showSymbol: report.days <= 30, symbolSize: 5, lineStyle: { width: 2 }, data: report.daily.map((point) => point.sessions) },
    ],
  }), [en, report.daily, report.days]);

  const contentOption = useMemo<EChartsCoreOption>(() => {
    const rows = [...top].reverse();
    return {
      backgroundColor: "transparent",
      color: [SERIES_COLORS[1], SERIES_COLORS[0]],
      aria: { enabled: true, decal: { show: true } },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, confine: true },
      legend: { top: 8, data: en ? ["Views", "Visitors"] : ["访问次数", "访客"] },
      grid: { left: 128, right: 26, top: 58, bottom: 28 },
      xAxis: { type: "value", minInterval: 1, name: en ? "Count" : "次数" },
      yAxis: {
        type: "category",
        data: rows.map((row) => labelContent(row.path, row.contentKey, row.displayLabel)),
        axisLabel: { width: 116, overflow: "truncate", fontFamily: FONT, fontSize: 9 },
      },
      series: [
        { name: en ? "Views" : "访问次数", type: "bar", barMaxWidth: 22, data: rows.map((row) => row.views) },
        { name: en ? "Visitors" : "访客", type: "bar", barMaxWidth: 22, data: rows.map((row) => row.visitors) },
      ],
    };
  }, [en, top]);

  const heatmapOption = useMemo<EChartsCoreOption>(() => {
    const weekday = en ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const max = Math.max(1, ...heatmap.map((point) => point.pageViews));
    return {
      backgroundColor: "transparent",
      aria: { enabled: true, decal: { show: true } },
      tooltip: {
        position: "top",
        confine: true,
        formatter: (params: { value?: number[] }) => {
          const value = params.value ?? [0, 0, 0];
          return `${weekday[value[1]] ?? value[1]} ${String(value[0]).padStart(2, "0")}:00 · ${value[2]} ${en ? "views" : "次访问"}`;
        },
      },
      grid: { left: 64, right: 28, top: 28, bottom: 72 },
      xAxis: { type: "category", data: Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")), name: en ? "Hour (Asia/Shanghai)" : "小时（上海时区）", nameLocation: "middle", nameGap: 35, splitArea: { show: true } },
      yAxis: { type: "category", data: weekday, splitArea: { show: true } },
      visualMap: { min: 0, max, calculable: true, orient: "horizontal", left: "center", bottom: 2, text: en ? ["More", "Less"] : ["多", "少"], inRange: { color: ["#15251f", "#1c6e60", "#65e6d2", "#ff8738"] } },
      series: [{
        name: en ? "Page views" : "页面访问",
        type: "heatmap",
        data: heatmap.map((point) => [point.hour, point.weekday, point.pageViews]),
        label: { show: false },
        emphasis: { itemStyle: { shadowBlur: 12, shadowColor: "rgba(0,0,0,.35)" } },
      }],
    };
  }, [en, heatmap]);

  const weekdayLabel = en ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  return (
    <section className="analyticsCharts" aria-labelledby="analytics-charts-title">
      <header className="analyticsSectionHeader"><div><p>02–04 / ECHARTS</p><h2 id="analytics-charts-title">{en ? "Activity, content and time distribution" : "活跃、内容与访问时段分布"}</h2></div><span>{en ? "Interactive SVG · accessible tables retained" : "交互式 SVG · 保留可访问数据表"}</span></header>
      <div className="analyticsChartGrid">
        <figure className="analyticsChartCard analyticsChartWide">
          <figcaption><span>02</span><div><b>{en ? "Daily activity trend" : "每日活跃趋势"}</b><small>{en ? "PV, visitors and sessions" : "页面访问、访客与会话"}</small></div></figcaption>
          <ScientificChart
            id={`admin-analytics-daily-${report.days}`}
            option={dailyOption}
            ariaLabel={en ? `Daily visit trend for the last ${report.days} days` : `最近 ${report.days} 天每日访问趋势`}
            fallbackSrc=""
            fallbackAlt=""
            height={390}
            eager
            keepFallbackAccessible
            fallback={<table className="analyticsChartTable"><caption>{en ? "Daily activity data" : "每日活跃数据"}</caption><thead><tr><th>{en ? "Date" : "日期"}</th><th>PV</th><th>{en ? "Visitors" : "访客"}</th><th>{en ? "Sessions" : "会话"}</th></tr></thead><tbody>{report.daily.map((point) => <tr key={point.date}><th scope="row">{point.date}</th><td>{point.pageViews}</td><td>{point.visitors}</td><td>{point.sessions}</td></tr>)}</tbody></table>}
          />
        </figure>

        <figure className="analyticsChartCard">
          <figcaption><span>03</span><div><b>{en ? "Most visited content" : "高频访问内容"}</b><small>{en ? "Top 12 path and content keys" : "前 12 项路径与内容键"}</small></div></figcaption>
          <ScientificChart
            id={`admin-analytics-content-${report.days}`}
            option={contentOption}
            ariaLabel={en ? "Bar chart of most visited content" : "高频访问内容条形图"}
            fallbackSrc=""
            fallbackAlt=""
            height={470}
            eager
            keepFallbackAccessible
            fallback={<table className="analyticsChartTable"><caption>{en ? "Most visited content data" : "高频访问内容数据"}</caption><thead><tr><th>{en ? "Content" : "内容"}</th><th>{en ? "Views" : "访问"}</th><th>{en ? "Visitors" : "访客"}</th></tr></thead><tbody>{top.map((row) => <tr key={`${row.path}:${row.contentKey ?? "page"}`}><th scope="row">{labelContent(row.path, row.contentKey, row.displayLabel)}</th><td>{row.views}</td><td>{row.visitors}</td></tr>)}</tbody></table>}
          />
        </figure>

        <figure className="analyticsChartCard">
          <figcaption><span>04</span><div><b>{en ? "Weekday × hour heatmap" : "星期 × 小时热力图"}</b><small>{en ? "Asia/Shanghai · page views" : "上海时区 · 页面访问"}</small></div></figcaption>
          <ScientificChart
            id={`admin-analytics-hourly-${report.days}`}
            option={heatmapOption}
            ariaLabel={en ? "Heatmap of page views by weekday and hour in Asia/Shanghai" : "上海时区按星期与小时统计的页面访问热力图"}
            fallbackSrc=""
            fallbackAlt=""
            height={470}
            eager
            keepFallbackAccessible
            fallback={<table className="analyticsChartTable"><caption>{en ? "Non-zero weekday and hour activity" : "非零星期与小时访问数据"}</caption><thead><tr><th>{en ? "Weekday" : "星期"}</th><th>{en ? "Hour" : "小时"}</th><th>PV</th></tr></thead><tbody>{heatmap.length ? heatmap.map((point) => <tr key={`${point.weekday}:${point.hour}`}><th scope="row">{weekdayLabel[point.weekday] ?? point.weekday}</th><td>{String(point.hour).padStart(2, "0")}:00</td><td>{point.pageViews}</td></tr>) : <tr><td colSpan={3}>{en ? "No hourly activity" : "暂无分时访问"}</td></tr>}</tbody></table>}
          />
        </figure>
      </div>
    </section>
  );
}
