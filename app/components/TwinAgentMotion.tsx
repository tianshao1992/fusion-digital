import './twin-agent-motion.css';

export default function TwinAgentMotion({compact=false}:{compact?:boolean}) {
  return <div className={`taMotion${compact?' compact':''}`} role="img" aria-label="聚变装置通过诊断数据与数字孪生同步，人工智能代理在模型与权限约束下进行分析和规划，经过安全门后由验证控制器执行">
    <div className="taTop"><span>FUSION · TWIN · AGENT LOOP</span><b>SHADOW MODE / HUMAN AUTHORITY</b></div>
    <div className="taScene">
      <section className="taDevice">
        <div className="taTag"><i/>PHYSICAL DEVICE</div>
        <div className="taTorus"><span className="taPlasma"/><span className="taCore"/><i className="sensor s1"/><i className="sensor s2"/><i className="sensor s3"/></div>
        <h3>聚变装置</h3><p>等离子体 · 磁体 · 热工</p>
      </section>
      <div className="taFlow diagnostic"><span>诊断数据</span><i/><i/><i/></div>
      <section className="taTwin">
        <div className="taTag"><i/>DIGITAL TWIN</div>
        <div className="taTwinCore"><span/><span/><span/><b>Δt</b></div>
        <h3>状态与预测</h3><p>物理模型 · 工程约束 · UQ</p>
      </section>
      <div className="taFlow context"><span>可信上下文</span><i/><i/><i/></div>
      <section className="taAgents">
        <div className="taTag"><i/>AI AGENTS</div>
        <div className="taAgentNet"><b className="agent a0">A</b><b className="agent a1">M</b><b className="agent a2">D</b><b className="agent a3">C</b><span className="edge e1"/><span className="edge e2"/><span className="edge e3"/></div>
        <h3>智能体协同</h3><p>检索 · 仿真 · 规划 · 解释</p>
      </section>
      <div className="taReturn"><span>建议</span><i/><strong>权限门 / 安全包络 / 人工批准</strong><i/><span>验证指令</span></div>
    </div>
    <div className="taBottom"><span><i className="fusionDot"/>聚变：能量与物理状态</span><span><i className="aiDot"/>AI：表征、推理与编排</span><span><i className="safeDot"/>控制：确定性安全边界</span></div>
  </div>;
}
