const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'medicine-tracker-secret';
const DATABASE_FILE = process.env.DATABASE_FILE || path.join(__dirname, 'medicine-tracker.db');
const LEGACY_DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());

const db = new Database(DATABASE_FILE);
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS medicines (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    batch TEXT NOT NULL,
    manufacturing_date TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
  );
`);

function migrateLegacyData() {
  if (!fs.existsSync(LEGACY_DATA_FILE) || db.prepare('SELECT 1 FROM users LIMIT 1').get()) return;

  try {
    const data = JSON.parse(fs.readFileSync(LEGACY_DATA_FILE, 'utf8'));
    const migrate = db.transaction(() => {
      const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)');
      const insertMedicine = db.prepare(`
        INSERT OR IGNORE INTO medicines
          (id, username, name, batch, manufacturing_date, expiry_date, quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const user of data.users || []) insertUser.run(user.username, user.password);
      for (const [username, medicines] of Object.entries(data.medicinesByUser || {})) {
        for (const medicine of medicines) {
          insertMedicine.run(
            medicine.id,
            username,
            medicine.name,
            medicine.batch,
            medicine.manufacturingDate,
            medicine.expiryDate,
            medicine.quantity
          );
        }
      }
    });
    migrate();
  } catch (error) {
    console.error(`Unable to migrate ${LEGACY_DATA_FILE}:`, error.message);
  }
}

migrateLegacyData();

function createToken(user) {
  return jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Missing token' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Medicine tracker backend is running' });
});

app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ message: 'User already exists.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashedPassword);

  res.status(201).json({
    user: { username },
    message: 'Account created successfully.'
  });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  const user = db.prepare('SELECT username, password FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ message: 'Incorrect username or password.' });
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    return res.status(401).json({ message: 'Incorrect username or password.' });
  }

  const token = createToken(user);
  res.json({ token, user: { username } });
});

app.get('/api/medicines', authMiddleware, (req, res) => {
  const username = req.user.username;
  const medicines = db.prepare(`
    SELECT id, name, batch, manufacturing_date AS manufacturingDate,
      expiry_date AS expiryDate, quantity
    FROM medicines
    WHERE username = ?
    ORDER BY rowid
  `).all(username);
  res.json(medicines);
});

app.post('/api/medicines', authMiddleware, (req, res) => {
  const username = req.user.username;
  const medicine = req.body;

  if (!medicine || !medicine.name || !medicine.batch || !medicine.expiryDate || !medicine.manufacturingDate || !medicine.quantity) {
    return res.status(400).json({ message: 'All medicine fields are required.' });
  }

  const newMedicine = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    name: String(medicine.name).trim(),
    batch: String(medicine.batch).trim(),
    manufacturingDate: medicine.manufacturingDate,
    expiryDate: medicine.expiryDate,
    quantity: Number(medicine.quantity)
  };

  db.prepare(`
    INSERT INTO medicines
      (id, username, name, batch, manufacturing_date, expiry_date, quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    newMedicine.id,
    username,
    newMedicine.name,
    newMedicine.batch,
    newMedicine.manufacturingDate,
    newMedicine.expiryDate,
    newMedicine.quantity
  );
  res.status(201).json(newMedicine);
});

app.delete('/api/medicines/:id', authMiddleware, (req, res) => {
  const username = req.user.username;
  db.prepare('DELETE FROM medicines WHERE id = ? AND username = ?').run(req.params.id, username);
  res.json({ message: 'Medicine deleted successfully.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
