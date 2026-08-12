import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/app/components/SiteNav";
import SiteFooter from "@/app/components/SiteFooter";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import ReviewWorkspace from "./ReviewWorkspace";
import "./research-review.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "调研候选审核台",
  description: "审核每日调研智能体提出的论文、代码、装置与知识关系候选变更。",
  robots: { index: false, follow: false },
};

export default async function ResearchReviewPage() {
  const identity = await getChatGPTUser();
  return <main className="reviewPage">
    <SiteNav active="knowledge" />
    <header className="reviewHero">
      <p>FUSIONDIGITAL / GOVERNED RESEARCH AGENT</p>
      <h1>智能体负责发现，<br /><em>人对发布负责。</em></h1>
      <div className="reviewRules"><span>来源白名单</span><span>快照哈希</span><span>候选制</span><span>职责分离审核</span><span>全程审计</span></div>
    </header>
    {!identity ? <section className="reviewSignIn">
      <div><small>AUTHENTICATION REQUIRED</small><h2>审核工作台仅向已登录协作者开放</h2><p>登录只确认身份。能否查看和审核候选仍由站内 reviewer / admin 角色控制；智能体与普通成员不能获得发布权。</p></div>
      <Link href={chatGPTSignInPath("/research-review")}>使用 ChatGPT 登录 <b>→</b></Link>
    </section> : <ReviewWorkspace displayName={identity.displayName} />}
    <section className="reviewBoundary"><p>TRUST BOUNDARY</p><h2>“接受”不等于“发布”</h2><div><article><b>01</b><h3>发现</h3><span>仅访问配置的 HTTPS 来源，保存游标和内容快照哈希。</span></article><article><b>02</b><h3>候选</h3><span>生成 add / update / retire 提案；相同幂等键不会重复写入。</span></article><article><b>03</b><h3>审核</h3><span>reviewer / admin 审核；提交者不能审核自己的候选。</span></article><article><b>04</b><h3>发布</h3><span>一期未暴露发布 API。未来由独立管理员发布流水线物化接受项。</span></article></div></section>
    <SiteFooter />
  </main>;
}
