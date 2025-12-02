import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'

export default function TimeSeriesChart({ seriesKeys, filtered, gradients, chartType, height }) {
  const option = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { data: seriesKeys, left: 'center', top: 8, itemGap: 18, textStyle: { color: '#cbd5e1' } },
    toolbox: { top: 8, right: 8, feature: { saveAsImage: {}, dataZoom: {}, restore: {} } },
    grid: { top: 56, left: 48, right: 24, bottom: 72, containLabel: true },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 24 }],
    xAxis: {
      type: 'time',
      axisLabel: { color: '#cbd5e1' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { show: true, lineStyle: { color: 'rgba(148,163,184,0.12)' } },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: '#cbd5e1' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { show: true, lineStyle: { color: 'rgba(148,163,184,0.12)' } },
    },
    series: seriesKeys.map((k, idx) => {
      const [c0, c1] = gradients[idx % gradients.length]
      const grad = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: c0 },
        { offset: 1, color: c1 },
      ])
      return chartType === 'line'
        ? {
            name: k,
            type: 'line',
            showSymbol: false,
            smooth: true,
            lineStyle: { width: 2, color: c1 },
            areaStyle: { color: grad, opacity: 0.25 },
            data: filtered.map((d) => [d.time, d[k]])
          }
        : {
            name: k,
            type: 'bar',
            itemStyle: { color: grad },
            data: filtered.map((d) => [d.time, d[k]])
          }
    })
  }
  return <ReactECharts style={{ height, width: '100%' }} option={option} notMerge lazyUpdate />
}
