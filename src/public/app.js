/* ═══════════════════════════════════════════════════════════════
   Simtura Leads — Dashboard SPA
   Vanilla JS, no frameworks, no dependencies.
   ═══════════════════════════════════════════════════════════════ */

// ── API helper ────────────────────────────────────────────────────────────────

async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Toast system ──────────────────────────────────────────────────────────────

function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  t.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(16px)'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 350); }, 3500);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function showModal(htmlContent) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal">${htmlContent}</div>
    </div>`;
  root.querySelector('#modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
}

function closeModal() {
  document.getElementById('modalRoot').innerHTML = '';
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d.includes('T') ? d : d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function relTime(d) {
  if (!d) return 'never';
  const sec = Math.floor((Date.now() - new Date(d)) / 1000);
  if (sec < 60)   return 'just now';
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h ago`;
  return `${Math.floor(sec/86400)}d ago`;
}

function badge(type, text) {
  return `<span class="badge badge-${type}">${text}</span>`;
}

function typeBadge(type) {
  return type === 'agency'
    ? badge('agency', 'EMS Agency')
    : badge('school', 'Teaching School');
}

function statusBadge(status) {
  const labels = { new:'New', contacted:'Contacted', engaged:'Engaged', replied:'Replied', booked:'Booked', unsubscribed:'Unsubscribed' };
  return badge(status, labels[status] || status);
}

function stepDots(seqStep) {
  const dots = Array.from({length: 5}, (_, i) => {
    const n = i + 1;
    const cls = n <= seqStep ? 'done' : (n === seqStep + 1 ? 'active' : '');
    return `<div class="sd ${cls}"></div>`;
  }).join('');
  return `<div class="step-dots">${dots}</div>`;
}

function stepLabel(seqStep) {
  if (seqStep === 0) return 'Not started';
  if (seqStep >= 5)  return 'Complete';
  return `Step ${seqStep} sent`;
}

function activityDesc(item) {
  try {
    const d = item.details ? JSON.parse(item.details) : {};
    switch (item.action) {
      case 'email_sent':       return `Email step ${d.step} sent to <b>${d.org}</b>`;
      case 'reply_received':   return `Reply received from <b>${d.org}</b>`;
      case 'status_changed':   return `<b>${d.org || '—'}</b> moved to ${d.to}`;
      case 'prospect_added':   return `New prospect: <b>${d.org}</b>`;
      case 'bulk_import':      return `Bulk import: ${d.count} prospects added`;
      case 'unsubscribed':     return `<b>${d.org}</b> unsubscribed`;
      case 'sequence_paused':  return `Sequence paused for <b>${d.org}</b>`;
      case 'sequence_resumed': return `Sequence resumed for <b>${d.org}</b>`;
      case 'linkedin_approved':return `LinkedIn post approved`;
      case 'linkedin_generated':return `${d.count} LinkedIn posts drafted for ${d.week}`;
      case 'scheduler_ran':    return `Daily job ran — ${d.emailResults?.sent || 0} emails sent, ${d.replyResults?.found || 0} replies found`;
      default:                 return item.action.replace(/_/g, ' ');
    }
  } catch { return item.action; }
}

function activityDotClass(action) {
  if (action.includes('reply')) return 'reply';
  if (action.includes('unsub')) return 'unsub';
  if (action.includes('status')) return 'status';
  return '';
}

function loading() {
  return `<div class="loading-state"><div class="spinner"></div> Loading…</div>`;
}

