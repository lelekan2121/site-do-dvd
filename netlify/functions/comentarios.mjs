import { getStore } from "@netlify/blobs";
import { createHash, randomUUID } from "node:crypto";

const hash = (t) => createHash("sha256").update(t).digest("hex");
const POSTS = ["inicio", "espada", "lydia", "mw2", "matrix"];

// Chave de cada comentário. Comentários antigos não têm id, então usamos data + nick.
const chaveDe = (c) => c.id || String(c.criadoEm) + "|" + (c.nick || "");

export default async (req) => {
  const store = getStore("comentarios");
  const url = new URL(req.url);
  const senhaCerta = process.env.ADMIN_SENHA || "";

  // ---------- Administrador: listar todos os comentários ----------
  if (req.method === "GET" && url.searchParams.has("admin")) {
    if (!senhaCerta || url.searchParams.get("senha") !== senhaCerta) {
      return new Response("Senha incorreta", { status: 403 });
    }
    const todos = [];
    for (const post of POSTS) {
      const lista = (await store.get(post, { type: "json" })) || [];
      for (const c of lista) {
        todos.push({ post, chave: chaveDe(c), nick: c.nick, texto: c.texto, criadoEm: c.criadoEm });
      }
    }
    todos.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
    return Response.json(todos);
  }

  // ---------- Leitura pública por seção ----------
  if (req.method === "GET") {
    const post = url.searchParams.get("post") || "";
    const lista = (await store.get(post, { type: "json" })) || [];
    return Response.json(lista);
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body) return new Response("Corpo inválido", { status: 400 });

    const nick = String(body.nick || "").trim().slice(0, 20);
    const texto = String(body.texto || "").trim().slice(0, 280);
    const post = String(body.post || "").slice(0, 30);
    const token = String(body.token || "");
    if (!nick || !texto || !post || !token) return new Response("Campos obrigatórios", { status: 400 });

    const lista = (await store.get(post, { type: "json" })) || [];
    lista.push({ id: randomUUID(), nick, texto, post, criadoEm: Date.now(), dono: hash(token) });
    await store.setJSON(post, lista.slice(-300));
    return Response.json({ ok: true });
  }

  if (req.method === "DELETE") {
    const body = await req.json().catch(() => null);
    if (!body || !body.post) return new Response("Campos obrigatórios", { status: 400 });

    // Administrador apaga um comentário escolhido
    if (body.senha !== undefined) {
      if (!senhaCerta || body.senha !== senhaCerta) return new Response("Senha incorreta", { status: 403 });
      const lista = (await store.get(body.post, { type: "json" })) || [];
      const nova = lista.filter((c) => chaveDe(c) !== body.chave);
      if (nova.length === lista.length) return new Response("Comentário não encontrado", { status: 404 });
      await store.setJSON(body.post, nova);
      return Response.json({ ok: true });
    }

    // Quem escreveu apaga o próprio comentário (com o token do navegador)
    if (!body.id || !body.token) return new Response("Campos obrigatórios", { status: 400 });
    const lista = (await store.get(body.post, { type: "json" })) || [];
    const alvo = lista.find((c) => c.id === body.id);
    if (!alvo) return new Response("Comentário não encontrado", { status: 404 });
    if (alvo.dono !== hash(String(body.token))) return new Response("Este comentário não é seu", { status: 403 });
    await store.setJSON(body.post, lista.filter((c) => c.id !== body.id));
    return Response.json({ ok: true });
  }

  return new Response("Método não permitido", { status: 405 });
};
