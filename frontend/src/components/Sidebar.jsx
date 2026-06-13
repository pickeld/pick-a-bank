import { NavLink } from 'react-router-dom'
import { LayoutDashboard, List, Settings, Landmark, BarChart2, Upload } from 'lucide-react'

const links = [
  { to: '/',             icon: LayoutDashboard, label: 'דשבורד'  },
  { to: '/transactions', icon: List,             label: 'פעולות'  },
  { to: '/analytics',    icon: BarChart2,        label: 'ניתוח'   },
  { to: '/import',       icon: Upload,           label: 'ייבוא'   },
  { to: '/settings',     icon: Settings,         label: 'הגדרות'  },
]

export default function Sidebar() {
  return (
    <aside className="w-56 bg-gray-900 border-l border-gray-800 flex flex-col">
      <div className="px-5 py-6 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Landmark size={22} className="text-blue-400" />
          <span className="font-bold text-lg text-white tracking-tight">Pick a Bank</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">מעקב פיננסי אישי</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
               ${isActive
                 ? 'bg-blue-600 text-white'
                 : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-gray-800 text-xs text-gray-600">
        v1.0 · pick-a-bank
      </div>
    </aside>
  )
}
