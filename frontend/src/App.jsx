import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AuthGate from './components/AuthGate'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Transactions from './pages/Transactions'
import Analytics from './pages/Analytics'
import Import from './pages/Import'
import Budget from './pages/Budget'
import WhatIf from './pages/WhatIf'

export default function App() {
  return (
    <AuthGate>
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
              <Route path="/settings"    element={<Settings />} />
              <Route path="*"            element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthGate>
  )
}
