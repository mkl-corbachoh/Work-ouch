import type { SqliteDatabase } from "../../db/connection";
import type { CurrentUser, ExternalIdentity } from "./auth.types";

export class AuthRepository {
  constructor(private readonly database: SqliteDatabase) {}

  findByIdentity(identity: ExternalIdentity): CurrentUser | null {
    const row = this.database
      .prepare(`
      SELECT u.id, u.email, u.display_name AS displayName
      FROM user_identities i JOIN users u ON u.id = i.user_id
      WHERE i.provider = ? AND i.provider_subject = ?
    `)
      .get(identity.provider, identity.subject) as CurrentUser | undefined;
    return row ?? null;
  }

  bootstrap(identity: ExternalIdentity): CurrentUser {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.findByIdentity(identity);
      if (existing) {
        this.database.exec("COMMIT");
        return existing;
      }
      const now = new Date().toISOString();
      const email = `${identity.provider}:${identity.subject}`;
      if (email.length > 320) {
        throw new Error("External identity is too long to bootstrap");
      }
      const displayName = identity.email ?? `${identity.provider} user`;
      const nextId = this.database
        .prepare("SELECT COALESCE(MAX(id), 0) + 1 AS id FROM users")
        .get() as { id: number };
      const user = this.database
        .prepare(`
        INSERT INTO users (id, email, display_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?) RETURNING id, email, display_name AS displayName
      `)
        .get(nextId.id, email, displayName, now, now) as CurrentUser;
      this.database
        .prepare(`
        INSERT INTO user_identities (user_id, provider, provider_subject, created_at)
        VALUES (?, ?, ?, ?)
      `)
        .run(user.id, identity.provider, identity.subject, now);
      this.database.exec("COMMIT");
      return user;
    } catch (error) {
      if (this.database.inTransaction) this.database.exec("ROLLBACK");
      const existing = this.findByIdentity(identity);
      if (existing) return existing;
      throw error;
    }
  }
}
