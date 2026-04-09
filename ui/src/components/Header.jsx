import { useEffect, useState } from 'react'
import { Sun, Moon, Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'
const POLL_INTERVAL = 15000

export default function Header({ darkMode, onToggleDark, onHome }) {
  const [health, setHealth] = useState(null)

  useEffect(() => {
    const poll = () => {
      axios.get(`${API_URL}/health`)
        .then(r => setHealth(r.data))
        .catch(() => setHealth(null))
    }
    poll()
    const id = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [])

  const apiOnline = health?.status === 'healthy'
  const flowiseOk = health?.flowise_connected
  const whisperOk = health?.whisper_connected
  const flowsOk = health?.flows_provisioned

  const StatusDot = ({ ok, label, warn }) => (
    <span className={`flex items-center gap-1 text-xs font-medium ${
      ok
        ? 'dark:text-green-400 text-green-600'
        : warn
          ? 'dark:text-amber-400 text-amber-600'
          : 'dark:text-red-400 text-red-500'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-400' : warn ? 'bg-amber-400' : 'bg-red-400'}`} />
      {label} {ok ? '✓' : '✗'}
    </span>
  )

  return (
    <header className="sticky top-0 z-50 border-b transition-colors duration-300 dark:bg-surface-900/90 dark:border-slate-700/50 bg-white/90 border-gray-200 backdrop-blur-md">
      <div className="container mx-auto px-4 py-3.5 max-w-7xl">
        <div className="flex items-center justify-between">
          <button
            onClick={onHome}
            className="flex items-center gap-3 group transition-opacity hover:opacity-80"
            title="Return to home"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 blur-md opacity-60 dark:opacity-80 group-hover:opacity-100 transition-opacity" />
              <div className="relative bg-gradient-to-br from-purple-600 to-cyan-500 p-1.5 rounded-xl">
                <img src="/cloud2labs-logo.png" alt="Cloud2 Labs" className="w-6 h-6 object-contain" />
              </div>
            </div>
            <div className="text-left">
              <h1 className="text-xl font-bold tracking-tight dark:text-white text-gray-900">
                MediVault <span className="bg-gradient-to-r from-purple-500 to-cyan-400 bg-clip-text text-transparent">AI</span>
              </h1>
              <p className="text-xs dark:text-slate-400 text-gray-500 leading-none">
                Clinical Intelligence · Completely Offline
              </p>
            </div>
          </button>

          <div className="flex items-center gap-2">
            {apiOnline ? (
              <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-lg border dark:bg-surface-800 dark:border-slate-700/50 bg-gray-100 border-gray-200">
                <Wifi className="w-3.5 h-3.5 dark:text-green-400 text-green-500 flex-shrink-0" />
                <StatusDot ok={flowiseOk} label="Flowise" />
                <span className="dark:text-slate-600 text-gray-300">·</span>
                <StatusDot ok={whisperOk} label="Whisper" />
                <span className="dark:text-slate-600 text-gray-300">·</span>
                <StatusDot ok={flowsOk} label="Flows" warn={!flowsOk} />
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border dark:bg-red-900/20 dark:border-red-700/40 bg-red-50 border-red-200">
                <WifiOff className="w-3.5 h-3.5 dark:text-red-400 text-red-500" />
                <span className="text-xs font-medium dark:text-red-300 text-red-600">API offline</span>
              </div>
            )}

            {apiOnline && !flowsOk && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border dark:bg-amber-900/20 dark:border-amber-700/40 bg-amber-50 border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 dark:text-amber-400 text-amber-600" />
                <span className="text-xs font-medium dark:text-amber-300 text-amber-700">Flows provisioning…</span>
              </div>
            )}

            <button
              onClick={onToggleDark}
              className="p-2 rounded-lg transition-colors duration-200 dark:bg-surface-800 dark:border dark:border-slate-700/50 dark:hover:border-purple-500/50 dark:text-slate-300 bg-gray-100 border border-gray-200 hover:border-purple-300 text-gray-600"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
