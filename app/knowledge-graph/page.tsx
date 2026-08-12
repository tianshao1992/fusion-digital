import type { Metadata } from 'next';
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
    <section className="kgMethod">
      <p className="kgEyebrow">04 / GOVERNANCE</p>
      <h2>图谱是证据索引，不是科学真理的替代品</h2>
      <div><article><span>01</span><h3>唯一实体</h3><p>论文优先用 DOI/URL，代码使用规范仓库 URL，装置和任务采用受控别名，减少同名与重复节点。</p></article><article><span>02</span><h3>关系可追溯</h3><p>SUPPORTED_BY、HAS_CODE、VALIDATED_ON、OPERATES 等关系继承来源记录；没有来源的模型推断不进入公开图谱。</p></article><article><span>03</span><h3>按需展开</h3><p>API 最多返回 800 个高关联节点，页面默认一跳展开，避免把数千个实体一次性推送到浏览器。</p></article><article><span>04</span><h3>可重建快照</h3><p>完整 JSON 由版本化脚本从现有调研数据生成，后续每日智能体只能提出候选变更，审核后再重建。</p></article></div>
    </section>
    <SiteFooter />
  </main>;
}
