import {boxesOverlap,blocksHit,isMoveActive,damageHealth,timerWinner,seriesWinner,storyOpponents} from "./combat-core.js";

const FIGHTERS=[
{id:"daniel",name:"Daniel",title:"O tecelão do Bronx",bio:"Rápido no jab e preciso no alcance. Prende o rival com uma teia de aço.",color:"#54bbf2",special:"Teia de Aço"},
{id:"diana",name:"Diana",title:"A tempestade",bio:"Movimento leve, ataques baixos e spray explosivo.",color:"#ec4cba",special:"Spray Explosivo"},
{id:"kadu",name:"Kadu",title:"O piloto",bio:"Poder de impacto e investidas com a moto.",color:"#e6bd54",special:"Moto do Bronx"},
{id:"bruno",name:"Bruno",title:"O peso-pesado",bio:"Transforma a rua em arena com a força de um barril.",color:"#62b9ec",special:"Barril do Bronx"},
{id:"christian",name:"Christian",title:"O falcoeiro",bio:"Ataca do alto com velocidade e precisão.",color:"#d1a76d",special:"Ataque do Falcão"},
{id:"luana",name:"Luana",title:"A barista",bio:"Mistura agilidade e café quente em golpes de longo alcance.",color:"#ef8c57",special:"Café em Chamas"},
{id:"lorehy",name:"Lorehy",title:"O dono da barbearia",bio:"O chefe da casa. Sua chuva de tesouras douradas controla o espaço.",color:"#e64b60",special:"Chuva de Tesouras Douradas",boss:true}
];
const BY_ID=Object.fromEntries(FIGHTERS.map(f=>[f.id,f]));
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const viewportMeta=$("meta[name=\"viewport\"]"),defaultViewportContent=viewportMeta&&viewportMeta.content;
const asset=p=>new URL("../"+p,import.meta.url).href;
const MODE_NAMES={story:"MODO HISTÓRIA",cpu:"ARCADE VS CPU",versus:"VERSUS LOCAL",training:"TREINO",lan:"VERSUS WI-FI"};
const ACTIONS={punch:"Soco",kick:"Chute",guard:"Defesa",special:"Especial"};
const DEFAULTS={difficulty:"normal",roundSeconds:99,assistEnabled:true,musicEnabled:true,sfxEnabled:true,voiceEnabled:true,fighterVoiceEnabled:true,musicVolume:38,sfxVolume:45,voiceVolume:72,touchSize:100,touchOpacity:92,trainingInfiniteHealth:false,trainingInfiniteEnergy:false,trainingHitboxes:false,trainingDummy:"passive",keyMap:{p1:{punch:"KeyJ",kick:"KeyK",guard:"KeyL",special:"KeyI"},p2:{punch:"KeyF",kick:"KeyG",guard:"KeyH",special:"KeyT"}},padMap:{p1:{punch:0,kick:1,guard:2,special:3},p2:{punch:0,kick:1,guard:2,special:3}}};
const FIGHTER_VOICES={daniel:{pitch:.94,rate:1.04,attack:["Toma!","Vai!"],special:"Teia de aço!",hit:"Ah!",block:"Boa defesa!",win:"Essa luta é minha!"},diana:{pitch:1.14,rate:1.08,attack:["Sai!","Toma essa!"],special:"Spray explosivo!",hit:"Ai!",block:"Não passou!",win:"Acabou pra você!"},kadu:{pitch:1.02,rate:1.13,attack:["Vai encarar?","Toma!"],special:"Moto do Bronx!",hit:"Ugh!",block:"Nem sentiu!",win:"Fui mais rápido!"},bruno:{pitch:.82,rate:.92,attack:["Vem pra cima!","Sai da frente!"],special:"Barril do Bronx!",hit:"Ugh!",block:"Nem mexeu!",win:"Essa rua é minha!"},christian:{pitch:1.08,rate:1.03,attack:["Olha o falcão!","Agora!"],special:"Ataque do falcão!",hit:"Ah!",block:"Defendi!",win:"Voo mais alto!"},luana:{pitch:1.16,rate:1.04,attack:["Quentinho!","Toma café!"],special:"Café em chamas!",hit:"Ai!",block:"Passou longe!",win:"Pode fechar a conta!"},lorehy:{pitch:.78,rate:.9,attack:["Respeita!","A casa é minha!"],special:"Chuva de tesouras!",hit:"Isso não acabou!",block:"Patético!",win:"O Bronx é meu!"}};
function getSettings(){try{const s=JSON.parse(localStorage.getItem("bronx-settings")||"{}");if(s.difficulty==="easy")s.difficulty="normal";if(!["normal","hard","veryHard"].includes(s.difficulty))s.difficulty=DEFAULTS.difficulty;if(Number(s.touchOpacity)<90)s.touchOpacity=DEFAULTS.touchOpacity;return Object.assign({},DEFAULTS,s,{keyMap:{p1:Object.assign({},DEFAULTS.keyMap.p1,s.keyMap&&s.keyMap.p1||{}),p2:Object.assign({},DEFAULTS.keyMap.p2,s.keyMap&&s.keyMap.p2||{})},padMap:{p1:Object.assign({},DEFAULTS.padMap.p1,s.padMap&&s.padMap.p1||{}),p2:Object.assign({},DEFAULTS.padMap.p2,s.padMap&&s.padMap.p2||{})}});}catch(e){return JSON.parse(JSON.stringify(DEFAULTS));}}
let settings=getSettings(),moves=null,aiProfiles=null,assets={},bonusAssets=null,mode="cpu",activeSide=1,selected={p1:"daniel",p2:"diana"},campaign=[],campaignIndex=0,keys=new Set(),touches=new Map(),remap=null,previousScreen="menuScreen",screen="menuScreen",match=null,acc=0,last=0,audio=null,menuCursor=0,fullscreenPending=false,cinemaRun=0;
let virtualStick=null;
const NEUTRAL_INPUT={direction:0,up:false,down:false,punch:false,kick:false,guard:false,special:false};
let lanRole=null,lanId=null,lanEvents=null,lanPeerConnected=false,lanGuestReady=false,lanRemoteInput=Object.assign({},NEUTRAL_INPUT),lanSnapshotTimer=0,lanInputTimer=0,lanSelectionQueue=Promise.resolve();
let lanServerAvailable=false,gamepadNavCooldown=0,gamepadPauseIndex=0;
const gamepadSelectCooldown=[0,0];
const gamepadUiHeld=[{confirm:false,start:false,cancel:false},{confirm:false,start:false,cancel:false}];
let orientationAutoPaused=false;
const canvas=$("#gameCanvas"),ctx=canvas.getContext("2d"),stages={bronx:new Image(),boss:new Image()};let stage=stages.bronx;
let viewport={w:960,h:540,dpr:1};
function showScreen(id){screen=id;document.body.classList.toggle("playing",id==="gameScreen");if(viewportMeta&&defaultViewportContent)viewportMeta.content=id==="gameScreen"?defaultViewportContent+",user-scalable=no":defaultViewportContent;$$(".screen").forEach(s=>s.classList.toggle("active",s.id===id));if(id==="gameScreen")resizeCanvas();if(id==="optionsScreen")fillOptions();updateVersusAvailability();updateOrientationBlocker();updateFullscreenButton();window.scrollTo(0,0);}
function isMobilePortrait(){return matchMedia("(pointer:coarse)").matches&&matchMedia("(orientation:portrait)").matches;}
function updateOrientationBlocker(){const blocked=isMobilePortrait(),overlay=$("#orientationBlocker");if(overlay)overlay.hidden=!blocked;document.body.classList.toggle("orientation-blocked",blocked);if(blocked){cleanInput();if(match&&screen==="gameScreen"&&!match.paused){match.paused=true;orientationAutoPaused=true;$("#pausePanel").hidden=true;}}else if(orientationAutoPaused&&match){orientationAutoPaused=false;match.paused=false;$("#pausePanel").hidden=true;last=0;}}
let lastTouchControlTap=0;
document.addEventListener("touchend",e=>{if(screen!=="gameScreen")return;const target=e.target instanceof Element?e.target.closest("#touchControls .touch-actions button, #touchStick"):null;if(!target)return;const now=performance.now();if(now-lastTouchControlTap<450)e.preventDefault();lastTouchControlTap=now;},{passive:false});
document.addEventListener("dblclick",e=>{if(screen==="gameScreen"&&e.target instanceof Element&&e.target.closest("#touchControls"))e.preventDefault();},{passive:false});
window.addEventListener("gesturestart",e=>{if(screen==="gameScreen")e.preventDefault();},{passive:false});
function requestLandscapeLock(){try{const request=window.screen&&window.screen.orientation&&window.screen.orientation.lock("landscape");if(request&&request.catch)request.catch(()=>{});}catch(e){}}
function enterArcadeSession(){
 document.body.classList.add("arcade-session");
 requestLandscapeLock();
}
function isInstalledApp(){return matchMedia("(display-mode:standalone)").matches||matchMedia("(display-mode:fullscreen)").matches||navigator.standalone===true;}
function updateFullscreenButton(){const button=$("#fullscreenButton");if(!button)return;button.hidden=screen!=="gameScreen"||!document.documentElement.requestFullscreen||Boolean(document.fullscreenElement)||isInstalledApp();}
document.addEventListener("fullscreenchange",updateFullscreenButton);
function requestGameFullscreen(){
 const root=document.documentElement;
 requestLandscapeLock();
 if(document.fullscreenElement||fullscreenPending||isInstalledApp()||!root.requestFullscreen){updateFullscreenButton();return;}
 fullscreenPending=true;
 try{const request=root.requestFullscreen({navigationUI:"hide"});if(request&&request.then)request.then(()=>{fullscreenPending=false;requestLandscapeLock();updateFullscreenButton();},()=>{fullscreenPending=false;updateFullscreenButton();});else{fullscreenPending=false;updateFullscreenButton();}}catch(e){fullscreenPending=false;updateFullscreenButton();}
}
function clearVirtualStick(){virtualStick=null;const stick=$("#touchStick"),knob=$("#touchStickKnob");if(stick)stick.classList.remove("active");if(knob)knob.style.transform="translate3d(-50%,-50%,0)";}
function cleanInput(){keys.clear();touches.clear();clearVirtualStick();}
async function lanPost(path,payload={}){const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha na conexão local.");return data;}
function setLanStatus(text){const node=$("#lanStatus");if(node)node.textContent=text;}
function showLanAddresses(addresses){const holder=$("#lanAddressList");if(!holder)return;holder.innerHTML="";const list=addresses&&addresses.length?addresses:[{url:location.origin,address:location.host}];list.forEach(item=>{const line=document.createElement("div"),link=document.createElement("a");link.href=item.url;link.textContent=item.url;line.append(link);holder.append(line);});}
async function openLanLobby(){mode="lan";lanServerAvailable=false;$("#lanHost").hidden=false;$("#lanJoin").hidden=false;$("#lanHost").disabled=true;$("#lanJoin").disabled=true;showScreen("onlineScreen");setLanStatus("Verificando se o servidor de partidas locais está ativo…");try{const response=await fetch("/lan/info");if(!response.ok)throw new Error("Servidor local indisponível");const info=await response.json();if(!Array.isArray(info.addresses))throw new Error("Resposta inválida do servidor");lanServerAvailable=true;$("#lanHost").disabled=false;$("#lanJoin").disabled=false;showLanAddresses(info.addresses);setLanStatus("No aparelho anfitrião, escolha “Criar partida”.");}catch(e){showLanAddresses([{url:location.origin}]);setLanStatus("Esta versão hospedada permite jogar História, Arcade, Versus local e Treino. Para duas pessoas por Wi‑Fi, execute npm run dev em um computador e conecte os aparelhos à mesma rede.");}}
function connectLan(role,id){lanRole=role;lanId=id;lanPeerConnected=role==="guest";lanGuestReady=false;lanRemoteInput=Object.assign({},NEUTRAL_INPUT);if(lanEvents)lanEvents.close();lanEvents=new EventSource("/lan/events?role="+encodeURIComponent(role)+"&id="+encodeURIComponent(id));lanEvents.onmessage=event=>{let message;try{message=JSON.parse(event.data);}catch(e){return;}handleLanMessage(message);};lanEvents.onerror=()=>{if(lanRole===role)setLanStatus("Conexão local interrompida. Confira a rede Wi‑Fi e o servidor.");};if(lanInputTimer)clearInterval(lanInputTimer);if(role==="guest")lanInputTimer=setInterval(()=>{if(lanRole!=="guest"||!lanId||screen!=="gameScreen")return;lanPost("/lan/input",{id:lanId,input:humanInput(1)}).catch(()=>{});},50);}
async function createLanMatch(){try{setLanStatus("Criando a partida local…");const result=await lanPost("/lan/host");showLanAddresses(result.addresses);connectLan("host",result.id);lanPeerConnected=false;mode="lan";activeSide=1;openMode("lan");}catch(e){setLanStatus(e.message);}}
async function joinLanMatch(){try{setLanStatus("Procurando o anfitrião nesta rede…");const result=await lanPost("/lan/join");connectLan("guest",result.id);mode="lan";activeSide=2;$("#lanHost").hidden=true;$("#lanJoin").hidden=true;$("#selectModeLabel").textContent=MODE_NAMES.lan;fillRoster();showScreen("selectScreen");}catch(e){setLanStatus(e.message);}}
function lanSnapshot(){if(!match)return null;const fields=["mode","wins","roundNo","roundTicks","status","paused","banner","bannerTicks","projectiles","effects","warnings","assist","assistRoll","assistSpawn","assistSpawnFired","suddenDeath","suddenTicks","result","helpEnabled","hitCount","opponentId","cameraX","worldWidth","worldScale","roundEndTicks","rain"];const state={};fields.forEach(key=>{if(match[key]!==undefined)state[key]=match[key];});state.viewportHeight=viewport.h;return {state,fighters:match.fighters.map(f=>{const copy={};Object.keys(f).forEach(key=>{if(key!=="data"&&key!=="ai")copy[key]=f[key];});copy.fighterId=f.data.definition.id;return copy;})};}
function sendLanSnapshot(){if(lanRole!=="host"||!lanId||!match)return;lanPost("/lan/snapshot",{id:lanId,snapshot:lanSnapshot()}).catch(()=>{});}
function sendLanSelection(){if(mode!=="lan"||!lanId||!lanRole)return;const role=lanRole,id=lanId,fighterId=role==="guest"?selected.p2:selected.p1,ready=role==="guest"&&lanGuestReady;lanSelectionQueue=lanSelectionQueue.then(()=>lanPost("/lan/select",{id,role,fighterId,ready})).catch(error=>{if(lanRole===role&&lanId===id){const status=$("#lanSelectStatus");if(status){status.hidden=false;status.textContent="Não foi possível enviar a escolha do personagem. Confira a conexão e tente novamente.";}console.warn("Falha ao sincronizar personagem da partida local:",error);}});}
function handleLanMessage(message){
 if(message.type==="peer"&&lanRole==="host"){lanPeerConnected=!!message.connected;if(!lanPeerConnected)lanGuestReady=false;if(!lanPeerConnected&&match&&screen==="gameScreen"){lanRemoteInput=Object.assign({},NEUTRAL_INPUT);match.paused=true;$("#pausePanel").hidden=false;$("#pausePanel").querySelector(".eyebrow").textContent="JOGADOR 2 DESCONECTADO";}updateSelection();if(lanPeerConnected)sendLanSelection();return;}
 if(message.type==="selection"&&mode==="lan"){const fighter=BY_ID[message.fighterId];if(!fighter)return;if(lanRole==="host"&&message.player===2){selected.p2=fighter.id;lanGuestReady=!!message.ready;activeSide=1;updateSelection();return;}if(lanRole==="guest"&&message.player===1){selected.p1=fighter.id;activeSide=2;updateSelection();return;}}
 if(message.type==="input"&&lanRole==="host"){lanRemoteInput=Object.assign({},NEUTRAL_INPUT,message.input||{});return;}
 if(message.type==="start"&&lanRole==="guest"){selected={p1:message.p1,p2:message.p2};mode="lan";unlockAudio();beginMatch(message.p2);return;}
 if(message.type==="snapshot"&&lanRole==="guest"&&match&&message.snapshot){const snapshot=message.snapshot,state=snapshot.state||{},wasOver=match.status==="matchOver",sourceWorld=state.worldWidth||arenaWorldWidth(),sourceScale=state.worldScale||1,sourceGround=(state.viewportHeight||viewport.h)*.93,localWorld=arenaWorldWidth(),localScale=viewport.h/720,worldRatio=localWorld/sourceWorld,heightRatio=localScale/sourceScale,toY=y=>groundY()+(y-sourceGround)*heightRatio;Object.assign(match,state);match.worldWidth=localWorld;match.worldScale=localScale;(snapshot.fighters||[]).forEach((fighterState,index)=>{const fighter=match.fighters[index],data=assets[fighterState.fighterId];if(fighter&&data){Object.assign(fighter,fighterState);fighter.data=data;fighter.x=fighterState.x*worldRatio;fighter.jumpY=(fighterState.jumpY||0)*heightRatio;fighter.jumpVy=(fighterState.jumpVy||0)*heightRatio;fighter.scale=fighterTargetHeight()/fighter.bodyHeight;}});match.projectiles=(state.projectiles||[]).map(p=>({...p,x:p.x*worldRatio,y:toY(p.y),width:p.width*heightRatio,height:p.height*heightRatio}));match.effects=(state.effects||[]).map(e=>({...e,x:e.x*worldRatio,y:toY(e.y)}));match.warnings=(state.warnings||[]).map(w=>({...w,x:w.x*worldRatio,y:toY(w.y)}));if(state.assist){match.assist={...state.assist,x:state.assist.x*worldRatio};if(state.assist.towel)match.assist.towel={...state.assist.towel,x:state.assist.towel.x*worldRatio,startX:state.assist.towel.startX*worldRatio,y:toY(state.assist.towel.y),startY:toY(state.assist.towel.startY)};}match.cameraX=Math.max(0,Math.min(match.worldWidth-viewport.w,(match.fighters[0].x+match.fighters[1].x)/2-viewport.w/2));stage=match.opponentId==="lorehy"||selected.p1==="lorehy"?stages.boss:stages.bronx;$("#pausePanel").hidden=!match.paused;if(match.paused){$("#pausePanel").querySelector(".eyebrow").textContent="O ANFITRIÃO PAUSOU A LUTA";$("#resumeButton").hidden=true;$("#pauseOptions").hidden=true;$("#pauseQuit").hidden=true;}if(match.status==="matchOver"&&!wasOver){showMatchResult();$("#resultPrimary").hidden=true;$("#resultMenu").textContent="SAIR DA PARTIDA";}return;}
 if(message.type==="hostLeft"&&lanRole==="guest"){disconnectLan(false);match=null;mode="cpu";showScreen("onlineScreen");setLanStatus("O anfitrião encerrou a partida.");return;}
 if(message.type==="waiting"&&lanRole==="guest"){updateSelection();sendLanSelection();}
}
function disconnectLan(notify=true){if(lanSnapshotTimer){clearInterval(lanSnapshotTimer);lanSnapshotTimer=0;}if(lanInputTimer){clearInterval(lanInputTimer);lanInputTimer=0;}const role=lanRole,id=lanId;if(lanEvents){lanEvents.close();lanEvents=null;}lanRole=null;lanId=null;lanPeerConnected=false;lanRemoteInput=Object.assign({},NEUTRAL_INPUT);if(notify&&role&&id)lanPost("/lan/leave",{role,id}).catch(()=>{});}
function image(url){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error("Falha ao carregar "+url));im.src=url;});}
function loadFighter(id){if(assets[id])return Promise.resolve(assets[id]);const def=BY_ID[id];return fetch(asset("assets/fighters/"+id+"/atlas.json")).then(r=>{if(!r.ok)throw Error("Metadados ausentes: "+def.name);return r.json();}).then(meta=>image(asset("assets/fighters/"+id+"/atlas.png")).then(atlas=>(assets[id]={definition:def,meta:meta,atlas:atlas})));}
function makeBonusSheet(atlas,rows){
 const sample=document.createElement("canvas");sample.width=atlas.naturalWidth;sample.height=atlas.naturalHeight;const sampleCtx=sample.getContext("2d",{willReadFrequently:true});sampleCtx.drawImage(atlas,0,0);const pixels=sampleCtx.getImageData(0,0,sample.width,sample.height).data,frames=[];
 for(let row=0;row<rows;row++)for(let col=0;col<4;col++){
  const x0=Math.round(col*sample.width/4),x1=Math.round((col+1)*sample.width/4),y0=Math.round(row*sample.height/rows),y1=Math.round((row+1)*sample.height/rows);let left=x1,top=y1,right=x0,bottom=y0;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(pixels[(y*sample.width+x)*4+3]>80){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
  frames.push({x:left,y:top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)});
 }
 return {image:atlas,frames};
}
function loadBonus(){if(bonusAssets)return Promise.resolve(bonusAssets);return Promise.all([image(asset("assets/bonus/npc-run.png")),image(asset("assets/bonus/npc-actions.png"))]).then(([run,actions])=>(bonusAssets={run:makeBonusSheet(run,2),actions:makeBonusSheet(actions,3)}));}
function fillRoster(){
 const box=$("#roster");box.innerHTML="";
 FIGHTERS.forEach(f=>{
  const b=document.createElement("button");b.type="button";b.className="fighter-card"+(f.boss?" boss":"");b.dataset.id=f.id;b.setAttribute("aria-label",f.name);b.title=f.name;
  const img=document.createElement("img");img.src=asset("assets/fighters/"+f.id+"/portraits/portrait.webp");img.alt=f.name;img.loading="eager";img.decoding="async";
  b.append(img);
  if(mode==="story"&&f.boss){b.disabled=true;b.title="Lorehy é o chefe final da campanha.";}
  b.onclick=()=>{if(b.disabled)return;if(mode==="lan"&&lanRole==="guest")lanGuestReady=false;selected[activeSide===1?"p1":"p2"]=f.id;setFeatured(f.id);if(mode==="lan")sendLanSelection();};
  box.appendChild(b);
 });
 updateSelection();
}
function setFeatured(){updateSelection();}
function updateSelection(){
 const p1=BY_ID[selected.p1],p2=BY_ID[selected.p2],twoPlayer=mode==="versus"||mode==="lan",lanGuest=mode==="lan"&&lanRole==="guest",lanHost=mode==="lan"&&lanRole==="host";
 $("#selectLayout").classList.toggle("two-player",twoPlayer);$("#selectLayout").classList.toggle("lan-guest",lanGuest);
 $("#selectP2").hidden=!twoPlayer;$("#selectP2").disabled=!twoPlayer||lanHost;$("#selectP1").disabled=lanGuest;
 $("#selectP2Panel").hidden=!twoPlayer;
 $("#p1SelectedArt").src=asset("assets/fighters/"+p1.id+"/portraits/large.png");
 if(twoPlayer)$("#p2SelectedArt").src=asset("assets/fighters/"+p2.id+"/portraits/large.png");
 $("#p1Picked").textContent=p1.name;$("#p2Picked").textContent=p2.name;
 $("#selectP1").classList.toggle("selected",activeSide===1);$("#selectP2").classList.toggle("selected",activeSide===2);
 $("#storyNotice").hidden=mode!=="story";$("#lanSelectStatus").hidden=mode!=="lan";
 if(mode==="lan")$("#lanSelectStatus").textContent=lanGuest?(lanGuestReady?"Personagem confirmado. Aguardando o anfitrião iniciar.":"Escolha seu personagem e confirme para entrar na luta."):lanPeerConnected?(lanGuestReady?"Jogador 2 confirmou "+p2.name+". Pode iniciar a luta.":"Jogador 2 conectado. Aguardando a escolha e confirmação do personagem."):"Aguardando o jogador 2 entrar pelo endereço local.";
 $("#p2SelectHint").textContent=twoPlayer?(mode==="lan"?(lanGuest?"VOCÊ ESCOLHE O PERSONAGEM DO JOGADOR 2":"O JOGADOR 2 ESCOLHE NO OUTRO APARELHO"):"CONTROLE 1 · CONTROLE 2"):"";$("#p1Keys").textContent=lanGuest?"P2: WASD / SETAS":"P1: SETAS / CONTROLE 1";$("#p2Keys").textContent=lanGuest?"ENTER / A CONFIRMA":lanHost?"P2: ESCOLHE NO OUTRO APARELHO":mode==="versus"?"P2: WASD / CONTROLE 2":"";$("#p2Keys").hidden=!twoPlayer;
 const start=$("#startMatch"),ready=$("#readyFighter");start.hidden=lanGuest;ready.hidden=!lanGuest;ready.disabled=lanGuest&&!lanPeerConnected;ready.firstChild.textContent=lanGuestReady?"LUTADOR CONFIRMADO · AGUARDANDO P1 ":"CONFIRMAR MEU LUTADOR ";
 updateVersusAvailability();if(lanHost)start.disabled=!lanPeerConnected||!lanGuestReady;
 $$(".fighter-card").forEach(b=>{const one=b.dataset.id===selected.p1,two=twoPlayer&&b.dataset.id===selected.p2;b.classList.toggle("selected-p1",one);b.classList.toggle("selected-p2",two);b.setAttribute("aria-pressed",String(one||two));});
}
function moveSelectionCursor(side,dx,dy){
 const roster=FIGHTERS.filter(f=>!(mode==="story"&&f.boss)),key=side===1?"p1":"p2",index=Math.max(0,roster.findIndex(f=>f.id===selected[key])),row=Math.floor(index/3),col=index===6&&roster.length===7?1:index%3;let next=index;
 if(dx){const candidate=roster.findIndex((_,i)=>Math.floor(i/3)===row&&(i===6&&roster.length===7?1:i%3)===col+dx);if(candidate>=0)next=candidate;}
 else if(dy){const targetRow=Math.max(0,Math.min(Math.ceil(roster.length/3)-1,row+dy));const candidates=roster.map((fighter,i)=>({fighter,i,row:Math.floor(i/3),col:i===6&&roster.length===7?1:i%3})).filter(item=>item.row===targetRow).sort((a,b)=>Math.abs(a.col-col)-Math.abs(b.col-col));if(candidates.length)next=candidates[0].i;}
 if(next===index){activeSide=side;updateSelection();return;}activeSide=side;if(mode==="lan"&&lanRole==="guest")lanGuestReady=false;selected[key]=roster[next].id;updateSelection();if(mode==="lan")sendLanSelection();document.querySelector('.fighter-card[data-id="'+roster[next].id+'"]')?.focus({preventScroll:true});
}
function openMode(next){if(isMobilePortrait())return;if(next==="versus"&&!updateVersusAvailability())return;if(next==="online"){openLanLobby();return;}enterArcadeSession();mode=next;activeSide=1;if(mode==="story"&&selected.p1==="lorehy")selected.p1="daniel";if(mode!=="versus"&&selected.p2===selected.p1)selected.p2=(FIGHTERS.find(f=>f.id!==selected.p1&&(!f.boss||mode==="cpu"))||FIGHTERS.find(f=>f.id!==selected.p1)).id;$("#selectModeLabel").textContent=MODE_NAMES[mode];fillRoster();updateVersusAvailability();showScreen("selectScreen");}
function setTouchStyle(){document.documentElement.style.setProperty("--touch-size",(58*settings.touchSize/100)+"px");document.documentElement.style.setProperty("--touch-opacity",String(Math.max(90,settings.touchOpacity)/100));}
function fillOptions(){const set=(id,v)=>$("#"+id).value=v;const check=(id,v)=>$("#"+id).checked=v;set("difficulty",settings.difficulty);set("roundTime",String(settings.roundSeconds));check("assistEnabled",settings.assistEnabled);check("musicEnabled",settings.musicEnabled);check("sfxEnabled",settings.sfxEnabled);check("voiceEnabled",settings.voiceEnabled);check("fighterVoiceEnabled",settings.fighterVoiceEnabled);set("musicVolume",settings.musicVolume);set("sfxVolume",settings.sfxVolume);set("voiceVolume",settings.voiceVolume);set("touchSize",settings.touchSize);set("touchOpacity",settings.touchOpacity);check("trainingInfiniteHealth",settings.trainingInfiniteHealth);check("trainingInfiniteEnergy",settings.trainingInfiniteEnergy);check("trainingHitboxes",settings.trainingHitboxes);set("trainingDummy",settings.trainingDummy);renderBindings();}
function readOptions(){settings.difficulty=$("#difficulty").value;settings.roundSeconds=Number($("#roundTime").value)||99;["assistEnabled","musicEnabled","sfxEnabled","voiceEnabled","fighterVoiceEnabled","trainingInfiniteHealth","trainingInfiniteEnergy","trainingHitboxes"].forEach(id=>settings[id]=$("#"+id).checked);["musicVolume","sfxVolume","voiceVolume","touchSize","touchOpacity"].forEach(id=>settings[id]=Number($("#"+id).value));settings.trainingDummy=$("#trainingDummy").value;}
function saveSettings(){try{localStorage.setItem("bronx-settings",JSON.stringify(settings));}catch(e){}setTouchStyle();if(audio)audio.update();$("#optionStatus").textContent="Opções salvas neste dispositivo.";setTimeout(()=>$("#optionStatus").textContent="",2200);}
function renderBindings(){const holder=$("#bindings");holder.innerHTML="";["p1","p2"].forEach(player=>Object.keys(ACTIONS).forEach(action=>{const k=document.createElement("button");k.type="button";k.className="bind-button";k.innerHTML=player.toUpperCase()+" "+ACTIONS[action]+" · tecla <span>"+String(settings.keyMap[player][action]).replace("Key","")+"</span>";k.onclick=()=>{remap={type:"key",player:player,action:action,button:k};k.classList.add("listening");k.querySelector("span").textContent="...";};holder.appendChild(k);const p=document.createElement("button");p.type="button";p.className="bind-button";p.innerHTML=player.toUpperCase()+" "+ACTIONS[action]+" · pad <span>B"+(Number(settings.padMap[player][action])+1)+"</span>";p.onclick=()=>{remap={type:"pad",player:player,action:action,button:p};p.classList.add("listening");p.querySelector("span").textContent="...";};holder.appendChild(p);}));}
function assignKey(code){if(!remap||remap.type!=="key")return false;settings.keyMap[remap.player][remap.action]=code;remap=null;renderBindings();saveSettings();return true;}
function assignPad(n){if(!remap||remap.type!=="pad")return false;settings.padMap[remap.player][remap.action]=n;remap=null;renderBindings();saveSettings();return true;}
function returnFromOptions(){if(previousScreen==="gameScreen"&&match){showScreen("gameScreen");$("#pausePanel").hidden=!match.paused;if(match.paused){gamepadPauseIndex=0;$("#resumeButton").focus({preventScroll:true});}}else showScreen("menuScreen");}

