// ===== main.js — App entry point =====

import * as store from './store.js';
import * as ui from './ui.js';
import { startTick, stopTick, handlePause, handleResume, handleStop } from './timer.js';

// ---- State ----
let selectedProjectId = null;
let currentView = 'tasks'; // 'tasks' | 'board' | 'daily' | 'workload'

// ---- Helpers ----
function $(sel) { return document.querySelector(sel); }
function getTargetHours() { return parseFloat($('#target-hours').value) || 8.5; }

function refresh() {
    const activeEntry = store.getActiveEntry();
    ui.renderProjects(selectedProjectId);
    ui.renderActiveTaskBanner();
    if (selectedProjectId) {
        if (currentView === 'board') {
            ui.showBoardView(selectedProjectId);
            ui.renderBucketBoard(selectedProjectId, activeEntry);
        } else {
            ui.showTasksView(selectedProjectId);
            ui.renderTasks(selectedProjectId, activeEntry);
        }
    }
    // restart tick if there's an active timer
    if (activeEntry) {
        startTick((entry, ms) => ui.updateTimerDisplay(entry, ms));
    }
}

// ---- Init ----
async function init() {
    // Fetch data from server into the in-memory cache
    await store.initStore();

    // Color picker default
    ui.renderColorPicker(store.PROJECT_COLORS[0]);

    // Check for existing running timer on load
    const activeEntry = store.getActiveEntry();
    if (activeEntry) {
        const task = store.getTask(activeEntry.taskId);
        if (task) {
            selectedProjectId = task.projectId;
        }
        startTick((entry, ms) => ui.updateTimerDisplay(entry, ms));
    }

    // Render initial
    ui.renderProjects(selectedProjectId);
    ui.renderActiveTaskBanner();
    if (selectedProjectId) {
        ui.showTasksView(selectedProjectId);
        ui.renderTasks(selectedProjectId, activeEntry);
    } else {
        ui.showWelcome();
    }

    wireEvents();
}

