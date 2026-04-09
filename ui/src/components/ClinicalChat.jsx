import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { Send, Loader2, BookOpen, FileText, ClipboardList, AlertTriangle } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || '/api'

function generateSessionId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}

const DocTypeBadge = ({ type }) => {
  const isSoap = type === 'soap_note'
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${
      isSoap
        ? 'dark:bg-purple-900/20 dark:border-purple-700/40 dark:text-purple-300 bg-purple-50 border-purple-200 text-purple-700'
        : 'dark:bg-cyan-900/20 dark:border-cyan-700/40 dark:text-cyan-300 bg-cyan-50 border-cyan-200 text-cyan-700'
    }`}>
      {isSoap ? <ClipboardList className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
      {isSoap ? 'SOAP Note' : 'Guideline'}
    </span>
  )
}

export default function ClinicalChat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(generateSessionId)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const question = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question, sources: [] }])
    setLoading(true)
    try {
      const res = await axios.post(`${API_URL}/chat`, { question, session_id: sessionId })
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.answer,
        sources: res.data.sources || [],
      }])
    } catch (e) {
      const status = e.response?.status
      let userMessage = 'Something went wrong. Please try again.'
      if (status === 503) {
        userMessage = 'The AI service is temporarily unavailable. Please check that Flowise and the LLM provider are running.'
      } else if (status === 500) {
        userMessage = 'The AI could not process your question. Please try rephrasing or check the knowledge base has documents.'
      } else if (status === 422) {
        userMessage = 'Your question could not be processed. Please try again with a different phrasing.'
      } else if (!e.response) {
        userMessage = 'Cannot reach the MediVault API. Please check your connection.'
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: userMessage,
        sources: [],
        error: true,
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card flex flex-col h-[calc(100vh-220px)] min-h-[500px]">
      <div className="px-5 py-4 border-b dark:border-slate-700/50 border-gray-200">
        <h2 className="font-semibold dark:text-white text-gray-900">Clinical QA</h2>
        <p className="text-xs dark:text-slate-400 text-gray-500 mt-0.5">
          RAG over clinical guidelines and approved SOAP notes — all inference runs offline
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 dark:text-slate-500 text-gray-400">
            <BookOpen className="w-10 h-10" />
            <p className="text-sm">Ask a clinical question about guidelines or past consultations</p>
            <div className="flex gap-2 mt-1">
              <DocTypeBadge type="soap_note" />
              <DocTypeBadge type="guideline" />
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'text-white rounded-br-sm'
                  : msg.error
                    ? 'dark:bg-red-900/20 dark:text-red-300 dark:border dark:border-red-700/40 bg-red-50 text-red-700 border border-red-200 rounded-bl-sm'
                    : 'dark:bg-surface-800 dark:text-slate-200 dark:border dark:border-slate-700/50 bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
              }`}
              style={msg.role === 'user' ? { background: 'linear-gradient(135deg, #A335FC, #06b6d4)' } : {}}>
                {msg.content}
              </div>

              {msg.sources?.length > 0 && (
                <div className="space-y-1 w-full">
                  {msg.sources.map((src, j) => (
                    <div key={j} className="px-3 py-1.5 rounded-lg text-xs dark:bg-surface-800/50 dark:border dark:border-slate-700/30 dark:text-slate-400 bg-gray-50 border border-gray-100 text-gray-500 flex items-start gap-2">
                      <DocTypeBadge type={src.doc_type} />
                      <span>
                        <span className="font-medium dark:text-slate-300 text-gray-700">{src.document}</span>
                        {src.chunk && <span className="ml-1">— {src.chunk.slice(0, 100)}…</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl rounded-bl-sm dark:bg-surface-800 dark:border dark:border-slate-700/50 bg-white border border-gray-200">
              <Loader2 className="w-4 h-4 animate-spin dark:text-purple-400 text-purple-600" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-5 py-4 border-t dark:border-slate-700/50 border-gray-200">
        <div className="flex gap-3">
          <textarea
            className="input-field flex-1 h-11 resize-none"
            placeholder="Ask a clinical question…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            rows={1}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="px-4 py-2 rounded-xl text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #A335FC, #06b6d4)', boxShadow: '0 0 16px rgba(163,53,252,0.3)' }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg dark:bg-amber-900/10 bg-amber-50 border dark:border-amber-700/30 border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 dark:text-amber-400 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs dark:text-amber-400/80 text-amber-700">
            AI answers are for clinical reference only. Always verify with authoritative sources.
            Do not use AI responses as the sole basis for clinical decisions.
          </p>
        </div>
      </div>
    </div>
  )
}
