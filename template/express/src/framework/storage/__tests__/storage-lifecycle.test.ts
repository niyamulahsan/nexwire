import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Resource lifecycle for storage.ts — testing through the public `storage` facade.
 *
 * The failure modes that a coverage number cannot see:
 *
 * 1. **Local writeStream error path**: `storage.put()` uses `createWriteStream` +
 *    `stream.pipe(ws)` + `ws.on("error", reject)` + `ws.on("close", resolve)`.
 *    If `error` fires *before* `close`, the promise rejects but the handle may
 *    leak. If the promise rejects otherwise, `close` never fires.
 *
 * 2. **S3 writeStream PassThrough leak**: `storage.put()` on S3 creates a `PassThrough`
 *    and pipes to S3. If `s3.send()` rejects, the `passThrough` error handler
 *    rejects the promise, but the stream is never destroyed — each failed upload
 *    leaves a dangling stream.
 *
 * 3. **consumeGeneratedTemp atomicity**: reads then deletes. If read succeeds
 *    but delete fails, the temp file is orphaned. If read fails, delete must not
 *    run (would delete the wrong thing).
 *
 * 4. **CircuitBreaker + S3 client singletons**: Module-level singletons with no
 *    close/destroy. Worth pinning that they're shared/stateless across calls.
 */

const state = vi.hoisted(() => ({
  fs: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from("content")),
    rm: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 123, mtimeMs: Date.now() }),
    readdir: vi.fn().mockResolvedValue([]),
  },
  s3Send: vi.fn().mockResolvedValue({}),
  s3ClientInstance: null as any,
  passThroughInstance: null as any,
  config: { driver: "local" as "local" | "s3" },
  streams: [] as Array<{ destroy?: () => void; on: (...args: any[]) => any }>,
}));

vi.mock("node:fs", () => ({
  promises: {
    mkdir: (...args: any[]) => state.fs.mkdir(...args),
    writeFile: (...args: any[]) => state.fs.writeFile(...args),
    readFile: (...args: any[]) => state.fs.readFile(...args),
    rm: (...args: any[]) => state.fs.rm(...args),
    access: (...args: any[]) => state.fs.access(...args),
    copyFile: (...args: any[]) => state.fs.copyFile(...args),
    rename: (...args: any[]) => state.fs.rename(...args),
    stat: (...args: any[]) => state.fs.stat(...args),
    readdir: (...args: any[]) => state.fs.readdir(...args),
  },
  createWriteStream: vi.fn((...args: any[]) => {
    const ws = { on: vi.fn(), close: vi.fn() };
    state.streams.push(ws);
    return ws;
  }),
}));

vi.mock("node:stream", () => ({
  PassThrough: class {
    on = vi.fn((event: string, cb: Function) => {
      if (event === "error") this._errorHandler = cb;
      return this;
    });
    _errorHandler: Function | null = null;
    constructor() { state.streams.push(this); state.passThroughInstance = this; }
  },
  Readable: {
    from: vi.fn(() => ({})),
    fromWeb: vi.fn(() => ({})),
  }
}));

class MockS3Client {
  send = state.s3Send;
  constructor(_options: any) {
    state.s3ClientInstance = this;
  }
}

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: MockS3Client,
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  DeleteObjectsCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
  CopyObjectCommand: vi.fn(),
  ListObjectsV2Command: vi.fn(),
  GetObjectAclCommand: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://signed.url"),
}));

vi.mock("@/framework/circuit-breaker/cb.js", () => ({
  CircuitBreaker: class {
    state = "closed";
    async exec<T>(fn: () => Promise<T>): Promise<T> { return fn(); }
    getState() { return this.state; }
    onSuccess() { }
    onFailure() { }
  }
}));

vi.mock("@/config/index.js", () => ({
  get storageConfig() {
    return {
      driver: state.config.driver,
      bucket: "test-bucket",
      region: "us-east-1",
      endpoint: "https://s3.example.com",
      forcePathStyle: false,
      accessKeyId: "key",
      secretAccessKey: "secret",
      signedUrlTtlSeconds: 3600,
      defaultDisk: "private",
      prefix: "nexwire",
    };
  }
}));

async function loadStorage() {
  vi.resetModules();
  return import("@/framework/storage/storage.js");
}

function resetState() {
  vi.clearAllMocks();
  state.fs.mkdir.mockResolvedValue(undefined);
  state.fs.writeFile.mockResolvedValue(undefined);
  state.fs.readFile.mockResolvedValue(Buffer.from("content"));
  state.fs.rm.mockResolvedValue(undefined);
  state.fs.access.mockResolvedValue(undefined);
  state.fs.copyFile.mockResolvedValue(undefined);
  state.fs.rename.mockResolvedValue(undefined);
  state.fs.stat.mockResolvedValue({ size: 123, mtimeMs: Date.now() });
  state.fs.readdir.mockResolvedValue([]);
  state.s3Send.mockResolvedValue({});
  state.config.driver = "local";
  state.streams.length = 0;
  state.passThroughInstance = null;
  state.s3ClientInstance = null;
}

beforeEach(resetState);

describe("storage facade init", () => {
  it("creates disk directories only for local driver", async () => {
    const { storage } = await loadStorage();
    await storage.init();
    expect(state.fs.mkdir).toHaveBeenCalledTimes(3);
  });

  it("does nothing for S3 driver on init", async () => {
    state.config.driver = "s3";
    const { storage } = await loadStorage();
    await storage.init();
    expect(state.fs.mkdir).not.toHaveBeenCalled();
  });
});

