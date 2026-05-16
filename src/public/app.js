/* ═══════════════════════════════════════════════════════════════
   Simtura Command — Dashboard SPA
   Vanilla JS, no frameworks, no dependencies.
   ═══════════════════════════════════════════════════════════════ */

// ── API helper ────────────────────────────────────────────────────────────────

async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  if (res.status === 401) { window.location.href = '/login'; return; }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.href = '/login';
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
  const labels = { new:'New', contacted:'Contacted', engaged:'Engaged', replied:'Replied', booked:'Booked', unsubscribed:'Unsubscribed', bounced:'Bounced' };
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
  overview:  'Overview',
  pipeline:  'Pipeline',
  sequences: 'Sequences',
  replies:   'Replies',
  outreach:  'Outreach Stats',
  linkedin:  'LinkedIn Queue',
  analytics: 'Analytics',
  revenue:   'Revenue',
  add:       'Add Prospects',
  settings:  'Settings',
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
  c.innerHTML = `<div class="loading-state"><div class="spinner"></div> Loading…</div>`;
  c.classList.remove('content-animate');
  void c.offsetWidth;
  c.classList.add('content-animate');

  const renderers = {
    overview:  renderOverview,
    pipeline:  renderPipeline,
    sequences: renderSequences,
    replies:   renderReplies,
    outreach:  renderOutreach,
    linkedin:  renderLinkedIn,
    analytics: renderAnalytics,
    revenue:   renderRevenue,
    add:       renderAdd,
    settings:  renderSettings,
  };
  (renderers[view] || renderOverview)();
}

