import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { Upload, Trash2, FileText, Loader2, Database, ClipboardList, BookOpen, AlertTriangle } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || '/api'

export default function KnowledgeBase() {
  const [documents, setDocuments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => { fetchDocuments() }, [])

  const fetchDocuments = async () => {
    try {
      const res = await axios.get(`${API_URL}/documents`)
      setDocuments(res.data.documents)
    } catch {
      setDocuments([])
    }
  }

  const handleUpload = async (file) => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      await axios.post(`${API_URL}/ingest-document`, fd)
      await fetchDocuments()
    } catch (e) {
      setError(e.response?.data?.detail || 'Upload failed.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (docId) => {
    try {
      await axios.delete(`${API_URL}/documents/${docId}`)
      setDocuments(prev => prev.filter(d => d.id !== docId))
    } catch (e) {
      setError(e.response?.data?.detail || 'Delete failed.')
    }
  }

  const formatBytes = (b) => b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`
  const formatDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return iso } }

  const guidelines = documents.filter(d => d.doc_type !== 'soap_note')
  const soapNotes = documents.filter(d => d.doc_type === 'soap_note')

  const DocList = ({ docs, emptyText }) => (
    docs.length === 0 ? (
      <p className="text-sm dark:text-slate-500 text-gray-400 py-4 text-center">{emptyText}</p>
    ) : (
      <div className="divide-y dark:divide-slate-700/50 divide-gray-100">
        {docs.map(doc => (
          <div key={doc.id} className="flex items-center gap-3 py-3">
            {doc.doc_type === 'soap_note'
              ? <ClipboardList className="w-4 h-4 flex-shrink-0 dark:text-purple-400 text-purple-600" />
              : <FileText className="w-4 h-4 flex-shrink-0 dark:text-cyan-400 text-cyan-600" />
            }
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium dark:text-slate-200 text-gray-800 truncate">
                {doc.doc_type === 'soap_note'
                  ? `${doc.patient_ref || 'Anonymous'} — ${doc.specialty || 'general'}`
                  : doc.filename
                }
              </p>
              <p className="text-xs dark:text-slate-500 text-gray-400">
                {formatBytes(doc.size_bytes)} · {formatDate(doc.ingested_at)}
                {doc.doc_type === 'soap_note' && doc.specialty && ` · ${doc.specialty}`}
              </p>
            </div>
            <button
              onClick={() => handleDelete(doc.id)}
              className="p-1.5 rounded-lg transition-colors dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    )
  )

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold dark:text-white text-gray-900">Knowledge Base</h2>
            <p className="text-xs dark:text-slate-400 text-gray-500 mt-0.5">
              Upload clinical guidelines · Approved SOAP notes are added automatically
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-lg border text-xs font-medium dark:bg-surface-800 dark:text-slate-300 dark:border-slate-700/50 bg-gray-100 text-gray-600 border-gray-200">
            <Database className="w-3 h-3 inline mr-1" />
            {documents.length} document{documents.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div
          onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files?.[0]) }}
          onDragOver={e => e.preventDefault()}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            uploading
              ? 'dark:border-purple-500/50 border-purple-400 cursor-wait'
              : 'dark:border-slate-700/50 dark:hover:border-purple-500/50 border-gray-200 hover:border-purple-400 cursor-pointer'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="w-7 h-7 mx-auto mb-2 animate-spin dark:text-purple-400 text-purple-600" />
              <p className="dark:text-slate-400 text-gray-500 text-sm">Ingesting into knowledge base…</p>
            </>
          ) : (
            <>
              <Upload className="w-7 h-7 mx-auto mb-2 dark:text-slate-500 text-gray-400" />
              <p className="dark:text-slate-400 text-gray-500 text-sm">Drop clinical guideline PDF or click to browse</p>
              <p className="text-xs dark:text-slate-600 text-gray-400 mt-1">PDF only · max 10 MB</p>
            </>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf" onChange={e => handleUpload(e.target.files?.[0])} className="hidden" />
        </div>

        {error && <p className="mt-3 text-sm dark:text-red-400 text-red-600">{error}</p>}

        {/* Disclaimer */}
        <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg dark:bg-amber-900/10 bg-amber-50 border dark:border-amber-700/30 border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 dark:text-amber-400 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs dark:text-amber-400/80 text-amber-700">
            Documents in this knowledge base inform AI responses. Ensure all ingested content is from verified clinical sources.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b dark:border-slate-700/50 border-gray-200 flex items-center gap-2">
            <BookOpen className="w-4 h-4 dark:text-cyan-400 text-cyan-600" />
            <h3 className="font-semibold dark:text-white text-gray-900 text-sm">Clinical Guidelines</h3>
            <span className="ml-auto text-xs dark:text-slate-500 text-gray-400">{guidelines.length}</span>
          </div>
          <div className="px-5">
            <DocList docs={guidelines} emptyText="No guidelines uploaded yet. Add PDFs above." />
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b dark:border-slate-700/50 border-gray-200 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 dark:text-purple-400 text-purple-600" />
            <h3 className="font-semibold dark:text-white text-gray-900 text-sm">Approved SOAP Notes</h3>
            <span className="ml-auto text-xs dark:text-slate-500 text-gray-400">{soapNotes.length}</span>
          </div>
          <div className="px-5">
            <DocList
              docs={soapNotes}
              emptyText="No SOAP notes yet. Approve a generated note in the SOAP Notes tab to add it here."
            />
          </div>
        </div>
      </div>
    </div>
  )
}
