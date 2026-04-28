import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Send, Sparkles, AlertTriangle, AlertCircle, CheckCircle, Clock, BookOpen, ChevronRight, School, MapPin, Wind, Paperclip, Activity, ListChecks, ExternalLink, Library } from 'lucide-react'
import { getCase, addNote, transitionStatus, aiSummarise, aiAskStream, getRecommendedActions } from '../api'

function renderWithCitations(text) {
  if (!text) return null
  const parts = text.split(/(\[KB-\d+\])/g)
  return parts.map((p, i) => {
    const m = p.match(/^\[KB-(\d+)\]$/)
    if (m) {
      return (
        <sup key={i} className="inline-flex items-center px-1 mx-0.5 text-[10px] font-bold text-govuk-blue bg-blue-50 border border-blue-200 rounded">
          KB-{m[1]}
        </sup>
      )
    }
    return <span key={i}>{p}</span>
  })
}

function SourcesPanel({ sources }) {
  if (!sources || sources.length === 0) return null
  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="text-xs font-bold text-govuk-grey uppercase tracking-wide mb-2 flex items-center gap-1">
        <Library className="w-3 h-3" /> Sources
      </div>
      <ul className="space-y-1.5">
        {sources.map((s, i) => (
          <li key={s.chunk_id || i} className="text-xs flex items-start gap-2">
            <span className="font-mono font-bold text-govuk-blue shrink-0">[KB-{i + 1}]</span>
            <div className="flex-1">
              <div className="font-medium text-govuk-dark">
                {s.title} <span className="text-govuk-grey font-normal">— {s.heading_path}</span>
              </div>
              <div className="text-govuk-grey">
                {s.publisher}{s.year ? ` · ${s.year}` : ''}
                {s.url && (
                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                     className="ml-2 inline-flex items-center gap-0.5 text-govuk-blue hover:underline">
                    source <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

const CASE_TYPES = {
  benefit_review: 'Benefit review',
  licence_application: 'Licence application',
  compliance_check: 'Compliance check',
  air_quality_concern: 'Air quality concern',
}

const SEVERITY_CLS = {
  Low: 'bg-gray-100 text-gray-800 border-gray-300',
  Medium: 'bg-blue-50 text-blue-800 border-blue-300',
  High: 'bg-orange-50 text-orange-800 border-orange-300',
  Critical: 'bg-red-50 text-red-800 border-red-300',
}

function SeverityChip({ level }) {
  if (!level) return null
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 border ${SEVERITY_CLS[level] || SEVERITY_CLS.Medium}`}>
      {level === 'Critical' && <AlertTriangle className="w-3 h-3" />}
      Severity: {level}
    </span>
  )
}

function UrgentChip() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 border bg-red-600 text-white border-red-700">
      <AlertTriangle className="w-3 h-3" /> URGENT
    </span>
  )
}

function AirQualityPanel({ caseRecord, recommended }) {
  const p = caseRecord.submission_payload || {}
  return (
    <section className="bg-white border-l-4 border-govuk-blue border-y border-r border-gray-300 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Wind className="w-5 h-5 text-govuk-blue" />
        <h3 className="text-lg font-bold text-govuk-dark">Air quality concern</h3>
        <SeverityChip level={caseRecord.severity_level} />
        {caseRecord.is_urgent && <UrgentChip />}
      </div>

      {/* Summary row */}
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
        <div className="flex items-start gap-2">
          <School className="w-4 h-4 mt-0.5 shrink-0 text-govuk-grey" />
          <div>
            <dt className="text-xs text-govuk-grey uppercase tracking-wide">School</dt>
            <dd className="font-medium">{p.school_name || '—'}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-govuk-grey" />
          <div>
            <dt className="text-xs text-govuk-grey uppercase tracking-wide">Location</dt>
            <dd className="font-medium">{p.building_location_room || '—'}</dd>
          </div>
        </div>
        <div>
          <dt className="text-xs text-govuk-grey uppercase tracking-wide">Issue category</dt>
          <dd className="font-medium">{p.issue_category || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-govuk-grey uppercase tracking-wide">Reported</dt>
          <dd className="font-medium">{p.incident_datetime ? new Date(p.incident_datetime).toLocaleString('en-GB') : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-govuk-grey uppercase tracking-wide">Submitter</dt>
          <dd className="font-medium">{p.submitter_name} <span className="text-govuk-grey font-normal">({p.submitter_role})</span></dd>
        </div>
        <div>
          <dt className="text-xs text-govuk-grey uppercase tracking-wide">Contact</dt>
          <dd className="font-medium">
            {p.contact_email && <a className="text-govuk-blue underline" href={`mailto:${p.contact_email}`}>{p.contact_email}</a>}
            {p.contact_phone && <span className="block text-govuk-grey text-xs">{p.contact_phone}</span>}
          </dd>
        </div>
      </dl>

      {p.detailed_description && (
        <div className="mb-4">
          <div className="text-xs font-medium text-govuk-grey uppercase tracking-wide mb-1">Description</div>
          <p className="text-sm whitespace-pre-wrap">{p.detailed_description}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs font-medium text-govuk-grey uppercase tracking-wide mb-1 flex items-center gap-1">
            <Activity className="w-3 h-3" /> Symptoms
          </div>
          {p.symptoms?.length ? (
            <div className="flex flex-wrap gap-1">
              {p.symptoms.map(s => (
                <span key={s} className="text-xs bg-orange-50 border border-orange-200 text-orange-800 px-2 py-0.5">
                  {s}
                </span>
              ))}
            </div>
          ) : <p className="text-sm text-govuk-grey">No symptoms reported.</p>}
          <p className="text-xs text-govuk-grey mt-2">
            Affected: <strong>{p.affected_count ?? '—'}</strong>
            {p.duration ? <> · Duration: <strong>{p.duration}</strong></> : null}
          </p>
        </div>

        <div>
          <div className="text-xs font-medium text-govuk-grey uppercase tracking-wide mb-1">Observations</div>
          {p.observations?.length ? (
            <div className="flex flex-wrap gap-1">
              {p.observations.map(o => (
                <span key={o} className="text-xs bg-gray-50 border border-gray-300 text-govuk-dark px-2 py-0.5">
                  {o}
                </span>
              ))}
            </div>
          ) : <p className="text-sm text-govuk-grey">None recorded.</p>}
          {p.observations_notes && <p className="text-xs text-govuk-grey mt-2">{p.observations_notes}</p>}
        </div>
      </div>

      {p.attachments?.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-govuk-grey uppercase tracking-wide mb-1 flex items-center gap-1">
            <Paperclip className="w-3 h-3" /> Evidence ({p.attachments.length})
          </div>
          <ul className="text-sm space-y-1">
            {p.attachments.map((a, i) => (
              <li key={i} className="flex items-center gap-2 bg-gray-50 px-2 py-1 border border-gray-200 font-mono text-xs">
                <Paperclip className="w-3 h-3 text-govuk-grey shrink-0" />
                {a.file_name}
                {a.file_type && <span className="text-govuk-grey ml-auto">{a.file_type}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommended?.actions?.length > 0 && (
        <div>
          <div className="text-xs font-medium text-govuk-grey uppercase tracking-wide mb-1 flex items-center gap-1">
            <ListChecks className="w-3 h-3" /> Recommended next actions
          </div>
          <ul className="text-sm space-y-1">
            {recommended.actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 text-govuk-blue" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
          {recommended.rationale && (
            <p className="text-xs text-govuk-grey mt-2 italic">{recommended.rationale}</p>
          )}
        </div>
      )}
    </section>
  )
}

function RiskBanner({ risk }) {
  if (!risk) return null
  const map = {
    escalation_due: { icon: AlertTriangle, cls: 'bg-red-50 border-red-300 text-red-800', label: 'Escalation due' },
    reminder_due: { icon: AlertCircle, cls: 'bg-orange-50 border-orange-300 text-orange-800', label: 'Reminder due' },
    ok: { icon: CheckCircle, cls: 'bg-green-50 border-green-300 text-green-800', label: 'No evidence risk' },
  }
  const m = map[risk.level] || map.ok
  const Icon = m.icon
  return (
    <div className={`border p-3 mb-6 flex items-start gap-2 text-sm ${m.cls}`}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <strong>{m.label}.</strong> {risk.reason}
      </div>
    </div>
  )
}

export default function CaseDetail({ caseId, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [noteInput, setNoteInput] = useState('')
  const [ai, setAi] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  const [chat, setChat] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const chatEndRef = useRef(null)
  const [recommended, setRecommended] = useState(null)
  const [chatSources, setChatSources] = useState([])

  useEffect(() => { load() }, [caseId])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])

  async function load() {
    setLoading(true)
    try {
      const d = await getCase(caseId)
      setData(d)
      if (d?.case?.case_type === 'air_quality_concern') {
        try { setRecommended(await getRecommendedActions(caseId)) } catch { setRecommended(null) }
      } else {
        setRecommended(null)
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function handleSummarise() {
    setAiLoading(true)
    try { setAi(await aiSummarise(caseId)) } catch (e) { console.error(e) }
    setAiLoading(false)
  }

  async function handleAddNote(e) {
    e.preventDefault()
    if (!noteInput.trim()) return
    await addNote(caseId, noteInput.trim())
    setNoteInput('')
    load()
  }

  async function handleTransition(next) {
    try { await transitionStatus(caseId, next); load() }
    catch (e) { alert(e.message) }
  }

  function handleAsk(e) {
    e.preventDefault()
    if (!chatInput.trim() || streaming) return
    const q = chatInput.trim()
    setChatInput('')
    setChat(prev => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '', sources: [] }])
    setStreaming(true)
    setChatSources([])
    let response = ''
    aiAskStream(caseId, q,
      (chunk) => {
        response += chunk
        setChat(prev => {
          const next = [...prev]
          next[next.length - 1] = { ...next[next.length - 1], role: 'assistant', content: response }
          return next
        })
      },
      () => setStreaming(false),
      (sources) => {
        setChatSources(sources)
        setChat(prev => {
          const next = [...prev]
          if (next.length) next[next.length - 1] = { ...next[next.length - 1], sources }
          return next
        })
      },
    )
  }

  if (loading) return <div className="p-8 text-center text-govuk-grey">Loading case…</div>
  if (!data) return <div className="p-8 text-center text-govuk-grey">Case not found.</div>

  const { case: c, timeline, caseworker_notes, current_state, allowed_states, policies, risk } = data

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-govuk-blue text-sm mb-4 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back to queue
      </button>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-govuk-dark">{c.applicant_name}</h2>
          <p className="text-govuk-grey mt-1 font-mono text-sm">
            {c.case_id} · {CASE_TYPES[c.case_type] || c.case_type}
            {c.applicant_reference ? ` · ${c.applicant_reference}` : ''}
          </p>
          {(c.severity_level || c.is_urgent) && (
            <div className="flex gap-2 mt-2">
              <SeverityChip level={c.severity_level} />
              {c.is_urgent && <UrgentChip />}
            </div>
          )}
        </div>
        <div className="text-right text-xs text-govuk-grey">
          <div>Created {c.created_date}</div>
          <div>Last updated {c.last_updated}</div>
          <div>Assigned: {c.assigned_to || '—'}</div>
        </div>
      </div>

      <RiskBanner risk={risk} />

      {c.case_type === 'air_quality_concern' && (
        <AirQualityPanel caseRecord={c} recommended={recommended} />
      )}

      <div className="flex gap-3 mb-6">
        <button onClick={handleSummarise} disabled={aiLoading}
          className="flex items-center gap-2 bg-govuk-blue text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-50">
          <Sparkles className="w-4 h-4" /> {aiLoading ? 'Thinking…' : 'AI brief'}
        </button>
      </div>

      {ai && (
        <div className="bg-blue-50 border border-blue-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-govuk-blue flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI brief</h3>
            <span className={`text-xs px-2 py-0.5 rounded border ${ai.mocked ? 'bg-white text-gray-700 border-gray-300' : 'bg-green-100 text-green-800 border-green-300'}`}>
              {ai.mocked ? 'mocked' : 'live'}
            </span>
          </div>
          <p className="text-sm mb-3">{ai.summary}</p>
          {ai.key_points?.length > 0 && (
            <ul className="text-sm space-y-1 mb-3">
              {ai.key_points.map((k, i) => (
                <li key={i} className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5 shrink-0" />{k}</li>
              ))}
            </ul>
          )}
          {ai.next_action && (
            <p className="text-sm"><strong>Next action:</strong> {ai.next_action}</p>
          )}
          <SourcesPanel sources={ai.sources} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Case + timeline + notes */}
        <section className="bg-white border border-gray-300 p-4 lg:col-span-1">
          <h3 className="text-sm font-bold mb-3 text-govuk-dark">Case summary</h3>
          <p className="text-sm whitespace-pre-wrap mb-4">{c.case_notes || '—'}</p>

          <h3 className="text-sm font-bold mb-3 text-govuk-dark flex items-center gap-2">
            <Clock className="w-4 h-4" /> Timeline
          </h3>
          <ol className="relative border-l-2 border-govuk-blue ml-2 space-y-4 mb-4">
            {timeline.map((ev, i) => (
              <li key={i} className="ml-4">
                <span className="absolute -left-[9px] w-4 h-4 border-2 border-govuk-blue bg-white" />
                <div className="text-xs text-govuk-grey">{ev.date}</div>
                <div className="text-sm font-medium">{ev.event.replace(/_/g, ' ')}</div>
                {ev.note && <p className="text-xs text-govuk-grey mt-0.5">{ev.note}</p>}
              </li>
            ))}
          </ol>

          <h3 className="text-sm font-bold mb-2 text-govuk-dark">Caseworker notes</h3>
          {caseworker_notes.length === 0 && (
            <p className="text-xs text-govuk-grey mb-2">No notes yet.</p>
          )}
          <div className="space-y-2 mb-3">
            {caseworker_notes.map(n => (
              <div key={n.id} className="bg-gray-50 border border-gray-200 p-2 text-sm">
                <div className="text-xs text-govuk-grey">{new Date(n.created_at).toLocaleString('en-GB')} · {n.author}</div>
                <p className="whitespace-pre-wrap">{n.content}</p>
              </div>
            ))}
          </div>
          <form onSubmit={handleAddNote} className="flex gap-2">
            <input type="text" value={noteInput} onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Add a note…" className="flex-1 border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:border-govuk-blue" />
            <button type="submit" className="bg-govuk-blue text-white px-3 py-1.5 text-sm font-medium hover:bg-blue-800">Add</button>
          </form>
        </section>

        {/* Middle: Workflow position */}
        <section className="bg-white border border-gray-300 p-4 lg:col-span-1">
          <h3 className="text-sm font-bold mb-3 text-govuk-dark">Workflow position</h3>
          {current_state ? (
            <>
              <div className="mb-3">
                <div className="text-xs text-govuk-grey uppercase tracking-wide">Current state</div>
                <div className="text-base font-bold">{current_state.label}</div>
                <p className="text-sm text-govuk-grey mt-1">{current_state.description}</p>
                {(current_state.reminder_days || current_state.escalation_days) && (
                  <div className="text-xs text-govuk-grey mt-2">
                    Reminder at {current_state.reminder_days}d · Escalate at {current_state.escalation_days}d
                  </div>
                )}
              </div>

              {current_state.required_actions?.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium text-govuk-grey uppercase tracking-wide mb-1">Required actions</div>
                  <ul className="text-sm space-y-1">
                    {current_state.required_actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <input type="checkbox" className="mt-1" />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {allowed_states?.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-govuk-grey uppercase tracking-wide mb-1">Transition to</div>
                  <div className="flex flex-wrap gap-2">
                    {allowed_states.map(s => (
                      <button key={s.state} onClick={() => handleTransition(s.state)}
                        className="bg-white border border-govuk-blue text-govuk-blue text-xs px-2 py-1 hover:bg-blue-50">
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-govuk-grey">Workflow state not found.</p>
          )}
        </section>

        {/* Right: Matched policy */}
        <section className="bg-white border border-gray-300 p-4 lg:col-span-1">
          <h3 className="text-sm font-bold mb-3 text-govuk-dark flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Applicable policy
          </h3>
          {policies.length === 0 && <p className="text-sm text-govuk-grey">No policies matched.</p>}
          <div className="space-y-3">
            {policies.map(p => (
              <details key={p.policy_id} className="border border-gray-200">
                <summary className="cursor-pointer px-3 py-2 bg-gray-50 text-sm">
                  <span className="font-mono text-xs text-govuk-grey mr-2">{p.policy_id}</span>
                  <span className="font-medium">{p.title}</span>
                </summary>
                <p className="px-3 py-2 text-sm whitespace-pre-wrap">{p.body}</p>
              </details>
            ))}
          </div>
        </section>
      </div>

      {/* AI chat */}
      <section className="bg-white border border-gray-300 mt-6">
        <div className="border-b border-gray-200 px-4 py-2 text-sm font-bold text-govuk-dark flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Ask about this case
        </div>
        <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
          {chat.length === 0 && (
            <div className="text-sm text-govuk-grey">
              Example: <em>“What is the next action?”</em>, <em>“Which policy applies to missing evidence?”</em>
            </div>
          )}
          {chat.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-3 py-2 text-sm rounded-lg whitespace-pre-wrap ${
                msg.role === 'user' ? 'bg-govuk-blue text-white' : 'bg-gray-100 text-govuk-dark'
              }`}>
                {msg.role === 'assistant'
                  ? (msg.content
                      ? <>{renderWithCitations(msg.content)}<SourcesPanel sources={msg.sources} /></>
                      : <span className="text-govuk-grey italic">Thinking…</span>)
                  : msg.content}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleAsk} className="border-t border-gray-200 p-3 flex gap-2">
          <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask a question about this case…" disabled={streaming}
            className="flex-1 border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue disabled:opacity-50" />
          <button type="submit" disabled={streaming || !chatInput.trim()}
            className="bg-govuk-blue text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-50">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </section>
    </div>
  )
}
