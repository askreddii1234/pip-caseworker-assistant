import { useEffect, useState } from 'react'
import { Search, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react'
import { getCases } from '../api'

const CASE_TYPES = {
  benefit_review: 'Benefit review',
  licence_application: 'Licence application',
  compliance_check: 'Compliance check',
  air_quality_concern: 'Air quality concern',
}

const SEVERITY_CLS = {
  Low: 'text-gray-700',
  Medium: 'text-blue-700',
  High: 'text-orange-700 font-bold',
  Critical: 'text-red-700 font-bold',
}

const STATUS_LABELS = {
  case_created: 'Case created',
  awaiting_evidence: 'Awaiting evidence',
  under_review: 'Under review',
  pending_decision: 'Pending decision',
  escalated: 'Escalated',
  closed: 'Closed',
}

const STATUS_CLS = {
  case_created: 'govuk-tag-blue',
  awaiting_evidence: 'govuk-tag-yellow',
  under_review: 'govuk-tag-orange',
  pending_decision: 'govuk-tag-blue',
  escalated: 'govuk-tag-red',
  closed: 'govuk-tag-green',
}

function RiskPill({ risk }) {
  if (!risk) return <span className="text-govuk-grey text-xs">—</span>
  if (risk.level === 'escalation_due') return (
    <span className="inline-flex items-center gap-1 text-red-700 text-xs font-bold">
      <AlertTriangle className="w-3.5 h-3.5" /> Escalate
    </span>
  )
  if (risk.level === 'reminder_due') return (
    <span className="inline-flex items-center gap-1 text-orange-600 text-xs font-bold">
      <AlertCircle className="w-3.5 h-3.5" /> Remind
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-govuk-grey text-xs">
      <CheckCircle className="w-3.5 h-3.5" /> OK
    </span>
  )
}

export default function CaseQueue({ currentUser, onOpenCase }) {
  const [cases, setCases] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ case_type: '', status: '', risk: '' })
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [filters, currentUser])

  async function load() {
    setLoading(true)
    try {
      const params = { ...filters }
      if (search) params.search = search
      if (currentUser.role === 'caseworker') params.assigned_to = mapUserToTeam(currentUser.username)
      const data = await getCases(params)
      setCases(data.cases)
      setTotal(data.total)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-govuk-dark">Cases queue</h2>
        <p className="text-govuk-grey mt-1">
          {currentUser.role === 'team_leader' ? 'All active cases' : `Cases assigned to ${mapUserToTeam(currentUser.username)}`}
          {' · '}{total} case{total !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="bg-white border border-gray-300 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <form onSubmit={(e) => { e.preventDefault(); load() }} className="flex gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-govuk-grey" />
            <input type="text" placeholder="Search by applicant name..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-govuk-blue" />
          </div>
          <button type="submit" className="bg-govuk-blue text-white px-4 py-2 text-sm font-medium hover:bg-blue-800">Search</button>
        </form>

        <select value={filters.case_type} onChange={(e) => setFilters(f => ({ ...f, case_type: e.target.value }))}
          className="border border-gray-300 px-3 py-2 text-sm">
          <option value="">All case types</option>
          {Object.entries(CASE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select value={filters.status} onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
          className="border border-gray-300 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select value={filters.risk} onChange={(e) => setFilters(f => ({ ...f, risk: e.target.value }))}
          className="border border-gray-300 px-3 py-2 text-sm">
          <option value="">All risk</option>
          <option value="escalation_due">Escalation due</option>
          <option value="reminder_due">Reminder due</option>
          <option value="ok">OK</option>
        </select>
      </div>

      <div className="bg-white border border-gray-300">
        {loading ? (
          <div className="p-8 text-center text-govuk-grey">Loading cases…</div>
        ) : cases.length === 0 ? (
          <div className="p-8 text-center text-govuk-grey">No cases match these filters.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-300 bg-gray-50">
                <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Case ID</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Applicant</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Type</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Risk</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Last updated</th>
                {currentUser.role === 'team_leader' && (
                  <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Assigned</th>
                )}
              </tr>
            </thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.case_id} onClick={() => onOpenCase(c.case_id)}
                  className="border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-govuk-blue font-medium">{c.case_id}</td>
                  <td className="px-4 py-3 text-sm font-medium">{c.applicant_name}</td>
                  <td className="px-4 py-3 text-sm">
                    {CASE_TYPES[c.case_type] || c.case_type}
                    {c.severity_level && (
                      <span className={`block text-xs ${SEVERITY_CLS[c.severity_level] || ''}`}>
                        {c.severity_level}{c.is_urgent && ' · URGENT'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`govuk-tag ${STATUS_CLS[c.status] || 'govuk-tag-blue'}`}>
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3"><RiskPill risk={c.risk} /></td>
                  <td className="px-4 py-3 text-sm text-govuk-grey">{c.last_updated}</td>
                  {currentUser.role === 'team_leader' && (
                    <td className="px-4 py-3 text-sm">{c.assigned_to || '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// Demo convention: map mock users to teams used in the seed data.
function mapUserToTeam(username) {
  if (username === 'j.patel') return 'team_a'
  if (username === 'r.singh') return 'team_b'
  return 'team_c'
}
