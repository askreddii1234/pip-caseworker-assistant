const data = [
  {
    id: 'school-1',
    name: 'Riverbank Primary School',
    pollutants: [
      {name: 'PM2.5', pct: 42, certainty: 'Medium', actions: 'Increase ventilation; retest during peak times.', sources: ['Local sensor A (indoor)','Nearby roadside monitor B','Regional model estimate']},
      {name: 'PM10', pct: 55, certainty: 'Medium', actions: 'Inspect nearby construction; keep windows closed during rush hour.', sources: ['Sensor C','Construction dust log']},
      {name: 'NO2', pct: 81, certainty: 'High', actions: 'Restrict outdoor activities; consult local air quality team.', sources: ['Roadside monitor D','Vehicle count telemetry']},
      {name: 'O3', pct: 33, certainty: 'Low', actions: 'Monitor trends; no immediate action.', sources: ['Regional ozone forecast']}
    ]
    ,
    parentReports: [
      {date: '2026-04-10', issue: 'Cough reported after attending school', reviewed: false, type: 'Dust/Particles'},
      {date: '2026-03-15', issue: 'Headaches reported after PE session', reviewed: true, type: 'Other'}
    ]
  },
  {
    id: 'school-2',
    name: 'Hillside Academy',
    pollutants: [
      {name: 'PM2.5', pct: 12, certainty: 'High', actions: 'Normal ventilation; routine monitoring.', sources: ['Indoor monitor X','School maintenance logs']},
      {name: 'PM10', pct: 28, certainty: 'Low', actions: 'No action; consider seasonal checks.', sources: ['Seasonal dataset']},
      {name: 'NO2', pct: 45, certainty: 'Medium', actions: 'Review traffic patterns; reduce idling near entrance.', sources: ['Nearby road sensor','Traffic sensor']},
      {name: 'O3', pct: 67, certainty: 'Medium', actions: 'Advise caution for sensitive groups outdoors midday.', sources: ['Regional forecast','Mobile sensor sample']}
    ]
    ,
    parentReports: [
      {date: '2026-02-02', issue: 'Shortness of breath observed in playground', reviewed: false, type: 'Poor Ventilation'}
    ]
  },
  {
    id: 'school-3',
    name: 'Central High School',
    pollutants: [
      {name: 'PM2.5', pct: 76, certainty: 'High', actions: 'Close windows; use HEPA filtration where available.', sources: ['Indoor HEPA readings','Ambient monitor Z']},
      {name: 'PM10', pct: 82, certainty: 'High', actions: 'Limit outdoor sports; notify facilities.', sources: ['Ambient monitor Z','Construction reports']},
      {name: 'NO2', pct: 59, certainty: 'Medium', actions: 'Monitor nearby traffic emissions; schedule recheck.', sources: ['Roadside monitor D','Traffic camera counts']},
      {name: 'O3', pct: 88, certainty: 'High', actions: 'Advise against outdoor activity; inform parents.', sources: ['Regional ozone alert','Weather station']}
    ]
    ,
    parentReports: []
  }
];

// Timeframe multipliers simulate historical change for the mock
const timeframeMultipliers = {
  today: 1,
  '3m': 0.98,
  '6m': 0.95,
  '1y': 0.90,
  '5y': 0.85
};
let currentTimeframe = 'today';

const timeframeSelect = document.getElementById('timeframeSelect');
if(timeframeSelect){
  timeframeSelect.value = currentTimeframe;
  timeframeSelect.addEventListener('change', (e)=>{
    currentTimeframe = e.target.value;
    // re-render selected school if any
    const sel = document.querySelector('.schools li.selected');
    if(sel){
      const s = data.find(d=>d.id === sel.id);
      if(s) renderDetails(s);
    }
  });
}

const schoolsList = document.getElementById('schoolsList');
const content = document.getElementById('content');
const warning = document.getElementById('warning');

function ragFor(pct){
  if(pct >= 75) return 'red';
  if(pct >= 50) return 'amber';
  return 'green';
}

function renderSchools(){
  schoolsList.innerHTML = '';
  data.forEach(s => {
    const li = document.createElement('li');
    li.textContent = s.name;
    li.id = s.id;
    li.onclick = ()=>{
      document.querySelectorAll('.schools li').forEach(n=>n.classList.remove('selected'));
      li.classList.add('selected');
      renderDetails(s);
    };
    schoolsList.appendChild(li);
  });
}

