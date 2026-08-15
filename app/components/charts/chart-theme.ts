'use client';

import type { EChartsCoreOption } from 'echarts/core';
import { useMemo } from 'react';
import { useTheme } from '../theme';

export type ChartThemePalette = {
  mode: 'light' | 'dark';
  background: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  muted: string;
  subtle: string;
  line: string;
  grid: string;
  accent: string;
  accentSoft: string;
  info: string;
  infoSoft: string;
  violet: string;
  tooltipBackground: string;
  tooltipBorder: string;
  tooltipText: string;
};

const PALETTES: Record<ChartThemePalette['mode'], ChartThemePalette> = {
  light: {
    mode: 'light',
    background: '#fffdf8',
    surface: '#f7f3ec',
    surfaceRaised: '#ffffff',
    text: '#2f2b27',
    muted: '#706960',
    subtle: '#8b8379',
    line: '#b9ab9b',
    grid: 'rgba(82, 104, 91, .14)',
    accent: '#c86545',
    accentSoft: '#efd7cc',
    info: '#52685b',
    infoSoft: '#dce4dc',
    violet: '#7d7085',
    tooltipBackground: 'rgba(255, 253, 248, .97)',
    tooltipBorder: '#b9ab9b',
    tooltipText: '#2f2b27',
  },
  dark: {
    mode: 'dark',
    background: '#0b1511',
    surface: '#111d18',
    surfaceRaised: '#18241f',
    text: '#eef8f4',
    muted: '#9fb4aa',
    subtle: '#7f968b',
    line: '#486157',
    grid: 'rgba(120, 164, 157, .12)',
    accent: '#e18766',
    accentSoft: '#4c3027',
    info: '#9aafa0',
    infoSoft: '#2c3c32',
    violet: '#b5a4bd',
    tooltipBackground: 'rgba(7, 16, 13, .96)',
    tooltipBorder: '#4d6a5d',
    tooltipText: '#dcebe4',
  },
};

export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  return useMemo(() => PALETTES[resolvedTheme], [resolvedTheme]);
}

type OptionRecord = Record<string, unknown>;

function asRecord(value: unknown): OptionRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as OptionRecord : null;
}

function themedAxis(axis: unknown, palette: ChartThemePalette): unknown {
  if (Array.isArray(axis)) return axis.map((item) => themedAxis(item, palette));
  const source = asRecord(axis);
  if (!source) return axis;
  const axisLine = asRecord(source.axisLine) ?? {};
  const axisLineStyle = asRecord(axisLine.lineStyle) ?? {};
  const axisLabel = asRecord(source.axisLabel) ?? {};
  const nameTextStyle = asRecord(source.nameTextStyle) ?? {};
  const splitLine = asRecord(source.splitLine) ?? {};
  const splitLineStyle = asRecord(splitLine.lineStyle) ?? {};
  return {
    ...source,
    axisLine: { ...axisLine, lineStyle: { ...axisLineStyle, color: palette.line } },
    axisLabel: { ...axisLabel, color: palette.muted },
    nameTextStyle: { ...nameTextStyle, color: palette.muted },
    splitLine: { ...splitLine, lineStyle: { ...splitLineStyle, color: palette.grid } },
  };
}

function themedTextCollection(value: unknown, palette: ChartThemePalette): unknown {
  if (Array.isArray(value)) return value.map((item) => themedTextCollection(item, palette));
  const source = asRecord(value);
  if (!source) return value;
  const textStyle = asRecord(source.textStyle) ?? {};
  return { ...source, textStyle: { ...textStyle, color: palette.muted } };
}

/**
 * Applies neutral surface, axis, legend and tooltip colours while leaving
 * scientific series colours untouched. This makes existing option objects
 * theme-aware without changing the meaning of their data encodings.
 */
export function applyScientificChartTheme(option: EChartsCoreOption, palette: ChartThemePalette): EChartsCoreOption {
  const source = option as OptionRecord;
  const textStyle = asRecord(source.textStyle) ?? {};
  const tooltip = asRecord(source.tooltip) ?? {};
  const tooltipText = asRecord(tooltip.textStyle) ?? {};
  const axisPointer = asRecord(tooltip.axisPointer) ?? {};
  const pointerLine = asRecord(axisPointer.lineStyle) ?? {};
  return {
    ...source,
    backgroundColor: source.backgroundColor === 'transparent' ? 'transparent' : palette.background,
    textStyle: { ...textStyle, color: palette.text },
    tooltip: {
      ...tooltip,
      backgroundColor: palette.tooltipBackground,
      borderColor: palette.tooltipBorder,
      textStyle: { ...tooltipText, color: palette.tooltipText },
      axisPointer: { ...axisPointer, lineStyle: { ...pointerLine, color: palette.line } },
    },
    legend: themedTextCollection(source.legend, palette),
    visualMap: themedTextCollection(source.visualMap, palette),
    xAxis: themedAxis(source.xAxis, palette),
    yAxis: themedAxis(source.yAxis, palette),
    radiusAxis: themedAxis(source.radiusAxis, palette),
    angleAxis: themedAxis(source.angleAxis, palette),
  } as EChartsCoreOption;
}