function empty(icon, text) {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><div class="empty-text">${text}</div></div>`;
}

// ── Navigation ────────────────────────────────────────────────────────────────

let currentView = 'overview';

const VIEW_TITLES = {
  overview: 'Overview',
  pipeline: 'Pipeline',
  sequences: 'Sequences',
  replies: 'Replies',
  linkedin: 'LinkedIn Queue',
  add: 'Add Prospects',
  settings: 'Settings',
};

function navigate(view) {
  if (!VIEW_TITLES[view]) view = 'overview';
  currentView = view;
  window.location.hash = view;

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  document.getElementById('viewTitle').textContent = VIEW_TITLES[view];
  document.getElementById('topbarActions').innerHTML = '';

  const c = document.getElementById('content');
  c.innerHTML = loading();

  const renderers = {
    overview:  renderOverview,
    pipeline:  renderPipeline,
    sequences: renderSequences,
    replies:   renderReplies,
    linkedin:  renderLinkedIn,
    add:       renderAdd,
    settings:  renderSettings,
  };
  (renderers[view] || renderOverview)();
}

// ── View: Overview ────────────────────────────────────────────────────────────

async function renderOverview() {
  const data = await api('/overview').catch(err => { toast(err.message, 'error'); return null; });
  if (!data) return;

  const total = data.pipeline
    ? Object.values(data.pipeline).reduce((a, b) => a + b, 0)
    : data.totalProspects || 0;

  const funnelMax = Math.max(...Object.values(data.pipeline || {}).filter((_, i, a) => i < 5), 1);
  const funnelStages = [
    { key: 'new',       label: 'New' },
    { key: 'contacted', label: 'Contacted' },
    { key: 'engaged',   label: 'Engaged' },
    { key: 'replied',   label: 'Replied' },
    { key: 'booked',    label: 'Booked' },
  ];

  const funnelHTML = funnelStages.map(s => {
    const count = data.pipeline?.[s.key] || 0;
    const pct   = Math.max(count / funnelMax * 100, count > 0 ? 8 : 0);
    return `
      <div class="funnel-row">
        <div class="funnel-label">${s.label}</div>
        <div class="funnel-track">
          <div class="funnel-fill fill-${s.key}" style="width:${pct}%">
            <span>${count}</span>
          </div>
        </div>
      </div>`;
  }).join('');

  const activityHTML = (data.activity || []).length
    ? data.activity.map(a => `
        <div class="activity-item">
          <div class="activity-dot ${activityDotClass(a.action)}"></div>
          <div style="flex:1">
            <div class="activity-text">${activityDesc(a)}</div>
          </div>
          <div class="activity-time">${relTime(a.created_at)}</div>
        </div>`).join('')
    : empty('🕐', 'No activity yet');

  document.getElementById('content').innerHTML = `
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Total Prospects</div>
        <div class="metric-value">${total}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Emails Sent This Week</div>
        <div class="metric-value indigo">${data.emailsSentWeek || 0}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Open Replies</div>
        <div class="metric-value green">${data.openReplies || 0}</div>
        ${data.openReplies > 0 ? '<div class="metric-sub">Need attention</div>' : ''}
      </div>
      <div class="metric-card">
        <div class="metric-label">Calls Booked</div>
        <div class="metric-value amber">${data.booked || 0}</div>
      </div>
    </div>

    <div class="overview-grid">
      <div class="overview-left">
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Pipeline Funnel</span></div>
          <div class="panel-body"><div class="funnel">${funnelHTML}</div></div>
        </div>
      </div>
      <div class="overview-right">
        <div class="panel" style="flex:1">
          <div class="panel-header">
            <span class="panel-title">Recent Activity</span>
            <span style="font-size:12px;color:#94a3b8">Last 10 actions</span>
          </div>
          <div class="panel-body">
            <div class="activity-list">${activityHTML}</div>
          </div>
        </div>
      </div>
    </div>`;

  // Wire topbar refresh button
  document.getElementById('topbarActions').innerHTML =
    `<button class="btn btn-secondary btn-sm" onclick="navigate('overview')">↻ Refresh</button>`;
}

// ── View: Pipeline ────────────────────────────────────────────────────────────

async function renderPipeline() {
  const prospects = await api('/prospects').catch(err => { toast(err.message, 'error'); return []; });

  const columns = [
    { key: 'new',       label: 'New' },
    { key: 'contacted', label: 'Contacted' },
    { key: 'engaged',   label: 'Engaged' },
    { key: 'replied',   label: 'Replied' },
    { key: 'booked',    label: 'Booked' },
  ];

  const grouped = {};
  columns.forEach(c => { grouped[c.key] = []; });
  prospects.forEach(p => { if (grouped[p.status] !== undefined) grouped[p.status].push(p); });

  const colsHTML = columns.map(col => {
    const cards = grouped[col.key].map(p => `
      <div class="kanban-card" draggable="true" data-id="${p.id}" data-status="${p.status}">
        <div class="kc-name">${p.contact_name || p.name}</div>
        <div class="kc-org">${p.organization}</div>
        <div class="kc-meta">
          ${typeBadge(p.type)}
          ${stepDots(p.sequence_step)}
        </div>
        <div class="kc-meta" style="margin-top:6px;">
          <span class="kc-step">${stepLabel(p.sequence_step)}</span>
          <span class="kc-date">${p.last_contacted ? relTime(p.last_contacted) : 'Never contacted'}</span>
        </div>
      </div>`).join('');

    return `
      <div class="kanban-col" data-status="${col.key}">
        <div class="kanban-col-head">
          <span class="kanban-col-name">${col.label}</span>
          <span class="kanban-col-badge">${grouped[col.key].length}</span>
        </div>
        <div class="kanban-cards">${cards || `<div style="padding:12px 4px;font-size:12px;color:#94a3b8;text-align:center;">Drop here</div>`}</div>
      </div>`;
  }).join('');

  document.getElementById('content').innerHTML = `<div class="kanban-board">${colsHTML}</div>`;

  setupKanbanDrag();
}

function setupKanbanDrag() {
  let dragId = null;

  document.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragId = card.dataset.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  document.querySelectorAll('.kanban-col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', e => {
      if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
    });
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      if (!dragId) return;
      const newStatus = col.dataset.status;
      const card = document.querySelector(`.kanban-card[data-id="${dragId}"]`);
      if (card && card.dataset.status === newStatus) return;
      try {
        await api(`/prospects/${dragId}`, 'PUT', { status: newStatus });
        toast(`Moved to ${newStatus}`, 'success');
        navigate('pipeline');
      } catch (err) { toast(err.message, 'error'); }
      dragId = null;
    });
  });
}

// ── View: Sequences ───────────────────────────────────────────────────────────

async function renderSequences() {
  const prospects = await api('/prospects').catch(err => { toast(err.message, 'error'); return []; });
  const active    = prospects.filter(p => !['unsubscribed','booked'].includes(p.status));

  if (!active.length) {
    document.getElementById('content').innerHTML = empty('📬', 'No active sequences. Add prospects to get started.');
    return;
  }

  const rows = active.map(p => `
    <tr>
      <td>
        <div style="font-weight:600;font-size:13px;">${p.contact_name || '—'}</div>
        <div style="font-size:12px;color:#64748b;">${p.organization}</div>
      </td>
      <td>${typeBadge(p.type)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          ${stepDots(p.sequence_step)}
          <span style="font-size:12px;color:#64748b;">${p.sequence_step}/5</span>
        </div>
      </td>
      <td>${p.next_send_date ? fmtDate(p.next_send_date) : '—'}</td>
      <td>${statusBadge(p.status)}</td>
      <td>
        <div class="toggle-wrap" onclick="togglePause(${p.id}, this)">
          <div class="toggle-track ${p.paused ? '' : 'on'}">
            <div class="toggle-thumb"></div>
          </div>
          <span class="toggle-label">${p.paused ? 'Paused' : 'Active'}</span>
        </div>
      </td>
      <td>
        <button class="btn btn-secondary btn-xs" onclick="previewEmail(${p.id})">Preview next</button>
      </td>
    </tr>`).join('');

  document.getElementById('content').innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Active Sequences — ${active.length} prospects</span>
        <span style="font-size:12px;color:#94a3b8;">Sequences pause automatically when a reply is detected.</span>
      </div>
      <table class="tbl">
        <thead>
          <tr>
            <th>Contact</th><th>Type</th><th>Step</th><th>Next Send</th><th>Status</th><th>Active</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function togglePause(id, wrapEl) {
  try {
    const r = await api(`/prospects/${id}/pause`, 'PUT');
    const track = wrapEl.querySelector('.toggle-track');
    const label = wrapEl.querySelector('.toggle-label');
    if (r.paused) { track.classList.remove('on'); label.textContent = 'Paused'; }
    else           { track.classList.add('on');    label.textContent = 'Active'; }
  } catch (err) { toast(err.message, 'error'); }
}

async function previewEmail(id) {
  showModal(`<div class="modal-title"><span class="modal-close" onclick="closeModal()">×</span>Next Email Preview</div>
             <div class="loading-state"><div class="spinner"></div> Generating preview with Claude…</div>`);
  try {
    const r = await api(`/prospects/${id}/preview`);
    if (!r || r.message) {
      document.querySelector('.modal .loading-state').outerHTML =
        `<p style="color:#64748b;">${r?.message || 'Sequence complete.'}</p>`;
      return;
    }
    document.querySelector('.modal').innerHTML = `
      <div class="modal-title">
        <span class="modal-close" onclick="closeModal()">×</span>
        Step ${r.step} Preview
      </div>
      <div class="modal-subject">Subject: ${r.subject}</div>
      <div class="modal-body-text">${r.body}</div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>`;
  } catch (err) {
    document.querySelector('.modal').innerHTML =
      `<div class="modal-title"><span class="modal-close" onclick="closeModal()">×</span>Error</div>
       <p style="color:#ef4444;">${err.message}</p>
       <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>`;
  }
}

// ── View: Replies ─────────────────────────────────────────────────────────────

async function renderReplies() {
  const replies = await api('/replies').catch(err => { toast(err.message, 'error'); return []; });

  const topbar = document.getElementById('topbarActions');
  topbar.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="checkRepliesNow()">↻ Check inbox now</button>`;

  if (!replies.length) {
    document.getElementById('content').innerHTML = empty('💬', 'No replies yet. Keep sending!');
    return;
  }

  const pending  = replies.filter(r => !r.action_taken);
  const resolved = replies.filter(r =>  r.action_taken);

  const renderCard = (r) => `
    <div class="reply-card" id="reply-${r.id}">
      <div class="reply-head">
        <div class="reply-who">
          <div class="reply-name">${r.contact_name || r.name || '—'}</div>
          <div class="reply-org">${r.organization} · ${r.email}</div>
        </div>
        <div class="reply-meta">
          ${typeBadge(r.type)}
          <div class="reply-date">${fmtDate(r.received_at)}</div>
        </div>
      </div>
      <div class="reply-body">${(r.reply_text || '').slice(0, 600)}${(r.reply_text || '').length > 600 ? '…' : ''}</div>
      ${r.suggested_response ? `
        <div class="reply-suggest">
          <div class="reply-suggest-label">✦ Suggested response from Claude</div>
          <div class="reply-suggest-body">${r.suggested_response}</div>
        </div>` : ''}
      ${!r.action_taken ? `
        <div class="reply-actions">
          <button class="btn btn-success btn-sm" onclick="takeReplyAction(${r.id}, ${r.prospect_id}, 'booked')">✓ Mark as Booked</button>
          <button class="btn btn-warning btn-sm" onclick="takeReplyAction(${r.id}, ${r.prospect_id}, 'nurture')">↻ Send to Nurture</button>
          <button class="btn btn-secondary btn-sm" onclick="takeReplyAction(${r.id}, ${r.prospect_id}, 'archive')">Archive</button>
        </div>` : `<div style="font-size:12px;color:#94a3b8;margin-top:4px;">Action taken: ${r.action_taken}</div>`}
    </div>`;

  document.getElementById('content').innerHTML = `
    ${pending.length ? `
      <div class="section-head">
        <div class="section-ttl">Needs Attention <span style="font-size:13px;font-weight:400;color:#94a3b8;">(${pending.length})</span></div>
      </div>
      ${pending.map(renderCard).join('')}` : ''}
    ${resolved.length ? `
      <div class="section-divider">Resolved</div>
      ${resolved.map(renderCard).join('')}` : ''}`;
}

async function takeReplyAction(replyId, prospectId, action) {
  try {
    await api(`/replies/${replyId}/action`, 'PUT', { action, prospectId });
    const labels = { booked: 'Marked as Booked!', nurture: 'Moved to Nurture', archive: 'Archived' };
    toast(labels[action] || 'Done', 'success');
    navigate('replies');
  } catch (err) { toast(err.message, 'error'); }
}

async function checkRepliesNow() {
  const btn = document.querySelector('#topbarActions button');
  if (btn) { btn.textContent = 'Checking…'; btn.disabled = true; }
  try {
    const r = await fetch('/api/status').then(r => r.json());
    toast(`Inbox check triggered. Found ${r?.repliesFound || 0} new replies.`, 'info');
    setTimeout(() => navigate('replies'), 800);
  } catch (err) { toast(err.message, 'error'); }
  if (btn) { btn.textContent = '↻ Check inbox now'; btn.disabled = false; }
}

// ── View: LinkedIn Queue ──────────────────────────────────────────────────────

async function renderLinkedIn() {
  const posts = await api('/linkedin').catch(err => { toast(err.message, 'error'); return []; });

  document.getElementById('topbarActions').innerHTML =
    `<button class="btn btn-primary btn-sm" onclick="generateLinkedIn()">✦ Generate This Week's Posts</button>`;

  const drafts   = posts.filter(p => p.status === 'draft');
  const approved = posts.filter(p => p.status === 'approved');

  const postTypeLabels = { hook: '🎣 Hook', education: '📚 Education', community: '🤝 Community', proof: '⭐ Proof' };
  const postTypeBadgeClass = { hook: 'badge-agency', education: 'badge-school', community: 'badge-replied', proof: 'badge-booked' };

  const renderPost = (p) => `
    <div class="li-card ${p.status === 'approved' ? 'approved' : ''}" id="li-post-${p.id}">
      <div class="li-card-head">
        <span class="badge ${postTypeBadgeClass[p.post_type] || 'badge-new'}">${postTypeLabels[p.post_type] || p.post_type}</span>
        <span style="font-size:11px;color:#94a3b8;">Week of ${p.week_of}</span>
      </div>
      <div class="li-post-body" id="li-body-${p.id}">${p.content}</div>
      <div class="li-actions" id="li-actions-${p.id}">
        ${p.status === 'draft' ? `
          <button class="btn btn-secondary btn-sm" onclick="editPost(${p.id})">✎ Edit</button>
          <button class="btn btn-primary btn-sm" onclick="approvePost(${p.id})">✓ Approve</button>` : `
          <span style="font-size:12px;color:#16a34a;font-weight:600;">✓ Approved</span>
          <button class="btn btn-ghost btn-sm" onclick="unapprovePost(${p.id})">Revert to draft</button>`}
      </div>
    </div>`;

  if (!drafts.length && !approved.length) {
    document.getElementById('content').innerHTML = `
      ${empty('📝', 'No posts yet. Generate this week\'s drafts to get started.')}`;
    return;
  }

  document.getElementById('content').innerHTML = `
    ${drafts.length ? `
      <div class="section-divider">Drafts — Review &amp; Approve</div>
      <div class="li-grid">${drafts.map(renderPost).join('')}</div>` : ''}
    ${approved.length ? `
      <div class="section-divider">Approved — Ready to Post</div>
      <div class="li-grid">${approved.map(renderPost).join('')}</div>` : ''}`;
}

function editPost(id) {
  const bodyEl   = document.getElementById(`li-body-${id}`);
  const actionsEl = document.getElementById(`li-actions-${id}`);
  const original = bodyEl.textContent;

  bodyEl.outerHTML = `<textarea class="li-post-edit" id="li-edit-${id}">${original}</textarea>`;
  actionsEl.innerHTML = `
    <button class="btn btn-primary btn-sm" onclick="savePost(${id})">Save</button>
    <button class="btn btn-secondary btn-sm" onclick="renderLinkedIn()">Cancel</button>`;
}

async function savePost(id) {
  const content = document.getElementById(`li-edit-${id}`)?.value;
  if (!content) return;
  try {
    await api(`/linkedin/${id}`, 'PUT', { content });
    toast('Post saved', 'success');
    renderLinkedIn();
  } catch (err) { toast(err.message, 'error'); }
}

async function approvePost(id) {
  try {
    await api(`/linkedin/${id}/approve`, 'PUT');
    toast('Post approved!', 'success');
    renderLinkedIn();
  } catch (err) { toast(err.message, 'error'); }
}

async function unapprovePost(id) {
  try {
    await api(`/linkedin/${id}`, 'PUT', { status: 'draft' });
    toast('Moved back to draft', 'info');
    renderLinkedIn();
  } catch (err) { toast(err.message, 'error'); }
}

async function generateLinkedIn() {
  const btn = document.querySelector('#topbarActions button');
  if (btn) { btn.textContent = 'Generating…'; btn.disabled = true; }
  try {
    const r = await api('/linkedin/generate', 'POST');
    toast(`${r.generated} posts generated!`, 'success');
    renderLinkedIn();
  } catch (err) {
    toast(err.message, 'error');
  }
  if (btn) { btn.textContent = '✦ Generate This Week\'s Posts'; btn.disabled = false; }
}

// ── View: Add Prospects ───────────────────────────────────────────────────────

function renderAdd() {
  document.getElementById('content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start;">
      <!-- Manual form -->
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Add a Prospect Manually</span></div>
        <div class="panel-body">
          <form id="addForm" onsubmit="submitAddForm(event)">
            <div class="form-grid">
              <div class="form-group">
                <label>Display Name *</label>
                <input class="input" name="name" required placeholder="FDNY Bureau of EMS">
              </div>
              <div class="form-group">
                <label>Organization *</label>
                <input class="input" name="organization" required placeholder="FDNY Bureau of EMS">
              </div>
              <div class="form-group">
                <label>Type *</label>
                <select class="select-input" name="type" required>
                  <option value="">Select type…</option>
                  <option value="agency">EMS Agency</option>
                  <option value="school">Teaching School / Program</option>
                </select>
              </div>
              <div class="form-group">
                <label>Email Address *</label>
                <input class="input" name="email" type="email" required placeholder="contact@org.gov">
              </div>
              <div class="form-group">
                <label>Contact Name</label>
                <input class="input" name="contact_name" placeholder="Jane Smith">
              </div>
              <div class="form-group">
                <label>Contact Title</label>
                <input class="input" name="contact_title" placeholder="EMS Director">
              </div>
              <div class="form-group span2">
                <label>Notes</label>
                <textarea class="textarea" name="notes" placeholder="Any context about this prospect…"></textarea>
              </div>
            </div>
            <div style="margin-top:20px;">
              <button type="submit" class="btn btn-primary" id="addSubmitBtn">Add Prospect</button>
            </div>
          </form>
        </div>
      </div>

      <!-- CSV import -->
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Bulk Import via CSV</span></div>
        <div class="panel-body">
          <p style="font-size:13px;color:#64748b;margin-bottom:12px;">
            Paste a CSV with headers: <code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px;">name, organization, type, email, contact_name, contact_title, notes</code>
          </p>
          <p style="font-size:12px;color:#94a3b8;margin-bottom:12px;">
            <b>type</b> must be <code style="background:#f1f5f9;padding:1px 4px;border-radius:4px;">agency</code> or <code style="background:#f1f5f9;padding:1px 4px;border-radius:4px;">school</code>
          </p>
          <textarea class="csv-input" id="csvInput" placeholder="name,organization,type,email,contact_name,contact_title,notes&#10;Wake County EMS,Wake County EMS,agency,ems@wakegov.com,EMS Director,EMS Director," oninput="previewCSV()"></textarea>
          <div id="csvPreview" style="margin-top:12px;font-size:12px;color:#64748b;"></div>
          <div style="margin-top:16px;">
            <button class="btn btn-primary" onclick="submitCSV()" id="csvSubmitBtn">Import Prospects</button>
          </div>
        </div>
      </div>
    </div>`;
}

function previewCSV() {
  const text = document.getElementById('csvInput')?.value || '';
  const rows  = parseCSV(text);
  const el    = document.getElementById('csvPreview');
  if (!rows.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<span style="font-weight:600;color:#0F172A;">${rows.length} row(s) detected.</span> First row: ${rows[0].name || '?'} · ${rows[0].organization || '?'} · ${rows[0].type || '?'} · ${rows[0].email || '?'}`;
}

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim().replace(/^"|"$/g, ''); });
    return obj;
  });
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

