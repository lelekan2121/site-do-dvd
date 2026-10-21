import { getStore } from "@netlify/blobs";
import { createHash, randomUUID, randomBytes, scryptSync } from "node:crypto";

const sha = (t) => createHash("sha256").update(t).digest("hex");
const senhaHash = (senha, salt) => scryptSync(senha, salt, 64).toString("hex");
const POSTS = ["inicio", "espada", "lydia", "mw2", "matrix"];
const REGRA_USUARIO = /^[a-z0-9_]{3,16}$/;
const chaveDe = (c) => c.id || String(c.criadoEm) + "|" + (c.nick || "");
const erro = (msg, status = 400) => new Response(msg, { status });

export default async (req) => {
  const comentarios = getStore("comentarios");
  const usuarios = getStore("usuarios");
  const url = new URL(req.url);
  const senhaAdmin = process.env.ADMIN_SENHA || "";

  // Confere se o usuário está logado (token da sessão)
  async function autentica(usuario, token) {
    const nome = String(usuario || "").toLowerCase();
    if (!REGRA_USUARIO.test(nome) || !token) return null;
    const u = await usuarios.get(nome, { type: "json" });
    if (!u || u.sessao !== sha(String(token))) return null;
    return u;
  }

  // ---------- GET ----------
  if (req.method === "GET") {
    // Administrador: lista todos os comentários
    if (url.searchParams.has("admin")) {
      if (!senhaAdmin || url.searchParams.get("senha") !== senhaAdmin) return erro("Senha incorreta", 403);
      const todos = [];
      for (const post of POSTS) {
        const lista = (await comentarios.get(post, { type: "json" })) || [];
        for (const c of lista) todos.push({ post, chave: chaveDe(c), nick: c.nick, texto: c.texto, criadoEm: c.criadoEm });
      }
      todos.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
      return Response.json(todos);
    }
    // Foto de perfil de um usuário
    if (url.searchParams.has("foto")) {
      const u = await usuarios.get(String(url.searchParams.get("foto")).toLowerCase(), { type: "json" });
      return Response.json({ foto: (u && u.foto) || "" });
    }
    // Comentários de uma seção
    const post = url.searchParams.get("post") || "";
    return Response.json((await comentarios.get(post, { type: "json" })) || []);
  }

  // ---------- POST ----------
  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body) return erro("Corpo inválido");
    const acao = body.acao || "comentar";

    // Cadastro e login
    if (acao === "cadastrar" || acao === "entrar") {
      const usuario = String(body.usuario || "").trim().toLowerCase();
      const senha = String(body.senha || "");
      if (!REGRA_USUARIO.test(usuario)) return erro("Usuário: de 3 a 16 letras minúsculas, números ou _");
      if (senha.length < 4) return erro("A senha precisa ter pelo menos 4 caracteres");
      const atual = await usuarios.get(usuario, { type: "json" });
      const token = randomBytes(24).toString("hex");

      if (acao === "cadastrar") {
        if (atual) return erro("Esse usuário já existe", 409);
        const salt = randomBytes(16).toString("hex");
        await usuarios.setJSON(usuario, { usuario, salt, senha: senhaHash(senha, salt), foto: "", sessao: sha(token) });
      } else {
        if (!atual || senhaHash(senha, atual.salt) !== atual.senha) return erro("Usuário ou senha incorretos", 403);
        await usuarios.setJSON(usuario, { ...atual, sessao: sha(token) });
      }
      return Response.json({ usuario, token });
    }

    // Trocar a foto de perfil
    if (acao === "foto") {
      const u = await autentica(body.usuario, body.token);
      if (!u) return erro("Sessão expirada. Entre de novo.", 401);
      const foto = String(body.foto || "");
      if (!foto.startsWith("data:image/") || foto.length > 80000) return erro("Foto inválida ou grande demais");
      await usuarios.setJSON(u.usuario, { ...u, foto });
      return Response.json({ ok: true });
    }

    // Comentar (precisa estar logado)
    const u = await autentica(body.usuario, body.token);
    if (!u) return erro("Entre na sua conta para comentar.", 401);
    const texto = String(body.texto || "").trim().slice(0, 280);
    const post = String(body.post || "").slice(0, 30);
    if (!texto || !post) return erro("Escreva um comentário");
    const lista = (await comentarios.get(post, { type: "json" })) || [];
    lista.push({ id: randomUUID(), nick: u.usuario, texto, post, criadoEm: Date.now(), dono: u.usuario });
    await comentarios.setJSON(post, lista.slice(-300));
    return Response.json({ ok: true });
  }

  // ---------- DELETE ----------
  if (req.method === "DELETE") {
    const body = await req.json().catch(() => null);
    if (!body || !body.post) return erro("Campos obrigatórios");

    // Administrador apaga um comentário escolhido
    if (body.senha !== undefined) {
      if (!senhaAdmin || body.senha !== senhaAdmin) return erro("Senha incorreta", 403);
      const lista = (await comentarios.get(body.post, { type: "json" })) || [];
      const nova = lista.filter((c) => chaveDe(c) !== body.chave);
      if (nova.length === lista.length) return erro("Comentário não encontrado", 404);
      await comentarios.setJSON(body.post, nova);
      return Response.json({ ok: true });
    }

    // Quem escreveu apaga o próprio comentário
    const u = await autentica(body.usuario, body.token);
    if (!u) return erro("Entre na sua conta.", 401);
    const lista = (await comentarios.get(body.post, { type: "json" })) || [];
    const alvo = lista.find((c) => c.id === body.id);
    if (!alvo) return erro("Comentário não encontrado", 404);
    if (alvo.dono !== u.usuario) return erro("Este comentário não é seu", 403);
    await comentarios.setJSON(body.post, lista.filter((c) => c.id !== body.id));
    return Response.json({ ok: true });
  }

  return erro("Método não permitido", 405);
};
