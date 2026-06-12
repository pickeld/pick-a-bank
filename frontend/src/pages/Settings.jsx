import { useEffect, useState } from 'react'
import api from '../api/client'
import { Save, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'

function Field({ label, name, value, onChange, type = 'text', placeholder = '' }) {
  const [show, setShow] = useState(false)
  const isPass = type === 'password'
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
      <div className="relative">
        <input
          type={isPass && !show ? 'password' : 'text'}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
        />
        {isPass && (
          <button type="button" onClick={() => setShow(s => !s)}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
    </div>
  )
}

function Section({ title, badge, children }) {
  return (
    <div className="bg-gray-800 rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-gray-700">
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-600/20 text-blue-400 border border-blue-600/30">{badge}</span>
        <h2 className="text-base font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function Settings() {
  const [form, setForm] = useState({
    isracard_id: '', isracard_card6: '', isracard_password: '',
    discount_id: '', discount_password: '', discount_num: '',
    scrape_interval_hours: 6,
  })
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/settings').then(r => {
      if (r.data) setForm(f => ({ ...f, ...r.data }))
    }).catch(() => {})
  }, [])

  const onChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const onSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/settings', form)
      setToast({ ok: true, msg: 'הגדרות נשמרו בהצלחה ✓' })
    } catch {
      setToast({ ok: false, msg: 'שגיאה בשמירת ההגדרות' })
    }
    setSaving(false)
    setTimeout(() => setToast(null), 3500)
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">הגדרות ⚙️</h1>
        <p className="text-sm text-gray-500 mt-1">הזן פרטי גישה לכרטיסי האשראי שלך</p>
      </div>

      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium
          ${toast.ok ? 'bg-green-600/20 text-green-400 border border-green-600/30' : 'bg-red-600/20 text-red-400 border border-red-600/30'}`}>
          {toast.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        <Section title="ישראכרט / אמריקן אקספרס" badge="Isracard">
          <div className="grid grid-cols-2 gap-4">
            <Field label="תעודת זהות" name="isracard_id" value={form.isracard_id} onChange={onChange} placeholder="123456789" />
            <Field label="6 ספרות אחרונות של כרטיס" name="isracard_card6" value={form.isracard_card6} onChange={onChange} placeholder="123456" />
          </div>
          <Field label="סיסמה" name="isracard_password" value={form.isracard_password} onChange={onChange} type="password" placeholder="הסיסמה לאתר ישראכרט" />
        </Section>

        <Section title="בנק דיסקונט" badge="Discount">
          <div className="grid grid-cols-2 gap-4">
            <Field label="תעודת זהות" name="discount_id" value={form.discount_id} onChange={onChange} placeholder="123456789" />
            <Field label="קוד סניף" name="discount_num" value={form.discount_num} onChange={onChange} placeholder="123" />
          </div>
          <Field label="סיסמה" name="discount_password" value={form.discount_password} onChange={onChange} type="password" placeholder="הסיסמה לאינטרנט בנקינג" />
        </Section>

        <div className="bg-gray-800 rounded-xl p-6">
          <label className="block text-xs font-medium text-gray-400 mb-2">מרווח סריקה אוטומטית (שעות)</label>
          <div className="flex items-center gap-4">
            <input type="range" min="1" max="24" step="1"
              name="scrape_interval_hours"
              value={form.scrape_interval_hours}
              onChange={onChange}
              className="flex-1 accent-blue-500" />
            <span className="text-lg font-bold text-blue-400 w-12 text-center">
              {form.scrape_interval_hours}h
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-2">הסיסמאות מוצפנות בבסיס הנתונים</p>
        </div>

        <button type="submit" disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                     text-white font-medium rounded-lg transition-colors text-sm">
          <Save size={16} />
          {saving ? 'שומר...' : 'שמור הגדרות'}
        </button>
      </form>
    </div>
  )
}
