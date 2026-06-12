import { useEffect, useState, useCallback } from 'react'
import api from '../api/client'
import TransactionRow from '../components/TransactionRow'
import { Search, Filter, Download } from 'lucide-react'

export default function Transactions() {
  const [txns, setTxns] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ source: 'all', search: '', from: '', to: '' })
  const LIMIT = 50

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = { ...filters, page: p, limit: LIMIT }
      const { data } = await api.get('/transactions', { params })
      setTxns(data.data || [])
      setTotal(data.total || 0)
      setPage(p)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [filters])

  useEffect(() => { load(1) }, [filters])

  const onFilter = e => setFilters(f => ({ ...f, [e.target.name]: e.target.value }))

  const exportCsv = async () => {
    const { data } = await api.get('/transactions', { params: { ...filters, page: 1, limit: 9999 } })
    const rows = [['תאריך', 'עסק', 'סכום ₪', 'מקור', 'כרטיס', 'סוג']]
    data.data.forEach(t => rows.push([t.date, t.business, t.amount_ils, t.source, t.card, t.charge_type]))
    const csv = rows.map(r => r.map(c => `"${c ?? ''}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `transactions-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">פעולות 📋</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} פעולות סה"כ</p>
        </div>
        <button onClick={exportCsv}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 hover:text-white rounded-lg border border-gray-700 transition-colors">
          <Download size={15} />
          ייצוא CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-xl p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative col-span-2 lg:col-span-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text" name="search" value={filters.search} onChange={onFilter}
            placeholder="חיפוש לפי עסק..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pr-8 pl-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select name="source" value={filters.source} onChange={onFilter}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
          <option value="all">כל המקורות</option>
          <option value="isracard">ישראכרט</option>
          <option value="discount">דיסקונט</option>
        </select>
        <input type="date" name="from" value={filters.from} onChange={onFilter}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
        <input type="date" name="to" value={filters.to} onChange={onFilter}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
      </div>

      {/* Table */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold text-gray-500 border-b border-gray-700 uppercase tracking-wider">
          <span className="col-span-2">תאריך</span>
          <span className="col-span-4">עסק</span>
          <span className="col-span-2 text-left">סכום</span>
          <span className="col-span-2">מקור</span>
          <span className="col-span-2">כרטיס</span>
        </div>
        <div className="divide-y divide-gray-700/50">
          {loading ? (
            [...Array(8)].map((_, i) => (
              <div key={i} className="h-12 px-4 flex items-center gap-3 animate-pulse">
                <div className="h-3 bg-gray-700 rounded w-20" />
                <div className="h-3 bg-gray-700 rounded flex-1" />
                <div className="h-3 bg-gray-700 rounded w-16" />
              </div>
            ))
          ) : txns.length === 0 ? (
            <p className="text-center text-gray-600 py-16">לא נמצאו פעולות</p>
          ) : (
            txns.map(t => <TransactionRow key={t.id} txn={t} grid />)
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => load(page - 1)} disabled={page === 1}
            className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 rounded-lg transition-colors">
            ← הקודם
          </button>
          <span className="text-sm text-gray-500 px-2">עמוד {page} מתוך {totalPages}</span>
          <button onClick={() => load(page + 1)} disabled={page === totalPages}
            className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 rounded-lg transition-colors">
            הבא →
          </button>
        </div>
      )}
    </div>
  )
}
