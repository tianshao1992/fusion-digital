import type { Metadata } from "next";
import Link from "next/link";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "@/app/chatgpt-auth";
import SiteFooter from "@/app/components/SiteFooter";
import SiteNav from "@/app/components/SiteNav";
import AccountDashboard from "./AccountDashboard";
import LlmCredentialManager from "./LlmCredentialManager";
import "./account.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "账户中心 · FusionDigital",
  description: "管理 FusionDigital 身份、访问角色与 AI 服务使用配额。",
};

export default async function AccountPage() {
  const user = await getChatGPTUser();
  return <main className="accountPage">
    <SiteNav active="account" />
    <header className="accountHero">
      <div className="accountHeroCopy">
        <p>FUSIONDIGITAL / ACCOUNT & ACCESS</p>
        <h1>让每一次检索、问答与审校，<br /><em>都有身份、额度与审计边界。</em></h1>
        <div className="accountSignals" aria-label="账户体系原则"><span>ChatGPT 身份登录</span><span>服务端角色授权</span><span>每日用量控制</span><span>操作全程留痕</span></div>
      </div>
      <aside className="accountIdentityCard">
        <span>IDENTITY STATUS</span>
        {user ? <><strong className="identityOnline">已连接</strong><p>{user.displayName}</p><small>{user.email}</small></> : <><strong>访客模式</strong><p>公开知识仍可浏览</p><small>登录后启用个性化额度与受控 AI 能力</small></>}
      </aside>
    </header>
    {user ? <section className="accountWorkspace">
      <div className="accountWorkspaceIntro"><p>01 / ACCOUNT CONSOLE</p><div><h2>账户已由可信身份自动建立。</h2><p>本站不保存独立密码。账户以当前 ChatGPT 身份为唯一入口；数据库保存站内角色、配额、用量、审计，以及按用户隔离的加密模型连接。</p></div></div>
      <AccountDashboard fallbackIdentity={{ displayName: user.displayName, email: user.email }} />
      <LlmCredentialManager />
      <div className="accountActions"><Link href="/search">进入知识检索 <b>↗</b></Link><Link href="/knowledge-graph">打开知识图谱 <b>↗</b></Link><a className="accountSignOut" href={chatGPTSignOutPath("/")}>退出当前账户</a></div>
    </section> : <section className="accountRegistration">
      <div><p>01 / REGISTER & SIGN IN</p><h2>无需创建新密码，使用 ChatGPT 完成注册与登录。</h2><p>首次登录时，系统会自动建立 FusionDigital 站内账户，并分配基础访问角色与每日额度。模型密钥始终保留在服务端，不会发送到浏览器。</p><a className="accountPrimaryAction" href={chatGPTSignInPath("/account")}>使用 ChatGPT 注册 / 登录 <b>↗</b></a></div>
      <ol><li><b>01</b><span><strong>确认身份</strong>由平台完成安全登录，本站不接触密码。</span></li><li><b>02</b><span><strong>建立账户</strong>首次访问账户接口时自动创建站内档案。</span></li><li><b>03</b><span><strong>受控使用</strong>问答、审校等能力按角色与额度执行。</span></li></ol>
    </section>}
    <section className="platformInlineLink"><span>角色、额度与写操作由服务端校验。</span><Link href="/platform#architecture">查看平台边界与技术路线 →</Link></section>
    <SiteFooter />
  </main>;
}
