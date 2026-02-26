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

  // Sort: top-level first, then group children under their parents
  const topLevel = tasks.filter(t => !t.parentId);
  const childMap = {}; // parentId -> [child tasks]
  tasks.forEach(t => {
    if (t.parentId) {
      if (!childMap[t.parentId]) childMap[t.parentId] = [];
      childMap[t.parentId].push(t);
    }
  });

  // Build ordered list: parent, then its children, then next parent, etc.
  const ordered = [];
  topLevel.forEach(t => {
    ordered.push(t);
    if (childMap[t.id]) {
      childMap[t.id].forEach(c => ordered.push(c));
    }
  });

  ordered.forEach(task => {
    const li = document.createElement('li');
    const hasChildren = store.isParent(task.id);
    const isChild = !!task.parentId;

    li.className = 'task-card' +
      (hasChildren ? ' parent-task' : '') +
      (isChild ? ' child-task' : '');

    if (hasChildren) {
      // Parent task — show aggregated duration, no timer buttons
      const totalMs = store.getParentTotalMs(task.id);
      const childCount = store.getChildren(task.id).length;

      li.innerHTML = `
        <div class="task-info" data-open-task="${task.id}" title="Click to open details">
          <div class="task-name">${esc(task.title)}</div>
          <div class="task-meta">
            <span class="child-count-badge">${childCount} subtask${childCount !== 1 ? 's' : ''}</span>
            · Total: ${formatDuration(totalMs)}
          </div>
        </div>
        <div class="task-timer">
          <span class="timer-display parent-duration">${formatTime(totalMs)}</span>
        </div>
        <button class="task-delete-btn" data-delete-task="${task.id}" title="Delete task">✕</button>
      `;
    } else {
      // Normal or child task — standard timer controls
      const entries = store.getTimeEntries(task.id);
      const totalMs = entries.reduce((sum, e) => sum + store.getElapsedMs(e), 0);

      const isActive = activeEntry && activeEntry.taskId === task.id;
      const isPaused = isActive && activeEntry.isPaused;
      const timerClass = isActive ? (isPaused ? 'paused' : 'running') : '';
      const displayMs = isActive ? store.getElapsedMs(activeEntry) : totalMs;

      li.innerHTML = `
        ${isChild ? '<span class="child-connector">└</span>' : ''}
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
    }
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

  // ---- Hierarchy ----
  const hasChildren = store.isParent(taskId);
  const select = $('#task-parent-select');
  const childrenList = $('#task-children-list');

  // Parent selector — hidden if this task already has children (it's a parent)
  const hierarchyField = select.closest('.hierarchy-field');
  if (hasChildren) {
    hierarchyField.classList.add('hidden');
  } else {
    hierarchyField.classList.remove('hidden');
    const eligible = store.getEligibleParents(taskId);
    select.innerHTML = '<option value="">— None (top-level) —</option>';
    eligible.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.title;
      if (task.parentId === p.id) opt.selected = true;
      select.appendChild(opt);
    });
  }

  // Children list
  if (hasChildren) {
    childrenList.classList.remove('hidden');
    const children = store.getChildren(taskId);
    childrenList.innerHTML = `
      <div class="children-header">Subtasks (${children.length})</div>
      ${children.map(c => `
        <div class="child-item" data-open-task="${c.id}">
          <span class="child-connector-sm">└</span>
          <span class="child-item-name">${esc(c.title)}</span>
        </div>
      `).join('')}
    `;
    // Wire clicks on children
    childrenList.querySelectorAll('[data-open-task]').forEach(el =>
      el.addEventListener('click', () => emit('openTaskDetail', el.dataset.openTask)));
  } else {
    childrenList.classList.add('hidden');
    childrenList.innerHTML = '';
  }

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

// ---- Bucket Board View ----

export function showBoardView(projectId) {
  const project = store.getProject(projectId);
  if (!project) return;
  showView('view-board');
  $('#board-project-name').textContent = project.name;
  $('#board-project-color').style.background = project.color;
}

export function renderBucketBoard(projectId, activeEntry) {
  const container = $('#board-columns');
  const noBuckets = $('#no-buckets');
  const buckets = store.getBuckets(projectId);
  const allTasks = store.getTasks(projectId);

  container.innerHTML = '';

  // Build columns: one per bucket + "Unbucketed" column
  const columns = [];

  // Add each bucket as a column
  buckets.forEach(bucket => {
    const tasks = allTasks.filter(t => t.bucketId === bucket.id);
    columns.push({ id: bucket.id, name: bucket.name, tasks, isBucket: true });
  });

  // Unbucketed column (tasks without a bucketId)
  const unbucketed = allTasks.filter(t => !t.bucketId);
  columns.unshift({ id: '__unbucketed__', name: 'Unbucketed', tasks: unbucketed, isBucket: false });

  if (buckets.length === 0 && unbucketed.length === 0) {
    noBuckets.classList.remove('hidden');
    return;
  }
  noBuckets.classList.add('hidden');

  columns.forEach(col => {
    const colEl = document.createElement('div');
    colEl.className = 'board-column';
    colEl.dataset.bucketId = col.id;

    // Drop zone
    colEl.addEventListener('dragover', e => {
      e.preventDefault();
      colEl.classList.add('drag-over');
    });
    colEl.addEventListener('dragleave', () => {
      colEl.classList.remove('drag-over');
    });
    colEl.addEventListener('drop', e => {
      e.preventDefault();
      colEl.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      if (taskId) {
        const bucketId = col.id === '__unbucketed__' ? null : col.id;
        store.setTaskBucket(taskId, bucketId);
        emit('boardRefresh');
      }
    });

    // Column header
    const header = document.createElement('div');
    header.className = 'board-column-header';

    if (col.isBucket) {
      header.innerHTML = `
        <span class="board-column-title" title="Click to rename">${esc(col.name)}</span>
        <span class="board-column-count">${col.tasks.length}</span>
        <div class="board-column-actions">
          <button class="board-col-btn" data-rename-bucket="${col.id}" title="Rename">✏️</button>
          <button class="board-col-btn board-col-delete" data-delete-bucket="${col.id}" title="Delete bucket">✕</button>
        </div>
      `;
    } else {
      header.innerHTML = `
        <span class="board-column-title unbucketed-title">${esc(col.name)}</span>
        <span class="board-column-count">${col.tasks.length}</span>
      `;
    }
    colEl.appendChild(header);

    // Task cards
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'board-cards';

    col.tasks.forEach(task => {
      const hasChildren = store.isParent(task.id);
      const isChild = !!task.parentId;
      const card = document.createElement('div');
      card.className = 'board-card' + (hasChildren ? ' parent-task' : '') + (isChild ? ' child-task' : '');
      card.draggable = true;
      card.dataset.taskId = task.id;

      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', task.id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });

      if (hasChildren) {
        const totalMs = store.getParentTotalMs(task.id);
        const childCount = store.getChildren(task.id).length;
        card.innerHTML = `
          <div class="board-card-info" data-open-task="${task.id}" title="Click to open details">
            <div class="board-card-name">${esc(task.title)}</div>
            <div class="board-card-meta">
              <span class="child-count-badge">${childCount} subtask${childCount !== 1 ? 's' : ''}</span>
              · ${formatDuration(totalMs)}
            </div>
          </div>
        `;
      } else {
        const entries = store.getTimeEntries(task.id);
        const totalMs = entries.reduce((sum, e) => sum + store.getElapsedMs(e), 0);
        const isActive = activeEntry && activeEntry.taskId === task.id;
        const isPaused = isActive && activeEntry.isPaused;
        const timerClass = isActive ? (isPaused ? 'paused' : 'running') : '';
        const displayMs = isActive ? store.getElapsedMs(activeEntry) : totalMs;

        card.innerHTML = `
          <div class="board-card-info" data-open-task="${task.id}" title="Click to open details">
            <div class="board-card-name">${isChild ? '<span class="child-connector">└</span> ' : ''}${esc(task.title)}</div>
            <div class="board-card-meta">${formatDuration(totalMs)}</div>
          </div>
          <div class="board-card-timer">
            <span class="timer-display ${timerClass}" data-task-id="${task.id}">${formatTime(displayMs)}</span>
            ${timerButtons(task.id, isActive, isPaused, activeEntry)}
          </div>
        `;
      }

      cardsContainer.appendChild(card);
    });

    colEl.appendChild(cardsContainer);

    // Add task input at bottom
    const addRow = document.createElement('div');
    addRow.className = 'board-add-task';
    addRow.innerHTML = `
      <input type="text" class="board-add-task-input" placeholder="＋ Add a task…" maxlength="100" data-bucket-id="${col.id}" />
    `;
    colEl.appendChild(addRow);

    container.appendChild(colEl);
  });

  // Wire up event listeners on new cards
  container.querySelectorAll('[data-start]').forEach(btn =>
    btn.addEventListener('click', () => emit('startTimer', btn.dataset.start)));
  container.querySelectorAll('[data-pause]').forEach(btn =>
    btn.addEventListener('click', () => emit('pauseTimer', btn.dataset.pause)));
  container.querySelectorAll('[data-resume]').forEach(btn =>
    btn.addEventListener('click', () => emit('resumeTimer', btn.dataset.resume)));
  container.querySelectorAll('[data-stop]').forEach(btn =>
    btn.addEventListener('click', () => emit('stopTimer', btn.dataset.stop)));
  container.querySelectorAll('[data-open-task]').forEach(el =>
    el.addEventListener('click', () => emit('openTaskDetail', el.dataset.openTask)));
  container.querySelectorAll('[data-rename-bucket]').forEach(btn =>
    btn.addEventListener('click', () => emit('renameBucket', btn.dataset.renameBucket)));
  container.querySelectorAll('[data-delete-bucket]').forEach(btn =>
    btn.addEventListener('click', () => emit('deleteBucket', btn.dataset.deleteBucket)));
  container.querySelectorAll('.board-add-task-input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const title = input.value.trim();
        if (title) {
          const bucketId = input.dataset.bucketId === '__unbucketed__' ? null : input.dataset.bucketId;
          emit('addTaskToBoard', { projectId, title, bucketId });
          input.value = '';
        }
      }
    });
  });
}

// ---- AI Modal ----

export function openAiModal(selectedProjectId) {
  const modal = $('#ai-modal');
  const select = $('#ai-project-select');
  const projects = store.getProjects();

  // Populate project dropdown
  select.innerHTML = projects.map(p =>
    `<option value="${p.id}" ${p.id === selectedProjectId ? 'selected' : ''}>${esc(p.name)}</option>`
  ).join('');

  // Reset to input phase
  $('#ai-phase-input').classList.remove('hidden');
  $('#ai-phase-review').classList.add('hidden');
  $('#ai-scenario-input').value = '';
  $('#ai-error').classList.add('hidden');
  $('#ai-generate-text').classList.remove('hidden');
  $('#ai-generate-spinner').classList.add('hidden');
  $('#ai-generate-btn').disabled = false;

  modal.classList.remove('hidden');
  $('#ai-scenario-input').focus();
}

export function renderAiReviewList(tasks) {
  const list = $('#ai-task-list');
  list.innerHTML = tasks.map((title, i) => `
        <div class="ai-task-item" data-index="${i}">
            <span class="ai-task-number">${i + 1}</span>
            <input type="text" class="ai-task-input" value="${esc(title)}" maxlength="100" />
            <button class="ai-task-delete" title="Remove task">✕</button>
        </div>
    `).join('');
}

export function closeAiModal() {
  $('#ai-modal').classList.add('hidden');
}

export function showAiError(msg) {
  const el = $('#ai-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

export function setAiLoading(loading) {
  $('#ai-generate-text').classList.toggle('hidden', loading);
  $('#ai-generate-spinner').classList.toggle('hidden', !loading);
  $('#ai-generate-btn').disabled = loading;
  if (loading) $('#ai-error').classList.add('hidden');
}

export function showAiReviewPhase() {
  $('#ai-phase-input').classList.add('hidden');
  $('#ai-phase-review').classList.remove('hidden');
}

export function showAiInputPhase() {
  $('#ai-phase-review').classList.add('hidden');
  $('#ai-phase-input').classList.remove('hidden');
}