function animateCounters() {
  document.querySelectorAll('[data-count]').forEach(el => {
    const raw = el.dataset.count;
    const target = parseFloat(raw);
    const isFloat = raw.includes('.');
    if (isNaN(target) || target === 0) return;
    const duration = 900;
    const start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = isFloat
        ? (target * eased).toFixed(1)
        : Math.floor(target * eased).toLocaleString();
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
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
      <div class="metric-card c-blue">
        <div class="metric-label">Total Prospects</div>
        <div class="metric-value" data-count="${total}">${total}</div>
      </div>
      <div class="metric-card c-purple">
        <div class="metric-label">Emails Sent This Week</div>
        <div class="metric-value" data-count="${data.emailsSentWeek || 0}">${data.emailsSentWeek || 0}</div>
      </div>
      <div class="metric-card c-green">
        <div class="metric-label">Open Replies</div>
        <div class="metric-value" data-count="${data.openReplies || 0}">${data.openReplies || 0}</div>
        ${data.openReplies > 0 ? '<div class="metric-sub" style="color:#059669;font-size:11px;margin-top:4px;">Need attention</div>' : ''}
      </div>
      <div class="metric-card c-amber">
        <div class="metric-label">Demos Booked</div>
        <div class="metric-value" data-count="${data.booked || 0}">${data.booked || 0}</div>
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

  animateCounters();

  // Wire topbar refresh button
  document.getElementById('topbarActions').innerHTML =
    `<button class="btn btn-secondary btn-sm" onclick="navigate('overview')">↻ Refresh</button>`;
}

// ── View: Pipeline ────────────────────────────────────────────────────────────

async function renderPipeline() {
  const prospects = await api('/prospects').catch(err => { toast(err.message, 'error'); return []; });

  const columns = [
    { key: 'new',          label: 'New' },
    { key: 'contacted',    label: 'Contacted' },
    { key: 'engaged',      label: 'Engaged' },
    { key: 'replied',      label: 'Replied' },
    { key: 'booked',       label: 'Booked' },
    { key: 'bounced',      label: 'Bounced' },
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
        <p style="font-size:13px;color:#64748b;margin-bottom:16px;line-height:1.6;">
          Export contacts from Apollo.io as a CSV, then drop it below. Duplicates are skipped automatically.
        </p>

        <div id="csvDropZone" onclick="document.getElementById('csvFileInput').click()"
          style="border:2px dashed #cbd5e1;border-radius:10px;padding:32px;text-align:center;cursor:pointer;transition:background .15s,border-color .15s;margin-bottom:12px;">
          <div style="font-size:28px;margin-bottom:8px;">+</div>
          <div style="font-weight:600;color:#374151;margin-bottom:4px;">Drop Apollo CSV here</div>
          <div style="font-size:12px;color:#94a3b8;">or click to browse</div>
          <input type="file" id="csvFileInput" accept=".csv" style="display:none;">
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

  initCsvDropZone();
}

async function uploadApolloCSV(file) {
  const resultEl = document.getElementById('csvResult');
  const dropZone = document.getElementById('csvDropZone');
  const fileIn   = document.getElementById('csvFileInput');
  const target   = file || fileIn.files[0];

  if (!target) { toast('Please select a CSV file first', 'error'); return; }

  dropZone.style.background = '#f8fafc';
  dropZone.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:8px;color:#64748b;"><div class="spinner"></div> Importing contacts…</div>`;
  resultEl.style.display = 'none';

  try {
    const csvText = await target.text();
    const r = await api('/import-csv', 'POST', { csvText });
    dropZone.innerHTML = `<div style="font-size:28px;margin-bottom:8px;">+</div><div style="font-weight:600;color:#374151;margin-bottom:4px;">Drop Apollo CSV here</div><div style="font-size:12px;color:#94a3b8;">or click to browse</div><input type="file" id="csvFileInput" accept=".csv" style="display:none;" onchange="uploadApolloCSV(this.files[0])">`;
    dropZone.style.background = '';
    resultEl.style.display = 'block';
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
  } catch (err) {
    resultEl.innerHTML = `<div style="color:#dc2626;font-size:13px;">Error: ${err.message}</div>`;
    dropZone.style.background = '';
    dropZone.innerHTML = `<div style="font-size:28px;margin-bottom:8px;">+</div><div style="font-weight:600;color:#374151;margin-bottom:4px;">Drop Apollo CSV here</div><div style="font-size:12px;color:#94a3b8;">or click to browse</div><input type="file" id="csvFileInput" accept=".csv" style="display:none;" onchange="uploadApolloCSV(this.files[0])">`;
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<div style="color:#dc2626;font-size:13px;">Error: ${err.message}</div>`;
    toast(err.message, 'error');
  }
}

function initCsvDropZone() {
  const zone = document.getElementById('csvDropZone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.background = '#f0f9ff'; zone.style.borderColor = '#6366f1'; });
  zone.addEventListener('dragleave', () => { zone.style.background = ''; zone.style.borderColor = '#cbd5e1'; });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.style.background = ''; zone.style.borderColor = '#cbd5e1';
    const file = e.dataTransfer.files[0];
    if (file) uploadApolloCSV(file);
  });
  zone.querySelector('#csvFileInput').addEventListener('change', function() {
    if (this.files[0]) uploadApolloCSV(this.files[0]);
  });
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

// ── View: Outreach Stats ──────────────────────────────────────────────────────

async function renderOutreach() {
  const [overview, sent] = await Promise.all([
    api('/overview').catch(() => ({})),
    api('/activity?limit=200').catch(() => []),
  ]);

  const emailsSent   = sent.filter(a => a.action === 'email_sent').length;
  const repliesCount = sent.filter(a => a.action === 'reply_received').length;
  const booked       = sent.filter(a => a.action === 'status_changed' && a.details?.includes('"to":"booked"')).length;
  const replyRate    = emailsSent ? ((repliesCount / emailsSent) * 100).toFixed(1) : '0.0';

  const stepCounts = [0,0,0,0,0];
  sent.filter(a => a.action === 'email_sent').forEach(a => {
    try { const s = JSON.parse(a.details).step; if (s >= 1 && s <= 5) stepCounts[s-1]++; } catch {}
  });

  document.getElementById('content').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1.5 8h13M8 1.5l6.5 6.5-6.5 6.5"/></svg></div>
        <div class="stat-value" data-count="${overview.emailsSentWeek || 0}">${overview.emailsSentWeek || 0}</div>
        <div class="stat-label">Emails Sent This Week</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H2a.5.5 0 0 0-.5.5v8A.5.5 0 0 0 2 11h3v2.5l3-2.5h6a.5.5 0 0 0 .5-.5v-8A.5.5 0 0 0 14 2Z"/></svg></div>
        <div class="stat-value" data-count="${repliesCount}">${repliesCount}</div>
        <div class="stat-label">Total Replies</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12l4-4 3 3 5-7"/></svg></div>
        <div class="stat-value" data-count="${replyRate}">0.0</div>
        <div class="stat-label">Reply Rate %</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M5 8l2 2 4-4"/></svg></div>
        <div class="stat-value" data-count="${overview.booked || 0}">${overview.booked || 0}</div>
        <div class="stat-label">Demos Booked</div>
      </div>
    </div>

    <div class="overview-grid">
      <div class="card">
        <div class="card-header"><span class="card-title">Emails by Step</span></div>
        <div class="card-body">
          ${stepCounts.map((c, i) => `
            <div class="chart-bar-row">
              <div class="chart-bar-label">Step ${i+1}</div>
              <div class="chart-bar-wrap"><div class="chart-bar-fill" style="width:${stepCounts[0] ? (c/Math.max(...stepCounts)*100) : 0}%"></div></div>
              <div class="chart-bar-val">${c}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Pipeline Summary</span></div>
        <div class="card-body">
          ${['new','contacted','engaged','replied','booked','bounced','unsubscribed'].map(s => `
            <div class="status-row">
              <span class="status-row-label">${s.charAt(0).toUpperCase()+s.slice(1)}</span>
              <span class="s-val">${overview.pipeline?.[s] || 0}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
  animateCounters();
}

// ── View: Analytics ───────────────────────────────────────────────────────────

// ── Analytics chart instances (destroyed on re-render) ────────────────────────
let _analyticsCharts = [];

function getLast30Days() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function groupByDay(activities, action) {
  const map = {};
  activities.filter(a => a.action === action).forEach(a => {
    if (!a.created_at) return;
    const key = new Date(a.created_at).toISOString().slice(0, 10);
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}

function initAnalyticsCharts(days, emailsByDay, repliesByDay, pipelineKeys, pipelineValues, pipelineColors, stepCounts, pipeline, totalProspects, cumulativeEmails, dayOfWeekCounts, replyRateByStep) {
  const charts = [];
  if (typeof Chart === 'undefined') return charts;

  Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";

  // 1 ── Email Activity Timeline
  const tlCtx = document.getElementById('emailTimelineChart')?.getContext('2d');
  if (tlCtx) {
    const g1 = tlCtx.createLinearGradient(0, 0, 0, 200);
    g1.addColorStop(0, 'rgba(59,127,237,.28)'); g1.addColorStop(1, 'rgba(59,127,237,0)');
    const g2 = tlCtx.createLinearGradient(0, 0, 0, 200);
    g2.addColorStop(0, 'rgba(16,185,129,.2)');  g2.addColorStop(1, 'rgba(16,185,129,0)');
    charts.push(new Chart(tlCtx, {
      type: 'line',
      data: {
        labels: days.map(d => { const dt = new Date(d + 'T12:00:00'); return `${dt.getMonth()+1}/${dt.getDate()}`; }),
        datasets: [
          { label: 'Emails Sent', data: days.map(d => emailsByDay[d] || 0), borderColor: '#3B7FED', backgroundColor: g1, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#3B7FED', tension: 0.4, fill: true },
          { label: 'Replies',     data: days.map(d => repliesByDay[d] || 0), borderColor: '#10B981', backgroundColor: g2, borderWidth: 2,   pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#10B981', tension: 0.4, fill: true },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', align: 'end', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 11 }, color: '#475569' } },
          tooltip: { mode: 'index', intersect: false, backgroundColor: 'rgba(11,23,58,.88)', padding: 12, cornerRadius: 10, titleFont: { size: 11, weight: '700' }, bodyFont: { size: 11 }, bodySpacing: 4 },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 7, font: { size: 10 }, color: '#CBD5E1' } },
          y: { grid: { color: 'rgba(0,0,0,.04)' }, border: { display: false }, ticks: { font: { size: 10 }, color: '#CBD5E1', precision: 0 }, beginAtZero: true },
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
      }
    }));
  }

  // 2 ── Pipeline Donut
  const doCtx = document.getElementById('pipelineDonutChart')?.getContext('2d');
  if (doCtx) {
    charts.push(new Chart(doCtx, {
      type: 'doughnut',
      data: {
        labels: pipelineKeys.map(k => k.charAt(0).toUpperCase() + k.slice(1)),
        datasets: [{ data: pipelineValues, backgroundColor: pipelineColors, borderWidth: 0, hoverOffset: 8 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '70%',
        plugins: {
          legend: { position: 'right', labels: { font: { size: 10 }, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', padding: 10, color: '#475569' } },
          tooltip: { backgroundColor: 'rgba(11,23,58,.88)', padding: 12, cornerRadius: 10, callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}${totalProspects ? ' (' + (ctx.raw/totalProspects*100).toFixed(1) + '%)' : ''}` } },
        }
      }
    }));
  }

  // 3 ── Conversion Funnel (horizontal bar)
  const fnCtx = document.getElementById('funnelChart')?.getContext('2d');
  if (fnCtx) {
    const fKeys   = ['new','contacted','engaged','replied','booked'];
    const fLabels = ['New','Contacted','Engaged','Replied','Booked'];
    const fData   = fKeys.map(k => pipeline[k] || 0);
    const fColors = ['#94A3B8','#3B7FED','#8B5CF6','#10B981','#F59E0B'];
    charts.push(new Chart(fnCtx, {
      type: 'bar',
      data: { labels: fLabels, datasets: [{ data: fData, backgroundColor: fColors, borderRadius: 6, borderSkipped: false }] },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(11,23,58,.88)', padding: 12, cornerRadius: 10, callbacks: { label: ctx => ` ${ctx.raw} prospects` } } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,.04)' }, border: { display: false }, ticks: { font: { size: 10 }, color: '#CBD5E1', precision: 0 }, beginAtZero: true },
          y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: '#475569' } },
        }
      }
    }));
  }

  // 4 ── Sequence Step Breakdown
  const stCtx = document.getElementById('stepChart')?.getContext('2d');
  if (stCtx) {
    const stGrad = stCtx.createLinearGradient(0, 0, 0, 180);
    stGrad.addColorStop(0, '#3B7FED'); stGrad.addColorStop(1, 'rgba(59,127,237,.3)');
    charts.push(new Chart(stCtx, {
      type: 'bar',
      data: { labels: ['Step 1','Step 2','Step 3','Step 4','Step 5'], datasets: [{ data: stepCounts, backgroundColor: stGrad, borderRadius: 6, borderSkipped: false }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(11,23,58,.88)', padding: 12, cornerRadius: 10, callbacks: { label: ctx => ` ${ctx.raw} emails sent` } } },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 }, color: '#CBD5E1' } },
          y: { grid: { color: 'rgba(0,0,0,.04)' }, border: { display: false }, ticks: { font: { size: 10 }, color: '#CBD5E1', precision: 0 }, beginAtZero: true },
        }
      }
    }));
  }

  // 5 ── Cumulative Outreach Growth
  const cumCtx = document.getElementById('cumulativeChart')?.getContext('2d');
  if (cumCtx && cumulativeEmails) {
    const gCum = cumCtx.createLinearGradient(0, 0, 0, 160);
    gCum.addColorStop(0, 'rgba(59,127,237,.35)');
    gCum.addColorStop(1, 'rgba(59,127,237,.02)');
    charts.push(new Chart(cumCtx, {
      type: 'line',
      data: {
        labels: days.map(d => { const dt = new Date(d + 'T12:00:00'); return `${dt.getMonth()+1}/${dt.getDate()}`; }),
        datasets: [{
          label: 'Total Emails Sent',
          data: cumulativeEmails,
          borderColor: '#3B7FED',
          backgroundColor: gCum,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#3B7FED',
          tension: 0.4,
          fill: true,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index', intersect: false, backgroundColor: 'rgba(11,23,58,.88)', padding: 12, cornerRadius: 10, titleFont: { size: 11, weight: '700' }, bodyFont: { size: 11 } },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 }, color: '#CBD5E1' } },
          y: { grid: { color: 'rgba(0,0,0,.04)' }, border: { display: false }, ticks: { font: { size: 10 }, color: '#CBD5E1', precision: 0 }, beginAtZero: true },
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
      }
    }));
  }

  // 6 ── Best Days to Send (day of week bar)
  const dowCtx = document.getElementById('dowChart')?.getContext('2d');
  if (dowCtx && dayOfWeekCounts) {
    const maxDow = Math.max(...dayOfWeekCounts, 1);
    const dowColors = dayOfWeekCounts.map(v => v === maxDow && v > 0 ? '#3B7FED' : 'rgba(59,127,237,.3)');
    charts.push(new Chart(dowCtx, {
      type: 'bar',
      data: {
        labels: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
        datasets: [{ data: dayOfWeekCounts, backgroundColor: dowColors, borderRadius: 7, borderSkipped: false }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: 'rgba(11,23,58,.88)', padding: 12, cornerRadius: 10, callbacks: { label: ctx => ` ${ctx.raw} emails` } },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11, weight: '500' }, color: '#64748B' } },
          y: { grid: { color: 'rgba(0,0,0,.04)' }, border: { display: false }, ticks: { font: { size: 10 }, color: '#CBD5E1', precision: 0 }, beginAtZero: true },
        }
      }
    }));
  }

  // 7 ── Reply Rate by Step (mixed bar + line)
  const rrCtx = document.getElementById('replyRateStepChart')?.getContext('2d');
  if (rrCtx && replyRateByStep) {
    charts.push(new Chart(rrCtx, {
      type: 'bar',
      data: {
        labels: ['Step 1','Step 2','Step 3','Step 4','Step 5'],
        datasets: [
          {
            type: 'bar',
            label: 'Emails Sent',
            data: stepCounts,
            backgroundColor: 'rgba(59,127,237,.25)',
            borderRadius: 6,
            borderSkipped: false,
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'Reply Rate %',
            data: replyRateByStep,
            borderColor: '#10B981',
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            pointRadius: 5,
            pointBackgroundColor: '#10B981',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            tension: 0.4,
            yAxisID: 'y2',
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', align: 'end', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 10 }, color: '#475569' } },
          tooltip: { mode: 'index', intersect: false, backgroundColor: 'rgba(11,23,58,.88)', padding: 12, cornerRadius: 10 },
        },
        scales: {
          x:  { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 }, color: '#CBD5E1' } },
          y:  { position: 'left',  grid: { color: 'rgba(0,0,0,.04)' }, border: { display: false }, ticks: { font: { size: 10 }, color: '#CBD5E1', precision: 0 }, beginAtZero: true },
          y2: { position: 'right', grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 }, color: '#10B981', callback: v => v + '%' }, beginAtZero: true },
        }
      }
    }));
  }

  return charts;
}

