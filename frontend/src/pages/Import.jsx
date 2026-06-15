import { useState, useRef, useCallback } from 'react'
import api from '../api/client'
import { Upload, FileText, CheckCircle, AlertCircle, Loader, Download } from 'lucide-react'
import { CATEGORY_META } from '../components/TransactionRow'

const SOURCE_OPTIONS = [
  {
    value: 'isracard',
    label: 'ישראכרט',
    description: 'קובץ Excel (.xlsx) מאתר ישראכרט',
    hint: 'הורד מ: digital.isracard.co.il → פעולות → ייצוא לאקסל',
    accept: '.xlsx,.xls',
    color: 'blue',
  },
  {
    value: 'discount',
    label: 'בנק דיסקונט',
    description: 'קובץ Excel או CSV מאתר דיסקונט',
    hint: 'הורד מ: discountbank.co.il → תנועות בחשבון → ייצוא',
    accept: '.xlsx,.xls,.csv',
    color: 'orange',
  },
]

function PreviewTable({ rows }) {
  if (!rows?.length) return null
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-700">
      <table className="w-full text-xs text-right">
        <thead>
          <tr className="bg-gray-900 text-gray-500 uppercase tracking-wider">
            <th className="px-3 py-2">תאריך</th>
            <th className="px-3 py-2">עסק</th>
            <th className="px-3 py-2">סכום ₪</th>
            <th className="px-3 py-2">מטבע מקור</th>
            <th className="px-3 py-2">סוג</th>
            <th className="px-3 py-2">קטגוריה</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700/50">
          {rows.map((t, i) => {
            const meta = CATEGORY_META[t.category] || null
            const isDebit = t.chargeType === 'חיוב' || t.chargeType === 'זיכוי'
            return (
              <tr key={i} className="hover:bg-gray-700/30">
                <td className="px-3 py-2 text-gray-400">{t.date}</td>
                <td className="px-3 py-2 text-white font-medium truncate max-w-48">{t.business}</td>
                <td className="px-3 py-2 text-red-400 font-semibold tabular-nums">
                  -₪{Number(t.amountILS || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })}
                </td>
                <td className="px-3 py-2 text-gray-500">
                  {t.foreignAmount ? `${Number(t.foreignAmount).toLocaleString()} ${t.foreignCurrency}` : '—'}
                </td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${t.chargeType === 'זיכוי' ? 'bg-blue-900/30 text-blue-400' : 'bg-orange-900/30 text-orange-400'}`}>
                    {t.chargeType}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-400">
                  {meta ? `${meta.emoji} ${meta.label}` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function Import() {
  const [source, setSource]       = useState('isracard')
  const [file, setFile]           = useState(null)
  const [dragging, setDragging]   = useState(false)
  const [preview, setPreview]     = useState(null)   // { parsed, preview[] }
  const [result, setResult]       = useState(null)   // { inserted, skipped, parsed }
  const [error, setError]         = useState(null)
  const [loading, setLoading]     = useState(false)
  const [step, setStep]           = useState('pick') // pick | preview | done
  const inputRef = useRef(null)

  const selectedSource = SOURCE_OPTIONS.find(s => s.value === source)

  const reset = () => {
    setFile(null); setPreview(null); setResult(null)
    setError(null); setStep('pick')
  }

  const handleFile = useCallback(async (f) => {
    if (!f) return
    setFile(f)
    setError(null)
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('source', source)
      const { data } = await api.post('/import/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setPreview(data)
      setStep('preview')
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
    setLoading(false)
  }, [source])

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const handleImport = async () => {
    if (!file) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('source', source)
      const { data } = await api.post('/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setResult(data)
      setStep('done')
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
    setLoading(false)
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">ייבוא פעולות 📥</h1>
        <p className="text-sm text-gray-500 mt-1">
          העלה קובץ Excel / CSV שהורדת ישירות מאתר הבנק או כרטיס האשראי
        </p>
      </div>

      {step === 'done' ? (
        /* ── Done ── */
        <div className="bg-gray-800 rounded-xl p-8 text-center space-y-4">
          <CheckCircle size={48} className="text-green-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">הייבוא הצליח!</h2>
          <div className="flex justify-center gap-8 text-sm">
            <div>
              <p className="text-3xl font-bold text-green-400">{result.inserted}</p>
              <p className="text-gray-500 mt-1">פעולות חדשות</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-500">{result.skipped}</p>
              <p className="text-gray-500 mt-1">כפילויות / דולגו</p>
            </div>
          </div>
          <button onClick={reset}
            className="mt-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
            ייבא קובץ נוסף
          </button>
        </div>
      ) : (
        <>
          {/* ── Source selector ── */}
          <div className="grid grid-cols-2 gap-3">
            {SOURCE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setSource(opt.value); reset() }}
                className={`text-right p-4 rounded-xl border-2 transition-all ${
                  source === opt.value
                    ? opt.value === 'isracard'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-orange-500 bg-orange-500/10'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}
              >
                <p className={`font-semibold text-sm ${source === opt.value ? (opt.value === 'isracard' ? 'text-blue-400' : 'text-orange-400') : 'text-white'}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-gray-400 mt-1">{opt.description}</p>
                <p className="text-xs text-gray-600 mt-2 font-mono">{opt.hint}</p>
              </button>
            ))}
          </div>

          {/* ── Drop zone ── */}
          {step === 'pick' && (
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                dragging
                  ? 'border-blue-400 bg-blue-500/10'
                  : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/50'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={selectedSource?.accept}
                onChange={e => handleFile(e.target.files[0])}
              />
              {loading ? (
                <Loader size={36} className="mx-auto text-blue-400 animate-spin" />
              ) : (
                <>
                  <Upload size={36} className="mx-auto text-gray-500 mb-3" />
                  <p className="text-white font-medium">גרור קובץ לכאן או לחץ לבחירה</p>
                  <p className="text-sm text-gray-500 mt-1">{selectedSource?.accept?.toUpperCase().replace(/\./g, '').replace(/,/g, ' / ')}</p>
                </>
              )}
            </div>
          )}

          {/* ── Preview ── */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText size={18} className="text-blue-400" />
                  <div>
                    <p className="text-sm font-medium text-white">{file?.name}</p>
                    <p className="text-xs text-gray-500">
                      {preview.parsed} פעולות זוהו
                      {preview.parsed > 20 ? ` · מוצגות 20 ראשונות` : ''}
                    </p>
                  </div>
                </div>
                <button onClick={reset} className="text-xs text-gray-500 hover:text-white transition-colors">
                  ← בחר קובץ אחר
                </button>
              </div>

              <PreviewTable rows={preview.preview} />

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleImport}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {loading
                    ? <><Loader size={15} className="animate-spin" /> מייבא...</>
                    : <><CheckCircle size={15} /> ייבא {preview.parsed} פעולות</>
                  }
                </button>
                <p className="text-xs text-gray-600">כפילויות יידלגו אוטומטית</p>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="flex items-start gap-3 bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3">
              <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-300 font-medium">שגיאה בפענוח הקובץ</p>
                <p className="text-xs text-red-500 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* ── Instructions ── */}
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-400">איך מורידים את הקובץ?</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-500">
              <div className="space-y-1.5">
                <p className="text-blue-400 font-medium">ישראכרט 💳</p>
                <ol className="list-decimal list-inside space-y-1 text-gray-500">
                  <li>כנס ל-digital.isracard.co.il</li>
                  <li>לחץ על "פעולות בכרטיס"</li>
                  <li>בחר חודש</li>
                  <li>לחץ "ייצוא לאקסל" ← שמור את הקובץ</li>
                </ol>
              </div>
              <div className="space-y-1.5">
                <p className="text-orange-400 font-medium">דיסקונט 🏦</p>
                <ol className="list-decimal list-inside space-y-1 text-gray-500">
                  <li>כנס ל-app.discountbank.co.il</li>
                  <li>לחץ "תנועות בחשבון"</li>
                  <li>בחר טווח תאריכים</li>
                  <li>לחץ "ייצוא" → Excel ← שמור</li>
                </ol>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
