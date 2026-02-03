import { NextRequest, NextResponse } from 'next/server';
import { claimAnonymousData } from '@/lib/server/claim-data';
import { auth } from '@/lib/server/auth';
import { ensureDbIndexed, getUnclaimedCounts } from '@/lib/server/db-indexing';

export async function GET(req: NextRequest) {
  try {
    const session = await auth?.api.getSession({ headers: req.headers });
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
