import type { SessionRecord } from "../types";

/**
 * Maximum number of sessions retained in localStorage.
 * When this limit is reached, the oldest sessions are dropped.
 */
const MAX_SESSIONS = 100;
const STORAGE_KEY = "dip:sessions";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readRaw(): SessionRecord[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as SessionRecord[];
    } catch {
        return [];
    }
}

function writeRaw(sessions: SessionRecord[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
        // Swallow quota errors — inference must not be affected by storage failures.
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a new session record.
 * Prepends to the list (newest first) and trims to MAX_SESSIONS.
 * Fails silently on storage errors.
 */
export function addSession(record: SessionRecord): void {
    const existing = readRaw();
    const updated = [record, ...existing].slice(0, MAX_SESSIONS);
    writeRaw(updated);
}

/**
 * Return all stored sessions, newest first.
 * Returns an empty array when nothing is stored or on read errors.
 */
export function getSessions(): SessionRecord[] {
    return readRaw();
}

/**
 * Return a single session by its id, or undefined if not found.
 */
export function getSessionById(id: string): SessionRecord | undefined {
    return readRaw().find((s) => s.id === id);
}

/**
 * Remove all stored sessions.
 */
export function clearSessions(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Swallow errors.
    }
}
