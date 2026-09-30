/**
 * The raw companyfacts payloads, in Azure Blob Storage.
 *
 * In Azure the Function authenticates with its managed identity (no key
 * anywhere); locally, Azurite is reached with the emulator's well-known
 * development connection string. Blobs are written once: a key names one
 * filing, so an existing blob is left as it is, which is also what makes a
 * rerun cheap. The 90-day lifecycle rule that deletes them lives in the
 * infrastructure, not here.
 */

import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import type { RawStore } from "./stores";

export type BlobTarget =
  /** Production: the account URL and the managed identity. */
  | { accountUrl: string; container: string }
  /** Azurite: "UseDevelopmentStorage=true" or an explicit emulator string. */
  | { connectionString: string; container: string };

export function containerFor(target: BlobTarget): ContainerClient {
  const service =
    "connectionString" in target
      ? BlobServiceClient.fromConnectionString(target.connectionString)
      : new BlobServiceClient(target.accountUrl, new DefaultAzureCredential());
  return service.getContainerClient(target.container);
}

/** The part of a container the store uses, so tests can pass a double. */
export interface BlobContainerLike {
  getBlockBlobClient(name: string): {
    upload(body: Buffer, length: number, options: unknown): Promise<unknown>;
  };
}

export function blobRaw(container: BlobContainerLike): RawStore {
  return {
    async put(key, gzipped) {
      try {
        await container.getBlockBlobClient(key).upload(gzipped, gzipped.length, {
          // Create only: a key names one filing, and it does not change.
          conditions: { ifNoneMatch: "*" },
          blobHTTPHeaders: { blobContentType: "application/json", blobContentEncoding: "gzip" },
        });
        return "written";
      } catch (error) {
        if (isAlreadyExists(error)) return "exists";
        throw error;
      }
    },
  };
}

/** 409 BlobAlreadyExists: the create-only condition refused the write. */
function isAlreadyExists(error: unknown): boolean {
  const e = error as { statusCode?: number; code?: string } | null;
  return !!e && (e.statusCode === 409 || e.code === "BlobAlreadyExists");
}
