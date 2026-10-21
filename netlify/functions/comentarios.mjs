import { getStore } from "@netlify/blobs";
import { createHash, randomUUID } from "node:crypto";

const hash = (t) => createHash("sha256").update(t).digest("hex");

// Comentários por seção. Cada comentário tem um id e o "dono" (hash do token do navegador).
// Só quem tem o token original consegue apagar o comentário.
export default async (req) => {
  const store = getStore("comentarios");

  // Limpeza de todos os comentários (uso do administrador).
  // Precisa da senha guardada na variável de ambiente ADMIN_SENHA no Netlify.
  if (req.method === "GET" && new URL(req.url).searchParams.has("limpar")) {
    const senhaCerta = process.env.ADMIN_SENHA || "";
    const senha = new URL(req.url).searchParams.get("senha") || "";
    if (!senhaCerta || senha !== senhaCerta) return new Response("Senha incorreta", { status: 403 });
    for (const post of ["inicio", "espada", "lydia", "mw2", "matrix"]) {
      await store.delete(post);
    }
    return new Response("Todos os comentários foram apagados.", { status: 200 });
  }

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
    const token = String(body.token || "");
    if (!nick || !texto || !post || !token) return new Response("Campos obrigatórios", { status: 400 });

    const lista = (await store.get(post, { type: "json" })) || [];
    lista.push({ id: randomUUID(), nick, texto, post, criadoEm: Date.now(), dono: hash(token) });
    await store.setJSON(post, lista.slice(-300));
    return Response.json({ ok: true });
  }

  if (req.method === "DELETE") {
    const body = await req.json().catch(() => null);
    if (!body || !body.id || !body.post || !body.token) return new Response("Campos obrigatórios", { status: 400 });

    const lista = (await store.get(body.post, { type: "json" })) || [];
    const alvo = lista.find((c) => c.id === body.id);
    if (!alvo) return new Response("Comentário não encontrado", { status: 404 });
    if (alvo.dono !== hash(String(body.token))) return new Response("Este comentário não é seu", { status: 403 });

    await store.setJSON(body.post, lista.filter((c) => c.id !== body.id));
    return Response.json({ ok: true });
  }

  return new Response("Método não permitido", { status: 405 });
};
