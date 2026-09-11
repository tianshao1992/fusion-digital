import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import SiteFooter from '@/app/components/SiteFooter';
import SiteNav from '@/app/components/SiteNav';
import StaticLocaleContent from '@/app/components/StaticLocaleContent';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocale } from '@/app/i18n/config';
import KnowledgeGraphExplorer from './KnowledgeGraphExplorer';
import { graphDevices, knowledgeGraph, queryKnowledgeGraph } from './data';
import './knowledge-graph.css';

export async function generateMetadata():Promise<Metadata> {
  const store=await cookies();
  const en=(resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value)??DEFAULT_LOCALE)==='en';
  return {
    title: en?'Knowledge Graph | Papers, Code, Facilities and Evidence':'知识图谱｜论文、代码、装置与证据网络',
    description: en?'Interactively explore papers, code, tools, facilities, tasks, organizations and traceable evidence relationships in the FusionDigital research atlas.':'交互检索 FusionDigital 调研中的论文、代码、工具、装置、任务、机构及其可追溯证据关系。',
  };
}

export default function KnowledgeGraphPage() {
  const initial = queryKnowledgeGraph({ domain: 'facility', limit: 350 });
  const devices = graphDevices().map(({ id, label, degree }) => ({ id, label, degree }));
  const zh=<main className="kgPage">
    <SiteNav active="knowledge" />
    <header className="kgHero">
      <div>
        <p className="kgEyebrow">FUSION KNOWLEDGE GRAPH · EVIDENCE FIRST</p>
        <h1>知识图谱</h1>
        <p>探索论文、代码、装置与研究任务之间的关系；来源和更新时间随记录保留。</p>
      </div>
      <dl>
        <div><dt>{knowledgeGraph.statistics.nodes.toLocaleString()}</dt><dd>实体节点</dd></div>
        <div><dt>{knowledgeGraph.statistics.edges.toLocaleString()}</dt><dd>可追溯关系</dd></div>
        <div><dt>{knowledgeGraph.statistics.byType.paper.toLocaleString()}</dt><dd>论文</dd></div>
        <div><dt>{knowledgeGraph.statistics.byType.code.toLocaleString()}</dt><dd>代码资产</dd></div>
        <div><dt>{knowledgeGraph.statistics.byType.device.toLocaleString()}</dt><dd>装置与平台</dd></div>
        <div><dt>{knowledgeGraph.asOf}</dt><dd>证据截止</dd></div>
      </dl>
    </header>
    <details className="researchMethodNote"><summary>图谱来源说明</summary><p>关系来自结构化调研记录，不由模型生成。选择节点可查看论文、代码与官方来源。</p></details>
    <KnowledgeGraphExplorer initial={initial} devices={devices} />
    <section className="platformInlineLink"><span>图谱保留来源与更新时间，并按需加载邻域。</span><Link href="/platform#contracts">查看数据合同与接入路线 →</Link></section>
    <SiteFooter />
  </main>;
  const en=<main className="kgPage">
    <SiteNav active="knowledge" />
    <header className="kgHero">
      <div>
        <p className="kgEyebrow">FUSION KNOWLEDGE GRAPH · EVIDENCE FIRST</p>
        <h1>Knowledge graph</h1>
        <p>Explore relationships among papers, code, facilities and research tasks, with sources and update dates.</p>
      </div>
      <dl>
        <div><dt>{knowledgeGraph.statistics.nodes.toLocaleString('en-US')}</dt><dd>Entity nodes</dd></div>
        <div><dt>{knowledgeGraph.statistics.edges.toLocaleString('en-US')}</dt><dd>Traceable relationships</dd></div>
        <div><dt>{knowledgeGraph.statistics.byType.paper.toLocaleString('en-US')}</dt><dd>Papers</dd></div>
        <div><dt>{knowledgeGraph.statistics.byType.code.toLocaleString('en-US')}</dt><dd>Code assets</dd></div>
        <div><dt>{knowledgeGraph.statistics.byType.device.toLocaleString('en-US')}</dt><dd>Facilities and platforms</dd></div>
        <div><dt>{knowledgeGraph.asOf}</dt><dd>Evidence cut-off</dd></div>
      </dl>
    </header>
    <details className="researchMethodNote"><summary>About graph sources</summary><p>Relationships come from structured research records, not generated links. Select a node to inspect its papers, code and official sources.</p></details>
    <KnowledgeGraphExplorer initial={initial} devices={devices} />
    <section className="platformInlineLink"><span>The graph retains sources and update dates and loads neighborhoods on demand.</span><Link href="/platform#contracts">View data contracts and the integration route →</Link></section>
    <SiteFooter />
  </main>;
  return <StaticLocaleContent zh={zh} en={en}/>;
}
