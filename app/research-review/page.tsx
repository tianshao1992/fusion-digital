import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import SiteNav from "@/app/components/SiteNav";
import SiteFooter from "@/app/components/SiteFooter";
import StaticLocaleContent from "@/app/components/StaticLocaleContent";
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocale } from "@/app/i18n/config";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import ReviewWorkspace from "./ReviewWorkspace";
import { isPublicAnonymousMode } from "@/app/deployment-mode";
import "./research-review.css";

export const dynamic = "force-dynamic";
export async function generateMetadata():Promise<Metadata> {
  const store=await cookies();
  const en=(resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value)??DEFAULT_LOCALE)==='en';
  return {title:en?'Research Candidate Review Workspace':'调研候选审核台',description:en?'Review candidate changes to papers, code, facilities and knowledge relationships proposed by the governed research agent.':'审核每日调研智能体提出的论文、代码、装置与知识关系候选变更。',robots:{index:false,follow:false}};
}

export default async function ResearchReviewPage() {
  if (isPublicAnonymousMode()) {
    const zh=<main className="reviewPage">
      <SiteNav active="knowledge" />
      <header className="reviewHero">
        <p>FUSIONDIGITAL / PUBLIC ANONYMOUS EDITION</p>
        <h1>已发布内容只读。<br /><em>候选审核与写操作关闭。</em></h1>
        <div className="reviewRules"><span>匿名访问</span><span>只读发布物</span><span>审核入口关闭</span><span>不接受身份请求头</span></div>
      </header>
      <section className="reviewSignIn">
        <div><small>REVIEW WORKSPACE UNAVAILABLE</small><h2>公开版未启用候选审核</h2><p>审核需要可信身份、服务端角色和审计数据库；公开版不具备这些条件，不提供登录或审核数据。</p></div>
        <Link href="/knowledge-graph">查看已发布知识 <b>→</b></Link>
      </section>
      <SiteFooter />
    </main>;
    const en=<main className="reviewPage"><SiteNav active="knowledge"/><header className="reviewHero"><p>FUSIONDIGITAL / PUBLIC ANONYMOUS EDITION</p><h1>Published content is read-only.<br/><em>Candidate review and writes are disabled.</em></h1><div className="reviewRules"><span>Anonymous access</span><span>Read-only publications</span><span>Review entry disabled</span><span>Identity headers not trusted</span></div></header><section className="reviewSignIn"><div><small>REVIEW WORKSPACE UNAVAILABLE</small><h2>Candidate review is disabled in the public edition</h2><p>Review needs trusted identity, server-side roles and an audit database. The public edition lacks these, so sign-in and review records are unavailable.</p></div><Link href="/knowledge-graph">View published knowledge <b>→</b></Link></section><SiteFooter/></main>;
    return <StaticLocaleContent zh={zh} en={en}/>;
  }
  const identity = await getChatGPTUser();
  const zh=<main className="reviewPage">
    <SiteNav active="knowledge" />
    <header className="reviewHero">
      <p>FUSIONDIGITAL / GOVERNED RESEARCH AGENT</p>
      <h1>智能体发现候选。<br /><em>人工负责发布。</em></h1>
      <div className="reviewRules"><span>来源白名单</span><span>快照哈希</span><span>候选制</span><span>职责分离审核</span><span>全程审计</span></div>
    </header>
    {!identity ? <section className="reviewSignIn">
      <div><small>AUTHENTICATION REQUIRED</small><h2>审核仅限已登录协作者</h2><p>登录仅确认身份；候选查看与审核限 reviewer / admin。智能体和普通成员无发布权。</p></div>
      <Link href={chatGPTSignInPath("/research-review")}>使用 ChatGPT 登录 <b>→</b></Link>
    </section> : <ReviewWorkspace displayName={identity.displayName} />}
    <section className="reviewBoundary"><p>TRUST BOUNDARY</p><h2>“接受”不等于“发布”</h2><div><article><b>01</b><h3>发现</h3><span>仅访问配置的 HTTPS 来源，保存游标和内容快照哈希。</span></article><article><b>02</b><h3>候选</h3><span>生成 add / update / retire 提案；相同幂等键不会重复写入。</span></article><article><b>03</b><h3>审核</h3><span>reviewer / admin 审核；提交者不能审核自己的候选。</span></article><article><b>04</b><h3>发布</h3><span>一期未暴露发布 API。未来由独立管理员发布流水线物化接受项。</span></article></div></section>
    <SiteFooter />
  </main>;
  const en=<main className="reviewPage"><SiteNav active="knowledge"/><header className="reviewHero"><p>FUSIONDIGITAL / GOVERNED RESEARCH AGENT</p><h1>Agents find candidates.<br/><em>People are responsible for publication.</em></h1><div className="reviewRules"><span>Allow-listed sources</span><span>Snapshot hashes</span><span>Candidate-only writes</span><span>Separation-of-duties review</span><span>Complete audit trail</span></div></header>{!identity?<section className="reviewSignIn"><div><small>AUTHENTICATION REQUIRED</small><h2>Review requires collaborator sign-in</h2><p>Sign-in verifies identity only. Viewing and reviewing candidates requires a reviewer/admin role; agents and members cannot publish.</p></div><Link href={chatGPTSignInPath("/research-review")}>Sign in with ChatGPT <b>→</b></Link></section>:<ReviewWorkspace displayName={identity.displayName}/>}<section className="reviewBoundary"><p>TRUST BOUNDARY</p><h2>“Accepted” does not mean “published”</h2><div><article><b>01</b><h3>Discovery</h3><span>Read configured HTTPS sources only; retain cursors and content-snapshot hashes.</span></article><article><b>02</b><h3>Candidate</h3><span>Create add, update or retire proposals; an idempotency key cannot be written twice.</span></article><article><b>03</b><h3>Review</h3><span>A reviewer or administrator decides; submitters cannot review their own candidates.</span></article><article><b>04</b><h3>Publication</h3><span>Phase 1 exposes no publication API. A future independent administrator pipeline will materialize accepted changes.</span></article></div></section><SiteFooter/></main>;
  return <StaticLocaleContent zh={zh} en={en}/>;
}
