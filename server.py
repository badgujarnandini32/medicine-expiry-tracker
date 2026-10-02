#!/usr/bin/env python3
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "medicine_tracker.db"
PORT = int(os.environ.get("PORT", "3000"))


def connect_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS medicines (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            name TEXT NOT NULL,
            batch TEXT NOT NULL,
            manufacturing_date TEXT NOT NULL,
            expiry_date TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )
        """
    )
    conn.commit()
    return conn


def normalize_username(username):
    value = str(username or "").strip()
    if not value:
        return ""
    lower = value.lower()
    return lower if lower.endswith("@gmail.com") else f"{lower}@gmail.com"


def hash_password(password):
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return f"{salt.hex()}:{derived.hex()}"


def verify_password(password, stored_hash):
    if not stored_hash or ":" not in stored_hash:
        return False
    salt_hex, hash_hex = stored_hash.split(":", 1)
    salt = bytes.fromhex(salt_hex)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return hmac.compare_digest(derived.hex(), hash_hex)


def create_session(username):
    token = secrets.token_urlsafe(32)
    conn = connect_db()
    conn.execute("INSERT INTO sessions (token, username) VALUES (?, ?)", (token, username))
    conn.commit()
    conn.close()
    return token


def get_username_from_token(token):
    if not token:
        return None
    conn = connect_db()
    row = conn.execute("SELECT username FROM sessions WHERE token = ?", (token,)).fetchone()
    conn.close()
    return row["username"] if row else None


def remove_session(token):
    if not token:
        return
    conn = connect_db()
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()


def get_user_medicines(username):
    conn = connect_db()
    rows = conn.execute(
        """
        SELECT id, name, batch, manufacturing_date AS manufacturingDate,
               expiry_date AS expiryDate, quantity
        FROM medicines
        WHERE username = ?
        ORDER BY rowid
        """,
        (username,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def ensure_existing_user(username):
    conn = connect_db()
    row = conn.execute("SELECT username FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    return row is not None


class MedicineHandler(BaseHTTPRequestHandler):
    server_version = "MedicineTrackerPython/1.0"

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def log_message(self, format, *args):
        return

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        body = self.rfile.read(length)
        if not body:
            return {}
        try:
            return json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            return None

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _require_auth(self):
        auth_header = self.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            self._send_json(401, {"message": "Missing token"})
            return None
        token = auth_header.split(" ", 1)[1].strip()
        username = get_username_from_token(token)
        if not username:
            self._send_json(401, {"message": "Invalid token"})
            return None
        return username

    def _handle_signup(self):
        payload = self._read_json()
        if payload is None:
            self._send_json(400, {"message": "Invalid JSON body."})
            return

        username = normalize_username(payload.get("username"))
        password = payload.get("password")
        if not username or not password:
            self._send_json(400, {"message": "Username and password are required."})
            return

        conn = connect_db()
        exists = conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
        if exists:
            conn.close()
            self._send_json(409, {"message": "User already exists."})
            return

        conn.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            (username, hash_password(password)),
        )
        conn.commit()
        conn.close()

        self._send_json(201, {"user": {"username": username}, "message": "Account created successfully."})

    def _handle_login(self):
        payload = self._read_json()
        if payload is None:
            self._send_json(400, {"message": "Invalid JSON body."})
            return

        username = normalize_username(payload.get("username"))
        password = payload.get("password")
        if not username or not password:
            self._send_json(400, {"message": "Username and password are required."})
            return

        conn = connect_db()
        row = conn.execute("SELECT username, password FROM users WHERE username = ?", (username,)).fetchone()
        conn.close()
        if not row or not verify_password(password, row["password"]):
            self._send_json(401, {"message": "Incorrect username or password."})
            return

        token = create_session(username)
        self._send_json(200, {"token": token, "user": {"username": username}})

    def _handle_medicines_get(self, username):
        medicines = get_user_medicines(username)
        self._send_json(200, medicines)

    def _handle_medicines_post(self, username):
        payload = self._read_json()
        if payload is None:
            self._send_json(400, {"message": "Invalid JSON body."})
            return

        required = ["name", "batch", "manufacturingDate", "expiryDate", "quantity"]
        if not all(key in payload for key in required):
            self._send_json(400, {"message": "All medicine fields are required."})
            return

        medicine = {
            "id": payload.get("id") or secrets.token_urlsafe(8),
            "name": str(payload["name"]).strip(),
            "batch": str(payload["batch"]).strip(),
            "manufacturingDate": str(payload["manufacturingDate"]).strip(),
            "expiryDate": str(payload["expiryDate"]).strip(),
            "quantity": int(payload["quantity"]),
        }

        if not medicine["name"] or not medicine["batch"] or not medicine["manufacturingDate"] or not medicine["expiryDate"] or medicine["quantity"] <= 0:
            self._send_json(400, {"message": "All medicine fields are required."})
            return

        conn = connect_db()
        conn.execute(
            """
            INSERT INTO medicines (id, username, name, batch, manufacturing_date, expiry_date, quantity)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                medicine["id"],
                username,
                medicine["name"],
                medicine["batch"],
                medicine["manufacturingDate"],
                medicine["expiryDate"],
                medicine["quantity"],
            ),
        )
        conn.commit()
        conn.close()
        self._send_json(201, medicine)

    def _handle_medicines_delete(self, username, medicine_id):
        conn = connect_db()
        conn.execute("DELETE FROM medicines WHERE id = ? AND username = ?", (medicine_id, username))
        conn.commit()
        conn.close()
        self._send_json(200, {"message": "Medicine deleted successfully."})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self._send_json(200, {"ok": True, "message": "Medicine tracker backend is running"})
            return

        if parsed.path == "/api/medicines":
            username = self._require_auth()
            if username is None:
                return
            self._handle_medicines_get(username)
            return

        self._send_json(404, {"message": "Not found."})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/signup":
            self._handle_signup()
            return

        if parsed.path == "/api/login":
            self._handle_login()
            return

        if parsed.path == "/api/medicines":
            username = self._require_auth()
            if username is None:
                return
            self._handle_medicines_post(username)
            return

        self._send_json(404, {"message": "Not found."})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/medicines/"):
            username = self._require_auth()
            if username is None:
                return
            medicine_id = parsed.path.split("/api/medicines/", 1)[1]
            self._handle_medicines_delete(username, medicine_id)
            return

        self._send_json(404, {"message": "Not found."})


if __name__ == "__main__":
    connect_db()
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), MedicineHandler)
    print(f"Server running on http://localhost:{PORT}")
    httpd.serve_forever()
