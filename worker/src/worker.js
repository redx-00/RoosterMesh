// src/worker.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/send") {
      const body = await request.json();
      const { from, to, type, data } = body || {};
      if (!from || !to || !type) {
        return new Response(JSON.stringify({ ok: false, error: "missing fields" }), { status: 400 });
      }

      const key = `inbox:${to}`;
      const existing = await env.SIGNAL.get(key, "json");
      const messages = Array.isArray(existing) ? existing : [];

      messages.push({ from, type, data, ts: Date.now() });

      // TTL keeps things from piling up forever
      await env.SIGNAL.put(key, JSON.stringify(messages), { expirationTtl: 120 });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/recv") {
      const body = await request.json();
      const { for: forId } = body || {};
      if (!forId) {
        return new Response(JSON.stringify({ ok: false, error: "missing 'for'" }), { status: 400 });
      }

      const key = `inbox:${forId}`;
      const existing = await env.SIGNAL.get(key, "json");
      const messages = Array.isArray(existing) ? existing : [];

      // Clear inbox after read
      await env.SIGNAL.delete(key);

      return new Response(JSON.stringify({ ok: true, messages }), {
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("not found", { status: 404 });
  },
};