function parseGA4Date(d) {
  return `${parseInt(d.slice(4,6))}/${parseInt(d.slice(6,8))}`;
}

function initGA4Charts(ga4) {
  const charts = [];
  if (typeof Chart === 'undefined' || !ga4?.configured || ga4.error) return charts;

  // 1 — Users & Sessions timeline
  const tlCtx = document.getElementById('ga4TimelineChart')?.getContext('2d');
  if (tlCtx) {
    const g1 = tlCtx.createLinearGradient(0, 0, 0, 220);
    g1.addColorStop(0, 'rgba(59,127,237,.3)'); g1.addColorStop(1, 'rgba(59,127,237,0)');
    const g2 = tlCtx.createLinearGradient(0, 0, 0, 220);
    g2.addColorStop(0, 'rgba(16,185,129,.2)'); g2.addColorStop(1, 'rgba(16,185,129,0)');
    charts.push(new Chart(tlCtx, {
      type: 'line',
      data: {
        labels: ga4.timeline.map(r => parseGA4Date(r.date)),
        datasets: [
          { label: 'Users',    data: ga4.timeline.map(r => r.users),    borderColor: '#3B7FED', backgroundColor: g1, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, tension: 0.4, fill: true },
          { label: 'Sessions', data: ga4.timeline.map(r => r.sessions), borderColor: '#10B981', backgroundColor: g2, borderWidth: 2,   pointRadius: 0, pointHoverRadius: 5, tension: 0.4, fill: true },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', align: 'end', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 11 }, color: '#475569' } },
          tooltip: { mode: 'index', intersect: false, backgroundColor: 'rgba(11,23,58,.9)', padding: 12, cornerRadius: 10, titleFont: { size: 11, weight: '700' }, bodyFont: { size: 11 }, bodySpacing: 4 },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 }, color: '#CBD5E1' } },
          y: { grid: { color: 'rgba(0,0,0,.04)' }, border: { display: false }, ticks: { font: { size: 10 }, color: '#CBD5E1', precision: 0 }, beginAtZero: true },
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
      }
    }));
  }

  // 2 — Device breakdown doughnut
  const dvCtx = document.getElementById('ga4DeviceChart')?.getContext('2d');
  if (dvCtx) {
    const dvColors = { desktop: '#3B7FED', mobile: '#8B5CF6', tablet: '#10B981' };
    charts.push(new Chart(dvCtx, {
      type: 'doughnut',
      data: {
        labels: ga4.devices.map(d => d.device.charAt(0).toUpperCase() + d.device.slice(1)),
        datasets: [{ data: ga4.devices.map(d => d.sessions), backgroundColor: ga4.devices.map(d => dvColors[d.device] || '#94A3B8'), borderWidth: 0, hoverOffset: 8 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: {
          legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 9, boxHeight: 9, usePointStyle: true, pointStyle: 'circle', padding: 12, color: '#475569' } },
          tooltip: { backgroundColor: 'rgba(11,23,58,.9)', padding: 12, cornerRadius: 10, callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} sessions` } },
        }
      }
    }));
  }

  // 3 — Traffic sources horizontal bar
  const srCtx = document.getElementById('ga4SourcesChart')?.getContext('2d');
  if (srCtx) {
    const srColors = ['#3B7FED','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899','#94A3B8'];
    charts.push(new Chart(srCtx, {
      type: 'bar',
      data: {
        labels: ga4.sources.map(s => s.channel),
        datasets: [{ data: ga4.sources.map(s => s.sessions), backgroundColor: srColors.slice(0, ga4.sources.length), borderRadius: 6, borderSkipped: false }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: 'rgba(11,23,58,.9)', padding: 12, cornerRadius: 10, callbacks: { label: ctx => ` ${ctx.raw} sessions` } },
        },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,.04)' }, border: { display: false }, ticks: { font: { size: 10 }, color: '#CBD5E1', precision: 0 }, beginAtZero: true },
          y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11, weight: '500' }, color: '#475569' } },
        }
      }
    }));
  }

  // 4 — Top cities horizontal bar
  const ctCtx = document.getElementById('ga4CitiesChart')?.getContext('2d');
  if (ctCtx) {
    charts.push(new Chart(ctCtx, {
      type: 'bar',
      data: {
        labels: ga4.cities.map(c => c.city),
        datasets: [{ data: ga4.cities.map(c => c.users), backgroundColor: 'rgba(59,127,237,.75)', borderRadius: 6, borderSkipped: false,
          hoverBackgroundColor: '#3B7FED' }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: 'rgba(11,23,58,.9)', padding: 12, cornerRadius: 10, callbacks: { label: ctx => ` ${ctx.raw} users` } },
        },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,.04)' }, border: { display: false }, ticks: { font: { size: 10 }, color: '#CBD5E1', precision: 0 }, beginAtZero: true },
          y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10, weight: '500' }, color: '#475569' } },
        }
      }
    }));
  }

  return charts;
}

async function deleteSimturaUser(id, email, name) {
  showModal(`
    <div style="padding:8px 4px;">
      <div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:8px;">Delete account?</div>
      <div style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:20px;">
        This will permanently delete <strong>${name || email}</strong> (<span style="color:#ef4444;">${email}</span>) from Simtura.ai.<br>
        This cannot be undone.
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button onclick="closeModal()" style="padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text-2);font-size:13px;cursor:pointer;font-weight:600;">Cancel</button>
        <button onclick="confirmDeleteSimturaUser('${id}','${email}')" style="padding:8px 18px;border-radius:8px;border:none;background:#ef4444;color:#fff;font-size:13px;cursor:pointer;font-weight:700;">Delete</button>
      </div>
    </div>
  `);
}

async function confirmDeleteSimturaUser(id, email) {
  closeModal();
  const row = document.getElementById(`user-row-${id}`);
  if (row) { row.style.opacity = '0.4'; row.style.pointerEvents = 'none'; }
  try {
    const res = await fetch(`/api/analytics/signups/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    if (row) row.remove();
    toast(`Deleted ${email}`, 'success');
  } catch (err) {
    if (row) { row.style.opacity = '1'; row.style.pointerEvents = ''; }
    toast(`Delete failed: ${err.message}`, 'error');
  }
}

function buildSignupsSection(data) {
  if (!data || !data.configured) return '';
  if (data.error) return `<div class="ga4-error-notice" style="margin-top:8px;">User signup error: ${data.error}</div>`;

  const users     = data.users || [];
  const proRate   = data.total > 0 ? ((data.proCount / data.total) * 100).toFixed(1) : '0.0';
  const avgPerDay = data.last30 > 0 ? (data.last30 / 30).toFixed(1) : '0.0';

  const rows = users.slice(0, 100).map((u, i) => {
    const tierColor = u.tier === 'pro' ? '#10B981' : '#94A3B8';
    const tierLabel = u.tier === 'pro' ? 'Pro' : 'Free';
    const org = u.organizationId ? `<span style="font-size:10px;background:rgba(59,127,237,.12);color:#3B7FED;border-radius:4px;padding:1px 6px;margin-left:4px;">Org</span>` : '';
    return `<tr id="user-row-${u.id}" style="border-bottom:1px solid rgba(226,232,240,.5);">
      <td style="padding:7px 10px;font-size:12px;color:var(--text-2);">${i + 1}</td>
      <td style="padding:7px 10px;font-size:12px;color:var(--text);font-weight:500;">${u.name || '—'}${org}</td>
      <td style="padding:7px 10px;font-size:12px;color:var(--text-2);">${u.email}</td>
      <td style="padding:7px 10px;"><span style="font-size:11px;font-weight:700;color:${tierColor};">${tierLabel}</span></td>
      <td style="padding:7px 10px;font-size:12px;color:var(--text-3);">${fmtDate(u.createdAt)}</td>
      <td style="padding:7px 10px;text-align:right;">
        <button onclick="deleteSimturaUser('${u.id}','${(u.email||'').replace(/'/g,"\\'")}','${(u.name||'').replace(/'/g,"\\'")}\")"
          style="background:none;border:1px solid rgba(239,68,68,.35);color:#ef4444;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer;font-weight:600;transition:background .15s;"
          onmouseover="this.style.background='rgba(239,68,68,.08)'" onmouseout="this.style.background='none'">
          Delete
        </button>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="section-header" style="margin-top:8px;">
      <div class="section-title">Simtura.ai User Signups</div>
      <span style="font-size:11px;color:#10B981;font-weight:600;display:flex;align-items:center;gap:5px;"><span class="live-dot"></span> Live · simtura.ai database</span>
    </div>

    <div class="insights-strip" style="margin-bottom:16px;">
      <div class="insight-tile">
        <div class="insight-val" data-count="${data.total}">${data.total}</div>
        <div class="insight-lbl">Total Registered</div>
      </div>
      <div class="insight-tile">
        <div class="insight-val" data-count="${data.proCount}">${data.proCount}</div>
        <div class="insight-lbl">Pro Accounts</div>
      </div>
      <div class="insight-tile">
        <div class="insight-val">${proRate}%</div>
        <div class="insight-lbl">Pro Conversion</div>
      </div>
      <div class="insight-tile">
        <div class="insight-val">${avgPerDay}</div>
        <div class="insight-lbl">Signups / day (30d)</div>
      </div>
    </div>

    <div class="chart-card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
        <div>
          <div class="chart-card-title">Signup Activity — Last 30 Days</div>
          <div class="chart-card-sub">New accounts registered per day</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:24px;font-weight:800;color:var(--brand);letter-spacing:-1px;line-height:1;">${data.last30}</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:2px;">last 30 days</div>
        </div>
      </div>
      <div style="position:relative;height:160px;"><canvas id="signupsChart"></canvas></div>
    </div>

    <div class="chart-card" style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div>
          <div class="chart-card-title">Registered Users</div>
          <div class="chart-card-sub">Most recent ${Math.min(users.length, 100)} of ${data.total} accounts</div>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:480px;">
          <thead>
            <tr style="border-bottom:1px solid rgba(226,232,240,.8);">
              <th style="text-align:left;padding:6px 10px;font-size:11px;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:.4px;">#</th>
              <th style="text-align:left;padding:6px 10px;font-size:11px;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:.4px;">Name</th>
              <th style="text-align:left;padding:6px 10px;font-size:11px;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:.4px;">Email</th>
              <th style="text-align:left;padding:6px 10px;font-size:11px;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:.4px;">Tier</th>
              <th style="text-align:left;padding:6px 10px;font-size:11px;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:.4px;">Joined</th>
              <th style="padding:6px 10px;"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

async function renderAnalytics() {
  _analyticsCharts.forEach(c => c.destroy());
  _analyticsCharts = [];

  document.getElementById('content').innerHTML = `<div class="loading-state"><div class="spinner"></div> Loading…</div>`;

  const [gaData, ga4Data, overview, activity, purchaseData, signupData] = await Promise.all([
    fetch('/api/analytics/ga').then(r => r.json()).catch(() => ({ configured: false })),
    fetch('/api/analytics/ga4').then(r => r.json()).catch(() => ({ configured: false })),
    api('/overview').catch(() => ({})),
    api('/activity?limit=2000').catch(() => []),
    fetch('/api/analytics/purchases').then(r => r.json()).catch(() => ({ total: 0, byDay: {} })),
    fetch('/api/analytics/signups').then(r => r.json()).catch(() => ({ configured: false })),
  ]);

  const emailsSent     = activity.filter(a => a.action === 'email_sent').length;
  const repliesCount   = activity.filter(a => a.action === 'reply_received').length;
  const replyRate      = emailsSent ? ((repliesCount / emailsSent) * 100).toFixed(1) : '0.0';
  const booked         = overview.booked || 0;
  const pipeline       = overview.pipeline || {};
  const totalProspects = Object.values(pipeline).reduce((a,b)=>a+b,0) || overview.totalProspects || 0;
  const bookingRate    = emailsSent ? ((booked / emailsSent) * 100).toFixed(1) : '0.0';

  const stepCounts = [0,0,0,0,0];
  activity.filter(a => a.action === 'email_sent').forEach(a => {
    try { const s = JSON.parse(a.details).step; if (s >= 1 && s <= 5) stepCounts[s-1]++; } catch {}
  });

  const days         = getLast30Days();
  const emailsByDay  = groupByDay(activity, 'email_sent');
  const repliesByDay = groupByDay(activity, 'reply_received');

  const dayOfWeekCounts = [0,0,0,0,0,0,0];
  activity.filter(a => a.action === 'email_sent').forEach(a => {
    if (!a.created_at) return;
    dayOfWeekCounts[new Date(a.created_at).getDay()]++;
  });

  const repliesByStep = [0,0,0,0,0];
  activity.filter(a => a.action === 'reply_received').forEach(a => {
    try { const s = JSON.parse(a.details).step; if (s >= 1 && s <= 5) repliesByStep[s-1]++; } catch {}
  });
  const replyRateByStep = stepCounts.map((sent, i) => sent ? parseFloat((repliesByStep[i]/sent*100).toFixed(1)) : 0);

  const cumulativeEmails = days.map((d, i) => days.slice(0,i+1).reduce((acc,day) => acc+(emailsByDay[day]||0), 0));

  const activeDays = days.filter(d => (emailsByDay[d]||0) > 0).length;
  const DOW_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const bestDayName = emailsSent > 0 ? DOW_NAMES[dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))] : '—';
  const contactedPct = totalProspects > 0 ? (((pipeline.contacted||0)+(pipeline.engaged||0)+(pipeline.replied||0)+(pipeline.booked||0))/totalProspects*100).toFixed(0) : '0';

  const pipelineKeys   = ['new','contacted','engaged','replied','booked','bounced','unsubscribed'];
  const pipelineValues = pipelineKeys.map(k => pipeline[k] || 0);
  const pipelineColors = ['#94A3B8','#3B7FED','#8B5CF6','#10B981','#F59E0B','#EF4444','#CBD5E1'];

  // Purchase attempts chart (30-day bar)
  const purchaseDays     = getLast30Days();
  const purchaseByDay    = purchaseData.byDay || {};
  const purchaseTotal    = purchaseData.total || 0;
  const purchaseSection  = `
    <div class="section-header" style="margin-top:8px;">
      <div class="section-title">Premium Conversion</div>
      <span style="font-size:11px;color:#94A3B8;font-weight:500;">Payment system coming soon</span>
    </div>
    <div class="chart-card" style="margin-bottom:24px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;">
        <div>
          <div class="chart-card-title">Premium Purchase Attempts</div>
          <div class="chart-card-sub">People who clicked "Get Premium" on simtura.ai — last 30 days</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:28px;font-weight:800;color:var(--brand);letter-spacing:-1px;line-height:1;">${purchaseTotal}</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:2px;">total attempts</div>
        </div>
      </div>
      ${purchaseTotal === 0 ? `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:120px;gap:10px;color:var(--text-3);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".4"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>
          <div style="font-size:13px;font-weight:500;opacity:.6;">Waiting for first purchase click</div>
          <div style="font-size:11.5px;opacity:.45;max-width:360px;text-align:center;">Add the tracking pixel to your simtura.ai pricing page — data will appear here instantly</div>
        </div>` : `<div style="position:relative;height:160px;"><canvas id="purchaseChart"></canvas></div>`}
      <div style="margin-top:14px;padding:12px 14px;background:var(--surface-alt);border-radius:9px;border:1px dashed rgba(59,127,237,.3);">
        <div style="font-size:11.5px;font-weight:700;color:var(--text-2);margin-bottom:5px;">Add tracking to simtura.ai</div>
        <div style="font-size:11px;color:var(--text-3);line-height:1.6;">Drop this on your "Get Premium" button — no backend needed:</div>
        <code style="display:block;margin-top:8px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:7px;font-size:11px;color:#3B7FED;word-break:break-all;">fetch('https://simtura-leadgen.onrender.com/track/purchase-attempt', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({source:'pricing-page', plan:'premium'}) })</code>
      </div>
    </div>`;

  // Build the GA4 custom-chart section (shown if API is connected)
  let ga4Section = '';
  if (ga4Data.configured && !ga4Data.error) {
    const k = ga4Data.kpis || {};
    const pagesRows = (ga4Data.pages || []).map(p => {
      const maxViews = Math.max(...(ga4Data.pages || []).map(x => x.views), 1);
      const barW = Math.round(p.views / maxViews * 100);
      const shortPath = p.path.length > 42 ? p.path.slice(0, 42) + '…' : p.path;
      return `<tr>
        <td style="padding:7px 10px;font-size:12px;color:var(--text-2);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.path}">${shortPath}</td>
        <td style="padding:7px 10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;height:6px;background:rgba(59,127,237,.12);border-radius:4px;overflow:hidden;">
              <div style="width:${barW}%;height:100%;background:#3B7FED;border-radius:4px;"></div>
            </div>
            <span style="font-size:12px;font-weight:700;color:var(--text);min-width:28px;text-align:right;">${p.views}</span>
          </div>
        </td>
        <td style="padding:7px 10px;text-align:right;font-size:12px;color:${p.engagement >= 60 ? '#10B981' : p.engagement >= 30 ? '#F59E0B' : '#EF4444'};font-weight:600;">${p.engagement}%</td>
      </tr>`;
    }).join('');

    ga4Section = `
    <div class="section-header" style="margin-top:8px;">
      <div class="section-title">Website Analytics</div>
      <span style="font-size:11px;color:#10B981;font-weight:600;display:flex;align-items:center;gap:5px;"><span class="live-dot"></span> Live · Google Analytics 4</span>
    </div>

    <div class="insights-strip" style="margin-bottom:16px;">
      <div class="insight-tile">
        <div class="insight-val" data-count="${k.users || 0}">${k.users || 0}</div>
        <div class="insight-lbl">Active Users</div>
      </div>
      <div class="insight-tile">
        <div class="insight-val" data-count="${k.sessions || 0}">${k.sessions || 0}</div>
        <div class="insight-lbl">Sessions</div>
      </div>
      <div class="insight-tile">
        <div class="insight-val" data-count="${k.views || 0}">${k.views || 0}</div>
        <div class="insight-lbl">Page Views</div>
      </div>
      <div class="insight-tile">
        <div class="insight-val" data-count="${k.engagement || 0}">${k.engagement || 0}%</div>
        <div class="insight-lbl">Engagement Rate</div>
      </div>
    </div>

    <div class="charts-grid-2" style="margin-bottom:16px;">
      <div class="chart-card">
        <div class="chart-card-title">Users &amp; Sessions — 30 Days</div>
        <div class="chart-card-sub">Active users vs. total sessions over time</div>
        <div style="position:relative;height:220px;"><canvas id="ga4TimelineChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title">Device Breakdown</div>
        <div class="chart-card-sub">Sessions by device category</div>
        <div style="position:relative;height:220px;"><canvas id="ga4DeviceChart"></canvas></div>
      </div>
    </div>
    <div class="charts-grid-2" style="margin-bottom:16px;">
      <div class="chart-card">
        <div class="chart-card-title">Traffic Channels</div>
        <div class="chart-card-sub">Sessions by acquisition channel</div>
        <div style="position:relative;height:${Math.max(180, (ga4Data.sources||[]).length * 36)}px;"><canvas id="ga4SourcesChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title">Top Cities</div>
        <div class="chart-card-sub">Active users by location</div>
        <div style="position:relative;height:${Math.max(180, (ga4Data.cities||[]).length * 36)}px;"><canvas id="ga4CitiesChart"></canvas></div>
      </div>
    </div>

    <div class="chart-card" style="margin-bottom:24px;">
      <div class="chart-card-title">Top Pages</div>
      <div class="chart-card-sub">Most viewed pages — last 30 days</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid rgba(226,232,240,.8);">
            <th style="text-align:left;padding:6px 10px;font-size:11px;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:.4px;">Page</th>
            <th style="text-align:left;padding:6px 10px;font-size:11px;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:.4px;">Views</th>
            <th style="text-align:right;padding:6px 10px;font-size:11px;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:.4px;">Engaged</th>
          </tr>
        </thead>
        <tbody>${pagesRows}</tbody>
      </table>
    </div>`;
  } else if (ga4Data.configured && ga4Data.error) {
    ga4Section = `<div class="ga4-error-notice">GA4 connection error: ${ga4Data.error}</div>`;
  }

  // Looker Studio embed — kept as fallback when GA4 API isn't connected
  const gaEmbed = (!ga4Data.configured || ga4Data.error) && gaData.configured ? `
    <div class="section-header" style="margin-top:8px;"><div class="section-title">Website Analytics</div></div>
    <div class="analytics-embed-card">
      <div class="analytics-embed-bar">
        <img src="simtura-logo.png" class="analytics-embed-logo" alt="Simtura">
        <div style="margin-left:4px;">
          <div class="analytics-embed-title">Simtura.ai — Website Analytics</div>
          <div class="analytics-embed-sub">Google Analytics 4 via Looker Studio</div>
        </div>
        <div class="analytics-powered"><span class="live-dot"></span>&nbsp;Live</div>
      </div>
      <div style="height:calc(100vh - 390px);min-height:420px;">
        <iframe src="${gaData.embedUrl}" style="width:100%;height:100%;border:none;" allowfullscreen
          sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox">
        </iframe>
      </div>
    </div>` : '';

  document.getElementById('content').innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card blue">
        <span class="kpi-icon">📧</span>
        <div class="kpi-value" data-count="${emailsSent}">0</div>
        <div class="kpi-label">Total Emails Sent</div>
        <span class="kpi-sub">${totalProspects} prospects in pipeline</span>
      </div>
      <div class="kpi-card green">
        <span class="kpi-icon">💬</span>
        <div class="kpi-value" data-count="${replyRate}">0.0</div>
        <div class="kpi-label">Reply Rate %</div>
        <span class="kpi-sub">${repliesCount} total replies received</span>
      </div>
      <div class="kpi-card amber">
        <span class="kpi-icon">📅</span>
        <div class="kpi-value" data-count="${booked}">0</div>
        <div class="kpi-label">Demos Booked</div>
        <span class="kpi-sub">${bookingRate}% booking conversion</span>
      </div>
      <div class="kpi-card purple">
        <span class="kpi-icon">👥</span>
        <div class="kpi-value" data-count="${totalProspects}">0</div>
        <div class="kpi-label">Total Prospects</div>
        <span class="kpi-sub">across all pipeline stages</span>
      </div>
    </div>

    <div class="section-header"><div class="section-title">Outreach Performance</div></div>

    <div class="insights-strip">
      <div class="insight-tile">
        <div class="insight-val">${(emailsSent/30).toFixed(1)}</div>
        <div class="insight-lbl">Avg emails / day</div>
      </div>
      <div class="insight-tile">
        <div class="insight-val">${activeDays}</div>
        <div class="insight-lbl">Active send days</div>
      </div>
      <div class="insight-tile">
        <div class="insight-val">${bestDayName}</div>
        <div class="insight-lbl">Top send day</div>
      </div>
      <div class="insight-tile">
        <div class="insight-val">${contactedPct}%</div>
        <div class="insight-lbl">Prospects contacted</div>
      </div>
    </div>

    <div class="chart-card" style="margin-bottom:16px;">
      <div class="chart-card-title">Outreach Growth — Cumulative</div>
      <div class="chart-card-sub">Total emails sent over the last 30 days</div>
      <div style="position:relative;height:160px;"><canvas id="cumulativeChart"></canvas></div>
    </div>

    <div class="charts-grid-2" style="margin-bottom:16px;">
      <div class="chart-card">
        <div class="chart-card-title">Email Activity — Last 30 Days</div>
        <div class="chart-card-sub">Emails sent vs. replies received</div>
        <div style="position:relative;height:200px;"><canvas id="emailTimelineChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title">Pipeline Breakdown</div>
        <div class="chart-card-sub">Status distribution across ${totalProspects} prospects</div>
        <div style="position:relative;height:200px;"><canvas id="pipelineDonutChart"></canvas></div>
      </div>
    </div>
    <div class="charts-grid-2" style="margin-bottom:16px;">
      <div class="chart-card">
        <div class="chart-card-title">Conversion Funnel</div>
        <div class="chart-card-sub">Prospects at each pipeline stage</div>
        <div style="position:relative;height:180px;"><canvas id="funnelChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title">Sequence Step Breakdown</div>
        <div class="chart-card-sub">Emails sent per sequence step</div>
        <div style="position:relative;height:180px;"><canvas id="stepChart"></canvas></div>
      </div>
    </div>
    <div class="charts-grid-2" style="margin-bottom:24px;">
      <div class="chart-card">
        <div class="chart-card-title">Best Days to Send</div>
        <div class="chart-card-sub">Email volume by day of week</div>
        <div style="position:relative;height:180px;"><canvas id="dowChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title">Reply Rate by Sequence Step</div>
        <div class="chart-card-sub">Emails sent vs. reply rate per step</div>
        <div style="position:relative;height:180px;"><canvas id="replyRateStepChart"></canvas></div>
      </div>
    </div>

    ${purchaseSection}
    ${buildSignupsSection(signupData)}
    ${ga4Section}
    ${gaEmbed}`;

  animateCounters();
  // Use setTimeout instead of rAF — gives the browser time to fully lay out
  // the canvas containers before Chart.js measures their dimensions
  setTimeout(() => {
    try {
      const testEl = document.getElementById('emailTimelineChart');
      console.log('[Charts] Chart.js available:', typeof Chart);
      console.log('[Charts] emailTimelineChart el:', testEl, 'parent h:', testEl?.parentElement?.offsetHeight);
      const outreachCharts = initAnalyticsCharts(days, emailsByDay, repliesByDay, pipelineKeys, pipelineValues, pipelineColors, stepCounts, pipeline, totalProspects, cumulativeEmails, dayOfWeekCounts, replyRateByStep);
      const ga4Charts      = initGA4Charts(ga4Data);

      // Purchase attempts chart
      const pcCtx = document.getElementById('purchaseChart')?.getContext('2d');
      const purchaseCharts = [];
      if (pcCtx) {
        const gPc = pcCtx.createLinearGradient(0, 0, 0, 160);
        gPc.addColorStop(0, 'rgba(139,92,246,.4)'); gPc.addColorStop(1, 'rgba(139,92,246,.02)');
        purchaseCharts.push(new Chart(pcCtx, {
          type: 'bar',
          data: {
            labels: purchaseDays.map(d => { const dt = new Date(d+'T12:00:00'); return `${dt.getMonth()+1}/${dt.getDate()}`; }),
            datasets: [{ data: purchaseDays.map(d => purchaseByDay[d] || 0), backgroundColor: gPc, borderRadius: 6, borderSkipped: false }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(11,23,58,.88)', padding: 12, cornerRadius: 10, callbacks: { label: ctx => ` ${ctx.raw} attempt${ctx.raw !== 1 ? 's' : ''}` } } },
            scales: {
              x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 }, color: '#CBD5E1' } },
              y: { grid: { color: 'rgba(0,0,0,.04)' }, border: { display: false }, ticks: { font: { size: 10 }, color: '#CBD5E1', precision: 0 }, beginAtZero: true },
            },
          }
        }));
      }

      // Signups chart
      const signupsCharts = [];
      const signupCtx = document.getElementById('signupsChart')?.getContext('2d');
      if (signupCtx && signupData?.configured && !signupData?.error) {
        const signupDays   = getLast30Days();
        const dailyMap     = {};
        (signupData.daily || []).forEach(r => { dailyMap[r.day] = r.count; });
        const gSu = signupCtx.createLinearGradient(0, 0, 0, 160);
        gSu.addColorStop(0, 'rgba(16,185,129,.35)'); gSu.addColorStop(1, 'rgba(16,185,129,.02)');
        signupsCharts.push(new Chart(signupCtx, {
          type: 'bar',
          data: {
            labels: signupDays.map(d => { const dt = new Date(d + 'T12:00:00'); return `${dt.getMonth()+1}/${dt.getDate()}`; }),
            datasets: [{ data: signupDays.map(d => dailyMap[d] || 0), backgroundColor: gSu, borderRadius: 5, borderSkipped: false }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(11,23,58,.88)', padding: 12, cornerRadius: 10, callbacks: { label: ctx => ` ${ctx.raw} signup${ctx.raw !== 1 ? 's' : ''}` } } },
            scales: {
              x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 }, color: '#CBD5E1' } },
              y: { grid: { color: 'rgba(0,0,0,.04)' }, border: { display: false }, ticks: { font: { size: 10 }, color: '#CBD5E1', precision: 0 }, beginAtZero: true },
            },
          },
        }));
      }

      _analyticsCharts = [...outreachCharts, ...ga4Charts, ...purchaseCharts, ...signupsCharts];
      console.log('[Charts] created:', _analyticsCharts.length, 'charts');
    } catch (e) {
      console.error('[Charts] init error:', e);
    }
  }, 120);
}

// ── View: Revenue ─────────────────────────────────────────────────────────────

async function renderRevenue() {
  document.getElementById('content').innerHTML = `<div class="loading-state"><div class="spinner"></div> Fetching revenue data…</div>`;

  let data;
  try { data = await fetch('/api/revenue/summary').then(r => r.json()); }
  catch { data = { configured: false }; }

  if (!data.configured) {
    document.getElementById('content').innerHTML = `
      <div class="card" style="max-width:480px;">
        <div class="card-body" style="text-align:center;padding:48px 32px;">
          <div style="font-size:38px;margin-bottom:14px;">💳</div>
          <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px;">Connect Stripe to see revenue</div>
          <div style="font-size:13.5px;color:var(--text-3);line-height:1.6;margin-bottom:20px;">Add your Stripe secret key to unlock MRR, subscriber counts, and transaction history.</div>
          <div style="background:var(--surface-alt);border-radius:8px;padding:14px;text-align:left;font-size:12.5px;color:var(--text-2);">
            <b>To enable:</b><br>
            1. Go to Render → Environment<br>
            2. Add <code>STRIPE_SECRET_KEY</code> = your Stripe secret key (starts with <code>sk_</code>)<br>
            3. Redeploy — this page will show live data
          </div>
        </div>
      </div>`;
    return;
  }

  const chargesHTML = (data.recentCharges || []).map(c => `
    <tr>
      <td>${c.date}</td>
      <td>${c.description}</td>
      <td><b>$${c.amount.toFixed(2)}</b> ${c.currency}</td>
      <td><span class="badge ${c.status === 'succeeded' ? 'badge-green' : 'badge-red'}">${c.status}</span></td>
    </tr>`).join('');

  document.getElementById('content').innerHTML = `
    <div class="revenue-grid">
      <div class="stat-card">
        <div class="stat-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v7M6 6.5c0-1.1.9-2 2-2s2 .9 2 2-2 2-2 2-2 .9-2 2 .9 2 2 2 2-.9 2-2"/></svg></div>
        <div class="stat-value">$${data.mrr.toLocaleString()}</div>
        <div class="stat-label">Monthly Recurring Revenue</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="7" r="4"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5"/></svg></div>
        <div class="stat-value">${data.activeSubscriptions}</div>
        <div class="stat-label">Active Subscriptions</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h12M4 8h8M6 13h4"/></svg></div>
        <div class="stat-value">${data.totalCustomers}</div>
        <div class="stat-label">Total Customers</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Recent Transactions</span></div>
      <div class="card-body" style="padding:0">
        <table>
          <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>${chargesHTML || '<tr><td colspan="4" style="text-align:center;color:var(--text-3);padding:24px;">No transactions yet</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

// ── System status badge ───────────────────────────────────────────────────────

async function updateSystemStatus() {
  try {
    const replies    = await api('/overview');
    const openCount  = replies.openReplies || 0;
    const replyBadge = document.getElementById('replyBadge');

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

document.addEventListener('DOMContentLoaded', async () => {
  // Load logged-in user into sidebar
  try {
    const res = await fetch('/auth/me');
    if (res.ok) {
      const me = await res.json();
      if (me?.email) {
        document.getElementById('userEmail').textContent = me.email;
        document.getElementById('userAvatar').textContent = me.email[0].toUpperCase();
      }
    }
  } catch { /* ignore */ }

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
