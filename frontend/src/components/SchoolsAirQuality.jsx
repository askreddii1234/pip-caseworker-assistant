import { useEffect, useMemo, useState } from 'react'
import {
  School, MapPin, AlertTriangle, Info, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronRight, ExternalLink, Activity,
} from 'lucide-react'
import { getAirQualitySchools, getAirQualitySchool } from '../api'

const TIMEFRAMES = [
  { value: 'today', label: 'Latest month' },
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
  { value: '1y', label: 'Last 12 months' },
  { value: '5y', label: 'Full 3-year series' },
]

const RAG_DOT = {
  green: 'bg-govuk-green',
  amber: 'bg-[#f47738]',
  red: 'bg-govuk-red',
}
const RAG_TEXT = {
  green: 'text-govuk-green',
  amber: 'text-[#b5501b]',
  red: 'text-govuk-red',
}
const RAG_BADGE = {
  green: 'bg-govuk-green text-white',
  amber: 'bg-[#f47738] text-white',
  red: 'bg-govuk-red text-white',
}
const RAG_BAR = {
  green: 'bg-govuk-green',
  amber: 'bg-[#f47738]',
  red: 'bg-govuk-red',
}
const CERTAINTY_CLS = {
  High: 'bg-govuk-green text-white',
  Medium: 'bg-[#f47738] text-white',
  Low: 'bg-govuk-grey text-white',
}

function TrendIcon({ trend, pollutant }) {
  // For most pollutants "up" is bad; for temperature/humidity it's neutral.
  const neutral = pollutant === 'temperature' || pollutant === 'humidity'
  if (trend === 'up') {
    return <TrendingUp className={`w-4 h-4 ${neutral ? 'text-govuk-grey' : 'text-govuk-red'}`} aria-label="trending up" />
  }
  if (trend === 'down') {
    return <TrendingDown className={`w-4 h-4 ${neutral ? 'text-govuk-grey' : 'text-govuk-green'}`} aria-label="trending down" />
  }
  return <Minus className="w-4 h-4 text-govuk-grey" aria-label="stable" />
}

