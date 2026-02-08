import fs from 'fs/promises';
import path from 'path';

async function listWorkerNamespaces(documentsRoot: string): Promise<string[]> {
  let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
  try {
    entries = await fs.readdir(documentsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => /^(chromium|firefox|webkit)-worker\d+$/.test(name));
}

export default async function globalTeardown(): Promise<void> {
  const documentsRoot = path.join(process.cwd(), 'docstore', 'documents_v1');
  const namespaces = await listWorkerNamespaces(documentsRoot);
  if (!namespaces.length) return;

  await Promise.all(
    namespaces.map(async (ns) => {
      const dir = path.join(documentsRoot, ns);
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }),
  );
}
