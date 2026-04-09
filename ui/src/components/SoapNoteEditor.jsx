import { useState } from 'react'
import axios from 'axios'
import { Check, Copy, Download, FileText, User, Loader2, Pencil, X, AlertTriangle, Receipt } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const SECTIONS = [
  { key: 'chief_complaint', label: 'Chief Complaint',  rows: 2,  color: 'purple' },
  { key: 'subjective',      label: 'Subjective',        rows: 4,  color: 'blue'   },
  { key: 'objective',       label: 'Objective',         rows: 4,  color: 'cyan'   },
  { key: 'assessment',      label: 'Assessment',        rows: 3,  color: 'amber'  },
  { key: 'plan',            label: 'Plan',              rows: 4,  color: 'green'  },
]

const SECTION_COLORS = {
  purple: { label: 'dark:text-purple-400 text-purple-700', border: 'dark:border-purple-700/40 border-purple-200', bg: 'dark:bg-purple-900/10 bg-purple-50/50' },
  blue:   { label: 'dark:text-blue-400 text-blue-700',     border: 'dark:border-blue-700/40 border-blue-200',     bg: 'dark:bg-blue-900/10 bg-blue-50/50'     },
  cyan:   { label: 'dark:text-cyan-400 text-cyan-700',     border: 'dark:border-cyan-700/40 border-cyan-200',     bg: 'dark:bg-cyan-900/10 bg-cyan-50/50'     },
  amber:  { label: 'dark:text-amber-400 text-amber-700',   border: 'dark:border-amber-700/40 border-amber-200',   bg: 'dark:bg-amber-900/10 bg-amber-50/50'   },
  green:  { label: 'dark:text-green-400 text-green-700',   border: 'dark:border-green-700/40 border-green-200',   bg: 'dark:bg-green-900/10 bg-green-50/50'   },
}

