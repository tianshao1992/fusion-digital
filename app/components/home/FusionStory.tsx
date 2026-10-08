import PlasmaTrajectories from './PlasmaTrajectories';
import StoryProgress from './StoryProgress';
import StoryControlTimeline from './StoryControlTimeline';
import { TwinValueDiagram } from './StoryScienceGraphics';
import { LayerDiagram } from './ArchitectureVisuals';
import PowerConversionMap from './PowerConversionMap';
import { capabilities } from './home-content';
import './fusion-story.css';

export function StoryHero({ en }: { en: boolean }) {
  return <section className="ssSection ssHero is-current" id="top" data-story="0" aria-labelledby="story-hero-heading">
    <div className="ssHeroCopy"><p className="ssEyebrow">FUSION DIGITAL TWIN</p><h1 id="story-hero-heading">{en ? <>Fusion begins<br/>in the <em>digital world.</em></> : <>让聚变，<br/>先在<em>数字世界</em>发生。</>}</h1><p className="ssIntro">{en ? 'Connect physics with experiments. Make the next step observable, testable and possible.' : '以物理连接实验，让每一步探索可观测、可推演、可验证。'}</p><div className="ssActions"><a className="ssButton" href="/digital-prototype">{en ? 'Explore the digital twin' : '探索数字孪生'}</a><a className="ssTextLink" href="#power-plant">{en ? 'Discover the vision' : '从等离子体开始'}</a></div></div>
    <PlasmaTrajectories en={en}/>
    <div className="ssHeroBottom"><span>{en ? 'TOWARD BURNING PLASMA' : '迈向燃烧等离子体'}</span><a href="#power-plant">{en ? 'SCROLL TO EXPLORE' : '向下，展开聚变的可能'}</a><span>01 / 06</span></div>
  </section>;
}

function Chapter({ number, label, en }: { number: string; label: string; en: boolean }) {
  return <p className="ssChapter"><span>{number} / 06</span><span>{label}</span><span aria-hidden="true">{en ? 'FUSIONDIGITAL' : '聚变数字孪生'}</span></p>;
}

