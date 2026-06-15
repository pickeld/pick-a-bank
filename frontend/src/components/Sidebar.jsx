import { NavLink } from 'react-router-dom'
import { LayoutDashboard, List, Settings, Landmark, BarChart2, Upload, PiggyBank, Sparkles, LogOut, TrendingDown, Target, RefreshCw } from 'lucide-react'
import { useAuth } from './AuthGate'
import { logout } from '../utils/auth'

const links = [
  { to: '/',             icon: LayoutDashboard, label: 'דשבורד'    },
  { to: '/transactions', icon: List,             label: 'פעולות'    },
  { to: '/analytics',    icon: BarChart2,        label: 'ניתוח'     },
  { to: '/budget',       icon: PiggyBank,        label: 'תקציב'     },
  { to: '/whatif',       icon: Sparkles,         label: 'מה אם?'    },
  { to: '/loans',        icon: TrendingDown,     label: 'הלוואות'   },
  { to: '/savings',      icon: Target,           label: 'חיסכון'    },
  { to: '/recurring',    icon: RefreshCw,        label: 'קבועים'    },
  { to: '/import',       icon: Upload,           label: 'ייבוא'     },
  { to: '/settings',     icon: Settings,         label: 'הגדרות'    },
]

const activeClass   = 'bg-blue-600 text-white'
const inactiveClass = 'text-gray-400 hover:bg-gray-800 hover:text-white'

function UserFooter({ user }) {
  return (
    <div className="px-3 py-3 border-t border-gray-800">
      <div className="flex items-center gap-2 mb-2">
        {user?.avatar
          ? <img src={user.avatar} alt="" className="w-7 h-7 rounded-full shrink-0" />
          : <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {(user?.name || '?')[0].toUpperCase()}
            </div>
        }
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white font-medium truncate">{user?.name || user?.email}</p>
          <p className="text-[10px] text-gray-500 truncate">{user?.email}</p>
        </div>
      </div>
      <button onClick={logout}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-800 hover:text-red-400 transition-colors">
        <LogOut size={13} />
        יציאה
      </button>
    </div>
  )
}

export default function Sidebar() {
  const { user } = useAuth()

  // Mobile bottom bar shows only the most important 6 links to avoid overflow
  const mobileLinks = [
    links[0], // דשבורד
    links[1], // פעולות
    links[2], // ניתוח
    links[3], // תקציב
    links[5], // הלוואות
    links[6], // חיסכון
  ]

  return (
    <>
      {/* ── Desktop: vertical sidebar ──────────────────────────────── */}
      <aside className="hidden md:flex w-56 bg-gray-900 border-l border-gray-800 flex-col shrink-0">
        <div className="px-5 py-6 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Landmark size={22} className="text-blue-400" />
            <span className="font-bold text-lg text-white tracking-tight">Pick a Bank</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">מעקב פיננסי אישי</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {links.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? activeClass : inactiveClass}`
              }>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <UserFooter user={user} />
      </aside>

      {/* ── Mobile: bottom tab bar (6 key links + logout) ──────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-gray-900 border-t border-gray-800 flex items-center justify-around px-1 py-2">
        {mobileLinks.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-0 flex-1 ${
                isActive ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
              }`
            }>
            <Icon size={20} />
            <span className="text-[10px] leading-tight truncate w-full text-center">{label}</span>
          </NavLink>
        ))}
        {/* Logout on mobile */}
        <button onClick={logout}
          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-0 flex-1 text-gray-500 hover:text-red-400">
          {user?.avatar
            ? <img src={user.avatar} alt="" className="w-5 h-5 rounded-full" />
            : <LogOut size={20} />
          }
          <span className="text-[10px] leading-tight">יציאה</span>
        </button>
      </nav>
    </>
  )
}
