# OpenReader Issue Triage and Mapping

Repository: https://github.com/richardr1126/OpenReader-WebUI/issues
Reviewed via gh at 2025-11-10.

Summary of open items included:
- #59 Feature: Chapter-Based MP3 Export
- #48 Bug: Failed to export after complete render with Kokoro
- #47 Feature: Combine voices (Kokoro “plus” syntax)
- #44 Bug: Dialog not chunked together
- #40 Bug: PDF left/right extraction margins not working

Global guardrails
- Streaming-first playback (replace Howler with HTMLAudioElement/MSE)
- Dexie DB replacing vanilla IndexedDB
- Single engine cut-over (no dual engines)
- Keep audiobook (m4b) and server-side sync

Issue #59 — Chapter-Based MP3 Export
Type: Feature
Hypothesis / intent:
- Users want one-mp3-per-chapter output (besides full-book m4b).
Ideas:
- Add chapterized MP3 pipeline that chunks by adapter “chapter” units.
- Provide ZIP export for many MP3 files (streamed).
API design:
- POST /api/audio/convert?mode=chapters&format=mp3 -> returns stream of a ZIP.
Logging to add:
- Chapter boundaries, byte sizes, cumulative progress in [src/app/api/audio/convert/route.ts](src/app/api/audio/convert/route.ts:1).
Acceptance:
- A multi-chapter EPUB produces N mp3 parts named “NN - Chapter Title.mp3”; total duration ~ sum of parts; ZIP streamed without timeouts in Docker.

Issue #48 — Failed export after complete render with Kokoro
Type: Bug (large-book export)
Observations:
- UI reaches 100% then resets, no download.
- Docker shows “fin … undefined”, likely final transfer problem (not TTS).
Likely root causes:
- Final m4b delivery uses single huge arrayBuffer; browser memory/timeout.
- Missing Content-Disposition/Range; no resumable download.
- Temp-file lifecycle cleanup racing with response.
Ideas for remediation:
- Serve final artifact as file on disk with streaming and Range:
  - New endpoint: GET /api/audio/convert/download?bookId=… that streams file with Accept-Ranges.
  - UI performs streamed download; no arrayBuffer buffering.
- Optionally support S3-compatible offload in future.
Touched modules:
- [src/app/api/audio/convert/route.ts](src/app/api/audio/convert/route.ts:1)
Instrumentation to add:
- Book ID, file size on disk, stream chunk counts, and client-abort detection.
- Add explicit log/error surfaces at:
  - [src/app/api/audio/convert/route.ts](src/app/api/audio/convert/route.ts:1)
Acceptance:
- 1–2 GB m4b exports download in Docker without UI reset; bookId persists until deletion; status 206 Range works.

Issue #47 — Kokoro combined voices (“+” syntax)
Type: Feature
Intent:
- Support voice strings like “bf_emma+af_heart” when provider is Kokoro/FastAPI or DeepInfra Kokoro.
Ideas for implementation:
- Allow free-form voice string entry and pass-through if not in known set.
- Validate known providers; if “+” present, skip voice validation list.

Logging:
- Emit provider, model, raw voice string in request (no PII).
Tests:
- “a+b” voices produce audible combined output; works via DeepInfra pass-through and Kokoro-FastAPI; voice dropdown offers “Custom voice…” input.

Issue #44 — Dialog not being chunked together
Type: Bug (NLP splitting)
Observations:
- Dialog lines split mid-quote; needs grouping.
Proposed improvements:
- Extend [splitIntoSentences()](src/utils/nlp.ts:34) to apply quote-aware grouping.
- When a sentence begins with an opening quote and the next ends with a closing quote, join them before MAX_BLOCK_LENGTH checks.
Ideas for remediation:
- Provide composable splitter strategy wrapping existing utility.
- Add “dialog-preserve” flag toggled in settings.
Logging to add:
- Count of quote-joined sentences; per-page example of before/after lengths.
Acceptance:
- Quoted dialog flows as single units unless exceeding MAX_BLOCK_LENGTH by > X%; regression-safe for non-dialog text.

Issue #40 — PDF left/right extraction margins not working
Type: Bug (PDF extraction)
Observations:
- Current filter uses transform[4]/[5] with width heuristics. Edge cases: missing width, skew, page scale differences.
Likely causes:
- Some pdf.js TextItem miss width; horizontal margins computed but not applied due to scale mismatch.
- Defaults in [src/contexts/ConfigContext.tsx](src/contexts/ConfigContext.tsx:216) set left/right to '0.0' on first run; UX confusion.
Remediation:
- Compute glyph bbox width when width absent using transform matrix.
- Normalize x to [0..1] by dividing by pageWidth; compare to margins reliably.
- Add visual debug overlay (dev mode) to draw margin boxes while extracting.
Code touchpoints:
- [src/utils/pdf.ts](src/utils/pdf.ts:60) extractTextFromPDF(): margin math and width fallback.
Diagnostics to add:
- Per-page: kept/filtered counts, extremes of x positions, computed margins.
Acceptance:
- Test PDFs show left/right trimming correctly; e2e highlight still robust.