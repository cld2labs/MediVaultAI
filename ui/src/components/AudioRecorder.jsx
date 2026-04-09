import { useState, useRef } from 'react'
import axios from 'axios'
import { Mic, MicOff, Upload, Square, Loader2 } from 'lucide-react'
import SoapNoteEditor from './SoapNoteEditor'
import StatusBadge from './StatusBadge'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const SPECIALTIES = ['general', 'emergency', 'cardiology', 'pediatrics', 'psychiatry', 'orthopedics', 'dermatology']

export default function AudioRecorder() {
  const [mode, setMode] = useState('upload')
  const [specialty, setSpecialty] = useState('general')
  const [recording, setRecording] = useState(false)
  const [status, setStatus] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [soap, setSoap] = useState(null)
  const [error, setError] = useState('')

  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const fileInputRef = useRef(null)

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = e => chunksRef.current.push(e.data)
      recorder.onstop = () => processAudioBlob(new Blob(chunksRef.current, { type: 'audio/webm' }), 'recording.webm')
      recorder.start()
      mediaRef.current = recorder
      setRecording(true)
      setError('')
    } catch (e) {
      setError('Microphone access denied.')
    }
  }

  const stopRecording = () => {
    mediaRef.current?.stop()
    mediaRef.current?.stream?.getTracks().forEach(t => t.stop())
    setRecording(false)
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) processAudioBlob(file, file.name)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) processAudioBlob(file, file.name)
  }

  const processAudioBlob = async (blob, filename) => {
    setStatus('loading')
    setTranscript('')
    setSoap(null)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', blob, filename)

      const transcribeRes = await axios.post(`${API_URL}/transcribe`, formData)
      const text = transcribeRes.data.transcript
      setTranscript(text)

      const soapRes = await axios.post(`${API_URL}/generate-soap`, {
        transcript: text,
        specialty,
      })
      setSoap(soapRes.data.soap)
      setStatus('success')
    } catch (e) {
      setError(e.response?.data?.detail || 'Processing failed.')
      setStatus('error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold dark:text-white text-gray-900">Audio → SOAP Note</h2>
          <StatusBadge
            status={status}
            labels={{ loading: 'Processing…', success: 'Generated', error: 'Failed' }}
          />
        </div>

        <div className="flex gap-3 mb-4">
          <div className="flex rounded-xl overflow-hidden border dark:border-slate-700/50 border-gray-200">
            {['upload', 'record'].map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  mode === m
                    ? 'dark:bg-purple-600/20 dark:text-purple-300 bg-purple-100 text-purple-700'
                    : 'dark:text-slate-400 dark:hover:text-slate-200 text-gray-500 hover:text-gray-800'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <select
            value={specialty}
            onChange={e => setSpecialty(e.target.value)}
            className="input-field !w-auto capitalize"
          >
            {SPECIALTIES.map(s => (
              <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        {mode === 'upload' ? (
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors dark:border-slate-700/50 dark:hover:border-purple-500/50 border-gray-200 hover:border-purple-400"
          >
            <Upload className="w-8 h-8 mx-auto mb-3 dark:text-slate-500 text-gray-400" />
            <p className="dark:text-slate-400 text-gray-500 text-sm">Drop audio file or click to browse</p>
            <p className="text-xs dark:text-slate-600 text-gray-400 mt-1">WAV · MP3 · M4A · OGG · WEBM · FLAC — max 50 MB</p>
            <input ref={fileInputRef} type="file" accept=".wav,.mp3,.m4a,.ogg,.webm,.flac" onChange={handleFileUpload} className="hidden" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-8">
            <button
              onClick={recording ? stopRecording : startRecording}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 ${
                recording
                  ? 'bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/30 animate-pulse'
                  : 'bg-gradient-to-br from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 shadow-glow-purple'
              }`}
            >
              {recording ? <Square className="w-7 h-7 text-white" /> : <Mic className="w-7 h-7 text-white" />}
            </button>
            <p className="text-sm dark:text-slate-400 text-gray-500">
              {recording ? 'Recording… click to stop' : 'Click to start recording'}
            </p>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm dark:text-red-400 text-red-600">{error}</p>
        )}
      </div>

      {status === 'loading' && (
        <div className="card p-8 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin dark:text-purple-400 text-purple-600" />
          <p className="dark:text-slate-400 text-gray-500 text-sm">Transcribing audio and generating SOAP note…</p>
        </div>
      )}

      {transcript && soap && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <h3 className="font-semibold dark:text-white text-gray-900 mb-3">Transcript</h3>
            <p className="text-sm dark:text-slate-300 text-gray-700 whitespace-pre-wrap leading-relaxed">{transcript}</p>
          </div>
          <SoapNoteEditor soap={soap} specialty={specialty} />
        </div>
      )}
    </div>
  )
}
