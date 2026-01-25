import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { isAuthEnabled } from '@/lib/server/auth-config';

export async function DELETE() {
  if (!isAuthEnabled() || !auth) {
    return NextResponse.json({ error: 'Authentication disabled' }, { status: 403 });
  }

  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Directly delete user from database
    await db.transaction(async (client) => {
      // Deleting user usually cascades to sessions, accounts, etc if FKs are set up correctly
      // But better-auth schemas do cascade.
      await client.query('DELETE FROM "user" WHERE id = $1', [session.user.id]);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete account:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}
