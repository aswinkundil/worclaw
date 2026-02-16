// ===== store.js — State management + SQLite API persistence =====

const API_URL = '/api/data';

const PROJECT_COLORS = [
    '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b',
    '#ef4444', '#ec4899', '#3b82f6', '#14b8a6',
    '#f97316', '#a855f7',
];

const BREAK_TYPES = [
    { id: 'lunch', label: '🍽 Lunch', color: '#f59e0b' },
    { id: 'tea', label: '☕ Tea', color: '#06b6d4' },
    { id: 'other', label: '💤 Break', color: '#8b8da3' },
];

// ---- In-memory cache ----
let cache = { projects: [], tasks: [], timeEntries: [], comments: [], attachments: [] };

function loadData() {
    return cache;
}

function saveData(data) {
    cache = data;
    // Fire-and-forget async persist to the server
    fetch(API_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }).catch(err => console.error('Failed to persist data:', err));
}

/** Must be called once at startup. Fetches data from the server into cache. */
export async function initStore() {
    try {
        const res = await fetch(API_URL);
        if (res.ok) {
            const data = await res.json();
            cache = data;

            // One-time migration: if server was empty but localStorage has data, migrate
            const STORAGE_KEY = 'worclaw_data';
            if (cache.projects.length === 0 && cache.tasks.length === 0) {
                try {
                    const raw = localStorage.getItem(STORAGE_KEY);
                    if (raw) {
                        const localData = JSON.parse(raw);
                        if (localData.projects?.length > 0 || localData.tasks?.length > 0 || localData.timeEntries?.length > 0) {
                            cache = localData;
                            saveData(cache);
                            console.log('✨ Migrated localStorage data to SQLite');
                            localStorage.removeItem(STORAGE_KEY);
                        }
                    }
                } catch { /* ignore migration errors */ }
            }
        }
    } catch (err) {
        console.error('Failed to load data from server, using empty state:', err);
    }
}

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---- Projects ----

export function getProjects() {
    return loadData().projects;
}

export function getProject(id) {
    return loadData().projects.find(p => p.id === id) || null;
}

export function addProject(name, color) {
    const data = loadData();
    const project = { id: uid(), name, color: color || PROJECT_COLORS[0], createdAt: Date.now() };
    data.projects.push(project);
    saveData(data);
    return project;
}

export function deleteProject(id) {
    const data = loadData();
    const taskIds = data.tasks.filter(t => t.projectId === id).map(t => t.id);
    data.timeEntries = data.timeEntries.filter(e => !taskIds.includes(e.taskId));
    data.tasks = data.tasks.filter(t => t.projectId !== id);
    data.projects = data.projects.filter(p => p.id !== id);
    saveData(data);
}

// ---- Tasks ----

export function getTasks(projectId) {
    return loadData().tasks.filter(t => t.projectId === projectId);
}

export function getTask(taskId) {
    return loadData().tasks.find(t => t.id === taskId) || null;
}

export function addTask(projectId, title) {
    const data = loadData();
    const task = { id: uid(), projectId, title, status: 'todo', createdAt: Date.now() };
    data.tasks.push(task);
    saveData(data);
    return task;
}

export function renameTask(taskId, newTitle) {
    const data = loadData();
    const task = data.tasks.find(t => t.id === taskId);
    if (task) {
        task.title = newTitle;
        saveData(data);
    }
    return task;
}

export function deleteTask(taskId) {
    const data = loadData();
    data.timeEntries = data.timeEntries.filter(e => e.taskId !== taskId);
    data.tasks = data.tasks.filter(t => t.id !== taskId);
    data.comments = (data.comments || []).filter(c => c.taskId !== taskId);
    data.attachments = (data.attachments || []).filter(a => a.taskId !== taskId);
    saveData(data);
}

// ---- Time entries ----

export function getTimeEntries(taskId) {
    return loadData().timeEntries.filter(e => e.taskId === taskId);
}

export function getActiveEntry() {
    return loadData().timeEntries.find(e => e.isRunning) || null;
}

