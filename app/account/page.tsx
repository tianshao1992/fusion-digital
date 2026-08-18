import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "@/app/chatgpt-auth";
import SiteFooter from "@/app/components/SiteFooter";
import SiteNav from "@/app/components/SiteNav";
import StaticLocaleContent from "@/app/components/StaticLocaleContent";
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocale } from "@/app/i18n/config";
import AccountDashboard from "./AccountDashboard";
import LlmCredentialManager from "./LlmCredentialManager";
import { isPublicAnonymousMode } from "@/app/deployment-mode";
import "./account.css";

export const dynamic = "force-dynamic";

export async function generateMetadata():Promise<Metadata> {
  const store=await cookies();
  const en=(resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value)??DEFAULT_LOCALE)==='en';
  return {title:en?'Account Center · FusionDigital':'账户中心 · FusionDigital',description:en?'Manage your FusionDigital identity, access roles, usage quotas and per-user model connections.':'管理 FusionDigital 身份、访问角色与 AI 服务使用配额。'};
}

export default async function AccountPage() {
  if (isPublicAnonymousMode()) {
    const zh=<main className="accountPage">
      <SiteNav active="account" />
      <header className="accountHero">
        <div className="accountHeroCopy">
          <p>FUSIONDIGITAL / PUBLIC ANONYMOUS EDITION</p>
          <h1>当前站点为公开匿名版，<br /><em>不提供账户与密钥管理。</em></h1>
          <div className="accountSignals" aria-label="公开匿名版边界"><span>无需登录</span><span>不识别用户身份</span><span>不保存个人密钥</span><span>仅开放公开内容</span></div>
        </div>
        <aside className="accountIdentityCard"><span>IDENTITY STATUS</span><strong>匿名访问</strong><p>账户功能未启用</p><small>请返回公开知识与数字样机页面继续浏览</small></aside>
      </header>
      <section className="accountRegistration">
        <div><p>01 / PUBLIC ACCESS BOUNDARY</p><h2>登录、角色、配额与个人模型连接在此部署中不可用。</h2><p>该临时公网镜像不会信任身份请求头，也不会展示登录或模型密钥入口。检索问答固定使用站内可核验资料。</p><Link className="accountPrimaryAction" href="/search">进入公开知识检索 <b>↗</b></Link></div>
        <ol><li><b>01</b><span><strong>公开浏览</strong>访问知识域、装置和数字样机。</span></li><li><b>02</b><span><strong>匿名检索</strong>问答仅使用站内确定性检索。</span></li><li><b>03</b><span><strong>写操作关闭</strong>账户、密钥与审核能力不对公网开放。</span></li></ol>
      </section>
      <SiteFooter />
    </main>;
    const en=<main className="accountPage">
      <SiteNav active="account" />
      <header className="accountHero"><div className="accountHeroCopy"><p>FUSIONDIGITAL / PUBLIC ANONYMOUS EDITION</p><h1>This deployment is the public anonymous edition;<br/><em>account and credential management are disabled.</em></h1><div className="accountSignals" aria-label="Public anonymous deployment boundaries"><span>No sign-in required</span><span>No user identity processed</span><span>No personal credentials stored</span><span>Public content only</span></div></div><aside className="accountIdentityCard"><span>IDENTITY STATUS</span><strong>Anonymous access</strong><p>Account functions are disabled</p><small>Continue to the public knowledge and digital-prototype pages</small></aside></header>
      <section className="accountRegistration"><div><p>01 / PUBLIC ACCESS BOUNDARY</p><h2>Sign-in, roles, quotas and personal model connections are unavailable in this deployment.</h2><p>This temporary public mirror does not trust identity request headers and does not expose sign-in or model-credential controls. Knowledge Q&amp;A is restricted to verifiable on-site material.</p><Link className="accountPrimaryAction" href="/search">Open public knowledge search <b>↗</b></Link></div><ol><li><b>01</b><span><strong>Public browsing</strong> Access knowledge domains, facilities and digital prototypes.</span></li><li><b>02</b><span><strong>Anonymous retrieval</strong> Q&amp;A uses deterministic on-site retrieval only.</span></li><li><b>03</b><span><strong>Writes disabled</strong> Accounts, credentials and review operations are not exposed publicly.</span></li></ol></section>
      <SiteFooter />
    </main>;
    return <StaticLocaleContent zh={zh} en={en}/>;
  }
  const user = await getChatGPTUser();
  const zh=<main className="accountPage">
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
  const en=<main className="accountPage">
    <SiteNav active="account" />
    <header className="accountHero">
      <div className="accountHeroCopy"><p>FUSIONDIGITAL / ACCOUNT &amp; ACCESS</p><h1>Give every search, answer and review<br/><em>an identity, quota and audit boundary.</em></h1><div className="accountSignals" aria-label="Account-system principles"><span>ChatGPT identity</span><span>Server-side role authorization</span><span>Daily usage controls</span><span>Complete audit trail</span></div></div>
      <aside className="accountIdentityCard"><span>IDENTITY STATUS</span>{user?<><strong className="identityOnline">Connected</strong><p>{user.displayName}</p><small>{user.email}</small></>:<><strong>Guest mode</strong><p>Public knowledge remains available</p><small>Sign in to enable personal quotas and governed AI services</small></>}</aside>
    </header>
    {user?<section className="accountWorkspace"><div className="accountWorkspaceIntro"><p>01 / ACCOUNT CONSOLE</p><div><h2>Your account is provisioned from a trusted identity.</h2><p>FusionDigital stores no separate password. Your current ChatGPT identity is the sole sign-in route; the database stores site roles, quotas, usage, audit records and encrypted model connections isolated per user.</p></div></div><AccountDashboard fallbackIdentity={{displayName:user.displayName,email:user.email}}/><LlmCredentialManager/><div className="accountActions"><Link href="/search">Open knowledge search <b>↗</b></Link><Link href="/knowledge-graph">Open knowledge graph <b>↗</b></Link><a className="accountSignOut" href={chatGPTSignOutPath("/")}>Sign out</a></div></section>:<section className="accountRegistration"><div><p>01 / REGISTER &amp; SIGN IN</p><h2>No new password is required—register and sign in with ChatGPT.</h2><p>At first sign-in, FusionDigital creates a site account and assigns a baseline access role and daily quota. Model credentials remain on the server and are never returned to the browser.</p><a className="accountPrimaryAction" href={chatGPTSignInPath("/account")}>Register / sign in with ChatGPT <b>↗</b></a></div><ol><li><b>01</b><span><strong>Verify identity</strong> The platform completes secure sign-in; this site never receives your password.</span></li><li><b>02</b><span><strong>Provision account</strong> A site profile is created automatically on first access.</span></li><li><b>03</b><span><strong>Governed use</strong> Q&amp;A and review capabilities are enforced by role and quota.</span></li></ol></section>}
    <section className="platformInlineLink"><span>Roles, quotas and write operations are enforced server-side.</span><Link href="/platform#architecture">View platform boundaries and technical route →</Link></section><SiteFooter />
  </main>;
  return <StaticLocaleContent zh={zh} en={en}/>;
}
