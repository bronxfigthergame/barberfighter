#!/usr/bin/env python3
"""Bronx Fighter V8 multiplayer relay for Render: multi-room, SSE, zero dependencies.

The static HTML, sprites, music, and cinematics are NOT served here; they remain on
GitHub Pages. This service relays input/snapshots for the existing host-authoritative
Bronx combat engine. Rooms are in memory and disappear on service restart/sleep.
"""
from __future__ import annotations

import json
import os
import queue
import re
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

GAME_URL = os.environ.get('BRONX_GAME_URL', 'https://bronxfigthergame.github.io/barberfighter/').strip()
ALLOWED_ORIGINS = {o.strip().rstrip('/') for o in os.environ.get(
    'BRONX_ALLOWED_ORIGINS', 'https://bronxfigthergame.github.io').split(',') if o.strip()}
MAX_ROOMS = int(os.environ.get('BRONX_MAX_ROOMS', '48'))
ROOM_IDLE_SECONDS = 40 * 60
MAX_BODY = 64_000
FIGHTERS = {'daniel','diana','kadu','bruno','christian','luana','lorehy'}
ROOM_CODE = re.compile(r'^[A-F0-9]{8}$')
TOKEN = re.compile(r'^[a-f0-9]{48}$')


def valid_origin(origin):
    if not origin:
        return True  # curl/health probes have no Origin header.
    if origin in ALLOWED_ORIGINS:
        return True
    # Local developer testing only; does not admit arbitrary websites.
    return bool(re.fullmatch(r'http://(?:localhost|127\.0\.0\.1)(?::\d{1,5})?', origin))


class Peer:
    def __init__(self):
        self.events = queue.Queue(maxsize=32)
        self.generation = 0
        self.online = False
        self.closed = False

    def send(self, event_type, **data):
        if self.closed and event_type not in ('hostLeft', 'end'):
            return
        item = {'type': event_type, **data}
        try:
            self.events.put_nowait(item)
        except queue.Full:
            # Keep fresh fighter state rather than old snapshots.
            try: self.events.get_nowait()
            except queue.Empty: pass
            try: self.events.put_nowait(item)
            except queue.Full: pass


class Room:
    def __init__(self, code):
        self.code = code
        self.host_token = secrets.token_hex(24)
        self.guest_token = None
        self.host = Peer()
        self.guest = None
        self.fighters = [None, None]
        self.guest_ready = False
        self.last = time.monotonic()
        self.lock = threading.RLock()

    def touch(self):
        self.last = time.monotonic()


class Registry:
    def __init__(self):
        self.lock = threading.RLock()
        self.by_code = {}

    def prune(self):
        now = time.monotonic()
        # Caller holds self.lock.
        for code, room in list(self.by_code.items()):
            if now - room.last > ROOM_IDLE_SECONDS:
                with room.lock:
                    room.host.closed = True
                    room.host.send('end')
                    if room.guest:
                        room.guest.send('hostLeft')
                        room.guest.closed = True
                del self.by_code[code]

    def create(self):
        with self.lock:
            self.prune()
            if len(self.by_code) >= MAX_ROOMS:
                return None
            for _ in range(30):
                code = secrets.token_hex(4).upper()
                if code not in self.by_code:
                    room = Room(code)
                    self.by_code[code] = room
                    return room
        return None

    def find_token(self, role, token):
        if role not in ('host', 'guest') or not isinstance(token, str) or not TOKEN.fullmatch(token):
            return None
        with self.lock:
            self.prune()
            for room in self.by_code.values():
                if (role == 'host' and secrets.compare_digest(room.host_token, token)) or (
                    role == 'guest' and room.guest_token and secrets.compare_digest(room.guest_token, token)):
                    room.touch()
                    return room
        return None

    def join(self, code):
        with self.lock:
            self.prune()
            room = self.by_code.get(code)
            if not room:
                return None, 'Sala não encontrada. Confira o código com o anfitrião.'
            with room.lock:
                if room.guest_token:
                    return None, 'Sala ocupada por dois jogadores.'
                room.guest_token = secrets.token_hex(24)
                room.guest = Peer()
                room.guest_ready = False
                room.fighters[1] = None
                room.touch()
                room.host.send('peer', connected=True)
                return room, None

    def remove_host(self, room):
        with self.lock, room.lock:
            if self.by_code.get(room.code) is not room:
                return
            room.host.closed = True
            room.host.send('end')
            if room.guest:
                room.guest.send('hostLeft')
                room.guest.closed = True
            del self.by_code[room.code]

    def remove_guest(self, room):
        with room.lock:
            if room.guest:
                room.guest.closed = True
                room.guest.send('end')
            room.guest = None
            room.guest_token = None
            room.guest_ready = False
            room.fighters[1] = None
            room.touch()
            room.host.send('peer', connected=False)