async function submitAddForm(e) {
  e.preventDefault();
  const btn = document.getElementById('addSubmitBtn');
  btn.textContent = 'Adding…'; btn.disabled = true;
  const fd  = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  try {
    await api('/prospects', 'POST', data);
    toast(`${data.organization} added successfully!`, 'success');
    e.target.reset();
  } catch (err) { toast(err.message, 'error'); }
  btn.textContent = 'Add Prospect'; btn.disabled = false;
}

async function submitCSV() {
  const text = document.getElementById('csvInput')?.value || '';
  const rows  = parseCSV(text);
  if (!rows.length) { toast('No valid rows found in CSV', 'error'); return; }
  const btn = document.getElementById('csvSubmitBtn');
  btn.textContent = `Importing ${rows.length} rows…`; btn.disabled = true;
  try {
    const r = await api('/prospects/bulk', 'POST', { prospects: rows });
    toast(`Imported ${r.imported} prospects. ${r.skipped} skipped.`, r.skipped ? 'info' : 'success');
    if (r.errors?.length) console.warn('Import errors:', r.errors);
    document.getElementById('csvInput').value = '';
    document.getElementById('csvPreview').innerHTML = '';
  } catch (err) { toast(err.message, 'error'); }
  btn.textContent = 'Import Prospects'; btn.disabled = false;
}

