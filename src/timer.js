// ===== timer.js — Timer engine with live display updates =====

import { getActiveEntry, getElapsedMs, pauseTimer, resumeTimer, stopTimer } from './store.js';

let intervalId = null;
let onTickCallback = null;

/** Format milliseconds to HH:MM:SS */
export function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Format ms to a human-readable short form like "2h 14m" */
export function formatDuration(ms) {
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 1) return '< 1m';
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

/** Start the tick loop that updates the active timer display */
export function startTick(callback) {
    stopTick();
    onTickCallback = callback;
    intervalId = setInterval(() => {
        const entry = getActiveEntry();
        if (entry && onTickCallback) {
            onTickCallback(entry, getElapsedMs(entry));
        }
    }, 250); // update 4x/sec for smooth display
}

/** Stop the tick loop */
export function stopTick() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

export function handlePause(entryId) {
    pauseTimer(entryId);
}

export function handleResume(entryId) {
    resumeTimer(entryId);
}

export function handleStop(entryId) {
    stopTimer(entryId);
    stopTick();
}