/** Keyword badges — colour-coded by category */
function KeywordBadges({ keywords }) {
  if (!keywords) return null
  const { symptoms = [], medications = [], diagnoses = [] } = keywords
  if (!symptoms.length && !medications.length && !diagnoses.length) return null

  return (
    <div className="rounded-xl border dark:border-slate-700/40 border-gray-200 dark:bg-surface-800/30 bg-gray-50/50 p-4">
      <p className="text-xs font-bold uppercase tracking-widest dark:text-slate-500 text-gray-400 mb-3">Extracted Keywords</p>
      <div className="space-y-2">
        {symptoms.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs dark:text-slate-500 text-gray-400 w-20 flex-shrink-0">Symptoms</span>
            {symptoms.map(s => (
              <span key={s} className="px-2 py-0.5 rounded-full text-xs font-medium dark:bg-purple-900/30 dark:border dark:border-purple-700/40 dark:text-purple-300 bg-purple-100 border border-purple-200 text-purple-700">{s}</span>
            ))}
          </div>
        )}
        {medications.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs dark:text-slate-500 text-gray-400 w-20 flex-shrink-0">Medications</span>
            {medications.map(m => (
              <span key={m} className="px-2 py-0.5 rounded-full text-xs font-medium dark:bg-cyan-900/30 dark:border dark:border-cyan-700/40 dark:text-cyan-300 bg-cyan-100 border border-cyan-200 text-cyan-700">{m}</span>
            ))}
          </div>
        )}
        {diagnoses.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs dark:text-slate-500 text-gray-400 w-20 flex-shrink-0">Diagnoses</span>
            {diagnoses.map(d => (
              <span key={d} className="px-2 py-0.5 rounded-full text-xs font-medium dark:bg-amber-900/30 dark:border dark:border-amber-700/40 dark:text-amber-300 bg-amber-100 border border-amber-200 text-amber-700">{d}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Billing codes display — two-column ICD-10 / CPT grid */
function BillingCodesDisplay({ billing }) {
  if (!billing) return null
  return (
    <div className="rounded-xl border dark:border-slate-700/40 border-gray-200 dark:bg-surface-800/30 bg-gray-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest dark:text-slate-500 text-gray-400">Billing Codes (AI Suggestion)</p>
      </div>
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg dark:bg-amber-900/10 bg-amber-50 border dark:border-amber-700/30 border-amber-200">
        <AlertTriangle className="w-3.5 h-3.5 dark:text-amber-400 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs dark:text-amber-400/80 text-amber-700">
          ICD-10 and CPT codes are AI suggestions only. Verify against official medical coding guidelines (ICD-10-CM, CPT) before clinical submission.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* ICD-10 */}
        <div>
          <p className="text-xs font-semibold dark:text-slate-400 text-gray-600 mb-2">ICD-10 (Diagnoses)</p>
          {billing.icd10?.length > 0 ? billing.icd10.map(c => (
            <div key={c.code} className="flex items-start gap-2 mb-2">
              <span className="font-mono text-xs px-2 py-0.5 rounded dark:bg-purple-900/30 dark:text-purple-300 bg-purple-100 text-purple-700 flex-shrink-0">{c.code}</span>
              <span className="text-xs dark:text-slate-300 text-gray-700 leading-relaxed">{c.description}</span>
            </div>
          )) : <p className="text-xs dark:text-slate-500 text-gray-400">No ICD-10 codes suggested</p>}
        </div>
        {/* CPT */}
        <div>
          <p className="text-xs font-semibold dark:text-slate-400 text-gray-600 mb-2">CPT (Procedures / E&M)</p>
          {billing.cpt?.length > 0 ? billing.cpt.map(c => (
            <div key={c.code} className="flex items-start gap-2 mb-2">
              <span className="font-mono text-xs px-2 py-0.5 rounded dark:bg-cyan-900/30 dark:text-cyan-300 bg-cyan-100 text-cyan-700 flex-shrink-0">{c.code}</span>
              <span className="text-xs dark:text-slate-300 text-gray-700 leading-relaxed">{c.description}</span>
            </div>
          )) : <p className="text-xs dark:text-slate-500 text-gray-400">No CPT codes suggested</p>}
        </div>
      </div>
    </div>
  )
}

/** Single SOAP section — read mode with inline edit */
function SoapSection({ sectionKey, label, rows, color, value, onChange }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const c = SECTION_COLORS[color]

  const save = () => { onChange(draft); setEditing(false) }
  const cancel = () => { setDraft(value); setEditing(false) }

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden`}>
      <div className={`flex items-center justify-between px-4 py-2 border-b ${c.border}`}>
        <span className={`text-xs font-bold uppercase tracking-widest ${c.label}`}>{label}</span>
        {!editing ? (
          <button
            onClick={() => { setDraft(value); setEditing(true) }}
            className="flex items-center gap-1 text-xs dark:text-slate-500 dark:hover:text-slate-200 text-gray-400 hover:text-gray-700 transition-colors px-2 py-0.5 rounded hover:dark:bg-slate-700/50 hover:bg-gray-100"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={save} className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors">
              <Check className="w-3 h-3" /> Save
            </button>
            <button onClick={cancel} className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded dark:bg-slate-700/50 dark:text-slate-400 bg-gray-100 text-gray-500 transition-colors">
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <textarea
          autoFocus
          className="w-full px-4 py-3 text-sm dark:text-slate-200 text-gray-800 dark:bg-slate-800/60 bg-white resize-none outline-none leading-relaxed font-mono"
          rows={rows + 1}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') cancel() }}
        />
      ) : (
        <p className="px-4 py-3 text-sm dark:text-slate-200 text-gray-800 leading-relaxed whitespace-pre-wrap min-h-[3rem]">
          {value || <span className="italic dark:text-slate-500 text-gray-400">No content</span>}
        </p>
      )}
    </div>
  )
}

export default function SoapNoteEditor({ soap, keywords, specialty, onApproved }) {
  const [note, setNote] = useState({ ...soap })
  const [patientRef, setPatientRef] = useState('')
  const [copied, setCopied] = useState(false)
  const [approving, setApproving] = useState(false)
  const [approved, setApproved] = useState(false)
  const [error, setError] = useState('')
  const [billing, setBilling] = useState(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingError, setBillingError] = useState('')

  const updateSection = (key, value) => {
    setNote(prev => ({ ...prev, [key]: value }))
    // Clear billing codes if note is edited (codes may no longer be accurate)
    setBilling(null)
    setBillingError('')
  }

  const toMarkdown = () =>
    SECTIONS.map(({ key, label }) => `## ${label}\n\n${note[key] || ''}`).join('\n\n')

  const toText = () =>
    SECTIONS.map(({ key, label }) => `${label.toUpperCase()}\n${'─'.repeat(40)}\n${note[key] || ''}`).join('\n\n')

  const handleCopy = () => {
    navigator.clipboard.writeText(toMarkdown())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = (ext) => {
    const content = ext === 'md' ? toMarkdown() : toText()
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `SOAP_${specialty}_${patientRef || 'patient'}_${new Date().toISOString().slice(0,10)}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleApprove = async () => {
    setApproving(true)
    setError('')
    try {
      await axios.post(`${API_URL}/approve-note`, {
        soap: note,
        specialty,
        patient_ref: patientRef,
        billing: billing || null,
        keywords: keywords || null,
      }, { timeout: 120000 })
      setApproved(true)
      onApproved?.()
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to save note.')
    } finally {
      setApproving(false)
    }
  }

  const handleGenerateBilling = async () => {
    setBillingLoading(true)
    setBillingError('')
    setBilling(null)
    try {
      const res = await axios.post(`${API_URL}/generate-billing`, {
        soap: note,
        specialty,
      }, { timeout: 300000 })
      setBilling(res.data)
    } catch (e) {
      setBillingError(e.response?.data?.detail || 'Billing code generation failed.')
    } finally {
      setBillingLoading(false)
    }
  }

  return (
    <div className="card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold dark:text-white text-gray-900">SOAP Note Draft</h3>
          <p className="text-xs dark:text-slate-400 text-gray-500 mt-0.5 capitalize">
            {specialty} · Edit any section before approving
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleCopy} className="btn-secondary text-xs">
            {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
          </button>
          <button onClick={() => handleDownload('md')} className="btn-secondary text-xs">
            <Download className="w-3.5 h-3.5" /> .md
          </button>
          <button onClick={() => handleDownload('txt')} className="btn-secondary text-xs">
            <FileText className="w-3.5 h-3.5" /> .txt
          </button>
        </div>
      </div>

      {/* Keywords */}
      <KeywordBadges keywords={keywords} />

      {/* Sections */}
      <div className="space-y-3">
        {SECTIONS.map(({ key, label, rows, color }) => (
          <SoapSection
            key={key}
            sectionKey={key}
            label={label}
            rows={rows}
            color={color}
            value={note[key] || ''}
            onChange={val => updateSection(key, val)}
          />
        ))}
      </div>

      {/* Generate Billing Codes button */}
      <div className="pt-2 border-t dark:border-slate-700/50 border-gray-200">
        <button
          onClick={handleGenerateBilling}
          disabled={billingLoading}
          className="btn-secondary text-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {billingLoading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating Billing Codes…</>
            : <><Receipt className="w-4 h-4" /> Generate Billing Codes</>
          }
        </button>
        {billingError && <p className="mt-2 text-sm dark:text-red-400 text-red-600">{billingError}</p>}
      </div>

      {/* Billing codes display */}
      {billing && <BillingCodesDisplay billing={billing} />}

      {/* Approve section */}
      <div className="pt-2 border-t dark:border-slate-700/50 border-gray-200 space-y-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider dark:text-slate-400 text-gray-500 mb-1">
            Case Reference <span className="normal-case font-normal dark:text-slate-500 text-gray-400">— optional</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-slate-500 text-gray-400" />
            <input
              type="text"
              className="input-field pl-9 h-10"
              placeholder="e.g. Visit ID, case number, or initials"
              value={patientRef}
              onChange={e => setPatientRef(e.target.value)}
            />
          </div>
          <p className="text-xs dark:text-slate-600 text-gray-400 mt-1">
            A label to identify this consultation — used when searching the knowledge base in Clinical QA.
          </p>
        </div>

        {approved ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl dark:bg-green-900/20 dark:border dark:border-green-700/40 bg-green-50 border border-green-200">
            <Check className="w-4 h-4 dark:text-green-400 text-green-600 flex-shrink-0" />
            <span className="text-sm font-medium dark:text-green-300 text-green-700">
              Note saved to knowledge base — searchable in Clinical QA tab
            </span>
          </div>
        ) : (
          <button
            onClick={handleApprove}
            disabled={approving}
            className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #A335FC, #06b6d4)', boxShadow: '0 0 20px rgba(163,53,252,0.3)' }}
          >
            {approving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving to Knowledge Base…</>
              : <><Check className="w-4 h-4" /> Approve & Save to Knowledge Base</>
            }
          </button>
        )}

        {error && <p className="text-sm dark:text-red-400 text-red-600">{error}</p>}

        {/* Upgraded disclaimer */}
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg dark:bg-amber-900/10 bg-amber-50 border dark:border-amber-700/30 border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 dark:text-amber-400 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-xs font-medium dark:text-amber-300 text-amber-800">Clinician Review Mandatory</p>
            <p className="text-xs dark:text-amber-400/80 text-amber-700">
              AI-generated draft — must be reviewed and approved by a qualified clinician before clinical use.
              ICD-10 and CPT codes are AI suggestions only. Verify against official medical coding guidelines (ICD-10-CM, CPT) before clinical submission.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