class AudioBus{
 constructor(){this.ctx=null;this.track="title";this.musicSuspended=false;this.music=new Audio();this.music.loop=true;this.music.preload="auto";this.music.src=asset("music/Stages/title_screen/title_screen.mp3");}
 unlock(){if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(C)this.ctx=new C();}if(this.ctx&&this.ctx.state==="suspended")this.ctx.resume();this.update();}
 selectTrack(name){if(this.track===name)return;this.track=name;this.music.src=asset(name==="stage"?"music/Stages/stage_bronx/stage_bronx.mp3":"music/Stages/title_screen/title_screen.mp3");this.music.load();this.update();}
 pauseMusic(){this.musicSuspended=true;this.music.pause();}
 resumeMusic(){this.musicSuspended=false;this.update();}
 update(){this.music.volume=Math.max(0,Math.min(1,settings.musicVolume/100));if(!settings.musicEnabled||this.musicSuspended){this.music.pause();return;}const playing=this.music.play();if(playing&&playing.catch)playing.catch(()=>{});}
 effect(kind){if(!settings.sfxEnabled||!this.ctx)return;const bank={hit:[180,75],block:[310,130],special:[130,440],menu:[440,600],ko:[100,65],pickup:[520,780],jump:[240,360]},seq=bank[kind]||bank.hit,t=this.ctx.currentTime;seq.forEach((freq,i)=>{const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=kind==="hit"?"square":"triangle";o.frequency.setValueAtTime(freq,t+i*.045);g.gain.setValueAtTime(.0001,t+i*.045);g.gain.exponentialRampToValueAtTime(Math.max(.0001,settings.sfxVolume/100*.065),t+i*.045+.012);g.gain.exponentialRampToValueAtTime(.0001,t+i*.045+.11);o.connect(g);g.connect(this.ctx.destination);o.start(t+i*.045);o.stop(t+i*.045+.13);});}
}
function unlockAudio(){if(!audio)audio=new AudioBus();audio.unlock();}
function sound(kind){if(audio)audio.effect(kind);}
let voicePlayer=null;
function playVoiceClip(name,onended){if(!settings.voiceEnabled||settings.voiceVolume<=0)return;try{if(voicePlayer){voicePlayer.pause();voicePlayer.onended=null;}voicePlayer=new Audio(asset("music/"+name+".mp3"));voicePlayer.volume=Math.max(0,Math.min(1,settings.voiceVolume/100));voicePlayer.onended=onended||null;voicePlayer.play().catch(()=>{});}catch(e){}}
function playConditionVoice(won){playVoiceClip("conditions/"+(won?"YOU_WIN":"YOU_LOSE"),()=>{if(!won)playVoiceClip("conditions/GAME_OVER");});}
let fighterVoiceNext=0;
function speakFighter(f,kind){
 if(!settings.fighterVoiceEnabled||settings.voiceVolume<=0||!window.speechSynthesis||!window.SpeechSynthesisUtterance)return;
 const now=Date.now(),profile=FIGHTER_VOICES[f.data.definition.id],priority=kind==="special"||kind==="win";if(!profile||(!priority&&(now<f.voiceReadyAt||now<fighterVoiceNext)))return;
 if(window.speechSynthesis.speaking){if(priority)window.speechSynthesis.cancel();else return;}
 const phrase=kind==="attack"?profile.attack[Math.floor(Math.random()*profile.attack.length)]:(profile[kind]||profile.hit);
 try{const line=new SpeechSynthesisUtterance(phrase);line.lang="pt-BR";line.rate=profile.rate;line.pitch=profile.pitch;line.volume=Math.max(0,Math.min(1,settings.voiceVolume/100));const voices=window.speechSynthesis.getVoices();line.voice=voices.find(v=>/^pt[-_]br$/i.test(v.lang))||voices.find(v=>/^pt/i.test(v.lang))||null;window.speechSynthesis.speak(line);f.voiceReadyAt=now+(kind==="special"?1500:850);fighterVoiceNext=now+(kind==="special"?500:420);}catch(e){}
}
function announceRound(round){playVoiceClip("rounds/"+(round===1?"ROUND_ONE":round===2?"ROUND_TWO":"FINAL_ROUND"));}

