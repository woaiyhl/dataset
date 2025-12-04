import { Card, Space, Segmented, Divider, Typography } from 'antd'
import TimeSeriesChart from './TimeSeriesChart'
import StatsList from './StatsList'

export default function ChartPanel({ chartType, setChartType, chartHeight, selectedUid, seriesKeys, filtered, gradients, selectedFileName, computedStats }) {
  return (
    <Card
      className="panel chart-card"
      title="可视化"
      extra={<Space>
        <Segmented value={chartType} onChange={setChartType} options={[{ label: '折线图', value: 'line' }, { label: '柱状图', value: 'bar' }]} />
      </Space>}
      style={{ height: '100%' }}
    >
      {selectedUid ? (
        <TimeSeriesChart seriesKeys={seriesKeys} filtered={filtered} gradients={gradients} chartType={chartType} height={chartHeight} />
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
            <StatsList seriesKeys={seriesKeys} stats={computedStats} gradients={gradients} />
          </div>
        </>
      )}
    </Card>
  )
}

