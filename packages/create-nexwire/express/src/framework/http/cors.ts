import cors from "cors";
import { corsConfig } from "@/config/index.js";

export const corsMiddleware = cors({
  origin: corsConfig.origin === "*" ? true : corsConfig.origin,
  credentials: corsConfig.origin === "*"
});
