import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import SiteNav from "@/app/components/SiteNav";
import SiteFooter from "@/app/components/SiteFooter";
import StaticLocaleContent from "@/app/components/StaticLocaleContent";
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocale } from "@/app/i18n/config";
import SearchWorkspace from "./SearchWorkspace";
import { getIndexMetadata } from "./search-core";
import "./search.css";

export async function generateMetadata():Promise<Metadata> {
  const store=await cookies();
  const en=(resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value)??DEFAULT_LOCALE)==='en';
  return {
    title: en?'Knowledge Search and Evidence-Grounded Q&A':'知识检索与证据问答',
    description: en?'Search FusionDigital papers, code, tools, facilities and research records, then use citation-grounded AI analysis to understand fusion digital-twin knowledge.':'检索 FusionDigital 的论文、代码、工具、装置和研究工作，并通过带原始引用的人工智能问答理解聚变数字孪生知识。',
  };
}

export default function SearchPage() {
  const index = getIndexMetadata();
  const zh=<main className="knowledgePage">
    <SiteNav active="knowledge" />
    <header className="knowledgeHero">
      <div>
        <p>FUSIONDIGITAL / AI-NATIVE KNOWLEDGE</p>
        <h1>从一千余条研究记录，<br /><em>回到可核验的答案。</em></h1>
        <div className="knowledgePrinciples"><span>确定性检索</span><span>服务器端模型</span><span>来源强制校验</span><span>证据不足则拒答</span></div>
      </div>
      <aside>
        <p>KNOWLEDGE INDEX</p>
        <strong>{index.statistics.total}</strong>
        <span>条规范化知识记录</span>
        <dl><div><dt>论文</dt><dd>{index.statistics.byType.paper}</dd></div><div><dt>代码</dt><dd>{index.statistics.byType.code}</dd></div><div><dt>研究工作</dt><dd>{index.statistics.byType.work}</dd></div><div><dt>装置</dt><dd>{index.statistics.byType.device}</dd></div></dl>
      </aside>
    </header>
    <section className="knowledgeIntro"><p>01 / SEARCH & ASK</p><h2>模型不替代证据，它负责把问题与证据连接起来。</h2><div><p>搜索接口直接查询经过整理的站内知识索引；问答接口只把已检索且包含来源的记录发送给服务器端模型。</p><p>若模型密钥未配置、服务超时或引用校验失败，系统自动返回确定性结果，不显示未经证据支持的回答。</p></div></section>
    <SearchWorkspace />
    <section className="knowledgeGraphPortal"><div><p>02 / KNOWLEDGE GRAPH</p><h2>从检索结果继续探索论文、代码、装置与任务关系。</h2><span>来源和更新时间随记录保留；数据合同与接入方式集中在平台架构页。</span></div><div className="knowledgePortalActions"><Link href="/knowledge-graph">打开知识图谱 <b>→</b></Link><Link href="/platform#contracts">平台架构</Link></div></section>
    <SiteFooter />
  </main>;
  const en=<main className="knowledgePage">
    <SiteNav active="knowledge" />
    <header className="knowledgeHero">
      <div>
        <p>FUSIONDIGITAL / AI-NATIVE KNOWLEDGE</p>
        <h1>From more than one thousand research records,<br /><em>back to verifiable answers.</em></h1>
        <div className="knowledgePrinciples"><span>Deterministic retrieval</span><span>Server-side models</span><span>Mandatory source validation</span><span>Abstain when evidence is insufficient</span></div>
      </div>
      <aside>
        <p>KNOWLEDGE INDEX</p>
        <strong>{index.statistics.total}</strong>
        <span>normalized knowledge records</span>
        <dl><div><dt>Papers</dt><dd>{index.statistics.byType.paper}</dd></div><div><dt>Code</dt><dd>{index.statistics.byType.code}</dd></div><div><dt>Research records</dt><dd>{index.statistics.byType.work}</dd></div><div><dt>Facilities</dt><dd>{index.statistics.byType.device}</dd></div></dl>
      </aside>
    </header>
    <section className="knowledgeIntro"><p>01 / SEARCH &amp; ASK</p><h2>The model does not replace evidence; it connects questions to evidence.</h2><div><p>The search endpoint queries the curated on-site knowledge index directly. The question-answering endpoint sends only retrieved records with traceable sources to the selected server-side model.</p><p>If no model credential is configured, the service times out, or citation validation fails, the system returns deterministic retrieval results and never presents an unsupported answer as model analysis.</p></div></section>
    <SearchWorkspace />
    <section className="knowledgeGraphPortal"><div><p>02 / KNOWLEDGE GRAPH</p><h2>Continue from search results into relationships among papers, code, facilities and research tasks.</h2><span>Every record retains its sources and update date; data contracts and integration guidance are maintained on the platform architecture page.</span></div><div className="knowledgePortalActions"><Link href="/knowledge-graph">Open knowledge graph <b>→</b></Link><Link href="/platform#contracts">Platform architecture</Link></div></section>
    <SiteFooter />
  </main>;
  return <StaticLocaleContent zh={zh} en={en}/>;
}
