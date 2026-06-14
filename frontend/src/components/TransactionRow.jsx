import { useState, useRef, useEffect } from 'react'
import api from '../api/client'

export const CATEGORY_META = {
  dining:        { emoji: '🍽️', label: 'מסעדות',          color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  groceries:     { emoji: '🛒', label: 'סופר / מכולת',    color: 'bg-green-500/20 text-green-300 border-green-500/30' },
  household:     { emoji: '🏠', label: 'בית',             color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  transport:     { emoji: '🚗', label: 'תחבורה',          color: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  travel:        { emoji: '✈️', label: 'נסיעות',          color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  shopping:      { emoji: '🛍️', label: 'קניות',           color: 'bg-pink-500/20 text-pink-300 border-pink-500/30' },
  health:        { emoji: '💊', label: 'בריאות',          color: 'bg-red-500/20 text-red-300 border-red-500/30' },
  telecom:       { emoji: '📱', label: 'תקשורת',          color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  entertainment: { emoji: '🎬', label: 'בידור',           color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  finance:       { emoji: '💰', label: 'פיננסים',         color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  kids:          { emoji: '👶', label: 'ילדים',           color: 'bg-lime-500/20 text-lime-300 border-lime-500/30' },
  pets:          { emoji: '🐾', label: 'חיות מחמד',       color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  personal:      { emoji: '💅', label: 'טיפוח',           color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  rent:          { emoji: '🏗️', label: 'שכירות / משכנתא', color: 'bg-stone-500/20 text-stone-300 border-stone-500/30' },
  transfers:     { emoji: '💸', label: 'העברות',          color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
  other:         { emoji: '❓', label: 'אחר',             color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
}

const ALL_CATEGORIES = Object.keys(CATEGORY_META)

const SOURCE_BADGE = {
  isracard: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  discount: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
}

function isDebit(txn) {
  if (txn.source === 'isracard') return true
  return txn.charge_type === 'חיוב'
}

function CardLabel({ source, card }) {
  const name = source === 'isracard' ? 'ישראכרט' : 'דיסקונט'
  const suffix = card && String(card).trim().length > 0
    ? ` ****${String(card).trim().slice(-4)}`
    : ''
  return <>{name}{suffix}</>
}

function ForeignBadge({ amount, currency }) {
  if (!amount || !currency) return null
  const formatted = Number(amount).toLocaleString('he-IL', { maximumFractionDigits: 2 })
  return (
    <span className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
      ({formatted} {currency})
    </span>
  )
}

function CategoryPill({ category, editable, txnId, onChanged }) {
  const meta = CATEGORY_META[category] || CATEGORY_META.other
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const select = async (cat) => {
    setSaving(true)
    setOpen(false)
    try {
      await api.patch(`/transactions/${txnId}`, { category: cat })
      onChanged?.(txnId, cat)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  if (!editable) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${meta.color}`}>
        <span>{meta.emoji}</span>
        <span className="hidden sm:inline">{meta.label}</span>
      </span>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-opacity ${meta.color} ${saving ? 'opacity-50' : 'hover:opacity-80 cursor-pointer'}`}
      >
        <span>{meta.emoji}</span>
        <span className="hidden sm:inline">{meta.label}</span>
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-48 py-1 max-h-72 overflow-y-auto">
          {ALL_CATEGORIES.map(cat => {
            const m = CATEGORY_META[cat]
            return (
              <button key={cat} onClick={() => select(cat)}
                className="w-full text-right flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-800 transition-colors text-gray-300">
                <span>{m.emoji}</span>
                <span>{m.label}</span>
              </button>
            )
          })}
          <div className="border-t border-gray-700 mt-1 pt-1">
            <button onClick={() => select(null)}
              className="w-full text-right flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-800 text-gray-500">
              <span>✕</span><span>הסר קטגוריה</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TransactionRow({ txn, grid = false, onCategoryChange }) {
  const [currentCategory, setCurrentCategory] = useState(txn.category || null)

  const handleChanged = (id, cat) => {
    setCurrentCategory(cat)
    onCategoryChange?.(id, cat)
  }

  const debit        = isDebit(txn)
  const amountColor  = debit ? 'text-red-400' : 'text-green-400'
  const amountPrefix = debit ? '-' : '+'
  const ilsValue     = txn.ils_amount ?? txn.amount_ils ?? 0
  const amountFmt    = `${amountPrefix}₪${Number(ilsValue).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`

  if (grid) {
    return (
      <>
        {/* ── Mobile card (< md) ───────────────────────────────────── */}
        <div className="md:hidden px-4 py-3 hover:bg-gray-700/30 transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate font-medium">{txn.business}</p>
              <p className="text-xs text-gray-500 mt-0.5">{txn.date}</p>
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className={`text-sm font-semibold tabular-nums ${amountColor}`}>{amountFmt}</span>
              <ForeignBadge amount={txn.foreign_amount} currency={txn.foreign_currency} />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <CategoryPill
              category={currentCategory || 'other'}
              editable={true}
              txnId={txn.id}
              onChanged={handleChanged}
            />
            <span className={`text-xs px-2 py-0.5 rounded-full border ${SOURCE_BADGE[txn.source] || 'bg-gray-700 text-gray-400 border-gray-600'}`}>
              <CardLabel source={txn.source} card={txn.card} />
            </span>
          </div>
        </div>

        {/* ── Desktop grid (≥ md) ──────────────────────────────────── */}
        <div className="hidden md:grid grid-cols-12 px-4 py-3 text-sm hover:bg-gray-700/30 transition-colors items-center gap-y-0.5">
          <span className="col-span-2 text-gray-400 text-xs">{txn.date}</span>
          <span className="col-span-3 text-white truncate pr-2">{txn.business}</span>
          <span className="col-span-2">
            <CategoryPill
              category={currentCategory || 'other'}
              editable={true}
              txnId={txn.id}
              onChanged={handleChanged}
            />
          </span>
          <span className="col-span-2 flex flex-col items-start gap-0.5">
            <span className={`font-semibold tabular-nums ${amountColor}`}>{amountFmt}</span>
            <ForeignBadge amount={txn.foreign_amount} currency={txn.foreign_currency} />
          </span>
          <span className="col-span-2">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${SOURCE_BADGE[txn.source] || 'bg-gray-700 text-gray-400 border-gray-600'}`}>
              <CardLabel source={txn.source} card={txn.card} />
            </span>
          </span>
          <span className="col-span-1 text-gray-500 text-xs truncate">{txn.card}</span>
        </div>
      </>
    )
  }

  // Non-grid (dashboard recent transactions)
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700/30 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{txn.business}</p>
        <p className="text-xs text-gray-500">{txn.date}</p>
      </div>
      <CategoryPill category={currentCategory || 'other'} editable={false} txnId={txn.id} />
      <span className={`text-xs px-2 py-0.5 rounded-full border hidden sm:inline-flex ${SOURCE_BADGE[txn.source] || 'bg-gray-700 text-gray-400 border-gray-600'}`}>
        <CardLabel source={txn.source} card={txn.card} />
      </span>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className={`text-sm font-semibold tabular-nums ${amountColor}`}>{amountFmt}</span>
        <ForeignBadge amount={txn.foreign_amount} currency={txn.foreign_currency} />
      </div>
    </div>
  )
}
