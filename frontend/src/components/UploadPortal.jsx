import { useState } from 'react'
import { Upload, CheckCircle, FileText, X } from 'lucide-react'
import { submitCase } from '../api'

const CASE_TYPES = [
  { value: 'benefit_review', label: 'Benefit review' },
  { value: 'licence_application', label: 'Licence application' },
  { value: 'compliance_check', label: 'Compliance check' },
]

export default function UploadPortal({ onCaseCreated }) {
  const [form, setForm] = useState({
    applicant_name: '', applicant_reference: '', case_type: 'benefit_review',
    applicant_dob: '', summary: '',
  })
  const [files, setFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  const handleFiles = (e) => setFiles(prev => [...prev, ...Array.from(e.target.files)])
  const removeFile = (i) => setFiles(f => f.filter((_, idx) => idx !== i))

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true); setError(null)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v))
      files.forEach(f => fd.append('files', f))
      setResult(await submitCase(fd))
    } catch (err) { setError(err.message) }
    setSubmitting(false)
  }

  if (result) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="bg-green-50 border border-green-300 p-6 text-center">
          <CheckCircle className="w-12 h-12 text-govuk-green mx-auto mb-4" />
          <h2 className="text-xl font-bold text-govuk-dark mb-2">Case submitted</h2>
          <p className="text-sm text-govuk-grey mb-4">Your case has been opened. A caseworker will review it.</p>
          <div className="bg-white border border-gray-300 p-4 mb-4">
            <p className="text-sm text-govuk-grey">Your case reference:</p>
            <p className="text-2xl font-bold font-mono text-govuk-dark">{result.case_id}</p>
          </div>
          <p className="text-sm text-govuk-grey mb-4">
            {result.files_received} document{result.files_received !== 1 ? 's' : ''} uploaded
          </p>
          <button onClick={() => onCaseCreated(result.case_id)}
            className="bg-govuk-blue text-white px-6 py-2 text-sm font-medium hover:bg-blue-800">
            View case
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-govuk-dark mb-2">Submit a case</h2>
      <p className="text-govuk-grey mb-6">Upload supporting documents. A caseworker will pick this up from the queue.</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border border-gray-300 p-6 space-y-4">
          <h3 className="text-lg font-bold text-govuk-dark">Applicant details</h3>

          <div>
            <label className="block text-sm font-medium mb-1">Case type <span className="text-red-600">*</span></label>
            <select name="case_type" value={form.case_type} onChange={handleChange} required
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue">
              {CASE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Name / organisation <span className="text-red-600">*</span></label>
            <input type="text" name="applicant_name" value={form.applicant_name} onChange={handleChange} required
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Reference (if known)</label>
            <input type="text" name="applicant_reference" value={form.applicant_reference} onChange={handleChange}
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Date of birth (individuals only)</label>
            <input type="date" name="applicant_dob" value={form.applicant_dob} onChange={handleChange}
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Summary / reason</label>
            <textarea name="summary" value={form.summary} onChange={handleChange} rows={3}
              placeholder="Brief description of what the case is about."
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue" />
          </div>
        </div>

        <div className="bg-white border border-gray-300 p-6">
          <h3 className="text-lg font-bold text-govuk-dark mb-2">Upload documents</h3>
          <p className="text-sm text-govuk-grey mb-4">Accepted formats: PDF, JPG, PNG.</p>

          <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 p-8 cursor-pointer hover:border-govuk-blue hover:bg-blue-50 transition-colors">
            <Upload className="w-8 h-8 text-govuk-grey mb-2" />
            <span className="text-sm font-medium text-govuk-blue">Choose files to upload</span>
            <span className="text-xs text-govuk-grey mt-1">or drag and drop</span>
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={handleFiles} className="hidden" />
          </label>

          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 px-3 py-2 border border-gray-200">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-govuk-grey" />
                    <span className="text-sm">{file.name}</span>
                    <span className="text-xs text-govuk-grey">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <button type="button" onClick={() => removeFile(i)} className="text-govuk-grey hover:text-red-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-300 p-3 text-sm text-red-700">{error}</div>}

        <button type="submit" disabled={submitting || !form.applicant_name}
          className="bg-govuk-green text-white px-6 py-3 text-sm font-bold hover:bg-green-800 disabled:opacity-50 w-full">
          {submitting ? 'Submitting…' : 'Submit case'}
        </button>
      </form>
    </div>
  )
}
