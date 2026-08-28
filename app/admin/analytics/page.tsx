import type { Metadata } from "next";
import { cookies } from "next/headers";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import SiteFooter from "@/app/components/SiteFooter";
import SiteNav from "@/app/components/SiteNav";
import { isPublicAnonymousMode } from "@/app/deployment-mode";
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocale } from "@/app/i18n/config";
import { provisionUser, type Principal } from "@/db/accounts";
import AdminAnalyticsDashboard from "./AdminAnalyticsDashboard";
import "./analytics.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "访问分析 / Analytics · FusionDigital",
  description: "FusionDigital 管理员专用的匿名访问统计控制台。",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

type BoundaryProps = {
  eyebrow: string;
  title: string;
  detail: string;
  status: string;
  action?: { href: string; label: string };
};

function AnalyticsBoundary({ eyebrow, title, detail, status, action }: BoundaryProps) {
  return (
    <main className="analyticsPage analyticsBoundaryPage">
      <SiteNav active="account" />
      <section className="analyticsBoundary" aria-labelledby="analytics-boundary-title">
        <div className="analyticsBoundaryCode" aria-hidden="true">403 / PRIVATE VIEW</div>
        <div className="analyticsBoundaryCopy">
          <p>{eyebrow}</p>
          <h1 id="analytics-boundary-title">{title}</h1>
          <span>{detail}</span>
          <div className="analyticsBoundaryStatus"><i aria-hidden="true" />{status}</div>
          {action && <a href={action.href}>{action.label}<b aria-hidden="true">↗</b></a>}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

function localizedBoundary(
  en: boolean,
  kind: "public" | "signed-out" | "denied" | "inactive" | "unavailable",
) {
  const copy = {
    public: en ? {
      eyebrow: "FUSIONDIGITAL / PUBLIC ANONYMOUS BOUNDARY",
      title: "Private analytics are not exposed by this deployment.",
      detail: "The public-anonymous edition does not trust identity headers, query the analytics database, or render administrator controls.",
      status: "Public content remains available without sign-in",
      action: { href: "/", label: "Return to the public atlas" },
    } : {
      eyebrow: "FUSIONDIGITAL / 公开匿名版边界",
      title: "此部署不开放私有访问分析。",
      detail: "公开匿名版不信任身份请求头、不查询访问分析数据库，也不渲染管理员控制项。",
      status: "公开内容仍可免登录访问",
      action: { href: "/", label: "返回公开图谱" },
    },
    "signed-out": en ? {
      eyebrow: "FUSIONDIGITAL / ADMIN ANALYTICS",
      title: "Sign in before requesting the analytics console.",
      detail: "ChatGPT sign-in establishes your site account. The server then checks the active account and administrator role before any report request is allowed.",
      status: "No analytics data has been requested",
      action: { href: chatGPTSignInPath("/admin/analytics"), label: "Sign in with ChatGPT" },
    } : {
      eyebrow: "FUSIONDIGITAL / 管理员访问分析",
      title: "请先登录，再申请进入统计控制台。",
      detail: "ChatGPT 登录用于建立站内账户；服务端随后检查账户状态与管理员角色，通过前不会发起任何报表请求。",
      status: "尚未请求任何访问统计数据",
      action: { href: chatGPTSignInPath("/admin/analytics"), label: "使用 ChatGPT 登录" },
    },
    denied: en ? {
      eyebrow: "FUSIONDIGITAL / ROLE BOUNDARY",
      title: "This account does not have analytics access.",
      detail: "Your identity is valid and your site account is provisioned, but only an active account with the admin role can read visit reports and pseudonymous journeys.",
      status: "Authorization denied by the server",
      action: { href: "/account", label: "Return to account center" },
    } : {
      eyebrow: "FUSIONDIGITAL / 角色边界",
      title: "当前账户没有访问统计的权限。",
      detail: "身份有效且站内账户已建立，但只有拥有 admin 角色的活跃账户才能读取访问报表与匿名化访问路径。",
      status: "服务端已拒绝授权",
      action: { href: "/account", label: "返回账户中心" },
    },
    inactive: en ? {
      eyebrow: "FUSIONDIGITAL / ACCOUNT BOUNDARY",
      title: "This account is not active.",
      detail: "Analytics access remains closed until the site account is returned to active status. Signing in alone does not bypass this boundary.",
      status: "Inactive account — report access denied",
      action: { href: "/account", label: "Open account center" },
    } : {
      eyebrow: "FUSIONDIGITAL / 账户边界",
      title: "当前账户不是活跃状态。",
      detail: "站内账户恢复为 active 前，访问分析保持关闭；仅完成登录不能绕过该边界。",
      status: "账户未激活 — 报表访问被拒绝",
      action: { href: "/account", label: "打开账户中心" },
    },
    unavailable: en ? {
      eyebrow: "FUSIONDIGITAL / ACCOUNT SERVICE",
      title: "Administrator status could not be verified.",
      detail: "The account service did not complete provisioning, so the analytics console remains fail-closed and no report has been requested.",
      status: "Verification unavailable — access kept closed",
      action: { href: "/admin/analytics", label: "Try verification again" },
    } : {
      eyebrow: "FUSIONDIGITAL / 账户服务",
      title: "目前无法核验管理员状态。",
      detail: "账户服务未能完成站内账户建立，因此统计控制台按默认拒绝策略保持关闭，也没有请求任何报表。",
      status: "核验不可用 — 访问保持关闭",
      action: { href: "/admin/analytics", label: "重新核验" },
    },
  } as const;
  return copy[kind];
}

export default async function AdminAnalyticsPage() {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE;
  const en = locale === "en";

  if (isPublicAnonymousMode()) {
    return <AnalyticsBoundary {...localizedBoundary(en, "public")} />;
  }

  const identity = await getChatGPTUser();
  if (!identity) {
    return <AnalyticsBoundary {...localizedBoundary(en, "signed-out")} />;
  }

  let principal: Principal;
  try {
    principal = await provisionUser(identity);
  } catch {
    return <AnalyticsBoundary {...localizedBoundary(en, "unavailable")} />;
  }

  if (principal.user.status !== "active") {
    return <AnalyticsBoundary {...localizedBoundary(en, "inactive")} />;
  }
  if (!principal.roles.includes("admin")) {
    return <AnalyticsBoundary {...localizedBoundary(en, "denied")} />;
  }

  return (
    <main className="analyticsPage">
      <SiteNav active="account" />
      <AdminAnalyticsDashboard
        adminIdentity={{
          displayName: principal.user.displayName,
          email: principal.user.email,
        }}
      />
      <SiteFooter />
    </main>
  );
}
