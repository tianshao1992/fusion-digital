/** Functional diagram, not a device drawing or experimental measurement. */

export function TwinValueDiagram({ en }: { en: boolean }) {
  return <figure className="ssArt ssValueArt">
    <svg className="ssValueDiagram" viewBox="0 0 480 355" role="img" aria-labelledby="value-diagram-title value-diagram-desc">
      <title id="value-diagram-title">{en ? 'Validate, extend, learn' : '验证、外推与学习'}</title>
      <desc id="value-diagram-desc">{en ? 'A schematic operating space: observations validate a model inside a bounded region. New experiments test candidate conditions beyond it and return evidence. This is not measured data.' : '示意工况空间：观测在有限区域内验证模型，区域外候选工况通过新实验检验，再回流证据。非实测数据。'}</desc>
      <path className="diagramAxis" d="M37 27V282H448"/>
      <path className="diagramEnvelope" d="M55 247C67 172 122 129 181 147S294 200 405 51L437 100C300 248 238 187 188 209S100 208 55 274Z"/>
      <path className="diagramModel" strokeDasharray="5 7" d="M190 174C250 193 314 171 422 77"/>
      <path className="diagramModel" d="M55 262C83 199 137 148 190 174"/>
      <ellipse cx="127" cy="214" rx="90" ry="51" fill="none" stroke="var(--color-info)" strokeDasharray="3 5" transform="rotate(-30 127 214)"/>
      {[[66, 248], [91, 219], [117, 181], [149, 171], [178, 173]].map(([x,y]) => <circle className="diagramSample" key={x} cx={x} cy={y} r="5"/>)}
      <circle cx="346" cy="141" r="8" fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="2"/>
      <path d="M348 156C345 290 193 315 132 278" fill="none" stroke="var(--color-accent)" strokeWidth="1.5"/>
      <path d="m131 277 14 1-6 10" fill="none" stroke="var(--color-accent)" strokeWidth="1.5"/>
      <text x="52" y="120">{en ? 'Validated conditions' : '已验证工况'}</text>
      <path className="diagramAxis" d="M105 129V165"/>
      <text x="288" y="38">{en ? 'Conditions to explore' : '待探索工况'}</text>
      <text x="353" y="164">{en ? 'Test' : '新实验'}</text>
      <text x="226" y="305">{en ? 'Evidence updates the model' : '证据回流 · 模型更新'}</text>
      <circle cx="52" cy="332" r="4" className="diagramSample"/><text x="64" y="337">{en ? 'Observations' : '观测'}</text>
      <path className="diagramModel" d="M168 332H188"/><text x="200" y="337">{en ? 'Model' : '模型'}</text>
      <rect x="285" y="326" width="18" height="12" className="diagramEnvelope"/><text x="316" y="337">{en ? 'Uncertainty' : '不确定性'}</text>
    </svg>
    <figcaption>{en ? 'METHOD SCHEMATIC · NOT EXPERIMENTAL DATA' : '方法示意 · 非实验数据'}</figcaption>
  </figure>;
}
