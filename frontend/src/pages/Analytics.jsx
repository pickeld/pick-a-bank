import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { CATEGORY_META } from '../components/TransactionRow'
import {
  TrendingUp, TrendingDown, AlertTriangle, AlertCircle,
  RefreshCw, Repeat, Globe, Copy, Zap, ArrowUpRight, ArrowDownRight,
  BarChart2, CreditCard, Wallet, Target
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n) => n == null ? '—' : `₪${Math.round(Number(n)).toLocaleString('he-IL')}`
const pct = (a, b) => b === 0 ? null : Math.round(((a - b) / b) * 100)

function TrendBadge({ value }) {
  if (value == null) return null
  const up = value > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full
      ${up ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'}`}>
      {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {Math.abs(value)}%
    </span>
  )
}

// ── Mini bar chart (SVG) ──────────────────────────────────────────────────────

function MiniBarChart({ data, valueKey = 'total', labelKey = 'month', color = '#3b82f6' }) {
  if (!data?.length) return null
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1)
  const W = 380, H = 80, barW = Math.floor(W / data.length) - 4

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 20}`} className="overflow-visible">
      {data.map((d, i) => {
        const h = Math.max(2, Math.round(((d[valueKey] || 0) / max) * H))
        const x = i * (barW + 4) + 2
        const y = H - h
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} rx={3} fill={color} opacity={0.85} />
            <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize={9} fill="#6b7280">
              {(d[labelKey] || '').slice(0, 5)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Severity badge ────────────────────────────────────────────────────────────

const SEVERITY = {
  high:   { label: 'גבוה',   cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
  medium: { label: 'בינוני', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  low:    { label: 'נמוך',   cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
}

const ANOMALY_ICONS = {
  unusual_amount:    <Zap size={15} />,
  category_spike:    <TrendingUp size={15} />,
  duplicate_suspect: <Copy size={15} />,
  foreign_transaction: <Globe size={15} />,
  large_transaction: <AlertCircle size={15} />,
}

const ANOMALY_TYPE_LABEL = {
  unusual_amount:      'חיוב חריג',
  category_spike:      'עלייה בקטגוריה',
  duplicate_suspect:   'כפילות חשודה',
  foreign_transaction: "עסקה בחו\"ל",
  large_transaction:   'חיוב גדול',
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, icon, children, className = '' }) {
  return (
    <div className={`bg-gray-800 rounded-xl p-5 ${className}`}>
      <h2 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Analytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/analytics')
      setData(res.data)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">ניתוח פיננסי 📊</h1>
      </div>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-gray-800 rounded-xl h-40 animate-pulse" />
      ))}
    </div>
  )

  if (error) return (
    <div className="p-6">
      <div className="bg-red-900/20 border border-red-800 rounded-xl p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 text-red-400" size={28} />
        <p className="text-red-400 font-medium">שגיאה בטעינת הנתונים</p>
        <p className="text-gray-500 text-sm mt-1">{error}</p>
        <button onClick={load} className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">
          נסה שוב
        </button>
      </div>
    </div>
  )

  const { bankStatus, forecast, trend, anomalies } = data

  const highAnomalies = anomalies.filter(a => a.severity === 'high')
  const mediumAnomalies = anomalies.filter(a => a.severity === 'medium')
  const lowAnomalies = anomalies.filter(a => a.severity === 'low')

  const trendChange = pct(
    trend.sixMonth[trend.sixMonth.length - 1]?.total || 0,
    trend.sixMonth[trend.sixMonth.length - 2]?.total || 0
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ניתוח פיננסי 📊</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data.meta?.totalTransactions?.toLocaleString()} פעולות · עודכן {new Date(data.meta?.computedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Anomaly alert bar (high severity only) */}
      {highAnomalies.length > 0 && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-xl px-5 py-3 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300 flex-1">
            {highAnomalies.length} חריגות בדרגת חומרה גבוהה זוהו — גלול מטה לפרטים
          </p>
          <a href="#anomalies" className="text-xs text-red-400 hover:text-red-300 underline flex-shrink-0">הצג</a>
        </div>
      )}

      {/* ── Row 1: Bank Status + Forecast ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Bank Status */}
        <Section title="מצב בנק דיסקונט" icon={<Wallet size={15} />}>
          <div className="space-y-4">
            {/* Net flow */}
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">תזרים נטו מצטבר</p>
                <p className={`text-3xl font-bold tabular-nums ${bankStatus.discountNetFlow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmt(bankStatus.discountNetFlow)}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">מכלל הפעולות בדיסקונט</p>
              </div>
              <div className="text-left space-y-1">
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-xs text-gray-500">הכנסות</span>
                  <span className="text-sm font-semibold text-green-400">{fmt(bankStatus.discountInflow)}</span>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-xs text-gray-500">הוצאות</span>
                  <span className="text-sm font-semibold text-red-400">{fmt(bankStatus.discountOutflow)}</span>
                </div>
              </div>
            </div>

            {/* Monthly net flow bars */}
            {bankStatus.discountMonthlyFlow.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">תזרים חודשי</p>
                <div className="space-y-2">
                  {bankStatus.discountMonthlyFlow.map((m) => {
                    const isPositive = m.net >= 0
                    return (
                      <div key={m.month} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-16 flex-shrink-0">{m.month}</span>
                        <div className="flex-1 bg-gray-900 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all ${isPositive ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(100, Math.abs(m.net) / Math.max(1, Math.abs(bankStatus.discountNetFlow)) * 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold tabular-nums w-20 text-left ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                          {isPositive ? '+' : ''}{fmt(m.net)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* This month Isracard burn */}
            <div className="border-t border-gray-700 pt-3 grid grid-cols-2 gap-3">
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">הוצאות ישראכרט החודש</p>
                <p className="text-lg font-bold text-white tabular-nums">{fmt(bankStatus.thisMonthIsracard)}</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">קצב שריפה יומי</p>
                <p className="text-lg font-bold text-white tabular-nums">{fmt(bankStatus.dailyBurnRate)}</p>
              </div>
            </div>
          </div>
        </Section>

        {/* Forecast */}
        <Section title="תחזית סוף חודש" icon={<Target size={15} />}>
          <div className="space-y-4">
            {/* Projected total */}
            <div>
              <p className="text-xs text-gray-500 mb-1">חיוב ישראכרט צפוי</p>
              <p className="text-3xl font-bold text-amber-400 tabular-nums">{fmt(forecast.projectedMonthEnd)}</p>
              <p className="text-xs text-gray-600 mt-0.5">
                {forecast.dayOfMonth} מתוך {forecast.daysInMonth} ימים · נותרו {forecast.daysLeft} ימים
              </p>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>התקדמות החודש</span>
                <span>{Math.round((forecast.dayOfMonth / forecast.daysInMonth) * 100)}%</span>
              </div>
              <div className="bg-gray-900 rounded-full h-2.5">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-400 h-2.5 rounded-full transition-all"
                  style={{ width: `${(forecast.dayOfMonth / forecast.daysInMonth) * 100}%` }}
                />
              </div>
            </div>

            {/* vs avg */}
            <div className="bg-gray-900 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">ממוצע 3 חודשים אחרונים</p>
                <p className="text-base font-semibold text-gray-300 tabular-nums">{fmt(bankStatus.avgMonthlySpend)}</p>
              </div>
              {bankStatus.avgMonthlySpend > 0 && (
                <TrendBadge value={pct(forecast.projectedMonthEnd, bankStatus.avgMonthlySpend)} />
              )}
            </div>

            {/* Recurring charges */}
            {forecast.recurringCharges.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2 flex items-center gap-1.5">
                  <Repeat size={11} />
                  חיובים קבועים זוהו ({fmt(forecast.recurringTotal)} סה"כ/חודש)
                </p>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {forecast.recurringCharges.slice(0, 10).map((r, i) => {
                    const meta = CATEGORY_META[r.category] || CATEGORY_META.other
                    return (
                      <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-gray-900/60 rounded-lg">
                        <span className="text-sm">{meta.emoji}</span>
                        <span className="text-xs text-gray-300 flex-1 truncate">{r.business}</span>
                        <span className="text-xs text-gray-500">{r.monthCount} חודשים</span>
                        <span className="text-xs font-semibold text-white tabular-nums">{fmt(r.avgAmount)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* ── Spending Trend ── */}
      <Section title="מגמת הוצאות — 6 חודשים" icon={<BarChart2 size={15} />}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bar chart */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-3">
              <p className="text-xs text-gray-500">ישראכרט — סה"כ חודשי</p>
              {trendChange != null && <TrendBadge value={trendChange} />}
            </div>
            <MiniBarChart data={trend.sixMonth} valueKey="total" labelKey="month" color="#3b82f6" />
            <div className="flex justify-between mt-1">
              {trend.sixMonth.map((m, i) => (
                <div key={i} className="text-center flex-1">
                  <p className="text-xs font-semibold text-white tabular-nums">{fmt(m.total)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Top movers this month vs last */}
          <div>
            <p className="text-xs text-gray-500 mb-3">שינויים בקטגוריות (החודש vs חודש שעבר)</p>
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {trend.byCategory
                .filter(c => c.lastMonth > 0 || c.thisMonth > 0)
                .sort((a, b) => Math.abs(b.thisMonth - b.lastMonth) - Math.abs(a.thisMonth - a.lastMonth))
                .slice(0, 8)
                .map((c) => {
                  const meta = CATEGORY_META[c.category] || CATEGORY_META.other
                  const delta = c.thisMonth - c.lastMonth
                  const deltaUp = delta > 0
                  return (
                    <button
                      key={c.category}
                      onClick={() => navigate(`/transactions?category=${c.category}`)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-700/50 transition-colors text-right"
                    >
                      <span className="text-base flex-shrink-0">{meta.emoji}</span>
                      <span className="text-xs text-gray-300 flex-1 text-right truncate">{meta.label}</span>
                      <span className="text-xs font-semibold text-white tabular-nums">{fmt(c.thisMonth)}</span>
                      {delta !== 0 && (
                        <span className={`text-xs tabular-nums ${deltaUp ? 'text-red-400' : 'text-green-400'}`}>
                          {deltaUp ? '+' : ''}{fmt(delta)}
                        </span>
                      )}
                    </button>
                  )
                })}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Category Trend Detail ── */}
      <Section title="ניתוח קטגוריות — השוואה חודשית" icon={<TrendingUp size={15} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {trend.byCategory
            .filter(c => c.thisMonth > 0 || c.avg3Month > 0)
            .sort((a, b) => b.thisMonth - a.thisMonth)
            .map((c) => {
              const meta = CATEGORY_META[c.category] || CATEGORY_META.other
              const change = pct(c.thisMonth, c.avg3Month)
              const isSpike = change != null && change > 50
              const isDown  = change != null && change < -20

              return (
                <button
                  key={c.category}
                  onClick={() => navigate(`/transactions?category=${c.category}`)}
                  className={`text-right p-3 rounded-xl border transition-colors hover:border-gray-600
                    ${isSpike ? 'bg-red-900/10 border-red-800/40' :
                      isDown  ? 'bg-green-900/10 border-green-800/40' :
                                'bg-gray-900/50 border-gray-700/50'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{meta.emoji}</span>
                    <span className="text-xs font-medium text-gray-300">{meta.label}</span>
                    {change != null && <TrendBadge value={change} />}
                  </div>
                  <p className="text-lg font-bold text-white tabular-nums">{fmt(c.thisMonth)}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-600">ממוצע 3 חודשים</span>
                    <span className="text-xs text-gray-500 tabular-nums">{fmt(c.avg3Month)}</span>
                  </div>
                  {/* Mini progress vs avg */}
                  {c.avg3Month > 0 && (
                    <div className="mt-2 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${isSpike ? 'bg-red-500' : isDown ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(100, (c.thisMonth / (c.avg3Month * 1.5)) * 100)}%` }}
                      />
                    </div>
                  )}
                </button>
              )
            })}
        </div>
      </Section>

      {/* ── Anomalies ── */}
      <Section title={`חריגות וחשדות (${anomalies.length})`} icon={<AlertTriangle size={15} />} className="scroll-mt-4" >
        <div id="anomalies">
          {anomalies.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-2">✅</div>
              <p className="text-gray-400 font-medium">לא זוהו חריגות</p>
              <p className="text-gray-600 text-sm mt-1">כל הפעולות נראות תקינות</p>
            </div>
          ) : (
            <div className="space-y-2">
              {anomalies.map((a, i) => {
                const sev = SEVERITY[a.severity] || SEVERITY.low
                const icon = ANOMALY_ICONS[a.type] || <AlertCircle size={15} />
                const typeLabel = ANOMALY_TYPE_LABEL[a.type] || a.type

                return (
                  <div
                    key={i}
                    className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${sev.cls} bg-opacity-10`}
                  >
                    <div className={`mt-0.5 flex-shrink-0 ${sev.cls.split(' ')[1]}`}>{icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${sev.cls}`}>
                          {sev.label}
                        </span>
                        <span className="text-xs text-gray-400">{typeLabel}</span>
                        {a.date && <span className="text-xs text-gray-600">{a.date}</span>}
                      </div>
                      <p className="text-sm text-gray-200">{a.message}</p>
                      {a.type === 'unusual_amount' && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Z-score: {a.zScore} · ממוצע היסטורי: {fmt(a.meanAmount)}
                        </p>
                      )}
                      {a.type === 'category_spike' && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          עלייה של {a.pctIncrease}% לעומת ממוצע 3 חודשים
                        </p>
                      )}
                      {a.type === 'duplicate_suspect' && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          הפרש: {a.daysDiff} ימים בין הפעולות
                        </p>
                      )}
                      {a.type === 'foreign_transaction' && a.country && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          מטבע: {a.currency} · מדינה: {a.country}
                        </p>
                      )}
                    </div>
                    {a.business && (
                      <button
                        onClick={() => navigate(`/transactions?search=${encodeURIComponent(a.business)}`)}
                        className="flex-shrink-0 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1"
                      >
                        הצג →
                      </button>
                    )}
                    {a.category && (
                      <button
                        onClick={() => navigate(`/transactions?category=${a.category}`)}
                        className="flex-shrink-0 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1"
                      >
                        קטגוריה →
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}
