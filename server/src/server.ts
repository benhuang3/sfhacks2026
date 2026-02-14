import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { connectDB } from "./db";
import scanRoutes from "./routes/scan";
import healthRoutes from "./routes/health";
import powerProfileRoutes from "./routes/powerProfile";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.json({ limit: "5mb" })); // embeddings can be large

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use("/scans", scanRoutes);
app.use("/health", healthRoutes);
app.use("/power-profile", powerProfileRoutes);

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Zod validation errors → 400
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: "Validation failed",
      details: err.errors,
    });
    return;
  }

  // Generic errors → 500
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[error]", err);
  res.status(500).json({ success: false, error: message });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`[server] Listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("[server] Failed to start:", err);
    process.exit(1);
  }
}

main();
