import { Card, Space, Segmented, Divider, Typography, Select } from 'antd'
import TimeSeriesChart from './TimeSeriesChart'
import StatsList from './StatsList'

import { useEffect, useState } from 'react'

export default function ChartPanel({ chartType, setChartType, chartHeight, selectedUid, seriesKeys, filtered, gradients, selectedFileName, computedStats }) {
  const [visibleKeys, setVisibleKeys] = useState(seriesKeys)
  useEffect(() => {
    const initial = seriesKeys.slice(0, 1)
    setVisibleKeys(initial.length ? initial : seriesKeys)
  }, [seriesKeys])
  return (
    <Card
      className="panel chart-card"
      title="可视化"
      extra={<Space>
        <Segmented value={chartType} onChange={setChartType} options={[{ label: '折线图', value: 'line' }, { label: '柱状图', value: 'bar' }]} />
        <Select
          mode="multiple"
          allowClear
          value={visibleKeys}
          onChange={setVisibleKeys}
          placeholder="选择需要展示的序列"
          style={{ minWidth: 260 }}
          options={seriesKeys.map((k) => ({ label: k, value: k }))}
          maxTagCount={4}
        />
      </Space>}
      style={{ height: '100%' }}
    >
      {selectedUid ? (
        <TimeSeriesChart seriesKeys={seriesKeys} visibleKeys={visibleKeys} filtered={filtered} gradients={gradients} chartType={chartType} height={chartHeight} selectedFileName={selectedFileName} />
      ) : (
        <div className="empty-state" style={{ height: chartHeight }}>请上传并选择文件</div>
      )}
      {selectedUid && seriesKeys.length > 0 && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <div className="stats-block">
            <div className="stats-header">
              <Typography.Text className="stats-title">统计摘要</Typography.Text>
              {selectedFileName && (<span className="chip">{selectedFileName}</span>)}
            </div>
            <StatsList seriesKeys={visibleKeys} stats={computedStats} gradients={gradients} />
          </div>
        </>
      )}
    </Card>
  )
}
