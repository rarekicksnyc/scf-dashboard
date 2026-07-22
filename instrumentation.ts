// Runs once when the server starts (Next.js instrumentation hook).
//
// The Postgres-backed persistence lives in a separate node-only module that is
// imported ONLY in the Node.js runtime. Guarding the dynamic import this way
// lets the edge runtime (used by the password middleware) drop it entirely, so
// the Postgres driver is never bundled for the edge.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPersistence } = await import("./instrumentation-node");
    await startPersistence();
  }
}
