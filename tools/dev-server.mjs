import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configuredPort = Number(process.env.PORT) || 4173;
let port = configuredPort;
let usingFallbackPort = false;
const mime = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp", ".mp3":"audio/mpeg", ".mp4":"video/mp4" };
const room = { hostId:null, guestId:null, host:null, guest:null, code:null };

function send(peer, type, data = {}) {
  if (!peer || peer.destroyed || peer.writableEnded) return;
  peer.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
}
function json(res, status, payload) {
  res.writeHead(status, { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", "Access-Control-Allow-Origin":"null" });
  res.end(JSON.stringify(payload));
}
function peerFor(role) { return role === "host" ? room.host : room.guest; }
function tokenMatches(role, id) { return Boolean(id && id === (role === "host" ? room.hostId : room.guestId)); }
function clearGuest() {
  if (room.guest && !room.guest.destroyed) room.guest.end();
  room.guest = null; room.guestId = null;
  send(room.host, "peer", { connected:false });
}
function clearRoom() {
  send(room.guest, "hostLeft", {});
  if (room.guest && !room.guest.destroyed) room.guest.end();
  if (room.host && !room.host.destroyed) room.host.end();
  room.host = null; room.guest = null; room.hostId = null; room.guestId = null; room.code = null;
}
function lanAddresses() {
  const result = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) if (entry.family === "IPv4" && !entry.internal) result.push({ name, address:entry.address, url:`http://${entry.address}:${port}` });
  }
  return result;
}
function readJson(req, maxBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", chunk => { body += chunk; if (body.length > maxBytes) { reject(new Error("Request too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}
function fighterId(value) { return typeof value === "string" && /^[a-z0-9_-]{2,32}$/.test(value); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;

  if (pathname.startsWith("/lan/")) {
    if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Methods":"GET, POST, OPTIONS", "Access-Control-Allow-Headers":"Content-Type" }); res.end(); return; }
    if (pathname === "/lan/info" && req.method === "GET") { json(res, 200, { addresses:lanAddresses(), port }); return; }
    if (pathname === "/lan/host" && req.method === "POST") {
      try { await readJson(req); } catch (error) { json(res, 400, { error:error.message }); return; }
      if (room.hostId) { json(res, 409, { error:"Já existe uma partida hospedada neste servidor." }); return; }
      room.hostId = randomBytes(12).toString("hex");
      room.code=randomBytes(4).toString("hex").toUpperCase();
      json(res, 200, { id:room.hostId, code:room.code, addresses:lanAddresses() }); return;
    }
    if (pathname === "/lan/join" && req.method === "POST") {
      let joinData;try { joinData=await readJson(req); } catch (error) { json(res, 400, { error:error.message }); return; }
      if (!room.code||String(joinData.code||"").toUpperCase()!==room.code){json(res,403,{error:"Código da sala incorreto."});return;}
      if (!room.hostId) { json(res, 409, { error:"O anfitrião ainda não criou a partida." }); return; }
      if (room.guestId) { json(res, 409, { error:"Esta partida já tem um jogador 2 conectado." }); return; }
      room.guestId = randomBytes(12).toString("hex");
      send(room.host, "peer", { connected:true });
      json(res, 200, { id:room.guestId }); return;
    }
    if (pathname === "/lan/events" && req.method === "GET") {
      const role = url.searchParams.get("role"), id = url.searchParams.get("id");
      if (!(["host","guest"].includes(role) && tokenMatches(role, id))) { json(res, 403, { error:"Sessão local inválida." }); return; }
      res.writeHead(200, { "Content-Type":"text/event-stream; charset=utf-8", "Cache-Control":"no-cache, no-transform", "Connection":"keep-alive", "X-Accel-Buffering":"no" });
      res.flushHeaders?.();
      const previous = peerFor(role);
      if (previous && previous !== res && !previous.destroyed) previous.end();
      if (role === "host") room.host = res; else room.guest = res;
      send(res, "connected", { role });
      if (role === "guest") { send(res, "waiting", {}); send(room.host, "peer", { connected:true }); }
      else if (room.guestId) send(res, "peer", { connected:true });
      const heartbeat = setInterval(() => { if (!res.destroyed && !res.writableEnded) res.write(": keep-alive\n\n"); }, 20000);
      res.on("close", () => {
        clearInterval(heartbeat);
        if (role === "guest" && room.guest === res) { room.guest = null; room.guestId = null; send(room.host, "peer", { connected:false }); }
        if (role === "host" && room.host === res) { room.host = null; send(room.guest, "hostLeft", {}); if (room.guest && !room.guest.destroyed) room.guest.end(); room.guest = null; room.hostId = null; room.guestId = null; room.code = null; }
      });
      return;
    }
    if (req.method === "POST" && ["/lan/input","/lan/snapshot","/lan/select","/lan/start","/lan/leave"].includes(pathname)) {
      let body;
      try { body = await readJson(req); } catch (error) { json(res, 400, { error:error.message }); return; }
      if (pathname === "/lan/input") {
        if (!tokenMatches("guest", body.id)) { json(res, 403, { error:"Sessão de jogador 2 inválida." }); return; }
        const value = body.input || {};
        send(room.host, "input", { input:{ direction:Math.max(-1, Math.min(1, Math.sign(Number(value.direction) || 0))), up:!!value.up, down:!!value.down, punch:!!value.punch, kick:!!value.kick, guard:!!value.guard, special:!!value.special } });
      } else if (pathname === "/lan/snapshot") {
        if (!tokenMatches("host", body.id)) { json(res, 403, { error:"Sessão de anfitrião inválida." }); return; }
        send(room.guest, "snapshot", { snapshot:body.snapshot });
      } else if (pathname === "/lan/select") {
        if (!fighterId(body.fighterId)) { json(res, 400, { error:"Seleção de lutador inválida." }); return; }
        if (body.role === "host" && tokenMatches("host", body.id)) send(room.guest, "selection", { player:1, fighterId:body.fighterId });
        else if (body.role === "guest" && tokenMatches("guest", body.id)) send(room.host, "selection", { player:2, fighterId:body.fighterId, ready:!!body.ready });
        else { json(res, 403, { error:"Sessão de seleção inválida." }); return; }
      } else if (pathname === "/lan/start") {
        if (!tokenMatches("host", body.id) || !room.guestId) { json(res, 409, { error:"Conecte o jogador 2 antes de iniciar." }); return; }
        if (!fighterId(body.p1) || !fighterId(body.p2)) { json(res, 400, { error:"Seleção de lutadores inválida." }); return; }
        send(room.guest, "start", { p1:body.p1, p2:body.p2 });
      } else {
        if (body.role === "host" && tokenMatches("host", body.id)) clearRoom();
        else if (body.role === "guest" && tokenMatches("guest", body.id)) clearGuest();
        else { json(res, 403, { error:"Sessão local inválida." }); return; }
      }
      if (!res.headersSent) json(res, 200, { ok:true });
      return;
    }
    json(res, 404, { error:"Rota de rede local inexistente." }); return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end("Method not allowed"); return; }
  let pathnameDecoded;
  try { pathnameDecoded = decodeURIComponent(pathname); } catch { res.writeHead(400); res.end("Bad request"); return; }
  if (pathnameDecoded === "/") pathnameDecoded = "/index.html";
  const target = path.resolve(root, "." + pathnameDecoded);
  if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.stat(target, (err, info) => {
    if (err || !info.isFile()) { res.writeHead(404); res.end("Not found"); return; }
    const contentType = mime[path.extname(target).toLowerCase()] || "application/octet-stream";
    const headers = { "Content-Type":contentType, "Content-Length":info.size, "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff" };
    const range = req.method === "GET" && contentType === "video/mp4" ? req.headers.range : null;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        res.writeHead(416, { ...headers, "Content-Range":`bytes */${info.size}`, "Accept-Ranges":"bytes" }); res.end(); return;
      }
      let start, end;
      if (!match[1]) { const suffix = Number(match[2]); start = Math.max(0, info.size - suffix); end = info.size - 1; }
      else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1; }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= info.size || end < start) {
        res.writeHead(416, { ...headers, "Content-Range":`bytes */${info.size}`, "Accept-Ranges":"bytes" }); res.end(); return;
      }
      res.writeHead(206, { ...headers, "Content-Length":end - start + 1, "Content-Range":`bytes ${start}-${end}/${info.size}`, "Accept-Ranges":"bytes" });
      fs.createReadStream(target, { start, end }).pipe(res);
      return;
    }
    if (contentType === "video/mp4") headers["Accept-Ranges"] = "bytes";
    res.writeHead(200, headers);
    if (req.method === "HEAD") { res.end(); return; }
    fs.createReadStream(target).pipe(res);
  });
});

server.on("error", error => {
  if (error.code === "EADDRINUSE" && !process.env.PORT && !usingFallbackPort) {
    usingFallbackPort = true;
    port = 0;
    console.warn("A porta 4173 já está ocupada; procurando uma porta livre automaticamente.");
    server.listen(port, "0.0.0.0");
    return;
  }
  if (error.code === "EADDRINUSE") {
    console.error(`A porta ${configuredPort} já está ocupada. Feche o outro servidor ou defina PORT para escolher outra porta.`);
  } else {
    console.error(`Não foi possível iniciar o servidor: ${error.message}`);
  }
  process.exitCode = 1;
});

server.listen(port, "0.0.0.0", () => {
  port = server.address().port;
  console.log(`Bronx local server on port ${port}`);
  console.log(`This device: http://127.0.0.1:${port}`);
  for (const item of lanAddresses()) console.log(`Wi-Fi: ${item.url} (${item.name})`);
  console.log("Keep this server running while hosting a LAN match.");
});