// ── View: Settings ────────────────────────────────────────────────────────────

async function renderSettings() {
  const [settings, status] = await Promise.all([
    api('/settings').catch(() => ({})),
    api('/status').catch(() => ({})),
  ]);

  document.getElementById('topbarActions').innerHTML =
    `<button class="btn btn-danger btn-sm" onclick="runNow()" id="runNowBtn">▶ Run Daily Job Now</button>`;

  const msOk  = status.microsoft_graph?.ok;
  const antOk = status.anthropic?.ok;

  document.getElementById('content').innerHTML = `
    <div class="settings-grid">
      <!-- Config -->
      <div class="settings-panel">
        <div class="settings-title">Configuration</div>
        <form id="settingsForm" onsubmit="saveSettings(event)">
          <div class="form-group" style="margin-bottom:16px;">
            <label>Daily Email Send Limit</label>
            <input class="input" name="daily_send_limit" type="number" min="1" max="200"
                   value="${settings.daily_send_limit || 50}">
            <span class="form-hint">Max emails sent per day. Keep at 50 or below to protect domain reputation.</span>
          </div>
          <div class="form-group" style="margin-bottom:16px;">
            <label>Schedule Time</label>
            <input class="input" name="schedule_time" type="time" value="${settings.schedule_time || '08:00'}">
            <span class="form-hint">Time the daily job runs (server timezone: America/New_York).</span>
          </div>
          <div class="form-group" style="margin-bottom:20px;">
            <label>Operator Email</label>
            <input class="input" value="${settings.operator_email || ''}" disabled style="background:#f8fafc;color:#64748b;">
            <span class="form-hint">Set via OPERATOR_EMAIL environment variable.</span>
          </div>
          <button type="submit" class="btn btn-primary">Save Settings</button>
        </form>
      </div>

      <!-- Status -->
      <div class="settings-panel">
        <div class="settings-title">System Status</div>
        <div class="status-row">
          <span class="status-row-label">Last job run</span>
          <span class="s-val">${status.last_run ? fmtDate(status.last_run) : 'Never'}</span>
        </div>
        <div class="status-row">
          <span class="status-row-label">Emails sent today</span>
          <span class="s-val">${status.emails_sent_today || 0}</span>
        </div>
        <div class="status-row">
          <span class="status-row-label">Microsoft Graph API</span>
          <span class="${msOk ? 's-ok' : 's-fail'}">${msOk ? '● Connected' : '● Not connected'}</span>
        </div>
        ${!msOk && status.microsoft_graph?.error ? `
        <div style="font-size:11.5px;color:#94a3b8;padding:6px 0 10px;">${status.microsoft_graph.error.slice(0,120)}</div>` : ''}
        <div class="status-row">
          <span class="status-row-label">Anthropic (Claude) API</span>
          <span class="${antOk ? 's-ok' : 's-fail'}">${antOk ? '● Key present' : '● Key missing'}</span>
        </div>
        <div class="status-row">
          <span class="status-row-label">Base URL</span>
          <span class="s-val" style="font-size:11.5px;">${settings.base_url || 'Not set (set BASE_URL env var)'}</span>
        </div>

        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9;">
          <p style="font-size:12.5px;color:#64748b;line-height:1.6;margin-bottom:12px;">
            "Run Daily Job Now" will immediately send today's emails, check for replies, and send the digest. Use to test or catch up.
          </p>
        </div>
      </div>

      <!-- Apollo CSV Upload -->
      <div class="settings-panel" style="grid-column:1/-1;">
        <div class="settings-title">Apollo.io Prospect Import</div>
        <p style="font-size:13px;color:#64748b;margin-bottom:20px;line-height:1.6;">
          Export contacts from Apollo.io as a CSV, then upload the file here. Duplicates are skipped automatically.
        </p>

        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
          <label style="font-size:12.5px;font-weight:600;color:#374151;">Upload Apollo CSV</label>
          <input type="file" id="csvFileInput" accept=".csv" style="font-size:13px;">
          <button class="btn btn-primary" onclick="uploadApolloCSV()" id="csvUploadBtn">
            ⬆ Upload &amp; Import
          </button>
        </div>
        <p style="font-size:12px;color:#94a3b8;margin-bottom:0;">
          In Apollo: Search → People → filter by title → Export → Export to CSV
        </p>
        <div id="csvResult" style="margin-top:14px;font-size:13px;display:none;"></div>
      </div>

      <!-- Prospects -->
      <div class="settings-panel" style="grid-column:1/-1;">
        <div class="settings-title">All Prospects</div>
        <p style="font-size:13px;color:#64748b;margin-bottom:16px;">
          Quickly view and manage all prospects without switching to the Pipeline view.
        </p>
        <button class="btn btn-secondary btn-sm" onclick="navigate('pipeline')">→ Open Pipeline View</button>
        <button class="btn btn-secondary btn-sm" style="margin-left:8px;" onclick="navigate('add')">+ Add Prospects</button>
      </div>
    </div>`;
}

