import { pgTable, text, integer, real, boolean, timestamp, date, bigint, primaryKey, index } from 'drizzle-orm/pg-core';

export const documents = pgTable('documents', {
  id: text('id'),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // pdf, epub, docx, html
  size: bigint('size', { mode: 'number' }).notNull(),
  lastModified: bigint('last_modified', { mode: 'number' }).notNull(),
  filePath: text('file_path').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.id, table.userId] }),
}));

export const audiobooks = pgTable('audiobooks', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  title: text('title').notNull(),
  author: text('author'),
  description: text('description'),
  coverPath: text('cover_path'),
  duration: real('duration').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const audiobookChapters = pgTable('audiobook_chapters', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull().references(() => audiobooks.id, { onDelete: 'cascade' }),
  userId: text('user_id'),
  chapterIndex: integer('chapter_index').notNull(),
  title: text('title').notNull(),
  duration: real('duration').default(0),
  filePath: text('file_path').notNull(),
  format: text('format').notNull(), // mp3, m4b
});

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  isAnonymous: boolean('is_anonymous'),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' })
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at'),
});

export const userTtsChars = pgTable("user_tts_chars", {
  userId: text('user_id').notNull(),
  date: date('date').notNull(),
  charCount: bigint('char_count', { mode: 'number' }).default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.date] }),
  dateIdx: index('idx_user_tts_chars_date').on(table.date),
}));