async function startSelection(){
 if(isMobilePortrait())return;
 if(mode==="versus"&&!updateVersusAvailability()){const notice=$("#versusSelectNotice");notice.hidden=false;notice.textContent="Conecte e pressione um botão em dois controles para jogar Versus.";return;}
 if(mode==="lan"&&lanRole!=="host")return;
 if(mode==="lan"&&!lanPeerConnected){const status=$("#lanSelectStatus");status.hidden=false;status.textContent="Aguardando o jogador 2 entrar pelo endereço local.";return;}
 if(mode==="lan"&&!lanGuestReady){const status=$("#lanSelectStatus");status.hidden=false;status.textContent="Aguardando o jogador 2 escolher e confirmar o personagem.";return;}
 enterArcadeSession();requestGameFullscreen();
 if(mode==="story"){primeBossCinemaFromGesture();campaign=storyOpponents(FIGHTERS.filter(f=>!f.boss).map(f=>f.id),selected.p1,"lorehy");campaignIndex=0;beginStoryStep();return;}
 let opponent=selected.p2;if(mode!=="versus"&&opponent===selected.p1){opponent=FIGHTERS.find(f=>f.id!==selected.p1).id;selected.p2=opponent;}beginMatch(opponent);
}
function confirmLanFighter(){if(mode!=="lan"||lanRole!=="guest"||!lanId)return;lanGuestReady=true;updateSelection();sendLanSelection();}
function beginStoryStep(){if(mode==="story"&&campaign[campaignIndex]==="lorehy")playBossCinema();else beginMatch(campaign[campaignIndex]);}
function showCinemaStartPrompt(run=cinemaRun){if(run!==cinemaRun||screen!=="cinemaScreen")return;const fallback=$("#cinemaFallback");$("#cinemaFallbackTitle").textContent="INICIAR INTRODUÇÃO";$("#cinemaFallbackCopy").textContent="O navegador bloqueou o início automático com som. Toque para reproduzir a introdução com áudio.";$("#retryCinema").textContent="REPRODUZIR COM ÁUDIO";$("#retryCinema").hidden=false;fallback.hidden=false;$("#retryCinema").focus({preventScroll:true});}
function showCinemaLoadError(run=cinemaRun){if(run!==cinemaRun||screen!=="cinemaScreen")return;const video=$("#bossCinema"),fallback=$("#cinemaFallback");video.hidden=true;$("#cinemaFallbackTitle").textContent="INTRO INDISPONÍVEL";$("#cinemaFallbackCopy").textContent="O arquivo não carregou ou este navegador não decodifica o vídeo. Use “Pular intro” para enfrentar o chefe.";$("#retryCinema").hidden=true;fallback.hidden=false;}
function tryPlayCinema(video,run=cinemaRun){if(run!==cinemaRun||screen!=="cinemaScreen")return;if(video.error||video.dataset.loadError==="true"){showCinemaLoadError(run);return;}if(video.readyState<3){video.addEventListener("canplay",()=>tryPlayCinema(video,run),{once:true});return;}let request;try{request=video.play();}catch(error){showCinemaLoadError(run);return;}if(request&&request.catch)request.catch(error=>{if(run!==cinemaRun)return;if(error&&error.name==="NotAllowedError")showCinemaStartPrompt(run);else{console.error("Falha ao reproduzir a introdução do chefe:",error);showCinemaLoadError(run);}});}
function prepareBossCinema(){const video=$("#bossCinema"),source=asset("assets/cinematics/boss_intro.mp4");video.preload="auto";if(video.dataset.source!==source){video.dataset.source=source;video.dataset.loadError="false";video.onerror=()=>{video.dataset.loadError="true";if(screen==="cinemaScreen")showCinemaLoadError(cinemaRun);};video.src=source;video.load();}return video;}
function primeBossCinemaFromGesture(){const video=prepareBossCinema();video.muted=true;video.preload="auto";video.onended=null;}
function playBossCinema(){const run=++cinemaRun,v=prepareBossCinema(),cinema=$("#cinemaScreen"),fb=$("#cinemaFallback");if(audio)audio.pauseMusic();fb.hidden=true;v.hidden=false;v.pause();v.autoplay=false;v.muted=false;v.volume=1;try{if(v.readyState>0)v.currentTime=0;else v.addEventListener("loadedmetadata",()=>{if(run===cinemaRun)try{v.currentTime=0;}catch(e){}},{once:true});}catch(e){}$("#toggleCinemaAudio").textContent="DESATIVAR ÁUDIO";$("#toggleCinemaAudio").setAttribute("aria-pressed","true");$("#retryCinema").textContent="INICIAR VÍDEO";v.onerror=()=>showCinemaLoadError(run);v.onended=()=>{if(run!==cinemaRun||screen!=="cinemaScreen"||!cinema.classList.contains("active"))return;cinemaRun++;v.autoplay=false;if(audio)audio.resumeMusic();beginMatch("lorehy");};showScreen("cinemaScreen");if(!cinema.classList.contains("active")){showCinemaLoadError(run);return;}requestAnimationFrame(()=>{if(run===cinemaRun&&screen==="cinemaScreen")tryPlayCinema(v,run);});}
function retryCinema(){const v=$("#bossCinema");$("#cinemaFallback").hidden=true;v.hidden=false;tryPlayCinema(v);}
function toggleCinemaAudio(){const v=$("#bossCinema"),button=$("#toggleCinemaAudio");v.muted=!v.muted;button.textContent=v.muted?"ATIVAR ÁUDIO":"DESATIVAR ÁUDIO";button.setAttribute("aria-pressed",String(!v.muted));if(v.paused)tryPlayCinema(v);}
function skipCinema(){cinemaRun++;const v=$("#bossCinema");v.pause();v.autoplay=false;v.onended=null;v.onerror=null;v.hidden=true;$("#cinemaFallback").hidden=true;if(audio)audio.resumeMusic();beginMatch("lorehy");}
async function beginMatch(opponentId){
 try{
  unlockAudio();stage=opponentId==="lorehy"||selected.p1==="lorehy"?stages.boss:stages.bronx;if(audio)audio.selectTrack("stage");const data=await Promise.all([loadFighter(selected.p1),loadFighter(opponentId)]),bonus=(settings.assistEnabled||mode==="lan")&&mode!=="training"?await loadBonus():null;
   match={mode:mode,assets:data,bonus:bonus,fighters:[],wins:[0,0],roundNo:1,roundTicks:settings.roundSeconds*60,status:"intro",paused:false,banner:"ROUND ONE",bannerTicks:75,projectiles:[],effects:[],warnings:[],assist:null,assistRoll:false,assistSpawn:0,assistSpawnFired:false,suddenDeath:false,suddenTicks:0,result:null,helpEnabled:settings.assistEnabled,hitCount:[0,0],opponentId:opponentId,cameraX:0,worldWidth:0};
  match.fighters=[makeFighter(data[0],1,opponentId,mode),makeFighter(data[1],2,selected.p1,mode)];
   $("#gameModeLabel").textContent=MODE_NAMES[mode]||"ARCADE";$("#resultPanel").hidden=true;$("#pausePanel").hidden=true;$("#touchControls").hidden=!matchMedia("(pointer:coarse)").matches;document.body.classList.toggle("is-touch",!$("#touchControls").hidden);$("#gamePauseButton").hidden=mode==="lan"&&lanRole==="guest";cleanInput();showScreen("gameScreen");resetRound(true);last=0;if(audio)audio.update();if(mode==="lan"&&lanRole==="host"){lanPost("/lan/start",{id:lanId,p1:selected.p1,p2:opponentId}).catch(e=>setLanStatus(e.message));if(lanSnapshotTimer)clearInterval(lanSnapshotTimer);lanSnapshotTimer=setInterval(sendLanSnapshot,50);}
 }catch(e){console.error(e);alert("Não foi possível iniciar os assets: "+e.message);}
}
function makeFighter(data,player,targetId,gameMode){
 const idle=(data.meta.animations.idle||[]).map(id=>data.meta.frames[id]).filter(Boolean),hs=idle.map(f=>f.height).sort((a,b)=>a-b);
 const cpu=player===2&&(gameMode==="cpu"||gameMode==="story"||gameMode==="training");
 return {data:data,player:player,targetId:targetId,x:0,health:1000,energy:0,facing:player===1?1:-1,state:"idle",stateAge:0,animAge:0,attack:null,hitstun:0,fallTicks:0,getupTicks:0,jumpY:0,jumpVy:0,knockVX:0,bodyHeight:hs.length?hs[Math.floor(hs.length/2)]:240,scale:1,prevInput:{},guardMode:"high",specialCooldown:0,specialConfig:null,specialFired:false,voiceReadyAt:0,ai:cpu?{decision:0,actionTicks:0,action:{},passive:gameMode==="training"&&settings.trainingDummy==="passive"}:null};
}
function setState(f,s,force){if(f.state===s&&!force)return;f.state=s;f.stateAge=0;f.animAge=0;}
function resetRound(first){
 const arena=stageRect(),H=viewport.h,W=viewport.w;if(!match)return;match.worldScale=H/720;match.worldWidth=arenaWorldWidth();match.cameraX=Math.max(0,(match.worldWidth-W)/2);match.projectiles=[];match.effects=[];match.warnings=[];match.rain=null;match.suddenDeath=false;match.suddenTicks=0;match.assist=null;match.assistRoll=false;match.assistSpawnFired=false;match.roundTicks=settings.roundSeconds*60;match.status="intro";match.banner=match.roundNo===1?"ROUND ONE":match.roundNo===2?"ROUND TWO":"FINAL ROUND";match.bannerTicks=70;announceRound(match.roundNo);
 const targetH=fighterTargetHeight(),x1=match.cameraX+W*.36,x2=match.cameraX+W*.64;
 match.fighters.forEach((f,i)=>{f.x=i===0?x1:x2;f.health=1000;f.energy=first?0:25;f.state="idle";f.stateAge=0;f.animAge=0;f.attack=null;f.hitstun=0;f.fallTicks=0;f.getupTicks=0;f.jumpY=0;f.jumpVy=0;f.knockVX=0;f.prevInput={};f.facing=i===0?1:-1;f.scale=targetH/f.bodyHeight;if(f.ai){f.ai.decision=0;f.ai.actionTicks=0;f.ai.action={};}});
 if(match.helpEnabled&&mode!=="training"&&Math.random()<.3){match.assistRoll=true;match.assistSpawn=(18+Math.floor(Math.random()*13))*60;}
}
function startNextRound(){if(seriesWinner(match.wins,2)!==null){showMatchResult();return;}match.roundNo++;resetRound(false);}
function showMatchResult(){
 match.status="matchOver";match.paused=false;const p1=match.wins[0]>match.wins[1],playerWon=mode==="lan"&&lanRole==="guest"?!p1:p1,story=mode==="story",enemy=mode==="lan"&&lanRole==="guest"?match.fighters[0].data.definition.name:BY_ID[match.opponentId].name;
 const localScore=mode==="lan"&&lanRole==="guest"?match.wins[1]:match.wins[0],remoteScore=mode==="lan"&&lanRole==="guest"?match.wins[0]:match.wins[1],panel=$("#resultPanel"),primary=$("#resultPrimary"),menu=$("#resultMenu");panel.hidden=false;panel.classList.toggle("game-over",!playerWon);$("#resultEyebrow").textContent=story?"MODO HISTÓRIA":"PARTIDA ENCERRADA";
 $("#resultTitle").textContent=story&&playerWon&&campaignIndex===campaign.length-1?"CAMPEÃO DO BRONX":playerWon?"VITÓRIA":"DERROTA";
 $("#resultCopy").textContent=story?(playerWon?(campaignIndex<campaign.length-1?"Você venceu "+enemy+". A campanha continua.":"Você derrotou Lorehy e encerrou a campanha."):(enemy+" venceu este combate. Você pode tentar novamente.")):(playerWon?"Você venceu "+enemy+" em "+localScore+" a "+remoteScore+".":enemy+" venceu em "+remoteScore+" a "+localScore+".");
 if(story&&playerWon&&campaignIndex<campaign.length-1){
  const next=BY_ID[campaign[campaignIndex+1]];
  if(next&&next.id==="lorehy"){
   campaignIndex++;panel.hidden=true;primary.hidden=true;menu.hidden=true;playBossCinema();return;
  }
  const completedMatch=match;$("#resultTitle").textContent="VITÓRIA";$("#resultCopy").textContent="Próxima luta: "+(next?next.name:"...");primary.hidden=true;menu.hidden=true;playConditionVoice(true);
  setTimeout(()=>{if(match!==completedMatch||screen!=="gameScreen")return;campaignIndex++;panel.hidden=true;beginStoryStep();},1800);return;
 }
 primary.hidden=false;menu.hidden=false;
 if(story&&!playerWon){primary.textContent="TENTAR DE NOVO";primary.onclick=()=>{const id=campaign[campaignIndex];match=null;panel.hidden=true;beginMatch(id);};}
 else if(story){primary.textContent="VOLTAR AO MENU";primary.onclick=()=>{match=null;showScreen("menuScreen");};}
 else{primary.textContent="REVANCHE";primary.onclick=()=>{const id=match.opponentId;match=null;panel.hidden=true;beginMatch(id);};}
 sound("ko");playConditionVoice(playerWon);
}
function finishRound(winner,reason){if(!match||match.status!=="fight")return;match.status="roundEnd";match.roundEndTicks=130;match.wins[winner]++;match.banner=reason==="time"?"TIME OVER":"K.O.";match.bannerTicks=90;match.fighters.forEach((f,i)=>{f.attack=null;setState(f,i===winner?"win":"lose",true);});match.projectiles=[];match.warnings=[];match.rain=null;match.assist=null;const victor=match.fighters[winner];setTimeout(()=>{if(match&&match.fighters.includes(victor))speakFighter(victor,"win");},900);sound("ko");}
function tieBreak(){const a=match.fighters[0],b=match.fighters[1];return timerWinner(a.health,b.health,match.hitCount[0],match.hitCount[1],Math.random());}

