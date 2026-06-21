const express    = require('express');
const cors       = require('cors');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path       = require('path');
const { initDB } = require('./database');

const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'marketplace_jwt_secret_dev_2024';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth Middleware ──────────────────────────────────────────────────────────

function makeAuth(SECRET) {
  function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    try {
      req.user = jwt.verify(header.slice(7), SECRET);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  function requireRole(...roles) {
    return (req, res, next) => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
      }
      next();
    };
  }

  return { authenticate, requireRole };
}

function safeUser(u) {
  if (!u) return null;
  const { password_hash, ...safe } = u;
  return safe;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔧 Initialising database…');
  const db = await initDB();
  console.log('✅ Database ready');

  const { authenticate, requireRole } = makeAuth(SECRET);
  function now() { return new Date().toISOString(); }

  // ── Auth Routes ────────────────────────────────────────────────────────────

  app.post('/api/auth/register', (req, res) => {
    const { email, password, full_name, phone, role } = req.body;
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'email, password, and full_name are required' });
    }
    const allowedRoles = ['user', 'vendor'];
    const userRole = allowedRoles.includes(role) ? role : 'user';

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const id   = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, email.toLowerCase().trim(), hash, userRole, full_name, phone || null, now());

    const user  = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: safeUser(user) });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.is_active) return res.status(403).json({ error: 'Account suspended' });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: safeUser(user) });
  });

  app.get('/api/auth/me', authenticate, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(safeUser(user));
  });

  app.put('/api/auth/me', authenticate, (req, res) => {
    const { full_name, phone } = req.body;
    db.prepare('UPDATE users SET full_name = ?, phone = ? WHERE id = ?').run(full_name, phone, req.user.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json(safeUser(user));
  });

  // ── Categories ─────────────────────────────────────────────────────────────

  app.get('/api/categories', (req, res) => {
    const cats = db.prepare(`
      SELECT c.id, c.name, c.icon, c.description,
             COUNT(s.id) AS service_count
      FROM categories c
      LEFT JOIN services s ON s.category_id = c.id AND s.is_active = 1
      GROUP BY c.id ORDER BY c.name
    `).all();
    res.json(cats);
  });

  // ── Services ───────────────────────────────────────────────────────────────

  app.get('/api/services', (req, res) => {
    const { search = '', category_id, vendor_id, min_price, max_price } = req.query;
    let sql = `
      SELECT s.id, s.name, s.description, s.price, s.price_unit, s.duration_min, s.is_active, s.created_at,
             c.name AS category_name, c.icon AS category_icon,
             v.id AS vendor_id, v.business_name, v.city, v.rating, v.is_verified,
             u.full_name AS vendor_owner
      FROM services s
      JOIN categories c ON c.id = s.category_id
      JOIN vendors v    ON v.id = s.vendor_id
      JOIN users u      ON u.id = v.user_id
      WHERE s.is_active = 1
    `;
    const params = [];
    if (search)      { sql += ` AND (s.name LIKE ? OR s.description LIKE ? OR v.business_name LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (category_id) { sql += ` AND s.category_id = ?`; params.push(Number(category_id)); }
    if (vendor_id)   { sql += ` AND s.vendor_id = ?`;   params.push(vendor_id); }
    if (min_price)   { sql += ` AND s.price >= ?`;       params.push(Number(min_price)); }
    if (max_price)   { sql += ` AND s.price <= ?`;       params.push(Number(max_price)); }
    sql += ` ORDER BY v.rating DESC, s.price ASC`;

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    res.json(rows);
  });

  app.get('/api/services/:id', (req, res) => {
    const svc = db.prepare(`
      SELECT s.*, c.name AS category_name, c.icon AS category_icon,
             v.business_name, v.city, v.rating, v.rating_count, v.is_verified,
             v.description AS vendor_description, u.full_name AS vendor_owner
      FROM services s
      JOIN categories c ON c.id = s.category_id
      JOIN vendors v    ON v.id = s.vendor_id
      JOIN users u      ON u.id = v.user_id
      WHERE s.id = ?
    `).get(req.params.id);
    if (!svc) return res.status(404).json({ error: 'Service not found' });
    res.json(svc);
  });

  // ── Vendor ─────────────────────────────────────────────────────────────────

  app.post('/api/vendors', authenticate, (req, res) => {
    const { business_name, description, category_id, city } = req.body;
    if (!business_name) return res.status(400).json({ error: 'business_name required' });

    const existing = db.prepare('SELECT id FROM vendors WHERE user_id = ?').get(req.user.id);
    if (existing) {
      db.prepare(`UPDATE vendors SET business_name=?, description=?, category_id=?, city=? WHERE user_id=?`)
        .run(business_name, description || null, category_id || null, city || null, req.user.id);
      db.prepare(`UPDATE users SET role='vendor' WHERE id=?`).run(req.user.id);
      return res.json(db.prepare('SELECT * FROM vendors WHERE user_id=?').get(req.user.id));
    }

    const vid = uuidv4();
    db.prepare(`INSERT INTO vendors (id, user_id, business_name, description, category_id, city, joined_at) VALUES (?,?,?,?,?,?,?)`)
      .run(vid, req.user.id, business_name, description || null, category_id || null, city || null, now());
    db.prepare(`UPDATE users SET role='vendor' WHERE id=?`).run(req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM vendors WHERE id=?').get(vid));
  });

  app.get('/api/vendors/me', authenticate, requireRole('vendor', 'admin'), (req, res) => {
    const vendor = db.prepare('SELECT * FROM vendors WHERE user_id = ?').get(req.user.id);
    if (!vendor) return res.status(404).json({ error: 'No vendor profile found' });
    res.json(vendor);
  });

  app.get('/api/vendors/me/services', authenticate, requireRole('vendor', 'admin'), (req, res) => {
    const vendor = db.prepare('SELECT id FROM vendors WHERE user_id = ?').get(req.user.id);
    if (!vendor) return res.status(404).json({ error: 'No vendor profile' });
    const svcs = db.prepare(`
      SELECT s.*, c.name AS category_name, c.icon AS category_icon
      FROM services s JOIN categories c ON c.id = s.category_id
      WHERE s.vendor_id = ? ORDER BY s.created_at DESC
    `).all(vendor.id);
    res.json(svcs);
  });

  app.post('/api/vendors/me/services', authenticate, requireRole('vendor', 'admin'), (req, res) => {
    const vendor = db.prepare('SELECT id FROM vendors WHERE user_id = ?').get(req.user.id);
    if (!vendor) return res.status(404).json({ error: 'No vendor profile' });

    const { category_id, name, description, price, price_unit, duration_min } = req.body;
    if (!category_id || !name || !price) return res.status(400).json({ error: 'category_id, name, price required' });

    const id = uuidv4();
    db.prepare(`INSERT INTO services (id,vendor_id,category_id,name,description,price,price_unit,duration_min,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, vendor.id, Number(category_id), name, description || null, Number(price), price_unit || 'fixed', duration_min ? Number(duration_min) : null, now());
    res.status(201).json(db.prepare('SELECT * FROM services WHERE id=?').get(id));
  });

  app.put('/api/vendors/me/services/:id', authenticate, requireRole('vendor', 'admin'), (req, res) => {
    const vendor = db.prepare('SELECT id FROM vendors WHERE user_id = ?').get(req.user.id);
    const svc    = db.prepare('SELECT * FROM services WHERE id = ? AND vendor_id = ?').get(req.params.id, vendor?.id);
    if (!svc) return res.status(404).json({ error: 'Service not found' });

    const { category_id, name, description, price, price_unit, duration_min, is_active } = req.body;
    db.prepare(`UPDATE services SET category_id=?,name=?,description=?,price=?,price_unit=?,duration_min=?,is_active=? WHERE id=?`)
      .run(
        category_id  !== undefined ? Number(category_id)  : svc.category_id,
        name         ?? svc.name,
        description  ?? svc.description,
        price        !== undefined ? Number(price)        : svc.price,
        price_unit   ?? svc.price_unit,
        duration_min !== undefined ? Number(duration_min) : svc.duration_min,
        is_active    !== undefined ? (is_active ? 1 : 0)  : svc.is_active,
        svc.id
      );
    res.json(db.prepare('SELECT * FROM services WHERE id=?').get(svc.id));
  });

  app.delete('/api/vendors/me/services/:id', authenticate, requireRole('vendor', 'admin'), (req, res) => {
    const vendor = db.prepare('SELECT id FROM vendors WHERE user_id = ?').get(req.user.id);
    const svc    = db.prepare('SELECT id FROM services WHERE id = ? AND vendor_id = ?').get(req.params.id, vendor?.id);
    if (!svc) return res.status(404).json({ error: 'Service not found' });
    db.prepare('UPDATE services SET is_active = 0 WHERE id = ?').run(svc.id);
    res.json({ message: 'Service deactivated' });
  });

  app.get('/api/vendors/me/orders', authenticate, requireRole('vendor', 'admin'), (req, res) => {
    const vendor = db.prepare('SELECT id FROM vendors WHERE user_id = ?').get(req.user.id);
    if (!vendor) return res.status(404).json({ error: 'No vendor profile' });
    const orders = db.prepare(`
      SELECT o.*, s.name AS service_name, s.price AS service_price,
             u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
      FROM orders o
      JOIN services s ON s.id = o.service_id
      JOIN users u    ON u.id = o.user_id
      WHERE o.vendor_id = ?
      ORDER BY o.created_at DESC
    `).all(vendor.id);
    res.json(orders);
  });

  app.put('/api/vendors/me/orders/:id', authenticate, requireRole('vendor', 'admin'), (req, res) => {
    const vendor = db.prepare('SELECT id FROM vendors WHERE user_id = ?').get(req.user.id);
    const order  = db.prepare('SELECT * FROM orders WHERE id = ? AND vendor_id = ?').get(req.params.id, vendor?.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const { status } = req.body;
    const valid = ['confirmed', 'in_progress', 'completed', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    db.prepare(`UPDATE orders SET status=?, updated_at=? WHERE id=?`).run(status, now(), order.id);
    res.json(db.prepare('SELECT * FROM orders WHERE id=?').get(order.id));
  });

  app.get('/api/vendors/me/stats', authenticate, requireRole('vendor', 'admin'), (req, res) => {
    const vendor = db.prepare('SELECT * FROM vendors WHERE user_id = ?').get(req.user.id);
    if (!vendor) return res.status(404).json({ error: 'No vendor profile' });

    const allOrders = db.prepare('SELECT * FROM orders WHERE vendor_id = ?').all(vendor.id);
    const stats = {
      total_orders:    allOrders.length,
      total_revenue:   allOrders.filter(o => o.payment_status === 'paid').reduce((s, o) => s + o.total_price, 0),
      pending_count:   allOrders.filter(o => o.status === 'pending').length,
      confirmed_count: allOrders.filter(o => o.status === 'confirmed').length,
      completed_count: allOrders.filter(o => o.status === 'completed').length,
      cancelled_count: allOrders.filter(o => o.status === 'cancelled').length,
    };
    const activeServices = db.prepare('SELECT COUNT(*) AS cnt FROM services WHERE vendor_id=? AND is_active=1').get(vendor.id);
    res.json({ vendor, stats, active_services: activeServices ? activeServices.cnt : 0 });
  });

  // ── Orders ─────────────────────────────────────────────────────────────────

  app.post('/api/orders', authenticate, requireRole('user', 'admin'), (req, res) => {
    const { service_id, scheduled_at, address, notes } = req.body;
    if (!service_id) return res.status(400).json({ error: 'service_id required' });

    const svc = db.prepare('SELECT * FROM services WHERE id = ? AND is_active = 1').get(service_id);
    if (!svc) return res.status(404).json({ error: 'Service not available' });

    const id = uuidv4();
    db.prepare(`INSERT INTO orders (id,user_id,service_id,vendor_id,total_price,scheduled_at,address,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, req.user.id, svc.id, svc.vendor_id, svc.price, scheduled_at || null, address || null, notes || null, now(), now());

    const order = db.prepare(`
      SELECT o.*, s.name AS service_name, v.business_name
      FROM orders o JOIN services s ON s.id=o.service_id JOIN vendors v ON v.id=o.vendor_id
      WHERE o.id=?
    `).get(id);
    res.status(201).json(order);
  });

  app.get('/api/orders', authenticate, (req, res) => {
    const orders = db.prepare(`
      SELECT o.*, s.name AS service_name, c.icon AS category_icon,
             v.business_name, v.city, v.rating
      FROM orders o
      JOIN services s   ON s.id = o.service_id
      JOIN categories c ON c.id = s.category_id
      JOIN vendors v    ON v.id = o.vendor_id
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
    `).all(req.user.id);
    res.json(orders);
  });

  app.get('/api/orders/:id', authenticate, (req, res) => {
    const order = db.prepare(`
      SELECT o.*, s.name AS service_name, s.description AS service_description,
             c.name AS category_name, c.icon AS category_icon,
             v.business_name, v.city, v.rating, u.full_name AS customer_name
      FROM orders o
      JOIN services s   ON s.id = o.service_id
      JOIN categories c ON c.id = s.category_id
      JOIN vendors v    ON v.id = o.vendor_id
      JOIN users u      ON u.id = o.user_id
      WHERE o.id = ?
    `).get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const vendor = req.user.role === 'vendor'
      ? db.prepare('SELECT id FROM vendors WHERE user_id=?').get(req.user.id)
      : null;

    if (req.user.role !== 'admin' && order.user_id !== req.user.id && (!vendor || order.vendor_id !== vendor?.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(order);
  });

  // ── Payment (Mock Sandbox) ─────────────────────────────────────────────────

  app.post('/api/orders/:id/payment', authenticate, (req, res) => {
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    if (order.payment_status === 'paid') return res.status(409).json({ error: 'Order already paid' });

    const { card_number, expiry, cvv, card_name } = req.body;
    if (!card_number || !expiry || !cvv || !card_name) {
      return res.status(400).json({ error: 'card_number, expiry, cvv, card_name required' });
    }

    // Sandbox: card ending in 0000 → decline
    const last4 = card_number.replace(/\s/g, '').slice(-4);
    if (last4 === '0000') {
      return res.status(402).json({ error: 'Payment declined', decline_code: 'insufficient_funds', sandbox: true });
    }

    const paymentRef = `SANDBOX-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
    db.prepare(`UPDATE orders SET payment_status='paid', payment_ref=?, status='confirmed', updated_at=? WHERE id=?`)
      .run(paymentRef, now(), order.id);

    const updatedOrder = db.prepare('SELECT * FROM orders WHERE id=?').get(order.id);
    res.json({ success: true, sandbox: true, payment_ref: paymentRef, last4, amount: order.total_price, currency: 'GBP', order: updatedOrder });
  });

  app.delete('/api/orders/:id', authenticate, (req, res) => {
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    if (['completed', 'cancelled'].includes(order.status)) return res.status(409).json({ error: `Cannot cancel a ${order.status} order` });
    db.prepare(`UPDATE orders SET status='cancelled', updated_at=? WHERE id=?`).run(now(), order.id);
    res.json({ message: 'Order cancelled' });
  });

  // ── Admin ──────────────────────────────────────────────────────────────────

  app.get('/api/admin/stats', authenticate, requireRole('admin'), (req, res) => {
    const allUsers   = db.prepare('SELECT role FROM users').all();
    const allOrders  = db.prepare('SELECT total_price, payment_status FROM orders').all();
    const svcCount   = db.prepare('SELECT COUNT(*) AS cnt FROM services WHERE is_active=1').get();
    const vendorCount= db.prepare('SELECT COUNT(*) AS cnt FROM vendors WHERE is_verified=1').get();

    const byRole = {};
    allUsers.forEach(u => { byRole[u.role] = (byRole[u.role] || 0) + 1; });
    const revenue = allOrders.filter(o => o.payment_status === 'paid').reduce((s, o) => s + o.total_price, 0);

    res.json({
      users:   Object.entries(byRole).map(([role, cnt]) => ({ role, cnt })),
      orders:  { total: allOrders.length, revenue },
      services: svcCount,
      vendors:  vendorCount,
    });
  });

  app.get('/api/admin/users', authenticate, requireRole('admin'), (req, res) => {
    const users = db.prepare(`
      SELECT u.id, u.email, u.role, u.full_name, u.phone, u.is_active, u.created_at,
             v.business_name, v.rating, v.is_verified
      FROM users u LEFT JOIN vendors v ON v.user_id = u.id
      ORDER BY u.created_at DESC
    `).all();
    res.json(users);
  });

  app.put('/api/admin/users/:id', authenticate, requireRole('admin'), (req, res) => {
    const { role, is_active } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    db.prepare('UPDATE users SET role=?, is_active=? WHERE id=?')
      .run(role ?? user.role, is_active !== undefined ? (is_active ? 1 : 0) : user.is_active, user.id);
    const updated = db.prepare('SELECT id, email, role, full_name, phone, is_active, created_at FROM users WHERE id=?').get(user.id);
    res.json(updated);
  });

  app.get('/api/admin/orders', authenticate, requireRole('admin'), (req, res) => {
    const orders = db.prepare(`
      SELECT o.id, o.status, o.total_price, o.payment_status, o.payment_ref, o.created_at,
             s.name AS service_name, v.business_name, u.full_name AS customer_name
      FROM orders o JOIN services s ON s.id=o.service_id
      JOIN vendors v ON v.id=o.vendor_id JOIN users u ON u.id=o.user_id
      ORDER BY o.created_at DESC LIMIT 200
    `).all();
    res.json(orders);
  });

  app.put('/api/admin/vendors/:id/verify', authenticate, requireRole('admin'), (req, res) => {
    const { is_verified } = req.body;
    db.prepare('UPDATE vendors SET is_verified=? WHERE id=?').run(is_verified ? 1 : 0, req.params.id);
    res.json(db.prepare('SELECT * FROM vendors WHERE id=?').get(req.params.id));
  });

  // ── Catch-all SPA ──────────────────────────────────────────────────────────
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // ── Listen ─────────────────────────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log(`\n🛒  ServeHub running → http://localhost:${PORT}`);
    console.log(`    Sandbox mode: mock payment gateway active\n`);
  });
}

main().catch(err => { console.error('Startup error:', err); process.exit(1); });
