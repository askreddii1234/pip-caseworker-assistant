import { useEffect, useState } from 'react'
import { FileText, LayoutDashboard, Upload, Search, Wind, School } from 'lucide-react'
import CaseQueue from './components/CaseQueue'
import CaseDetail from './components/CaseDetail'
import RiskDashboard from './components/RiskDashboard'
import UploadPortal from './components/UploadPortal'
import ApplicantPortal from './components/ApplicantPortal'
import AirQualityIntake from './components/AirQualityIntake'
import SchoolsAirQuality from './components/SchoolsAirQuality'
import { getRoot } from './api'

const USERS = [
  { username: 'j.patel', full_name: 'Jaya Patel', role: 'caseworker' },
  { username: 'r.singh', full_name: 'Raj Singh', role: 'caseworker' },
  { username: 'm.khan', full_name: 'Mariam Khan', role: 'team_leader' },
]

function GovUkCrown({ className = 'w-9 h-7' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 132 97" fill="currentColor"
      aria-hidden="true" focusable="false" className={className}>
      <path d="M25 30.2c3.5 1.5 7.7-.2 9.1-3.7 1.5-3.6-.2-7.8-3.9-9.2-3.6-1.4-7.6.3-9.1 3.9-1.4 3.5.3 7.5 3.9 9m9.5 9.9c3.5 1.5 7.7-.2 9.1-3.7 1.5-3.6-.2-7.8-3.8-9.3-3.6-1.4-7.7.3-9.1 3.9-1.5 3.6.2 7.6 3.8 9.1m44.4 0c3.6 1.5 7.7-.2 9.1-3.7 1.5-3.6-.2-7.8-3.8-9.3-3.6-1.4-7.7.3-9.1 3.9-1.5 3.6.2 7.6 3.8 9.1m8.7 21.9c3.6 1.5 7.7-.2 9.1-3.7 1.5-3.6-.2-7.8-3.8-9.3-3.6-1.4-7.7.3-9.1 3.9-1.5 3.5.2 7.5 3.8 9.1m-53.6.1c3.5 1.5 7.7-.2 9.1-3.7 1.5-3.6-.2-7.8-3.9-9.3-3.6-1.4-7.7.3-9.1 3.9-1.5 3.6.2 7.6 3.9 9.1m6.9 21.9c3.5 1.5 7.7-.2 9.1-3.7 1.5-3.6-.2-7.8-3.9-9.3-3.6-1.4-7.6.3-9.1 3.9-1.4 3.6.3 7.6 3.9 9.1m39.1 0c3.5 1.5 7.7-.2 9.1-3.7 1.5-3.6-.2-7.8-3.9-9.3-3.6-1.4-7.6.3-9.1 3.9-1.4 3.6.3 7.6 3.9 9.1M66 0h2.7l3.1 10.8H70l1.7 6.5c.9-.4 1.7-1.1 1.7-2V2.6h-.1V0h6.7v2.6h-.1v12.7c0 .9.8 1.6 1.7 2l1.7-6.5h-1.8L84.6 0h2.7l3.1 10.8H92c3.1 0 5.6 2.5 5.6 5.6v46.2c0 3.5-2.8 6.3-6.3 6.3h-7.5L79 82h-1l-4.8-13.1h-7.5c-3.5 0-6.3-2.8-6.3-6.3V16.4c0-3.1 2.5-5.6 5.6-5.6h1.7L69.8 0h-2.7l-.2 2.6h-.7L66 0z" />
    </svg>
  )
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(USERS[0])
  const [view, setView] = useState('queue')
  const [selectedCaseId, setSelectedCaseId] = useState(null)
  const [aiMode, setAiMode] = useState('unknown')

  useEffect(() => {
    getRoot().then(r => setAiMode(r.ai_mode || 'unknown')).catch(() => {})
  }, [])

  const openCase = (id) => { setSelectedCaseId(id); setView('detail') }
  const goBack = () => { setView('queue'); setSelectedCaseId(null) }

  return (
    <div className="min-h-screen bg-govuk-light">
      {/* GOV.UK-style header: black bar with crown + wordmark, then service name row, then blue stripe */}
      <header className="bg-govuk-dark text-white border-b-[10px] border-govuk-blue">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center">
          <a href="#" onClick={(e) => { e.preventDefault(); setView('queue'); setSelectedCaseId(null) }}
            className="flex items-center gap-2 text-white no-underline hover:underline">
            <GovUkCrown className="w-9 h-7" />
            <span className="text-2xl font-bold tracking-tight leading-none">GOV.UK</span>
          </a>
        </div>
        <div className="border-t border-gray-700">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <a href="#" onClick={(e) => { e.preventDefault(); setView('queue'); setSelectedCaseId(null) }}
              className="text-lg font-bold tracking-tight text-white no-underline hover:underline">
              School Air Quality Tracker
            </a>
            <select
              value={currentUser.username}
              onChange={(e) => setCurrentUser(USERS.find(u => u.username === e.target.value))}
              aria-label="Signed-in user"
              className="bg-govuk-dark text-white text-sm px-3 py-1.5 border border-gray-500 hover:border-white focus:outline-none focus:ring-2 focus:ring-govuk-yellow"
            >
              {USERS.map(u => (
                <option key={u.username} value={u.username} className="bg-white text-govuk-dark">
                  {u.full_name} ({u.role === 'team_leader' ? 'Team Leader' : 'Caseworker'})
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* GOV.UK-style phase banner */}
      <div className="bg-white border-b border-gray-300">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3 text-sm flex-wrap">
          <strong className="inline-block govuk-tag govuk-tag-blue shrink-0">PROTOTYPE</strong>
          <span className="text-govuk-dark">
            This is a new service — synthetic data only.{' '}
            <a href="#" className="text-govuk-blue underline">Your feedback</a> will help us improve it.
          </span>
          <span className={`ml-auto text-xs font-medium px-2 py-1 border ${
            aiMode === 'live'
              ? 'bg-green-50 border-govuk-green text-govuk-green'
              : 'bg-gray-50 border-gray-300 text-govuk-grey'
          }`}>
            AI: {aiMode === 'live' ? 'live (Claude)' : aiMode === 'mocked' ? 'mocked' : '…'}
          </span>
        </div>
      </div>

      <nav className="bg-white border-b border-gray-300" aria-label="Service navigation">
        <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {[
            { id: 'upload', label: 'Submit case', icon: Upload },
            { id: 'air_quality', label: 'Report air quality', icon: Wind },
            { id: 'schools_aq', label: 'Schools air quality', icon: School },
            { id: 'applicant', label: 'Check my case', icon: Search },
            { id: 'queue', label: 'Cases queue', icon: FileText },
            { id: 'dashboard', label: 'Risk dashboard', icon: LayoutDashboard },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setView(tab.id); setSelectedCaseId(null) }}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-4 transition-colors whitespace-nowrap ${
                view === tab.id
                  ? 'border-govuk-blue text-govuk-blue'
                  : 'border-transparent text-govuk-grey hover:text-govuk-dark hover:border-gray-300'
              }`}>
              <tab.icon className="w-4 h-4" />{tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {view === 'upload' && <UploadPortal onCaseCreated={(id) => openCase(id)} />}
        {view === 'air_quality' && <AirQualityIntake onCaseCreated={(id) => openCase(id)} />}
        {view === 'schools_aq' && <SchoolsAirQuality onOpenCase={openCase} />}
        {view === 'applicant' && <ApplicantPortal />}
        {view === 'queue' && <CaseQueue currentUser={currentUser} onOpenCase={openCase} />}
        {view === 'detail' && selectedCaseId && <CaseDetail caseId={selectedCaseId} onBack={goBack} />}
        {view === 'dashboard' && <RiskDashboard currentUser={currentUser} onOpenCase={openCase} />}
      </main>

      <footer className="border-t-[1px] border-govuk-blue mt-12 bg-govuk-light">
        <div className="border-t-2 border-govuk-blue">
          <div className="max-w-7xl mx-auto px-4 py-6 flex items-start gap-4 flex-wrap">
            <GovUkCrown className="w-10 h-8 text-govuk-dark" />
            <div className="text-sm text-govuk-grey flex-1 min-w-0">
              <p className="mb-1">
                Built for the Version 1 AI Engineering Lab Hackathon (Challenge 3).
                Surfaces case, policy, workflow, risk and school sensor data in one place.
              </p>
              <p className="text-xs">
                Prototype — synthetic data only. Not a live government service.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
