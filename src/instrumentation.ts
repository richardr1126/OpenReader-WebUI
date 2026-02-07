export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.AUTH_ENABLED === 'true') {
    const { printAuthUrl } = await import('@/lib/auth');
    printAuthUrl();
  }
}
