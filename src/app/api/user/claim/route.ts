import { NextRequest, NextResponse } from 'next/server';
import { claimAnonymousData, scanAndPopulateDB } from '@/lib/server/claim-data';
import { auth } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await auth?.api.getSession({ headers: req.headers });
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { action } = await req.json(); // "claim" or "scan" or "start_fresh" (optional logic)

    if (action === 'scan') {
      const counts = await scanAndPopulateDB();
      return NextResponse.json({ success: true, message: 'Scanned file system', ...counts });
    }

    // Default action: Claim
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
