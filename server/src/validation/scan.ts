import { z } from "zod";

const EMBEDDING_DIM = 768;

const deviceSpecsSchema = z.object({
  avgWatts: z.number().optional(),
  standbyWatts: z.number().optional(),
  source: z.string().optional(),
});

/** Validates the body of POST /scans */
export const insertScanSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  imageUrl: z.string().url().optional(),
  imageHash: z.string().optional(),
  embedding: z
    .array(z.number())
    .length(EMBEDDING_DIM, `embedding must have exactly ${EMBEDDING_DIM} dimensions`),
  label: z.string().min(1, "label is required"),
  confidence: z.number().min(0).max(1),
  deviceSpecs: deviceSpecsSchema.optional(),
});

/** Validates the body of POST /scans/similar */
export const similarSearchSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  embedding: z
    .array(z.number())
    .length(EMBEDDING_DIM, `embedding must have exactly ${EMBEDDING_DIM} dimensions`),
  k: z.number().int().min(1).max(20).default(3),
});

/** Validates the body of POST /scans/resolve */
export const resolveSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  imageUrl: z.string().url().optional(),
  imageHash: z.string().optional(),
  embedding: z
    .array(z.number())
    .length(EMBEDDING_DIM, `embedding must have exactly ${EMBEDDING_DIM} dimensions`),
});
