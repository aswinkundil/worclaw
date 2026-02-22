// ===== db.js — SQLite database layer =====
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'worclaw.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent reads
db.pragma('journal_mode = WAL');

// ---- Schema ----

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    parentId TEXT,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    taskId TEXT,
    isBreak INTEGER NOT NULL DEFAULT 0,
    breakTypeId TEXT,
    breakLabel TEXT,
    breakColor TEXT,
    startTime INTEGER NOT NULL,
    endTime INTEGER,
    pausedAt INTEGER,
    totalPausedMs INTEGER NOT NULL DEFAULT 0,
    isRunning INTEGER NOT NULL DEFAULT 0,
    isPaused INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL,
    text TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    editedAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL,
    fileName TEXT NOT NULL,
    originalName TEXT NOT NULL,
    mimeType TEXT,
    size INTEGER,
    createdAt INTEGER NOT NULL
  );
`);

// ---- Migrations ----
// Add parentId column if missing (for existing databases)
try {
    db.exec(`ALTER TABLE tasks ADD COLUMN parentId TEXT`);
} catch { /* column already exists */ }

// ---- Prepared statements ----

const stmts = {
    getProjects: db.prepare('SELECT * FROM projects ORDER BY createdAt'),
    getTasks: db.prepare('SELECT * FROM tasks ORDER BY createdAt'),
    getEntries: db.prepare('SELECT * FROM time_entries ORDER BY startTime'),
    getComments: db.prepare('SELECT * FROM comments ORDER BY createdAt DESC'),
    getAttachments: db.prepare('SELECT * FROM attachments ORDER BY createdAt DESC'),

    clearProjects: db.prepare('DELETE FROM projects'),
    clearTasks: db.prepare('DELETE FROM tasks'),
    clearEntries: db.prepare('DELETE FROM time_entries'),
    clearComments: db.prepare('DELETE FROM comments'),
    clearAttachments: db.prepare('DELETE FROM attachments'),

    insertProject: db.prepare(
        'INSERT OR REPLACE INTO projects (id, name, color, createdAt) VALUES (@id, @name, @color, @createdAt)'
    ),
    insertTask: db.prepare(
        'INSERT OR REPLACE INTO tasks (id, projectId, title, status, parentId, createdAt) VALUES (@id, @projectId, @title, @status, @parentId, @createdAt)'
    ),
    insertEntry: db.prepare(
        `INSERT OR REPLACE INTO time_entries
     (id, taskId, isBreak, breakTypeId, breakLabel, breakColor, startTime, endTime, pausedAt, totalPausedMs, isRunning, isPaused)
     VALUES (@id, @taskId, @isBreak, @breakTypeId, @breakLabel, @breakColor, @startTime, @endTime, @pausedAt, @totalPausedMs, @isRunning, @isPaused)`
    ),
    insertComment: db.prepare(
        'INSERT OR REPLACE INTO comments (id, taskId, text, createdAt, editedAt) VALUES (@id, @taskId, @text, @createdAt, @editedAt)'
    ),
    insertAttachment: db.prepare(
        'INSERT OR REPLACE INTO attachments (id, taskId, fileName, originalName, mimeType, size, createdAt) VALUES (@id, @taskId, @fileName, @originalName, @mimeType, @size, @createdAt)'
    ),
};

// ---- Public API ----

/** Load all data from the database */
export function loadAll() {
    const projects = stmts.getProjects.all();
    const tasks = stmts.getTasks.all();
    const rawEntries = stmts.getEntries.all();
    const comments = stmts.getComments.all();
    const attachments = stmts.getAttachments.all();

    // Convert SQLite integers back to booleans/nulls
    const timeEntries = rawEntries.map(e => ({
        ...e,
        taskId: e.taskId || null,
        isBreak: !!e.isBreak,
        breakTypeId: e.breakTypeId || undefined,
        breakLabel: e.breakLabel || undefined,
        breakColor: e.breakColor || undefined,
        endTime: e.endTime || null,
        pausedAt: e.pausedAt || null,
        isRunning: !!e.isRunning,
        isPaused: !!e.isPaused,
    }));

    return { projects, tasks, timeEntries, comments, attachments };
}

/** Replace all data in the database */
export const saveAll = db.transaction((data) => {
    stmts.clearProjects.run();
    stmts.clearTasks.run();
    stmts.clearEntries.run();
    stmts.clearComments.run();
    stmts.clearAttachments.run();

    for (const p of data.projects) {
        stmts.insertProject.run(p);
    }

    for (const t of data.tasks) {
        stmts.insertTask.run({
            id: t.id,
            projectId: t.projectId,
            title: t.title,
            status: t.status,
            parentId: t.parentId ?? null,
            createdAt: t.createdAt,
        });
    }

    for (const e of data.timeEntries) {
        stmts.insertEntry.run({
            id: e.id,
            taskId: e.taskId ?? null,
            isBreak: e.isBreak ? 1 : 0,
            breakTypeId: e.breakTypeId ?? null,
            breakLabel: e.breakLabel ?? null,
            breakColor: e.breakColor ?? null,
            startTime: e.startTime,
            endTime: e.endTime ?? null,
            pausedAt: e.pausedAt ?? null,
            totalPausedMs: e.totalPausedMs || 0,
            isRunning: e.isRunning ? 1 : 0,
            isPaused: e.isPaused ? 1 : 0,
        });
    }

    for (const c of (data.comments || [])) {
        stmts.insertComment.run({
            id: c.id,
            taskId: c.taskId,
            text: c.text,
            createdAt: c.createdAt,
            editedAt: c.editedAt ?? null,
        });
    }

    for (const a of (data.attachments || [])) {
        stmts.insertAttachment.run({
            id: a.id,
            taskId: a.taskId,
            fileName: a.fileName,
            originalName: a.originalName,
            mimeType: a.mimeType ?? null,
            size: a.size ?? null,
            createdAt: a.createdAt,
        });
    }
});

export function close() {
    db.close();
}
