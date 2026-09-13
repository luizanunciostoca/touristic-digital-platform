import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Pool } from "mysql2/promise";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FilesystemCrmStorageAdapter,
  S3CrmStorageAdapter,
} from "./crm-storage-adapter.js";

function fakePool(): Pool {
  return {
    execute: vi.fn(),
  } as unknown as Pool;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CRM storage path hardening", () => {
  it("rejects traversal, absolute paths, backslashes and invalid buckets before IO", async () => {
    const pool = fakePool();
    const adapter = new FilesystemCrmStorageAdapter(pool, "/tmp/crm-storage");

    await expect(adapter.download("crm-files", "../outside.pdf")).rejects.toThrow(
      "CRM_STORAGE_OBJECT_KEY_INVALID",
    );
    await expect(adapter.download("crm-files", "/absolute.pdf")).rejects.toThrow(
      "CRM_STORAGE_OBJECT_KEY_INVALID",
    );
    await expect(
      adapter.download("crm-files", "folder\\windows-path.pdf"),
    ).rejects.toThrow("CRM_STORAGE_OBJECT_KEY_INVALID");
    await expect(adapter.download("../bucket", "file.pdf")).rejects.toThrow(
      "CRM_STORAGE_BUCKET_INVALID",
    );
    await expect(adapter.download("crm-files", "folder//file.pdf")).rejects.toThrow(
      "CRM_STORAGE_OBJECT_KEY_INVALID",
    );

    expect(pool.execute).not.toHaveBeenCalled();
  });

  it("preserves valid nested filesystem object keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "crm-storage-"));
    const nestedDirectory = join(root, "crm-files", "lead-7");
    await mkdir(nestedDirectory, { recursive: true });
    await writeFile(join(nestedDirectory, "contract.pdf"), "contract-body");

    try {
      const adapter = new FilesystemCrmStorageAdapter(fakePool(), root);
      const data = await adapter.download(
        "crm-files",
        "lead-7/contract.pdf",
      );
      expect(data?.toString("utf8")).toBe("contract-body");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects invalid upload locations before writing or persisting metadata", async () => {
    const pool = fakePool();
    const adapter = new FilesystemCrmStorageAdapter(pool, "/tmp/crm-storage");

    await expect(
      adapter.upload({
        bucket: "crm-files",
        objectKey: "lead-7/../../escape.pdf",
        contentType: "application/pdf",
        data: Buffer.from("blocked"),
        uploadedBySubject: "subject-1",
      }),
    ).rejects.toThrow("CRM_STORAGE_OBJECT_KEY_INVALID");

    expect(pool.execute).not.toHaveBeenCalled();
  });

  it("encodes every S3 path segment instead of concatenating raw object keys", async () => {
    const fetchMock = vi.fn(async () => new Response("payload", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new S3CrmStorageAdapter(
      fakePool(),
      "https://storage.example.test/root",
      "test-access-key",
      "test-secret-key",
    );

    const data = await adapter.download(
      "crm-files",
      "folder/a b?#.pdf",
    );

    expect(data?.toString("utf8")).toBe("payload");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://storage.example.test/root/crm-files/folder/a%20b%3F%23.pdf",
    );
  });

  it("rejects traversal before issuing an S3 request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new S3CrmStorageAdapter(
      fakePool(),
      "https://storage.example.test",
      "test-access-key",
      "test-secret-key",
    );

    await expect(
      adapter.download("crm-files", "folder/../escape.pdf"),
    ).rejects.toThrow("CRM_STORAGE_OBJECT_KEY_INVALID");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