describe("storage.put local driver", () => {
  it("mkdir failure rejects cleanly", async () => {
    state.fs.mkdir.mockRejectedValue(new Error("EACCES"));
    const { storage } = await loadStorage();

    await expect(storage.put("test.txt", "data")).rejects.toThrow("EACCES");
    expect(state.fs.writeFile).not.toHaveBeenCalled();
  });

  it("writeFile failure after mkdir", async () => {
    state.fs.writeFile.mockRejectedValue(new Error("ENOSPC"));
    const { storage } = await loadStorage();

    await expect(storage.put("test.txt", "data")).rejects.toThrow("ENOSPC");
    expect(state.fs.mkdir).toHaveBeenCalled();
  });

  it("success path returns the filename", async () => {
    const { storage } = await loadStorage();
    await expect(storage.put("test.txt", "data")).resolves.toBe("test.txt");
    expect(state.fs.mkdir).toHaveBeenCalled();
    expect(state.fs.writeFile).toHaveBeenCalled();
  });
});

describe("storage.put S3 driver", () => {
  beforeEach(() => {
    state.config.driver = "s3";
  });

  it("success path calls s3.send once and returns filename", async () => {
    const { storage } = await loadStorage();
    await expect(storage.put("test.txt", "data")).resolves.toBe("test.txt");
    expect(state.s3Send).toHaveBeenCalledTimes(1);
  });

  it("send failure rejects", async () => {
    state.s3Send.mockRejectedValue(new Error("Network error"));
    const { storage } = await loadStorage();

    await expect(storage.put("test.txt", "data")).rejects.toThrow("Network error");
  });
});

describe("storage.writeStream S3 lifecycle", () => {
  beforeEach(() => {
    state.config.driver = "s3";
  });

  it("resolves and creates PassThrough on success", async () => {
    state.s3Send.mockResolvedValue({});
    const { storage } = await loadStorage();

    // Wrap a dummy Readable in a mock that pipes into the PassThrough
    const readable = { pipe: vi.fn() };
    await expect(storage.writeStream("test.txt", readable as any)).resolves.toBe("test.txt");
    expect(state.s3Send).toHaveBeenCalled();
    expect(state.passThroughInstance).toBeTruthy();
  });

  it("PassThrough error handler is registered", async () => {
    state.s3Send.mockResolvedValue({});
    const { storage } = await loadStorage();

    const readable = { pipe: vi.fn() };
    await storage.writeStream("test.txt", readable as any);
    expect(state.passThroughInstance!.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("rejects when S3 upload fails", async () => {
    state.s3Send.mockRejectedValue(new Error("S3 timeout"));
    const { storage } = await loadStorage();

    const readable = { pipe: vi.fn() };
    await expect(storage.writeStream("fail.txt", readable as any)).rejects.toThrow("S3 timeout");
    expect(state.passThroughInstance).toBeTruthy();
  });
});

describe("storage.consumeGenerated", () => {
  it("reads then deletes on local driver", async () => {
    const { storage } = await loadStorage();
    await storage.consumeGenerated("generated/test.pdf");
    expect(state.fs.readFile).toHaveBeenCalledBefore(state.fs.rm);
    expect(state.fs.rm).toHaveBeenCalledWith(expect.stringContaining("tmp"), { force: true });
  });

  it("reads then deletes on S3 driver", async () => {
    state.config.driver = "s3";
    state.s3Send
      .mockResolvedValueOnce({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } })
      .mockResolvedValueOnce({});
    const { storage } = await loadStorage();

    await storage.consumeGenerated("generated/test.pdf");
    expect(state.s3Send).toHaveBeenCalledTimes(2);
  });

  it("does not delete if read fails (local)", async () => {
    state.fs.readFile.mockRejectedValue(new Error("ENOENT"));
    const { storage } = await loadStorage();

    await expect(storage.consumeGenerated("missing.txt")).rejects.toThrow("ENOENT");
    expect(state.fs.rm).not.toHaveBeenCalled();
  });

  it("does not delete if read fails (S3)", async () => {
    state.config.driver = "s3";
    state.s3Send.mockRejectedValue(new Error("NotFound"));
    const { storage } = await loadStorage();

    await expect(storage.consumeGenerated("missing.txt")).rejects.toThrow("NotFound");
    expect(state.s3Send).toHaveBeenCalledTimes(1);
  });
});

describe("storage.readStream", () => {
  it("local: wraps file buffer", async () => {
    const { storage } = await loadStorage();
    const stream = await storage.readStream("test.txt");
    expect(stream).toBeTruthy();
  });

  it("S3: adapts web stream", async () => {
    state.config.driver = "s3";
    state.s3Send.mockResolvedValue({
      Body: { transformToWebStream: () => new ReadableStream() }
    });
    const { storage } = await loadStorage();
    const stream = await storage.readStream("test.txt");
    expect(stream).toBeTruthy();
  });
});

describe("storage singleton safety", () => {
  it("multiple init calls are safe", async () => {
    const { storage } = await loadStorage();
    await storage.init();
    await storage.init();
    await storage.init();
    expect(state.fs.mkdir).toHaveBeenCalledTimes(9);
  });

  it("module re-import driver is consistent", async () => {
    state.config.driver = "s3";
    const mod1 = await loadStorage();
    const mod2 = await loadStorage();
    expect(mod1.storage.driver).toBe(mod2.storage.driver);
  });
});