import { NextRequest, NextResponse } from 'next/server';
import { claimAnonymousData } from '@/lib/server/claim-data';
import { auth } from '@/lib/server/auth';
import { ensureDbIndexed, getUnclaimedCounts } from '@/lib/server/db-indexing';
import { isDocumentsV1Ready } from '@/lib/server/docstore';
import { db } from '@/db';
import { documents } from '@/db/schema';
import { count, ne } from 'drizzle-orm';

async function checkClaimMigrationReadiness(): Promise<NextResponse | null> {
  const documentsV1Ready = await isDocumentsV1Ready();
  if (!documentsV1Ready) {
    return NextResponse.json(
      { error: 'Document migration is not ready. Run startup migrations first.' },
      { status: 409 },
    );
  }

  const [legacyRows] = await db
    .select({ count: count() })
    .from(documents)
    .where(ne(documents.filePath, documents.id));

  if (Number(legacyRows?.count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Document metadata migration is still pending. Wait for startup migrations to complete.' },
      { status: 409 },
    );
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth?.api.getSession({ headers: req.headers });
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const readiness = await checkClaimMigrationReadiness();
    if (readiness) return readiness;

    await ensureDbIndexed();
    const counts = await getUnclaimedCounts();
    return NextResponse.json({ success: true, ...counts });
  } catch (error) {
    console.error('Error checking claimable data:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth?.api.getSession({ headers: req.headers });
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const readiness = await checkClaimMigrationReadiness();
    if (readiness) return readiness;

    const userId = session.user.id;

    await ensureDbIndexed();
    const result = await claimAnonymousData(userId);

    return NextResponse.json({
      success: true,
      claimed: result
    });

  } catch (error) {
    console.error('Error claiming data:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
