import { useState, useRef } from 'react'
import axios from 'axios'
import { Mic, Square, Upload, Loader2, User, Stethoscope, Pencil, Check, X, RefreshCw, AlertTriangle, FileAudio, XCircle } from 'lucide-react'
import SoapNoteEditor from './SoapNoteEditor'
import StatusBadge from './StatusBadge'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const SPECIALTIES = [
  'general', 'emergency', 'cardiology', 'pediatrics',
  'psychiatry', 'orthopedics', 'dermatology', 'neurology',
  'oncology', 'gastroenterology',
]

const SPEAKER_STYLES = {
  Doctor: {
    badge: 'dark:bg-purple-900/30 dark:border-purple-600/40 dark:text-purple-300 bg-purple-100 border-purple-300 text-purple-700',
    bubble: 'dark:bg-purple-900/20 dark:border dark:border-purple-700/30 dark:text-slate-200 bg-purple-50 border border-purple-200 text-gray-800',
    editBorder: 'dark:border-purple-500/60 border-purple-400',
    icon: Stethoscope,
    label: 'Doctor',
  },
  Patient: {
    badge: 'dark:bg-cyan-900/30 dark:border-cyan-600/40 dark:text-cyan-300 bg-cyan-100 border-cyan-300 text-cyan-700',
    bubble: 'dark:bg-cyan-900/20 dark:border dark:border-cyan-700/30 dark:text-slate-200 bg-cyan-50 border border-cyan-200 text-gray-800',
    editBorder: 'dark:border-cyan-500/60 border-cyan-400',
    icon: User,
    label: 'Patient',
  },
}

/** Merge consecutive same-speaker segments into one turn */
function mergeSegments(segments) {
  if (!segments.length) return []
  const merged = []
  let cur = { ...segments[0] }
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.speaker === cur.speaker) {
      cur = { ...cur, text: cur.text + ' ' + seg.text }
    } else {
      merged.push(cur)
      cur = { ...seg }
    }
  }
  merged.push(cur)
  return merged
}

