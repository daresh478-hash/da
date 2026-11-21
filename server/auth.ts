import crypto from 'node:crypto';
import type { User } from '../src/shared/types.ts';
import { db, uid } from './db.ts';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derivedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derivedBuf, expectedBuf);
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function createSessionForUser(userId: string): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(tokenHash, userId, expiresAt, now.toISOString());

  return rawToken;
}

export function verifySessionToken(rawToken: string | null | undefined): User | null {
  if (!rawToken || rawToken.length < 16) return null;
  const tokenHash = hashToken(rawToken);
  const nowIso = new Date().toISOString();

  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_initials, u.created_at, s.expires_at
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as Record<string, unknown> | undefined;

  if (!row) return null;

  if (String(row.expires_at) <= nowIso) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }

  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: String(row.role),
    avatarInitials: String(row.avatar_initials),
    createdAt: String(row.created_at),
  };
}

export function revokeSessionToken(rawToken: string | null | undefined): void {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

export function registerUserAccount(params: {
  name: string;
  email: string;
  role: string;
  password: string;
}): { user: User; token: string } | { error: string; status: number } {
  const normalizedEmail = params.email.trim().toLowerCase();
  const existing = db
    .prepare('SELECT id, password_hash FROM users WHERE email = ?')
    .get(normalizedEmail) as { id: string; password_hash: string | null } | undefined;

  if (existing && existing.password_hash) {
    return { error: 'An account with this email is already registered.', status: 409 };
  }

  const now = new Date().toISOString();
  const passwordHash = hashPassword(params.password);
  const cleanName = params.name.trim();
  const cleanRole = params.role.trim() || 'Contributor';
  const initials =
    cleanName
      .split(/\s+/)
      .map((p) => p[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'TM';

  let userId: string;
  if (existing) {
    // Claim seeded placeholder user record without password_hash
    userId = existing.id;
    db.prepare(
      `UPDATE users SET name = ?, role = ?, avatar_initials = ?, password_hash = ? WHERE id = ?`
    ).run(cleanName, cleanRole, initials, passwordHash, userId);
  } else {
    userId = uid('usr');
    db.prepare(
      `INSERT INTO users (id, name, email, role, avatar_initials, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, cleanName, normalizedEmail, cleanRole, initials, passwordHash, now);
  }

  // Add newly registered user to the active workspace launch project if present so they can collaborate immediately
  const launchProject = db
    .prepare('SELECT id FROM projects ORDER BY created_at ASC LIMIT 1')
    .get() as { id: string } | undefined;

  if (launchProject) {
    const memberExists = db
      .prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(launchProject.id, userId);
    if (!memberExists) {
      db.prepare(
        `INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)`
      ).run(uid('pm'), launchProject.id, userId, cleanRole);
    }
  }

  const token = createSessionForUser(userId);
  return {
    token,
    user: {
      id: userId,
      name: cleanName,
      email: normalizedEmail,
      role: cleanRole,
      avatarInitials: initials,
      createdAt: now,
    },
  };
}

export function authenticateUserAccount(params: {
  email: string;
  password: string;
}): { user: User; token: string } | null {
  const normalizedEmail = params.email.trim().toLowerCase();
  const row = db
    .prepare(
      `SELECT id, name, email, role, avatar_initials, password_hash, created_at
       FROM users WHERE email = ?`
    )
    .get(normalizedEmail) as Record<string, unknown> | undefined;

  if (!row || !verifyPassword(params.password, row.password_hash as string | null)) {
    return null;
  }

  const user: User = {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: String(row.role),
    avatarInitials: String(row.avatar_initials),
    createdAt: String(row.created_at),
  };
  const token = createSessionForUser(user.id);
  return { token, user };
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1].trim() : null;
}
