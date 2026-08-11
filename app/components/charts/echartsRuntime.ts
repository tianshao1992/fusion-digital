import { BarChart, CustomChart, HeatmapChart, ScatterChart } from 'echarts/charts';
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { use as registerEChartsModules } from 'echarts/core';
import { LabelLayout } from 'echarts/features';
import { SVGRenderer } from 'echarts/renderers';

registerEChartsModules([
  BarChart,
  CustomChart,
  HeatmapChart,
  ScatterChart,
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  LabelLayout,
  SVGRenderer,
]);

export { init } from 'echarts/core';