function wireEvents() {
    // ---- New project form ----
    $('#btn-new-project').addEventListener('click', () => {
        $('#new-project-form').classList.toggle('hidden');
        const input = $('#input-project-name');
        input.value = '';
        input.focus();
    });

    $('#btn-cancel-project').addEventListener('click', () => {
        $('#new-project-form').classList.add('hidden');
    });

    $('#btn-save-project').addEventListener('click', saveProject);
    $('#input-project-name').addEventListener('keydown', e => {
        if (e.key === 'Enter') saveProject();
    });

    // ---- Select project ----
    ui.on('selectProject', id => {
        selectedProjectId = id;
        currentView = 'tasks';
        refresh();
    });

    // ---- Add task ----
    $('#btn-add-task').addEventListener('click', addTask);
    $('#input-task-title').addEventListener('keydown', e => {
        if (e.key === 'Enter') addTask();
    });

    // ---- Delete project ----
    $('#btn-delete-project').addEventListener('click', () => {
        if (selectedProjectId && confirm('Delete this project and all its tasks?')) {
            store.deleteProject(selectedProjectId);
            selectedProjectId = null;
            ui.showWelcome();
            ui.renderProjects(null);
            ui.renderActiveTaskBanner();
        }
    });

    // ---- Active task banner controls ----
    $('#active-banner-pause').addEventListener('click', () => {
        const banner = $('#active-task-banner');
        if (banner.dataset.entryId) {
            handlePause(banner.dataset.entryId);
            refresh();
        }
    });

    $('#active-banner-resume').addEventListener('click', () => {
        const banner = $('#active-task-banner');
        if (banner.dataset.entryId) {
            handleResume(banner.dataset.entryId);
            startTick((e, ms) => ui.updateTimerDisplay(e, ms));
            refresh();
        }
    });

    $('#active-banner-stop').addEventListener('click', () => {
        const banner = $('#active-task-banner');
        if (banner.dataset.entryId) {
            handleStop(banner.dataset.entryId);
            refresh();
        }
    });

    $('#active-banner-go').addEventListener('click', () => {
        const banner = $('#active-task-banner');
        const projectId = banner.dataset.projectId;
        if (projectId) {
            selectedProjectId = projectId;
            refresh();
        }
    });

    // ---- Timer events ----
    ui.on('startTimer', taskId => {
        // Block timer on parent tasks
        if (store.isParent(taskId)) return;
        store.startTimer(taskId);
        const entry = store.getActiveEntry();
        startTick((e, ms) => ui.updateTimerDisplay(e, ms));
        refresh();
    });

    ui.on('pauseTimer', entryId => {
        handlePause(entryId);
        refresh();
    });

    ui.on('resumeTimer', entryId => {
        handleResume(entryId);
        startTick((e, ms) => ui.updateTimerDisplay(e, ms));
        refresh();
    });

    ui.on('stopTimer', entryId => {
        handleStop(entryId);
        refresh();
    });

    ui.on('deleteTask', taskId => {
        const hasKids = store.isParent(taskId);
        const msg = hasKids
            ? 'Delete this task and all its subtasks, time entries, comments, and attachments?'
            : 'Delete this task and its time entries?';
        if (confirm(msg)) {
            // stop timer if running for this task or its children
            const active = store.getActiveEntry();
            if (active) {
                if (active.taskId === taskId) handleStop(active.id);
                if (hasKids) {
                    const children = store.getChildren(taskId);
                    if (children.some(c => c.id === active.taskId)) handleStop(active.id);
                }
            }
            store.deleteTask(taskId);
            ui.closeTaskDetail();
            refresh();
        }
    });

    // ---- Break buttons ----
    document.querySelectorAll('.btn-break').forEach(btn => {
        btn.addEventListener('click', () => {
            store.startBreak(btn.dataset.break);
            startTick((e, ms) => ui.updateTimerDisplay(e, ms));
            refresh();
        });
    });

    // ---- Daily view ----
    $('#btn-daily-view').addEventListener('click', () => {
        selectedProjectId = null;
        currentView = 'daily';
        ui.renderProjects(null);
        const today = ui.todayStr();
        $('#date-picker').value = today;
        ui.renderDailyView(today, getTargetHours());
    });

    $('#date-picker').addEventListener('change', e => {
        ui.renderDailyView(e.target.value, getTargetHours());
    });

    $('#target-hours').addEventListener('change', () => {
        const dateStr = $('#date-picker').value;
        if (dateStr) {
            ui.renderDailyView(dateStr, getTargetHours());
        }
    });

    // ---- Workload view ----
    $('#btn-workload').addEventListener('click', () => {
        selectedProjectId = null;
        currentView = 'workload';
        ui.renderProjects(null);
        const today = ui.todayStr();
        $('#workload-date-picker').value = today;
        ui.renderWorkload(today);
    });

    // ---- Board view ----
    $('#btn-board-view').addEventListener('click', () => {
        if (!selectedProjectId) {
            // Pick the first project if none selected
            const projects = store.getProjects();
            if (projects.length === 0) return;
            selectedProjectId = projects[0].id;
        }
        currentView = 'board';
        refresh();
    });

    $('#btn-add-bucket').addEventListener('click', () => {
        const name = prompt('Bucket name:');
        if (name && name.trim() && selectedProjectId) {
            store.addBucket(selectedProjectId, name.trim());
            refresh();
        }
    });

    $('#btn-back-to-list').addEventListener('click', () => {
        currentView = 'tasks';
        refresh();
    });

    ui.on('renameBucket', bucketId => {
        const bucket = store.getBuckets(selectedProjectId).find(b => b.id === bucketId);
        const name = prompt('New bucket name:', bucket?.name || '');
        if (name && name.trim()) {
            store.renameBucket(bucketId, name.trim());
            refresh();
        }
    });

    ui.on('deleteBucket', bucketId => {
        if (confirm('Delete this bucket? Tasks will be moved to Unbucketed.')) {
            store.deleteBucket(bucketId);
            refresh();
        }
    });

    ui.on('addTaskToBoard', ({ projectId, title, bucketId }) => {
        store.addTask(projectId, title, null, bucketId);
        refresh();
    });

    ui.on('boardRefresh', () => {
        refresh();
    });

    $('#workload-date-picker').addEventListener('change', e => {
        ui.renderWorkload(e.target.value);
    });

    // ---- Entry modal ----

    // Type toggle
    document.querySelectorAll('.entry-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.entry-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const isBreak = btn.dataset.type === 'break';
            $('#modal-work-fields').classList.toggle('hidden', isBreak);
            $('#modal-break-fields').classList.toggle('hidden', !isBreak);
        });
    });

    // Project change → populate tasks
    $('#modal-project').addEventListener('change', () => {
        populateModalTasks($('#modal-project').value);
    });

    // Cancel
    $('#modal-cancel').addEventListener('click', closeModal);
    $('#entry-modal').addEventListener('click', e => {
        if (e.target === $('#entry-modal')) closeModal();
    });

    // Save
    $('#modal-save').addEventListener('click', handleModalSave);

    // Delete
    $('#modal-delete').addEventListener('click', handleModalDelete);

    // Open add entry from daily view
    ui.on('openAddEntry', dateStr => openModal(null, dateStr));

    // ---- Task Detail Panel ----

    ui.on('openTaskDetail', taskId => {
        ui.renderTaskDetail(taskId);
    });

    $('#btn-close-detail').addEventListener('click', () => {
        ui.closeTaskDetail();
    });

    $('#btn-save-task-title').addEventListener('click', () => {
        const taskId = $('#task-detail').dataset.taskId;
        const newTitle = $('#task-detail-title').value.trim();
        if (taskId && newTitle) {
            store.renameTask(taskId, newTitle);
            refresh();
        }
    });

    // Parent selector in task detail
    $('#task-parent-select').addEventListener('change', (e) => {
        const taskId = $('#task-detail').dataset.taskId;
        if (!taskId) return;
        const parentId = e.target.value;
        if (parentId) {
            const ok = store.setParent(taskId, parentId);
            if (!ok) {
                alert('Cannot set this parent. A task that is already a child or has children cannot be nested further.');
                e.target.value = '';
            }
        } else {
            store.removeParent(taskId);
        }
        refresh();
        ui.renderTaskDetail(taskId);
    });

    $('#btn-delete-task-detail').addEventListener('click', () => {
        const taskId = $('#task-detail').dataset.taskId;
        const hasKids = taskId ? store.isParent(taskId) : false;
        const msg = hasKids
            ? 'Delete this task and all its subtasks, time entries, comments, and attachments?'
            : 'Delete this task and all its time entries, comments, and attachments?';
        if (taskId && confirm(msg)) {
            store.deleteTask(taskId);
            ui.closeTaskDetail();
            refresh();
        }
    });

    // ---- Comments ----
    $('#btn-add-comment').addEventListener('click', () => {
        const taskId = $('#task-detail').dataset.taskId;
        const input = $('#comment-input');
        const text = input.value.trim();
        if (taskId && text) {
            store.addComment(taskId, text);
            input.value = '';
            ui.renderComments(taskId);
        }
    });

    $('#comment-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            $('#btn-add-comment').click();
        }
    });

    // ---- Attachments ----
    $('#attachment-input').addEventListener('change', () => {
        const file = $('#attachment-input').files[0];
        if (file) {
            $('#attachment-file-name').textContent = file.name;
            $('#btn-upload-attachment').classList.remove('hidden');
        } else {
            $('#attachment-file-name').textContent = 'No file chosen';
            $('#btn-upload-attachment').classList.add('hidden');
        }
    });

    $('#btn-upload-attachment').addEventListener('click', async () => {
        const taskId = $('#task-detail').dataset.taskId;
        const file = $('#attachment-input').files[0];
        if (!taskId || !file) return;

        const btn = $('#btn-upload-attachment');
        btn.textContent = 'Uploading…';
        btn.disabled = true;

        try {
            const base64 = await fileToBase64(file);
            const res = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: file.name, data: base64 }),
            });
            const result = await res.json();

            store.addAttachment(taskId, {
                fileName: result.storedName,
                originalName: file.name,
                mimeType: file.type,
                size: result.size,
            });

            ui.renderAttachments(taskId);

            // Reset
            $('#attachment-input').value = '';
            $('#attachment-file-name').textContent = 'No file chosen';
            btn.classList.add('hidden');
        } catch (err) {
            alert('Upload failed: ' + err.message);
        } finally {
            btn.textContent = 'Upload';
            btn.disabled = false;
        }
    });

    // ---- Delegated click handlers ----
    document.addEventListener('click', e => {
        const editBtn = e.target.closest('[data-edit-entry]');
        const deleteBtn = e.target.closest('[data-delete-entry]');
        const editComment = e.target.closest('[data-edit-comment]');
        const deleteComment = e.target.closest('[data-delete-comment]');
        const deleteAttachment = e.target.closest('[data-delete-attachment]');

        if (editBtn) {
            openModal(editBtn.dataset.editEntry);
        }
        if (deleteBtn) {
            const entryId = deleteBtn.dataset.deleteEntry;
            if (confirm('Delete this time entry?')) {
                store.deleteEntry(entryId);
                refreshDailyView();
            }
        }
        const gotoBtn = e.target.closest('[data-goto-task]');
        if (gotoBtn) {
            const projectId = gotoBtn.dataset.gotoProject;
            const taskId = gotoBtn.dataset.gotoTask;
            selectedProjectId = projectId;
            ui.renderProjects(selectedProjectId);
            ui.showTasksView(selectedProjectId);
            ui.renderTasks(selectedProjectId, store.getActiveEntry());
            ui.renderTaskDetail(taskId);
        }
        if (editComment) {
            const commentId = editComment.dataset.editComment;
            const currentText = editComment.dataset.commentText;
            const newText = prompt('Edit comment:', currentText);
            if (newText !== null && newText.trim()) {
                store.updateComment(commentId, newText.trim());
                const taskId = $('#task-detail').dataset.taskId;
                if (taskId) ui.renderComments(taskId);
            }
        }
        if (deleteComment) {
            if (confirm('Delete this comment?')) {
                store.deleteComment(deleteComment.dataset.deleteComment);
                const taskId = $('#task-detail').dataset.taskId;
                if (taskId) ui.renderComments(taskId);
            }
        }
        if (deleteAttachment) {
            if (confirm('Delete this attachment?')) {
                const fileName = deleteAttachment.dataset.fileName;
                fetch(`/api/files/${fileName}`, { method: 'DELETE' }).catch(() => { });
                store.deleteAttachment(deleteAttachment.dataset.deleteAttachment);
                const taskId = $('#task-detail').dataset.taskId;
                if (taskId) ui.renderAttachments(taskId);
            }
        }
    });

    // ---- AI Task Generation ----

    let aiTasks = []; // in-memory list for review phase

    $('#btn-ai-generate').addEventListener('click', () => {
        if (selectedProjectId) {
            ui.openAiModal(selectedProjectId);
        }
    });

    // Cancel buttons
    $('#ai-cancel-input').addEventListener('click', () => ui.closeAiModal());
    $('#ai-cancel-review').addEventListener('click', () => ui.closeAiModal());
    $('#ai-modal').addEventListener('click', e => {
        if (e.target === $('#ai-modal')) ui.closeAiModal();
    });

    // Generate tasks
    $('#ai-generate-btn').addEventListener('click', async () => {
        const scenario = $('#ai-scenario-input').value.trim();
        if (!scenario) {
            ui.showAiError('Please describe a use case or scenario.');
            return;
        }

        ui.setAiLoading(true);

        try {
            const res = await fetch('/api/ai/generate-tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scenario }),
            });
            const data = await res.json();

            if (!res.ok) {
                ui.showAiError(data.error || 'Failed to generate tasks.');
                ui.setAiLoading(false);
                return;
            }

            aiTasks = data.tasks;
            ui.renderAiReviewList(aiTasks);
            ui.showAiReviewPhase();
        } catch (err) {
            ui.showAiError('Network error. Please check your connection and try again.');
        } finally {
            ui.setAiLoading(false);
        }
    });

    // Back to input phase
    $('#ai-back-btn').addEventListener('click', () => ui.showAiInputPhase());

    // Add a new task row in review
    $('#ai-add-task-btn').addEventListener('click', () => {
        aiTasks.push('');
        ui.renderAiReviewList(aiTasks);
        // Focus the newly added input
        const inputs = document.querySelectorAll('.ai-task-input');
        if (inputs.length) inputs[inputs.length - 1].focus();
    });

    // Delete and edit tasks in review (delegated)
    $('#ai-task-list').addEventListener('click', e => {
        const deleteBtn = e.target.closest('.ai-task-delete');
        if (deleteBtn) {
            const item = deleteBtn.closest('.ai-task-item');
            const idx = parseInt(item.dataset.index);
            aiTasks.splice(idx, 1);
            ui.renderAiReviewList(aiTasks);
        }
    });

    $('#ai-task-list').addEventListener('input', e => {
        if (e.target.classList.contains('ai-task-input')) {
            const item = e.target.closest('.ai-task-item');
            const idx = parseInt(item.dataset.index);
            aiTasks[idx] = e.target.value;
        }
    });

    // Confirm and add tasks
    $('#ai-confirm-btn').addEventListener('click', () => {
        const projectId = $('#ai-project-select').value;
        const validTasks = aiTasks.map(t => t.trim()).filter(t => t.length > 0);

        if (validTasks.length === 0) {
            alert('No tasks to add. Please add at least one task.');
            return;
        }

        store.addTasksBulk(projectId, validTasks);
        ui.closeAiModal();

        // Navigate to the project
        selectedProjectId = projectId;
        refresh();
    });
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ---- Modal helpers ----

