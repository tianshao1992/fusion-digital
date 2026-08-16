type TooltipParams = {
  dataType?: string;
  data?: Record<string, unknown>;
};

const typeLabels: Record<string, string> = {
  research: '研究工作', paper: '论文', code: '代码', device: '装置', tool: '工具', task: '任务', organization: '机构',
};

const domainLabels: Record<string, string> = {
  physics: '物理模拟', engineering: '工程仿真', control: '集成控制', diagnostics: '诊断感知', ai: '智能原生', facility: '装置',
};

function text(value: unknown, fallback = '') {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

function escapeTooltip(value: unknown) {
  return text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatKnowledgeGraphTooltip(params: unknown) {
  const item = (params ?? {}) as TooltipParams;
  const data = item.data ?? {};
  if (item.dataType === 'edge') {
    return `<b>${escapeTooltip(text(data.relation, '关联'))}</b><br/>${escapeTooltip(text(data.evidenceLabel, '点击端点查看证据'))}`;
  }

  const label = text(data.entityLabel, text(data.name, '未命名实体'));
  const type = text(data.entityType);
  const domain = text(data.entityDomain);
  const description = text(data.entityDescription, '暂无详细说明。');
  const degree = text(data.entityDegree, '0');
  return `<div style="max-width:300px;white-space:normal;line-height:1.55"><b>${escapeTooltip(label)}</b><br/>${escapeTooltip(typeLabels[type] ?? type)} · ${escapeTooltip(domainLabels[domain] ?? domain)}<br/><span>${escapeTooltip(description)}</span><br/>关联 ${escapeTooltip(degree)} 条</div>`;
}
