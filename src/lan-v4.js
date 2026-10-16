/** Bronx LAN V4 — invitation UX. Server validates the public room code. */
export function normalizeRoomCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[0-9A-F]{8}$/.test(code) ? code : '';
}

export function getJoinCodeFromUrl(locationLike) {
  try { return normalizeRoomCode(new URLSearchParams(locationLike.search || '').get('bronxJoin')); }
  catch { return ''; }
}

function isLanAddress(raw) {
  try {
    const u = new URL(raw);
    const h = u.hostname;
    // Public IPv4, hostnames, loopback and link-local are not usable LAN invites.
    return u.protocol === 'http:' && (
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) ||
      /^172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)
    );
  } catch { return false; }
}

export function chooseLanInviteUrl(addresses, localLocation, code) {
  const validCode=normalizeRoomCode(code);
  if (!validCode) return {url:'',warning:'Código de sala inválido.'};
  const entries=(Array.isArray(addresses)?addresses:[])
    .map(entry => typeof entry === 'string' ? entry : entry && entry.url)
    .filter(isLanAddress);
  // Prefer the IP type common on household Wi-Fi, not a VPN/dock interface.
  const rank=url => new URL(url).hostname.startsWith('192.168.') ? 0 :
    new URL(url).hostname.startsWith('10.') ? 1 : 2;
  entries.sort((a,b)=>rank(a)-rank(b));
  let base=entries[0];
  if(!base && isLanAddress(localLocation.origin))base=localLocation.origin;
  if(!base) return {url:'',warning:'Não foi encontrado um endereço Wi-Fi local. Conecte o Mac à rede Wi-Fi e reinicie o servidor.'};
  const u=new URL(base);
  u.pathname='/'; u.search=''; u.hash='';
  u.searchParams.set('bronxJoin',validCode);
  return {url:u.toString(),warning:''};
}

export function whatsappShareUrl(url) {
  if(!url) return '';
  return 'https://wa.me/?text='+encodeURIComponent('Entre na minha partida do Bronx Fighter! Conecte seu celular à mesma rede Wi-Fi e abra este link:\n'+url);
}

export function createLanInviteUi(doc=document) {
  const bar=doc.createElement('div');
  bar.id='bronxLanInvite';
  bar.hidden=true;
  bar.setAttribute('aria-label','Convite para partida local');
  const head=doc.createElement('div');head.className='bronx-lan-head';
  const label=doc.createElement('strong');label.textContent='SALA WI-FI: ';
  const code=doc.createElement('span');label.appendChild(code);
  head.appendChild(label);
  const field=doc.createElement('input');field.type='text';field.readOnly=true;
  field.setAttribute('aria-label','Link de acesso para o jogador 2');
  const copy=doc.createElement('button');copy.type='button';copy.textContent='COPIAR LINK';
  const wa=doc.createElement('a');wa.textContent='COMPARTILHAR NO WHATSAPP';
  wa.target='_blank';wa.rel='noopener noreferrer';
  const warn=doc.createElement('small');warn.setAttribute('role','status');
  const controls=doc.createElement('div');controls.className='bronx-lan-controls';
  controls.append(field,copy,wa);
  bar.append(head,controls,warn);
  const anchor=doc.querySelector('#selectScreen .select-topline');
  if(!anchor)throw new Error('A tela original de seleção do Bronx não foi encontrada.');
  anchor.after(bar);
  const style=doc.createElement('style');style.textContent=`
#bronxLanInvite{flex:0 0 auto;z-index:6;padding:6px 11px;border:1px solid rgba(231,173,68,.40);background:rgba(6,12,19,.97);color:#f6f0e4;font:600 11px system-ui,sans-serif;box-shadow:0 6px 20px #0009}
#bronxLanInvite[hidden],#bronxLanInvite [hidden]{display:none!important}
#bronxLanInvite .bronx-lan-head{margin-bottom:5px;letter-spacing:.09em}
#bronxLanInvite .bronx-lan-head span{color:#e9bd68;user-select:all}
#bronxLanInvite .bronx-lan-controls{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
#bronxLanInvite input{flex:1 1 220px;min-width:110px;padding:7px;border:1px solid #5e5447;color:#fff;background:#17212b;font:11px system-ui}
#bronxLanInvite button,#bronxLanInvite a{display:inline-flex;align-items:center;justify-content:center;padding:9px;border:1px solid #c59a4e;background:#31240f;color:#fbe7bc;font:bold 10px system-ui;text-decoration:none;letter-spacing:.03em;cursor:pointer;min-height:32px}
#bronxLanInvite a{background:#18452c;border-color:#62ae76;color:#e8fff0}
#bronxLanInvite small{display:block;margin-top:4px;color:#f4b98a}
@media(max-height:420px){#bronxLanInvite{padding:4px 8px}#bronxLanInvite input{padding:5px}#bronxLanInvite button,#bronxLanInvite a{padding:5px;min-height:28px}}
`;
  doc.head.append(style);
  const copyFallback=()=>{
    field.focus();field.select();
    return Boolean(doc.execCommand && doc.execCommand('copy'));
  };
  copy.addEventListener('click',async()=>{
    const url=field.value;
    if(!url)return;
    let success=false;
    try { if(navigator.clipboard && navigator.clipboard.writeText){await navigator.clipboard.writeText(url);success=true;} }
    catch(e){ /* Safari LAN HTTP is not a secure context; fall back below. */ }
    if(!success)success=copyFallback();
    copy.textContent=success?'LINK COPIADO':'SELECIONE E COPIE';
  });
  return {
    show({code:roomCode,url,warning}){
      code.textContent=roomCode;
      field.value=url||'';
      copy.disabled=!url;
      wa.hidden=!url;
      if(url)wa.href=whatsappShareUrl(url);else wa.removeAttribute('href');
      warn.textContent=warning || 'O outro aparelho precisa estar na mesma rede Wi-Fi. O Mac deve permanecer ligado com o servidor aberto.';
      copy.textContent='COPIAR LINK';
      bar.hidden=false;
    },
    hide(){bar.hidden=true;}
  };
}
