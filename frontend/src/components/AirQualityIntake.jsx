import { useState } from 'react'
import { Wind, CheckCircle, AlertTriangle, Paperclip, X } from 'lucide-react'
import { submitAirQualityCase } from '../api'

const SUBMITTER_ROLES = [
  'Parent', 'Student', 'Teaching Staff', 'Facilities Staff', 'Admin Staff', 'Other',
]

const ISSUE_CATEGORIES = [
  'Odor', 'Dust/Particles', 'Mold/Moisture', 'Chemical Smell',
  'Poor Ventilation', 'Temperature Issues', 'Other',
]

const SYMPTOMS = [
  'Headache', 'Dizziness', 'Nausea', 'Coughing', 'Wheezing', 'Shortness of breath',
  'Eye irritation', 'Sneezing', 'Sore throat', 'Skin irritation',
  'Drowsiness', 'Difficulty concentrating', 'Musty smell reported', 'Discomfort',
]

const OBSERVATIONS = [
  'Visible mold/mould', 'Damp/condensation on wall', 'Musty odour',
  'Water ingress', 'Visible dust', 'Recent maintenance works',
  'Strong chemical odour', 'Visible liquid spill', 'Container damaged',
  'Unapproved product', 'Damp floor',
  'High CO2 reading', 'Inadequate ventilation', 'Stuffy atmosphere', 'Equipment fault',
  'High temperature', 'Low temperature', 'Direct sunlight', 'No shading',
  'Heating starting late', 'Similar rooms warmer',
  'Intermittent odour', 'Worse on warm days',
  'Recurring issue',
]

const SEVERITIES = [
  { value: 'Low', hint: 'Minor comfort concern, no symptoms.' },
  { value: 'Medium', hint: 'Symptoms reported but not needing medical attention.' },
  { value: 'High', hint: '5+ people affected, vulnerable groups, or mold/chemical.' },
  { value: 'Critical', hint: 'Any symptom needing medical attention, spill, or evacuation.' },
]

const EMPTY = {
  submitter_name: '', submitter_role: 'Parent',
  contact_email: '', contact_phone: '',
  school_name: '', building_location_room: '',
  incident_datetime: '', issue_category: 'Mold/Moisture',
  detailed_description: '',
  symptoms: [], affected_count: '', duration: '',
  observations: [], observations_notes: '',
  severity_level: 'Medium', urgency: false,
  related_incidents: '',
  attachments: [],
}

