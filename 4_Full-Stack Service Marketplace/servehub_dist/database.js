const path = require('path');
const fs   = require('fs');
const DB_PATH = path.join(__dirname, 'marketplace.db.bin');

async function initDB() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  let db;
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  function save() {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  }

  function prepare(sql) {
    return {
      get() {
        const params = Array.from(arguments);
        const stmt = db.prepare(sql);
        if (params.length) stmt.bind(params);
        const row = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();
        return row;
      },
      all() {
        const params = Array.from(arguments);
        const stmt = db.prepare(sql);
        if (params.length) stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
      },
      run() {
        const params = Array.from(arguments);
        db.run(sql, params.length ? params : undefined);
        save();
        return { changes: db.getRowsModified() };
      },
    };
  }

  const wrapper = {
    prepare: prepare,
    exec: function(sql) { db.exec(sql); save(); },
    pragma: function(str) { try { db.run('PRAGMA ' + str); } catch(e) {} },
  };

  db.exec(
    'CREATE TABLE IF NOT EXISTS categories (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  name TEXT NOT NULL UNIQUE,' +
    '  icon TEXT NOT NULL DEFAULT "🔧",' +
    '  description TEXT' +
    ');' +
    'CREATE TABLE IF NOT EXISTS users (' +
    '  id TEXT PRIMARY KEY,' +
    '  email TEXT NOT NULL UNIQUE,' +
    '  password_hash TEXT NOT NULL,' +
    '  role TEXT NOT NULL DEFAULT "user",' +
    '  full_name TEXT NOT NULL,' +
    '  phone TEXT,' +
    '  is_active INTEGER NOT NULL DEFAULT 1,' +
    '  created_at TEXT' +
    ');' +
    'CREATE TABLE IF NOT EXISTS vendors (' +
    '  id TEXT PRIMARY KEY,' +
    '  user_id TEXT NOT NULL UNIQUE,' +
    '  business_name TEXT NOT NULL,' +
    '  description TEXT,' +
    '  category_id INTEGER,' +
    '  city TEXT,' +
    '  rating REAL NOT NULL DEFAULT 0,' +
    '  rating_count INTEGER NOT NULL DEFAULT 0,' +
    '  is_verified INTEGER NOT NULL DEFAULT 0,' +
    '  joined_at TEXT' +
    ');' +
    'CREATE TABLE IF NOT EXISTS services (' +
    '  id TEXT PRIMARY KEY,' +
    '  vendor_id TEXT NOT NULL,' +
    '  category_id INTEGER NOT NULL,' +
    '  name TEXT NOT NULL,' +
    '  description TEXT,' +
    '  price REAL NOT NULL,' +
    '  price_unit TEXT NOT NULL DEFAULT "fixed",' +
    '  duration_min INTEGER,' +
    '  is_active INTEGER NOT NULL DEFAULT 1,' +
    '  created_at TEXT' +
    ');' +
    'CREATE TABLE IF NOT EXISTS orders (' +
    '  id TEXT PRIMARY KEY,' +
    '  user_id TEXT NOT NULL,' +
    '  service_id TEXT NOT NULL,' +
    '  vendor_id TEXT NOT NULL,' +
    '  status TEXT NOT NULL DEFAULT "pending",' +
    '  total_price REAL NOT NULL,' +
    '  payment_status TEXT NOT NULL DEFAULT "unpaid",' +
    '  payment_ref TEXT,' +
    '  scheduled_at TEXT,' +
    '  address TEXT,' +
    '  notes TEXT,' +
    '  created_at TEXT,' +
    '  updated_at TEXT' +
    ');'
  );

  save();
  return wrapper;
}

module.exports = { initDB: initDB };