registry = Registry()


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'BronxOnline/8'

    def log_message(self, fmt, *args):
        # No tokens, room identifiers, or user IP in console output.
        if urlsplit(self.path).path == '/lan/events':
            return
        print('[bronx-render]', self.command, urlsplit(self.path).path, flush=True)

    def cors(self):
        origin = self.headers.get('Origin', '')
        if origin and valid_origin(origin):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '600')

    def respond(self, status, data):
        body = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        self.send_response(status)
        self.cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        try: self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, OSError): pass

    def do_OPTIONS(self):
        if not valid_origin(self.headers.get('Origin', '')):
            self.respond(403, {'error':'Origem não autorizada.'})
            return
        self.send_response(204)
        self.cors()
        self.send_header('Content-Length', '0')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()

    def authorize_origin(self):
        if not valid_origin(self.headers.get('Origin', '')):
            self.respond(403, {'error':'Este site não pode acessar as salas Bronx.'})
            return False
        return True

    def read_body(self):
        try: n = int(self.headers.get('Content-Length', '0'))
        except (ValueError, TypeError): raise ValueError('Tamanho inválido.')
        if n < 0 or n > MAX_BODY: raise ValueError('Mensagem muito grande.')
        try:
            data = json.loads(self.rfile.read(n).decode('utf-8')) if n else {}
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError('JSON inválido.') from None
        if not isinstance(data, dict): raise ValueError('Mensagem inválida.')
        return data

    def do_GET(self):
        if not self.authorize_origin(): return
        uri = urlsplit(self.path)
        if uri.path in ('/health', '/healthz'):
            with registry.lock:
                registry.prune()
                count = len(registry.by_code)
            self.respond(200, {'ok': True, 'service': 'bronx-online-v8', 'rooms': count})
        elif uri.path == '/lan/info':
            self.respond(200, {'ok': True, 'version':'internet-v8', 'addresses':[{'name':'Jogo Bronx', 'url':GAME_URL}], 'maxRooms':MAX_ROOMS})
        elif uri.path == '/lan/events':
            qs = parse_qs(uri.query)
            role = qs.get('role', [''])[0]
            token = qs.get('id', [''])[0]
            room = registry.find_token(role, token)
            if room is None:
                self.respond(403, {'error':'Sessão encerrada ou inválida.'})
            else:
                self.stream(room, role)
        else:
            self.respond(404, {'error':'Rota inexistente.'})

    def stream(self, room, role):
        with room.lock:
            peer = room.host if role == 'host' else room.guest
            if peer is None:
                return self.respond(403, {'error':'Jogador saiu da sala.'})
            peer.generation += 1
            generation = peer.generation
            peer.online = True
            peer.send('connected', role=role)
            if role == 'guest':
                peer.send('waiting')
                if room.fighters[0]: peer.send('selection', player=1, fighterId=room.fighters[0])
                room.host.send('peer', connected=True)
            else:
                if room.guest_token: peer.send('peer', connected=True)
                if room.fighters[1]: peer.send('selection', player=2, fighterId=room.fighters[1], ready=room.guest_ready)
        self.send_response(200)
        self.cors()
        self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache, no-transform')
        self.send_header('Connection', 'keep-alive')
        self.send_header('X-Accel-Buffering', 'no')
        self.end_headers()
        try:
            while peer.generation == generation:
                if peer.closed and peer.events.empty(): break
                try: msg = peer.events.get(timeout=12)
                except queue.Empty: msg = None
                if msg:
                    if msg['type'] == 'end': break
                    data = 'data: ' + json.dumps(msg, separators=(',', ':'),ensure_ascii=False) + '\n\n'
                else:
                    data = ': heartbeat\n\n'
                self.wfile.write(data.encode('utf-8'))
                self.wfile.flush()
                if msg and msg['type']=='hostLeft': break
        except (BrokenPipeError, ConnectionResetError, OSError): pass
        finally:
            with room.lock:
                if peer.generation == generation:
                    peer.online = False
                    if role == 'guest':
                        room.host.send('peer',connected=False)

    def do_POST(self):
        if not self.authorize_origin(): return
        path = urlsplit(self.path).path
        if not path.startswith('/lan/'):
            return self.respond(404, {'error':'Rota inexistente.'})
        try: data = self.read_body()
        except ValueError as e: return self.respond(400, {'error':str(e)})
        if path == '/lan/host':
            room = registry.create()
            if not room: return self.respond(503, {'error':'Limite de salas atingido. Tente novamente mais tarde.'})
            return self.respond(200, {'id':room.host_token, 'code':room.code, 'addresses':[{'name':'Jogo Bronx', 'url':GAME_URL}]})
        if path == '/lan/join':
            code = str(data.get('code', '')).strip().upper()
            if not ROOM_CODE.fullmatch(code):
                return self.respond(400, {'error':'Digite o código de 8 caracteres.'})
            room,error = registry.join(code)
            if error: return self.respond(409, {'error':error})
            return self.respond(200, {'id':room.guest_token})
        role = 'guest' if path == '/lan/input' else data.get('role', 'host') if path in ('/lan/select','/lan/leave') else 'host'
        room = registry.find_token(role, data.get('id'))
        if not room:
            return self.respond(403, {'error':'Sessão inválida ou encerrada.'})
        if path == '/lan/input':
            v=data.get('input') or {}
            if not isinstance(v,dict):v={}
            try:direction=float(v.get('direction',0))
            except (ValueError,TypeError):direction=0
            if not -1 <= direction <= 1: direction=0
            inp={'direction':-1 if direction < -.12 else 1 if direction > .12 else 0}
            for k in ('up','down','punch','kick','guard','special'):
                inp[k]=bool(v.get(k))
            with room.lock:
                room.host.send('input',input=inp)
            return self.respond(200, {'ok':True})
        if path == '/lan/snapshot':
            snapshot = data.get('snapshot')
            if not isinstance(snapshot,dict): return self.respond(400, {'error':'Estado de jogo inválido.'})
            with room.lock:
                if room.guest: room.guest.send('snapshot',snapshot=snapshot)
            return self.respond(200, {'ok':True})
        if path == '/lan/select':
            fighter = data.get('fighterId')
            if fighter not in FIGHTERS: return self.respond(400, {'error':'Personagem inválido.'})
            with room.lock:
                if role == 'host':
                    room.fighters[0]=fighter
                    if room.guest: room.guest.send('selection',player=1,fighterId=fighter)
                else:
                    room.fighters[1]=fighter
                    room.guest_ready=bool(data.get('ready'))
                    room.host.send('selection',player=2,fighterId=fighter,ready=room.guest_ready)
            return self.respond(200, {'ok':True})
        if path == '/lan/start':
            with room.lock:
                if not room.guest or not room.guest.online or not room.guest_ready:
                    return self.respond(409, {'error':'Jogador 2 precisa entrar e confirmar o personagem.'})
                p1,p2=data.get('p1'),data.get('p2')
                if p1 not in FIGHTERS or p2 not in FIGHTERS:
                    return self.respond(400, {'error':'Seleção inválida.'})
                room.guest.send('start',p1=p1,p2=p2)
            return self.respond(200, {'ok':True})
        if path == '/lan/leave':
            if role == 'host': registry.remove_host(room)
            else: registry.remove_guest(room)
            return self.respond(200, {'ok':True})
        return self.respond(404, {'error':'Rota inexistente.'})


def main():
    port = int(os.environ.get('PORT', '10000'))
    httpd = ThreadingHTTPServer(('0.0.0.0',port),Handler)
    httpd.daemon_threads = True
    print(f'BRONX ONLINE V8 pronto na porta {port}',flush=True)
    try: httpd.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt: pass
    finally: httpd.server_close()


if __name__=='__main__':
    main()
