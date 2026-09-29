import crypto from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectAclCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { storageConfig } from "@/config/index.js";
import { CircuitBreaker } from "@/framework/circuit-breaker/cb.js";

type Disk = "public" | "private" | "tmp";
type FileData = string | Buffer | Uint8Array | ArrayBuffer | Blob | File;
type Visibility = "public" | "private";
type StorageDriver = "local" | "s3";

const root = path.resolve(process.cwd(), "src/storage/app");
const disks: Record<Disk, string> = {
  public: path.join(root, "public"),
  private: path.join(root, "private"),
  tmp: path.join(root, "tmp")
};

const driver: StorageDriver = storageConfig.driver as StorageDriver;
const defaultDisk: Disk = storageConfig.defaultDisk as Disk;
const s3 =
  driver === "s3"
    ? new S3Client({
        region: storageConfig.region,
        endpoint: storageConfig.endpoint,
        forcePathStyle: storageConfig.forcePathStyle,
        credentials:
          storageConfig.accessKeyId && storageConfig.secretAccessKey
            ? {
                accessKeyId: storageConfig.accessKeyId,
                secretAccessKey: storageConfig.secretAccessKey
              }
            : undefined
      })
    : null;

let storageBreaker: CircuitBreaker | null = null;
if (s3) {
  storageBreaker = new CircuitBreaker();
  const originalSend = (s3 as any).send.bind(s3);
  (s3 as any).send = <T>(command: any): Promise<T> => {
    return storageBreaker!.exec(() => originalSend(command));
  };
}

/**
 * Why: Enforces normalized and safe relative storage paths.
 * When: Any public API receives a file or directory key.
 * Where: Internal storage key/path helpers.
 * How: Converts separators, trims leading slashes, and blocks traversal.
 */
function clean(input: string) {
  const value = input.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!value || value.includes("..")) throw new Error("Invalid storage path");
  return value;
}

/**
 * Why: Keeps per-disk namespace explicit for object-key generation.
 * When: Building storage keys for local/S3 operations.
 * Where: Internal key composition helpers.
 * How: Returns the disk name as current prefix strategy.
 */
function diskPrefix(disk: Disk) {
  return disk;
}

/**
 * Why: Produces canonical object keys shared across storage drivers.
 * When: S3 operations need full object key paths.
 * Where: Internal storage addressing helpers.
 * How: Prefixes sanitized file path with disk namespace.
 */
function objectKey(disk: Disk, file: string) {
  return `${diskPrefix(disk)}/${clean(file)}`;
}

/**
 * Why: Converts heterogeneous file payloads to local-write friendly buffers.
 * When: Local driver persists bytes to filesystem.
 * Where: Internal write pipeline.
 * How: Normalizes supported input types to `Buffer`.
 */
async function toBuffer(data: FileData) {
  if (typeof data === "string") return Buffer.from(data);
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (data instanceof Blob) return Buffer.from(await data.arrayBuffer());
  return Buffer.from([]);
}

/**
 * Why: Converts payloads to body types accepted by S3 PutObject.
 * When: S3 driver uploads new file content.
 * Where: Internal S3 write path.
 * How: Preserves native body types where possible, buffers otherwise.
 */
async function toBody(data: FileData) {
  if (typeof data === "string" || Buffer.isBuffer(data) || data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (data instanceof Blob) return Buffer.from(await data.arrayBuffer());
  return Buffer.from([]);
}

/**
 * Why: Resolves normalized absolute filesystem paths for local storage.
 * When: Local driver reads/writes/removes files or directories.
 * Where: Internal local adapter helpers.
 * How: Joins disk root with sanitized relative file path.
 */
function abs(disk: Disk, file: string) {
  return path.join(disks[disk], clean(file));
}

/**
 * Why: Writes content using the active storage driver.
 * When: Any upload/write API stores a file.
 * Where: Core storage mutation helpers.
 * How: Uploads object to S3 or writes bytes to local disk path.
 */
async function put(disk: Disk, file: string, data: FileData) {
  if (driver === "s3") {
    await s3?.send(
      new PutObjectCommand({
        Bucket: storageConfig.bucket,
        Key: objectKey(disk, file),
        Body: await toBody(data),
        ACL: disk === "public" ? "public-read" : "private"
      })
    );
    return clean(file);
  }

  const filePath = abs(disk, file);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, await toBuffer(data));
  return clean(file);
}

