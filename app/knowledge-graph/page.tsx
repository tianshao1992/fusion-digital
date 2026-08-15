import type { Metadata } from 'next';
import SiteFooter from '@/app/components/SiteFooter';
import SiteNav from '@/app/components/SiteNav';
import KnowledgeModuleHub from './KnowledgeModuleHub';
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
        <p className="kgEyebrow">FUSION KNOWLEDGE</p>
        <h1>十大模块、研究文档与<br/><em>知识关系</em></h1>
        <p>从一个入口访问聚变物理、工程、控制、诊断、数据与智能相关的页面、报告和可检索关系。</p>
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
    <KnowledgeModuleHub />
    <div id="graph"><KnowledgeGraphExplorer initial={initial} devices={devices} /></div>
    <SiteFooter />
  </main>;
}
