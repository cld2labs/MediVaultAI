export default function StatusBadge({ status, labels }) {
  const map = {
    idle: { text: labels?.idle || 'Ready', cls: 'dark:bg-surface-800 dark:text-slate-400 dark:border-slate-700/50 bg-gray-100 text-gray-500 border-gray-200' },
    loading: { text: labels?.loading || 'Processing…', cls: 'dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700/40 bg-blue-50 text-blue-600 border-blue-200' },
    success: { text: labels?.success || 'Done', cls: 'dark:bg-green-900/20 dark:text-green-300 dark:border-green-700/40 bg-green-50 text-green-600 border-green-200' },
    error: { text: labels?.error || 'Error', cls: 'dark:bg-red-900/20 dark:text-red-300 dark:border-red-700/40 bg-red-50 text-red-600 border-red-200' },
  }

  const { text, cls } = map[status] || map.idle

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-medium ${cls}`}>
      {text}
    </span>
  )
}
