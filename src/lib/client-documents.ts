import type { BaseDocument } from '@/types/documents';

export function mimeTypeForDoc(doc: Pick<BaseDocument, 'type' | 'name'>): string {
  if (doc.type === 'pdf') return 'application/pdf';
  if (doc.type === 'epub') return 'application/epub+zip';

  const lower = doc.name.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdown') || lower.endsWith('.mkd')) {
    return 'text/markdown';
  }
  return 'text/plain';
}

export async function listDocuments(options?: { ids?: string[]; signal?: AbortSignal }): Promise<BaseDocument[]> {
  const params = new URLSearchParams();
  params.set('list', 'true');
  if (options?.ids?.length) {
    params.set('ids', options.ids.join(','));
  }

  const res = await fetch(`/api/documents?${params.toString()}`, { signal: options?.signal });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || 'Failed to list documents');
  }

  const data = (await res.json()) as { documents: BaseDocument[] };
  return data.documents || [];
}

export async function getDocumentMetadata(id: string, options?: { signal?: AbortSignal }): Promise<BaseDocument | null> {
  const docs = await listDocuments({ ids: [id], signal: options?.signal });
  return docs[0] ?? null;
}

export async function uploadDocuments(files: File[], options?: { signal?: AbortSignal }): Promise<BaseDocument[]> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }

  const res = await fetch('/api/documents/upload', {
    method: 'POST',
    body: form,
    signal: options?.signal,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || 'Failed to upload documents');
  }

  const data = (await res.json()) as { stored: BaseDocument[] };
  return data.stored || [];
}

export async function deleteDocuments(options?: { ids?: string[]; scope?: 'user' | 'unclaimed'; signal?: AbortSignal }): Promise<void> {
  const params = new URLSearchParams();
  if (options?.ids?.length) {
    params.set('ids', options.ids.join(','));
  }
  if (options?.scope) {
    params.set('scope', options.scope);
  }

  const url = params.toString() ? `/api/documents?${params.toString()}` : '/api/documents';
  const res = await fetch(url, { method: 'DELETE', signal: options?.signal });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || 'Failed to delete documents');
  }
}

export async function downloadDocumentContent(id: string, options?: { signal?: AbortSignal }): Promise<ArrayBuffer> {
  const res = await fetch(`/api/documents/content?id=${encodeURIComponent(id)}`, { signal: options?.signal });
  if (!res.ok) {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error || `Failed to download document (status ${res.status})`);
    }
    throw new Error(`Failed to download document (status ${res.status})`);
  }

  return res.arrayBuffer();
}

export async function getDocumentContentSnippet(
  id: string,
  options?: { maxChars?: number; maxBytes?: number; signal?: AbortSignal },
): Promise<string> {
  const params = new URLSearchParams();
  params.set('id', id);
  params.set('format', 'snippet');
  if (typeof options?.maxChars === 'number') params.set('maxChars', String(options.maxChars));
  if (typeof options?.maxBytes === 'number') params.set('maxBytes', String(options.maxBytes));

  const res = await fetch(`/api/documents/content?${params.toString()}`, { signal: options?.signal });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `Failed to load content snippet (status ${res.status})`);
  }

  const data = (await res.json()) as { snippet?: string };
  return data?.snippet || '';
}

export async function uploadDocxAsPdf(file: File, options?: { signal?: AbortSignal }): Promise<BaseDocument> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch('/api/documents/docx-to-pdf/upload', {
    method: 'POST',
    body: form,
    signal: options?.signal,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || 'Failed to convert DOCX');
  }

  const data = (await res.json()) as { stored: BaseDocument };
  if (!data?.stored) throw new Error('DOCX conversion succeeded but returned no document');
  return data.stored;
}