/** Single editable transcript turn */
function TranscriptTurn({ turn, index, onSave, onSpeakerToggle }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(turn.text)
  const style = SPEAKER_STYLES[turn.speaker] || SPEAKER_STYLES.Doctor
  const Icon = style.icon
  const isPatient = turn.speaker === 'Patient'

  const save = () => {
    if (draft.trim()) onSave(index, draft.trim())
    setEditing(false)
  }
  const cancel = () => { setDraft(turn.text); setEditing(false) }

  return (
    <div className={`flex gap-3 group ${isPatient ? 'flex-row-reverse' : ''}`}>
      {/* Avatar — click to toggle speaker */}
      <button
        onClick={() => onSpeakerToggle(index)}
        title="Click to toggle speaker"
        className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-opacity hover:opacity-70 ${style.badge}`}
      >
        <Icon className="w-4 h-4" />
      </button>

      {/* Bubble */}
      <div className={`max-w-[78%] ${isPatient ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <span className={`text-[10px] font-semibold opacity-50 ${isPatient ? 'self-end' : 'self-start'} dark:text-slate-400 text-gray-500`}>
          {style.label}
        </span>

        {editing ? (
          <div className={`w-full rounded-2xl border-2 ${style.editBorder} dark:bg-slate-800/60 bg-white overflow-hidden`}>
            <textarea
              autoFocus
              className="w-full px-4 py-2.5 text-sm dark:text-slate-200 text-gray-800 bg-transparent resize-none outline-none leading-relaxed"
              rows={Math.max(2, Math.ceil(draft.length / 60))}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() } if (e.key === 'Escape') cancel() }}
            />
            <div className="flex gap-2 px-3 py-1.5 border-t dark:border-slate-700/50 border-gray-100">
              <button onClick={save} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors">
                <Check className="w-3 h-3" /> Save
              </button>
              <button onClick={cancel} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg dark:bg-slate-700/50 dark:text-slate-400 dark:hover:bg-slate-700 bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                <X className="w-3 h-3" /> Cancel
              </button>
              <span className="ml-auto text-xs dark:text-slate-600 text-gray-400 self-center">Enter to save · Esc to cancel</span>
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${style.bubble}`}>
              {turn.text}
            </div>
            <button
              onClick={() => { setDraft(turn.text); setEditing(true) }}
              className="absolute -top-1 -right-1 w-6 h-6 rounded-full dark:bg-slate-700 bg-white shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity dark:text-slate-400 text-gray-500 dark:hover:text-purple-300 hover:text-purple-600"
              title="Edit this turn"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ConsultationRecorder() {
  const [mode, setMode] = useState('upload')
  const [specialty, setSpecialty] = useState('cardiology')
  const [recording, setRecording] = useState(false)
  const [transcribeStatus, setTranscribeStatus] = useState('idle')
  const [soapStatus, setSoapStatus] = useState('idle')
  const [turns, setTurns] = useState([])       // merged, editable turns
  const [rawTranscript, setRawTranscript] = useState('')
  const [soap, setSoap] = useState(null)
  const [keywords, setKeywords] = useState(null)
  const [error, setError] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)  // file staged but not yet uploaded

  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const fileInputRef = useRef(null)

  const formatFileSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = e => chunksRef.current.push(e.data)
      recorder.onstop = () => processBlob(new Blob(chunksRef.current, { type: 'audio/webm' }), 'consultation.webm')
      recorder.start()
      mediaRef.current = recorder
      setRecording(true)
      setError('')
    } catch {
      setError('Microphone access denied.')
    }
  }

  const stopRecording = () => {
    mediaRef.current?.stop()
    mediaRef.current?.stream?.getTracks().forEach(t => t.stop())
    setRecording(false)
  }

  const processBlob = async (blob, filename) => {
    setTranscribeStatus('loading')
    setTurns([])
    setRawTranscript('')
    setSoap(null)
    setSoapStatus('idle')
    setError('')

    try {
      const fd = new FormData()
      fd.append('file', blob, filename)
      const res = await axios.post(`${API_URL}/transcribe`, fd, {
        timeout: 600000,
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setRawTranscript(res.data.transcript)
      setTurns(mergeSegments(res.data.segments || []))
      setTranscribeStatus('success')
    } catch (e) {
      const msg = e.response?.data?.detail
        || (e.code === 'ECONNABORTED' ? 'Transcription timed out. Try a shorter audio file.' : null)
        || (e.message?.includes('Network') ? 'Network error — check that whisper-server is running.' : null)
        || 'Transcription failed.'
      setError(msg)
      setTranscribeStatus('error')
    }
  }

  const handleEditTurn = (index, newText) => {
    setTurns(prev => prev.map((t, i) => i === index ? { ...t, text: newText } : t))
  }

  const handleToggleSpeaker = (index) => {
    setTurns(prev => prev.map((t, i) =>
      i === index ? { ...t, speaker: t.speaker === 'Doctor' ? 'Patient' : 'Doctor' } : t
    ))
  }

  const generateSoap = async () => {
    setSoapStatus('loading')
    setSoap(null)
    setKeywords(null)
    setError('')
    // Reconstruct segments from edited turns for API
    const segments = turns.map(t => ({ speaker: t.speaker, text: t.text, start_ms: t.start_ms || 0 }))
    try {
      const res = await axios.post(`${API_URL}/generate-soap`, {
        transcript: rawTranscript,
        segments,
        specialty,
      }, { timeout: 600000 })
      setSoap(res.data.soap)
      setKeywords(res.data.keywords || null)
      setSoapStatus('success')
    } catch (e) {
      setError(e.response?.data?.detail || 'SOAP generation failed.')
      setSoapStatus('error')
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Upload / Record card ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="font-semibold dark:text-white text-gray-900">Consultation Recorder</h2>
            <p className="text-xs dark:text-slate-400 text-gray-500 mt-0.5">
              Record or upload a consultation · Transcription is diarized and editable before SOAP generation
            </p>
          </div>
          <StatusBadge
            status={transcribeStatus}
            labels={{ loading: 'Transcribing…', success: 'Transcribed', error: 'Failed' }}
          />
        </div>

        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="flex rounded-xl overflow-hidden border dark:border-slate-700/50 border-gray-200">
            {['upload', 'record'].map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  mode === m
                    ? 'dark:bg-purple-600/20 dark:text-purple-300 bg-purple-100 text-purple-700'
                    : 'dark:text-slate-400 dark:hover:text-slate-200 text-gray-500 hover:text-gray-800'
                }`}
              >
                {m === 'record' ? '🎤 Record' : '📁 Upload'}
              </button>
            ))}
          </div>

          <select
            value={specialty}
            onChange={e => setSpecialty(e.target.value)}
            className="input-field !w-auto capitalize"
          >
            {SPECIALTIES.map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Small disclaimer below tabs */}
        <p className="text-xs dark:text-slate-500 text-gray-400 mb-3 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 dark:text-amber-500 text-amber-500 flex-shrink-0" />
          Audio is processed locally on your device — no data is sent to any external server.
        </p>

        {mode === 'upload' ? (
          <div>
            {/* Drop zone — only shown when no file is selected */}
            {!selectedFile && (
              <div
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setSelectedFile(f) }}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors dark:border-slate-700/50 dark:hover:border-purple-500/50 border-gray-200 hover:border-purple-400"
              >
                <Upload className="w-8 h-8 mx-auto mb-3 dark:text-slate-500 text-gray-400" />
                <p className="dark:text-slate-300 text-gray-600 text-sm font-medium mb-3">Drop consultation audio here or click to browse</p>
                <div className="flex justify-center gap-2 mb-3">
                  {['WAV', 'MP3'].map(fmt => (
                    <span key={fmt} className="px-3 py-1 rounded-md text-xs font-mono font-semibold dark:bg-slate-700/60 dark:text-slate-300 bg-gray-100 text-gray-600 border dark:border-slate-600/40 border-gray-200">
                      {fmt}
                    </span>
                  ))}
                </div>
                <p className="text-xs dark:text-slate-500 text-gray-400">Max file size: <span className="font-semibold dark:text-slate-400 text-gray-500">25 MB</span> · Shorter recordings process faster</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".wav,.mp3"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setSelectedFile(f) }}
                  className="hidden"
                />
              </div>
            )}

            {/* Selected file preview — shown after file is chosen */}
            {selectedFile && transcribeStatus !== 'loading' && (
              <div className="rounded-xl border dark:border-slate-700/50 border-gray-200 dark:bg-slate-800/40 bg-gray-50 p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #A335FC, #06b6d4)' }}>
                    <FileAudio className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium dark:text-white text-gray-900 truncate">{selectedFile.name}</p>
                    <p className="text-xs dark:text-slate-400 text-gray-500">{formatFileSize(selectedFile.size)} · {selectedFile.type || 'audio'}</p>
                  </div>
                  <button
                    onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="p-1.5 rounded-lg dark:text-slate-400 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="Remove file"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <button
                  onClick={() => { processBlob(selectedFile, selectedFile.name); setSelectedFile(null) }}
                  className="w-full btn-primary flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #A335FC, #06b6d4)', boxShadow: '0 0 20px rgba(163,53,252,0.3)' }}
                >
                  <Upload className="w-4 h-4" />
                  Start Transcription
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-8">
            <button
              onClick={recording ? stopRecording : startRecording}
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-200 ${
                recording
                  ? 'bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/30 animate-pulse'
                  : 'hover:scale-105'
              }`}
              style={!recording ? { background: 'linear-gradient(135deg, #A335FC, #06b6d4)', boxShadow: '0 0 30px rgba(163,53,252,0.4)' } : {}}
            >
              {recording ? <Square className="w-8 h-8 text-white" /> : <Mic className="w-8 h-8 text-white" />}
            </button>
            <p className="text-sm dark:text-slate-400 text-gray-500">
              {recording ? 'Recording… click to stop' : 'Click to start recording consultation'}
            </p>
          </div>
        )}

        {error && <p className="mt-3 text-sm dark:text-red-400 text-red-600">{error}</p>}
      </div>

      {/* ── Transcribing spinner ── */}
      {transcribeStatus === 'loading' && (
        <div className="card p-8 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin dark:text-purple-400 text-purple-600" />
          <p className="dark:text-slate-400 text-gray-500 text-sm">Transcribing and diarizing consultation…</p>
          <p className="text-xs dark:text-slate-500 text-gray-400">Large audio files may take 1–3 minutes on CPU</p>
        </div>
      )}

      {/* ── Diarized Transcript — editable ── */}
      {turns.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="font-semibold dark:text-white text-gray-900">Diarized Transcript</h3>
              <p className="text-xs dark:text-slate-400 text-gray-500 mt-0.5">
                {turns.length} turns · Hover a bubble to edit · Click avatar to swap speaker
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                {Object.entries(SPEAKER_STYLES).map(([speaker, { badge, label }]) => (
                  <span key={speaker} className={`px-2 py-0.5 rounded border text-xs font-medium ${badge}`}>{label}</span>
                ))}
              </div>
              {soapStatus === 'success' && (
                <button
                  onClick={() => { setSoap(null); setSoapStatus('idle') }}
                  className="flex items-center gap-1 text-xs dark:text-slate-400 text-gray-500 hover:text-purple-500 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" /> Regenerate
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1 pb-1">
            {turns.map((turn, i) => (
              <TranscriptTurn
                key={i}
                turn={turn}
                index={i}
                onSave={handleEditTurn}
                onSpeakerToggle={handleToggleSpeaker}
              />
            ))}
          </div>

          {/* Disclaimer above generate button */}
          <div className="mt-4 flex items-start gap-2 px-3 py-2 rounded-lg dark:bg-amber-900/10 bg-amber-50 border dark:border-amber-700/30 border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 dark:text-amber-400 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs dark:text-amber-400/80 text-amber-700">
              Transcript is AI-generated. Review for accuracy before generating SOAP note.
            </p>
          </div>

          <button
            onClick={generateSoap}
            disabled={soapStatus === 'loading'}
            className="btn-primary mt-3 w-full disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #A335FC, #06b6d4)', boxShadow: '0 0 20px rgba(163,53,252,0.3)' }}
          >
            {soapStatus === 'loading'
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating SOAP Note…</>
              : soapStatus === 'success'
              ? <><RefreshCw className="w-4 h-4" /> Regenerate SOAP Note</>
              : <>Generate SOAP Note →</>
            }
          </button>
        </div>
      )}

      {/* ── SOAP generating spinner ── */}
      {soapStatus === 'loading' && (
        <div className="card p-8 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin dark:text-purple-400 text-purple-600" />
          <p className="dark:text-slate-400 text-gray-500 text-sm">Generating SOAP note via {specialty} specialist AI…</p>
        </div>
      )}

      {/* ── SOAP Note editor ── */}
      {soap && soapStatus === 'success' && (
        <SoapNoteEditor soap={soap} keywords={keywords} specialty={specialty} />
      )}

      {soapStatus === 'error' && error && (
        <div className="card p-5">
          <p className="text-sm dark:text-red-400 text-red-600">{error}</p>
        </div>
      )}
    </div>
  )
}
