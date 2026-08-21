import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from "vite";

const workspaceRoot = fileURLToPath(new URL(".", import.meta.url));
const localDatabasePath = resolve(workspaceRoot, ".local-data/roadbooks.json");
let exportPromise: Promise<string> | null = null;

function runLocalExport() {
  if (exportPromise) return exportPromise;
  exportPromise = new Promise<string>((resolveExport, rejectExport) => {
    const child = spawn(process.execPath, ["scripts/export-local.mjs"], {
      cwd: workspaceRoot,
      env: process.env,
    });
    let output = "";
    let errorOutput = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      errorOutput += String(chunk);
    });
    child.on("error", rejectExport);
    child.on("close", (code) => {
      if (code === 0) resolveExport(output);
      else rejectExport(new Error(errorOutput || output || `export exited ${code}`));
    });
  }).finally(() => {
    exportPromise = null;
  });
  return exportPromise;
}

function localDatabasePlugin(): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use("/__tuji/export-dist", async (request, response) => {
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      if (request.method !== "POST") {
        response.statusCode = 405;
        response.end(JSON.stringify({ error: "method_not_allowed" }));
        return;
      }
      try {
        await runLocalExport();
        response.end(await readFile(resolve(workspaceRoot, "dist/data/export-info.json"), "utf8"));
      } catch (error) {
        response.statusCode = 500;
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : "dist_export_failed",
          }),
        );
      }
    });

    server.middlewares.use("/__tuji/local-db", async (request, response) => {
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      if (request.method === "GET") {
        try {
          response.end(await readFile(localDatabasePath, "utf8"));
        } catch {
          response.statusCode = 404;
          response.end(JSON.stringify({ error: "local_database_not_found" }));
        }
        return;
      }
      if (request.method !== "PUT") {
        response.statusCode = 405;
        response.end(JSON.stringify({ error: "method_not_allowed" }));
        return;
      }

      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 25 * 1024 * 1024) {
          response.statusCode = 413;
          response.end(JSON.stringify({ error: "database_too_large" }));
          return;
        }
      }
      try {
        const snapshot = JSON.parse(body);
        if (!snapshot?.savedAt || !Array.isArray(snapshot?.roadbooks)) {
          throw new Error("invalid database");
        }
        await mkdir(dirname(localDatabasePath), { recursive: true });
        const temporaryPath = `${localDatabasePath}.tmp`;
        await writeFile(temporaryPath, JSON.stringify(snapshot, null, 2), "utf8");
        await rename(temporaryPath, localDatabasePath);
        response.end(JSON.stringify({ saved: true }));
      } catch {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: "invalid_database" }));
      }
    });
  };

  return {
    name: "tuji-local-database",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), localDatabasePlugin()],
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
