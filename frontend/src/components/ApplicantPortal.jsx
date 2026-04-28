import { useState } from 'react'
import { Search, Clock, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { getApplicantStatus } from '../api'

const CASE_TYPE_LABELS = {
  benefit_review: 'Benefit review',
  licence_application: 'Licence application',
  compliance_check: 'Compliance check',
}

export default function ApplicantPortal() {
  const [reference, setReference] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleLookup(e) {
    e.preventDefault()
    if (!reference.trim()) return
    setLoading(true); setError(null); setData(null)
    try {
      setData(await getApplicantStatus(reference.trim()))
    } catch (err) {
      setError(err.message || 'Lookup failed')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-govuk-dark mb-2">Check your case status</h2>
      <p className="text-govuk-grey mb-6">
        Enter your case reference number to see where your case is and what happens next.
      </p>

      <form onSubmit={handleLookup} className="bg-white border border-gray-300 p-4 mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-govuk-grey" />
          <input type="text" placeholder="e.g. REF-77291 or CASE-2026-00042"
            value={reference} onChange={(e) => setReference(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-govuk-blue" />
        </div>
        <button type="submit" disabled={loading || !reference.trim()}
          className="bg-govuk-blue text-white px-6 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-50">
          {loading ? 'Looking up…' : 'Check status'}
        </button>
      </form>

      <p className="text-xs text-govuk-grey mb-6 italic">
        Try <code className="px-1 bg-gray-100">REF-77291</code> or{' '}
        <code className="px-1 bg-gray-100">CASE-2026-00107</code> for demo data.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-300 p-3 text-sm text-red-700 mb-6">
          {error}
        </div>
      )}

      {data && (
        <div>
          <div className="bg-white border border-gray-300 p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-govuk-grey uppercase tracking-wide">Case reference</p>
                <p className="text-xl font-bold font-mono text-govuk-dark">{data.case_id}</p>
                <p className="text-sm text-govuk-grey mt-1">
                  {CASE_TYPE_LABELS[data.case_type] || data.case_type} · {data.applicant_name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-govuk-grey">Current status</p>
                <p className="text-lg font-bold text-govuk-blue">{data.status_label}</p>
              </div>
            </div>

            {data.status_description && (
              <div className="bg-blue-50 border border-blue-200 p-3 text-sm flex items-start gap-2">
                <Info className="w-4 h-4 text-govuk-blue shrink-0 mt-0.5" />
                <span>{data.status_description}</span>
              </div>
            )}
          </div>

          {data.evidence_outstanding && (
            <div className="bg-orange-50 border border-orange-300 p-4 mb-6 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-orange-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-orange-800 text-sm">Action needed from you</p>
                <p className="text-sm text-orange-800 mt-1">{data.evidence_message}</p>
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-300 p-4 mb-6">
            <h3 className="text-sm font-bold mb-4 text-govuk-dark flex items-center gap-2">
              <Clock className="w-4 h-4" /> What's happened so far
            </h3>
            <ol className="relative border-l-2 border-govuk-blue ml-2 space-y-4">
              {data.timeline.map((ev, i) => (
                <li key={i} className="ml-4">
                  <span className="absolute -left-[9px] w-4 h-4 border-2 border-govuk-blue bg-white" />
                  <div className="text-xs text-govuk-grey">{ev.date}</div>
                  <div className="text-sm font-medium">{ev.event.replace(/_/g, ' ')}</div>
                  {ev.note && <p className="text-xs text-govuk-grey mt-0.5">{ev.note}</p>}
                </li>
              ))}
            </ol>
            <p className="text-xs text-govuk-grey mt-4">
              Last updated: {data.last_updated}
            </p>
          </div>

          {data.what_happens_next && (
            <div className="bg-green-50 border border-green-300 p-4 flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-green-800 text-sm">What happens next</p>
                <p className="text-sm text-green-800 mt-1">{data.what_happens_next}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