/**
 * Why: Stores browser-style File inputs with deterministic naming.
 * When: Multipart uploads are written into storage.
 * Where: Upload helper path.
 * How: Uses provided name or generates unique timestamp+uuid filename.
 */
async function putFile(disk: Disk, directory: string, file: File, name?: string) {
  const finalName = name || `${Date.now()}-${crypto.randomUUID()}-${file.name}`;
  return await put(disk, path.posix.join(clean(directory), finalName), file);
}

/**
 * Why: Persists generated artifacts in temporary disk space.
 * When: Server prepares export/download content before client fetch.
 * Where: Generated-download lifecycle.
 * How: Sanitizes prefix/extension and writes uniquely named tmp file.
 */
async function writeGeneratedTemp(prefix: string, extension: string, data: FileData) {
  const safePrefix = clean(prefix).replace(/\//g, "-");
  const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "tmp";
  const fileName = `${Date.now()}-${crypto.randomUUID()}-${safePrefix}.${safeExtension}`;
  const file = path.posix.join("generated", fileName);
  await put("tmp", file, data);
  return file;
}

/**
 * Why: Streams a generated artifact directly into tmp storage without buffering.
 * When: Background jobs produce large files (Excel/PDF) that should never live in RAM.
 * Where: Export job pipelines.
 * How: Sanitizes prefix/extension, pipes the source stream through writeStream.
 */
async function writeGeneratedTempStream(prefix: string, extension: string, stream: Readable) {
  const safePrefix = clean(prefix).replace(/\//g, "-");
  const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "tmp";
  const fileName = `${Date.now()}-${crypto.randomUUID()}-${safePrefix}.${safeExtension}`;
  const file = path.posix.join("generated", fileName);
  await writeStream("tmp", file, stream);
  return file;
}

/**
 * Why: Supports temporary generated file handoff with auto-cleanup.
 * When: Download flow consumes generated artifact once.
 * Where: Temp storage lifecycle helpers.
 * How: Reads object/file bytes then removes original temp entry.
 */
async function consumeGeneratedTemp(file: string) {
  const target = clean(file);
  if (driver === "s3") {
    const output = await s3?.send(
      new GetObjectCommand({
        Bucket: storageConfig.bucket,
        Key: objectKey("tmp", target)
      })
    );
    const body = output?.Body ? Buffer.from(await output.Body.transformToByteArray()) : Buffer.from([]);
    await s3?.send(
      new DeleteObjectCommand({
        Bucket: storageConfig.bucket,
        Key: objectKey("tmp", target)
      })
    );
    return body;
  }

  const content = await fs.readFile(abs("tmp", target));
  await fs.rm(abs("tmp", target), { force: true });
  return content;
}

/**
 * Why: Checks whether a file currently exists on selected disk.
 * When: Flows need precondition checks before read/move/delete.
 * Where: Storage existence helpers.
 * How: Uses S3 head-object probe or local filesystem access.
 */
async function exists(disk: Disk, file: string) {
  if (driver === "s3") {
    try {
      await s3?.send(new HeadObjectCommand({ Bucket: storageConfig.bucket, Key: objectKey(disk, file) }));
      return true;
    } catch {
      return false;
    }
  }

  try {
    await fs.access(abs(disk, file));
    return true;
  } catch {
    return false;
  }
}

/**
 * Why: Deletes a single file/object from storage.
 * When: Features remove uploads or cleanup generated files.
 * Where: Storage mutation helpers.
 * How: Calls S3 delete-object or local `fs.rm` with force.
 */
async function remove(disk: Disk, file: string) {
  if (driver === "s3") {
    await s3?.send(new DeleteObjectCommand({ Bucket: storageConfig.bucket, Key: objectKey(disk, file) }));
    return;
  }

  await fs.rm(abs(disk, file), { force: true });
}

/**
 * Why: Reads full file content from storage into memory.
 * When: Controllers/services need raw bytes for processing/response.
 * Where: Storage read helpers.
 * How: Downloads S3 object bytes or reads local file buffer.
 */
async function read(disk: Disk, file: string) {
  if (driver === "s3") {
    const output = await s3?.send(new GetObjectCommand({ Bucket: storageConfig.bucket, Key: objectKey(disk, file) }));
    return output?.Body ? Buffer.from(await output.Body.transformToByteArray()) : Buffer.from([]);
  }

  return fs.readFile(abs(disk, file));
}

/**
 * Why: Duplicates a file within the same disk namespace.
 * When: Workflows need cloned artifacts without deleting source.
 * Where: Storage copy helpers.
 * How: Uses S3 copy-object or local copyFile with parent mkdir.
 */
async function copyFile(disk: Disk, from: string, to: string) {
  if (driver === "s3") {
    await s3?.send(
      new CopyObjectCommand({
        Bucket: storageConfig.bucket,
        CopySource: `${storageConfig.bucket}/${objectKey(disk, from)}`,
        Key: objectKey(disk, to)
      })
    );
    return clean(to);
  }

  await fs.mkdir(path.dirname(abs(disk, to)), { recursive: true });
  await fs.copyFile(abs(disk, from), abs(disk, to));
  return clean(to);
}

/**
 * Why: Moves a file to a new location within a disk.
 * When: Renaming or relocating stored artifacts.
 * Where: Storage move helpers.
 * How: Copy+delete on S3, rename on local filesystem.
 */
async function moveFile(disk: Disk, from: string, to: string) {
  if (driver === "s3") {
    await copyFile(disk, from, to);
    await remove(disk, from);
    return clean(to);
  }

  await fs.mkdir(path.dirname(abs(disk, to)), { recursive: true });
  await fs.rename(abs(disk, from), abs(disk, to));
  return clean(to);
}

/**
 * Why: Returns portable metadata required by file-management features.
 * When: API/UI requests file size, mime, or modification timestamp.
 * Where: Storage metadata helpers.
 * How: Reads object headers on S3 or local file stats.
 */
async function metadata(disk: Disk, file: string) {
  if (driver === "s3") {
    const head = await s3?.send(new HeadObjectCommand({ Bucket: storageConfig.bucket, Key: objectKey(disk, file) }));
    return {
      size: Number(head?.ContentLength || 0),
      mimeType: head?.ContentType || "application/octet-stream",
      lastModified: head?.LastModified ? head.LastModified.getTime() : 0
    };
  }

  const stat = await fs.stat(abs(disk, file));
  return {
    size: stat.size,
    mimeType: "application/octet-stream",
    lastModified: stat.mtimeMs
  };
}

/**
 * Why: Provides short-lived access links for storage objects.
 * When: Clients need direct download access without proxying bytes.
 * Where: Storage facade URL utilities.
 * How: Signs S3 URL with TTL or maps local file to `/storage/*` route.
 */
async function temporaryUrl(disk: Disk, file: string, ttl = storageConfig.signedUrlTtlSeconds) {
  if (driver === "s3") {
    return getSignedUrl(
      s3 as S3Client,
      new GetObjectCommand({
        Bucket: storageConfig.bucket,
        Key: objectKey(disk, file)
      }),
      { expiresIn: ttl }
    );
  }

  return `/storage/${clean(file)}`;
}

/**
 * Why: Lists flat file entries in a disk directory.
 * When: Features need browse/select behavior for stored files.
 * Where: Storage listing helpers.
 * How: Uses S3 object prefix scan or local directory read.
 */
async function listFiles(disk: Disk, directory = "") {
  const dir = clean(directory || "root").replace(/^root$/, "");
  if (driver === "s3") {
    const out = await s3?.send(
      new ListObjectsV2Command({
        Bucket: storageConfig.bucket,
        Prefix: `${diskPrefix(disk)}/${dir}`.replace(/\/$/, "")
      })
    );

    return (out?.Contents || [])
      .map((item) => String(item.Key || ""))
      .filter(Boolean)
      .map((key) => key.replace(`${diskPrefix(disk)}/`, ""));
  }

  const base = abs(disk, dir || ".");
  const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => [] as any[]);
  return entries.filter((entry) => entry.isFile()).map((entry) => (dir ? `${dir}/` : "") + entry.name);
}

/**
 * Why: Exposes readable streams from either local or S3 backends.
 * When: Responses or processors need streamed file access.
 * Where: Storage streaming helpers.
 * How: Adapts S3 web stream to Node Readable or wraps local bytes.
 */
async function readStream(disk: Disk, file: string) {
  if (driver === "s3") {
    const output = await s3?.send(new GetObjectCommand({ Bucket: storageConfig.bucket, Key: objectKey(disk, file) }));

    const body = output?.Body;

    if (!body) return Readable.from([]);

    if ("transformToWebStream" in body && typeof body.transformToWebStream === "function") {
      const webStream = body.transformToWebStream();
      return Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]);
    }

    if ("transformToByteArray" in body && typeof body.transformToByteArray === "function") {
      return Readable.from(Buffer.from(await body.transformToByteArray()));
    }

    if (body instanceof Readable) return body;

    return Readable.from([]);
  }

  return Readable.from(await fs.readFile(abs(disk, file)));
}

