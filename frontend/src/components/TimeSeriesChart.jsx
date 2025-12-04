import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'

export default function TimeSeriesChart({ seriesKeys, filtered, gradients, chartType, height, normalize = false }) {
  const allValues = []
  seriesKeys.forEach((k) => {
    filtered.forEach((d) => {
      const v = d[k]
      if (typeof v === 'number') allValues.push(v)
    })
  })
  const dMin = allValues.length ? Math.min(...allValues) : 0
  const dMax = allValues.length ? Math.max(...allValues) : 1
  const pad = !normalize && dMax !== dMin ? (dMax - dMin) * 0.05 : 0
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
      min: normalize ? 0 : (dMin - pad),
      max: normalize ? 1 : (dMax + pad),
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
      const values = filtered.map((d) => d[k]).filter((v) => typeof v === 'number')
      const min = values.length ? Math.min(...values) : 0
      const max = values.length ? Math.max(...values) : 1
      const toVal = (y) => {
        if (!normalize) return y
        if (typeof y !== 'number') return null
        if (max === min) return 1
        return (y - min) / (max - min)
      }
      return chartType === 'line'
        ? {
          name: k,
          type: 'line',
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 2, color: c1 },
          areaStyle: { color: grad, opacity: 0.25 },
          sampling: 'lttb',
          large: true,
          largeThreshold: 2000,
          animation: false,
          data: filtered.map((d) => [d.time, toVal(d[k])])
        }
        : {
          name: k,
          type: 'bar',
          itemStyle: { color: grad },
          data: filtered.map((d) => [d.time, toVal(d[k])])
        }
    })
  }
  return <ReactECharts style={{ height, width: '100%' }} option={option} notMerge lazyUpdate />
}
