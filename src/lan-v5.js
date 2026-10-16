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
  return 'https://wa.me/?text='+encodeURIComponent('Entre na minha partida do Bronx Fighter! Abra este link para jogar comigo pela internet:\n'+url);
}

/** Bronx LAN V5: the same prominent code on the Online and Select screens. */
export function createLanInviteUi(doc=document) {
  const widgets=[];
  const style=doc.createElement('style');
  style.textContent=`
.bronx-room-card{box-sizing:border-box;width:min(650px,100%);margin:10px auto;padding:12px 14px;border:1px solid #e7b85f;border-radius:9px;background:rgba(9,15,23,.96);box-shadow:0 8px 25px #0009;color:#f9f0df;font:600 12px system-ui,sans-serif;letter-spacing:normal;text-align:center}
.bronx-room-card[hidden],.bronx-room-card [hidden]{display:none!important}
.bronx-room-card .room-heading{font:900 11px/1.4 system-ui,sans-serif;color:#eac87e;letter-spacing:.15em}
.bronx-room-card .room-code{display:block;margin:6px auto;user-select:all;cursor:text;color:#ffdb8c;font:900 clamp(26px,5vw,39px)/1.1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.24em;text-shadow:0 0 17px #e5a83a55}
.bronx-room-card .room-hint{margin:2px 0 7px;color:#d9dce0;font:500 11px/1.4 system-ui}
.bronx-room-card .room-url{display:block;box-sizing:border-box;width:100%;padding:7px 9px;border:1px solid #726247;background:#121d29;color:#f3e7c9;font:11px/1.3 ui-monospace,monospace;text-align:center}
.bronx-room-card .room-actions{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin-top:8px}
.bronx-room-card .room-actions button,.bronx-room-card .room-actions a{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:9px 10px;border:1px solid #d0a55b;border-radius:5px;background:#45321b;color:#fff0ce;text-decoration:none;font:900 10px/1.15 system-ui;letter-spacing:.04em;cursor:pointer}
.bronx-room-card .room-actions a{background:#21583a;color:#e8fff0;border-color:#65b981}
.bronx-room-card .room-actions button:disabled{opacity:.5;cursor:not-allowed}
.bronx-room-card .room-warning{display:block;margin-top:6px;color:#f3be83;font:500 11px/1.35 system-ui;letter-spacing:normal}
#bronxLanInviteSelect{position:relative;flex:0 0 auto;z-index:7;margin:0 auto;padding:7px 10px;width:min(800px,100%)}
#bronxLanInviteSelect .room-code{font-size:clamp(22px,3vw,30px);margin:2px auto;letter-spacing:.18em}
#bronxLanInviteSelect .room-actions button,#bronxLanInviteSelect .room-actions a{min-height:30px;padding:6px}
#bronxLanInviteSelect .room-hint{display:none}
@media(max-height:430px){#bronxLanInviteSelect{padding:4px 8px}#bronxLanInviteSelect .room-url{padding:3px}#bronxLanInviteSelect .room-heading{font-size:9px}#bronxLanInviteSelect .room-warning{display:none}.bronx-room-card{margin:4px auto;padding:7px}}
`;
  doc.head.append(style);

  function makeCard(id,anchor,location) {
    const card=doc.createElement('section');card.id=id;card.className='bronx-room-card';card.hidden=true;
    card.setAttribute('aria-label','Código e link da sala Bronx Wi-Fi');
    const heading=doc.createElement('div');heading.className='room-heading';heading.textContent='SUA SALA WI-FI · CÓDIGO PARA ENTRAR';
    const code=doc.createElement('output');code.className='room-code';code.setAttribute('aria-label','Código de oito caracteres');
    const hint=doc.createElement('p');hint.className='room-hint';hint.textContent='O outro jogador pode digitar o código ou abrir o link no WhatsApp.';
    const field=doc.createElement('input');field.className='room-url';field.readOnly=true;field.setAttribute('aria-label','Link da sala');
    const actions=doc.createElement('div');actions.className='room-actions';
    const copyCode=doc.createElement('button');copyCode.type='button';copyCode.textContent='COPIAR CÓDIGO';
    const copyLink=doc.createElement('button');copyLink.type='button';copyLink.textContent='COPIAR LINK';
    const wa=doc.createElement('a');wa.textContent='ENVIAR NO WHATSAPP';wa.target='_blank';wa.rel='noopener noreferrer';
    actions.append(copyCode,copyLink,wa);
    const warn=doc.createElement('small');warn.className='room-warning';warn.setAttribute('role','status');
    card.append(heading,code,hint,field,actions,warn);
    location(anchor,card);
    async function copyValue(value,el){
      if(!value)return;
      let success=false;
      try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);success=true;}}catch{}
      if(!success){
        const shadow=doc.createElement('textarea');shadow.value=value;shadow.style.position='fixed';shadow.style.left='-9999px';doc.body.appendChild(shadow);shadow.select();
        try{success=!!doc.execCommand?.('copy');}catch{}shadow.remove();
      }
      el.textContent=success?'COPIADO':'SELECIONE PARA COPIAR';
      if(!success){field.focus();field.select();}
    }
    copyCode.addEventListener('click',()=>copyValue(code.textContent,copyCode));
    copyLink.addEventListener('click',()=>copyValue(field.value,copyLink));
    return {card,code,field,copyCode,copyLink,wa,warn};
  }
  const onlineAnchor=doc.querySelector('#lanAddressList');
  const selectAnchor=doc.querySelector('#selectScreen .select-topline');
  if(!onlineAnchor||!selectAnchor)throw new Error('Faltam as telas originais de Wi-Fi ou seleção da Bronx.');
  widgets.push(makeCard('bronxLanInviteOnline',onlineAnchor,(node,card)=>node.after(card)));
  widgets.push(makeCard('bronxLanInviteSelect',selectAnchor,(node,card)=>node.after(card)));
  return {
    show({code,url,warning}){
      const value=normalizeRoomCode(code);
      for(const w of widgets){
        w.code.textContent=value||'CÓDIGO INVÁLIDO';
        w.field.value=url||'';
        w.copyCode.disabled=!value;w.copyLink.disabled=!url;
        w.wa.hidden=!url;
        if(url)w.wa.href=whatsappShareUrl(url);else w.wa.removeAttribute('href');
        w.warn.textContent=warning||'Mesmo Wi-Fi nos dois aparelhos. Mantenha o Mac com o servidor ligado.';
        w.copyCode.textContent='COPIAR CÓDIGO';w.copyLink.textContent='COPIAR LINK';
        w.card.hidden=false;
      }
    },
    hide(){for(const w of widgets)w.card.hidden=true;}
  };
}
