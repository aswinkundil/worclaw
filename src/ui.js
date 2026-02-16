// ===== ui.js — DOM rendering =====

import * as store from './store.js';
import { formatTime, formatDuration } from './timer.js';

// ---- Helpers ----
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function showView(id) {
  $$('.view').forEach(v => v.classList.remove('active'));
  const el = $(`#${id}`);
  if (el) el.classList.add('active');
}

// ---- Event bus (very small) ----
const bus = {};
export function on(event, fn) { (bus[event] ||= []).push(fn); }
export function emit(event, ...args) { (bus[event] || []).forEach(fn => fn(...args)); }

// ---- Projects ----

export function renderProjects(selectedId) {
  const list = $('#project-list');
  const projects = store.getProjects();
  list.innerHTML = '';

  projects.forEach(p => {
    const li = document.createElement('li');
    li.className = `project-item${p.id === selectedId ? ' active' : ''}`;
    li.dataset.id = p.id;
    li.innerHTML = `
      <span class="project-dot" style="background:${p.color}"></span>
      <span class="project-item-name">${esc(p.name)}</span>
    `;
    li.addEventListener('click', () => emit('selectProject', p.id));
    list.appendChild(li);
  });
}

export function renderColorPicker(selectedColor) {
  const picker = $('#color-picker');
  picker.innerHTML = '';
  store.PROJECT_COLORS.forEach(c => {
    const swatch = document.createElement('div');
    swatch.className = `color-swatch${c === selectedColor ? ' selected' : ''}`;
    swatch.style.background = c;
    swatch.addEventListener('click', () => {
      picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
    });
    picker.appendChild(swatch);
  });
}

export function getSelectedColor() {
  const el = document.querySelector('.color-swatch.selected');
  return el ? el.style.background : store.PROJECT_COLORS[0];
}

// ---- Tasks ----

export function renderTasks(projectId, activeEntry) {
  const list = $('#task-list');
  const noTasks = $('#no-tasks');
  const tasks = store.getTasks(projectId);

  if (tasks.length === 0) {
    list.innerHTML = '';
    noTasks.classList.remove('hidden');
    return;
  }
  noTasks.classList.add('hidden');
  list.innerHTML = '';

  tasks.forEach(task => {
    const li = document.createElement('li');
    li.className = 'task-card';

    // total logged time for this task
    const entries = store.getTimeEntries(task.id);
    const totalMs = entries.reduce((sum, e) => sum + store.getElapsedMs(e), 0);

    // is this task's timer currently active?
    const isActive = activeEntry && activeEntry.taskId === task.id;
    const isPaused = isActive && activeEntry.isPaused;

    const timerClass = isActive ? (isPaused ? 'paused' : 'running') : '';

    // Show live elapsed for active, or total logged for stopped tasks
    let displayMs;
    if (isActive) {
      displayMs = store.getElapsedMs(activeEntry);
    } else {
      // Show total accumulated time — it never goes down
      displayMs = totalMs;
    }

    li.innerHTML = `
      <div class="task-info" data-open-task="${task.id}" title="Click to open details">
        <div class="task-name">${esc(task.title)}</div>
        <div class="task-meta">Total logged: ${formatDuration(totalMs)}</div>
      </div>
      <div class="task-timer">
        <span class="timer-display ${timerClass}" data-task-id="${task.id}">
          ${formatTime(displayMs)}
        </span>
        ${timerButtons(task.id, isActive, isPaused, activeEntry)}
      </div>
      <button class="task-delete-btn" data-delete-task="${task.id}" title="Delete task">✕</button>
    `;
    list.appendChild(li);
  });

  // wire up timer buttons
  list.querySelectorAll('[data-start]').forEach(btn =>
    btn.addEventListener('click', () => emit('startTimer', btn.dataset.start)));
  list.querySelectorAll('[data-pause]').forEach(btn =>
    btn.addEventListener('click', () => emit('pauseTimer', btn.dataset.pause)));
  list.querySelectorAll('[data-resume]').forEach(btn =>
    btn.addEventListener('click', () => emit('resumeTimer', btn.dataset.resume)));
  list.querySelectorAll('[data-stop]').forEach(btn =>
    btn.addEventListener('click', () => emit('stopTimer', btn.dataset.stop)));
  list.querySelectorAll('[data-delete-task]').forEach(btn =>
    btn.addEventListener('click', () => emit('deleteTask', btn.dataset.deleteTask)));
  list.querySelectorAll('[data-open-task]').forEach(el =>
    el.addEventListener('click', () => emit('openTaskDetail', el.dataset.openTask)));
}

