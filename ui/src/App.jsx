import { useState, useEffect } from 'react'
import Header from './components/Header'
import LandingPage from './components/LandingPage'
import ConsultationRecorder from './components/ConsultationRecorder'
import ClinicalChat from './components/ClinicalChat'
import KnowledgeBase from './components/KnowledgeBase'
import { Mic, MessageSquare, Database } from 'lucide-react'

const TABS = [
  { id: 'record',    label: 'SOAP Notes',    icon: Mic },
  { id: 'chat',      label: 'Clinical QA',   icon: MessageSquare },
  { id: 'knowledge', label: 'Knowledge Base', icon: Database },
]

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode')
    return saved !== null ? JSON.parse(saved) : true
  })
  const [launched, setLaunched] = useState(false)
  const [activeTab, setActiveTab] = useState('record')

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode))
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  if (!launched) {
    return <LandingPage onLaunch={() => setLaunched(true)} />
  }

  return (
    <div className="min-h-screen transition-colors duration-300 dark:bg-surface-950 bg-gray-50">
      <Header darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} onHome={() => setLaunched(false)} />

      <main className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex gap-2 mb-6 flex-wrap">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`tab-btn flex items-center gap-2 ${
                activeTab === id
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40 dark:bg-purple-600/20 dark:text-purple-300 dark:border-purple-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent hover:border-slate-700/50 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Keep all tabs mounted to preserve state when switching — only hide inactive ones */}
        <div className={activeTab === 'record'    ? '' : 'hidden'}><ConsultationRecorder /></div>
        <div className={activeTab === 'chat'      ? '' : 'hidden'}><ClinicalChat /></div>
        <div className={activeTab === 'knowledge' ? '' : 'hidden'}><KnowledgeBase /></div>
      </main>
    </div>
  )
}

export default App
