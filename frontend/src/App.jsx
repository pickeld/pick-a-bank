import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AuthGate from './components/AuthGate'
import { useEffect } from 'react'
import api from './api/client'

function PushPoller() {
  useEffect(() => {
    const poll = async () => {
      try {
        const { data } = await api.get('/push/pending')
        if (data.pending && 'serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready
          reg.showNotification(data.title || 'Pick a Bank', { body: data.body, icon: '/favicon.ico', tag: 'digest' })
        }
      } catch (_) {}
    }
    poll()
    const id = setInterval(poll, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])
  return null
}
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Transactions from './pages/Transactions'
import Analytics from './pages/Analytics'
import Import from './pages/Import'
import Budget from './pages/Budget'
import WhatIf from './pages/WhatIf'
import Loans from './pages/Loans'
import Savings from './pages/Savings'
import RecurringPayments from './pages/RecurringPayments'

export default function App() {
  return (
    <AuthGate>
      <PushPoller />
      <BrowserRouter>
        <div className="flex min-h-screen bg-gray-950 flex-col md:flex-row">
          <Sidebar />
          <main className="flex-1 overflow-auto pb-20 md:pb-0">
            <Routes>
              <Route path="/"             element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/analytics"   element={<Analytics />} />
              <Route path="/budget"      element={<Budget />} />
              <Route path="/whatif"      element={<WhatIf />} />
              <Route path="/import"      element={<Import />} />
              <Route path="/loans"       element={<Loans />} />
              <Route path="/savings"     element={<Savings />} />
              <Route path="/recurring"   element={<RecurringPayments />} />
              <Route path="/settings"    element={<Settings />} />
              <Route path="*"            element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthGate>
  )
}
