import { useEffect, useState } from 'react'
import api from '../api/client'
import { RefreshCw, TrendingDown } from 'lucide-react'

const fmt = n => n == null ? '—' : `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`

const CATEGORY_COLORS = {
  'מזון': 'bg-green-900 text-green-300',
  'תחבורה': 'bg-blue-900 text-blue-300',
  'בידור': 'bg-purple-900 text-purple-300',
  'קניות': 'bg-yellow-900 text-yellow-300',
  'בריאות': 'bg-red-900 text-red-300',
  'חינוך': 'bg-indigo-900 text-indigo-300',
  'תקשורת': 'bg-cyan-900 text-cyan-300',
}

function RecurringRow({ item }) {
  const variance = item.max_amount - item.min_amount
  const isFixed = variance / (item.avg_amount || 1) < 0.05
  const colorClass = CATEGORY_COLORS[item.category] || 'bg-gray-700 text-gray-300'

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-gray-800 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-white truncate">{item.business}</p>
          {item.category && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colorClass}`}>
              {item.category}
            </span>
          )}
          {isFixed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900 text-green-300 font-medium">
              קבוע
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {item.month_count} חודשים · {item.total_occurrences} פעמים · אחרון: {item.last_date}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-white">{fmt(item.avg_amount)}</p>
        {!isFixed && (
          <p className="text-[10px] text-gray-500">{fmt(item.min_amount)}–{fmt(item.max_amount)}</p>
        )}
      </div>
    </div>
  )
}

export default function RecurringPayments() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    api.get('/recurring')
      .then(r => { setItems(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = items.filter(i =>
    !filter || i.business?.toLowerCase().includes(filter.toLowerCase()) || i.category?.includes(filter)
  )

  const totalMonthly = filtered.reduce((s, i) => s + (parseFloat(i.avg_amount) || 0), 0)

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <RefreshCw size={22} className="text-cyan-400" /> תשלומים קבועים
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">זוהו אוטומטית מהיסטוריית העסקאות</p>
        </div>
      </div>

      {/* Summary */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">תשלומים שזוהו</p>
            <p className="text-xl font-bold text-white">{filtered.length}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">סה"כ חודשי משוער</p>
            <p className="text-xl font-bold text-cyan-400">{fmt(totalMonthly)}</p>
          </div>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="חיפוש עסק או קטגוריה..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />

      {/* List */}
      <div className="bg-gray-800 rounded-xl px-4">
        {loading ? (
          <div className="space-y-3 py-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-700 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <TrendingDown size={32} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">
              {items.length === 0
                ? 'לא זוהו תשלומים קבועים — נדרשות לפחות 2 הופעות בחודשים שונים'
                : 'אין תוצאות לחיפוש זה'}
            </p>
          </div>
        ) : (
          filtered.map((item, i) => <RecurringRow key={i} item={item} />)
        )}
      </div>

      <p className="text-xs text-gray-600 text-center">
        * זיהוי אוטומטי: עסקים שהופיעו ב-2+ חודשים שונים עם סכום דומה (שונות &lt;30%)
      </p>
    </div>
  )
}
