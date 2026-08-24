import { createServer } from "node:http";

const port = Number(process.env.MOCK_INNGEST_PORT ?? "8288");

const server = createServer((request, response) => {
  if (request.method === "POST") {
    request.resume();
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ids: ["t023-local-event"], status: 200 }));
    return;
  }

  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: true }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mock Inngest listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
