import { useState, useEffect } from 'react'
import { Search, Clock, AlertTriangle, CheckCircle, Circle, ArrowUpDown } from 'lucide-react'
import { getClaims } from '../api'

const STATUS_CONFIG = {
  submitted: { label: 'Submitted', cls: 'govuk-tag-blue' },
  evidence_gathering: { label: 'Evidence gathering', cls: 'govuk-tag-yellow' },
  assessment: { label: 'Assessment', cls: 'govuk-tag-orange' },
  under_review: { label: 'Under review', cls: 'govuk-tag-yellow' },
  decision_made: { label: 'Decision made', cls: 'govuk-tag-blue' },
  approved: { label: 'Approved', cls: 'govuk-tag-green' },
  rejected: { label: 'Rejected', cls: 'govuk-tag-red' },
}

const RISK_CONFIG = {
  high: { label: 'High', cls: 'govuk-tag-red' },
  medium: { label: 'Medium', cls: 'govuk-tag-orange' },
  low: { label: 'Low', cls: 'govuk-tag-green' },
}

export default function ClaimQueue({ currentUser, onOpenClaim }) {
  const [claims, setClaims] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', claim_type: '', risk_level: '' })
  const [search, setSearch] = useState('')

  useEffect(() => { loadClaims() }, [filters, currentUser])

  async function loadClaims() {
    setLoading(true)
    try {
      const params = { ...filters }
      if (search) params.search = search
      if (currentUser.role === 'caseworker') params.assigned_to = currentUser.username
      Object.keys(params).forEach(k => !params[k] && delete params[k])
      const data = await getClaims(params)
      setClaims(data.claims)
      setTotal(data.total)
    } catch (err) { console.error('Failed to load claims:', err) }
    setLoading(false)
  }

  function daysOpen(dateStr) {
    return Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24))
  }

  function daysToSLA(created) {
    return 75 - daysOpen(created)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-govuk-dark">PIP claims queue</h2>
          <p className="text-govuk-grey mt-1">
            {currentUser.role === 'team_leader' ? 'All active claims' : 'Your assigned claims'}
            {' · '}{total} claim{total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-300 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <form onSubmit={(e) => { e.preventDefault(); loadClaims() }} className="flex gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-govuk-grey" />
            <input type="text" placeholder="Search by claimant name..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-govuk-blue" />
          </div>
          <button type="submit" className="bg-govuk-blue text-white px-4 py-2 text-sm font-medium hover:bg-blue-800">Search</button>
        </form>

        <select value={filters.status} onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
          className="border border-gray-300 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="evidence_gathering">Evidence gathering</option>
          <option value="assessment">Assessment</option>
          <option value="under_review">Under review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>

        <select value={filters.claim_type} onChange={(e) => setFilters(f => ({ ...f, claim_type: e.target.value }))}
          className="border border-gray-300 px-3 py-2 text-sm">
          <option value="">All types</option>
          <option value="new_claim">New claim</option>
          <option value="reassessment">Reassessment</option>
          <option value="mandatory_reconsideration">Mandatory reconsideration</option>
        </select>

        <select value={filters.risk_level} onChange={(e) => setFilters(f => ({ ...f, risk_level: e.target.value }))}
          className="border border-gray-300 px-3 py-2 text-sm">
          <option value="">All risk levels</option>
          <option value="high">High risk</option>
          <option value="medium">Medium risk</option>
          <option value="low">Low risk</option>
        </select>
      </div>

      <div className="bg-white border border-gray-300">
        {loading ? (
          <div className="p-8 text-center text-govuk-grey">Loading claims...</div>
        ) : claims.length === 0 ? (
          <div className="p-8 text-center text-govuk-grey">No claims found</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-300 bg-gray-50">
                <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Claim ID</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Claimant</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Condition</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Type</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Risk</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">SLA</th>
                {currentUser.role === 'team_leader' && (
                  <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Assigned</th>
                )}
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => {
                const status = STATUS_CONFIG[c.status] || STATUS_CONFIG.submitted
                const risk = RISK_CONFIG[c.risk_level] || RISK_CONFIG.low
                const sla = daysToSLA(c.created_at)
                const slaClass = sla <= 0 ? 'text-red-700 font-bold' : sla <= 14 ? 'text-orange-600 font-medium' : 'text-govuk-grey'

                return (
                  <tr key={c.id} onClick={() => onOpenClaim(c.id)}
                    className="border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-govuk-blue font-medium">{c.id}</td>
                    <td className="px-4 py-3 text-sm font-medium">{c.claimant_name}</td>
                    <td className="px-4 py-3 text-sm text-govuk-grey max-w-[180px] truncate">{c.primary_condition}</td>
                    <td className="px-4 py-3 text-sm capitalize">{c.claim_type.replace('_', ' ')}</td>
                    <td className="px-4 py-3"><span className={`govuk-tag ${status.cls}`}>{status.label}</span></td>
                    <td className="px-4 py-3"><span className={`govuk-tag ${risk.cls}`}>{risk.label}</span></td>
                    <td className={`px-4 py-3 text-sm ${slaClass}`}>
                      {sla <= 0 ? `${Math.abs(sla)}d overdue` : `${sla}d left`}
                    </td>
                    {currentUser.role === 'team_leader' && (
                      <td className="px-4 py-3 text-sm">{c.assigned_to || '—'}</td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
