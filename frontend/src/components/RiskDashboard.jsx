import { useEffect, useState } from 'react'
import { AlertTriangle, AlertCircle, Users, Briefcase, Wind, School, Flame } from 'lucide-react'
import { getRiskDashboard } from '../api'

const SEVERITY_ORDER = ['Critical', 'High', 'Medium', 'Low']
const SEVERITY_CLS = {
  Critical: 'bg-red-50 border-red-300 text-red-800',
  High: 'bg-orange-50 border-orange-300 text-orange-800',
  Medium: 'bg-blue-50 border-blue-300 text-blue-800',
  Low: 'bg-gray-50 border-gray-300 text-gray-800',
}

export default function RiskDashboard({ currentUser, onOpenCase }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [currentUser])

  async function load() {
    setLoading(true)
    try {
      const assignedTo = currentUser.role === 'caseworker'
        ? (currentUser.username === 'j.patel' ? 'team_a' : currentUser.username === 'r.singh' ? 'team_b' : 'team_c')
        : undefined
      setData(await getRiskDashboard(assignedTo))
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  if (loading) return <div className="p-8 text-center text-govuk-grey">Loading dashboard…</div>
  if (!data) return <div className="p-8 text-center text-govuk-grey">Failed to load dashboard.</div>

  const { stats, escalation_due, reminder_due, air_quality } = data

  return (
    <div>
      <h2 className="text-2xl font-bold text-govuk-dark mb-6">Risk dashboard</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users} label="Open cases" value={stats.total_open} color="blue" />
        <StatCard icon={AlertTriangle} label="Escalation due" value={stats.total_escalation_due} color="red" />
        <StatCard icon={AlertCircle} label="Reminder due" value={stats.total_reminder_due} color="orange" />
        <StatCard icon={Briefcase} label="Case types"
          value={Object.keys(stats.by_case_type || {}).length} color="grey" />
      </div>

      {stats.by_case_type && (
        <div className="bg-white border border-gray-300 p-4 mb-8">
          <div className="text-xs font-medium text-govuk-grey uppercase tracking-wide mb-2">Open by case type</div>
          <div className="flex flex-wrap gap-3 text-sm">
            {Object.entries(stats.by_case_type).map(([k, v]) => (
              <span key={k} className="border border-gray-300 px-3 py-1">
                {k.replace(/_/g, ' ')}: <strong>{v}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {escalation_due.length > 0 && (
        <section className="mb-8">
          <h3 className="text-lg font-bold text-red-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> Escalation due
          </h3>
          <RiskTable items={escalation_due} onOpen={onOpenCase} showAssigned={currentUser.role === 'team_leader'} />
        </section>
      )}

      {reminder_due.length > 0 && (
        <section>
          <h3 className="text-lg font-bold text-orange-600 mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> Reminder due
          </h3>
          <RiskTable items={reminder_due} onOpen={onOpenCase} showAssigned={currentUser.role === 'team_leader'} />
        </section>
      )}

      {escalation_due.length === 0 && reminder_due.length === 0 && (
        <div className="bg-green-50 border border-green-300 p-6 text-center text-green-800 mb-8">
          No cases currently breaching reminder or escalation thresholds.
        </div>
      )}

      {air_quality && air_quality.total_open > 0 && (
        <AirQualityDashboardSection data={air_quality} showTeamViews={currentUser.role === 'team_leader'} />
      )}
    </div>
  )
}

function AirQualityDashboardSection({ data, showTeamViews }) {
  const {
    total_open, urgent, by_severity, by_school, by_issue_category,
    sla_breach, workload_by_officer, high_risk_schools,
  } = data
  const critical = by_severity?.Critical || 0

  return (
    <section className="mt-10 pt-8 border-t-4 border-govuk-blue">
      <div className="flex items-center gap-3 mb-5">
        <Wind className="w-6 h-6 text-govuk-blue" />
        <h3 className="text-xl font-bold text-govuk-dark">Air quality concerns</h3>
        <span className="text-sm text-govuk-grey">— school environment cases</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Wind} label="Open AQ cases" value={total_open} color="blue" />
        <StatCard icon={Flame} label="Critical" value={critical} color="red" />
        <StatCard icon={AlertTriangle} label="SLA breach" value={sla_breach} color="orange" />
        <StatCard icon={AlertCircle} label="Urgent flag" value={urgent} color="orange" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-300 p-4">
          <div className="text-xs font-medium text-govuk-grey uppercase tracking-wide mb-2">By severity</div>
          <div className="space-y-2">
            {SEVERITY_ORDER.filter(s => by_severity?.[s]).map(s => (
              <div key={s} className={`flex items-center justify-between border p-2 ${SEVERITY_CLS[s]}`}>
                <span className="text-sm font-medium">{s}</span>
                <span className="text-lg font-bold">{by_severity[s]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-300 p-4">
          <div className="text-xs font-medium text-govuk-grey uppercase tracking-wide mb-2">By issue category</div>
          <div className="space-y-1">
            {Object.entries(by_issue_category || {}).sort((a, b) => b[1] - a[1]).map(([cat, n]) => (
              <div key={cat} className="flex items-center justify-between text-sm border-b border-gray-100 py-1">
                <span>{cat}</span>
                <strong>{n}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-300 p-4 mb-6">
        <div className="text-xs font-medium text-govuk-grey uppercase tracking-wide mb-2 flex items-center gap-1">
          <School className="w-3 h-3" /> Cases by school
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {Object.entries(by_school || {}).sort((a, b) => b[1] - a[1]).map(([school, n]) => (
            <div key={school} className="flex items-center justify-between text-sm border-b border-gray-100 py-1">
              <span>{school}</span>
              <strong>{n}</strong>
            </div>
          ))}
        </div>
      </div>

      {showTeamViews && (
        <>
          <div className="bg-white border border-gray-300 p-4 mb-6">
            <div className="text-xs font-medium text-govuk-grey uppercase tracking-wide mb-2 flex items-center gap-1">
              <Users className="w-3 h-3" /> Workload by officer
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              {Object.entries(workload_by_officer || {}).sort((a, b) => b[1] - a[1]).map(([who, n]) => (
                <div key={who} className="flex items-center justify-between text-sm border-b border-gray-100 py-1">
                  <span>{who}</span>
                  <strong>{n} case{n !== 1 ? 's' : ''}</strong>
                </div>
              ))}
            </div>
          </div>

          {high_risk_schools && high_risk_schools.length > 0 && (
            <div className="bg-red-50 border border-red-300 p-4">
              <div className="text-xs font-bold text-red-800 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Flame className="w-3 h-3" /> High-risk schools
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-govuk-grey uppercase">
                    <th className="text-left py-1">School</th>
                    <th className="text-left py-1">Open</th>
                    <th className="text-left py-1">Severity mix</th>
                    <th className="text-left py-1">Risk score</th>
                  </tr>
                </thead>
                <tbody>
                  {high_risk_schools.map(row => (
                    <tr key={row.school_name} className="border-t border-red-200">
                      <td className="py-1 font-medium">{row.school_name}</td>
                      <td className="py-1">{row.open_cases}</td>
                      <td className="py-1 text-xs">
                        {Object.entries(row.severity_breakdown).map(([s, n]) => (
                          <span key={s} className="mr-2">{s}: {n}</span>
                        ))}
                      </td>
                      <td className="py-1 font-bold">{row.risk_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  const cls = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
    grey: 'bg-gray-50 border-gray-200 text-gray-800',
  }[color]
  return (
    <div className={`border p-4 ${cls}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 opacity-70" />
        <span className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</span>
      </div>
      <span className="text-3xl font-bold">{value}</span>
    </div>
  )
}

function RiskTable({ items, onOpen, showAssigned }) {
  return (
    <div className="bg-white border border-gray-300">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-300 bg-gray-50">
            <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Case</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Applicant</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Type</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Days since request</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Reason</th>
            {showAssigned && <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Team</th>}
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.case_id} onClick={() => onOpen(it.case_id)}
              className="border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors">
              <td className="px-4 py-3 text-sm font-mono text-govuk-blue font-medium">{it.case_id}</td>
              <td className="px-4 py-3 text-sm font-medium">{it.applicant_name}</td>
              <td className="px-4 py-3 text-sm">{it.case_type.replace(/_/g, ' ')}</td>
              <td className={`px-4 py-3 text-sm font-bold ${it.risk_level === 'escalation_due' ? 'text-red-700' : 'text-orange-600'}`}>
                {it.days_since_request ?? '—'}d
              </td>
              <td className="px-4 py-3 text-sm text-govuk-grey">{it.risk_reason}</td>
              {showAssigned && <td className="px-4 py-3 text-sm">{it.assigned_to || '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
