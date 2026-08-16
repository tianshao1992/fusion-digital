import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/app/components/SiteFooter';
import SiteNav from '@/app/components/SiteNav';
import KnowledgeGraphExplorer from './KnowledgeGraphExplorer';
import { graphDevices, knowledgeGraph, queryKnowledgeGraph } from './data';
import './knowledge-graph.css';

export const metadata: Metadata = {
  title: '知识图谱｜论文、代码、装置与证据网络',
  description: '交互检索 FusionDigital 调研中的论文、代码、工具、装置、任务、机构及其可追溯证据关系。',
};

export default function KnowledgeGraphPage() {
  const initial = queryKnowledgeGraph({ domain: 'facility', limit: 350 });
  const devices = graphDevices().map(({ id, label, degree }) => ({ id, label, degree }));
  return <main className="kgPage">
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
}
