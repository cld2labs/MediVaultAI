import { Mic, MessageSquare, ArrowRight, Shield, Wifi, AlertTriangle } from 'lucide-react'

const FEATURES = [
  {
    icon: Mic,
    title: 'SOAP Note Generation',
    description:
      'Record or upload patient consultation audio. Whisper transcribes it, LLM generates specialty-aware SOAP notes with ICD-10 keyword extraction and billing code suggestions.',
    color: 'from-purple-600 to-purple-800',
    glow: 'rgba(163,53,252,0.25)',
  },
  {
    icon: MessageSquare,
    title: 'Clinical QA',
    description:
      'Ask evidence-based clinical questions. RAG retrieves from your ingested guidelines and approved SOAP notes, returning cited, grounded answers.',
    color: 'from-cyan-600 to-cyan-800',
    glow: 'rgba(6,182,212,0.25)',
  },
]

const POWERED_BY = ['Flowise', 'Ollama', 'Whisper', 'ChromaDB', 'FastAPI']

export default function LandingPage({ onLaunch }) {
  return (
    <div className="min-h-screen dark:bg-surface-950 bg-gray-50 overflow-x-hidden">
      <div className="relative overflow-hidden">
        <div
          className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full opacity-20 dark:opacity-30 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, #A335FC 0%, #06b6d4 60%, transparent 80%)' }}
        />

        <div className="relative container mx-auto px-6 pt-24 pb-16 max-w-5xl text-center">
          {/* Air-gapped badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border dark:bg-surface-800/60 dark:border-purple-500/30 dark:text-purple-300 bg-purple-50 border-purple-200 text-purple-700 text-xs font-medium mb-8">
            <Shield className="w-3 h-3" />
            Air-gapped · Fully Offline · Zero PHI Exposure
          </div>

          {/* Logo + Title */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl blur-xl opacity-70" style={{ background: 'linear-gradient(135deg, #A335FC, #06b6d4)' }} />
              <div className="relative rounded-2xl p-3" style={{ background: 'linear-gradient(135deg, #A335FC, #06b6d4)' }}>
                <img src="/cloud2labs-logo.png" alt="Cloud2 Labs" className="w-10 h-10 object-contain" />
              </div>
            </div>
            <h1 className="text-6xl font-bold tracking-tight dark:text-white text-gray-900">
              MediVault <span className="bg-gradient-to-r from-purple-500 to-cyan-400 bg-clip-text text-transparent">AI</span>
            </h1>
          </div>

          <p className="text-xl dark:text-slate-400 text-gray-500 max-w-2xl mx-auto mb-8 leading-relaxed">
            Clinical intelligence that never leaves your infrastructure.
            SOAP note generation and evidence-based Q&A —
            powered by <span className="dark:text-purple-300 text-purple-600 font-medium">Ollama</span> and{' '}
            <span className="dark:text-cyan-300 text-cyan-600 font-medium">ChromaDB</span>, running entirely offline.
          </p>

          {/* Launch button */}
          <button
            onClick={onLaunch}
            className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl text-white font-semibold text-lg transition-all duration-200 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #A335FC, #06b6d4)',
              boxShadow: '0 0 40px rgba(163,53,252,0.4), 0 0 80px rgba(6,182,212,0.2)',
            }}
          >
            Launch App
            <ArrowRight className="w-5 h-5" />
          </button>

          {/* Powered-by strip */}
          <div className="flex items-center justify-center gap-6 mt-10 flex-wrap">
            {POWERED_BY.map(name => (
              <span key={name} className="text-xs font-mono dark:text-slate-500 text-gray-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />
                {name}
              </span>
            ))}
          </div>

        </div>
      </div>

      {/* Feature cards — 2 cards only (no drug checker) */}
      <div className="container mx-auto px-6 py-16 max-w-5xl">
        <h2 className="text-2xl font-bold dark:text-white text-gray-900 text-center mb-2">What MediVault AI Does</h2>
        <p className="text-sm dark:text-slate-400 text-gray-500 text-center mb-10">Two AI-powered tools — both running entirely on your own hardware</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {FEATURES.map(({ icon: Icon, title, description, color, glow }) => (
            <div
              key={title}
              className="card p-6 group cursor-default transition-all duration-300 hover:-translate-y-1"
              style={{ boxShadow: `0 0 0 0 ${glow}` }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 30px ${glow}` }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = `0 0 0 0 ${glow}` }}
            >
              <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${color} mb-4`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold dark:text-white text-gray-900 mb-2">{title}</h3>
              <p className="text-sm dark:text-slate-400 text-gray-500 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Offline badge + second CTA */}
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        {/* Disclaimer — just above Get Started box */}
        <div className="max-w-3xl mx-auto mb-4 rounded-xl border dark:border-amber-500/30 border-amber-300 dark:bg-amber-950/30 bg-amber-50 px-5 py-3.5 text-left">
          <div className="flex gap-3 items-start">
            <AlertTriangle className="w-4 h-4 dark:text-amber-400 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold dark:text-amber-300 text-amber-800 mb-0.5">For Clinical Decision Support Only</p>
              <p className="text-xs dark:text-amber-400/80 text-amber-700 leading-relaxed">
                All AI-generated output must be reviewed by a qualified clinician before use in patient care.
                This system does not replace professional medical judgment.
              </p>
            </div>
          </div>
        </div>

        <div className="card p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Wifi className="w-5 h-5 dark:text-green-400 text-green-500" />
            <div>
              <p className="font-semibold dark:text-white text-gray-900 text-sm">Completely Offline</p>
              <p className="text-xs dark:text-slate-400 text-gray-500">All inference runs locally. No patient data ever leaves your network.</p>
            </div>
          </div>
          <button
            onClick={onLaunch}
            className="flex-shrink-0 flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white text-sm transition-all duration-200 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #A335FC, #06b6d4)', boxShadow: '0 0 20px rgba(163,53,252,0.3)' }}
          >
            Get Started <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <footer className="border-t dark:border-slate-800 border-gray-200 py-6">
        <p className="text-center text-xs dark:text-slate-600 text-gray-400">
          © 2025 Cloud2 Labs · MediVault AI is a clinical decision support tool. All AI-generated content requires clinician review before use.
        </p>
      </footer>
    </div>
  )
}