/**
 * Why: Updates object visibility for S3-backed buckets.
 * When: Business rules toggle between private and public access.
 * Where: Storage ACL helpers.
 * How: Re-copies object to itself with updated ACL metadata.
 */
async function setVisibility(disk: Disk, file: string, visibility: Visibility) {
  if (driver !== "s3") return clean(file);

  await s3?.send(
    new CopyObjectCommand({
      Bucket: storageConfig.bucket,
      CopySource: `${storageConfig.bucket}/${objectKey(disk, file)}`,
      Key: objectKey(disk, file),
      ACL: visibility === "public" ? "public-read" : "private",
      MetadataDirective: "COPY"
    })
  );

  return clean(file);
}

/**
 * Why: Reports effective file visibility in a driver-agnostic way.
 * When: Features need to inspect current public/private access level.
 * Where: Storage ACL query helpers.
 * How: Infers local visibility by disk, or inspects S3 grants.
 */
async function getVisibility(disk: Disk, file: string): Promise<Visibility> {
  if (driver !== "s3") {
    return disk === "public" ? "public" : "private";
  }

  const acl = await s3?.send(
    new GetObjectAclCommand({
      Bucket: storageConfig.bucket,
      Key: objectKey(disk, file)
    })
  );

  const isPublic = (acl?.Grants || []).some(
    (grant) => grant.Grantee?.URI === "http://acs.amazonaws.com/groups/global/AllUsers" && grant.Permission === "READ"
  );

  return isPublic ? "public" : "private";
}

