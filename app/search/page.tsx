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
        <h1>论文、代码与问答</h1>
        <p className="editorialRouteLead">检索站内研究资料，依据来源继续提问。</p>
      </div>
      <aside>
        <p>KNOWLEDGE INDEX</p>
        <strong>{index.statistics.total}</strong>
        <span>条规范化知识记录</span>
        <dl><div><dt>论文</dt><dd>{index.statistics.byType.paper}</dd></div><div><dt>代码</dt><dd>{index.statistics.byType.code}</dd></div><div><dt>研究工作</dt><dd>{index.statistics.byType.work}</dd></div><div><dt>装置</dt><dd>{index.statistics.byType.device}</dd></div></dl>
      </aside>
    </header>
    <details className="researchMethodNote"><summary>检索与问答说明</summary><p>仅依据含来源的站内记录回答。模型未配置、超时或引用校验失败时返回检索结果；证据不足时不生成结论。</p></details>
    <SearchWorkspace />
    <section className="knowledgeGraphPortal"><div><p>02 / KNOWLEDGE GRAPH</p><h2>继续探索知识图谱。</h2><span>来源和更新时间随记录保留；数据合同与接入方式集中在平台架构页。</span></div><div className="knowledgePortalActions"><Link href="/knowledge-graph">打开知识图谱 <b>→</b></Link><Link href="/platform#contracts">平台架构</Link></div></section>
    <SiteFooter />
  </main>;
  const en=<main className="knowledgePage">
    <SiteNav active="knowledge" />
    <header className="knowledgeHero">
      <div>
        <p>FUSIONDIGITAL / AI-NATIVE KNOWLEDGE</p>
        <h1>Papers, code &amp; answers</h1>
        <p className="editorialRouteLead">Find research material and ask questions grounded in its sources.</p>
      </div>
      <aside>
        <p>KNOWLEDGE INDEX</p>
        <strong>{index.statistics.total}</strong>
        <span>normalized knowledge records</span>
        <dl><div><dt>Papers</dt><dd>{index.statistics.byType.paper}</dd></div><div><dt>Code</dt><dd>{index.statistics.byType.code}</dd></div><div><dt>Research records</dt><dd>{index.statistics.byType.work}</dd></div><div><dt>Facilities</dt><dd>{index.statistics.byType.device}</dd></div></dl>
      </aside>
    </header>
    <details className="researchMethodNote"><summary>How search and answers work</summary><p>Answers use retrieved, source-linked records. If a model is unavailable or citation validation fails, search results remain available. Insufficient evidence does not become a generated conclusion.</p></details>
    <SearchWorkspace />
    <section className="knowledgeGraphPortal"><div><p>02 / KNOWLEDGE GRAPH</p><h2>Explore related work in the graph.</h2><span>Every record retains its sources and update date; data contracts and integration guidance are maintained on the platform architecture page.</span></div><div className="knowledgePortalActions"><Link href="/knowledge-graph">Open knowledge graph <b>→</b></Link><Link href="/platform#contracts">Platform architecture</Link></div></section>
    <SiteFooter />
  </main>;
  return <StaticLocaleContent zh={zh} en={en}/>;
}
