import { useEffect, useState } from 'react'
import api from '../api/client'
import { TrendingDown, Plus, Trash2, Edit2, Check, X } from 'lucide-react'

const fmt = n => n == null ? '—' : `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`
const fmtPct = v => v ? `${v}%` : '—'

function LoanCard({ loan, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [balance, setBalance] = useState(loan.remaining_balance || '')

  const pct = loan.original_amount && loan.remaining_balance
    ? Math.round((1 - loan.remaining_balance / loan.original_amount) * 100)
    : 0

  const save = async () => {
    await api.put(`/loans/${loan.id}`, { ...loan, remaining_balance: parseFloat(balance) })
    onUpdate()
    setEditing(false)
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 md:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{loan.loan_name}</p>
          <p className="text-xs text-gray-500 mt-0.5">חשבון {loan.account_number}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setEditing(e => !e)} className="text-gray-600 hover:text-blue-400 p-1 transition-colors">
            <Edit2 size={14} />
          </button>
          <button onClick={() => onDelete(loan.id)} className="text-gray-600 hover:text-red-400 p-1 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div className="bg-gray-900 rounded-lg p-2">
          <p className="text-xs text-gray-500">סכום מקורי</p>
          <p className="text-sm font-bold text-white">{fmt(loan.original_amount)}</p>
        </div>
        <div className="bg-gray-900 rounded-lg p-2">
          <p className="text-xs text-gray-500">יתרת חוב</p>
          {editing ? (
            <div className="flex items-center gap-1 mt-1">
              <input type="number" value={balance} onChange={e => setBalance(e.target.value)}
                className="w-full bg-gray-800 border border-blue-500 rounded px-1 py-0.5 text-xs text-white focus:outline-none" />
              <button onClick={save} className="text-green-400 hover:text-green-300"><Check size={12} /></button>
              <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-gray-300"><X size={12} /></button>
            </div>
          ) : (
            <p className="text-sm font-bold text-red-400">{fmt(loan.remaining_balance)}</p>
          )}
        </div>
        <div className="bg-gray-900 rounded-lg p-2">
          <p className="text-xs text-gray-500">תשלום קרוב</p>
          <p className="text-sm font-bold text-orange-400">{fmt(loan.next_payment_amount)}</p>
          <p className="text-[10px] text-gray-600">{loan.next_payment_date}</p>
        </div>
        <div className="bg-gray-900 rounded-lg p-2">
          <p className="text-xs text-gray-500">ריבית</p>
          <p className="text-sm font-bold text-white">{loan.interest_rate}</p>
          <p className="text-[10px] text-gray-600">{loan.remaining_payments} תשלומים</p>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>שולם {pct}%</span>
          <span>נותר {fmt(loan.remaining_balance)}</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div className="h-2 bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

export default function Loans() {
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ loan_name: '', account_number: '', original_amount: '', remaining_balance: '', interest_rate: '', next_payment_amount: '', next_payment_date: '', remaining_payments: '' })

  const load = () => api.get('/loans').then(r => { setLoans(r.data); setLoading(false) }).catch(() => setLoading(false))
  useEffect(() => { load() }, [])

  const del = async id => { if (window.confirm('מחק הלוואה?')) { await api.delete(`/loans/${id}`); load() } }

  const add = async e => {
    e.preventDefault()
    await api.post('/loans', form)
    setShowAdd(false)
    setForm({ loan_name: '', account_number: '', original_amount: '', remaining_balance: '', interest_rate: '', next_payment_amount: '', next_payment_date: '', remaining_payments: '' })
    load()
  }

  const totalBalance = loans.reduce((s, l) => s + (parseFloat(l.remaining_balance) || 0), 0)
  const totalMonthly = loans.reduce((s, l) => s + (parseFloat(l.next_payment_amount) || 0), 0)

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <TrendingDown size={22} className="text-red-400" /> הלוואות
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">מעקב אחר הלוואות ומשכנתאות</p>
        </div>
        <button onClick={() => setShowAdd(s => !s)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors">
          <Plus size={14} /> הוסף הלוואה
        </button>
      </div>

      {/* Summary */}
      {loans.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">סה"כ יתרת חוב</p>
            <p className="text-xl font-bold text-red-400">{fmt(totalBalance)}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">תשלום חודשי כולל</p>
            <p className="text-xl font-bold text-orange-400">{fmt(totalMonthly)}</p>
          </div>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <form onSubmit={add} className="bg-gray-800 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-white">הלוואה חדשה</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'loan_name', label: 'שם הלוואה', required: true },
              { key: 'account_number', label: 'מספר חשבון' },
              { key: 'original_amount', label: 'סכום מקורי ₪', type: 'number' },
              { key: 'remaining_balance', label: 'יתרת חוב ₪', type: 'number', required: true },
              { key: 'interest_rate', label: 'ריבית' },
              { key: 'next_payment_amount', label: 'תשלום קרוב ₪', type: 'number' },
              { key: 'next_payment_date', label: 'תאריך תשלום' },
              { key: 'remaining_payments', label: 'תשלומים נותרים' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
                <input type={f.type || 'text'} required={f.required} value={form[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm">שמור</button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm">ביטול</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="bg-gray-800 rounded-xl h-40 animate-pulse" />)}</div>
      ) : loans.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <TrendingDown size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">אין הלוואות — לחץ "הוסף הלוואה" להתחלה</p>
        </div>
      ) : (
        <div className="space-y-4">
          {loans.map(l => <LoanCard key={l.id} loan={l} onDelete={del} onUpdate={load} />)}
        </div>
      )}
    </div>
  )
}
