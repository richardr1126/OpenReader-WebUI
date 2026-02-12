import { sqliteTable, text, integer, real, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const documents = sqliteTable('documents', {
  id: text('id').notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // pdf, epub, docx, html
  size: integer('size').notNull(),
  lastModified: integer('last_modified').notNull(),
  filePath: text('file_path').notNull(),
  createdAt: integer('created_at').default(sql`(cast(strftime('%s','now') as int) * 1000)`),
}, (table) => ({
  pk: primaryKey({ columns: [table.id, table.userId] }),
  userIdIdx: index('idx_documents_user_id').on(table.userId),
  userIdLastModifiedIdx: index('idx_documents_user_id_last_modified').on(table.userId, table.lastModified),
}));

export const audiobooks = sqliteTable('audiobooks', {
  id: text('id').notNull(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  author: text('author'),
  description: text('description'),
  coverPath: text('cover_path'),
  duration: real('duration').default(0),
  createdAt: integer('created_at').default(sql`(cast(strftime('%s','now') as int) * 1000)`),
}, (table) => ({
  pk: primaryKey({ columns: [table.id, table.userId] }),
}));

export const audiobookChapters = sqliteTable('audiobook_chapters', {
  id: text('id').notNull(),
  bookId: text('book_id').notNull(),
  userId: text('user_id').notNull(),
  chapterIndex: integer('chapter_index').notNull(),
  title: text('title').notNull(),
  duration: real('duration').default(0),
  filePath: text('file_path').notNull(),
  format: text('format').notNull(), // mp3, m4b
}, (table) => ({
  pk: primaryKey({ columns: [table.id, table.userId] }),
}));

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isAnonymous: integer('is_anonymous', { mode: 'boolean' }),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' })
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

export const userTtsChars = sqliteTable("user_tts_chars", {
  userId: text('user_id').notNull(),
  date: text('date').notNull(), // SQLite doesn't have native DATE type, text YYYY-MM-DD is standard
  charCount: integer('char_count').default(0),
  createdAt: integer('created_at').default(sql`(cast(strftime('%s','now') as int) * 1000)`),
  updatedAt: integer('updated_at').default(sql`(cast(strftime('%s','now') as int) * 1000)`),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.date] }),
  dateIdx: index('idx_user_tts_chars_date').on(table.date),
}));

export const userPreferences = sqliteTable('user_preferences', {
  userId: text('user_id').primaryKey(),
  dataJson: text('data_json').notNull().default('{}'),
  clientUpdatedAtMs: integer('client_updated_at_ms').notNull().default(0),
  createdAt: integer('created_at').default(sql`(cast(strftime('%s','now') as int) * 1000)`),
  updatedAt: integer('updated_at').default(sql`(cast(strftime('%s','now') as int) * 1000)`),
});

export const userDocumentProgress = sqliteTable('user_document_progress', {
  userId: text('user_id').notNull(),
  documentId: text('document_id').notNull(),
  readerType: text('reader_type').notNull(), // pdf, epub, html
  location: text('location').notNull(),
  progress: real('progress'),
  clientUpdatedAtMs: integer('client_updated_at_ms').notNull().default(0),
  createdAt: integer('created_at').default(sql`(cast(strftime('%s','now') as int) * 1000)`),
  updatedAt: integer('updated_at').default(sql`(cast(strftime('%s','now') as int) * 1000)`),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.documentId] }),
  userUpdatedIdx: index('idx_user_document_progress_user_id_updated_at').on(table.userId, table.updatedAt),
}));

export const documentPreviews = sqliteTable('document_previews', {
  documentId: text('document_id').notNull(),
  namespace: text('namespace').notNull().default(''),
  variant: text('variant').notNull().default('card-240-jpeg'),
  status: text('status').notNull().default('queued'),
  sourceLastModifiedMs: integer('source_last_modified_ms').notNull(),
  objectKey: text('object_key').notNull(),
  contentType: text('content_type').notNull().default('image/jpeg'),
  width: integer('width').notNull().default(240),
  height: integer('height'),
  byteSize: integer('byte_size'),
  eTag: text('etag'),
  leaseOwner: text('lease_owner'),
  leaseUntilMs: integer('lease_until_ms').notNull().default(0),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastError: text('last_error'),
  createdAtMs: integer('created_at_ms').notNull().default(0),
  updatedAtMs: integer('updated_at_ms').notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.documentId, table.namespace, table.variant] }),
  statusLeaseIdx: index('idx_document_previews_status_lease').on(table.status, table.leaseUntilMs),
}));
