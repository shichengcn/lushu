import { useEffect, useState } from 'react'
import {
  BarChart3,
  BedDouble,
  Clock3,
  Gauge,
  Landmark,
  Route,
  Users,
  WalletCards,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent'
import {
  DAY_COLORS,
  expensesByCategory,
  legCost,
  stopCost,
  totalCost,
  totalDrivingDistance,
  totalDuration,
  visibleStops,
} from '@/lib/roadbooks'
import type { ExpenseItem, Roadbook } from '@/types'

const CHART_COLORS = [
  '#10a7a2',
  '#ef6548',
  '#e4a11b',
  '#3978f6',
  '#7c5cc4',
  '#1b8a5a',
  '#d34f79',
  '#52717d',
]

function sumExpenses(expenses: ExpenseItem[]) {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0)
}

function numericValue(value: ValueType | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value
  return Number(normalized || 0)
}

function AnalyticsContent({ roadbook }: { roadbook: Roadbook }) {
  const dayData = roadbook.days.map((day, index) => {
    const stops = visibleStops(day)
    const distance = stops.reduce(
      (sum, stop, stopIndex) =>
        sum +
        (stopIndex > 0 && stop.legFromPrevious?.mode === 'driving'
          ? stop.legFromPrevious.distanceKm
          : 0),
      0,
    )
    const drivingMinutes = stops.reduce(
      (sum, stop, stopIndex) =>
        sum + (stopIndex > 0 ? stop.legFromPrevious?.durationMinutes || 0 : 0),
      0,
    )
    const cost = stops.reduce(
      (sum, stop, stopIndex) =>
        sum + stopCost(stop) + (stopIndex > 0 ? legCost(stop.legFromPrevious) : 0),
      0,
    )
    return {
      name: `D${index + 1}`,
      title: day.title,
      date: day.date.slice(5),
      distance: Number(distance.toFixed(1)),
      drivingHours: Number((drivingMinutes / 60).toFixed(1)),
      cost,
      stops: stops.length,
    }
  })
  const categoryData = expensesByCategory(roadbook).map((item, index) => ({
    ...item,
    fill: CHART_COLORS[index % CHART_COLORS.length],
  }))
  const allStops = roadbook.days.flatMap((day) => visibleStops(day))
  const scenicCount = allStops.filter((stop) => stop.type === 'scenic').length
  const hotelCount = allStops.filter((stop) => stop.type === 'hotel').length
  const total = totalCost(roadbook)
  const distance = totalDrivingDistance(roadbook)
  const durationHours = totalDuration(roadbook) / 60
  const drivingHours = dayData.reduce((sum, day) => sum + day.drivingHours, 0)
  const longestDay = dayData.reduce(
    (longest, day) => (day.distance > longest.distance ? day : longest),
    dayData[0] || { distance: 0, title: '暂无路线' },
  )
  const travelerData = roadbook.travelers.map((traveler) => {
    let paid = 0
    roadbook.days.forEach((day) => {
      visibleStops(day).forEach((stop, index) => {
        const expenses = [
          ...stop.expenses,
          ...(index > 0 ? stop.legFromPrevious?.expenses || [] : []),
        ]
        paid += sumExpenses(expenses.filter((expense) => expense.payerId === traveler.id))
      })
    })
    return { ...traveler, paid }
  })
  const sharedExpenses = total - travelerData.reduce((sum, traveler) => sum + traveler.paid, 0)

  return (
    <section className="analytics-dashboard" aria-label="路书汇总分析">
      <header className="analytics-header">
        <div>
          <span>TRIP INSIGHTS</span>
          <h1>{roadbook.title}</h1>
          <p>{roadbook.startDate} 至 {roadbook.endDate} · 自动跟随行程编辑更新</p>
        </div>
        <div className="analytics-members">
          <Users size={16} />
          {roadbook.travelers.length ? (
            roadbook.travelers.map((traveler) => (
              <span key={traveler.id}>
                <i style={{ background: traveler.color }} />
                {traveler.name}
              </span>
            ))
          ) : (
            <span>未设置角色</span>
          )}
        </div>
      </header>

      <div className="metric-grid">
        <div className="metric-item">
          <Route size={20} />
          <span>总里程</span>
          <strong>{distance.toFixed(0)} <small>km</small></strong>
          <em>日均 {(distance / Math.max(1, roadbook.days.length)).toFixed(0)} km</em>
        </div>
        <div className="metric-item">
          <Clock3 size={20} />
          <span>行程时长</span>
          <strong>{durationHours.toFixed(1)} <small>小时</small></strong>
          <em>驾驶约 {drivingHours.toFixed(1)} 小时</em>
        </div>
        <div className="metric-item">
          <WalletCards size={20} />
          <span>总费用</span>
          <strong>¥{total.toLocaleString('zh-CN')}</strong>
          <em>日均 ¥{Math.round(total / Math.max(1, roadbook.days.length)).toLocaleString('zh-CN')}</em>
        </div>
        <div className="metric-item">
          <Landmark size={20} />
          <span>有效节点</span>
          <strong>{allStops.length} <small>站</small></strong>
          <em>{scenicCount} 个景点</em>
        </div>
        <div className="metric-item">
          <BedDouble size={20} />
          <span>住宿</span>
          <strong>{hotelCount} <small>晚</small></strong>
          <em>{roadbook.days.length} 个日程</em>
        </div>
        <div className="metric-item">
          <Gauge size={20} />
          <span>最大日里程</span>
          <strong>{Math.max(0, ...dayData.map((day) => day.distance)).toFixed(0)} <small>km</small></strong>
          <em>{longestDay.title}</em>
        </div>
      </div>

      <div className="analytics-grid">
        <section className="chart-panel chart-wide">
          <header>
            <div>
              <span>每日驾驶</span>
              <strong>里程与驾驶时长</strong>
            </div>
          </header>
          <div className="chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayData}>
                <CartesianGrid stroke="#e7ebee" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} unit="km" />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  unit="h"
                />
                <Tooltip
                  formatter={(value: ValueType | undefined, name: NameType | undefined) => [
                    name === 'distance'
                      ? `${numericValue(value)} km`
                      : `${numericValue(value)} 小时`,
                    name === 'distance' ? '里程' : '驾驶',
                  ]}
                  labelFormatter={(label) => {
                    const day = dayData.find((item) => item.name === label)
                    return `${label} · ${day?.title || ''}`
                  }}
                />
                <Legend formatter={(value) => (value === 'distance' ? '里程' : '驾驶时长')} />
                <Bar
                  yAxisId="left"
                  dataKey="distance"
                  fill="#10a7a2"
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="drivingHours"
                  stroke="#ef6548"
                  strokeWidth={2}
                  dot={{ fill: '#ef6548', r: 3 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="chart-panel">
          <header>
            <div>
              <span>费用构成</span>
              <strong>按项目分类</strong>
            </div>
          </header>
          <div className="chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={2}
                />
                <Tooltip
                  formatter={(value: ValueType | undefined) =>
                    `¥${numericValue(value).toLocaleString('zh-CN')}`
                  }
                />
                <Legend iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="chart-panel">
          <header>
            <div>
              <span>每日花费</span>
              <strong>预算变化</strong>
            </div>
          </header>
          <div className="chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dayData}>
                <CartesianGrid stroke="#e7ebee" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(value: ValueType | undefined) =>
                    `¥${numericValue(value).toLocaleString('zh-CN')}`
                  }
                />
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="#3978f6"
                  strokeWidth={3}
                  dot={{ fill: '#3978f6', r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="analytics-bottom">
        <section className="day-analysis-table">
          <header>
            <span>每日明细</span>
            <strong>路程、节点与费用</strong>
          </header>
          <div className="analysis-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>日程</th>
                  <th>日期</th>
                  <th>节点</th>
                  <th>里程</th>
                  <th>驾驶</th>
                  <th>花费</th>
                </tr>
              </thead>
              <tbody>
                {dayData.map((day, index) => (
                  <tr key={day.name}>
                    <td>
                      <i style={{ background: DAY_COLORS[index % DAY_COLORS.length] }} />
                      {day.name} · {day.title}
                    </td>
                    <td>{day.date}</td>
                    <td>{day.stops}</td>
                    <td>{day.distance.toFixed(1)} km</td>
                    <td>{day.drivingHours.toFixed(1)} h</td>
                    <td>¥{day.cost.toLocaleString('zh-CN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="traveler-costs">
          <header>
            <span>付款统计</span>
            <strong>角色支出</strong>
          </header>
          <div>
            {travelerData.map((traveler) => (
              <p key={traveler.id}>
                <i style={{ background: traveler.color }} />
                <span>{traveler.name}</span>
                <strong>¥{traveler.paid.toLocaleString('zh-CN')}</strong>
              </p>
            ))}
            <p>
              <i className="shared-cost-dot" />
              <span>共同 / 未指定</span>
              <strong>¥{Math.max(0, sharedExpenses).toLocaleString('zh-CN')}</strong>
            </p>
          </div>
        </section>
      </div>
    </section>
  )
}

export function AnalyticsDashboard({ roadbook }: { roadbook: Roadbook }) {
  const [analysis, setAnalysis] = useState({
    version: '',
    progress: 8,
    ready: false,
  })

  useEffect(() => {
    const version = roadbook.updatedAt
    const stages = [
      window.setTimeout(() => setAnalysis({ version, progress: 38, ready: false }), 70),
      window.setTimeout(() => setAnalysis({ version, progress: 72, ready: false }), 150),
      window.setTimeout(() => setAnalysis({ version, progress: 100, ready: false }), 230),
      window.setTimeout(() => setAnalysis({ version, progress: 100, ready: true }), 300),
    ]
    return () => stages.forEach((timeout) => window.clearTimeout(timeout))
  }, [roadbook.updatedAt])

  if (analysis.version !== roadbook.updatedAt || !analysis.ready) {
    const progress = analysis.version === roadbook.updatedAt ? analysis.progress : 8
    return (
      <section className="analytics-progress" aria-live="polite">
        <BarChart3 size={24} />
        <strong>正在分析行程</strong>
        <span>费用、里程、时长与节点数据</span>
        <div>
          <i style={{ width: `${progress}%` }} />
        </div>
        <em>{progress}%</em>
      </section>
    )
  }

  return <AnalyticsContent roadbook={roadbook} />
}

export default AnalyticsDashboard
