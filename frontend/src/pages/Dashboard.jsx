import { useEffect, useState } from 'react'
import api from '../api/client'
import StatCard from '../components/StatCard'
import SpendingChart from '../components/SpendingChart'
import ScrapeButton from '../components/ScrapeButton'
import TransactionRow from '../components/TransactionRow'
import { RefreshCw, Clock } from 'lucide-react'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [recent, setRecent] = useState([])
  const [scrapeStatus, setScrapeStatus] = useState({})
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [statsRes, txnRes, statusRes] = await Promise.all([
        api.get('/transactions/stats'),
        api.get('/transactions?limit=10&page=1'),
        api.get('/scrape/status'),
      ])
      setStats(statsRes.data)
      setRecent(txnRes.data.data || [])
      setScrapeStatus(statusRes.data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const fmt = (n) => n == null ? '—' : `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`

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

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-800 rounded-xl h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="הוצאות החודש"    value={fmt(stats?.thisMonth?.total)}  sub={`${stats?.thisMonth?.count || 0} פעולות`} color="blue" />
          <StatCard title="הוצאות חודש שעבר" value={fmt(stats?.lastMonth?.total)}  sub="לעומת חודש שעבר"                           color="purple" />
          <StatCard title="מספר פעולות"     value={stats?.thisMonth?.count ?? '—'} sub="החודש"                                    color="green" />
          <StatCard title="הוצאה גדולה"     value={fmt(stats?.biggest?.amount_ils)} sub={stats?.biggest?.business || '—'}         color="red" />
        </div>
      )}

      {/* Chart */}
      <div className="bg-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-4">הוצאות יומיות — 30 ימים אחרונים</h2>
        <SpendingChart data={stats?.daily || []} />
      </div>

      {/* Recent */}
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
