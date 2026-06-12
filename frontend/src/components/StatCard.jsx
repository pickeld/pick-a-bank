export default function StatCard({ title, value, sub, color = 'blue' }) {
  const colors = {
    blue:   'from-blue-600/20 to-blue-600/5 border-blue-600/30 text-blue-400',
    purple: 'from-purple-600/20 to-purple-600/5 border-purple-600/30 text-purple-400',
    green:  'from-green-600/20 to-green-600/5 border-green-600/30 text-green-400',
    red:    'from-red-600/20 to-red-600/5 border-red-600/30 text-red-400',
  }
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-xl p-5`}>
      <p className="text-xs font-medium text-gray-400 mb-2">{title}</p>
      <p className="text-2xl font-bold text-white leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-2">{sub}</p>}
    </div>
  )
}