let editingEntryId = null;

function openModal(entryId, dateStr) {
    const modal = $('#entry-modal');
    editingEntryId = entryId || null;

    // Reset type toggle
    document.querySelectorAll('.entry-type-btn').forEach(b => b.classList.remove('active'));

    if (entryId) {
        // Edit mode
        const entry = store.getEntry(entryId);
        if (!entry) return;

        $('#modal-title').textContent = 'Edit Time Entry';
        $('#modal-delete').classList.remove('hidden');

        const isBreak = !!entry.isBreak;

        // Set type toggle
        document.querySelector(`.entry-type-btn[data-type="${isBreak ? 'break' : 'work'}"]`).classList.add('active');
        $('#modal-work-fields').classList.toggle('hidden', isBreak);
        $('#modal-break-fields').classList.toggle('hidden', !isBreak);

        // Date
        const d = new Date(entry.startTime);
        $('#modal-date').value = d.toISOString().slice(0, 10);

        // Times
        $('#modal-start').value = d.toTimeString().slice(0, 5);
        if (entry.endTime) {
            const ed = new Date(entry.endTime);
            $('#modal-end').value = ed.toTimeString().slice(0, 5);
        } else {
            $('#modal-end').value = '';
        }

        if (isBreak) {
            $('#modal-break-type').value = entry.breakTypeId || 'other';
        } else {
            populateModalProjects();
            const task = store.getTask(entry.taskId);
            if (task) {
                $('#modal-project').value = task.projectId;
                populateModalTasks(task.projectId);
                $('#modal-task').value = entry.taskId;
            }
        }
    } else {
        // Add mode
        $('#modal-title').textContent = 'Add Time Entry';
        $('#modal-delete').classList.add('hidden');
        document.querySelector('.entry-type-btn[data-type="work"]').classList.add('active');
        $('#modal-work-fields').classList.remove('hidden');
        $('#modal-break-fields').classList.add('hidden');

        // Defaults
        $('#modal-date').value = dateStr || ui.todayStr();
        $('#modal-start').value = '';
        $('#modal-end').value = '';
        $('#modal-break-type').value = 'lunch';

        populateModalProjects();
        const projects = store.getProjects();
        if (projects.length > 0) {
            populateModalTasks(projects[0].id);
        }
    }

    modal.classList.remove('hidden');
}

