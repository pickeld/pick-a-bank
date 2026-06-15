import { useEffect, useState } from 'react'
import api from '../api/client'
import { Save, Eye, EyeOff, CheckCircle, AlertCircle, Bell, BellOff, Key, CreditCard, Trash2, Send, Clock } from 'lucide-react'

const TIMEZONES = [
  'Asia/Jerusalem',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Tokyo',
  'Australia/Sydney',
]

function Field({ label, name, value, onChange, type = 'text', placeholder = '' }) {
  const [show, setShow] = useState(false)
  const isPass = type === 'password'
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
      <div className="relative">
        <input
          type={isPass && !show ? 'password' : 'text'}
          name={name} value={value} onChange={onChange} placeholder={placeholder}
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

function Section({ title, badge, badgeColor = 'blue', children }) {
  const colors = {
    blue:   'bg-blue-600/20 text-blue-400 border-blue-600/30',
    green:  'bg-green-600/20 text-green-400 border-green-600/30',
    orange: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
    purple: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
  }
  return (
    <div className="bg-gray-800 rounded-xl p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-gray-700">
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${colors[badgeColor] || colors.blue}`}>{badge}</span>
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
    scrape_time: '08:00',
    scrape_timezone: 'Asia/Jerusalem',
    openai_key: '',
    notify_new_transactions: false,
    notify_daily_digest: false,
  })
  const [toast, setToast]         = useState(null)
  const [saving, setSaving]       = useState(false)
  const [cards, setCards]         = useState([])
  const [cardNames, setCardNames] = useState({})
  const [devices, setDevices]     = useState([])
  const [testingPush, setTestingPush] = useState(false)

  const showToast = (ok, msg) => {
    setToast({ ok, msg })
    setTimeout(() => setToast(null), 3500)
  }

  const loadDevices = () =>
    api.get('/push/devices').then(r => setDevices(r.data || [])).catch(() => {})

  useEffect(() => {
    api.get('/settings').then(r => {
      if (r.data) setForm(f => ({ ...f, ...r.data }))
    }).catch(() => {})
    api.get('/cards/owners').then(r => {
      const m = {}
      r.data.forEach(o => { m[o.card_suffix] = o.owner_name })
      setCardNames(m)
    }).catch(() => {})
    api.get('/transactions?limit=1000&source=isracard').then(r => {
      const suffixes = [...new Set((r.data.data || []).map(t => t.card).filter(Boolean))]
      setCards(suffixes)
    }).catch(() => {})
    loadDevices()
  }, [])

  const onChange = e => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(f => ({ ...f, [e.target.name]: val }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/settings', form)
      showToast(true, 'הגדרות נשמרו בהצלחה ✓')
    } catch { showToast(false, 'שגיאה בשמירת ההגדרות') }
    setSaving(false)
  }

  const saveCardOwner = async (suffix) => {
    try {
      await api.post('/cards/owners', { card_suffix: suffix, owner_name: cardNames[suffix] || '' })
      showToast(true, `כרטיס ${suffix} עודכן`)
    } catch { showToast(false, 'שגיאה בשמירה') }
  }

  const enablePush = async () => {
    try {
      if (!('Notification' in window)) { showToast(false, 'הדפדפן לא תומך בהתראות'); return }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { showToast(false, 'ההרשאה נדחתה'); return }

      const name = window.prompt('שם המכשיר (לזיהוי):', detectDeviceName()) || detectDeviceName()

      // Use a stable browser fingerprint as the endpoint (no service worker needed)
      const endpoint = `browser:${navigator.userAgent.slice(0,40).replace(/\s/g,'_')}_${Date.now()}`
      await api.post('/push/subscribe', {
        subscription: { endpoint },
        device_name: name,
      })
      showToast(true, `"${name}" נרשם להתראות ✓`)
      loadDevices()
    } catch (e) { showToast(false, 'שגיאה: ' + e.message) }
  }

  const removeDevice = async (id, name) => {
    if (!window.confirm(`הסר את "${name}"?`)) return
    try {
      await api.delete(`/push/devices/${id}`)
      showToast(true, `"${name}" הוסר`)
      loadDevices()
    } catch { showToast(false, 'שגיאה בהסרה') }
  }

  const testNotification = async () => {
    setTestingPush(true)
    try {
      if (Notification.permission !== 'granted') {
        showToast(false, 'אין הרשאת התראות — הפעל תחילה')
        return
      }
      // Fire a native browser notification directly — no server needed
      const n = new Notification('Pick a Bank 🏦', {
        body: 'זוהי התראת בדיקה — הכל עובד!',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'test',
      })
      setTimeout(() => n.close(), 5000)
      showToast(true, 'התראת בדיקה נשלחה ✓')
    } catch (e) {
      showToast(false, 'שגיאה: ' + e.message)
    } finally {
      setTestingPush(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white">הגדרות ⚙️</h1>
        <p className="text-sm text-gray-500 mt-1">ניהול חשבונות, כרטיסים, תקציב והתראות</p>
      </div>

      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium
          ${toast.ok ? 'bg-green-600/20 text-green-400 border border-green-600/30' : 'bg-red-600/20 text-red-400 border border-red-600/30'}`}>
          {toast.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4 md:space-y-6">

        {/* Isracard */}
        <Section title="ישראכרט / אמריקן אקספרס" badge="Isracard">
          <div className="grid grid-cols-2 gap-4">
            <Field label="תעודת זהות" name="isracard_id" value={form.isracard_id} onChange={onChange} placeholder="123456789" />
            <Field label="6 ספרות אחרונות של כרטיס" name="isracard_card6" value={form.isracard_card6} onChange={onChange} placeholder="123456" />
          </div>
          <Field label="סיסמה" name="isracard_password" value={form.isracard_password} onChange={onChange} type="password" placeholder="הסיסמה לאתר ישראכרט" />
        </Section>

        {/* Discount */}
        <Section title="בנק דיסקונט" badge="Discount" badgeColor="orange">
          <div className="grid grid-cols-2 gap-4">
            <Field label="תעודת זהות" name="discount_id" value={form.discount_id} onChange={onChange} placeholder="123456789" />
            <Field label="קוד זיהוי" name="discount_num" value={form.discount_num} onChange={onChange} placeholder="123" />
          </div>
          <Field label="סיסמה" name="discount_password" value={form.discount_password} onChange={onChange} type="password" placeholder="הסיסמה לאינטרנט בנקינג" />
        </Section>

        {/* Scrape time */}
        <Section title="זמן סריקה אוטומטית" badge="סריקה" badgeColor="blue">
          <p className="text-xs text-gray-500">הגדר באיזו שעה ביום יתבצע עדכון אוטומטי של הנתונים</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-1">
                <Clock size={12} /> שעת סריקה
              </label>
              <input type="time" name="scrape_time" value={form.scrape_time} onChange={onChange}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">אזור זמן</label>
              <select name="scrape_timezone" value={form.scrape_timezone} onChange={onChange}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-600">
            הסריקה תתבצע כל יום בשעה {form.scrape_time} ({form.scrape_timezone})
          </p>
        </Section>

        {/* Card ownership */}
        {cards.length > 0 && (
          <Section title="שיוך כרטיסים לבעלים" badge="כרטיסים" badgeColor="purple">
            <p className="text-xs text-gray-500">שייך כל כרטיס לבעלים לצורך ניתוח נפרד</p>
            <div className="space-y-3">
              {cards.map(suffix => (
                <div key={suffix} className="flex items-center gap-2 md:gap-3">
                  <div className="flex items-center gap-2 w-28 shrink-0">
                    <CreditCard size={14} className="text-gray-500" />
                    <span className="text-sm text-gray-300 font-mono">****{suffix}</span>
                  </div>
                  <input type="text" value={cardNames[suffix] || ''}
                    onChange={e => setCardNames(m => ({ ...m, [suffix]: e.target.value }))}
                    placeholder="שם הבעלים"
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
                  <button type="button" onClick={() => saveCardOwner(suffix)}
                    className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg text-sm transition-colors shrink-0">
                    שמור
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* OpenAI key */}
        <Section title="מפתח OpenAI" badge="AI" badgeColor="green">
          <p className="text-xs text-gray-500 mb-2">מפתח API אישי לתכונות AI. לא משותף עם אחרים.</p>
          <div className="relative">
            <Key size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input type="password" name="openai_key" value={form.openai_key || ''} onChange={onChange}
              placeholder="sk-..."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pr-8 pl-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
          </div>
        </Section>

        {/* Notifications */}
        <Section title="התראות Web Push" badge="התראות">
          <div className="space-y-4">

            {/* Checkboxes */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name="notify_new_transactions" checked={!!form.notify_new_transactions} onChange={onChange}
                  className="w-4 h-4 accent-blue-500" />
                <div>
                  <p className="text-sm text-white">התראה על פעולות חדשות</p>
                  <p className="text-xs text-gray-500">קבל התראה כשנקלטות עסקאות חדשות</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name="notify_daily_digest" checked={!!form.notify_daily_digest} onChange={onChange}
                  className="w-4 h-4 accent-blue-500" />
                <div>
                  <p className="text-sm text-white">דוח יומי</p>
                  <p className="text-xs text-gray-500">סיכום יומי: יתרה, חיוב צפוי, הוצאות בולטות</p>
                </div>
              </label>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={enablePush}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors">
                <Bell size={14} /> הוסף מכשיר
              </button>
              {Notification.permission === 'granted' && (
                <button type="button" onClick={testNotification} disabled={testingPush}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-600/30 rounded-lg text-sm transition-colors disabled:opacity-50">
                  <Send size={14} /> {testingPush ? 'שולח...' : 'שלח התראת בדיקה'}
                </button>
              )}
            </div>

            {/* Device list */}
            {devices.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-medium">מכשירים רשומים ({devices.length})</p>
                {devices.map(d => (
                  <div key={d.id} className="flex items-center justify-between gap-3 bg-gray-900 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Bell size={14} className="text-green-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{d.device_name}</p>
                        <p className="text-xs text-gray-500">
                          נרשם {new Date(d.created_at).toLocaleDateString('he-IL')}
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={() => removeDevice(d.id, d.device_name)}
                      className="text-gray-600 hover:text-red-400 transition-colors p-1 shrink-0">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600">אין מכשירים רשומים — לחץ "הוסף מכשיר" להפעלת התראות</p>
            )}
          </div>
        </Section>

        <button type="submit" disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm">
          <Save size={16} />
          {saving ? 'שומר...' : 'שמור הגדרות'}
        </button>
      </form>
    </div>
  )
}

function detectDeviceName() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua))  return 'iPhone'
  if (/iPad/.test(ua))    return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua))     return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'מכשיר'
}