/**
 * Why: Ensures a directory path exists in the selected disk.
 * When: Pre-creating folder structure for grouped file writes.
 * Where: Storage directory helpers.
 * How: Creates S3 folder marker object or local recursive directory.
 */
async function makeDirectory(disk: Disk, directory: string) {
  const dir = clean(directory);
  if (driver === "s3") {
    await s3?.send(
      new PutObjectCommand({
        Bucket: storageConfig.bucket,
        Key: `${diskPrefix(disk)}/${dir}/`,
        Body: ""
      })
    );
    return dir;
  }

  await fs.mkdir(abs(disk, dir), { recursive: true });
  return dir;
}

/**
 * Why: Removes a directory and its stored contents.
 * When: Cleanup flows purge a folder tree.
 * Where: Storage directory mutation helpers.
 * How: Lists and batch-deletes S3 objects or recursively removes local dir.
 */
async function deleteDirectory(disk: Disk, directory: string) {
  const dir = clean(directory);
  if (driver === "s3") {
    const prefix = `${diskPrefix(disk)}/${dir}/`;
    const listed = await s3?.send(
      new ListObjectsV2Command({
        Bucket: storageConfig.bucket,
        Prefix: prefix
      })
    );

    const objects = (listed?.Contents || [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key))
      .map((Key) => ({ Key }));

    if (objects.length > 0) {
      await s3?.send(
        new DeleteObjectsCommand({
          Bucket: storageConfig.bucket,
          Delete: { Objects: objects }
        })
      );
    }

    return;
  }

  await fs.rm(abs(disk, dir), { recursive: true, force: true });
}

/**
 * Why: Lists immediate child directories for a disk path.
 * When: UI/services need folder navigation data.
 * Where: Storage directory listing helpers.
 * How: Uses S3 common-prefix listing or local dirent filtering.
 */