async function uploadApolloCSV() {
  const btn      = document.getElementById('csvUploadBtn');
  const resultEl = document.getElementById('csvResult');
  const fileIn   = document.getElementById('csvFileInput');

  if (!fileIn.files.length) { toast('Please select a CSV file first', 'error'); return; }

  btn.textContent = 'Importing…'; btn.disabled = true;
  resultEl.style.display = 'block';
  resultEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:#64748b;"><div class="spinner"></div> Importing contacts…</div>`;

  try {
    const csvText = await fileIn.files[0].text();
    const r = await api('/import-csv', 'POST', { csvText });
    resultEl.innerHTML = `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;line-height:1.8;">
        <div style="font-weight:700;color:#15803d;margin-bottom:4px;">Import complete</div>
        <div style="font-size:13px;color:#166534;">
          ✓ Added: <b>${r.added}</b> new prospects<br>
          — Skipped (already in pipeline): <b>${r.skipped}</b><br>
          — No email found: <b>${r.noEmail}</b><br>
          — Total rows in file: <b>${r.total}</b>
        </div>
      </div>`;
    if (r.added > 0) toast(`${r.added} prospects imported!`, 'success');
    else toast('No new prospects found (all duplicates or no emails)', 'info');
    fileIn.value = '';
  } catch (err) {
    resultEl.innerHTML = `<div style="color:#dc2626;font-size:13px;">Error: ${err.message}</div>`;
    toast(err.message, 'error');
  }

  btn.textContent = '⬆ Upload & Import'; btn.disabled = false;
}

