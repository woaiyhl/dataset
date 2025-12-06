import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { useRef, useCallback } from "react";
import axios from "axios";

export default function TimeSeriesChart({
  seriesKeys,
  visibleKeys,
  filtered,
  gradients,
  chartType,
  height,
  normalize = false,
  selectedFileName,
}) {
  const chartRef = useRef(null);
  const selectedRef = useRef(null);
  const API_BASE =
    typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL
      ? `${import.meta.env.VITE_API_URL}/api`
      : "http://localhost:3001/api";
  const keys = visibleKeys && visibleKeys.length ? visibleKeys : seriesKeys;
  const allValues = [];
  keys.forEach((k) => {
    filtered.forEach((d) => {
      const v = d[k];
      if (typeof v === "number") allValues.push(v);
    });
  });
  const dMin = allValues.length ? Math.min(...allValues) : 0;
  const dMax = allValues.length ? Math.max(...allValues) : 1;
  const pad = !normalize && dMax !== dMin ? (dMax - dMin) * 0.05 : 0;
  const option = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: { show: false },
    toolbox: {
      top: 8,
      right: 8,
      feature: {
        saveAsImage: {},
        dataZoom: {},
        restore: {},
        brush: { type: ["rect", "lineX", "keep", "clear"] },
        myExport: {
          show: true,
          title: "导出选区",
          icon: "path://M896 160H128a64 64 0 0 0-64 64v576a64 64 0 0 0 64 64h768a64 64 0 0 0 64-64V224a64 64 0 0 0-64-64zm-64 576H192V288h640v448zM384 448h256v64H384z",
          onclick: () => {
            const ec = chartRef.current?.getEchartsInstance();
            if (!ec || !selectedRef.current) return;
            const { start, end } = selectedRef.current;
            const x1 = ec.convertToPixel({ xAxisIndex: 0 }, start);
            const x2 = ec.convertToPixel({ xAxisIndex: 0 }, end);
            const dom = ec.getDom();
            const w = dom.clientWidth;
            const h = dom.clientHeight;
            const img = new Image();
            img.onload = () => {
              const ratio = img.width / w;
              const sx = Math.max(0, Math.min(x1, x2)) * ratio;
              const sw = Math.max(1, Math.abs(x2 - x1)) * ratio;
              const sy = 0;
              const sh = img.height;
              const canvas = document.createElement("canvas");
              canvas.width = Math.floor(sw);
              canvas.height = Math.floor(sh);
              const ctx = canvas.getContext("2d");
              ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
              const a = document.createElement("a");
              a.href = canvas.toDataURL("image/png");
              a.download = `${selectedFileName || "selection"}.png`;
              a.click();
            };
            img.src = ec.getDataURL({ pixelRatio: 2 });
          },
        },
      },
    },
    grid: { top: 56, left: 48, right: 24, bottom: 72, containLabel: true },
    dataZoom: [{ type: "inside" }, { type: "slider", height: 24 }],
    brush: { xAxisIndex: "all", brushMode: "single", transformable: true },
    xAxis: {
      type: "time",
      axisLabel: { color: "#cbd5e1" },
      axisLine: { lineStyle: { color: "#334155" } },
      splitLine: { show: true, lineStyle: { color: "rgba(148,163,184,0.12)" } },
    },
    yAxis: {
      type: "value",
      scale: true,
      // min: normalize ? 0 : dMin - pad,
      // max: normalize ? 1 : dMax + pad,
      axisLabel: { color: "#cbd5e1" },
      axisLine: { lineStyle: { color: "#334155" } },
      splitLine: { show: true, lineStyle: { color: "rgba(148,163,184,0.12)" } },
    },
    series: keys.map((k, idx) => {
      const [c0, c1] = gradients[idx % gradients.length];
      const grad = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: c0 },
        { offset: 1, color: c1 },
      ]);
      const values = filtered.map((d) => d[k]).filter((v) => typeof v === "number");
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 1;
      const toVal = (y) => {
        if (!normalize) return y;
        if (typeof y !== "number") return null;
        if (max === min) return 1;
        return (y - min) / (max - min);
      };
      let lastCoord = null;
      for (let i = filtered.length - 1; i >= 0; i--) {
        const v = toVal(filtered[i][k]);
        if (typeof v === "number") {
          lastCoord = [filtered[i].time, v];
          break;
        }
      }
      return chartType === "line"
        ? {
            name: k,
            type: "line",
            showSymbol: false,
            smooth: true,
            lineStyle: { width: 2, color: c1 },
            sampling: "lttb",
            large: true,
            largeThreshold: 2000,
            animation: false,
            data: filtered.map((d) => [d.time, toVal(d[k])]),
            // markPoint: {
            //   symbolSize: 48,
            //   label: { color: "#111827" },
            //   itemStyle: { color: "#f59e0b" },
            //   data: [
            //     { type: "max", name: "最大值" },
            //     { type: "min", name: "最小值" },
            //     ...(lastCoord ? [{ coord: lastCoord, name: "最新" }] : []),
            //   ],
            // },
            markLine: {
              symbol: "none",
              label: { color: "#cbd5e1" },
              lineStyle: { type: "dashed", color: c1 },
              data: [{ type: "average", name: "均值" }],
            },
          }
        : {
            name: k,
            type: "bar",
            itemStyle: { color: grad },
            data: filtered.map((d) => [d.time, toVal(d[k])]),
            markPoint: {
              symbolSize: 48,
              label: { color: "#111827" },
              itemStyle: { color: "#f59e0b" },
              data: [
                { type: "max", name: "最大值" },
                { type: "min", name: "最小值" },
                ...(lastCoord ? [{ coord: lastCoord, name: "最新" }] : []),
              ],
            },
            markLine: {
              symbol: "none",
              label: { color: "#cbd5e1" },
              lineStyle: { type: "dashed", color: c1 },
              data: [{ type: "average", name: "均值" }],
            },
          };
    }),
  };
  const handleBrushSelected = useCallback(
    (params) => {
      const ec = chartRef.current?.getEchartsInstance();
      if (!ec) return;
      const batch = params?.batch || [];
      const sel = batch[0]?.selected || [];
      const idxs = [];
      sel.forEach((s) => {
        if (Array.isArray(s.dataIndex)) idxs.push(...s.dataIndex);
      });
      if (!idxs.length) {
        ec.setOption({ series: keys.map(() => ({ markArea: { data: [] } })) }, false);
        return;
      }
      const minIdx = Math.max(0, Math.min(...idxs));
      const maxIdx = Math.min(filtered.length - 1, Math.max(...idxs));
      const start = filtered[minIdx]?.time;
      const end = filtered[maxIdx]?.time;
      if (!start || !end) return;
      selectedRef.current = { start, end };
      const area = [[{ xAxis: start }, { xAxis: end }]];
      ec.setOption({ series: keys.map(() => ({ markArea: { data: [] } })) }, false);
      (async () => {
        try {
          await axios.post(`${API_BASE}/upload-annotations`, {
            name: selectedFileName || "",
            start,
            end,
            series: keys,
          });
        } catch {}
      })();
    },
    [filtered, keys, selectedFileName],
  );

  const onEvents = { brushSelected: handleBrushSelected };
  return (
    <ReactECharts
      ref={chartRef}
      style={{ height, width: "100%" }}
      option={option}
      notMerge
      lazyUpdate
      onEvents={onEvents}
    />
  );
}
