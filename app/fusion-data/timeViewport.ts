/** Default display window only; never crop or resample the published data. */
export const DEFAULT_TIME_WINDOW_SECONDS = [-0.2, 1.1] as const;

export function fullTimeExtent(ranges: readonly (readonly [number, number])[]): [number, number] {
  return ranges.reduce<[number, number]>((extent, range) => [
    Math.min(extent[0], range[0]),
    Math.max(extent[1], range[1]),
  ], [...DEFAULT_TIME_WINDOW_SECONDS]);
}

export function defaultTimeZoom(xAxisIndex: number[]) {
  return {
    xAxisIndex,
    startValue: DEFAULT_TIME_WINDOW_SECONDS[0],
    endValue: DEFAULT_TIME_WINDOW_SECONDS[1],
    rangeMode: ['value', 'value'] as ['value', 'value'],
    filterMode: 'none' as const,
  };
}
