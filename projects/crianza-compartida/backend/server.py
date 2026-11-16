#!/usr/bin/env python3
"""Crianza Compartida: minimal authenticated, idempotent chat API.
Python 3.11+, stdlib only. Run behind HTTPS reverse proxy in production.
"""
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

DB_PATH = os.getenv("DB_PATH", "crianza.sqlite3")
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8787"))
AI_KEY = os.getenv("GROQ_API_KEY", "")
AI_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
DB_LOCK = threading.RLock()
SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY, invite_hash TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members (
  family_id TEXT NOT NULL, user_id TEXT NOT NULL, neutral_on INTEGER NOT NULL DEFAULT 0,
  changed_at TEXT, PRIMARY KEY(family_id, user_id),
  FOREIGN KEY(family_id) REFERENCES families(id), FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL, sender_id TEXT NOT NULL,
  recipient_id TEXT, body_original TEXT NOT NULL, body_neutral TEXT,
  neutral_sender INTEGER NOT NULL, neutral_recipient INTEGER NOT NULL,
  state TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY(family_id) REFERENCES families(id), FOREIGN KEY(sender_id) REFERENCES users(id));
CREATE INDEX IF NOT EXISTS messages_family_time ON messages(family_id, created_at, id);
"""

def now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")

def hash_token(value):
    return hashlib.sha256(value.encode()).hexdigest()

def password_hash(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 310000).hex()

def view_message(row, viewer_id):
    """Use only the activation snapshots taken when the message was inserted.
    A non-opted-in sender may still see their own original; everybody else
    gets the one canonical edit where neutral mode applied at send time.
    """
    edit = bool(row["neutral_sender"]) or (
        viewer_id != row["sender_id"] and
        viewer_id == row["recipient_id"] and bool(row["neutral_recipient"])
    )
    if edit:
        body = row["body_neutral"] if row["state"] == "done" else None
    else:
        body = row["body_original"]
    return {
        "id": row["id"], "sender_id": row["sender_id"],
        "text": body, "neutral": edit,
        "status": row["state"] if edit else "original",
        "created_at": row["created_at"]
    }

def neutralize(original):
    if not AI_KEY:
        raise RuntimeError("La IA no está configurada en el servidor")
    prompt = (
        "Reescribí en español rioplatense este mensaje de crianza compartida "
        "con un tono neutral, concreto y respetuoso. No agregues ni elimines hechos, "
        "fechas, horas, nombres, medicamentos, dosis, pedidos ni acuerdos. "
        "No ocultes riesgos, amenazas, abuso ni información urgente. "
        "No contestes al mensaje: sólo devolvé el texto reformulado."
    )
    payload = json.dumps({
        "model": AI_MODEL, "temperature": 0,
        "messages": [{"role":"system","content":prompt},
                     {"role":"user","content":original}]
    }).encode()
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        payload,
        {"Authorization": "Bearer " + AI_KEY, "Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.load(resp)
    edited = result["choices"][0]["message"]["content"].strip()
    if not edited or len(edited) > 8000:
        raise ValueError("La IA no devolvió un texto utilizable")
    return edited

def connection():
    db = sqlite3.connect(DB_PATH, timeout=20)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=20000")
    return db

def init_db():
    with DB_LOCK, connection() as db:
        db.executescript(SCHEMA)

class APIError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message

def require(value, message):
    if not value:
        raise APIError(400, message)
    return value

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Do not log message contents or auth tokens
        print("%s %s" % (self.address_string(), fmt % args))

    def send_json(self, status, data):
        raw = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(raw)

    def request_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length < 0 or length > 10000:
            raise APIError(413, "Solicitud demasiado grande")
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, UnicodeError):
            raise APIError(400, "JSON inválido")

    def auth_user(self, db):
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            raise APIError(401, "Iniciá sesión")
        row = db.execute(
            "SELECT user_id FROM sessions WHERE token_hash=? AND expires>?",
            (hash_token(header[7:]), int(time.time()))
        ).fetchone()
        if not row:
            raise APIError(401, "Sesión vencida")
        return row["user_id"]

    def member(self, db, family_id, user_id):
        m = db.execute(
            "SELECT neutral_on FROM members WHERE family_id=? AND user_id=?",
            (family_id, user_id)
        ).fetchone()
        if m is None:
            raise APIError(403, "Sin acceso a este grupo")
        return m

    def session(self, db, user_id, name):
        token = secrets.token_urlsafe(40)
        db.execute(
            "INSERT INTO sessions(token_hash,user_id,expires) VALUES (?,?,?)",
            (hash_token(token), user_id, int(time.time()) + 30 * 86400)
        )
        return {"token": token, "user_id": user_id, "name": name}

    def dispatch(self, method):
        path = urlparse(self.path).path
        if path == "/health" and method == "GET":
            return {"ok": True, "ai_ready": bool(AI_KEY)}
        data = self.request_json() if method == "POST" else {}
        with DB_LOCK:
            with connection() as db:
                if path in ("/api/auth/register", "/api/auth/login") and method == "POST":
                    name = str(data.get("name", "")).strip()
                    password = str(data.get("password", ""))
                    require(1 <= len(name) <= 50 and len(password) >= 8, "Nombre y contraseña de al menos 8 caracteres")
                    if path.endswith("/register"):
                        user_id = str(uuid.uuid4())
                        salt = secrets.token_hex(16)
                        db.execute("INSERT INTO users VALUES (?,?,?,?)",
                                   (user_id, name, password_hash(password, salt), salt))
                    else:
                        # For initial MVP: name is unique for login; reject ambiguous users.
                        rows = db.execute("SELECT * FROM users WHERE name=?", (name,)).fetchall()
                        if len(rows) != 1 or not hmac.compare_digest(
                            rows[0]["password_hash"], password_hash(password, rows[0]["salt"])
                        ):
                            raise APIError(401, "Credenciales incorrectas")
                        user_id = rows[0]["id"]
                    return self.session(db, user_id, name)
                user_id = self.auth_user(db)
                if path == "/api/families/current" and method == "GET":
                    row = db.execute(
                        "SELECT f.id, m.neutral_on FROM families f JOIN members m "
                        "ON f.id=m.family_id WHERE m.user_id=? ORDER BY f.created_at DESC LIMIT 1",
                        (user_id,)
                    ).fetchone()
                    return {"family": dict(row) if row else None}
                if path == "/api/families" and method == "POST":
                    fid, code = str(uuid.uuid4()), secrets.token_urlsafe(12)
                    db.execute("INSERT INTO families VALUES (?,?,?)", (fid, hash_token(code), now()))
                    db.execute("INSERT INTO members(family_id,user_id) VALUES(?,?)", (fid,user_id))
                    return {"family_id": fid, "invite_code": code}
                if path == "/api/families/join" and method == "POST":
                    code = str(data.get("code", "")).strip()
                    row = db.execute("SELECT id FROM families WHERE invite_hash=?", (hash_token(code),)).fetchone()
                    if not row:
                        raise APIError(404, "Código no encontrado")
                    count = db.execute("SELECT COUNT(*) FROM members WHERE family_id=?", (row["id"],)).fetchone()[0]
                    if count >= 2:
                        raise APIError(409, "Este grupo ya tiene dos responsables")
                    db.execute("INSERT OR IGNORE INTO members(family_id,user_id) VALUES(?,?)", (row["id"],user_id))
                    return {"family_id": row["id"]}
                parts = path.strip("/").split("/")
                if len(parts) == 4 and parts[:2] == ["api", "families"]:
                    family_id, action = parts[2], parts[3]
                    self.member(db, family_id, user_id)
                    if action == "neutral" and method == "POST":
                        enabled = data.get("enabled")
                        if type(enabled) is not bool:
                            raise APIError(400, "Valor inválido")
                        db.execute(
                            "UPDATE members SET neutral_on=?, changed_at=? WHERE family_id=? AND user_id=?",
                            (int(enabled), now(), family_id, user_id)
                        )
                        return {"neutral_enabled": enabled}
                    if action == "messages" and method == "GET":
                        rows = db.execute(
                            "SELECT * FROM messages WHERE family_id=? ORDER BY created_at,id LIMIT 500",
                            (family_id,)
                        ).fetchall()
                        names = {r["id"]:r["name"] for r in db.execute(
                            "SELECT u.id,u.name FROM users u JOIN members m ON m.user_id=u.id WHERE m.family_id=?",
                            (family_id,)
                        )}
                        return {"messages": [dict(view_message(r,user_id), sender_name=names.get(r["sender_id"],"Adulto")) for r in rows]}
                    if action == "messages" and method == "POST":
                        mid = require(str(data.get("id","")).strip(),"UUID obligatorio")
                        try:
                            if str(uuid.UUID(mid)) != mid:
                                raise ValueError()
                        except ValueError:
                            raise APIError(400, "UUID inválido")
                        body = str(data.get("text", "")).strip()
                        require(1 <= len(body) <= 4000, "El mensaje debe tener 1 a 4000 caracteres")
                        old = db.execute("SELECT * FROM messages WHERE id=?", (mid,)).fetchone()
                        if old:
                            if old["family_id"] != family_id or old["sender_id"] != user_id or old["body_original"] != body:
                                raise APIError(409, "El UUID ya pertenece a otro mensaje")
                            return {"id": mid, "status": old["state"], "duplicate": True}
                        sender_neutral = db.execute(
                            "SELECT neutral_on FROM members WHERE family_id=? AND user_id=?",
                            (family_id,user_id)
                        ).fetchone()[0]
                        recipient = db.execute(
                            "SELECT user_id,neutral_on FROM members WHERE family_id=? AND user_id<>?",
                            (family_id,user_id)
                        ).fetchone()
                        recipient_id = recipient["user_id"] if recipient else None
                        recipient_neutral = recipient["neutral_on"] if recipient else 0
                        need_ai = bool(sender_neutral or recipient_neutral)
                        db.execute(
                            "INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?,?)",
                            (mid, family_id, user_id, recipient_id, body, None,
                             int(sender_neutral), int(recipient_neutral),
                             "pending" if need_ai else "original", now())
                        )
                        db.commit()  # Durable UUID reservation before any external AI request.
                        if not need_ai:
                            return {"id": mid, "status": "original", "duplicate": False}
                        try:
                            edited = neutralize(body)
                            status = "done"
                        except Exception:
                            # No automatic retry: one UUID never invokes the model twice.
                            edited, status = None, "unavailable"
                        db.execute(
                            "UPDATE messages SET body_neutral=?, state=? WHERE id=? AND state='pending'",
                            (edited, status, mid)
                        )
                        return {"id": mid, "status": status, "duplicate": False}
                raise APIError(404, "Ruta no encontrada")

    def do_GET(self):
        self.handle_method("GET")

    def do_POST(self):
        self.handle_method("POST")

    def handle_method(self, method):
        try:
            response = self.dispatch(method)
            self.send_json(200, response)
        except APIError as e:
            self.send_json(e.status, {"error": e.message})
        except sqlite3.IntegrityError:
            self.send_json(409, {"error": "Registro duplicado o acceso existente"})
        except Exception as e:
            print("Internal request error:", type(e).__name__)
            self.send_json(500, {"error": "Error interno"})

if __name__ == "__main__":
    init_db()
    print(f"Crianza API: http://{HOST}:{PORT} (publicar detrás de HTTPS)")
    ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
