import * as sqliteSchema from './schema_sqlite';
import * as postgresSchema from './schema_postgres';

const usePostgres = !!process.env.POSTGRES_URL;

// Export the correct table variants dynamically
export const documents = usePostgres ? postgresSchema.documents : sqliteSchema.documents;
export const audiobooks = usePostgres ? postgresSchema.audiobooks : sqliteSchema.audiobooks;
export const audiobookChapters = usePostgres ? postgresSchema.audiobookChapters : sqliteSchema.audiobookChapters;
export const user = usePostgres ? postgresSchema.user : sqliteSchema.user;
export const session = usePostgres ? postgresSchema.session : sqliteSchema.session;
export const account = usePostgres ? postgresSchema.account : sqliteSchema.account;
export const verification = usePostgres ? postgresSchema.verification : sqliteSchema.verification;
export const userTtsChars = usePostgres ? postgresSchema.userTtsChars : sqliteSchema.userTtsChars;
export const userPreferences = usePostgres ? postgresSchema.userPreferences : sqliteSchema.userPreferences;
export const userDocumentProgress = usePostgres ? postgresSchema.userDocumentProgress : sqliteSchema.userDocumentProgress;
