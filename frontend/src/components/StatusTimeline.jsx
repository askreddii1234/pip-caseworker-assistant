import { Clock, CheckCircle } from 'lucide-react'

const STATUS_KEYWORDS = ['submitted', 'assigned', 'in_review', 'evidence_requested', 'awaiting_assessment', 'decision_made', 'approved', 'rejected', 'closed']

function extractStatusChange(content) {
  const lower = content.toLowerCase()
  for (const status of STATUS_KEYWORDS) {
    if (lower.includes(status) || lower.includes(status.replace('_', ' '))) {
      return status
    }
  }
  return null
}

export default function StatusTimeline({ claim, notes }) {
  const events = (notes || [])
    .map(n => ({ ...n, status: extractStatusChange(n.content) }))
    .filter(n => n.status)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  const timeline = [
    {
      id: 'created',
      status: 'submitted',
      author: 'System',
      content: 'Claim submitted',
      created_at: claim.created_at,
    },
    ...events,
    {
      id: 'current',
      status: claim.status,
      author: claim.assigned_to || 'Unassigned',
      content: `Current status: ${claim.status.replace('_', ' ')}`,
      created_at: new Date().toISOString(),
      current: true,
    },
  ]

  return (
    <div className="bg-white border border-gray-300 p-4">
      <h3 className="text-sm font-bold mb-4 text-govuk-dark flex items-center gap-2">
        <Clock className="w-4 h-4" /> Status timeline
      </h3>
      <ol className="relative border-l-2 border-govuk-blue ml-2 space-y-5">
        {timeline.map((ev, i) => (
          <li key={ev.id || i} className="ml-4">
            <span className={`absolute -left-[9px] w-4 h-4 border-2 border-govuk-blue ${ev.current ? 'bg-govuk-blue' : 'bg-white'}`} />
            <div className="flex items-center gap-2 mb-1">
              <span className="govuk-tag govuk-tag-blue">{ev.status.replace('_', ' ')}</span>
              <span className="text-xs text-govuk-grey">
                {new Date(ev.created_at).toLocaleString('en-GB')}
              </span>
            </div>
            <p className="text-sm text-govuk-dark">{ev.content}</p>
            <p className="text-xs text-govuk-grey mt-0.5">{ev.author}</p>
            {ev.current && (
              <p className="text-xs text-govuk-green mt-1 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Latest
              </p>
            )}
          </li>
        ))}
      </ol>
      {timeline.length === 2 && (
        <p className="text-xs text-govuk-grey mt-3 italic">
          No status changes recorded in notes yet.
        </p>
      )}
    </div>
  )
}
