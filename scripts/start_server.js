const http = require("http");
const { spawn } = require("child_process");

const port = Number(process.env.PORT || 5000);
const healthPath = "/test";
const expectedHealthMessage = "Server is alive";

function checkExistingServer() {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: healthPath,
        timeout: 1500
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            reachable: true,
            statusCode: response.statusCode,
            body
          });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("timeout"));
    });

    request.on("error", (error) => {
      resolve({ reachable: false, error });
    });
  });
}

function startServerProcess() {
  const child = spawn(process.execPath, ["index.js"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`[START] Server exited with signal ${signal}`);
      process.exit(1);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error(`[START] Failed to launch server: ${error.message}`);
    process.exit(1);
  });
}

async function main() {
  const existing = await checkExistingServer();

  if (!existing.reachable) {
    startServerProcess();
    return;
  }

  let parsedBody = null;
  try {
    parsedBody = existing.body ? JSON.parse(existing.body) : null;
  } catch (error) {
    parsedBody = null;
  }

  if (existing.statusCode === 200 && parsedBody?.message === expectedHealthMessage) {
    console.log(`[START] Sparepart server is already running on http://localhost:${port}`);
    process.exit(0);
    return;
  }

  console.error(
    `[START] Port ${port} is already in use by another service (health check returned ${existing.statusCode}).`
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(`[START] Unexpected startup failure: ${error.message}`);
  process.exit(1);
});