async function listDirectories(disk: Disk, directory = "") {
  const dir = directory.trim() ? clean(directory) : "";
  if (driver === "s3") {
    const prefix = `${diskPrefix(disk)}/${dir}`.replace(/\/$/, "") + (dir ? "/" : "");
    const out = await s3?.send(
      new ListObjectsV2Command({
        Bucket: storageConfig.bucket,
        Prefix: prefix,
        Delimiter: "/"
      })
    );

    return (out?.CommonPrefixes || [])
      .map((item) => String(item.Prefix || ""))
      .filter(Boolean)
      .map((value) => value.replace(`${diskPrefix(disk)}/`, "").replace(/\/$/, ""));
  }

  const base = abs(disk, dir || ".");
  const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => [] as any[]);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => (dir ? `${dir}/` : "") + entry.name);
}

/**
 * Why: Stores readable stream data through unified storage API.
 * When: Upstream producers emit stream output instead of full buffers.
 * Where: Storage stream write helpers.
 * How: Buffers incoming chunks and delegates final write to `put`.
 */
async function writeStream(disk: Disk, file: string, stream: Readable) {
  if (driver === "s3") {
    await new Promise<void>((resolve, reject) => {
      const passThrough = new PassThrough();
      stream.pipe(passThrough);
      passThrough.on("error", reject);
      s3?.send(
        new PutObjectCommand({
          Bucket: storageConfig.bucket,
          Key: objectKey(disk, file),
          Body: passThrough,
          ACL: disk === "public" ? "public-read" : "private"
        })
      )
        .then(() => resolve())
        .catch(reject);
    });
    return clean(file);
  }

  await new Promise<void>((resolve, reject) => {
    const filePath = abs(disk, file);
    fs.mkdir(path.dirname(filePath), { recursive: true })
      .then(() => {
        const ws = createWriteStream(filePath);
        stream.pipe(ws);
        ws.on("error", reject);
        ws.on("close", resolve);
      })
      .catch(reject);
  });
  return clean(file);
}

/**
 * Why: Unified storage facade for local and S3-backed file operations.
 * When: Features need upload/read/move/delete/download or signed URLs.
 * Where: Controllers/jobs and module business logic.
 * How: Routes calls to disk-specific adapters while preserving one API.
 */
