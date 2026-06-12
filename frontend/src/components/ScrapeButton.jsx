import { useState } from 'react'
import api from '../api/client'
import { Zap, Loader } from 'lucide-react'

export default function ScrapeButton({ onDone }) {
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState('')

  const trigger = async () => {
    if (running) return
    setRunning(true)
    setMsg('')
    try {
      await api.post('/scrape/trigger')
      setMsg('סריקה החלה...')
      // Poll until done
      const poll = setInterval(async () => {
        try {
          const { data } = await api.get('/scrape/status')
          if (!data.running) {
            clearInterval(poll)
            setRunning(false)
            setMsg(data.lastError ? `שגיאה: ${data.lastError}` : '✓ סריקה הסתיימה')
            if (onDone) onDone()
            setTimeout(() => setMsg(''), 4000)
          }
        } catch { clearInterval(poll); setRunning(false) }
      }, 2000)
    } catch (e) {
      setRunning(false)
      setMsg(e.response?.data?.error || 'שגיאה')
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-gray-400">{msg}</span>}
      <button
        onClick={trigger}
        disabled={running}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500
                   disabled:opacity-60 text-white text-sm font-medium rounded-lg
                   transition-colors shadow-lg shadow-blue-600/20"
      >
        {running ? <Loader size={15} className="animate-spin" /> : <Zap size={15} />}
        {running ? 'סורק...' : 'סרוק עכשיו'}
      </button>
    </div>
  )
}