function timerButtons(taskId, isActive, isPaused, activeEntry) {
  if (!isActive) {
    return `<button class="timer-btn start" data-start="${taskId}" title="Start">▶</button>`;
  }
  let html = '';
  if (isPaused) {
    html += `<button class="timer-btn start" data-resume="${activeEntry.id}" title="Resume">▶</button>`;
  } else {
    html += `<button class="timer-btn pause" data-pause="${activeEntry.id}" title="Pause">⏸</button>`;
  }
  html += `<button class="timer-btn stop" data-stop="${activeEntry.id}" title="Stop">⏹</button>`;
  return html;
}

/** Live-update just the timer display for the active task without re-rendering everything */
export function updateTimerDisplay(entry, elapsedMs) {
  const display = document.querySelector(`.timer-display[data-task-id="${entry.taskId}"]`);
  if (display) {
    display.textContent = formatTime(elapsedMs);
  }
  // Also update the banner timer
  const bannerTimer = $('#active-banner-timer');
  if (bannerTimer) {
    bannerTimer.textContent = formatTime(elapsedMs);
  }
}

// ---- Active Task Banner ----

export function renderActiveTaskBanner() {
  const banner = $('#active-task-banner');
  const activeEntry = store.getActiveEntry();

  if (!activeEntry) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  banner.classList.toggle('paused', activeEntry.isPaused);

  if (activeEntry.isBreak) {
    // Break entry
    $('#active-banner-task').textContent = activeEntry.breakLabel || 'Break';
    $('#active-banner-project').textContent = 'On break';
    banner.dataset.projectId = '';
  } else {
    // Work entry
    const task = store.getTask(activeEntry.taskId);
    const project = task ? store.getProject(task.projectId) : null;
    $('#active-banner-task').textContent = task?.title || 'Unknown task';
    $('#active-banner-project').textContent = project ? `Project: ${project.name}` : '';
    banner.dataset.projectId = task?.projectId || '';
  }

  $('#active-banner-timer').textContent = formatTime(store.getElapsedMs(activeEntry));

  // Show/hide pause vs resume
  const pauseBtn = $('#active-banner-pause');
  const resumeBtn = $('#active-banner-resume');
  if (activeEntry.isPaused) {
    pauseBtn.classList.add('hidden');
    resumeBtn.classList.remove('hidden');
  } else {
    pauseBtn.classList.remove('hidden');
    resumeBtn.classList.add('hidden');
  }

  banner.dataset.entryId = activeEntry.id;
}

// ---- Daily View ----

