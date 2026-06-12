const SOURCE_BADGE = {
  isracard: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  discount: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
}

export default function TransactionRow({ txn, grid = false }) {
  const isCredit = txn.charge_type === 'זיכוי'
  const amountColor = isCredit ? 'text-green-400' : 'text-white'
  const amountPrefix = isCredit ? '+' : '-'
  const amountFmt = `${amountPrefix}₪${Number(txn.amount_ils || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`

  if (grid) {
    return (
      <div className="grid grid-cols-12 px-4 py-3 text-sm hover:bg-gray-700/30 transition-colors">
        <span className="col-span-2 text-gray-400 text-xs">{txn.date}</span>
        <span className="col-span-4 text-white truncate">{txn.business}</span>
        <span className={`col-span-2 font-semibold tabular-nums ${amountColor}`}>{amountFmt}</span>
        <span className="col-span-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${SOURCE_BADGE[txn.source] || 'bg-gray-700 text-gray-400 border-gray-600'}`}>
            {txn.source === 'isracard' ? 'ישראכרט' : 'דיסקונט'}
          </span>
        </span>
        <span className="col-span-2 text-gray-500 text-xs">{txn.card}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-700/30 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{txn.business}</p>
        <p className="text-xs text-gray-500">{txn.date}</p>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full border ${SOURCE_BADGE[txn.source] || 'bg-gray-700 text-gray-400 border-gray-600'}`}>
        {txn.source === 'isracard' ? 'ישראכרט' : 'דיסקונט'}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${amountColor}`}>{amountFmt}</span>
    </div>
  )
}
