import { Typography, Statistic } from 'antd'
import { RiseOutlined, FallOutlined, FieldNumberOutlined } from '@ant-design/icons'

export default function StatsList({ seriesKeys, stats, gradients }) {
  return (
    <div className="stat-list">
      {seriesKeys.map((k, idx) => {
        const [c0, c1] = gradients[idx % gradients.length]
        const s = stats[k] || {}
        return (
          <div className="stat-item" key={k} style={{ borderLeft: `3px solid ${c0}` }}>
            <div className="stat-item-head">
              <span className="series-title">
                <span className="series-dot" style={{ background: c0 }} />
                <Typography.Text style={{ color: c0, fontWeight: 600 }}>{k}</Typography.Text>
              </span>
              <span className="stat-chip">统计</span>
            </div>
            <div className="stat-metrics">
              <Statistic title="均值" value={s.mean ?? '-'} precision={2} valueStyle={{ color: c0, fontWeight: 700 }} />
              <Statistic title="数量" value={s.count ?? '-'} prefix={<FieldNumberOutlined />} valueStyle={{ color: c1, fontWeight: 700 }} />
              <Statistic title="最小" value={s.min ?? '-'} prefix={<FallOutlined />} valueStyle={{ color: '#22c55e', fontWeight: 700 }} />
              <Statistic title="最大" value={s.max ?? '-'} prefix={<RiseOutlined />} valueStyle={{ color: '#ef4444', fontWeight: 700 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
