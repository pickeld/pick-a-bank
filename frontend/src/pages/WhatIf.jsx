import { useEffect, useState } from 'react'
import api from '../api/client'
import { CATEGORY_META } from '../components/TransactionRow'
import { Plus, Trash2, Sparkles } from 'lucide-react'

const SCENARIO_TYPES = [
  { key: 'add_expense',      label: 'הוסף הוצאה קבועה',     icon: '➕', sign: -1 },
  { key: 'remove_expense',   label: 'הסר הוצאה קיימת',      icon: '➖', sign: +1 },
  { key: 'reduce_category',  label: 'הקטן קטגוריה',          icon: '✂️', sign: +1 },
  { key: 'monthly_savings',  label: 'חיסכון חודשי',           icon: '🏦', sign: -1 },
]

function monthLabel(offset) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
}

export default function WhatIf() {
  const [base, setBase]           = useState(null)
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    const loadBase = async () => {
      setLoading(true)
      try {
        const statsRes = await api.get('/transactions/stats')
        const s = statsRes.data
        // Derive base monthly cash flow
        const salary     = s.bankSummary?.lastSalary?.amount   || 0
        const fixed      = s.bankSummary?.monthlyFixed          || 0
        const avgCC      = s.nextCCCharge?.total                || 0
        setBase({ salary, fixed, avgCC })
      } catch (e) { console.error(e) }
      setLoading(false)
    }
    loadBase()
  }, [])

  const addScenario = () => {
    setScenarios(s => [...s, {
      id:       Date.now(),
      type:     'add_expense',
      label:    '',
      amount:   0,
      category: 'dining',
      pct:      10,
    }])
  }

  const updateScenario = (id, patch) => {
    setScenarios(s => s.map(sc => sc.id === id ? { ...sc, ...patch } : sc))
  }

  const removeScenario = (id) => {
    setScenarios(s => s.filter(sc => sc.id !== id))
  }

  // Calculate monthly delta from all scenarios
  const scenarioDelta = scenarios.reduce((total, sc) => {
    const typeMeta = SCENARIO_TYPES.find(t => t.key === sc.type)
    const sign = typeMeta?.sign ?? -1
    if (sc.type === 'reduce_category') {
      // Reduce category by pct — saves (avgCC * catShare * pct/100)
      const catShare = base?.avgCC ? 0.1 : 0  // rough estimate
      return total + sign * (base?.avgCC || 0) * catShare * ((sc.pct || 0) / 100)
    }
    return total + sign * (sc.amount || 0)
  }, 0)

  // 6-month projection
  const months = Array.from({ length: 6 }, (_, i) => {
    const baseFlow    = (base?.salary || 0) - (base?.fixed || 0) - (base?.avgCC || 0)
    const withScenario = baseFlow + scenarioDelta
    return {
      label:    monthLabel(i + 1),
      base:     baseFlow * (i + 1),
      scenario: withScenario * (i + 1),
    }
  })

  const maxVal = Math.max(...months.flatMap(m => [Math.abs(m.base), Math.abs(m.scenario)]), 1)
  const fmt = n => {
    const abs = Math.abs(n)
    const str = `₪${Number(abs).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`
    return n < 0 ? `-${str}` : str
  }

  if (loading) return <div className="p-6 text-gray-500">טוען...</div>

  const monthlyBase = (base?.salary || 0) - (base?.fixed || 0) - (base?.avgCC || 0)

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Sparkles size={22} className="text-purple-400" /> מה אם?
        </h1>
        <p className="text-sm text-gray-500 mt-1">סמולציית תזרים מזומנים — בדוק כיצד שינויים ישפיעו על חשבונך</p>
      </div>

      {/* Base cash flow summary */}
      <div className="bg-gray-800 rounded-xl p-4 md:p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-3">בסיס חודשי (ללא שינויים)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-4 text-center">
          <div>
            <p className="text-xs text-gray-500">משכורת</p>
            <p className="text-lg font-bold text-green-400">{fmt(base?.salary || 0)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">הוצאות קבועות</p>
            <p className="text-lg font-bold text-red-400">-{fmt(base?.fixed || 0)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">חיוב כרטיס ממוצע</p>
            <p className="text-lg font-bold text-orange-400">-{fmt(base?.avgCC || 0)}</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-700 text-center">
          <p className="text-xs text-gray-500 mb-1">תזרים חודשי נטו</p>
          <p className={`text-2xl font-bold ${monthlyBase >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmt(monthlyBase)}
          </p>
        </div>
      </div>

      {/* Scenarios */}
      <div className="bg-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-400">תרחישים</h2>
          <button onClick={addScenario}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg text-sm transition-colors border border-blue-600/30">
            <Plus size={14} /> הוסף תרחיש
          </button>
        </div>

        {scenarios.length === 0 && (
          <p className="text-gray-600 text-sm text-center py-4">הוסף תרחיש כדי לראות את ההשפעה על חשבונך</p>
        )}

        {scenarios.map(sc => {
          const typeMeta = SCENARIO_TYPES.find(t => t.key === sc.type)
          return (
            <div key={sc.id} className="bg-gray-900 rounded-xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 sm:flex-wrap">
                <select value={sc.type}
                  onChange={e => updateScenario(sc.id, { type: e.target.value })}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                  {SCENARIO_TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                </select>

                {sc.type === 'reduce_category' ? (
                  <>
                    <select value={sc.category}
                      onChange={e => updateScenario(sc.id, { category: e.target.value })}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                      {Object.entries(CATEGORY_META).map(([k, v]) => (
                        <option key={k} value={k}>{v.emoji} {v.label}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">הפחתה:</span>
                      <input type="range" min="5" max="100" step="5" value={sc.pct}
                        onChange={e => updateScenario(sc.id, { pct: parseInt(e.target.value) })}
                        className="w-24 accent-blue-500" />
                      <span className="text-sm text-blue-400 w-10">{sc.pct}%</span>
                    </div>
                  </>
                ) : (
                  <>
                    <input type="text" value={sc.label}
                      onChange={e => updateScenario(sc.id, { label: e.target.value })}
                      placeholder="תיאור"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 min-w-0" />
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 text-sm">₪</span>
                      <input type="number" min="0" step="100" value={sc.amount}
                        onChange={e => updateScenario(sc.id, { amount: parseFloat(e.target.value) || 0 })}
                        className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                      <span className="text-xs text-gray-500">/חודש</span>
                    </div>
                  </>
                )}

                <button onClick={() => removeScenario(sc.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors p-1.5">
                  <Trash2 size={15} />
                </button>
              </div>

              {/* Impact preview */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">השפעה חודשית:</span>
                <span className={`font-semibold ${typeMeta?.sign === 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {typeMeta?.sign === 1 ? '+' : '-'}
                  {sc.type === 'reduce_category'
                    ? `${sc.pct}% מהוצאות ${CATEGORY_META[sc.category]?.label}`
                    : fmt(sc.amount)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Projection chart */}
      <div className="bg-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-4">תחזית צבירה — 6 חודשים קדימה</h2>
        <div className="space-y-3">
          {months.map((m, i) => {
            const bPct  = Math.min(Math.abs(m.base     / maxVal) * 100, 100)
            const sPct  = Math.min(Math.abs(m.scenario / maxVal) * 100, 100)
            const bPos  = m.base     >= 0
            const sPos  = m.scenario >= 0
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-24 text-right">{m.label}</span>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-700 rounded-full h-2">
                      <div className={`h-2 rounded-full ${bPos ? 'bg-gray-500' : 'bg-red-500/50'}`} style={{ width: `${bPct}%` }} />
                    </div>
                    <span className={`text-xs tabular-nums w-20 text-left ${bPos ? 'text-gray-400' : 'text-red-400'}`}>{fmt(m.base)}</span>
                  </div>
                  {scenarios.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-700 rounded-full h-2">
                        <div className={`h-2 rounded-full ${sPos ? 'bg-blue-500' : 'bg-red-500'}`} style={{ width: `${sPct}%` }} />
                      </div>
                      <span className={`text-xs tabular-nums w-20 text-left font-semibold ${sPos ? 'text-blue-400' : 'text-red-400'}`}>{fmt(m.scenario)}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {scenarios.length > 0 && (
            <div className="flex items-center gap-4 pt-1 text-xs text-gray-500 border-t border-gray-700 mt-2">
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-gray-500 rounded inline-block" /> ללא שינויים</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-blue-500 rounded inline-block" /> עם תרחישים</span>
              <span className="mr-auto font-semibold text-blue-400">
                הפרש אחרי 6 חודשים: {fmt(months[5].scenario - months[5].base)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
