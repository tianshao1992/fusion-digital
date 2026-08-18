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
        <h1>让每个结论，都能沿关系回到<br/><em>论文、代码与装置证据</em></h1>
        <p>FusionDigital 把物理、工程、控制、诊断和智能原生调研转化为统一的实体—关系—证据网络。图谱不是由大模型自由编造的连线；公开关系来自结构化调研记录，保留来源和更新时间。</p>
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
    <div className="kgPrincipleBand"><span>ENTITY</span><b>实体</b><i>→</i><span>CLAIM</span><b>关系主张</b><i>→</i><span>EVIDENCE</span><b>论文 / 代码 / 官方来源</b><i>→</i><span>DECISION</span><b>可审计结论</b></div>
    <KnowledgeGraphExplorer initial={initial} devices={devices} />
    <section className="platformInlineLink"><span>图谱保留来源与更新时间，并按需加载邻域。</span><Link href="/platform#contracts">查看数据合同与接入路线 →</Link></section>
    <SiteFooter />
  </main>;
  const en=<main className="kgPage">
    <SiteNav active="knowledge" />
    <header className="kgHero">
      <div>
        <p className="kgEyebrow">FUSION KNOWLEDGE GRAPH · EVIDENCE FIRST</p>
        <h1>Let every conclusion trace its relationships back to<br/><em>papers, code and facility evidence</em></h1>
        <p>FusionDigital transforms research on physics, engineering, integrated control, diagnostics and AI-native systems into a unified entity–relationship–evidence network. Edges are not invented by a language model: published relationships come from structured research records and retain their source and update date.</p>
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
    <div className="kgPrincipleBand"><span>ENTITY</span><b>Entity</b><i>→</i><span>CLAIM</span><b>Relationship claim</b><i>→</i><span>EVIDENCE</span><b>Paper / code / official source</b><i>→</i><span>DECISION</span><b>Auditable conclusion</b></div>
    <KnowledgeGraphExplorer initial={initial} devices={devices} />
    <section className="platformInlineLink"><span>The graph retains sources and update dates and loads neighborhoods on demand.</span><Link href="/platform#contracts">View data contracts and the integration route →</Link></section>
    <SiteFooter />
  </main>;
  return <StaticLocaleContent zh={zh} en={en}/>;
}
