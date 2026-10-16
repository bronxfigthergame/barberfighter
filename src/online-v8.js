/** Bronx Fighter V8 — GitHub Pages frontend + Render HTTPS room server.
 * After you create the Render service, paste its PUBLIC https URL below.
 * Never paste API secrets or account tokens here: this file is publicly served.
 */
export const ONLINE_API_URL = 'https://COLE-AQUI-SEU-SERVIDOR.onrender.com';
export const GAME_PUBLIC_URL = 'https://bronxfigthergame.github.io/barberfighter/';

export function onlineApiConfigured() {
  try {
    const api = new URL(ONLINE_API_URL);
    const isLocal = api.protocol === 'http:' && ['127.0.0.1','localhost'].includes(api.hostname);
    return ((api.protocol === 'https:' && !/COLE-AQUI/i.test(api.hostname)) || isLocal)
      && !api.username && !api.password && !api.search && !api.hash;
  } catch { return false; }
}

export function lanEndpoint(path) {
  if (!onlineApiConfigured()) {
    throw new Error('O endereço do servidor Render ainda não foi configurado em src/online-v8.js');
  }
  if (typeof path !== 'string' || !path.startsWith('/lan/'))
    throw new Error('Rota multiplayer inválida.');
  return ONLINE_API_URL.replace(/\/+$/, '') + path;
}

export function chooseOnlineInviteUrl(_location, code) {
  if (!/^[A-F0-9]{8}$/.test(String(code || '').toUpperCase()))
    return {url:'',warning:'Código de sala inválido.'};
  const url = new URL(GAME_PUBLIC_URL);
  url.searchParams.set('bronxJoin',String(code).toUpperCase());
  return {url:url.toString(),warning:'Envie o código ou o link. Os dois jogadores podem estar em redes diferentes; o servidor Render precisa estar ativo.'};
}
