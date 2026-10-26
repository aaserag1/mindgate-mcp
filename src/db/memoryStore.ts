/**
 * MindGate Local-First SQLite + FTS5 Storage Engine
 *
 * Provides zero-cost, 100% offline persistent context, full-text BM25 search,
 * cross-agent session handoffs, and global developer preferences.
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type MemoryCategory =
  | "architecture"
  | "decision"
  | "bugfix"
  | "convention"
  | "context";

export interface MemoryRecord {
  id: number;
  workspace: string;
  category: MemoryCategory;
  title: string;
  content: string;
  tags: string;
  source_agent: string;
  created_at: string;
  updated_at: string;
}

export interface SessionRecord {
  id: number;
  workspace: string;
  source_agent: string;
  summary: string;
  next_steps: string;
  active_files: string;
  created_at: string;
}

export interface PreferenceRecord {
  key: string;
  value: string;
  category: string;
  updated_at: string;
}

export class MindGateStore {
  private db: Database.Database;
  public readonly dbPath: string;

  constructor(customDbPath?: string) {
    const defaultDir = path.join(os.homedir(), ".mindgate");
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true, mode: 0o700 });
    }
    this.dbPath =
      customDbPath ||
      process.env.MINDGATE_DB_PATH ||
      path.join(defaultDir, "mindgate.db");

    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = ON");
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace TEXT NOT NULL DEFAULT 'global',
        category TEXT NOT NULL DEFAULT 'decision',
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '',
        source_agent TEXT NOT NULL DEFAULT 'unknown',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_memories_workspace ON memories(workspace);
      CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        title,
        content,
        tags,
        workspace,
        content='memories',
        content_rowid='id'
      );

      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, title, content, tags, workspace)
        VALUES (new.id, new.title, new.content, new.tags, new.workspace);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, title, content, tags, workspace)
        VALUES ('delete', old.id, old.title, old.content, old.tags, old.workspace);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, title, content, tags, workspace)
        VALUES ('delete', old.id, old.title, old.content, old.tags, old.workspace);
        INSERT INTO memories_fts(rowid, title, content, tags, workspace)
        VALUES (new.id, new.title, new.content, new.tags, new.workspace);
      END;

      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace TEXT NOT NULL DEFAULT 'global',
        source_agent TEXT NOT NULL DEFAULT 'unknown',
        summary TEXT NOT NULL,
        next_steps TEXT NOT NULL DEFAULT '',
        active_files TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace, created_at DESC);

      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  public rememberDecision(params: {
    workspace?: string;
    category?: MemoryCategory;
    title: string;
    content: string;
    tags?: string[];
    sourceAgent?: string;
  }): MemoryRecord {
    const workspace =
      params.workspace || process.env.MINDGATE_DEFAULT_WORKSPACE || "global";
    const category = params.category || "decision";
    const tags = (params.tags || []).join(", ");
    const sourceAgent = params.sourceAgent || "mcp-client";

    const stmt = this.db.prepare(`
      INSERT INTO memories (workspace, category, title, content, tags, source_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      workspace,
      category,
      params.title,
      params.content,
      tags,
      sourceAgent
    );

    return this.db
      .prepare("SELECT * FROM memories WHERE id = ?")
      .get(info.lastInsertRowid) as MemoryRecord;
  }

  public recallContext(params: {
    query?: string;
    workspace?: string;
    category?: MemoryCategory;
    limit?: number;
    includeGlobal?: boolean;
  }): {
    memories: MemoryRecord[];
    latestSession: SessionRecord | null;
    preferences: PreferenceRecord[];
  } {
    const workspace =
      params.workspace || process.env.MINDGATE_DEFAULT_WORKSPACE || "global";
    const includeGlobal = params.includeGlobal ?? true;
    const limit = Math.min(Math.max(params.limit || 10, 1), 50);

    const workspaces =
      includeGlobal && workspace !== "global"
        ? [workspace, "global"]
        : [workspace];
    const wsPlaceholders = workspaces.map(() => "?").join(", ");

    let memories: MemoryRecord[] = [];

    if (params.query && params.query.trim().length > 0) {
      const sanitizedQuery = params.query
        .replace(/["'*^()]/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((term) => `"${term}"*`)
        .join(" OR ");

      if (sanitizedQuery.length > 0) {
        const sql = `
          SELECT m.*
          FROM memories_fts fts
          JOIN memories m ON m.id = fts.rowid
          WHERE memories_fts MATCH ?
            AND m.workspace IN (${wsPlaceholders})
            ${params.category ? "AND m.category = ?" : ""}
          ORDER BY bm25(memories_fts) ASC, m.updated_at DESC
          LIMIT ?
        `;
        const bindArgs: unknown[] = [sanitizedQuery, ...workspaces];
        if (params.category) bindArgs.push(params.category);
        bindArgs.push(limit);

        memories = this.db.prepare(sql).all(...bindArgs) as MemoryRecord[];
      }
    }

    if (memories.length === 0) {
      const sql = `
        SELECT *
        FROM memories
        WHERE workspace IN (${wsPlaceholders})
          ${params.category ? "AND category = ?" : ""}
        ORDER BY updated_at DESC, id DESC
        LIMIT ?
      `;
      const bindArgs: unknown[] = [...workspaces];
      if (params.category) bindArgs.push(params.category);
      bindArgs.push(limit);

      memories = this.db.prepare(sql).all(...bindArgs) as MemoryRecord[];
    }

    const latestSession =
      (this.db
        .prepare(
          `SELECT * FROM sessions WHERE workspace IN (${wsPlaceholders}) ORDER BY id DESC LIMIT 1`
        )
        .get(...workspaces) as SessionRecord | undefined) || null;

    const preferences = this.getUserPreferences();

    return { memories, latestSession, preferences };
  }

  public logSessionSummary(params: {
    workspace?: string;
    sourceAgent?: string;
    summary: string;
    nextSteps?: string[];
    activeFiles?: string[];
  }): SessionRecord {
    const workspace =
      params.workspace || process.env.MINDGATE_DEFAULT_WORKSPACE || "global";
    const sourceAgent = params.sourceAgent || "mcp-client";
    const nextSteps = (params.nextSteps || []).join("\n");
    const activeFiles = (params.activeFiles || []).join(", ");

    const stmt = this.db.prepare(`
      INSERT INTO sessions (workspace, source_agent, summary, next_steps, active_files)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      workspace,
      sourceAgent,
      params.summary,
      nextSteps,
      activeFiles
    );

    return this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(info.lastInsertRowid) as SessionRecord;
  }

  public setUserPreference(
    key: string,
    value: string,
    category = "coding-style"
  ): PreferenceRecord {
    this.db
      .prepare(
        `
      INSERT INTO preferences (key, value, category, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        category = excluded.category,
        updated_at = datetime('now')
    `
      )
      .run(key, value, category);

    return this.db
      .prepare("SELECT * FROM preferences WHERE key = ?")
      .get(key) as PreferenceRecord;
  }

  public getUserPreferences(category?: string): PreferenceRecord[] {
    if (category) {
      return this.db
        .prepare(
          "SELECT * FROM preferences WHERE category = ? ORDER BY key ASC"
        )
        .all(category) as PreferenceRecord[];
    }
    return this.db
      .prepare("SELECT * FROM preferences ORDER BY category ASC, key ASC")
      .all() as PreferenceRecord[];
  }

  public listWorkspaces(): Array<{
    workspace: string;
    memory_count: number;
    last_updated: string;
  }> {
    return this.db
      .prepare(
        `
      SELECT workspace, COUNT(*) as memory_count, MAX(updated_at) as last_updated
      FROM memories
      GROUP BY workspace
      ORDER BY last_updated DESC
    `
      )
      .all() as Array<{
      workspace: string;
      memory_count: number;
      last_updated: string;
    }>;
  }

  public deleteMemory(id: number): boolean {
    const info = this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    return info.changes > 0;
  }
}
