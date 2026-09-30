import { describe, expect, it } from "vitest";
import { blobRaw, type BlobContainerLike } from "../blob";

/** A container that remembers uploads and answers like Azure: 409 on a second create. */
function double(fail?: { statusCode: number; code: string }) {
  const stored = new Map<string, { body: Buffer; options: unknown }>();
  const container: BlobContainerLike = {
    getBlockBlobClient: (name) => ({
      async upload(body, _length, options) {
        if (fail) throw Object.assign(new Error(fail.code), fail);
        if (stored.has(name)) throw Object.assign(new Error("The specified blob already exists."), { statusCode: 409, code: "BlobAlreadyExists" });
        stored.set(name, { body, options });
        return {};
      },
    }),
  };
  return { container, stored };
}

describe("blobRaw", () => {
  it("creates a blob only if it is not there, marked as gzipped JSON", async () => {
    const { container, stored } = double();
    const store = blobRaw(container);
    const body = Buffer.from([1, 2, 3]);
    expect(await store.put("sec/companyfacts/0000320193/a.json.gz", body)).toBe("written");
    expect(await store.put("sec/companyfacts/0000320193/a.json.gz", body)).toBe("exists");
    expect(stored.get("sec/companyfacts/0000320193/a.json.gz")?.options).toEqual({
      conditions: { ifNoneMatch: "*" },
      blobHTTPHeaders: { blobContentType: "application/json", blobContentEncoding: "gzip" },
    });
  });

  it("lets any other failure through, so the company is retried", async () => {
    const { container } = double({ statusCode: 403, code: "AuthorizationPermissionMismatch" });
    await expect(blobRaw(container).put("k", Buffer.from([1]))).rejects.toThrow(/AuthorizationPermissionMismatch/);
  });
});