export default function FusionStory({ en }: { en: boolean }) {
  return <><StoryProgress en={en}/><StoryHero en={en}/>
    <section className="ssSection ssPlant" id="power-plant" data-story="1" aria-labelledby="plant-heading">
      <Chapter number="02" label="FROM PLASMA TO POWER" en={en}/>
      <div className="pcHeading"><h2 id="plant-heading">{en ? <>Toward a power plant.<br/><em>More than one pathway.</em></> : <>面向一座电厂，<br/><em>不止一种路径。</em></>}</h2><div><p>{en ? 'Compare conversion pathways in the digital twin, from plasma energy to net electrical output.' : '从等离子体能量到净电力输出，在数字孪生中比较不同转换路径。'}</p><a className="ssUnderlink" href="/roadmap">{en ? 'Explore the roadmap' : '探索电厂级孪生路线'}</a></div></div>
      <PowerConversionMap en={en}/>
      <div className="ssSectionFoot"><span>{en ? 'FUTURE SYSTEM CONCEPT' : '未来系统概念'}</span><details><summary>{en ? 'Physics note' : '物理说明'}</summary><p>{en ? 'Only deposited fusion-product energy contributes to plasma self-heating. Thermal conversion needs heat rejection. External electricity supplies startup or a deficit. The routes depend on energy accessibility and engineering conditions, not on a fuel name alone. This concept is not evidence that EXL-50U has achieved burning plasma or electricity generation.' : '仅沉积在等离子体内的聚变产物能量参与自加热；热转换需要排热，启动或功率不足时需要外部供电。路线适用性取决于能量可达性与工程条件，不能仅凭燃料名称判断。本图不代表 EXL-50U 已实现燃烧等离子体或发电。'}</p><a href="https://www.iter.org/faqs" target="_blank" rel="noreferrer">{en ? 'ITER: burning plasma' : 'ITER：燃烧等离子体定义'}</a></details></div>
    </section>

    <section className="ssSection ssArchitecture" id="architecture" data-story="2" aria-labelledby="architecture-heading">
      <Chapter number="03" label="THREE LAYERS. ONE LOOP." en={en}/>
      <h2 id="architecture-heading">{en ? <>Three layers. <em>One evolving system.</em></> : <>三层智能。<em>一个演进闭环。</em></>}</h2>
      <div className="ssArchitectureFlow">
        <article><LayerDiagram layer="agent" en={en}/><span className="ssLayerNumber">01</span><p>{en ? 'RECURSIVE SELF-IMPROVEMENT' : '递归自我改进'}</p><h3>FusionEvolve</h3><span>{en ? 'Evaluation feedback improves the agent’s own tools, strategies and workflows.' : '在评测反馈中，迭代自身策略、工具与工作流。'}</span><small>{en ? 'Cross-device · iterative evolution' : '跨装置 · 迭代进化'}</small></article>
        <div className="ssLayerLink" data-from="FusionEvolve" data-to="FusionDigital"><span>{en ? 'Proposals' : '候选方案'}</span><b aria-hidden="true">→</b></div>
        <article><LayerDiagram layer="twin" en={en}/><span className="ssLayerNumber">02</span><p>{en ? 'SIMULATE & ACCELERATE' : '物理计算与快速推演'}</p><h3>FusionDigital</h3><span>{en ? 'Calibrate fast models with high-fidelity MHD, toward online state prediction.' : '以高保真 MHD 校准快速模型，面向在线状态推演。'}</span><small>{en ? 'Between-shot calibration · online inference target' : '跨炮校准 · 在线推演目标'}</small></article>
        <div className="ssLayerLink" data-from="FusionDigital" data-to="FusionControl"><span>{en ? 'Validated policies' : '已验证策略'}</span><b aria-hidden="true">→</b></div>
        <article><LayerDiagram layer="control" en={en}/><span className="ssLayerNumber">03</span><p>{en ? 'TRACK & REGULATE' : '精确跟踪与控制'}</p><h3>FusionControl</h3><span>{en ? 'Closed-loop feedback tracks plasma shape and current targets.' : '以闭环反馈，跟踪等离子体位形与电流目标。'}</span><small>{en ? 'Within shot · sub-ms target' : '单炮 · 亚毫秒级目标'}</small></article>
      </div>
      <div className="ssExperimentReturn" data-from="device" data-to="digital-twin-and-agents"><span aria-hidden="true">↶</span><span>{en ? 'EXPERIMENTAL FEEDBACK' : '真实装置反馈'}</span><p>{en ? 'Calibrate the twin. Evaluate the agent. Improve the next iteration.' : '实验校准孪生，评测驱动智能体进入下一轮进化。'}</p><span>EXL-50U / {en ? 'Future devices' : '未来装置'}</span></div>
      <div className="ssSectionFoot"><a className="ssUnderlink" href="/vision">{en ? 'Explore the architecture' : '了解完整技术架构'}</a><span>{en ? 'Architecture vision · evolve → validate → operate → learn' : '架构愿景 · 进化 → 验证 → 运行 → 学习'}</span><details><summary>{en ? 'About these diagrams' : '图解说明'}</summary><p>{en ? 'RSI illustrates evaluated changes to agent tools and workflows, not autonomous deployment. The MHD field is an analytic illustration; the response curves are synthetic. Neither is experimental evidence. Online inference is a target for calibrated fast models, not a claim of real-time full MHD; latency requires model- and hardware-specific benchmarks. Device execution requires expert authorization and independent safety systems; this website does not connect to device actuators.' : 'RSI 表达经评测的智能体工具与工作流迭代，不代表自主部署。磁流体场是解析示意，控制曲线是合成响应，均不是实验结果。在线推演面向经过校准的快速模型，不表示完整 MHD 已实现实时计算；时延需结合具体模型与硬件实测。装置执行需要专家授权与独立安全系统；本网站不连接装置执行器。'}</p></details></div>
    </section>

    <section className="ssSection ssValue" id="twin-value" data-story="3" aria-labelledby="value-heading">
      <Chapter number="04" label="BEYOND ALGORITHMS" en={en}/>
      <div className="ssValueHeading"><h2 id="value-heading">{en ? <>The next frontier of AI<br/>is <em>making it work.</em></> : <>AI 的下一步，<br/>不止于<em>算法。</em></>}</h2><p>{en ? 'For fusion, intelligence matters when it can be tested, extended and improved.' : '面向聚变，真正的价值在于：如何验证，如何高效外推，如何持续进化。'}</p></div>
      <div className="ssValueLayout"><TwinValueDiagram en={en}/><div className="ssValueRows">{[
        ['01', '验证', 'Verify', '让算法接受物理与实验的检验。', 'Test algorithms against physics and experiments.', '把“看起来有效”变成“有证据可依”。', 'Turn a promising result into an evidence-backed one.'],
        ['02', '外推', 'Extend', '以更少的真实实验，探索更多未知工况。', 'Explore more conditions with fewer physical experiments.', '用孪生筛选假设，用实验检验边界。', 'Screen hypotheses in the twin. Test the boundary in reality.'],
        ['03', '进化', 'Evolve', '让每一次运行，成为下一次改进的起点。', 'Make each run the starting point of the next improvement.', '数据回流，模型校准，策略迭代。', 'Return data. Calibrate models. Refine policies.'],
      ].map(([number, zh, english, zhCopy, enCopy, zhSmall, enSmall]) => <article key={number}><span>{number}</span><h3>{en ? english : zh}</h3><div><p>{en ? enCopy : zhCopy}</p><small>{en ? enSmall : zhSmall}</small></div></article>)}</div></div>
      <div className="ssSectionFoot"><span>{en ? 'DATA × PHYSICS × EXPERIMENTS' : '数据 × 物理 × 实验'}</span><a className="ssUnderlink" href="/simulations">{en ? 'Explore simulation engines' : '进入仿真引擎'}</a></div>
    </section>

    <section className="ssSection ssControl" id="exl50u-case" data-story="4" aria-labelledby="control-heading">
      <Chapter number="05" label="PROVEN THROUGH OPERATION" en={en}/>
      <div className="ssControlLayout"><div className="ssCopy"><p className="ssDevice">EXL-50U</p><h2 id="control-heading">{en ? <>From first trials<br/>to <em>everyday operation.</em></> : <>从一次验证，<br/>到<em>常态化运行。</em></>}</h2><div className="ssBigMetric"><strong>700<span>+</span></strong><p>{en ? 'DRL controller applications' : '次 DRL 控制器应用'}</p></div><div className="ssControlMetrics"><div><strong>≤ 2 <small>cm</small></strong><span>{en ? 'Shape-control error' : '位形控制误差'}</span></div><div><strong>&lt; 10 <small>kA</small></strong><span>{en ? 'Plasma-current error' : '电流控制误差'}</span></div><div><strong>400–600 <small>kA</small></strong><span>{en ? 'Current plateaus covered' : '覆盖电流平台'}</span></div></div><p className="ssControlCaption">{en ? 'Supporting locked-mode, high-ion-temperature and fusion-reaction experiments.' : '支持锁模研究、高离子温度提升与氢硼聚变反应等物理实验。'}</p><figure className="ssArt ssDeviceArt"><img src="/photos/exl50u-device.jpg" width="1300" height="678" loading="lazy" alt={en ? 'EXL-50U experimental device at ENN' : '新奥 EXL-50U 实验装置'}/><figcaption>{en ? 'EXL-50U · DEVICE PHOTOGRAPH / ENN' : 'EXL-50U · 装置实景 / 新奥'}</figcaption></figure><a className="ssUnderlink" href="/control/exl50u">{en ? 'Explore the control case' : '查看完整控制案例'}</a></div><StoryControlTimeline en={en}/></div>
      <div className="ssSectionFoot"><span>{en ? 'RESULTS REPORTED BY THE EXL-50U TEAM' : 'EXL-50U 团队报告结果'}</span><span>{en ? 'From validation to application' : '让智能接受真实装置的检验'}</span></div>
    </section>

    <section className="ssSection ssFuture" id="agent-future" data-story="5" aria-labelledby="future-heading">
      <Chapter number="06" label="THE NEXT POSSIBILITY" en={en}/>
      <div className="ssFutureHeading"><h2 id="future-heading">{en ? <>Give agents a world<br/>where ideas <em>can be tested.</em></> : <>让智能体，<br/>拥有一个<em>可验证的试验场。</em></>}</h2><p>{en ? 'An agent proposes a question. A digital twin explores the possibilities. Experiments turn the answer into new knowledge.' : '智能体提出问题，数字孪生推演可能，真实实验让答案成为新的知识。'}</p></div>
      <div className="ssFutureVisual"><div className="ssFutureBridge"><div><small>{en ? 'ASK BETTER QUESTIONS' : '提出更好的问题'}</small><strong>FusionEvolve</strong></div><span aria-hidden="true">×</span><div><small>{en ? 'TEST MORE POSSIBILITIES' : '检验更多的可能'}</small><strong>FusionDigital</strong></div></div>
      <figure className="ssArt ssTwinArt"><img src="/images/story/agent-twin.png" width="1536" height="1024" loading="lazy" alt={en ? 'Concept illustration linking a physical device with its digital twin' : '实体装置与数字孪生对应关系的概念插画'}/><figcaption>{en ? 'PHYSICAL × DIGITAL · CONCEPT ILLUSTRATION' : '物理 × 数字 · 概念插画'}</figcaption></figure></div>
      <ol className="ssFutureLoop">{(en ? ['Form a hypothesis', 'Run the twin', 'Compare evidence', 'Design an experiment', 'Learn & refine'] : ['提出假设', '调用孪生', '比较证据', '设计实验', '学习与迭代']).map((text, i) => <li key={text}><span>{String(i + 1).padStart(2, '0')}</span>{text}</li>)}</ol>
      <div className="ssFutureActions"><a className="ssButton" href="/ai">{en ? 'Explore fusion AI' : '探索聚变人工智能'}</a><a className="ssUnderlink" href="mailto:liutianyuan@enn.cn">{en ? 'Start a conversation' : '与我们交流'}</a><small>{en ? 'Future direction · expert-guided experiments' : '未来方向 · 专家引导的实验探索'}</small></div>
      <div className="ssWorkspace" id="capabilities"><span>{en ? 'YOUR WORKSPACE' : '进入功能区'}</span><div>{capabilities.map(item => <a key={item.id} href={item.href}>{item.title[en ? 1 : 0]}</a>)}</div><a href="/explore">{en ? 'All research fields' : '全部研究领域'}</a></div>
      <footer className="ssFooter" id="about"><span>FusionDigital</span><span>{en ? 'ENN Fusion AI Team' : '新奥聚变人工智能团队'}</span><a href="mailto:liutianyuan@enn.cn">liutianyuan@enn.cn</a><a href="/platform">{en ? 'Platform' : '平台架构与接入'}</a></footer>
    </section>
  </>;
}
