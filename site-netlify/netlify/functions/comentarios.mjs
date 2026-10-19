import { getStore } from "@netlify/blobs";

// Guarda os comentários por seção (post). Cada seção é uma chave no armazenamento.
export default async (req) => {
  const store = getStore("comentarios");

  if (req.method === "GET") {
    const post = new URL(req.url).searchParams.get("post") || "";
    const lista = (await store.get(post, { type: "json" })) || [];
    return Response.json(lista);
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body) return new Response("Corpo inválido", { status: 400 });

    const nick = String(body.nick || "").trim().slice(0, 20);
    const texto = String(body.texto || "").trim().slice(0, 280);
    const post = String(body.post || "").slice(0, 30);
    if (!nick || !texto || !post) return new Response("Campos obrigatórios", { status: 400 });

    const lista = (await store.get(post, { type: "json" })) || [];
    lista.push({ nick, texto, post, criadoEm: Date.now() });
    await store.setJSON(post, lista.slice(-300));
    return Response.json({ ok: true });
  }

  return new Response("Método não permitido", { status: 405 });
};
