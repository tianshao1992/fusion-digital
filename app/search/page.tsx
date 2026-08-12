import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/app/components/SiteNav";
import SiteFooter from "@/app/components/SiteFooter";
import SearchWorkspace from "./SearchWorkspace";
import { getIndexMetadata } from "./search-core";
import "./search.css";

export const metadata: Metadata = {
  title: "知识检索与证据问答",
  description: "检索 FusionDigital 的论文、代码、工具、装置和研究工作，并通过带原始引用的人工智能问答理解聚变数字孪生知识。",
};

export default function SearchPage() {
  const index = getIndexMetadata();
  return <main className="knowledgePage">
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
    <section className="knowledgeGraphPortal"><div><p>02 / KNOWLEDGE GRAPH</p><h2>从一条结果，展开论文、代码、装置与任务之间的证据关系。</h2><span>图谱默认只加载受限规模的一至两跳邻域，并把每条可见关系链接回结构化来源。</span></div><Link href="/knowledge-graph">打开交互知识图谱 <b>→</b></Link></section>
    <section className="knowledgeBoundary"><p>03 / TRUST BOUNDARY</p><div><h2>当前能力边界</h2><p>本页覆盖现有物理、工程、控制、诊断、智能原生、集成框架与全球装置数据。它不是通用互联网搜索，也不表示所有收录工作已经独立复现。论文、预印本、机构资料、代码仓库和商业工具的证据性质应分别判断。</p></div></section>
    <SiteFooter />
  </main>;
}