function connectedGamepads(){if(!navigator.getGamepads)return [];try{return Array.from(navigator.getGamepads()||[]).filter(pad=>pad&&pad.connected!==false);}catch(e){return [];}}
function updateVersusAvailability(){const pads=connectedGamepads(),ready=pads.length>=2,button=$(".arcade-choice[data-mode=\"versus\"]"),small=button&&button.querySelector("small"),notice=$("#versusSelectNotice"),start=$("#startMatch"),requiresPads=screen==="selectScreen"&&mode==="versus",lanBlocked=screen==="selectScreen"&&mode==="lan"&&lanRole==="host"&&(!lanPeerConnected||!lanGuestReady);if(button){button.disabled=!ready;button.classList.toggle("unavailable",!ready);button.title=ready?"Dois controles conectados":"Conecte e pressione um botão em dois controles para liberar o Versus.";button.setAttribute("aria-label",ready?"Versus, dois controles conectados":"Versus indisponível. Conecte dois controles.");if(small)small.textContent=ready?"2 CONTROLES PRONTOS":"CONECTE 2 CONTROLES";}if(notice){notice.hidden=mode!=="versus"||ready;if(mode==="versus"&&!ready)notice.textContent="Conecte e pressione um botão em dois controles para jogar Versus.";}if(start){start.disabled=(requiresPads&&!ready)||lanBlocked;start.title=requiresPads&&!ready?"O Versus exige dois controles conectados.":lanBlocked?"Aguarde o jogador 2 escolher e confirmar um personagem.":"";}return ready;}
function readPad(player){
 const pad=connectedGamepads()[player-1];if(!pad)return null;
 const buttons=pad.buttons||[];
 if(remap&&remap.type==="pad"&&buttons.some(b=>b.pressed)){const n=buttons.findIndex(b=>b.pressed);if(n>=0){assignPad(n);return {direction:0,up:false,down:false,punch:false,kick:false,guard:false,special:false};}}
 const map=settings.padMap[player===1?"p1":"p2"],axes=pad.axes||[],axisX=axes[0]||0,axisY=axes[1]||0;
 return {direction:Math.abs(axisX)>.32?(axisX<0?-1:1):(buttons[14]&&buttons[14].pressed?-1:buttons[15]&&buttons[15].pressed?1:0),up:!!((buttons[12]&&buttons[12].pressed)||axisY<-.55),down:!!((buttons[13]&&buttons[13].pressed)||axisY>.55),punch:!!(buttons[map.punch]&&buttons[map.punch].pressed),kick:!!(buttons[map.kick]&&buttons[map.kick].pressed),guard:!!(buttons[map.guard]&&buttons[map.guard].pressed),special:!!(buttons[map.special]&&buttons[map.special].pressed)};
}
function humanInput(player){
 const side=player===1?"p1":"p2",left=player===1?"ArrowLeft":"KeyA",right=player===1?"ArrowRight":"KeyD",up=player===1?"ArrowUp":"KeyW",down=player===1?"ArrowDown":"KeyS";
 const t=Array.from(touches.values()).filter(v=>v.player===player).map(v=>v.action),pad=readPad(player)||{},stick=virtualStick&&virtualStick.player===player?virtualStick:null;
 const action=a=>keys.has(settings.keyMap[side][a])||t.includes(a)||!!pad[a];
 const direction=keys.has(left)||t.includes("left")?-1:keys.has(right)||t.includes("right")?1:stick&&Math.abs(stick.x)>.12?stick.x:(pad.direction||0);
 return {direction:direction,up:keys.has(up)||t.includes("up")||!!(stick&&stick.y<-.42)||pad.up,down:keys.has(down)||t.includes("down")||!!(stick&&stick.y>.42)||pad.down,punch:action("punch"),kick:action("kick"),guard:action("guard"),special:action("special")};
}
function aiInput(f,target){
 const ai=f.ai,profile=aiProfiles[settings.difficulty]||aiProfiles.normal;
 if(ai.passive)return {direction:0,up:false,down:false,punch:false,kick:false,guard:false,special:false};
 if(ai.actionTicks>0){ai.actionTicks--;return Object.assign({direction:0,up:false,down:false,punch:false,kick:false,guard:false,special:false},ai.action);}
 if(ai.decision>0){ai.decision--;return {direction:ai.action.direction||0,up:false,down:false,punch:false,kick:false,guard:false,special:false};}
 ai.decision=Math.max(1,Math.round(Math.max(profile.decisionMs,profile.reactionMs*.6)*60/1000));
 const dist=Math.abs(target.x-f.x),toward=target.x>f.x?1:-1,act={direction:0,up:false,down:false,punch:false,kick:false,guard:false,special:false},jumpRoll=Math.random(),jumpOpportunity=target.jumpY>24?jumpRoll<Math.min(.9,profile.jumpChance*1.7):dist<profile.preferredDistance*1.55&&jumpRoll<profile.jumpChance*.3;
 if(Math.random()<profile.mistakeChance){act.direction=Math.random()<.5?toward:0;ai.actionTicks=9;}
 else if(target.state==="attack"&&dist<profile.preferredDistance*1.25&&Math.random()<profile.blockChance){act.guard=true;act.down=Math.random()<.25;ai.actionTicks=Math.ceil(profile.reactionMs*60/1000);}
 else if(f.jumpY<=0&&jumpOpportunity){act.direction=toward;act.up=true;ai.actionTicks=5;}
 else if(dist>profile.preferredDistance*1.2){act.direction=toward;ai.actionTicks=12;}
  else if(dist<profile.preferredDistance*.5&&Math.random()<(profile.retreatChance||.18)){act.direction=-toward;ai.actionTicks=9;}
 else if(f.energy>=100&&Math.random()<profile.specialChance){act.special=true;ai.actionTicks=2;}
 else if(Math.random()<profile.attackChance){const r=Math.random();act.down=r<.2;act.kick=r<.68;act.punch=r>=.68;ai.actionTicks=2;}
 else if(Math.random()<profile.blockChance*.45){act.guard=true;ai.actionTicks=8;}
 ai.action=act;return act;
}
function beginAttack(f,type){const def=moves.moves[type]||moves.moves.punch;f.attack={type:type,move:def,age:0,hitDone:false};setState(f,"attack",true);speakFighter(f,"attack");if(type==="air"&&f.jumpY<=0){f.jumpVy=520*match.worldScale;f.jumpY=1;}}
function beginSpecial(f){const spec=moves.specials[f.data.definition.id];if(!spec||f.energy<spec.energyCost||f.specialCooldown>0)return;f.energy-=spec.energyCost;f.specialCooldown=spec.cooldownTicks;f.specialFired=false;f.specialConfig=spec;f.attack=null;setState(f,"special",true);speakFighter(f,"special");sound("special");}
function processInput(f,input){
 const edge={punch:input.punch&&!f.prevInput.punch,kick:input.kick&&!f.prevInput.kick,up:input.up&&!f.prevInput.up,special:input.special&&!f.prevInput.special};f.prevInput=Object.assign({},input);
 if(f.specialCooldown>0)f.specialCooldown--;
 if(mode==="training"&&settings.trainingInfiniteEnergy)f.energy=100;
 if(["hit","blockstun","fall","getup","special","attack","win","lose"].includes(f.state))return;
 if(edge.special&&f.energy>=100){beginSpecial(f);return;}
 if(f.jumpY<=0&&edge.up){f.jumpVy=1080*match.worldScale;f.jumpY=1;setState(f,"jump",true);sound("jump");}
 if(edge.punch||edge.kick){if(f.jumpY>0){beginAttack(f,"air");return;}if(input.down&&edge.kick){beginAttack(f,"low");return;}if(edge.punch&&Math.sign(input.direction)===f.facing){beginAttack(f,"uppercut");return;}beginAttack(f,edge.kick?"kick":"punch");return;}
 if(input.guard){f.guardMode=input.down?"low":"high";setState(f,"guard");return;}
 if(input.down&&f.jumpY<=0){setState(f,"crouch");return;}
 if(f.jumpY>0){if(input.direction)f.x+=input.direction*460*match.worldScale/60;setState(f,"jump");return;}
 if(input.direction){f.x+=input.direction*220*match.worldScale/60;setState(f,"walk");}else setState(f,"idle");
}
function animName(f){if(f.state==="attack")return f.attack.type==="kick"?"kick":f.attack.type==="low"?"low":f.attack.type==="air"?"airAttack":f.attack.type==="uppercut"?"uppercut":"light";if(f.state==="special")return "specialBody";if(f.state==="walk")return "walk";if(f.state==="crouch")return "crouch";if(f.state==="jump")return "jump";if(f.state==="guard"||f.state==="blockstun")return f.guardMode==="low"?"guardLow":"guardHigh";if(f.state==="hit")return "hurt";if(f.state==="fall"||f.state==="lose")return "fall";if(f.state==="getup")return "getup";if(f.state==="win")return "victory";return "idle";}
function currentFrame(f){const name=animName(f),animations=f.data.meta.animations,ids=(animations[name]&&animations[name].length?animations[name]:name==="airAttack"&&animations.kick&&animations.kick.length?animations.kick:animations.idle)||[];if(!ids.length)return null;let i=0;if(f.state==="attack"&&f.attack)i=Math.min(ids.length-1,Math.floor(f.attack.age/Math.max(1,(f.attack.move.startup+f.attack.move.active+f.attack.move.recovery)/ids.length)));else if(["special","fall","getup","hit","blockstun","win","lose"].includes(f.state))i=Math.min(ids.length-1,Math.floor(f.stateAge/7));else i=Math.floor(f.animAge/7)%ids.length;return f.data.meta.frames[ids[i]]||null;}
function updateFighter(f,target,index){
 f.animAge++;f.stateAge++;f.facing=target.x>=f.x?1:-1;f.x+=f.knockVX/60;f.knockVX*=.84;if(Math.abs(f.knockVX)<3)f.knockVX=0;
 if(f.jumpY>0){f.jumpY+=f.jumpVy/60;f.jumpVy-=1800*match.worldScale/60;if(f.jumpY<=0){f.jumpY=0;f.jumpVy=0;if(f.state==="jump")setState(f,"idle");}}
 if(f.state==="hit"||f.state==="blockstun"){if(--f.hitstun<=0)setState(f,"idle");clampArena(f);return;}
 if(f.state==="fall"){if(--f.fallTicks<=0){setState(f,"getup");f.getupTicks=34;}clampArena(f);return;}
 if(f.state==="getup"){if(--f.getupTicks<=0)setState(f,"idle");clampArena(f);return;}
 if(f.state==="attack"&&f.attack){const a=f.attack,mv=a.move;a.age++;if(!a.hitDone&&isMoveActive(a.age,mv)){resolveMelee(f,target,a);if(a.hitDone&&match.suddenDeath)finishRound(index,"hit");}if(a.age>=mv.startup+mv.active+mv.recovery){f.attack=null;setState(f,"idle");}clampArena(f);return;}
 if(f.state==="special"){if(!f.specialFired&&f.stateAge>=f.specialConfig.startup){f.specialFired=true;spawnSpecial(f,target,f.specialConfig);}if(f.stateAge>=f.specialConfig.startup+f.specialConfig.recovery)setState(f,"idle");clampArena(f);return;}
 if(f.state==="win"||f.state==="lose"){clampArena(f);return;}
 processInput(f,f.ai?aiInput(f,target):(mode==="lan"&&lanRole==="host"&&f.player===2?lanRemoteInput:humanInput(f.player)));clampArena(f);
}
function stageRect(){const iw=stage.naturalWidth||16,ih=stage.naturalHeight||9,scale=Math.max(viewport.w/iw,viewport.h/ih),w=iw*scale,h=ih*scale;return {x:(viewport.w-w)/2,y:(viewport.h-h)/2,w:w,h:h};}
function arenaWorldWidth(){const r=stageRect();return r.w+Math.max(viewport.w*.3,80*(viewport.h/720));}
function fighterTargetHeight(){return viewport.h>viewport.w?Math.min(viewport.h*.37,viewport.w*.76):Math.min(viewport.h*.42,viewport.w*.25);}
function arenaLimits(){const margin=Math.max(28,Math.min(viewport.w*.075,60*(viewport.h/720)));return {left:margin,right:(match&&match.worldWidth||arenaWorldWidth())-margin};}
function clampArena(f){const limits=arenaLimits(),edge=Math.max(24,f.bodyHeight*f.scale*.12);f.x=Math.max(limits.left+edge,Math.min(limits.right-edge,f.x));}
function groundY(){return viewport.h*.93;}
function hurtBox(f){const h=f.bodyHeight*f.scale,w=h*.32,crouch=f.state==="crouch"||(f.guardMode==="low"&&(f.state==="guard"||f.state==="blockstun")),boxH=h*(crouch?.52:.84),center=groundY()-f.jumpY-boxH/2;return {x:f.x-w/2,y:center-boxH/2,w:w,h:boxH};}
function hitBox(f,mv){const h=hurtBox(f),w=mv.range*f.bodyHeight*f.scale*.65,base=groundY()-f.jumpY,height=mv.hitHeight*f.bodyHeight*f.scale,y=mv.hitLevel==="low"?base-height*.8:base-h.h*.72;return {x:f.facing>0?f.x+h.w*.25:f.x-h.w*.25-w,y:y,w:w,h:height};}
function resolveMelee(a,t,attack){const hb=hurtBox(t),b=hitBox(a,attack.move);if(!boxesOverlap(b,hb))return;attack.hitDone=true;applyHit(a,t,attack.move.damage,attack.move,attack.move.hitLevel);}
function applyHit(a,t,damage,mv,level){
 const blocked=blocksHit(t.state==="guard",t.guardMode,level);t.attack=null;t.knockVX=a.facing*(mv.knockback||90)*match.worldScale;
 if(blocked){t.hitstun=mv.blockstun||10;setState(t,"blockstun",true);speakFighter(t,"block");sound("block");}
 else{t.health=damageHealth(t.health,damage,mode==="training"&&settings.trainingInfiniteHealth&&t.player===1);t.hitstun=mv.hitstun||24;if(damage>=120){setState(t,"fall",true);t.fallTicks=58;}else setState(t,"hit",true);speakFighter(t,"hit");a.energy=Math.min(100,a.energy+(mv.energy||8));t.energy=Math.min(100,t.energy+4);match.hitCount[a.player-1]++;sound("hit");if(t.health<=0){t.health=0;finishRound(a.player-1,"ko");}}
 a.energy=Math.min(100,a.energy+2);
}
function spawnSpecial(f,target,spec){
 const ids=Object.values(f.data.meta.frames).filter(x=>x.role===spec.projectileRole).sort((a,b)=>a.sourceColumn-b.sourceColumn).map(x=>x.id),scale=match.worldScale*f.scale;
 if(spec.kind==="rain"){const n=5;for(let i=0;i<n;i++)match.warnings.push({x:target.x+(i-2)*50*match.worldScale,y:groundY(),timer:36+i*8});match.rain={from:f.data.definition.id,owner:f.player,targetPlayer:target.player,target:target,frameIds:ids,damage:spec.damage,move:spec,remaining:n,wait:36,age:0};return;}
 const width=(spec.kind==="rush"?f.bodyHeight*.9:f.bodyHeight*.5)*f.scale,y=groundY()-f.jumpY-f.bodyHeight*f.scale*.48;
 match.projectiles.push({x:f.x+f.facing*f.bodyHeight*f.scale*.36,y:y,vx:f.facing*spec.speed*match.worldScale,vy:0,width:width,height:f.bodyHeight*f.scale*.45,age:0,maxAge:180,from:f.data.definition.id,owner:f.player,targetPlayer:target.player,frameIds:ids,impactRole:spec.impactRole,damage:spec.damage,move:spec,special:true,hit:false});
}
function spawnImpact(p,t){const data=assets[p.from],frame=data&&Object.values(data.meta.frames).find(f=>f.role===(p.impactRole||"impact"));match.effects.push({x:t.x,y:groundY(),age:0,frameId:frame&&frame.id,from:p.from,life:30});}
function updateProjectiles(){
 for(let i=match.projectiles.length-1;i>=0;i--){const p=match.projectiles[i];p.age++;p.x+=p.vx/60;p.y+=p.vy/60;const t=match.fighters[p.targetPlayer-1],hb=hurtBox(t),hit=boxesOverlap({x:p.x-p.width/2,y:p.y-p.height/2,w:p.width,h:p.height},hb);if(hit&&!p.hit){p.hit=true;applyHit(match.fighters[p.owner-1],t,p.damage,p.move,"high");spawnImpact(p,t);if(match.suddenDeath)finishRound(p.owner-1,"hit");match.projectiles.splice(i,1);continue;}if(p.age>p.maxAge||p.x<-200||p.x>match.worldWidth+200)match.projectiles.splice(i,1);}
 if(match.rain){const r=match.rain;r.age++;r.wait--;if(r.wait<=0&&r.remaining>0){const offset=5-r.remaining-2,x=Math.max(40,Math.min(match.worldWidth-40,r.target.x+offset*38*match.worldScale));match.projectiles.push({x:x,y:-45*match.worldScale,vx:0,vy:620*match.worldScale,width:48*match.worldScale,height:82*match.worldScale,age:0,maxAge:100,from:r.from,owner:r.owner,targetPlayer:r.targetPlayer,frameIds:r.frameIds,impactRole:r.move.impactRole,damage:r.damage,move:r.move,special:true,hit:false,rain:true});r.remaining--;r.wait=18;}if(r.remaining<=0&&r.wait<=0)match.rain=null;}
 match.warnings=match.warnings.filter(w=>--w.timer>0);
}
function launchAssist(target){
 if(match.assist)return;const fighter=match.fighters[target-1],scale=match.worldScale,limits=arenaLimits(),direction=fighter.x<=match.cameraX+viewport.w/2?1:-1;
 const stopX=Math.max(limits.left+48*scale,Math.min(limits.right-48*scale,fighter.x-direction*112*scale)),x=direction>0?limits.left-105*scale:limits.right+105*scale;
 match.assist={target,x,stopX,direction,leaveDirection:-direction,phase:"enter",phaseAge:0,age:0,towel:null};match.assistRoll=false;match.assistSpawnFired=true;
}
function updateAssist(){
 if(!match.helpEnabled||mode==="training"||match.status!=="fight")return;
 if(match.assistRoll&&!match.assist&&!match.assistSpawnFired&&--match.assistSpawn<=0){const a=match.fighters[0],b=match.fighters[1],target=a.health===b.health?(Math.random()<.5?1:2):(a.health<b.health?1:2);launchAssist(target);}
 const it=match.assist;if(!it)return;it.age++;it.phaseAge++;
 if(it.phase==="enter"){
  const speed=320*match.worldScale/60,remaining=it.stopX-it.x;it.x+=Math.sign(remaining)*Math.min(Math.abs(remaining),speed);
  if(Math.abs(remaining)<=speed||it.phaseAge>240){it.phase="throw";it.phaseAge=0;}
 }else if(it.phase==="throw"){
  if(it.phaseAge===12&&!it.towel){const t=match.fighters[it.target-1],startX=it.x+it.direction*35*match.worldScale,startY=groundY()-112*match.worldScale,distance=Math.abs(t.x-startX),duration=Math.max(18,Math.min(48,Math.ceil(distance/Math.max(1,430*match.worldScale)*60)));it.towel={x:startX,y:startY,startX,startY,duration,age:0,direction:it.direction};}
  if(it.phaseAge>=34){it.phase="leave";it.phaseAge=0;}
 }else if(it.phase==="leave")it.x+=it.leaveDirection*330*match.worldScale/60;
 if(it.towel){const towel=it.towel,t=match.fighters[it.target-1];towel.age++;const progress=Math.min(1,towel.age/towel.duration),targetX=t.x,targetY=groundY()-t.jumpY-t.bodyHeight*t.scale*.5;towel.x=towel.startX+(targetX-towel.startX)*progress;towel.y=towel.startY+(targetY-towel.startY)*progress-Math.sin(progress*Math.PI)*58*match.worldScale;
  if(progress>=1){t.health=Math.min(1000,t.health+180);it.towel=null;sound("pickup");match.effects.push({x:t.x,y:groundY()-70*match.worldScale,age:0,life:48,text:"+18% VIDA"});}}
 const limits=arenaLimits();if(it.phase==="leave"&&!it.towel&&(it.x<limits.left-150*match.worldScale||it.x>limits.right+150*match.worldScale))match.assist=null;
}
function updateMatch(){
 if(!match||match.paused)return;
 if(match.status==="intro"){if(--match.bannerTicks<=0){match.status="fight";match.banner="FIGHT";match.bannerTicks=36;}return;}
 if(match.status==="fight"){
  if(match.bannerTicks>0)match.bannerTicks--;
  match.fighters.forEach((f,i)=>updateFighter(f,match.fighters[1-i],i));
   const a=match.fighters[0],b=match.fighters[1],sep=b.x-a.x,min=(a.bodyHeight*a.scale+b.bodyHeight*b.scale)*.22;
  if(a.jumpY<12&&b.jumpY<12&&Math.abs(sep)<min){const push=(min-Math.abs(sep))/2+1;a.x-=Math.sign(sep||1)*push;b.x+=Math.sign(sep||1)*push;clampArena(a);clampArena(b);}
   const cameraTarget=Math.max(0,Math.min(match.worldWidth-viewport.w,(a.x+b.x)/2-viewport.w/2));match.cameraX+=(cameraTarget-match.cameraX)*.12;if(Math.abs(cameraTarget-match.cameraX)<.5)match.cameraX=cameraTarget;
   updateProjectiles();updateAssist();match.effects=match.effects.filter(e=>{e.age++;return e.age<e.life;});
  if(!match.suddenDeath){match.roundTicks--;if(match.roundTicks<=0){if(a.health===b.health){match.suddenDeath=true;match.suddenTicks=600;match.banner="SUDDEN DEATH";match.bannerTicks=75;}else finishRound(a.health>b.health?0:1,"time");}}
  else if(--match.suddenTicks<=0)finishRound(tieBreak(),"time");
 }else if(match.status==="roundEnd"){match.fighters.forEach(f=>{f.stateAge++;f.animAge++;});if(--match.roundEndTicks<=0){if(seriesWinner(match.wins,2)!==null)showMatchResult();else startNextRound();}}
}
function resizeCanvas(){if(!canvas||!ctx)return;const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;const oldWorld=match&&match.worldWidth||arenaWorldWidth(),oldCamera=match&&match.cameraX||0,dpr=Math.max(1,Math.min(2.25,devicePixelRatio||1)),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}ctx.setTransform(dpr,0,0,dpr,0,0);viewport={w:rect.width,h:rect.height,dpr:dpr};if(match){match.worldScale=viewport.h/720;match.worldWidth=arenaWorldWidth();match.fighters.forEach(f=>{f.x=oldWorld?f.x/oldWorld*match.worldWidth:match.worldWidth/2;f.scale=fighterTargetHeight()/f.bodyHeight;});match.cameraX=Math.max(0,Math.min(match.worldWidth-viewport.w,oldWorld?oldCamera/oldWorld*match.worldWidth:(match.worldWidth-viewport.w)/2));}canvas.parentElement.classList.toggle("vertical",rect.height>rect.width);}
function drawStage(){
 const W=viewport.w,H=viewport.h;ctx.fillStyle="#090d12";ctx.fillRect(0,0,W,H);
 if(stage.complete&&stage.naturalWidth){const r=stageRect(),worldW=match&&match.worldWidth||arenaWorldWidth(),camera=match&&match.cameraX||0,centerX=(worldW-r.w)/2;ctx.save();ctx.translate(-camera,0);ctx.imageSmoothingEnabled=true;ctx.save();ctx.translate(centerX,0);ctx.scale(-1,1);ctx.drawImage(stage,0,r.y,r.w,r.h);ctx.restore();ctx.drawImage(stage,centerX,r.y,r.w,r.h);ctx.save();ctx.translate(centerX+r.w*2,0);ctx.scale(-1,1);ctx.drawImage(stage,0,r.y,r.w,r.h);ctx.restore();ctx.restore();}
 ctx.fillStyle="rgba(4,7,10,.12)";ctx.fillRect(0,0,W,H);
 const shade=ctx.createLinearGradient(0,groundY()-H*.08,0,H);shade.addColorStop(0,"rgba(0,0,0,0)");shade.addColorStop(1,"rgba(0,0,0,.14)");ctx.fillStyle=shade;ctx.fillRect(0,groundY()-H*.08,W,H-groundY()+H*.08);
}
function fightBarPath(x,y,w,h,reverse){
 const cut=Math.min(h*.72,w*.16);ctx.beginPath();
 if(reverse){ctx.moveTo(x+cut,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w,y+h);ctx.lineTo(x,y+h);}
 else{ctx.moveTo(x,y);ctx.lineTo(x+w-cut,y);ctx.lineTo(x+w,y+h);ctx.lineTo(x,y+h);}
 ctx.closePath();
}
function drawHud(){
 if(!match)return;
 const W=viewport.w,H=viewport.h,pad=Math.max(18,Math.min(48,W*.032)),gap=Math.min(190,W*.21),bw=Math.max(104,Math.min(W*.38,(W-pad*2-gap)/2)),top=Math.max(18,H*.025),hpY=top+20,hpH=Math.max(20,Math.min(28,H*.026)),spY=hpY+hpH+9,spH=Math.max(7,Math.min(9,H*.009));
 function playerBar(f,x,rev){
  const hp=Math.max(0,Math.min(1,f.health/1000)),energy=Math.max(0,Math.min(1,f.energy/100)),edge=rev?x+bw:x;
  if(f.displayHealth===undefined)f.displayHealth=f.health;f.displayHealth=Math.max(f.health,f.displayHealth-Math.max(.7,(f.displayHealth-f.health)*.075));const trail=Math.max(hp,Math.min(1,f.displayHealth/1000));
  ctx.save();ctx.textBaseline="middle";ctx.textAlign=rev?"right":"left";ctx.font="900 13px system-ui, sans-serif";ctx.fillStyle="rgba(250,247,239,.98)";ctx.shadowColor="#000";ctx.shadowBlur=5;ctx.fillText("P"+f.player+"  "+f.data.definition.name.toUpperCase(),edge,top+7);ctx.shadowBlur=0;
  fightBarPath(x,hpY,bw,hpH,rev);ctx.fillStyle="rgba(5,8,12,.92)";ctx.fill();ctx.strokeStyle="rgba(239,233,220,.23)";ctx.lineWidth=1;ctx.stroke();
  if(trail>hp){const trailW=bw*trail,fillW=bw*hp,damageX=rev?x+bw-trailW:x+fillW,damageW=Math.max(0,trailW-fillW);ctx.save();fightBarPath(x,hpY,bw,hpH,rev);ctx.clip();ctx.fillStyle="#9e2738";ctx.fillRect(damageX,hpY,damageW,hpH);ctx.restore();}
  const fillW=bw*hp,fillX=rev?x+bw-fillW:x;
  if(fillW>0){ctx.save();fightBarPath(x,hpY,bw,hpH,rev);ctx.clip();const grad=ctx.createLinearGradient(rev?x+bw:x,hpY,rev?x:x+bw,hpY+hpH);if(hp<.24){grad.addColorStop(0,"#ffb1a1");grad.addColorStop(.52,"#ff6058");grad.addColorStop(1,"#c91f3b");}else if(hp<.5){grad.addColorStop(0,"#fff0a0");grad.addColorStop(.52,"#ffc34f");grad.addColorStop(1,"#ec713a");}else{grad.addColorStop(0,"#fff2ad");grad.addColorStop(.48,"#ffd75b");grad.addColorStop(1,"#e99a31");}ctx.fillStyle=grad;ctx.fillRect(fillX,hpY,fillW,hpH);ctx.fillStyle="rgba(255,255,255,.28)";ctx.fillRect(fillX,hpY+1,fillW,Math.max(2,hpH*.12));for(let i=1;i<4;i++){ctx.fillStyle="rgba(15,18,22,.18)";ctx.fillRect(x+bw*i/4-1,hpY+2,2,hpH-4);}ctx.restore();}
  ctx.textAlign=rev?"right":"left";ctx.font="800 8px system-ui, sans-serif";ctx.fillStyle="rgba(239,237,231,.65)";ctx.fillText("ESPECIAL",edge,spY+4);
  fightBarPath(x,spY+10,bw,spH,rev);ctx.fillStyle="rgba(5,10,16,.9)";ctx.fill();const energyW=bw*energy,energyX=rev?x+bw-energyW:x;if(energyW>0){ctx.save();fightBarPath(x,spY+10,bw,spH,rev);ctx.clip();const eg=ctx.createLinearGradient(rev?x+bw:x,0,rev?x:x+bw,0);eg.addColorStop(0,"#b7f8ff");eg.addColorStop(.5,"#42c9e9");eg.addColorStop(1,"#2683d0");ctx.fillStyle=eg;ctx.shadowColor="#35c9ef";ctx.shadowBlur=energy>=1?12:0;ctx.fillRect(energyX,spY+10,energyW,spH);ctx.restore();}
  ctx.textAlign=rev?"left":"right";ctx.font="800 8px system-ui, sans-serif";ctx.fillStyle=energy>=1?"#b6f4ff":"rgba(239,237,231,.68)";ctx.fillText(energy>=1?"MAX":"" ,rev?x:x+bw,spY+4);
  for(let i=0;i<2;i++){ctx.beginPath();ctx.fillStyle=i<match.wins[f.player-1]?"#f6cb61":"rgba(238,232,219,.28)";ctx.arc(rev?x+bw-5-i*12:x+5+i*12,spY+24,2.8,0,Math.PI*2);ctx.fill();}
  ctx.restore();
 }
 playerBar(match.fighters[0],pad,false);playerBar(match.fighters[1],W-pad-bw,true);
 const sec=String(Math.ceil(Math.max(0,match.roundTicks)/60)).padStart(2,"0"),roundLabel=match.roundNo===3?"FINAL ROUND":"ROUND "+match.roundNo;
 ctx.save();ctx.textAlign="center";ctx.textBaseline="middle";ctx.shadowColor="rgba(0,0,0,.9)";ctx.shadowBlur=10;ctx.fillStyle="rgba(255,248,232,.98)";ctx.font="900 "+Math.max(30,Math.min(44,H*.05))+"px system-ui, sans-serif";ctx.fillText(match.suddenDeath?"00":sec,W/2,top+26);ctx.shadowBlur=5;ctx.fillStyle="#f0bd55";ctx.font="900 9px system-ui, sans-serif";ctx.fillText(roundLabel,W/2,top+55);ctx.restore();
}
function drawFighter(f){
 const fr=currentFrame(f);if(!fr)return;const scale=f.scale,r=fr.atlasRect,p=fr.pivot,hb=hurtBox(f),floor=groundY()-f.jumpY;
 const shadowWidth=Math.max(30,f.bodyHeight*f.scale*.22);ctx.save();ctx.translate(f.x,groundY()+3);ctx.scale(1,.2);const shadow=ctx.createRadialGradient(0,0,2,0,0,shadowWidth);shadow.addColorStop(0,"rgba(0,0,0,.58)");shadow.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=shadow;ctx.beginPath();ctx.arc(0,0,shadowWidth,0,Math.PI*2);ctx.fill();ctx.restore();
 ctx.save();ctx.globalAlpha=f.state==="hit"&&f.stateAge<5&&f.stateAge%2?.45:1;ctx.translate(f.x,floor);if(f.facing<0)ctx.scale(-1,1);ctx.imageSmoothingEnabled=false;ctx.drawImage(f.data.atlas,r.x,r.y,r.width,r.height,-p.x*scale,-p.y*scale,fr.width*scale,fr.height*scale);ctx.restore();
 if(mode==="training"&&settings.trainingHitboxes){ctx.strokeStyle="rgba(100,222,255,.92)";ctx.lineWidth=2;ctx.strokeRect(hb.x,hb.y,hb.w,hb.h);if(f.state==="attack"&&f.attack){const b=hitBox(f,f.attack.move);ctx.strokeStyle="rgba(255,88,111,.95)";ctx.strokeRect(b.x,b.y,b.w,b.h);}}
}
function drawThrownTowel(towel){
 const scale=match.worldScale;ctx.save();ctx.translate(towel.x,towel.y);ctx.rotate(towel.age*.16*towel.direction);ctx.lineWidth=Math.max(1,1.4*scale);ctx.fillStyle="#f4f0e5";ctx.strokeStyle="rgba(74,69,63,.75)";ctx.shadowColor="rgba(0,0,0,.42)";ctx.shadowBlur=5*scale;
 ctx.beginPath();ctx.moveTo(-20*scale,-6*scale);ctx.lineTo(-12*scale,-11*scale);ctx.lineTo(14*scale,-8*scale);ctx.lineTo(20*scale,-2*scale);ctx.lineTo(15*scale,8*scale);ctx.lineTo(-13*scale,7*scale);ctx.lineTo(-20*scale,2*scale);ctx.closePath();ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle="rgba(145,137,125,.65)";ctx.beginPath();ctx.moveTo(-11*scale,-6*scale);ctx.quadraticCurveTo(-2*scale,0,12*scale,3*scale);ctx.moveTo(-7*scale,5*scale);ctx.lineTo(9*scale,-4*scale);ctx.stroke();ctx.restore();
}
function drawAssist(){
 const it=match&&match.assist,data=match&&match.bonus;if(!it||!data)return;const sheet=it.phase==="throw"?data.actions:data.run,frameIndex=it.phase==="throw"?[3,4,5,6][Math.min(3,Math.floor(it.phaseAge/7))]:Math.floor(it.phaseAge/6)%4,frame=sheet.frames[frameIndex];
 if(frame&&frame.width&&frame.height&&it.x>-160&&it.x<match.worldWidth+160){const height=Math.min(230*match.worldScale,stageRect().h*.34),scale=height/frame.height,width=frame.width*scale,face=it.phase==="leave"?it.leaveDirection:it.direction;ctx.save();ctx.translate(it.x,groundY());ctx.scale(face<0?-1:1,1);ctx.imageSmoothingEnabled=false;ctx.drawImage(sheet.image,frame.x,frame.y,frame.width,frame.height,-width/2,-height,width,height);ctx.restore();}
 if(it.towel)drawThrownTowel(it.towel);
}
function drawEffects(){
 if(!match)return;
 match.warnings.forEach(w=>{ctx.save();ctx.strokeStyle="rgba(255,207,78,.85)";ctx.setLineDash([7,7]);ctx.beginPath();ctx.ellipse(w.x,w.y,22*match.worldScale,5*match.worldScale,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#ffe3a0";ctx.font="9px system-ui";ctx.textAlign="center";ctx.fillText("!",w.x,w.y-12);ctx.restore();});
 match.projectiles.forEach(p=>{const d=assets[p.from],ids=p.frameIds||[],fr=d&&ids.length?d.meta.frames[ids[Math.floor(p.age/6)%ids.length]]:null;if(fr){const r=fr.atlasRect,s=Math.min(p.width/Math.max(1,fr.width),p.height/Math.max(1,fr.height));ctx.save();ctx.translate(p.x,p.y);if(p.vx<0)ctx.scale(-1,1);ctx.imageSmoothingEnabled=false;ctx.drawImage(d.atlas,r.x,r.y,r.width,r.height,-fr.pivot.x*s,-fr.pivot.y*s,fr.width*s,fr.height*s);ctx.restore();}else{ctx.fillStyle=p.from==="diana"?"#ed4cba":p.from==="lorehy"?"#e8bd48":"#67dce5";ctx.beginPath();ctx.ellipse(p.x,p.y,p.width*.45,p.height*.35,0,0,Math.PI*2);ctx.fill();}});
 match.effects.forEach(e=>{if(e.text){ctx.fillStyle="#75e0bf";ctx.font="900 13px system-ui";ctx.textAlign="center";ctx.fillText(e.text,e.x,e.y-e.age*.5);}else{const d=assets[e.from],f=e.frameId&&d&&d.meta.frames[e.frameId];if(f){const r=f.atlasRect,s=.5*match.worldScale;ctx.globalAlpha=Math.max(0,1-e.age/e.life);ctx.drawImage(d.atlas,r.x,r.y,r.width,r.height,e.x-f.width*s/2,e.y-f.height*s,f.width*s,f.height*s);ctx.globalAlpha=1;}else{ctx.fillStyle="rgba(255,220,120,.6)";ctx.beginPath();ctx.arc(e.x,e.y-e.age,15,0,Math.PI*2);ctx.fill();}}});
}
function draw(){if(!ctx)return;drawStage();if(match){ctx.save();ctx.translate(-match.cameraX,0);drawEffects();match.fighters.slice().sort((a,b)=>a.x-b.x).forEach(drawFighter);drawAssist();ctx.restore();drawHud();if(match.bannerTicks>0&&match.banner){ctx.save();ctx.globalAlpha=Math.min(1,match.bannerTicks/14);ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle=match.banner==="FIGHT"?"#f4c35e":"#f5f2eb";ctx.font="900 "+Math.max(25,Math.min(64,viewport.h*.09))+"px Georgia";ctx.shadowColor="#000";ctx.shadowBlur=18;ctx.fillText(match.banner,viewport.w/2,viewport.h*.34);ctx.restore();}}requestAnimationFrame(draw);}
function gamepadButton(pad,index){return !!(pad&&pad.buttons&&pad.buttons[index]&&pad.buttons[index].pressed);}
function gamepadDirections(pad){if(!pad)return {dx:0,dy:0};const axisX=pad.axes&&pad.axes.length?pad.axes[0]||0:0,axisY=pad.axes&&pad.axes.length?pad.axes[1]||0:0;return {dx:Math.abs(axisX)>.32?(axisX<0?-1:1):gamepadButton(pad,14)?-1:gamepadButton(pad,15)?1:0,dy:Math.abs(axisY)>.45?(axisY<0?-1:1):gamepadButton(pad,12)?-1:gamepadButton(pad,13)?1:0};}
function pollGamepadUi(dt){if(isMobilePortrait())return;const pads=connectedGamepads();updateVersusAvailability();gamepadNavCooldown=Math.max(0,gamepadNavCooldown-dt);for(let i=0;i<2;i++)gamepadSelectCooldown[i]=Math.max(0,gamepadSelectCooldown[i]-dt);for(let i=0;i<2;i++){const pad=pads[i],held=gamepadUiHeld[i];if(!pad){held.confirm=held.start=held.cancel=false;continue;}if(remap&&remap.type==="pad"){const buttonIndex=pad.buttons?pad.buttons.findIndex(b=>b.pressed):-1;if(buttonIndex>=0)assignPad(buttonIndex);held.confirm=gamepadButton(pad,0);held.start=gamepadButton(pad,9);held.cancel=gamepadButton(pad,1)||gamepadButton(pad,8);continue;}const confirm=gamepadButton(pad,0),start=gamepadButton(pad,9),cancel=gamepadButton(pad,1)||gamepadButton(pad,8),confirmEdge=confirm&&!held.confirm,startEdge=start&&!held.start,cancelEdge=cancel&&!held.cancel;held.confirm=confirm;held.start=start;held.cancel=cancel;const side=i+1,direction=gamepadDirections(pad);if(screen==="menuScreen"&&i===0){const move=direction.dx||direction.dy;if(move&&gamepadNavCooldown<=0){const choices=$$(".arcade-choice:not(:disabled)");menuCursor=(menuCursor+(move<0?-1:1)+choices.length)%choices.length;choices[menuCursor]?.focus();gamepadNavCooldown=170;}if(confirmEdge||startEdge){$$(".arcade-choice:not(:disabled)")[menuCursor]?.click();}}
if(screen==="selectScreen"){const guestLan=mode==="lan"&&lanRole==="guest",hostLan=mode==="lan"&&lanRole==="host",selectionSide=guestLan?2:side,canChoose=guestLan?i===0:hostLan?i===0:side===1||mode==="versus";if(canChoose&&(direction.dx||direction.dy)&&gamepadSelectCooldown[i]<=0){moveSelectionCursor(selectionSide,direction.dx,direction.dy);gamepadSelectCooldown[i]=170;}if(guestLan&&i===0&&(confirmEdge||startEdge))confirmLanFighter();else if(!guestLan&&side===1&&(confirmEdge||startEdge))startSelection();if(cancelEdge&&i===0){if(lanRole)disconnectLan();mode="cpu";showScreen("menuScreen");}}
 if(screen==="gameScreen"&&i===0){if(startEdge){if(match&&match.paused)resumeGame();else pauseGame();}if(match&&match.paused){const directionStep=direction.dy||direction.dx;if(directionStep&&gamepadNavCooldown<=0){const items=[$("#resumeButton"),$("#pauseOptions"),$("#pauseQuit")];gamepadPauseIndex=(gamepadPauseIndex+(directionStep>0?1:-1)+items.length)%items.length;items[gamepadPauseIndex].focus({preventScroll:true});gamepadNavCooldown=170;}if(confirmEdge){const focused=document.activeElement;if($("#pausePanel").contains(focused))focused.click();else resumeGame();}if(cancelEdge)resumeGame();}if(match&&match.status==="matchOver"&&confirmEdge)$("#resultPrimary").click();}}
}
function loop(now){if(!last)last=now;let dt=Math.min(100,now-last);last=now;if(match&&screen==="gameScreen"&&!match.paused&&!isMobilePortrait()&&!(mode==="lan"&&lanRole==="guest")){acc+=dt;const tick=1000/60;while(acc>=tick){updateMatch();acc-=tick;}}else acc=0;pollGamepadUi(dt);gamepadStatus();requestAnimationFrame(loop);}
function gamepadStatus(){const n=connectedGamepads().length;$("#gamepadStatus").textContent=n?n+" controle"+(n>1?"s":"")+" conectado"+(n>1?"s":""):"Teclado / touch · controle pronto";updateVersusAvailability();}
function pauseGame(){if(!match||screen!=="gameScreen"||match.status==="matchOver"||(mode==="lan"&&lanRole==="guest"))return;match.paused=true;$("#pausePanel").hidden=false;cleanInput();gamepadPauseIndex=0;$("#resumeButton").focus({preventScroll:true});}
function resumeGame(){if(match){match.paused=false;$("#pausePanel").hidden=true;last=0;}}
function quitToMenu(){if(window.speechSynthesis)window.speechSynthesis.cancel();if(lanRole)disconnectLan();match=null;mode="cpu";cleanInput();if(audio)audio.selectTrack("title");showScreen("menuScreen");}
function startApp(){
 stages.bronx.src=asset("assets/stages/bronx.jpg");stages.boss.src=asset("assets/stages/boss.png");setTouchStyle();fillOptions();updateOrientationBlocker();updateVersusAvailability();
 FIGHTERS.forEach(f=>{const im=new Image();im.src=asset("assets/fighters/"+f.id+"/portraits/large.png");});
 $$(".arcade-choice[data-mode]").forEach(b=>b.addEventListener("click",()=>{enterArcadeSession();const choices=$$(".arcade-choice:not(:disabled)");menuCursor=Math.max(0,choices.indexOf(b));unlockAudio();sound("menu");openMode(b.dataset.mode);}));
 $$(".arcade-choice:not(:disabled)")[0]?.focus();
 $("#menuOptionsButton").onclick=()=>{previousScreen="menuScreen";showScreen("optionsScreen");};
 $("#lanHost").onclick=createLanMatch;$("#lanJoin").onclick=joinLanMatch;$("#lanBack").onclick=()=>{if(lanRole)disconnectLan();match=null;mode="cpu";showScreen("menuScreen");};
 $$("[data-screen]").forEach(b=>b.addEventListener("click",()=>{if(lanRole){disconnectLan();mode="cpu";}showScreen(b.dataset.screen);}));
  $("#startMatch").onclick=startSelection;$("#fullscreenButton").onclick=requestGameFullscreen;
 $("#readyFighter").onclick=confirmLanFighter;
 $("#selectP1").onclick=()=>{activeSide=1;updateSelection();};
 $("#selectP2").onclick=()=>{if(mode==="versus"||mode==="lan"){activeSide=2;updateSelection();}};
 $("#optionsBack").onclick=returnFromOptions;
 $("#saveOptions").onclick=()=>{readOptions();saveSettings();returnFromOptions();};
  ["difficulty","roundTime","assistEnabled","musicEnabled","sfxEnabled","voiceEnabled","fighterVoiceEnabled","musicVolume","sfxVolume","voiceVolume","touchSize","touchOpacity","trainingInfiniteHealth","trainingInfiniteEnergy","trainingHitboxes","trainingDummy"].forEach(id=>{$("#"+id).addEventListener("input",readOptions);$("#"+id).addEventListener("change",readOptions);});
  $("#quitMatch").onclick=quitToMenu;$("#pauseQuit").onclick=quitToMenu;
  $("#resumeButton").onclick=resumeGame;$("#gamePauseButton").onclick=pauseGame;
 $("#pauseOptions").onclick=()=>{previousScreen="gameScreen";showScreen("optionsScreen");};
  $("#resultMenu").onclick=quitToMenu;
 $("#skipCinema").onclick=skipCinema;
 $("#retryCinema").onclick=retryCinema;$("#toggleCinemaAudio").onclick=toggleCinemaAudio;
 const touchStick=$("#touchStick"),touchStickKnob=$("#touchStickKnob");
 const moveTouchStick=e=>{if(!virtualStick||virtualStick.pointerId!==e.pointerId)return;e.preventDefault();const rect=touchStick.getBoundingClientRect(),limit=Math.max(1,(rect.width-touchStickKnob.offsetWidth)/2),dx=e.clientX-(rect.left+rect.width/2),dy=e.clientY-(rect.top+rect.height/2),length=Math.hypot(dx,dy),scale=length>limit?limit/length:1;let x=dx*scale/limit,y=dy*scale/limit;if(Math.abs(x)<.12)x=0;if(Math.abs(y)<.12)y=0;virtualStick.x=x;virtualStick.y=y;touchStickKnob.style.transform=`translate3d(-50%,-50%,0) translate3d(${dx*scale}px,${dy*scale}px,0)`;};
 touchStick.addEventListener("pointerdown",e=>{e.preventDefault();if(virtualStick)return;touchStick.setPointerCapture(e.pointerId);virtualStick={pointerId:e.pointerId,player:1,x:0,y:0};touchStick.classList.add("active");moveTouchStick(e);});
 touchStick.addEventListener("pointermove",moveTouchStick);
 const releaseTouchStick=e=>{if(!virtualStick||virtualStick.pointerId!==e.pointerId)return;clearVirtualStick();};
 touchStick.addEventListener("pointerup",releaseTouchStick);touchStick.addEventListener("pointercancel",releaseTouchStick);touchStick.addEventListener("lostpointercapture",releaseTouchStick);
 $$("#touchControls .touch-actions button").forEach(b=>{b.addEventListener("pointerdown",e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touches.set(e.pointerId,{player:Number(b.dataset.player),action:b.dataset.action});b.classList.add("pressed");});const up=e=>{touches.delete(e.pointerId);b.classList.remove("pressed");};b.addEventListener("pointerup",up);b.addEventListener("pointercancel",up);b.addEventListener("lostpointercapture",up);});
 window.addEventListener("keydown",e=>{
  if(isMobilePortrait()){e.preventDefault();return;}
  if(remap&&remap.type==="key"){e.preventDefault();assignKey(e.code);return;}
  const menuDirection={ArrowLeft:-1,ArrowRight:1,ArrowUp:-1,ArrowDown:1}[e.code];
  if(screen==="menuScreen"&&menuDirection){e.preventDefault();const choices=$$(".arcade-choice:not(:disabled)"),current=choices.indexOf(document.activeElement);menuCursor=(current<0?0:(current+menuDirection+choices.length)%choices.length);choices[menuCursor]?.focus();return;}
  if(screen==="menuScreen"&&(e.code==="Enter"||e.code==="Space")&&!(e.target instanceof Element&&e.target.closest(".arcade-choice"))){e.preventDefault();const choices=$$(".arcade-choice:not(:disabled)");choices[menuCursor%choices.length]?.click();return;}
  if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space"].includes(e.code)&&screen!=="optionsScreen")e.preventDefault();
   if(screen==="gameScreen"&&(e.code==="KeyP"||e.key.toLowerCase()==="p")){e.preventDefault();if(!e.repeat){if(match&&match.paused)resumeGame();else pauseGame();}return;}
   if(screen==="optionsScreen"&&previousScreen==="gameScreen"&&(e.code==="KeyP"||e.key.toLowerCase()==="p")){e.preventDefault();if(!e.repeat)returnFromOptions();return;}
   if(e.code==="Escape"&&screen==="optionsScreen"){e.preventDefault();returnFromOptions();return;}
   if(e.code==="Escape"&&screen==="gameScreen"){if(match&&match.paused)resumeGame();else pauseGame();return;}
  if(screen==="selectScreen"){
   const directions={ArrowLeft:[1,-1,0],ArrowRight:[1,1,0],ArrowUp:[1,0,-1],ArrowDown:[1,0,1],KeyA:[2,-1,0],KeyD:[2,1,0],KeyW:[2,0,-1],KeyS:[2,0,1]};let move=directions[e.code];if(mode==="lan"&&lanRole==="guest"&&move)move=[2,move[1],move[2]];if(mode==="lan"&&lanRole==="host"&&move&&move[0]===2)move=null;
   if(move&&(move[0]===1||mode==="versus"||mode==="lan"&&lanRole==="guest")){e.preventDefault();moveSelectionCursor(move[0],move[1],move[2]);return;}
   if(["KeyA","KeyD","KeyW","KeyS"].includes(e.code))e.preventDefault();
   if(e.code==="Enter"||e.code==="Space"){if(mode==="lan"&&lanRole==="guest")confirmLanFighter();else startSelection();return;}
  }
  if(screen==="gameScreen")e.preventDefault();keys.add(e.code);
 });
 window.addEventListener("keyup",e=>keys.delete(e.code));
 window.addEventListener("blur",()=>{cleanInput();if(match&&screen==="gameScreen")pauseGame();});
 document.addEventListener("visibilitychange",()=>{if(document.hidden){cleanInput();if(match&&screen==="gameScreen")pauseGame();}});
 window.addEventListener("resize",()=>{updateOrientationBlocker();resizeCanvas();});window.addEventListener("orientationchange",()=>{updateOrientationBlocker();resizeCanvas();});if(window.screen&&window.screen.orientation)window.screen.orientation.addEventListener?.("change",()=>{updateOrientationBlocker();resizeCanvas();});
 window.addEventListener("pointerdown",()=>{enterArcadeSession();unlockAudio();},{once:true});
 window.addEventListener("gamepadconnected",gamepadStatus);window.addEventListener("gamepaddisconnected",gamepadStatus);
 resizeCanvas();requestAnimationFrame(draw);requestAnimationFrame(loop);
}
fetch(new URL("./moves.json",import.meta.url)).then(r=>r.json()).then(d=>{moves=d;return fetch(new URL("./ai.json",import.meta.url));}).then(r=>r.json()).then(d=>{aiProfiles=d;startApp();}).catch(e=>{console.error(e);document.body.innerHTML="<p style='padding:30px;color:white'>Falha ao carregar os dados. Abra pelo servidor local descrito no README.</p>";});

