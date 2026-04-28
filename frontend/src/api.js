const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'API error')
  }
  return res.json()
}

export const getRoot = () => apiFetch('/')

export const getCases = (params = {}) => {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v))
  const qs = new URLSearchParams(clean).toString()
  return apiFetch(`/cases${qs ? '?' + qs : ''}`)
}

export const getCase = (id) => apiFetch(`/cases/${id}`)
export const getApplicantStatus = (reference) =>
  apiFetch(`/cases/by-reference/${encodeURIComponent(reference)}`)
export const addNote = (id, content, author) =>
  apiFetch(`/cases/${id}/notes`, { method: 'POST', body: JSON.stringify({ content, author }) })
export const transitionStatus = (id, newStatus) =>
  apiFetch(`/cases/${id}/status?new_status=${encodeURIComponent(newStatus)}`, { method: 'PATCH' })

export const getRiskDashboard = (assignedTo) =>
  apiFetch(`/cases/dashboard/risk${assignedTo ? '?assigned_to=' + assignedTo : ''}`)

export const getPolicies = (caseType) =>
  apiFetch(`/cases/policies/${caseType ? '?case_type=' + caseType : ''}`)

export const getWorkflow = (caseType) => apiFetch(`/cases/workflow/${caseType}`)

export const aiSummarise = (id) => apiFetch(`/ai/cases/${id}/summarise`, { method: 'POST' })

export function aiAskStream(caseId, question, onChunk, onDone, onSources) {
  const qs = new URLSearchParams({ question }).toString()
  const evt = new EventSource(`${API_BASE}/ai/cases/${caseId}/ask/stream?${qs}`)
  evt.addEventListener('sources', (e) => {
    try { onSources?.(JSON.parse(e.data)) } catch { /* ignore */ }
  })
  evt.onmessage = (e) => {
    if (e.data === '[DONE]') { evt.close(); onDone?.() }
    else onChunk(e.data)
  }
  evt.onerror = () => { evt.close(); onDone?.() }
  return evt
}

export async function submitCase(formData) {
  const res = await fetch(`${API_BASE}/upload/submit`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}

export const submitAirQualityCase = (payload) =>
  apiFetch('/cases/air-quality', { method: 'POST', body: JSON.stringify(payload) })

export const getRecommendedActions = (id) =>
  apiFetch(`/cases/${id}/recommended-actions`)

export const getAirQualitySchools = () => apiFetch('/air-quality/schools')
export const getAirQualitySchool = (urn, timeframe = 'today') =>
  apiFetch(`/air-quality/schools/${encodeURIComponent(urn)}?timeframe=${encodeURIComponent(timeframe)}`)