export function renderDailyView(dateStr, targetHours) {
  showView('view-daily');
  const container = $('#daily-entries');
  const totalEl = $('#daily-total');
  const progressEl = $('#daily-progress');
  const noDaily = $('#no-daily');
  const allEntries = store.getEntriesForDate(dateStr);

  const workEntries = allEntries.filter(e => !e.isBreak);
  const breakEntries = allEntries.filter(e => e.isBreak);

  if (allEntries.length === 0) {
    container.innerHTML = '';
    totalEl.innerHTML = '';
    progressEl.innerHTML = '';
    noDaily.classList.remove('hidden');
    return;
  }
  noDaily.classList.add('hidden');

  let workMs = 0;
  let breakMs = 0;
  container.innerHTML = '';

  // Render work entries
  workEntries.forEach(e => {
    const task = store.getTask(e.taskId);
    const project = task ? store.getProject(task.projectId) : null;
    const ms = store.getElapsedMs(e);
    workMs += ms;

    const startStr = new Date(e.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endStr = e.endTime ? new Date(e.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now';

    const comments = task ? store.getComments(task.id) : [];
    const attachments = task ? store.getAttachments(task.id) : [];
    const badges = [];
    if (comments.length > 0) badges.push(`<span class="daily-badge" title="${comments.length} comment(s)">💬 ${comments.length}</span>`);
    if (attachments.length > 0) badges.push(`<span class="daily-badge" title="${attachments.length} file(s)">📎 ${attachments.length}</span>`);

    const div = document.createElement('div');
    div.className = 'daily-entry';

    // Main row
    const row = document.createElement('div');
    row.className = 'daily-entry-row';
    row.innerHTML = `
      <div class="daily-entry-project">
        <span class="project-dot" style="background:${project?.color || '#888'}"></span>
        <span>${esc(project?.name || 'Unknown')}</span>
      </div>
      <div class="daily-entry-task">${esc(task?.title || 'Unknown')} ${badges.join(' ')}</div>
      <div class="daily-entry-time">${startStr} – ${endStr}</div>
      <div class="daily-entry-duration">${formatDuration(ms)}</div>
      <div class="daily-entry-actions">
        ${task ? `<button class="entry-action-btn" data-goto-task="${task.id}" data-goto-project="${task.projectId}" title="Go to task">→</button>` : ''}
        <button class="entry-action-btn" data-edit-entry="${e.id}" title="Edit time">✏️</button>
        <button class="entry-action-btn delete" data-delete-entry="${e.id}" title="Delete">🗑</button>
      </div>
    `;
    div.appendChild(row);

    // Expandable detail (comments + attachments)
    if (task && (comments.length > 0 || attachments.length > 0)) {
      const detail = document.createElement('div');
      detail.className = 'daily-entry-detail hidden';

      let detailHtml = '';
      if (comments.length > 0) {
        detailHtml += '<div class="daily-detail-section"><span class="daily-detail-label">💬 Comments</span>';
        comments.forEach(c => {
          const ts = new Date(c.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          detailHtml += `<div class="daily-comment"><span class="comment-text">${esc(c.text)}</span><span class="comment-time">${ts}</span></div>`;
        });
        detailHtml += '</div>';
      }
      if (attachments.length > 0) {
        detailHtml += '<div class="daily-detail-section"><span class="daily-detail-label">📎 Files</span>';
        attachments.forEach(a => {
          const isImage = a.mimeType && a.mimeType.startsWith('image/');
          detailHtml += `<div class="daily-attachment">${isImage ? `<img src="/api/files/${a.fileName}" class="attachment-thumb" />` : ''}<a href="/api/files/${a.fileName}" target="_blank" class="attachment-name">${esc(a.originalName)}</a></div>`;
        });
        detailHtml += '</div>';
      }
      detail.innerHTML = detailHtml;
      div.appendChild(detail);

      // Toggle expand on row click
      row.style.cursor = 'pointer';
      row.addEventListener('click', (evt) => {
        if (evt.target.closest('.entry-action-btn')) return;
        detail.classList.toggle('hidden');
        div.classList.toggle('expanded');
      });
    }

    container.appendChild(div);
  });

  // Render break entries
  if (breakEntries.length > 0) {
    const breakHeader = document.createElement('div');
    breakHeader.className = 'daily-break-header';
    breakHeader.textContent = 'Breaks';
    container.appendChild(breakHeader);

    breakEntries.forEach(e => {
      const ms = store.getElapsedMs(e);
      breakMs += ms;

      const startStr = new Date(e.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const endStr = e.endTime ? new Date(e.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now';

      const div = document.createElement('div');
      div.className = 'daily-entry daily-entry-break';
      div.innerHTML = `
          <div class="daily-entry-project">
            <span class="project-dot" style="background:${e.breakColor || '#8b8da3'}"></span>
            <span>${esc(e.breakLabel || 'Break')}</span>
          </div>
          <div class="daily-entry-task"></div>
          <div class="daily-entry-time">${startStr} – ${endStr}</div>
          <div class="daily-entry-duration">${formatDuration(ms)}</div>
          <div class="daily-entry-actions">
            <button class="entry-action-btn" data-edit-entry="${e.id}" title="Edit">✏️</button>
            <button class="entry-action-btn delete" data-delete-entry="${e.id}" title="Delete">🗑</button>
          </div>
        `;
      container.appendChild(div);
    });
  }

  // Add entry button
  const addBtn = document.createElement('button');
  addBtn.className = 'btn-add-entry';
  addBtn.textContent = '＋ Add time entry';
  addBtn.addEventListener('click', () => emit('openAddEntry', dateStr));
  container.appendChild(addBtn);

  totalEl.innerHTML = `
    <span class="daily-total-label">Work: ${formatDuration(workMs)} · Breaks: ${formatDuration(breakMs)}</span>
    <span class="daily-total-value">${formatDuration(workMs + breakMs)}</span>
  `;

  // ---- Progress ring (work time only, breaks excluded) ----
  const target = (targetHours || 8.5);
  const targetMs = target * 3600000;
  const pct = Math.min(Math.round((workMs / targetMs) * 100), 100);
  const remainMs = Math.max(0, targetMs - workMs);

  const size = 120;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (pct / 100) * circumference;
  const ringColor = pct >= 100 ? '#22c55e' : pct >= 75 ? '#06b6d4' : '#8b5cf6';

  progressEl.innerHTML = `
    <div class="progress-ring-container">
      <svg class="progress-ring-svg" width="${size}" height="${size}">
        <circle class="progress-ring-bg" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}" />
        <circle class="progress-ring-fill" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}"
                stroke="${ringColor}"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${dashOffset}" />
      </svg>
      <div class="progress-center-text">
        <span class="progress-pct" style="color:${ringColor}">${pct}%</span>
        <span class="progress-pct-label">billable</span>
      </div>
    </div>
    <div class="progress-details">
      <div class="progress-stat">
        <span class="progress-stat-label">Billable Work</span>
        <span class="progress-stat-value">${formatDuration(workMs)}</span>
      </div>
      <div class="progress-stat">
        <span class="progress-stat-label">Breaks</span>
        <span class="progress-stat-value">${formatDuration(breakMs)}</span>
      </div>
      <div class="progress-stat">
        <span class="progress-stat-label">Target</span>
        <span class="progress-stat-value">${target}h</span>
      </div>
      <div class="progress-stat">
        <span class="progress-stat-label">Remaining</span>
        <span class="progress-stat-value">${pct >= 100 ? '✓ Done!' : formatDuration(remainMs)}</span>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width:${pct}%;background:${ringColor}"></div>
      </div>
    </div>
  `;
}

// ---- Workload View ----

export function renderWorkload(dateStr) {
  showView('view-workload');
  const chart = $('#workload-chart');
  const totalEl = $('#workload-total');
  const noWorkload = $('#no-workload');
  const data = store.getWorkloadForDate(dateStr);

  if (data.length === 0) {
    chart.innerHTML = '';
    totalEl.innerHTML = '';
    noWorkload.classList.remove('hidden');
    return;
  }
  noWorkload.classList.add('hidden');

  const maxMs = Math.max(...data.map(d => d.totalMs));
  let grandTotal = 0;
  chart.innerHTML = '';

  data.forEach(d => {
    grandTotal += d.totalMs;
    const pct = maxMs > 0 ? (d.totalMs / maxMs) * 100 : 0;
    const div = document.createElement('div');
    div.className = 'workload-bar-container';
    div.innerHTML = `
      <div class="workload-label">
        <span class="project-dot" style="background:${d.project.color}"></span>
        <span>${esc(d.project.name)}</span>
      </div>
      <div class="workload-bar-track">
        <div class="workload-bar-fill" style="width:${pct}%;background:${d.project.color}">
        </div>
      </div>
      <div class="workload-duration">${formatDuration(d.totalMs)}</div>
    `;
    chart.appendChild(div);
  });

  totalEl.innerHTML = `
    <span class="workload-total-label">Total Workload</span>
    <span class="workload-total-value">${formatDuration(grandTotal)}</span>
  `;
}

export function showTasksView(projectId) {
  const project = store.getProject(projectId);
  if (!project) return;
  showView('view-tasks');
  $('#current-project-name').textContent = project.name;
  $('#current-project-color').style.background = project.color;
}

export function showWelcome() {
  showView('view-welcome');
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function relativeTime(ts) {
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

// ---- Task Detail Panel ----

export function renderTaskDetail(taskId) {
  const panel = $('#task-detail');
  const task = store.getTask(taskId);
  if (!task) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  panel.dataset.taskId = taskId;

  $('#task-detail-title').value = task.title;

  renderComments(taskId);
  renderAttachments(taskId);
}

export function closeTaskDetail() {
  $('#task-detail').classList.add('hidden');
  $('#task-detail').dataset.taskId = '';
}

export function renderComments(taskId) {
  const list = $('#comments-list');
  const comments = store.getComments(taskId);
  if (comments.length === 0) {
    list.innerHTML = '<div class="empty-hint">No comments yet</div>';
    return;
  }

  list.innerHTML = '';
  comments.forEach(c => {
    const div = document.createElement('div');
    div.className = 'comment-item';
    const ts = new Date(c.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const edited = c.editedAt ? ' (edited)' : '';
    div.innerHTML = `
      <div class="comment-body">
        <span class="comment-text">${esc(c.text)}</span>
        <span class="comment-time">${ts}${edited}</span>
      </div>
      <div class="comment-actions">
        <button class="entry-action-btn" data-edit-comment="${c.id}" data-comment-text="${esc(c.text)}" title="Edit">✏️</button>
        <button class="entry-action-btn delete" data-delete-comment="${c.id}" title="Delete">🗑</button>
      </div>
    `;
    list.appendChild(div);
  });
}

export function renderAttachments(taskId) {
  const list = $('#attachments-list');
  const attachments = store.getAttachments(taskId);
  if (attachments.length === 0) {
    list.innerHTML = '<div class="empty-hint">No attachments yet</div>';
    return;
  }

  list.innerHTML = '';
  attachments.forEach(a => {
    const isImage = a.mimeType && a.mimeType.startsWith('image/');
    const sizeStr = a.size ? formatFileSize(a.size) : '';
    const ts = relativeTime(a.createdAt);
    const div = document.createElement('div');
    div.className = 'attachment-item';
    div.innerHTML = `
      ${isImage ? `<img src="/api/files/${a.fileName}" class="attachment-thumb" alt="${esc(a.originalName)}" />` : ''}
      <div class="attachment-info">
        <a href="/api/files/${a.fileName}" target="_blank" class="attachment-name">${esc(a.originalName)}</a>
        <span class="attachment-meta">${sizeStr} · ${ts}</span>
      </div>
      <button class="entry-action-btn delete" data-delete-attachment="${a.id}" data-file-name="${a.fileName}" title="Delete">🗑</button>
    `;
    list.appendChild(div);
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
