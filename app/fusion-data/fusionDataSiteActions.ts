/** Resolve only canonical identifiers from the reviewed, already loaded public catalog. */
export function resolvePublishedPulse(records: readonly { pulse: number }[], shotId: string): number {
  const record = records.find(item => String(item.pulse) === shotId);
  if (!record) throw new Error('该炮号不在当前公开快照目录中。');
  return record.pulse;
}

/** The active record and filtered rows remain addressable even in large manifests. */
export function publishedShotContextIds(
  records: readonly { pulse: number }[],
  selectedPulse: number,
  filtered: readonly { pulse: number }[] = [...records].reverse(),
): string[] {
  const known = new Set(records.map(record => record.pulse));
  const ordered = [selectedPulse, ...filtered.map(record => record.pulse), ...[...records].reverse().map(record => record.pulse)];
  return [...new Set(ordered.filter(pulse => known.has(pulse)))].slice(0, 100).map(String);
}

/** A verified empty shot is a successful record selection, not a chart load failure. */
export function publishedShotViewReady(root: Pick<Element, 'querySelector'>, pulse: number, signalCount: number): boolean {
  if (signalCount === 0) {
    return root.querySelector<HTMLElement>('.fusionEmptyShot')?.dataset.shot === String(pulse);
  }
  const panel = root.querySelector<HTMLElement>('.fusionPulsePanel');
  if (panel?.dataset.shot !== String(pulse)) return false;
  const chart = panel.querySelector('[data-echart="fusion-real-discharge-overview"]');
  if (chart?.classList.contains('hasFailed')) throw new Error('信号已选中，但交互图表加载失败，请检查页面后重试。');
  return chart ? chart.classList.contains('isReady') && !!chart.querySelector('.scientificChartMount svg') : panel.dataset.signalIds === '';
}

export function publishedShotSelectionMessage(shot: { pulse: number; signals: readonly unknown[] }): string {
  return `已打开公开快照炮次 ${shot.pulse}；该记录不是实时装置数据。${shot.signals.length === 0 ? '本次快照暂无可发布信号，未显示曲线或替代数据。' : ''}`;
}

export function resolvePublishedSignalSelection(
  signals: readonly { id: string; dataItem: string }[],
  signalIds: readonly string[],
) {
  if (!signalIds.length || signalIds.length > 8 || new Set(signalIds).size !== signalIds.length) {
    throw new Error('请选择 1 至 8 条不重复的公开信号。');
  }
  const selected = signalIds.map(id => signals.find(signal => signal.id === id));
  if (selected.some(signal => !signal)) throw new Error('请求包含当前炮次中不存在的公开信号 ID。');
  return {
    signalIds: [...signalIds],
    focusedSignalId: signalIds[0],
    signalGroup: selected[0]!.dataItem === 'equilibrium' ? 'equilibrium' as const : 'diagnostics' as const,
  };
}
