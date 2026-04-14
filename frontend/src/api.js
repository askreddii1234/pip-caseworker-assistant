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

export const getClaims = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return apiFetch(`/claims/${qs ? '?' + qs : ''}`)
}

export const getClaim = (id) => apiFetch(`/claims/${id}`)
export const addNote = (id, content) => apiFetch(`/claims/${id}/notes`, { method: 'POST', body: JSON.stringify({ content }) })
export const updateStatus = (id, status) => apiFetch(`/claims/${id}/status?status=${status}`, { method: 'PATCH' })
export const confirmScore = (claimId, scoreId, points) => apiFetch(`/claims/${claimId}/scores/${scoreId}/confirm?points=${points}`, { method: 'PATCH' })

export const aiSummarise = (id) => apiFetch(`/ai/claims/${id}/summarise`, { method: 'POST' })
export const aiGaps = (id) => apiFetch(`/ai/claims/${id}/gaps`, { method: 'POST' })
export const getRiskDashboard = (assignedTo) => apiFetch(`/ai/dashboard/risk${assignedTo ? '?assigned_to=' + assignedTo : ''}`)

export function aiAskStream(claimId, question, onChunk, onDone) {
  const qs = new URLSearchParams({ question }).toString()
  const evtSource = new EventSource(`${API_BASE}/ai/claims/${claimId}/ask/stream?${qs}`)
  evtSource.onmessage = (e) => {
    if (e.data === '[DONE]') { evtSource.close(); onDone?.() }
    else onChunk(e.data)
  }
  evtSource.onerror = () => { evtSource.close(); onDone?.() }
  return evtSource
}

export async function submitClaim(formData) {
  const res = await fetch(`${API_BASE}/upload/submit`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}
