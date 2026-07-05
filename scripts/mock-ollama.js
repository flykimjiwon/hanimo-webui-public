/**
 * Mock Ollama / OpenAI-compatible model server — zero dependencies (built-in http only).
 * Author: Kim Jiwon (김지원) https://github.com/flykimjiwon · License: Apache-2.0
 *
 * Lets you develop/test hanimo-webui (model list, chat, round-robin load balancing)
 * WITHOUT installing a real Ollama or GPU. Simulates request -> loading -> response.
 *
 * Usage:
 *   node scripts/mock-ollama.js <port> <id>
 *   # round-robin demo (3 fake servers):
 *   node scripts/mock-ollama.js 11434 mockA & \
 *   node scripts/mock-ollama.js 11435 mockB & \
 *   node scripts/mock-ollama.js 11436 mockC &
 *   # then register all three under the SAME name in Admin > Model Servers,
 *   # and requests round-robin across them.
 *
 * Implements: GET /api/tags, GET /api/version, GET /v1/models,
 *             POST /api/chat, POST /api/generate (Ollama NDJSON),
 *             POST /v1/chat/completions (OpenAI, stream + non-stream).
 * Every response identifies which port served it, so rotation is observable.
 */
const http = require('http');

const PORT = parseInt(process.argv[2] || '11434', 10);
const ID = process.argv[3] || `mock:${PORT}`;
const LOADING_MS = parseInt(process.env.MOCK_LOADING_MS || '350', 10);

const MODELS = [
  { name: 'gemma3:1b', model: 'gemma3:1b', size: 815319791, digest: `mock-${PORT}-aaaa`, modified_at: '2026-01-01T00:00:00Z', details: { family: 'gemma3', parameter_size: '1B', quantization_level: 'Q4_0' } },
  { name: 'qwen2.5:7b', model: 'qwen2.5:7b', size: 4683073424, digest: `mock-${PORT}-bbbb`, modified_at: '2026-01-01T00:00:00Z', details: { family: 'qwen2', parameter_size: '7B', quantization_level: 'Q4_K_M' } },
];

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const path = u.pathname;
  console.log(`[${ID}] ${req.method} ${path}`);

  if (path === '/api/tags' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ models: MODELS }));
  }
  if (path === '/api/version' || path === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ version: `0.0.0-mock-${PORT}`, served_by: ID }));
  }
  if (path === '/v1/models' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ object: 'list', data: MODELS.map((m) => ({ id: m.name, object: 'model', owned_by: ID })) }));
  }

  const body = await readBody(req);
  const reply = `Hello from ${ID} (port ${PORT}). You said: ${JSON.stringify(body.messages?.slice(-1)?.[0]?.content || body.prompt || '')}`;
  await new Promise((r) => setTimeout(r, LOADING_MS)); // loading -> response

  if (path === '/api/chat' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    const model = body.model || 'gemma3:1b';
    if (body.stream === false) {
      return res.end(JSON.stringify({ model, created_at: new Date(0).toISOString(), message: { role: 'assistant', content: reply }, done: true }));
    }
    for (const tok of reply.split(' ')) {
      res.write(JSON.stringify({ model, created_at: new Date(0).toISOString(), message: { role: 'assistant', content: tok + ' ' }, done: false }) + '\n');
    }
    return res.end(JSON.stringify({ model, created_at: new Date(0).toISOString(), message: { role: 'assistant', content: '' }, done: true, total_duration: 1, eval_count: 5 }) + '\n');
  }
  if (path === '/api/generate' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    const model = body.model || 'gemma3:1b';
    return res.end(JSON.stringify({ model, created_at: new Date(0).toISOString(), response: reply, done: true }) + '\n');
  }
  if (path === '/v1/chat/completions' && req.method === 'POST') {
    const model = body.model || 'gemma3:1b';
    if (body.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const tok of reply.split(' ')) {
        res.write(`data: ${JSON.stringify({ id: 'mock', object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: { content: tok + ' ' } }] })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ id: 'mock', object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 } }));
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, served_by: ID, path }));
});

server.listen(PORT, '127.0.0.1', () => console.log(`[mock-ollama] ${ID} listening on http://127.0.0.1:${PORT}`));
