import { deleteDocumentPrefix } from '../src/lib/server/documents-blobstore';
import { getS3Config, isS3Configured } from '../src/lib/server/s3';

export default async function globalTeardown(): Promise<void> {
  if (!isS3Configured()) return;

  const config = getS3Config();
  const nsRootPrefix = `${config.prefix}/documents_v1/ns/`;
  await deleteDocumentPrefix(nsRootPrefix);
}