function closeModal() {
    $('#entry-modal').classList.add('hidden');
    editingEntryId = null;
}

function populateModalProjects() {
    const select = $('#modal-project');
    const projects = store.getProjects();
    select.innerHTML = projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

function populateModalTasks(projectId) {
    const select = $('#modal-task');
    const tasks = store.getTasks(projectId);
    select.innerHTML = tasks.map(t => `<option value="${t.id}">${t.title}</option>`).join('');
}

function handleModalSave() {
    const isBreak = document.querySelector('.entry-type-btn.active')?.dataset.type === 'break';
    const dateStr = $('#modal-date').value;
    const startTime = $('#modal-start').value;
    const endTime = $('#modal-end').value;

    if (!dateStr || !startTime || !endTime) {
        alert('Please fill in date, start time, and end time.');
        return;
    }

    const startMs = new Date(`${dateStr}T${startTime}`).getTime();
    const endMs = new Date(`${dateStr}T${endTime}`).getTime();

    if (endMs <= startMs) {
        alert('End time must be after start time.');
        return;
    }

    if (editingEntryId) {
        // Update existing
        const updates = { startTime: startMs, endTime: endMs, isBreak };
        if (isBreak) {
            updates.breakTypeId = $('#modal-break-type').value;
        } else {
            updates.taskId = $('#modal-task').value;
        }
        store.updateEntry(editingEntryId, updates);
    } else {
        // Add new
        store.addManualEntry({
            taskId: isBreak ? null : $('#modal-task').value,
            isBreak,
            breakTypeId: isBreak ? $('#modal-break-type').value : null,
            startTime: startMs,
            endTime: endMs,
        });
    }

    closeModal();
    refreshDailyView();
    refresh();
}

function handleModalDelete() {
    if (!editingEntryId) return;
    if (confirm('Delete this time entry?')) {
        store.deleteEntry(editingEntryId);
        closeModal();
        refreshDailyView();
        refresh();
    }
}

function refreshDailyView() {
    const dateStr = $('#date-picker').value;
    if (dateStr) {
        ui.renderDailyView(dateStr, getTargetHours());
    }
}

function saveProject() {
    const input = $('#input-project-name');
    const name = input.value.trim();
    if (!name) return;
    const color = ui.getSelectedColor();
    const project = store.addProject(name, color);
    input.value = '';
    $('#new-project-form').classList.add('hidden');
    selectedProjectId = project.id;
    refresh();
}

function addTask() {
    const input = $('#input-task-title');
    const title = input.value.trim();
    if (!title || !selectedProjectId) return;
    store.addTask(selectedProjectId, title);
    input.value = '';
    refresh();
}

// Boot
init();