function SchoolListItem({ school, selected, onSelect }) {
  return (
    <button onClick={() => onSelect(school.urn)}
      className={`w-full text-left p-3 border transition-colors ${
        selected
          ? 'bg-blue-50 border-l-4 border-govuk-blue border-y-gray-300 border-r-gray-300'
          : 'bg-white border-gray-300 hover:border-govuk-blue'
      }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-sm text-govuk-dark truncate">{school.name}</div>
          <div className="text-xs text-govuk-grey mt-0.5 truncate">
            {school.town} · {school.phase}
          </div>
        </div>
        <span className={`shrink-0 w-3 h-3 rounded-full mt-1 ${RAG_DOT[school.worst_rag]}`}
          aria-label={`Overall ${school.worst_rag}`} />
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs">
        <span className="text-govuk-grey">
          AQI <strong className="text-govuk-dark">{school.latest_aqi}</strong>
        </span>
        {school.open_cases > 0 && (
          <span className="text-govuk-red font-medium">
            {school.open_cases} open report{school.open_cases !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  )
}

function PollutantRow({ p, expanded, onToggle }) {
  const ragBadge = RAG_BADGE[p.rag]
  const certaintyBadge = CERTAINTY_CLS[p.certainty] || CERTAINTY_CLS.Low
  const pct = p.pct_of_threshold

  return (
    <>
      <tr className="border-b border-gray-200 hover:bg-gray-50">
        <td className="px-4 py-3 font-medium text-govuk-dark">
          {p.display_name}
        </td>
        <td className="px-4 py-3 text-sm font-mono">
          <div>{p.value ?? '—'} <span className="text-govuk-grey">{p.unit}</span></div>
          {pct !== null && (
            <div className="mt-1 h-2 bg-gray-100 rounded-sm overflow-hidden" aria-label={`${pct}% of amber-red threshold`}>
              <div className={`h-full ${RAG_BAR[p.rag]}`} style={{ width: `${pct}%` }} />
            </div>
          )}
          {pct !== null && (
            <div className="text-xs text-govuk-grey mt-0.5">{pct}% of threshold</div>
          )}
        </td>
        <td className="px-4 py-3">
          <span className={`inline-block text-xs font-bold px-2 py-0.5 ${ragBadge}`}>
            {p.rag.toUpperCase()}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-block text-xs font-medium px-2 py-0.5 ${certaintyBadge}`}>
            {p.certainty}
          </span>
        </td>
        <td className="px-4 py-3">
          <TrendIcon trend={p.trend} pollutant={p.pollutant} />
        </td>
        <td className="px-4 py-3 text-right">
          <button onClick={onToggle}
            className="inline-flex items-center gap-1 text-xs text-govuk-blue hover:underline">
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {expanded ? 'Hide' : 'What can I do?'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-blue-50 border-b border-gray-200">
          <td colSpan={6} className="px-4 py-3">
            <div className="text-xs font-bold text-govuk-dark mb-1">Recommended actions for {p.display_name}</div>
            <ul className="text-sm list-disc ml-5 mb-3 space-y-0.5">
              {p.actions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
            <details className="text-xs">
              <summary className="cursor-pointer text-govuk-blue hover:underline inline-flex items-center gap-1">
                <Info className="w-3 h-3" /> Sources &amp; guideline
              </summary>
              <ul className="list-disc ml-5 mt-2 text-govuk-grey">
                {p.sources.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </details>
          </td>
        </tr>
      )}
    </>
  )
}

function ParentReports({ school, reports, summary, onOpenCase }) {
  if (!reports || reports.length === 0) {
    return (
      <div className="bg-green-50 border border-green-300 p-4 text-sm text-green-800">
        No parent or staff reports for {school.name}.
      </div>
    )
  }
  const reportTypes = [
    'Odor', 'Dust/Particles', 'Mold/Moisture', 'Chemical Smell',
    'Poor Ventilation', 'Temperature Issues', 'Other',
  ]

  return (
    <div>
      <div className="bg-white border border-gray-300 p-4 mb-3">
        <div className="text-sm font-bold text-govuk-dark mb-2">
          Total reports: {summary.total}
          {summary.last_reported && <span className="text-govuk-grey font-normal"> · Last reported {summary.last_reported}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {reportTypes.map(t => (
            <span key={t}
              className={`text-xs px-2 py-1 border ${
                summary.counts[t]
                  ? 'bg-blue-50 border-blue-200 text-blue-800 font-medium'
                  : 'bg-gray-50 border-gray-200 text-govuk-grey'
              }`}>
              {t}: {summary.counts[t] || 0}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-300 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-300">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-govuk-grey uppercase tracking-wide">Date</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-govuk-grey uppercase tracking-wide">Type</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-govuk-grey uppercase tracking-wide">Issue</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-govuk-grey uppercase tracking-wide">Severity</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-govuk-grey uppercase tracking-wide">Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.case_id}
                onClick={() => onOpenCase(r.case_id)}
                className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer">
                <td className="px-4 py-2 text-govuk-grey whitespace-nowrap">{r.date}</td>
                <td className="px-4 py-2">
                  <span className="inline-block text-xs px-2 py-0.5 bg-gray-100 border border-gray-200">
                    {r.type}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-govuk-blue shrink-0">{r.case_id}</span>
                    <ExternalLink className="w-3 h-3 text-govuk-grey shrink-0" />
                    <span className="truncate text-govuk-dark">{r.issue.slice(0, 80)}{r.issue.length > 80 ? '…' : ''}</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span className={`text-xs font-medium ${
                    r.severity === 'Critical' ? 'text-govuk-red' :
                    r.severity === 'High' ? 'text-[#b5501b]' : 'text-govuk-grey'
                  }`}>
                    {r.severity || '—'}{r.is_urgent && ' · URGENT'}
                  </span>
                </td>
                <td className="px-4 py-2 text-govuk-grey">{r.reviewed ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SchoolDetail({ detail, timeframe, onTimeframeChange, onOpenCase }) {
  const [expanded, setExpanded] = useState(null)
  const redCount = useMemo(
    () => detail.pollutants.filter(p => p.rag === 'red').length,
    [detail.pollutants],
  )

  return (
    <div>
      <div className="bg-white border border-gray-300 p-5 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-xl font-bold text-govuk-dark">{detail.name}</h3>
            <p className="text-sm text-govuk-grey mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {detail.address?.line1}{detail.address?.line2 ? `, ${detail.address.line2}` : ''} ·
              {' '}{detail.address?.town} · {detail.address?.postcode}
            </p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-govuk-grey">
              <span>URN <strong className="text-govuk-dark">{detail.urn}</strong></span>
              <span>{detail.phase} · {detail.school_type}</span>
              <span>Ofsted: <strong className="text-govuk-dark">{detail.ofsted_rating}</strong></span>
              <span>Building: <strong className="text-govuk-dark">{detail.building_era} · {detail.building_condition}</strong></span>
              <span>Pupils: <strong className="text-govuk-dark">{detail.pupil_count}</strong></span>
              <span>Monitor: <strong className="text-govuk-dark">{detail.samhe_monitor_id}</strong></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-govuk-grey">View</label>
            <select value={timeframe} onChange={(e) => onTimeframeChange(e.target.value)}
              className="border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:border-govuk-blue">
              {TIMEFRAMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        {detail.notes && (
          <p className="text-xs text-govuk-grey mt-3 italic border-l-2 border-gray-300 pl-3">{detail.notes}</p>
        )}
      </div>

      {redCount > 0 && (
        <div className="bg-red-50 border-l-4 border-govuk-red p-4 mb-4" role="alert">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-govuk-red shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-govuk-red">
                Warning: {redCount} pollutant{redCount !== 1 ? 's' : ''} in RED.
              </p>
              <p className="text-sm text-govuk-dark mt-1">
                Immediate action recommended — see per-pollutant guidance below.
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="bg-white border border-gray-300 mb-6 overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between">
          <h4 className="text-sm font-bold text-govuk-dark flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Pollutant readings
          </h4>
          <span className="text-xs text-govuk-grey">
            {detail.latest_reading.month} · AQI {detail.latest_reading.air_quality_index}
            {!detail.latest_reading.school_in_session && ' · school out of session'}
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-300">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-govuk-grey uppercase tracking-wide">Pollutant</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-govuk-grey uppercase tracking-wide">Reading</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-govuk-grey uppercase tracking-wide">RAG</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-govuk-grey uppercase tracking-wide">Certainty</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-govuk-grey uppercase tracking-wide">Trend</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-govuk-grey uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {detail.pollutants.map((p) => (
              <PollutantRow key={p.pollutant} p={p}
                expanded={expanded === p.pollutant}
                onToggle={() => setExpanded(expanded === p.pollutant ? null : p.pollutant)} />
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h4 className="text-base font-bold text-govuk-dark mb-3">Parent and staff reports</h4>
        <ParentReports school={detail} reports={detail.parent_reports}
          summary={detail.parent_reports_summary} onOpenCase={onOpenCase} />
      </section>
    </div>
  )
}

export default function SchoolsAirQuality({ onOpenCase }) {
  const [schools, setSchools] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [timeframe, setTimeframe] = useState('today')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getAirQualitySchools()
      .then(r => {
        if (cancelled) return
        setSchools(r.schools)
        if (r.schools.length && !selected) setSelected(r.schools[0].urn)
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setDetailLoading(true)
    getAirQualitySchool(selected, timeframe)
      .then(d => { if (!cancelled) setDetail(d) })
      .catch(console.error)
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selected, timeframe])

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <School className="w-7 h-7 text-govuk-blue" />
        <h2 className="text-2xl font-bold text-govuk-dark">Schools air quality</h2>
      </div>
      <p className="text-govuk-grey mb-6 max-w-3xl">
        Indoor air quality readings from SAMHE-compatible monitors in five schools. Compare
        sensor data with parent and staff reports for the same school — and dig in when the
        two tell a similar story.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <aside>
          <h3 className="text-sm font-bold text-govuk-dark mb-3 uppercase tracking-wide">Schools</h3>
          {loading ? (
            <div className="text-sm text-govuk-grey">Loading…</div>
          ) : (
            <div className="space-y-2">
              {schools.map(s => (
                <SchoolListItem key={s.urn} school={s}
                  selected={s.urn === selected}
                  onSelect={setSelected} />
              ))}
            </div>
          )}
        </aside>

        <div>
          {detailLoading && !detail && <div className="text-sm text-govuk-grey">Loading…</div>}
          {detail && (
            <SchoolDetail detail={detail} timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              onOpenCase={onOpenCase} />
          )}
        </div>
      </div>
    </div>
  )
}
