export function siteActionAbortError() { return new DOMException('操作已取消。', 'AbortError'); }

/** Resolve after the supplied display work runs on a real browser frame. */
export function renderSiteActionFrame(render: () => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame = 0;
    let settled = false;
    const timer = setTimeout(() => finish(new Error('页面未及时渲染，请返回该页面后重试。')), 2_000);
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(siteActionAbortError());
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    frame = requestAnimationFrame(() => {
      if (signal.aborted) return abort();
      try { render(); finish(); } catch (error) { finish(error); }
    });
  });
}
