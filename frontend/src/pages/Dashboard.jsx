import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import StatCard from '../components/StatCard'
import SpendingChart from '../components/SpendingChart'
import ScrapeButton from '../components/ScrapeButton'
import TransactionRow, { CATEGORY_META } from '../components/TransactionRow'
import { RefreshCw, Clock, CreditCard } from 'lucide-react'

// ── SVG Donut Chart ─────────────────────────────────────────────────────────

const DONUT_COLORS = [
  '#f97316','#22c55e','#eab308','#38bdf8','#818cf8',
  '#ec4899','#ef4444','#06b6d4','#a855f7','#10b981',
  '#84cc16','#f59e0b','#f43f5e','#78716c','#8b5cf6','#6b7280',
]

function DonutChart({ data, total }) {
  const r = 80, cx = 100, cy = 100
  const circumference = 2 * Math.PI * r
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 100)
    return () => clearTimeout(t)
  }, [])

  let offset = 0
  const slices = data.map((d, i) => {
    const pct = total > 0 ? d.total / total : 0
    const dash = pct * circumference
    const slice = { ...d, dash, gap: circumference - dash, offset, color: DONUT_COLORS[i % DONUT_COLORS.length] }
    offset += dash
    return slice
  })

  const fmt = (n) => `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`

  return (
    <div className="relative flex items-center justify-center">
      <svg width="200" height="200" style={{ transform: 'rotate(-90deg)' }}>
        {/* Background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1f2937" strokeWidth="28" />
        {slices.map((s, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="28"
            strokeDasharray={`${animated ? s.dash : 0} ${circumference - (animated ? s.dash : 0)}`}
            strokeDashoffset={-s.offset}
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        ))}
      </svg>
      <div className="absolute text-center pointer-events-none">
        <p className="text-xs text-gray-500 mb-0.5">סה״כ</p>
        <p className="text-lg font-bold text-white">{fmt(total)}</p>
      </div>
    </div>
  )
}

// ── CC Charge Cards ──────────────────────────────────────────────────────────

function CCChargeCard({ item }) {
  const fmt = (n) => n == null ? '—' : `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`
  // date is DD/MM/YYYY
  const [dd, mm, yyyy] = (item.date || '').split('/')
  const monthName = mm && yyyy
    ? new Date(`${yyyy}-${mm}-01`).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
    : item.date
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col gap-1 min-w-0">
      <p className="text-xs text-gray-500 truncate">{monthName}</p>
      <p className="text-xl font-bold text-white">{fmt(item.charged)}</p>
      <p className="text-xs text-gray-600 flex items-center gap-1"><CreditCard size={11} /> חיוב ישראכרט</p>
    </div>
  )
}

// ── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [recent, setRecent] = useState([])
  const [scrapeStatus, setScrapeStatus] = useState({})
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  async function load() {
    setLoading(true)
    try {
      const [statsRes, txnRes, statusRes] = await Promise.all([
        api.get('/transactions/stats'),
        api.get('/transactions?limit=8&page=1&source=isracard'),
        api.get('/scrape/status'),
      ])
      setStats(statsRes.data)
      setRecent(txnRes.data.data || [])
      setScrapeStatus(statusRes.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const fmt = (n) => n == null ? '—' : `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`

  const categories = stats?.categories || []
  const catTotal = categories.reduce((s, c) => s + parseFloat(c.total || 0), 0)

  const ccCharges = (stats?.ccCharges || []).slice(0, 3)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">דשבורד 💰</h1>
          {scrapeStatus.lastScrape && (
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
              <Clock size={13} />
              סריקה אחרונה: {new Date(scrapeStatus.lastScrape).toLocaleString('he-IL')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
            <RefreshCw size={16} />
          </button>
          <ScrapeButton onDone={load} />
        </div>
      </div>

      {/* Stat Cards */}
      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-gray-800 rounded-xl h-28 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="הוצאות החודש"      value={fmt(stats?.thisMonth?.total)}   sub={`${stats?.thisMonth?.count || 0} פעולות`} color="blue" />
          <StatCard title="הוצאות חודש שעבר"  value={fmt(stats?.lastMonth?.total)}   sub="לעומת חודש שעבר"                          color="purple" />
          <StatCard title="מספר פעולות"        value={stats?.thisMonth?.count ?? '—'} sub="החודש"                                    color="green" />
          <StatCard title="הוצאה גדולה"        value={fmt(stats?.biggest?.amount_ils)} sub={stats?.biggest?.business || '—'}         color="red" />
        </div>
      )}

      {/* CC Monthly Charges */}
      {ccCharges.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
            <CreditCard size={15} /> חיוב ישראכרט חודשי (מחשבון הבנק)
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {ccCharges.map((c, i) => <CCChargeCard key={i} item={c} />)}
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      <div className="bg-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-4">התפלגות הוצאות לפי קטגוריה — החודש</h2>
        {loading || categories.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-6">אין נתוני קטגוריות לחודש זה</p>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Donut */}
            <div className="flex-shrink-0 mx-auto lg:mx-0">
              <DonutChart data={categories} total={catTotal} />
            </div>
            {/* List */}
            <div className="flex-1 space-y-2 w-full">
              {categories.map((c, i) => {
                const meta = CATEGORY_META[c.category] || CATEGORY_META.other
                const pct = catTotal > 0 ? ((c.total / catTotal) * 100).toFixed(1) : 0
                const color = DONUT_COLORS[i % DONUT_COLORS.length]
                return (
                  <button
                    key={c.category}
                    onClick={() => navigate(`/transactions?category=${c.category}`)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-700/50 transition-colors text-right"
                  >
                    <span style={{ background: color }} className="w-3 h-3 rounded-full flex-shrink-0" />
                    <span className="text-lg flex-shrink-0">{meta.emoji}</span>
                    <span className="text-sm text-gray-300 flex-1 text-right">{meta.label}</span>
                    <span className="text-xs text-gray-500 w-10 text-left">{pct}%</span>
                    <span className="text-sm font-semibold text-white tabular-nums w-24 text-left">
                      ₪{Number(c.total).toLocaleString('he-IL', { maximumFractionDigits: 0 })}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Daily Spending Chart */}
      <div className="bg-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-4">הוצאות יומיות — 30 ימים אחרונים</h2>
        <SpendingChart data={stats?.daily || []} />
      </div>

      {/* Recent Transactions */}
      <div className="bg-gray-800 rounded-xl">
        <div className="px-5 py-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-gray-300">פעולות אחרונות</h2>
        </div>
        <div className="divide-y divide-gray-700/50">
          {recent.length === 0 ? (
            <p className="text-center text-gray-600 py-12">אין פעולות עדיין — לחץ "סרוק עכשיו" להתחלה</p>
          ) : (
            recent.map((t) => <TransactionRow key={t.id} txn={t} />)
          )}
        </div>
      </div>
    </div>
  )
}
