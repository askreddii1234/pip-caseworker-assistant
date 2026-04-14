import { useState } from 'react'
import { Upload, CheckCircle, FileText, X } from 'lucide-react'
import { submitClaim } from '../api'

export default function UploadPortal({ onClaimCreated }) {
  const [form, setForm] = useState({ claimant_name: '', claimant_email: '', date_of_birth: '', primary_condition: '', additional_conditions: '' })
  const [files, setFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  function handleFiles(e) {
    setFiles(prev => [...prev, ...Array.from(e.target.files)])
  }

  function removeFile(index) {
    setFiles(f => f.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('claimant_name', form.claimant_name)
      formData.append('claimant_email', form.claimant_email)
      formData.append('date_of_birth', form.date_of_birth)
      formData.append('primary_condition', form.primary_condition)
      formData.append('additional_conditions', form.additional_conditions)
      files.forEach(f => formData.append('files', f))

      const res = await submitClaim(formData)
      setResult(res)
    } catch (err) {
      setError(err.message)
    }
    setSubmitting(false)
  }

  if (result) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="bg-green-50 border border-green-300 p-6 text-center">
          <CheckCircle className="w-12 h-12 text-govuk-green mx-auto mb-4" />
          <h2 className="text-xl font-bold text-govuk-dark mb-2">Claim submitted</h2>
          <p className="text-sm text-govuk-grey mb-4">Your PIP claim has been received and will be reviewed by a caseworker.</p>
          <div className="bg-white border border-gray-300 p-4 mb-4">
            <p className="text-sm text-govuk-grey">Your claim reference:</p>
            <p className="text-2xl font-bold font-mono text-govuk-dark">{result.claim_id}</p>
          </div>
          <p className="text-sm text-govuk-grey mb-4">{result.files_received} document{result.files_received !== 1 ? 's' : ''} uploaded</p>
          <button onClick={() => onClaimCreated(result.claim_id)}
            className="bg-govuk-blue text-white px-6 py-2 text-sm font-medium hover:bg-blue-800">
            View claim
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-govuk-dark mb-2">Submit a PIP claim</h2>
      <p className="text-govuk-grey mb-6">Upload your PIP2 questionnaire, medical evidence, and supporting documents. A caseworker will review your claim.</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border border-gray-300 p-6 space-y-4">
          <h3 className="text-lg font-bold text-govuk-dark">Your details</h3>

          <div>
            <label className="block text-sm font-medium mb-1">Full name <span className="text-red-600">*</span></label>
            <input type="text" name="claimant_name" value={form.claimant_name} onChange={handleChange} required
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email address</label>
            <input type="email" name="claimant_email" value={form.claimant_email} onChange={handleChange}
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Date of birth</label>
            <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange}
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Primary health condition <span className="text-red-600">*</span></label>
            <input type="text" name="primary_condition" value={form.primary_condition} onChange={handleChange} required
              placeholder="e.g. Multiple sclerosis, fibromyalgia, anxiety disorder"
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Additional conditions</label>
            <input type="text" name="additional_conditions" value={form.additional_conditions} onChange={handleChange}
              placeholder="e.g. Depression, chronic pain"
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue" />
          </div>
        </div>

        <div className="bg-white border border-gray-300 p-6">
          <h3 className="text-lg font-bold text-govuk-dark mb-2">Upload documents</h3>
          <p className="text-sm text-govuk-grey mb-4">Upload your PIP2 form, GP letters, specialist reports, and any supporting evidence. Accepted formats: PDF, JPG, PNG.</p>

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

        <button type="submit" disabled={submitting || !form.claimant_name || !form.primary_condition}
          className="bg-govuk-green text-white px-6 py-3 text-sm font-bold hover:bg-green-800 disabled:opacity-50 w-full">
          {submitting ? 'Submitting...' : 'Submit PIP claim'}
        </button>
      </form>
    </div>
  )
}
