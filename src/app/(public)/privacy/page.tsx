import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';

import { isAuthEnabled } from '@/lib/server/auth-config';

export const metadata: Metadata = {
  title: 'Privacy & Data Usage | OpenReader WebUI',
  description:
    'Learn how OpenReader WebUI handles your data, what is stored in your browser, and what is sent to the server.',
  alternates: {
    canonical: '/privacy',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function PrivacyPage() {
  const authEnabled = isAuthEnabled();
  const hdrs = await headers();
  const host = hdrs.get('host') ?? 'this server';
  const proto = hdrs.get('x-forwarded-proto') ?? 'https';
  const origin = `${proto}://${host}`;

  return (
    <>
      <style>{`
        /* ── Privacy body ───────────────── */
        .privacy-body {
          max-width: 42rem;
          margin: 0 auto;
          padding: 3rem 1.5rem 4rem;
          animation: landing-fade-up 0.7s ease-out 0.15s both;
        }
        .privacy-body h1 {
          font-family: var(--g-display);
          font-weight: 800;
          font-size: clamp(1.5rem, 4vw, 2.25rem);
          letter-spacing: -0.03em;
          margin: 0 0 0.5rem;
        }
        .privacy-body h1 span {
          background: linear-gradient(135deg, var(--g-accent), var(--g-accent2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .privacy-subtitle {
          font-size: 0.95rem;
          color: var(--g-muted);
          margin: 0 0 2.5rem;
          line-height: 1.6;
        }
        .privacy-card {
          padding: 2rem;
          margin-bottom: 1.25rem;
        }
        .privacy-card-label {
          font-family: var(--g-display);
          font-size: 0.68rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: var(--g-accent);
          margin: 0 0 0.75rem;
        }
        .privacy-card p,
        .privacy-card li {
          font-size: 0.92rem;
          line-height: 1.65;
          color: var(--g-fg);
        }
        .privacy-card ul {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .privacy-card li {
          position: relative;
          padding-left: 1.1rem;
          margin-bottom: 0.4rem;
        }
        .privacy-card li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0.55em;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--g-accent);
          opacity: 0.5;
        }
        .privacy-highlight {
          background: color-mix(in srgb, var(--g-accent), transparent 88%);
          border: 1px solid color-mix(in srgb, var(--g-accent), transparent 70%);
          border-radius: 0.75rem;
          padding: 1rem 1.25rem;
          margin-bottom: 1.25rem;
          font-size: 0.88rem;
          line-height: 1.6;
          color: var(--g-fg);
        }
        .privacy-highlight strong {
          color: var(--g-accent);
          font-weight: 600;
        }
        .privacy-note {
          font-size: 0.8rem;
          color: var(--g-muted);
          line-height: 1.6;
          margin-top: 2rem;
        }
        .privacy-note a {
          color: var(--g-accent);
          text-decoration: underline;
          text-decoration-style: dotted;
          text-underline-offset: 3px;
        }
        .privacy-back {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-family: var(--g-system);
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--g-accent);
          text-decoration: none;
          margin-top: 2rem;
          transition: opacity 0.2s;
        }
        .privacy-back:hover {
          opacity: 0.75;
        }
      `}</style>

      <div className="privacy-body">
        <h1>Privacy &amp; <span>Data Usage</span></h1>
        <p className="privacy-subtitle">
          How OpenReader WebUI handles your data when hosted at this instance.
        </p>

        <div className="privacy-highlight">
          This OpenReader instance is hosted at <strong>{origin}</strong>.
          The operator of this service can access data that reaches the service.
        </div>

        <div className="privacy-card landing-panel">
          <div className="privacy-card-label">Stored in your browser (IndexedDB)</div>
          <ul>
            <li>Document and preview cache</li>
            <li>Settings + privacy acceptance</li>
            <li>Reading progress (local fallback)</li>
          </ul>
        </div>

        <div className="privacy-card landing-panel">
          <div className="privacy-card-label">Sent to this service</div>
          <ul>
            <li>Uploaded files + metadata (PDF/EPUB/HTML; DOCX converted server-side)</li>
            <li>TTS text + settings (optional custom API key/base URL)</li>
            <li>Request metadata (IP/user agent) and optional alignment audio/text</li>
          </ul>
        </div>

        <div className="privacy-card landing-panel">
          <div className="privacy-card-label">Stored on this service</div>
          <ul>
            <li>Uploaded docs, metadata, and preview images</li>
            <li>Generated audiobooks and temporary TTS cache</li>
            {authEnabled ? (
              <li>Account/session data, synced preferences/progress, and rate-limit counters</li>
            ) : (
              <li>Auth disabled &mdash; no account or session tables</li>
            )}
          </ul>
        </div>

        <p className="privacy-note">
          This site uses Vercel Analytics to collect anonymous usage data.
          For maximum privacy, self-host OpenReader using the{' '}
          <a
            href="https://github.com/richardr1126/OpenReader-WebUI#readme"
            target="_blank"
            rel="noopener noreferrer"
          >
            open-source repository
          </a>.
        </p>

        <Link href="/?redirect=false" className="privacy-back">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 8H3M7 4l-4 4 4 4"/></svg>
          Back to home
        </Link>
      </div>
    </>
  );
}