export const storage = {
  /**
   * Why: Prepares local disk roots required by the active storage facade.
   * When: Kernel bootstraps framework services.
   * Where: Runtime startup path.
   * How: Creates configured disk directories only for the local driver.
   */
  async init() {
    if (driver === "local") {
      await Promise.all(Object.values(disks).map((disk) => fs.mkdir(disk, { recursive: true })));
    }
  },

  driver,

  defaultDisk,

  /**
   * Why: Exposes a disk-scoped API without duplicating storage logic.
   * When: Features need explicit `public`, `private`, or `tmp` targeting.
   * Where: Controllers, jobs, and other application services.
   * How: Returns thin wrappers around internal helpers bound to one disk.
   */
  disk(disk: Disk) {
    return {
      put: (file: string, data: FileData) => put(disk, file, data),
      putFile: (directory: string, file: File, name?: string) => putFile(disk, directory, file, name),
      get: (file: string) => read(disk, file),
      delete: (file: string) => remove(disk, file),
      copy: (from: string, to: string) => copyFile(disk, from, to),
      move: (from: string, to: string) => moveFile(disk, from, to),
      exists: (file: string) => exists(disk, file),
      missing: async (file: string) => !(await exists(disk, file)),
      size: async (file: string) => (await metadata(disk, file)).size,
      mimeType: async (file: string) => (await metadata(disk, file)).mimeType,
      lastModified: async (file: string) => (await metadata(disk, file)).lastModified,
      files: (directory = "") => listFiles(disk, directory),
      directories: (directory = "") => listDirectories(disk, directory),
      makeDirectory: (directory: string) => makeDirectory(disk, directory),
      deleteDirectory: (directory: string) => deleteDirectory(disk, directory),
      readStream: (file: string) => readStream(disk, file),
      writeStream: (file: string, stream: Readable) => writeStream(disk, file, stream),
      temporaryUrl: (file: string, ttl?: number) => temporaryUrl(disk, file, ttl),
      setVisibility: (file: string, visibility: Visibility) => setVisibility(disk, file, visibility),
      getVisibility: (file: string) => getVisibility(disk, file),
      path: (file: string) => abs(disk, file),
      url: (file: string) =>
        driver === "s3"
          ? `${storageConfig.endpoint || "https://s3.amazonaws.com"}/${storageConfig.bucket}/${objectKey(disk, file)}`
          : `/storage/${clean(file)}`
    };
  },

  url(file: string) {
    return storage.disk(defaultDisk).url(file);
  },

  put(file: string, data: FileData) {
    return storage.disk(defaultDisk).put(file, data);
  },

  putFile(directory: string, file: File, name?: string) {
    return storage.disk(defaultDisk).putFile(directory, file, name);
  },

  get(file: string) {
    return storage.disk(defaultDisk).get(file);
  },

  delete(file: string) {
    return storage.disk(defaultDisk).delete(file);
  },

  copy(from: string, to: string) {
    return storage.disk(defaultDisk).copy(from, to);
  },

  move(from: string, to: string) {
    return storage.disk(defaultDisk).move(from, to);
  },

  exists(file: string) {
    return storage.disk(defaultDisk).exists(file);
  },

  missing(file: string) {
    return storage.disk(defaultDisk).missing(file);
  },

  files(directory = "") {
    return storage.disk(defaultDisk).files(directory);
  },

  directories(directory = "") {
    return storage.disk(defaultDisk).directories(directory);
  },

  makeDirectory(directory: string) {
    return storage.disk(defaultDisk).makeDirectory(directory);
  },

  deleteDirectory(directory: string) {
    return storage.disk(defaultDisk).deleteDirectory(directory);
  },

  size(file: string) {
    return storage.disk(defaultDisk).size(file);
  },

  mime(file: string) {
    return storage.disk(defaultDisk).mimeType(file);
  },

  mimeType(file: string) {
    return storage.disk(defaultDisk).mimeType(file);
  },

  lastModified(file: string) {
    return storage.disk(defaultDisk).lastModified(file);
  },

  readStream(file: string) {
    return storage.disk(defaultDisk).readStream(file);
  },

  writeStream(file: string, stream: Readable) {
    return storage.disk(defaultDisk).writeStream(file, stream);
  },

  temporaryUrl(file: string, ttl?: number) {
    return storage.disk(defaultDisk).temporaryUrl(file, ttl);
  },

  /**
   * Why: Builds a download response from the default disk in one call.
   * When: Endpoints need attachment delivery semantics.
   * Where: Controller-level file download flows.
   * How: Reads file bytes and sets content-type/content-disposition headers.
   */
  async download(_c: any, file: string, filename?: string) {
    const body = await storage.get(file);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": await storage.mime(file),
        "content-disposition": `attachment; filename=${filename || path.posix.basename(clean(file))}`
      }
    });
  },

  /**
   * Why: Creates ephemeral generated files for deferred download flows.
   * When: API produces files (CSV/PDF/etc.) before the client fetches them.
   * Where: Example and business export pipelines.
   * How: Writes into tmp storage using a sanitized prefix and extension.
   */
  async generateForDownload(options: { prefix: string; extension: string; data: FileData }) {
    return await writeGeneratedTemp(options.prefix, options.extension, options.data);
  },

  /**
   * Why: Streams a generated artifact into tmp storage without buffering in RAM.
   * When: Background jobs produce large files (Excel/PDF) that must never be
   *       held in process memory.
   * Where: Export job pipelines.
   * How: Pipes the source stream through writeStream into the tmp disk.
   */
  async generateForDownloadStream(options: { prefix: string; extension: string; stream: Readable }) {
    return await writeGeneratedTempStream(options.prefix, options.extension, options.stream);
  },

  /**
   * Why: Provides read-once semantics for generated temporary artifacts.
   * When: Client consumes a previously generated download token/path.
   * Where: Download handoff endpoints.
   * How: Reads tmp file content and deletes the underlying object afterwards.
   */
  async consumeGenerated(file: string) {
    return await consumeGeneratedTemp(file);
  }
};