async function saveSettings(e) {
  e.preventDefault();
  const fd   = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  try {
    await api('/settings', 'PUT', data);
    toast('Settings saved', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function runNow() {
  const btn = document.getElementById('runNowBtn');
  if (!confirm('This will immediately send today\'s emails, check for replies, and dispatch the digest. Continue?')) return;
  btn.textContent = 'Running…'; btn.disabled = true;
  try {
    const r = await api('/run-now', 'POST');
    toast(r.message || 'Daily job complete!', 'success');
    renderSettings();
  } catch (err) { toast(err.message, 'error'); }
  btn.textContent = '▶ Run Daily Job Now'; btn.disabled = false;
}

// ── System status badge ───────────────────────────────────────────────────────

async function updateSystemStatus() {
  try {
    const status     = await api('/status');
    const replies    = await api('/overview');
    const openCount  = replies.openReplies || 0;
    const dot        = document.getElementById('sysDot');
    const label      = document.getElementById('sysLabel');
    const replyBadge = document.getElementById('replyBadge');

    const msOk = status?.microsoft_graph?.ok;
    if (msOk) { dot.classList.remove('error'); label.textContent = 'Connected'; }
    else       { dot.classList.add('error');    label.textContent = 'MS Graph error'; }

    if (openCount > 0) {
      replyBadge.style.display = 'inline-block';
      replyBadge.textContent   = openCount;
    } else {
      replyBadge.style.display = 'none';
    }
  } catch {
    // Status check failed silently — don't disrupt UX
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Nav clicks
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.view));
  });

  // Hash-based routing
  const hash = window.location.hash.replace('#', '');
  const initial = VIEW_TITLES[hash] ? hash : 'overview';

  navigate(initial);
  updateSystemStatus();

  // Refresh status every 2 minutes
  setInterval(updateSystemStatus, 120_000);
});
