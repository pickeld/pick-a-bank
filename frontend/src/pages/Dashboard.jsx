import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import StatCard from '../components/StatCard'
import SpendingChart from '../components/SpendingChart'
import ScrapeButton from '../components/ScrapeButton'
import TransactionRow, { CATEGORY_META } from '../components/TransactionRow'
import { RefreshCw, Clock, CreditCard, TrendingDown, Wallet, Building2 } from 'lucide-react'

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
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1f2937" strokeWidth="28" />
        {slices.map((s, i) => (
          <circle
            key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color} strokeWidth="28"
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

export default function Dashboard() {
  const [stats, setStats]           = useState(null)
  const [recent, setRecent]         = useState([])
  const [scrapeStatus, setScrapeStatus] = useState({})
  const [loading, setLoading]       = useState(true)
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

  const categories  = stats?.categories || []
  const catTotal    = categories.reduce((s, c) => s + parseFloat(c.total || 0), 0)
  const nextCC      = stats?.nextCCCharge
  const bankSummary = stats?.bankSummary

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
          <StatCard
            title="חיוב ישראכרט הבא"
            value={fmt(nextCC?.total)}
            sub={`${nextCC?.count || 0} פעולות · ${nextCC?.chargeDate || bankSummary?.nextCCChargeDate || '02/07/2026'}`}
            color="orange"
          />
          <StatCard
            title="חיוב קודם"
            value={fmt(stats?.lastMonth?.total)}
            sub={`שולם ${bankSummary?.lastCCChargeDate || '—'}`}
            color="purple"
          />
          <StatCard
            title="משכורת אחרונה"
            value={fmt(bankSummary?.lastSalary?.amount)}
            sub={bankSummary?.lastSalary?.date || '—'}
            color="green"
          />
          <StatCard
            title="הוצאה גדולה"
            value={fmt(stats?.biggest?.amount_ils)}
            sub={stats?.biggest?.business || '—'}
            color="red"
          />
        </div>
      )}

      {/* Bank Status Panel */}
      {!loading && (nextCC || bankSummary) && (
        <div className="bg-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
            <Building2 size={15} /> סטטוס חשבון
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Next CC charge */}
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard size={14} className="text-orange-400" />
                <p className="text-xs text-orange-400 font-medium">חיוב ישראכרט הבא</p>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">{fmt(nextCC?.total)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {nextCC?.count} פעולות · {nextCC?.fromDate} – {nextCC?.toDate}
              </p>
              <p className="text-xs text-orange-400/70 mt-1 font-medium">
                צפוי לחיוב: {nextCC?.chargeDate || bankSummary?.nextCCChargeDate || '02/07/2026'}
              </p>
            </div>

            {/* Last salary */}
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wallet size={14} className="text-green-400" />
                <p className="text-xs text-green-400 font-medium">משכורת אחרונה</p>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">{fmt(bankSummary?.lastSalary?.amount)}</p>
              <p className="text-xs text-gray-500 mt-1">{bankSummary?.lastSalary?.date || '—'}</p>
            </div>

            {/* Monthly fixed costs */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown size={14} className="text-blue-400" />
                <p className="text-xs text-blue-400 font-medium">הוצאות קבועות החודש</p>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">{fmt(bankSummary?.monthlyFixed)}</p>
              <p className="text-xs text-gray-500 mt-1">משכנתא · שכירות · הלוואות · העברות</p>
            </div>

          </div>
        </div>
      )}

      {/* Category Breakdown */}
      <div className="bg-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-4">התפלגות הוצאות לפי קטגוריה — מחזור נוכחי</h2>
        {loading || categories.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-6">אין נתוני קטגוריות</p>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            <div className="flex-shrink-0 mx-auto lg:mx-0">
              <DonutChart data={categories} total={catTotal} />
            </div>
            <div className="flex-1 space-y-2 w-full">
              {categories.map((c, i) => {
                const meta  = CATEGORY_META[c.category] || CATEGORY_META.other
                const pct   = catTotal > 0 ? ((c.total / catTotal) * 100).toFixed(1) : 0
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
            <p className="text-center text-gray-600 py-12">אין פעולות עדיין — לחץ &quot;סרוק עכשיו&quot; להתחלה</p>
          ) : (
            recent.map((t) => <TransactionRow key={t.id} txn={t} />)
          )}
        </div>
      </div>
    </div>
  )
}
