import { useState } from 'react'
import { Shield, FileText, LayoutDashboard, Upload } from 'lucide-react'
import ClaimQueue from './components/ClaimQueue'
import ClaimDetail from './components/ClaimDetail'
import RiskDashboard from './components/RiskDashboard'
import UploadPortal from './components/UploadPortal'

const USERS = [
  { username: 'j.patel', full_name: 'Jaya Patel', role: 'caseworker' },
  { username: 'r.singh', full_name: 'Raj Singh', role: 'caseworker' },
  { username: 'm.khan', full_name: 'Mariam Khan', role: 'team_leader' },
]

export default function App() {
  const [currentUser, setCurrentUser] = useState(USERS[0])
  const [view, setView] = useState('queue')
  const [selectedClaimId, setSelectedClaimId] = useState(null)

  const openClaim = (id) => { setSelectedClaimId(id); setView('detail') }
  const goBack = () => { setView('queue'); setSelectedClaimId(null) }

  return (
    <div className="min-h-screen bg-govuk-light">
      <header className="bg-govuk-dark text-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-govuk-yellow" />
            <div>
              <h1 className="text-lg font-bold tracking-tight">PIP Caseworker Assistant</h1>
              <p className="text-xs text-gray-400">AI-powered assessment support prototype</p>
            </div>
          </div>
          <select
            value={currentUser.username}
            onChange={(e) => setCurrentUser(USERS.find(u => u.username === e.target.value))}
            className="bg-gray-800 text-white text-sm px-3 py-1.5 rounded border border-gray-600"
          >
            {USERS.map(u => (
              <option key={u.username} value={u.username}>
                {u.full_name} ({u.role === 'team_leader' ? 'Team Leader' : 'Caseworker'})
              </option>
            ))}
          </select>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-300">
        <div className="max-w-7xl mx-auto px-4 flex gap-1">
          {[
            { id: 'upload', label: 'Submit claim', icon: Upload },
            { id: 'queue', label: 'Claims queue', icon: FileText },
            { id: 'dashboard', label: 'Risk dashboard', icon: LayoutDashboard },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setView(tab.id); setSelectedClaimId(null) }}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                view === tab.id ? 'border-govuk-blue text-govuk-blue' : 'border-transparent text-govuk-grey hover:text-govuk-dark'
              }`}>
              <tab.icon className="w-4 h-4" />{tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 mt-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="govuk-tag govuk-tag-blue">PROTOTYPE</span>
          <span className="text-govuk-grey">Hackathon prototype — not a real DWP service. Built for AI Engineering Lab, April 2026.</span>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {view === 'upload' && <UploadPortal onClaimCreated={(id) => { openClaim(id) }} />}
        {view === 'queue' && <ClaimQueue currentUser={currentUser} onOpenClaim={openClaim} />}
        {view === 'detail' && selectedClaimId && <ClaimDetail claimId={selectedClaimId} onBack={goBack} />}
        {view === 'dashboard' && <RiskDashboard currentUser={currentUser} onOpenClaim={openClaim} />}
      </main>

      <footer className="border-t border-gray-300 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-sm text-govuk-grey">
          Built with FastAPI + React + Claude API | PIP clearance times: 20 weeks (Jan 2026) — this tool targets the 15-week assessment bottleneck
        </div>
      </footer>
    </div>
  )
}
