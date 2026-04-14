import { useState, useEffect } from 'react'
import { AlertTriangle, Clock, Users, TrendingUp } from 'lucide-react'
import { getRiskDashboard } from '../api'

export default function RiskDashboard({ currentUser, onOpenClaim }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [currentUser])

  async function loadDashboard() {
    setLoading(true)
    try {
      const assignedTo = currentUser.role === 'caseworker' ? currentUser.username : undefined
      setData(await getRiskDashboard(assignedTo))
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  if (loading) return <div className="p-8 text-center text-govuk-grey">Loading dashboard...</div>
  if (!data) return <div className="p-8 text-center text-govuk-grey">Failed to load dashboard</div>

  const { stats, high_risk, medium_risk } = data

  return (
    <div>
      <h2 className="text-2xl font-bold text-govuk-dark mb-6">Risk dashboard</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users} label="Open claims" value={stats.total_open} color="blue" />
        <StatCard icon={AlertTriangle} label="High risk" value={stats.total_high_risk} color="red" />
        <StatCard icon={Clock} label="Breaching SLA" value={stats.total_breaching_sla} color="orange" />
        <StatCard icon={TrendingUp} label="Avg days open" value={stats.avg_days_open} color="grey" />
      </div>

      {high_risk.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold text-red-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> High risk claims
          </h3>
          <RiskTable items={high_risk} onOpenClaim={onOpenClaim} showAssigned={currentUser.role === 'team_leader'} />
        </div>
      )}

      {medium_risk.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-orange-600 mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5" /> Medium risk claims
          </h3>
          <RiskTable items={medium_risk} onOpenClaim={onOpenClaim} showAssigned={currentUser.role === 'team_leader'} />
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
    grey: 'bg-gray-50 border-gray-200 text-gray-800',
  }
  return (
    <div className={`border p-4 ${colorMap[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 opacity-70" />
        <span className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</span>
      </div>
      <span className="text-3xl font-bold">{value}</span>
    </div>
  )
}

function RiskTable({ items, onOpenClaim, showAssigned }) {
  return (
    <div className="bg-white border border-gray-300">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-300 bg-gray-50">
            <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Claim</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Claimant</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Type</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Status</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Days open</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">SLA</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Missing docs</th>
            {showAssigned && <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Assigned</th>}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.claim_id} onClick={() => onOpenClaim(item.claim_id)}
              className="border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors">
              <td className="px-4 py-3 text-sm font-mono text-govuk-blue font-medium">{item.claim_id}</td>
              <td className="px-4 py-3 text-sm font-medium">{item.claimant_name}</td>
              <td className="px-4 py-3 text-sm capitalize">{item.claim_type.replace('_', ' ')}</td>
              <td className="px-4 py-3 text-sm capitalize">{item.status.replace('_', ' ')}</td>
              <td className="px-4 py-3 text-sm">{item.days_open}d</td>
              <td className={`px-4 py-3 text-sm font-bold ${item.days_to_sla <= 0 ? 'text-red-700' : item.days_to_sla <= 14 ? 'text-orange-600' : 'text-govuk-grey'}`}>
                {item.days_to_sla <= 0 ? `${Math.abs(item.days_to_sla)}d over` : `${item.days_to_sla}d`}
              </td>
              <td className="px-4 py-3 text-sm">{item.missing_evidence_count > 0 ? <span className="text-red-700 font-medium">{item.missing_evidence_count}</span> : '0'}</td>
              {showAssigned && <td className="px-4 py-3 text-sm">{item.assigned_to || '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