function MultiSelect({ options, selected, onChange, name }) {
  const toggle = (opt) => {
    const next = selected.includes(opt)
      ? selected.filter(s => s !== opt)
      : [...selected, opt]
    onChange(next)
  }
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={name}>
      {options.map(opt => {
        const on = selected.includes(opt)
        return (
          <button type="button" key={opt} onClick={() => toggle(opt)}
            className={`text-xs px-3 py-1.5 border rounded-full transition-colors ${
              on
                ? 'bg-govuk-blue text-white border-govuk-blue'
                : 'bg-white border-gray-300 hover:border-govuk-blue'
            }`}>
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function FieldLabel({ children, required }) {
  return (
    <label className="block text-sm font-medium mb-1 text-govuk-dark">
      {children}{required && <span className="text-red-600 ml-0.5">*</span>}
    </label>
  )
}

function TextInput({ name, value, onChange, type = 'text', required, placeholder, hint }) {
  return (
    <>
      <input type={type} name={name} value={value} onChange={onChange} required={required}
        placeholder={placeholder}
        className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue" />
      {hint && <p className="text-xs text-govuk-grey mt-1">{hint}</p>}
    </>
  )
}

function Section({ step, title, children }) {
  return (
    <section className="bg-white border border-gray-300">
      <header className="border-b border-gray-200 bg-gray-50 px-6 py-3 flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-7 h-7 bg-govuk-blue text-white text-sm font-bold rounded-full shrink-0">
          {step}
        </span>
        <h3 className="text-base font-bold text-govuk-dark">{title}</h3>
      </header>
      <div className="p-6 space-y-4">{children}</div>
    </section>
  )
}

export default function AirQualityIntake({ onCaseCreated }) {
  const [form, setForm] = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [errors, setErrors] = useState([])

  const setField = (field, value) => setForm(f => ({ ...f, [field]: value }))
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setField(name, type === 'checkbox' ? checked : value)
  }

  function handleAttachment(e) {
    const files = Array.from(e.target.files).map(f => ({
      file_name: f.name, file_type: f.type || 'application/octet-stream',
    }))
    setField('attachments', [...form.attachments, ...files])
    e.target.value = ''
  }
  const removeAttachment = (i) =>
    setField('attachments', form.attachments.filter((_, idx) => idx !== i))

  function validate() {
    const errs = []
    if (!form.submitter_name.trim()) errs.push('Submitter name is required.')
    if (!form.contact_email.trim()) errs.push('Contact email is required.')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email))
      errs.push('Contact email is not a valid email address.')
    if (!form.school_name.trim()) errs.push('School name is required.')
    if (!form.building_location_room.trim()) errs.push('Building / room is required.')
    if (!form.incident_datetime) errs.push('Incident date and time is required.')
    if (!form.detailed_description.trim() || form.detailed_description.trim().length < 50)
      errs.push('Description must be at least 50 characters.')
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (errs.length) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        affected_count: form.affected_count === '' ? null : Number(form.affected_count),
      }
      setResult(await submitAirQualityCase(payload))
    } catch (err) {
      setErrors([err.message || 'Submission failed.'])
    }
    setSubmitting(false)
  }

  if (result) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="bg-green-50 border border-green-300 p-6 text-center">
          <CheckCircle className="w-12 h-12 text-govuk-green mx-auto mb-4" />
          <h2 className="text-xl font-bold text-govuk-dark mb-2">Report submitted</h2>
          <p className="text-sm text-govuk-grey mb-4">
            Thank you. Your air quality concern has been logged and added to the caseworker queue.
          </p>
          <div className="bg-white border border-gray-300 p-4 mb-4">
            <p className="text-xs text-govuk-grey mb-1">Your reference</p>
            <p className="text-2xl font-bold font-mono text-govuk-dark">{result.case_id}</p>
            <p className="text-xs mt-2">
              Severity: <strong>{result.severity_level}</strong>
              {result.is_urgent && <span className="ml-2 govuk-tag govuk-tag-red">URGENT</span>}
            </p>
          </div>
          {result.is_urgent && (
            <p className="text-sm text-red-800 bg-red-50 border border-red-300 p-3 mb-4">
              This case has been flagged urgent and routed to a team leader for same-day review.
            </p>
          )}
          <button onClick={() => onCaseCreated(result.case_id)}
            className="bg-govuk-blue text-white px-6 py-2 text-sm font-medium hover:bg-blue-800">
            View case
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Wind className="w-7 h-7 text-govuk-blue" />
        <h2 className="text-2xl font-bold text-govuk-dark">Report an air quality concern</h2>
      </div>
      <p className="text-govuk-grey mb-6">
        For parents, students, staff and facilities teams. Tell us about air quality issues
        in any classroom or school space. Urgent cases are picked up same day.
      </p>

      {errors.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-600 p-4 mb-6" role="alert">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-700" />
            <p className="text-sm font-bold text-red-800">
              There {errors.length === 1 ? 'is a problem' : 'are problems'} with your report
            </p>
          </div>
          <ul className="text-sm text-red-700 list-disc ml-8">
            {errors.map((er, i) => <li key={i}>{er}</li>)}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Section step={1} title="About you">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Your name</FieldLabel>
              <TextInput name="submitter_name" value={form.submitter_name} onChange={handleChange} required />
            </div>
            <div>
              <FieldLabel required>Your role</FieldLabel>
              <select name="submitter_role" value={form.submitter_role} onChange={handleChange}
                className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue">
                {SUBMITTER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel required>Contact email</FieldLabel>
              <TextInput name="contact_email" type="email" value={form.contact_email} onChange={handleChange} required />
            </div>
            <div>
              <FieldLabel>Contact phone</FieldLabel>
              <TextInput name="contact_phone" value={form.contact_phone} onChange={handleChange}
                hint="Required for Critical severity." />
            </div>
          </div>
        </Section>

        <Section step={2} title="Where is the issue?">
          <div>
            <FieldLabel required>School</FieldLabel>
            <TextInput name="school_name" value={form.school_name} onChange={handleChange} required
              placeholder="e.g. Ashbury Primary School" />
          </div>
          <div>
            <FieldLabel required>Building / room / area</FieldLabel>
            <TextInput name="building_location_room" value={form.building_location_room} onChange={handleChange} required
              placeholder="e.g. Main building, classroom 4B" />
          </div>
        </Section>

        <Section step={3} title="Incident details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>When did you notice it?</FieldLabel>
              <TextInput name="incident_datetime" type="datetime-local" value={form.incident_datetime} onChange={handleChange} required />
            </div>
            <div>
              <FieldLabel required>Issue category</FieldLabel>
              <select name="issue_category" value={form.issue_category} onChange={handleChange}
                className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue">
                {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <FieldLabel required>Describe what happened</FieldLabel>
            <textarea name="detailed_description" value={form.detailed_description} onChange={handleChange} rows={5}
              minLength={50} required placeholder="At least 50 characters. What did you notice? When? Who was affected?"
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue" />
            <p className={`text-xs mt-1 ${form.detailed_description.length >= 50 ? 'text-govuk-green' : 'text-govuk-grey'}`}>
              {form.detailed_description.length} / 50 minimum
            </p>
          </div>
        </Section>

        <Section step={4} title="Health impact">
          <div>
            <FieldLabel>Symptoms experienced</FieldLabel>
            <MultiSelect options={SYMPTOMS} selected={form.symptoms}
              onChange={(v) => setField('symptoms', v)} name="Symptoms" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel>How many people were affected?</FieldLabel>
              <TextInput name="affected_count" type="number" value={form.affected_count} onChange={handleChange}
                placeholder="0" />
            </div>
            <div>
              <FieldLabel>How long has it been going on?</FieldLabel>
              <TextInput name="duration" value={form.duration} onChange={handleChange}
                placeholder="e.g. 2 weeks, ongoing since winter term" />
            </div>
          </div>
        </Section>

        <Section step={5} title="What did you see or smell?">
          <div>
            <FieldLabel>Observations</FieldLabel>
            <MultiSelect options={OBSERVATIONS} selected={form.observations}
              onChange={(v) => setField('observations', v)} name="Observations" />
          </div>
          <div>
            <FieldLabel>Additional notes</FieldLabel>
            <textarea name="observations_notes" value={form.observations_notes} onChange={handleChange} rows={2}
              placeholder="Anything else relevant."
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue" />
          </div>
        </Section>

        <Section step={6} title="Severity">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
            {SEVERITIES.map(s => (
              <label key={s.value}
                className={`flex items-start gap-3 border-2 p-3 cursor-pointer transition-colors h-full ${
                  form.severity_level === s.value
                    ? 'border-govuk-blue bg-blue-50'
                    : 'border-gray-200 hover:border-govuk-blue bg-white'
                }`}>
                <input type="radio" name="severity_level" value={s.value}
                  checked={form.severity_level === s.value} onChange={handleChange}
                  className="mt-1 shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-sm text-govuk-dark">{s.value}</div>
                  <div className="text-xs text-govuk-grey mt-0.5">{s.hint}</div>
                </div>
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm pt-2 border-t border-gray-100">
            <input type="checkbox" name="urgency" checked={form.urgency} onChange={handleChange}
              className="w-4 h-4" />
            <span>This needs <strong>urgent</strong> attention today</span>
          </label>
        </Section>

        <Section step={7} title="Evidence">
          <p className="text-sm text-govuk-grey">
            Photos, videos, readings or documents. Filenames only are recorded for this prototype.
          </p>
          <label className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 bg-white border border-govuk-blue text-govuk-blue cursor-pointer hover:bg-blue-50 w-fit">
            <Paperclip className="w-4 h-4" /> Add files
            <input type="file" multiple onChange={handleAttachment} className="hidden" />
          </label>
          {form.attachments.length > 0 && (
            <ul className="text-sm space-y-1">
              {form.attachments.map((a, i) => (
                <li key={i} className="flex items-center justify-between bg-gray-50 px-3 py-2 border border-gray-200">
                  <span className="font-mono text-xs truncate mr-3">{a.file_name}</span>
                  <button type="button" onClick={() => removeAttachment(i)}
                    className="text-govuk-grey hover:text-red-600 shrink-0" aria-label={`Remove ${a.file_name}`}>
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section step={8} title="Related incidents">
          <p className="text-sm text-govuk-grey">
            If similar concerns have been raised before — recently or historically — note them here.
          </p>
          <textarea name="related_incidents" value={form.related_incidents} onChange={handleChange} rows={2}
            className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-govuk-blue" />
        </Section>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => setForm(EMPTY)}
            className="px-4 py-3 text-sm font-medium text-govuk-grey hover:text-govuk-dark">
            Clear form
          </button>
          <button type="submit" disabled={submitting}
            className="bg-govuk-green text-white px-6 py-3 text-sm font-bold hover:bg-green-800 disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Submit report'}
          </button>
        </div>
      </form>
    </div>
  )
}