export function startTimer(taskId) {
    const data = loadData();
    // stop any running timer first, properly handling paused state
    data.timeEntries.forEach(e => {
        if (e.isRunning) {
            if (e.isPaused && e.pausedAt) {
                e.totalPausedMs += Date.now() - e.pausedAt;
            }
            e.isRunning = false;
            e.isPaused = false;
            e.pausedAt = null;
            e.endTime = Date.now();
        }
    });
    const entry = {
        id: uid(),
        taskId,
        startTime: Date.now(),
        endTime: null,
        pausedAt: null,
        totalPausedMs: 0,
        isRunning: true,
        isPaused: false,
    };
    data.timeEntries.push(entry);
    saveData(data);
    return entry;
}

export function pauseTimer(entryId) {
    const data = loadData();
    const entry = data.timeEntries.find(e => e.id === entryId);
    if (entry && entry.isRunning && !entry.isPaused) {
        entry.isPaused = true;
        entry.pausedAt = Date.now();
        saveData(data);
    }
    return entry;
}

export function resumeTimer(entryId) {
    const data = loadData();
    const entry = data.timeEntries.find(e => e.id === entryId);
    if (entry && entry.isRunning && entry.isPaused) {
        entry.totalPausedMs += Date.now() - entry.pausedAt;
        entry.isPaused = false;
        entry.pausedAt = null;
        saveData(data);
    }
    return entry;
}

export function stopTimer(entryId) {
    const data = loadData();
    const entry = data.timeEntries.find(e => e.id === entryId);
    if (entry && entry.isRunning) {
        if (entry.isPaused) {
            entry.totalPausedMs += Date.now() - entry.pausedAt;
        }
        entry.isRunning = false;
        entry.isPaused = false;
        entry.pausedAt = null;
        entry.endTime = Date.now();
        saveData(data);
    }
    return entry;
}

/** Returns the elapsed ms for an entry, excluding paused time */
export function getElapsedMs(entry) {
    if (!entry) return 0;
    const end = entry.endTime || Date.now();
    let paused = entry.totalPausedMs || 0;
    if (entry.isPaused && entry.pausedAt) {
        paused += Date.now() - entry.pausedAt;
    }
    return Math.max(0, end - entry.startTime - paused);
}

/** Get all time entries for a specific date (YYYY-MM-DD) */
export function getEntriesForDate(dateStr) {
    const data = loadData();
    const dayStart = new Date(dateStr).setHours(0, 0, 0, 0);
    const dayEnd = new Date(dateStr).setHours(23, 59, 59, 999);
    return data.timeEntries.filter(e => {
        return e.startTime >= dayStart && e.startTime <= dayEnd;
    });
}

/** Get workload aggregated by project for a given date */
export function getWorkloadForDate(dateStr) {
    const entries = getEntriesForDate(dateStr);
    const data = loadData();
    const projectMap = {};

    entries.forEach(e => {
        const task = data.tasks.find(t => t.id === e.taskId);
        if (!task) return;
        const project = data.projects.find(p => p.id === task.projectId);
        if (!project) return;

        if (!projectMap[project.id]) {
            projectMap[project.id] = { project, totalMs: 0 };
        }
        projectMap[project.id].totalMs += getElapsedMs(e);
    });

    return Object.values(projectMap);
}

// ---- Breaks ----

export function startBreak(breakTypeId) {
    const data = loadData();
    // stop any running timer/break first
    data.timeEntries.forEach(e => {
        if (e.isRunning) {
            if (e.isPaused && e.pausedAt) {
                e.totalPausedMs += Date.now() - e.pausedAt;
            }
            e.isRunning = false;
            e.isPaused = false;
            e.pausedAt = null;
            e.endTime = Date.now();
        }
    });
    const breakType = BREAK_TYPES.find(b => b.id === breakTypeId) || BREAK_TYPES[2];
    const entry = {
        id: uid(),
        taskId: null,
        isBreak: true,
        breakTypeId: breakType.id,
        breakLabel: breakType.label,
        breakColor: breakType.color,
        startTime: Date.now(),
        endTime: null,
        pausedAt: null,
        totalPausedMs: 0,
        isRunning: true,
        isPaused: false,
    };
    data.timeEntries.push(entry);
    saveData(data);
    return entry;
}

