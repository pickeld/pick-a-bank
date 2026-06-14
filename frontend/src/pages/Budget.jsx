import { useEffect, useState } from 'react'
import api from '../api/client'
import { CATEGORY_META } from '../components/TransactionRow'
import { Wand2, Save, TrendingUp, TrendingDown } from 'lucide-react'

function MonthSelector({ value, onChange }) {
  const months = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const mm   = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    months.push(`${mm}/${yyyy}`)
  }
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
      {months.map(m => <option key={m} value={m}>{m}</option>)}
    </select>
  )
}

function ProgressBar({ actual, budget }) {
  const pct = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0
  const over = budget > 0 && actual > budget
  const color = over ? 'bg-red-500' : pct > 80 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="w-full bg-gray-700 rounded-full h-1.5 mt-1">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function Budget() {
  const now  = new Date()
  const [month, setMonth]   = useState(`${String(now.getMonth() + 1).padStart(2,'0')}/${now.getFullYear()}`)
  const [rows, setRows]     = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  const load = async (m) => {
    const [autoRes, savedRes] = await Promise.all([
      api.get(`/budgets/auto?month=${m}`),
      api.get(`/budgets?month=${m}`),
    ])
    const savedMap = {}
    savedRes.data.forEach(b => { savedMap[b.category] = parseFloat(b.amount) })

    setRows(autoRes.data.budgets.map(b => ({
      category:  b.category,
      suggested: b.suggested,
      actual:    b.actual,
      budget:    savedMap[b.category] ?? b.suggested,
    })))
  }

  useEffect(() => { load(month) }, [month])

  const setRowBudget = (cat, val) => {
    setRows(r => r.map(row => row.category === cat ? { ...row, budget: parseFloat(val) || 0 } : row))
  }

  const autoFill = () => {
    setRows(r => r.map(row => ({ ...row, budget: row.suggested })))
  }

  const onSave = async () => {
    setSaving(true)
    try {
      await api.post('/budgets/bulk', {
        month,
        budgets: rows.map(r => ({ category: r.category, amount: r.budget }))
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const totalBudget = rows.reduce((s, r) => s + (r.budget || 0), 0)
  const totalActual = rows.reduce((s, r) => s + (r.actual || 0), 0)
  const fmt = n => `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">תקציב 📊</h1>
          <p className="text-sm text-gray-500 mt-0.5">הגדר תקציב לפי קטגוריה ועקוב אחר ביצוע</p>
        </div>
        <div className="flex items-center gap-3">
          <MonthSelector value={month} onChange={m => { setMonth(m); }} />
          <button onClick={autoFill}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 rounded-lg text-sm transition-colors border border-purple-600/30">
            <Wand2 size={14} />
            מלא אוטומטית
          </button>
          <button onClick={onSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm transition-colors">
            <Save size={14} />
            {saved ? 'נשמר ✓' : saving ? 'שומר...' : 'שמור תקציב'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">תקציב כולל</p>
          <p className="text-xl font-bold text-white">{fmt(totalBudget)}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">הוצאה בפועל</p>
          <p className={`text-xl font-bold ${totalActual > totalBudget ? 'text-red-400' : 'text-green-400'}`}>{fmt(totalActual)}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">נותר / חריגה</p>
          <p className={`text-xl font-bold flex items-center gap-1 ${totalActual > totalBudget ? 'text-red-400' : 'text-emerald-400'}`}>
            {totalActual > totalBudget
              ? <><TrendingUp size={16} />חריגה {fmt(totalActual - totalBudget)}</>
              : <><TrendingDown size={16} />נותר {fmt(totalBudget - totalActual)}</>}
          </p>
        </div>
      </div>

      {/* Category rows */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="hidden md:grid grid-cols-12 px-4 py-2 text-xs font-semibold text-gray-500 border-b border-gray-700 uppercase tracking-wider">
          <span className="col-span-3">קטגוריה</span>
          <span className="col-span-3">תקציב ₪</span>
          <span className="col-span-2">בפועל</span>
          <span className="col-span-3">התקדמות</span>
          <span className="col-span-1">נותר</span>
        </div>
        <div className="divide-y divide-gray-700/50">
          {rows.map(row => {
            const meta  = CATEGORY_META[row.category] || CATEGORY_META.other
            const delta = (row.budget || 0) - (row.actual || 0)
            const over  = delta < 0
            return (
              <div key={row.category} className="px-4 py-3 hover:bg-gray-700/20 transition-colors">
                <span className="col-span-3 flex items-center gap-2 text-sm">
                  <span>{meta.emoji}</span>
                  <span className="text-gray-300">{meta.label}</span>
                </span>
                <span className="col-span-3">
                  <input
                    type="number" min="0" step="100"
                    value={row.budget || ''}
                    onChange={e => setRowBudget(row.category, e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </span>
                <span className="col-span-2 text-sm text-gray-300">{fmt(row.actual)}</span>
                <span className="col-span-3 pr-2">
                  <ProgressBar actual={row.actual} budget={row.budget} />
                  <span className="text-xs text-gray-500 mt-0.5 block">
                    {row.budget > 0 ? `${Math.round((row.actual / row.budget) * 100)}%` : '—'}
                  </span>
                </span>
                <span className={`col-span-1 text-xs font-semibold tabular-nums ${over ? 'text-red-400' : 'text-emerald-400'}`}>
                  {over ? `-${fmt(-delta)}` : `+${fmt(delta)}`}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bar chart */}
      {rows.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">תקציב לעומת הוצאה בפועל</h2>
          <div className="space-y-3">
            {rows.filter(r => r.budget > 0 || r.actual > 0).map(row => {
              const meta   = CATEGORY_META[row.category] || CATEGORY_META.other
              const maxVal = Math.max(totalBudget / rows.length * 3, row.budget, row.actual, 1)
              const bPct   = Math.min((row.budget / maxVal) * 100, 100)
              const aPct   = Math.min((row.actual / maxVal) * 100, 100)
              const over   = row.actual > row.budget
              return (
                <div key={row.category} className="flex items-center gap-3">
                  <span className="text-sm w-6 text-center">{meta.emoji}</span>
                  <span className="text-xs text-gray-400 w-20 text-right">{meta.label}</span>
                  <div className="flex-1 space-y-1">
                    <div className="h-2 bg-gray-700 rounded-full">
                      <div className="h-2 bg-blue-500/60 rounded-full" style={{ width: `${bPct}%` }} />
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full">
                      <div className={`h-2 rounded-full ${over ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${aPct}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 w-20 text-left tabular-nums">{fmt(row.actual)}</span>
                </div>
              )
            })}
            <div className="flex items-center gap-4 pt-1 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-blue-500/60 rounded inline-block" /> תקציב</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-green-500 rounded inline-block" /> בפועל</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
