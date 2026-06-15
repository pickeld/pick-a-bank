import { useEffect, useState } from 'react'
import api from '../api/client'
import { Target, Plus, Trash2, Edit2, Check, X } from 'lucide-react'

const fmt = n => n == null ? '—' : `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`

const COLORS = ['#3b82f6','#22c55e','#f97316','#a855f7','#ec4899','#eab308','#06b6d4','#ef4444']

function GoalCard({ goal, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [current, setCurrent] = useState(goal.current_amount || 0)
  const pct = goal.target_amount > 0 ? Math.min(Math.round((goal.current_amount / goal.target_amount) * 100), 100) : 0
  const remaining = (goal.target_amount || 0) - (goal.current_amount || 0)

  const save = async () => {
    await api.put(`/savings/${goal.id}`, { ...goal, current_amount: parseFloat(current) })
    onUpdate(); setEditing(false)
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ background: goal.color }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{goal.name}</p>
            {goal.target_date && <p className="text-xs text-gray-500">יעד: {goal.target_date}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setEditing(e => !e)} className="text-gray-600 hover:text-blue-400 p-1 transition-colors"><Edit2 size={14} /></button>
          <button onClick={() => onDelete(goal.id)} className="text-gray-600 hover:text-red-400 p-1 transition-colors"><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div>
          {editing ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">נוכחי:</span>
              <input type="number" value={current} onChange={e => setCurrent(e.target.value)}
                className="w-24 bg-gray-900 border border-blue-500 rounded px-2 py-0.5 text-sm text-white focus:outline-none" />
              <button onClick={save} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
              <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-gray-300"><X size={14} /></button>
            </div>
          ) : (
            <span className="font-bold text-white">{fmt(goal.current_amount)}</span>
          )}
          <span className="text-gray-500 text-xs"> / {fmt(goal.target_amount)}</span>
        </div>
        <span className="text-xs text-gray-500">נותר {fmt(remaining)}</span>
      </div>

      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{pct}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-3">
          <div className="h-3 rounded-full transition-all" style={{ width: `${pct}%`, background: goal.color }} />
        </div>
      </div>
    </div>
  )
}

export default function Savings() {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', target_amount: '', current_amount: '', target_date: '', color: COLORS[0] })

  const load = () => api.get('/savings').then(r => { setGoals(r.data); setLoading(false) }).catch(() => setLoading(false))
  useEffect(() => { load() }, [])

  const del = async id => { if (window.confirm('מחק יעד?')) { await api.delete(`/savings/${id}`); load() } }

  const add = async e => {
    e.preventDefault()
    await api.post('/savings', form)
    setShowAdd(false)
    setForm({ name: '', target_amount: '', current_amount: '', target_date: '', color: COLORS[0] })
    load()
  }

  const totalTarget = goals.reduce((s, g) => s + (parseFloat(g.target_amount) || 0), 0)
  const totalSaved  = goals.reduce((s, g) => s + (parseFloat(g.current_amount) || 0), 0)

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <Target size={22} className="text-green-400" /> יעדי חיסכון
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">הגדר יעדים ועקוב אחר ההתקדמות</p>
        </div>
        <button onClick={() => setShowAdd(s => !s)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors">
          <Plus size={14} /> יעד חדש
        </button>
      </div>

      {goals.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">סה"כ נחסך</p>
            <p className="text-xl font-bold text-green-400">{fmt(totalSaved)}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">סה"כ יעד</p>
            <p className="text-xl font-bold text-white">{fmt(totalTarget)}</p>
          </div>
        </div>
      )}

      {showAdd && (
        <form onSubmit={add} className="bg-gray-800 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-white">יעד חדש</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">שם היעד</label>
              <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="חופשה, רכב, חירום..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">סכום יעד ₪</label>
              <input type="number" required value={form.target_amount} onChange={e => setForm(p => ({ ...p, target_amount: e.target.value }))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">נחסך עד כה ₪</label>
              <input type="number" value={form.current_amount} onChange={e => setForm(p => ({ ...p, current_amount: e.target.value }))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">תאריך יעד</label>
              <input type="date" value={form.target_date} onChange={e => setForm(p => ({ ...p, target_date: e.target.value }))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">צבע</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm(p => ({ ...p, color: c }))}
                    className={`w-6 h-6 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-white' : ''}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm">שמור</button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm">ביטול</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="bg-gray-800 rounded-xl h-32 animate-pulse" />)}</div>
      ) : goals.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <Target size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">אין יעדי חיסכון — לחץ "יעד חדש" להתחלה</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {goals.map(g => <GoalCard key={g.id} goal={g} onDelete={del} onUpdate={load} />)}
        </div>
      )}
    </div>
  )
}