export function getBreaksForDate(dateStr) {
    return getEntriesForDate(dateStr).filter(e => e.isBreak);
}

// ---- Manual entry management ----

export function getEntry(entryId) {
    return loadData().timeEntries.find(e => e.id === entryId) || null;
}

export function getAllTasks() {
    return loadData().tasks;
}

export function addManualEntry({ taskId, isBreak, breakTypeId, startTime, endTime }) {
    const data = loadData();
    const entry = {
        id: uid(),
        taskId: isBreak ? null : taskId,
        isBreak: !!isBreak,
        startTime,
        endTime,
        pausedAt: null,
        totalPausedMs: 0,
        isRunning: false,
        isPaused: false,
    };
    if (isBreak) {
        const breakType = BREAK_TYPES.find(b => b.id === breakTypeId) || BREAK_TYPES[2];
        entry.breakTypeId = breakType.id;
        entry.breakLabel = breakType.label;
        entry.breakColor = breakType.color;
    }
    data.timeEntries.push(entry);
    saveData(data);
    return entry;
}

export function updateEntry(entryId, { startTime, endTime, taskId, isBreak, breakTypeId }) {
    const data = loadData();
    const entry = data.timeEntries.find(e => e.id === entryId);
    if (!entry) return null;
    if (startTime !== undefined) entry.startTime = startTime;
    if (endTime !== undefined) entry.endTime = endTime;
    if (taskId !== undefined) entry.taskId = taskId;
    if (isBreak !== undefined) {
        entry.isBreak = isBreak;
        if (isBreak) {
            entry.taskId = null;
            const breakType = BREAK_TYPES.find(b => b.id === breakTypeId) || BREAK_TYPES[2];
            entry.breakTypeId = breakType.id;
            entry.breakLabel = breakType.label;
            entry.breakColor = breakType.color;
        } else {
            delete entry.breakTypeId;
            delete entry.breakLabel;
            delete entry.breakColor;
        }
    }
    saveData(data);
    return entry;
}

export function deleteEntry(entryId) {
    const data = loadData();
    data.timeEntries = data.timeEntries.filter(e => e.id !== entryId);
    saveData(data);
}

// ---- Comments ----

export function getComments(taskId) {
    return (loadData().comments || []).filter(c => c.taskId === taskId)
        .sort((a, b) => b.createdAt - a.createdAt);
}

export function addComment(taskId, text) {
    const data = loadData();
    if (!data.comments) data.comments = [];
    const comment = { id: uid(), taskId, text, createdAt: Date.now() };
    data.comments.push(comment);
    saveData(data);
    return comment;
}

export function updateComment(commentId, text) {
    const data = loadData();
    const comment = (data.comments || []).find(c => c.id === commentId);
    if (comment) {
        comment.text = text;
        comment.editedAt = Date.now();
        saveData(data);
    }
    return comment;
}

export function deleteComment(commentId) {
    const data = loadData();
    data.comments = (data.comments || []).filter(c => c.id !== commentId);
    saveData(data);
}

// ---- Attachments ----

export function getAttachments(taskId) {
    return (loadData().attachments || []).filter(a => a.taskId === taskId)
        .sort((a, b) => b.createdAt - a.createdAt);
}

export function addAttachment(taskId, { fileName, originalName, mimeType, size }) {
    const data = loadData();
    if (!data.attachments) data.attachments = [];
    const attachment = { id: uid(), taskId, fileName, originalName, mimeType, size, createdAt: Date.now() };
    data.attachments.push(attachment);
    saveData(data);
    return attachment;
}

export function deleteAttachment(attachmentId) {
    const data = loadData();
    const attachment = (data.attachments || []).find(a => a.id === attachmentId);
    data.attachments = (data.attachments || []).filter(a => a.id !== attachmentId);
    saveData(data);
    return attachment;
}

export { PROJECT_COLORS, BREAK_TYPES };
