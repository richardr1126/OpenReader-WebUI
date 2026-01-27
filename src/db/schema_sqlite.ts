import { sqliteTable, text, integer, real, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const documents = sqliteTable('documents', {
  id: text('id'),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // pdf, epub, docx, html
  size: integer('size').notNull(),
  lastModified: integer('last_modified').notNull(),
  filePath: text('file_path').notNull(),
  createdAt: integer('created_at').default(sql`(cast(strftime('%s','now') as int) * 1000)`),
}, (table) => ({
  pk: primaryKey({ columns: [table.id, table.userId] }),
}));

export const audiobooks = sqliteTable('audiobooks', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  title: text('title').notNull(),
  author: text('author'),
  description: text('description'),
  coverPath: text('cover_path'),
  duration: real('duration').default(0),
  createdAt: integer('created_at').default(sql`(cast(strftime('%s','now') as int) * 1000)`),
});

export const audiobookChapters = sqliteTable('audiobook_chapters', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull().references(() => audiobooks.id, { onDelete: 'cascade' }),
  userId: text('user_id'),
  chapterIndex: integer('chapter_index').notNull(),
  title: text('title').notNull(),
  duration: real('duration').default(0),
  filePath: text('file_path').notNull(),
  format: text('format').notNull(), // mp3, m4b
});

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
