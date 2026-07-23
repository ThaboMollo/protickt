import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import { env } from "./env.js";
import { publicRouter } from "./routes/public.js";
import { adminRouter } from "./routes/admin.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { internalRouter } from "./routes/internal.js";
import { tenantsRouter } from "./routes/tenants.js";

const app = express();

app.use(cors({ origin: env.corsOrigins }));

// Keep the raw body around: Paystack webhook signatures are computed over it.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/", publicRouter);
app.use("/tenants", tenantsRouter);
app.use("/admin", adminRouter);
app.use("/webhooks", webhooksRouter);
app.use("/internal", internalRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[api] unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
