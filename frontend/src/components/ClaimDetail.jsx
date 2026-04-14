import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Send, Sparkles, AlertTriangle, CheckCircle, XCircle, Clock, FileText } from 'lucide-react'
import { getClaim, addNote, aiSummarise, aiGaps, aiAskStream } from '../api'

export default function ClaimDetail({ claimId, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [aiSummary, setAiSummary] = useState(null)
  const [aiGapData, setAiGapData] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const chatEndRef = useRef(null)

  useEffect(() => { loadClaim() }, [claimId])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  async function loadClaim() {
    setLoading(true)
    try { setData(await getClaim(claimId)) } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function handleSummarise() {
    setAiLoading(true)
    try { setAiSummary(await aiSummarise(claimId)) } catch (e) { console.error(e) }
    setAiLoading(false)
  }

  async function handleGaps() {
    setAiLoading(true)
    try { setAiGapData(await aiGaps(claimId)) } catch (e) { console.error(e) }
    setAiLoading(false)
  }

  function handleAsk(e) {
    e.preventDefault()
    if (!chatInput.trim() || streaming) return
    const question = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: question }])
    setStreaming(true)
    let response = ''
    setChatMessages(prev => [...prev, { role: 'assistant', content: '' }])

    aiAskStream(claimId, question,
      (chunk) => {
        response += chunk
        setChatMessages(prev => {
          const msgs = [...prev]
          msgs[msgs.length - 1] = { role: 'assistant', content: response }
          return msgs
        })
      },
      () => setStreaming(false)
    )
  }

  async function handleAddNote(e) {
    e.preventDefault()
    if (!noteInput.trim()) return
    try {
      await addNote(claimId, noteInput.trim())
      setNoteInput('')
      loadClaim()
    } catch (e) { console.error(e) }
  }

  if (loading) return <div className="p-8 text-center text-govuk-grey">Loading claim...</div>
  if (!data) return <div className="p-8 text-center text-govuk-grey">Claim not found</div>

  const { claim, notes, evidence, activity_scores } = data
  const daysOpen = Math.floor((new Date() - new Date(claim.created_at)) / (1000 * 60 * 60 * 24))
  const daysToSLA = 75 - daysOpen

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-govuk-blue text-sm mb-4 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back to queue
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-govuk-dark">{claim.claimant_name}</h2>
          <p className="text-govuk-grey mt-1 font-mono text-sm">{claim.id} · {claim.claim_type.replace('_', ' ')} · {claim.primary_condition}</p>
        </div>
        <div className="text-right">
          <div className={`text-sm font-bold ${daysToSLA <= 0 ? 'text-red-700' : daysToSLA <= 14 ? 'text-orange-600' : 'text-govuk-green'}`}>
            {daysToSLA <= 0 ? `${Math.abs(daysToSLA)} days overdue` : `${daysToSLA} days to SLA`}
          </div>
          <div className="text-xs text-govuk-grey">{daysOpen} days open · 75-day target</div>
        </div>
      </div>

      {/* AI action buttons */}
      <div className="flex gap-3 mb-6">
        <button onClick={handleSummarise} disabled={aiLoading}
          className="flex items-center gap-2 bg-govuk-blue text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-50">
          <Sparkles className="w-4 h-4" /> {aiLoading ? 'Analysing...' : 'AI summarise'}
        </button>
        <button onClick={handleGaps} disabled={aiLoading}
          className="flex items-center gap-2 bg-white border border-govuk-blue text-govuk-blue px-4 py-2 text-sm font-medium hover:bg-blue-50 disabled:opacity-50">
          <AlertTriangle className="w-4 h-4" /> Detect gaps
        </button>
      </div>

      {/* AI Summary card */}
      {aiSummary && (
        <div className="bg-blue-50 border border-blue-200 p-4 mb-6">
          <h3 className="text-sm font-bold text-govuk-blue mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI summary</h3>
          <p className="text-sm mb-3">{aiSummary.summary}</p>
          <div className="flex gap-4 text-sm">
            <span>Daily living: <strong>{aiSummary.daily_living_score}</strong> pts</span>
            <span>Mobility: <strong>{aiSummary.mobility_score}</strong> pts</span>
            <span>Risk: <span className={`font-bold ${aiSummary.risk_level === 'high' ? 'text-red-700' : aiSummary.risk_level === 'medium' ? 'text-orange-600' : 'text-green-700'}`}>{aiSummary.risk_level}</span></span>
          </div>
          <p className="text-xs text-govuk-grey mt-2">{aiSummary.risk_reasoning}</p>
        </div>
      )}

      {/* AI Gaps card */}
      {aiGapData && (
        <div className="bg-orange-50 border border-orange-200 p-4 mb-6">
          <h3 className="text-sm font-bold text-orange-700 mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Evidence gaps</h3>
          {aiGapData.missing.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-medium text-orange-700 mb-1">Missing:</p>
              <ul className="text-sm space-y-1">{aiGapData.missing.map((m, i) => <li key={i} className="flex items-start gap-2"><XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />{m}</li>)}</ul>
            </div>
          )}
          {aiGapData.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-medium text-orange-700 mb-1">Recommendations:</p>
              <ul className="text-sm space-y-1">{aiGapData.recommendations.map((r, i) => <li key={i} className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />{r}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-300">
        {['overview', 'evidence', 'notes', 'ai_chat'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab ? 'border-govuk-blue text-govuk-blue' : 'border-transparent text-govuk-grey hover:text-govuk-dark'
            }`}>
            {tab === 'ai_chat' ? 'AI chat' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-300 p-4">
            <h3 className="text-sm font-bold mb-3 text-govuk-dark">Claimant details</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-govuk-grey">Date of birth</dt><dd>{claim.date_of_birth || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-govuk-grey">Primary condition</dt><dd>{claim.primary_condition}</dd></div>
              <div className="flex justify-between"><dt className="text-govuk-grey">Additional conditions</dt><dd>{claim.additional_conditions || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-govuk-grey">Medication</dt><dd>{claim.medication || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-govuk-grey">Status</dt><dd><span className="govuk-tag govuk-tag-blue">{claim.status.replace('_', ' ')}</span></dd></div>
              <div className="flex justify-between"><dt className="text-govuk-grey">Assigned to</dt><dd>{claim.assigned_to || 'Unassigned'}</dd></div>
            </dl>
          </div>

          <div className="bg-white border border-gray-300 p-4">
            <h3 className="text-sm font-bold mb-3 text-govuk-dark">Scoring summary</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1"><span>Daily living</span><span className="font-bold">{claim.daily_living_score ?? '—'} / 36</span></div>
                <div className="w-full bg-gray-200 h-2"><div className="bg-govuk-blue h-2" style={{ width: `${((claim.daily_living_score || 0) / 36) * 100}%` }} /></div>
                <div className="flex justify-between text-xs text-govuk-grey mt-1"><span>Standard: 8+</span><span>Enhanced: 12+</span></div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1"><span>Mobility</span><span className="font-bold">{claim.mobility_score ?? '—'} / 24</span></div>
                <div className="w-full bg-gray-200 h-2"><div className="bg-govuk-green h-2" style={{ width: `${((claim.mobility_score || 0) / 24) * 100}%` }} /></div>
                <div className="flex justify-between text-xs text-govuk-grey mt-1"><span>Standard: 8+</span><span>Enhanced: 12+</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'evidence' && (
        <div className="bg-white border border-gray-300">
          <table className="w-full">
            <thead><tr className="border-b border-gray-300 bg-gray-50">
              <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Document</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Description</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-govuk-grey">Received</th>
            </tr></thead>
            <tbody>
              {evidence.map(ev => (
                <tr key={ev.id} className="border-b border-gray-200">
                  <td className="px-4 py-3 text-sm font-medium">{ev.document_type}</td>
                  <td className="px-4 py-3 text-sm text-govuk-grey">{ev.description || '—'}</td>
                  <td className="px-4 py-3">
                    {ev.received
                      ? <span className="flex items-center gap-1 text-sm text-green-700"><CheckCircle className="w-4 h-4" /> Received</span>
                      : <span className="flex items-center gap-1 text-sm text-red-700"><XCircle className="w-4 h-4" /> Missing</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-sm text-govuk-grey">{ev.received_at ? new Date(ev.received_at).toLocaleDateString('en-GB') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'notes' && (
        <div>
          <div className="space-y-3 mb-4">
            {notes.map(note => (
              <div key={note.id} className="bg-white border border-gray-300 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium">{note.author}</span>
                  <span className="text-xs text-govuk-grey">{new Date(note.created_at).toLocaleString('en-GB')}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
          </div>
          <form onSubmit={handleAddNote} className="flex gap-2">
            <input type="text" value={noteInput} onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Add a case note..." className="flex-1 border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue" />
            <button type="submit" className="bg-govuk-blue text-white px-4 py-2 text-sm font-medium hover:bg-blue-800">Add note</button>
          </form>
        </div>
      )}

      {activeTab === 'ai_chat' && (
        <div className="bg-white border border-gray-300 flex flex-col" style={{ height: '500px' }}>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-center text-govuk-grey text-sm py-8">
                <Sparkles className="w-8 h-8 mx-auto mb-2 text-govuk-blue" />
                <p>Ask anything about this claim.</p>
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  {['What evidence supports the mobility score?', 'Which PIP activity should score highest?', 'Is this claim likely to be approved?'].map(q => (
                    <button key={q} onClick={() => { setChatInput(q) }}
                      className="text-xs bg-blue-50 text-govuk-blue px-3 py-1.5 border border-blue-200 hover:bg-blue-100 rounded">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-3 py-2 text-sm ${
                  msg.role === 'user' ? 'bg-govuk-blue text-white rounded-lg' : 'bg-gray-100 text-govuk-dark rounded-lg'
                }`}>
                  {msg.content || <span className="text-govuk-grey italic">Thinking...</span>}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleAsk} className="border-t border-gray-300 p-3 flex gap-2">
            <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about this claim..." disabled={streaming}
              className="flex-1 border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue disabled:opacity-50" />
            <button type="submit" disabled={streaming || !chatInput.trim()}
              className="bg-govuk-blue text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-50">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
