import fs from "node:fs";
import path from "node:path";
import express from "express";

const publicDir = path.resolve(process.cwd(), "public");
const storageDir = path.resolve(process.cwd(), "src/storage/app/public");

export function hasUiBuild() {
  return fs.existsSync(path.join(publicDir, "index.html"));
}

export function ensurePublicDir() {
  fs.mkdirSync(publicDir, { recursive: true });
}

export const storageStaticMiddleware = express.static(storageDir, { fallthrough: true });
export const uiStaticMiddleware = express.static(publicDir, { fallthrough: false });

export const uiIndexMiddleware: express.RequestHandler = (_req, res, next) => {
  const indexPath = path.join(publicDir, "index.html");
  if (!fs.existsSync(indexPath)) return next();
  return res.sendFile(indexPath);
};
