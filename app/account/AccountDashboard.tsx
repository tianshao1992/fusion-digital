"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/app/i18n";

type AccountRecord = { id:string; email:string; displayName:string; roles:string[]; quota:{dailyRequestLimit:number;dailyTokenLimit:number;maxTokensPerRequest:number}; usage:{requestCount:number;reservedTokens:number;inputTokens:number;outputTokens:number} };
type AccountEnvelope = { data: AccountRecord };
type ErrorEnvelope = { error?:{message?:string} };
type Props = { fallbackIdentity:{displayName:string;email:string} };
const number = (value:number, locale:string) => new Intl.NumberFormat(locale).format(value);
const ratio = (value:number, limit:number) => limit <= 0 ? 0 : Math.min(100, Math.max(0, Math.round(value / limit * 100)));

async function fetchAccountRecord(en:boolean):Promise<AccountRecord> {
  const response = await fetch("/api/account", { headers:{accept:"application/json"}, cache:"no-store" });
  const payload = await response.json().catch(() => null) as AccountEnvelope|ErrorEnvelope|null;
  if (!response.ok) { const message = !en && payload && "error" in payload ? payload.error?.message : null; throw new Error(message || (en?`The account service is temporarily unavailable (${response.status}).`:`账户服务暂时不可用（${response.status}）`)); }
  if (!payload || !("data" in payload)) throw new Error(en?'The account service returned an unrecognized response.':"账户服务返回了无法识别的数据");
  return payload.data;
}

export default function AccountDashboard({ fallbackIdentity }:Props) {
  const { locale }=useI18n();
  const en=locale==='en';
  const numberLocale=en?'en-US':'zh-CN';
  const [account,setAccount] = useState<AccountRecord|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const loadAccount = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setAccount(await fetchAccountRecord(en));
    } catch (cause) { setError(cause instanceof Error ? cause.message : en?'The account service is temporarily unavailable.':"账户服务暂时不可用"); }
    finally { setLoading(false); }
  }, [en]);
  useEffect(() => {
    let active = true;
    fetchAccountRecord(en).then(value => { if (active) setAccount(value); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : en?'The account service is temporarily unavailable.':"账户服务暂时不可用"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [en]);
  if (loading) return <div className="accountDashboard accountLoading" aria-live="polite"><span /><div><b>{en?'Synchronizing account boundaries':'正在同步账户边界'}</b><small>{en?'Reading roles, quotas and today’s usage…':'读取角色、配额与今日用量…'}</small></div></div>;
  if (error || !account) return <div className="accountDashboard accountError" role="alert"><div><b>{en?'Account profile has not synchronized':'账户资料尚未同步'}</b><p>{error ?? (en?'Unable to read the account profile.':"无法读取账户资料。")}</p><small>{en?'Current identity':'当前身份'}: {fallbackIdentity.email}</small></div><button type="button" onClick={() => void loadAccount()}>{en?'Reload':'重新加载'}</button></div>;
  const usedTokens = account.usage.inputTokens + account.usage.outputTokens + account.usage.reservedTokens;
  const requestPercent = ratio(account.usage.requestCount, account.quota.dailyRequestLimit);
  const tokenPercent = ratio(usedTokens, account.quota.dailyTokenLimit);
  return <div className="accountDashboard">
    <section className="accountProfile"><header><span>IDENTITY</span><i>ACTIVE</i></header><div className="accountAvatar" aria-hidden="true">{account.displayName.slice(0,1).toUpperCase()}</div><h3>{account.displayName}</h3><p>{account.email}</p><small>ID · {account.id}</small><div className="accountRoles" aria-label={en?'Account roles':'账户角色'}>{(account.roles.length ? account.roles : ["member"]).map(role => <span key={role}>{role}</span>)}</div>{account.roles.includes("admin") && <Link className="accountAnalyticsLink" href="/admin/analytics"><span>{en?'Admin analytics':'管理员访问分析'}</span><b aria-hidden="true">↗</b></Link>}</section>
    <section className="accountQuota"><header><span>TODAY / UTC</span><b>{en?'Daily quota':'每日额度'}</b></header>
      <div className="quotaMetric"><div><span>{en?'Requests':'请求次数'}</span><strong>{number(account.usage.requestCount,numberLocale)} <small>/ {number(account.quota.dailyRequestLimit,numberLocale)}</small></strong></div><div className="quotaRail" role="progressbar" aria-label={en?'Today’s request quota':'今日请求额度'} aria-valuemin={0} aria-valuemax={account.quota.dailyRequestLimit} aria-valuenow={account.usage.requestCount}><i style={{width:`${requestPercent}%`}} /></div><small>{requestPercent}% {en?'used':'已使用'}</small></div>
      <div className="quotaMetric"><div><span>{en?'Model tokens':'模型 Token'}</span><strong>{number(usedTokens,numberLocale)} <small>/ {number(account.quota.dailyTokenLimit,numberLocale)}</small></strong></div><div className="quotaRail tokenRail" role="progressbar" aria-label={en?'Today’s token quota':'今日 Token 额度'} aria-valuemin={0} aria-valuemax={account.quota.dailyTokenLimit} aria-valuenow={Math.min(usedTokens, account.quota.dailyTokenLimit)} aria-valuetext={`${number(usedTokens,numberLocale)} / ${number(account.quota.dailyTokenLimit,numberLocale)} tokens`}><i style={{width:`${tokenPercent}%`}} /></div><small>{tokenPercent}% {en?'used · per-request limit':'已使用 · 单次上限'} {number(account.quota.maxTokensPerRequest,numberLocale)}</small></div>
      <dl><div><dt>{en?'Input tokens':'输入 Token'}</dt><dd>{number(account.usage.inputTokens,numberLocale)}</dd></div><div><dt>{en?'Output tokens':'输出 Token'}</dt><dd>{number(account.usage.outputTokens,numberLocale)}</dd></div><div><dt>{en?'Reserved tokens':'预留 Token'}</dt><dd>{number(account.usage.reservedTokens,numberLocale)}</dd></div></dl>
    </section>
  </div>;
}