function renderDetails(school){
  const mult = timeframeMultipliers[currentTimeframe] || 1;
  // Show timeframe control only when viewing an individual school
  const timeframeControl = document.querySelector('.timeframe-control');
  if(timeframeControl) timeframeControl.classList.remove('hidden');
  const reds = school.pollutants.filter(p=>ragFor(Math.round(p.pct * mult)) === 'red');
  if(reds.length){
    warning.classList.remove('hidden');
    warning.innerHTML = `
      <strong>Warning:</strong> ${reds.length} pollutant(s) in RED. Immediate action recommended.
      <div class="muted">Some pollutants require immediate attention — see actions per pollutant below.</div>
    `;
  } else {
    warning.classList.add('hidden');
    warning.innerHTML = '';
  }

  content.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  const h = document.createElement('h3');
  h.textContent = school.name;
  card.appendChild(h);

  const table = document.createElement('table');
  table.className = 'pollutants';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Pollutant</th><th>%</th><th>RAG</th><th>Certainty</th><th>Actions</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  school.pollutants.forEach((p, idx)=>{
    const displayedPct = Math.round(p.pct * mult);
    const tr = document.createElement('tr');
    const tdName = document.createElement('td'); tdName.textContent = p.name;
    const tdPct = document.createElement('td');
    tdPct.innerHTML = `
      <div class="muted">${displayedPct}% <span class="muted">(${currentTimeframe === 'today' ? 'today' : currentTimeframe})</span></div>
      <div class="percent-bar" aria-hidden><div class="percent-fill" style="width:${displayedPct}%"></div></div>
    `;
    const tdRag = document.createElement('td');
    const r = ragFor(displayedPct);
    const span = document.createElement('span');
    span.className = `badge rag-${r}`;
    span.textContent = r.toUpperCase();
    tdRag.appendChild(span);

    const tdCert = document.createElement('td');
    const certClass = `certainty-${(p.certainty||'Low').toLowerCase()}`;
    const certSpan = document.createElement('span');
    certSpan.className = `certainty-badge ${certClass}`;
    certSpan.textContent = p.certainty || 'Low';
    tdCert.appendChild(certSpan);

    const tdActions = document.createElement('td');
    // Actions button (per-pollutant)
    const btn = document.createElement('button');
    btn.className = 'poll-action-btn';
    btn.textContent = 'What can I do?';
    const msgId = `${school.id}-${idx}-action`;
    btn.onclick = ()=>{
      const existing = document.getElementById(msgId);
      if(existing){ existing.remove(); return; }
      const msg = document.createElement('div');
      msg.id = msgId;
      msg.className = 'poll-action-msg';
      msg.innerHTML = `<strong>Actions for ${p.name}:</strong><div>${p.actions}</div>`;
      tr.after(msg);
    };
    tdActions.appendChild(btn);

    // Sources button (per-pollutant) - separate drop-down
    const srcBtn = document.createElement('button');
    srcBtn.className = 'poll-action-btn';
    srcBtn.style.marginLeft = '8px';
    srcBtn.textContent = 'Sources';
    const sourcesId = `${school.id}-${idx}-sources`;
    srcBtn.onclick = ()=>{
      const existing = document.getElementById(sourcesId);
      if(existing){ existing.remove(); return; }
      const src = document.createElement('div');
      src.id = sourcesId;
      src.className = 'sources-drop';
      const inner = document.createElement('div');
      inner.innerHTML = `<strong>Data sources for ${p.name}:</strong>`;
      const ul = document.createElement('ul');
      ul.className = 'sources-list';
      (p.sources||[]).forEach(s => {
        const li = document.createElement('li'); li.textContent = s; ul.appendChild(li);
      });
      src.appendChild(inner);
      src.appendChild(ul);
      tr.after(src);
    };
    tdActions.appendChild(srcBtn);

    tr.appendChild(tdName);tr.appendChild(tdPct);tr.appendChild(tdRag);tr.appendChild(tdCert);tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  card.appendChild(table);

  // Parent reports section with summary
  const reportsSection = document.createElement('div');
  reportsSection.className = 'reports-section';
  const reportsH = document.createElement('h4');
  reportsH.textContent = 'Parent reports';
  reportsSection.appendChild(reportsH);

  const reports = (school.parentReports || []).slice();
  // Types of report categories
  const reportTypes = ['Odor','Dust/Particles','Mould/Moisture','Chemical Smell','Poor Ventilation','Temperature Issues','Other'];
  const counts = {};
  reportTypes.forEach(t=>counts[t]=0);
  reports.forEach(r=>{ if(r.type && counts.hasOwnProperty(r.type)) counts[r.type]++; else counts['Other']++; });

  // Summary: counts per type and last reported date
  const summary = document.createElement('div');
  summary.className = 'reports-summary';
  const total = reports.length;
  const lastReported = reports.length ? reports.map(r=>r.date).sort().pop() : null;
  const totSpan = document.createElement('div');
  totSpan.className = 'reports-total';
  totSpan.textContent = `Total reports: ${total}` + (lastReported ? ` — Last reported: ${lastReported}` : '');
  summary.appendChild(totSpan);

  const typesList = document.createElement('div');
  typesList.className = 'reports-types';
  reportTypes.forEach(t => {
    const cnt = counts[t];
    const span = document.createElement('span');
    span.className = 'report-type';
    span.textContent = `${t}: ${cnt}`;
    typesList.appendChild(span);
  });
  summary.appendChild(typesList);
  reportsSection.appendChild(summary);

  if(reports.length){
    const rptTable = document.createElement('table');
    rptTable.className = 'reports';
    const rptHead = document.createElement('thead');
    rptHead.innerHTML = '<tr><th>Date raised</th><th>Issue</th><th>Reviewed</th></tr>';
    rptTable.appendChild(rptHead);
    const rptBody = document.createElement('tbody');
    reports.forEach(r => {
      const trr = document.createElement('tr');
      const tdDate = document.createElement('td'); tdDate.textContent = r.date;
      const tdIssue = document.createElement('td');
      // Add issue-type tag before the issue text
      const tag = document.createElement('span');
      tag.className = 'report-tag';
      tag.textContent = r.type || 'Other';
      tdIssue.appendChild(tag);
      const txt = document.createElement('span');
      txt.style.marginLeft = '8px';
      txt.textContent = r.issue;
      tdIssue.appendChild(txt);
      const tdRev = document.createElement('td'); tdRev.textContent = r.reviewed ? 'Yes' : 'No';
      trr.appendChild(tdDate); trr.appendChild(tdIssue); trr.appendChild(tdRev);
      rptBody.appendChild(trr);
    });
    rptTable.appendChild(rptBody);
    reportsSection.appendChild(rptTable);
  } else {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No parent reports for this school.';
    reportsSection.appendChild(p);
  }

  card.appendChild(reportsSection);

  content.appendChild(card);
}

renderSchools();
