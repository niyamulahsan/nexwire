import path from "node:path";
import type { RequestHandler } from "express";
import createError from "http-errors";
import multer from "multer";

export type UploadOptions = {
  /**
   * Form field name that carries the file(s). Matches the client's FormData key.
   */
  field: string;
  /**
   * When set, accepts an array of up to `multiple` files on that field.
   * Omit for a single-file upload (parsed into `req.file`).
   */
  multiple?: number;
  /**
   * Maximum allowed file size in bytes. Defaults to unlimited.
   */
  maxSize?: number;
  /**
   * Allowed file extensions (lowercase, with dot), e.g. [".xlsx", ".xlsb"].
   * Rejects others with a 422 message.
   */
  allowedExtensions?: string[];
  /**
   * Allowed MIME types, e.g. ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].
   * When provided alongside extensions, a file must satisfy both.
   */
  allowedMimeTypes?: string[];
};

export type UploadFieldsSpec = Array<{ name: string; maxCount?: number }>;

function humanSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  return `${Math.round(size * 100) / 100} ${units[i]}`;
}

/**
 * Why: Parses multipart uploads as a reusable Express middleware factory.
 * When: Any route needs to accept file uploads (single, multiple, or labeled fields).
 * Where: Route files via `.api(route, [requireRole(...), upload({...})], handler)`.
 * How: Wraps `multer` (memory storage) so controllers receive `req.file` /
 *      `req.files` buffers and enforce size/extension/MIME rules; failures are
 *      normalized into readable 422 errors before the controller runs.
 */
export function upload(options: UploadOptions): RequestHandler {
  const { field, multiple, maxSize, allowedExtensions, allowedMimeTypes } = options;
  const maxCount = multiple ?? 1;

  const parser = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxSize ?? Infinity,
      files: maxCount
    },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedExtensions?.length && !allowedExtensions.includes(ext)) {
        cb(createError(422, `File must be ${allowedExtensions.join(" or ")}`));
        return;
      }
      if (allowedMimeTypes?.length && !allowedMimeTypes.includes(file.mimetype)) {
        cb(createError(422, `File type ${file.mimetype} is not allowed`));
        return;
      }
      cb(null, true);
    }
  });

  const parse = multiple ? parser.array(field, maxCount) : parser.single(field);

  return (req, res, next) => {
    parse(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError) {
          if (error.code === "LIMIT_FILE_SIZE") {
            next(createError(422, `File size must be less than ${humanSize(maxSize ?? 0)}`));
            return;
          }
          if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
            next(createError(422, `Too many files, max ${maxCount} allowed`));
            return;
          }
          next(createError(422, error.message));
          return;
        }
        next(error);
        return;
      }

      const received = multiple ? Array.isArray(req.files) && req.files.length > 0 : Boolean(req.file);

      if (!received) {
        next(createError(422, "File required"));
        return;
      }

      next();
    });
  };
}

/**
 * Why: Parses multipart forms carrying multiple labeled file fields at once.
 * When: A form uploads several different inputs (e.g. avatar + document) in one request.
 * Where: Route files via `.api(route, [fields([{ name: "avatar" }, { name: "docs", maxCount: 5 }])], handler)`.
 * How: Uses `multer.fields()` and applies shared size/MIME/extension limits to every file.
 */
export function fields(spec: UploadFieldsSpec, options: Omit<UploadOptions, "field" | "multiple"> = {}): RequestHandler {
  const { maxSize, allowedExtensions, allowedMimeTypes } = options;

  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize ?? Infinity },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedExtensions?.length && !allowedExtensions.includes(ext)) {
        cb(createError(422, `File must be ${allowedExtensions.join(" or ")}`));
        return;
      }
      if (allowedMimeTypes?.length && !allowedMimeTypes.includes(file.mimetype)) {
        cb(createError(422, `File type ${file.mimetype} is not allowed`));
        return;
      }
      cb(null, true);
    }
  }).fields(spec);

  return (req, res, next) => {
    parser(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError) {
          if (error.code === "LIMIT_FILE_SIZE") {
            next(createError(422, `File size must be less than ${humanSize(maxSize ?? 0)}`));
            return;
          }
          next(createError(422, error.message));
          return;
        }
        next(error);
        return;
      }

      const files: Express.Multer.File[] = Object.values((req.files as Record<string, Express.Multer.File[]>) ?? {}).flat();
      if (files.length === 0) {
        next(createError(422, "File required"));
        return;
      }

      next();
    });
  };
}
