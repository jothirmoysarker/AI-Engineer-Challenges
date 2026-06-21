const bcrypt    = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initDB } = require('./database');

async function seed() {
  console.log('Initialising database...');
  const db = await initDB();
  const NOW = new Date().toISOString();
  console.log('Seeding data...');

  const categories = [
    { name: 'Home Cleaning',     icon: '🧹', description: 'Professional cleaning services' },
    { name: 'Plumbing',          icon: '🔧', description: 'Pipe repairs and installations' },
    { name: 'Electrical',        icon: '⚡', description: 'Wiring and electrical safety' },
    { name: 'Gardening',         icon: '🌿', description: 'Lawn care and landscaping' },
    { name: 'Painting',          icon: '🎨', description: 'Interior and exterior painting' },
    { name: 'Appliance Repair',  icon: '🔨', description: 'Fix washing machines, fridges and more' },
    { name: 'Moving & Storage',  icon: '📦', description: 'Professional movers and packing' },
    { name: 'IT & Tech',         icon: '💻', description: 'Computer repair and networking' },
    { name: 'Beauty & Wellness', icon: '💆', description: 'Haircuts, massage and spa' },
    { name: 'Tutoring',          icon: '📚', description: 'Academic tutoring and skill development' },
  ];

  for (const c of categories) {
    const exists = db.prepare('SELECT id FROM categories WHERE name = ?').get(c.name);
    if (!exists) {
      db.prepare('INSERT INTO categories (name, icon, description) VALUES (?, ?, ?)').run(c.name, c.icon, c.description);
    }
  }

  const catRows = db.prepare('SELECT id, name FROM categories').all();
  const catMap  = {};
  catRows.forEach(function(r) { catMap[r.name] = r.id; });

  function createUser(email, password, role, name, phone) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return existing.id;
    const id   = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (id, email, password_hash, role, full_name, phone, created_at) VALUES (?,?,?,?,?,?,?)').run(id, email, hash, role, name, phone, NOW);
    return id;
  }

  function createVendor(email, password, name, biz, desc, catName, city, rating, rCount) {
    const uid = createUser(email, password, 'vendor', name, '+44-7700-900099');
    const existing = db.prepare('SELECT id FROM vendors WHERE user_id = ?').get(uid);
    if (existing) return existing.id;
    const vid = uuidv4();
    db.prepare('INSERT INTO vendors (id, user_id, business_name, description, category_id, city, rating, rating_count, is_verified, joined_at) VALUES (?,?,?,?,?,?,?,?,1,?)').run(vid, uid, biz, desc, catMap[catName], city, rating, rCount, NOW);
    return vid;
  }

  function svc(vid, cat, name, desc, price, unit, mins) {
    const exists = db.prepare('SELECT id FROM services WHERE vendor_id=? AND name=?').get(vid, name);
    if (exists) return;
    db.prepare('INSERT INTO services (id,vendor_id,category_id,name,description,price,price_unit,duration_min,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(uuidv4(), vid, catMap[cat], name, desc, price, unit, mins || null, NOW);
  }

  createUser('admin@marketplace.com', 'Admin@123', 'admin', 'Platform Admin', '+1-000-000-0000');
  console.log('  admin@marketplace.com / Admin@123');

  const u1 = createUser('alice@example.com', 'User@123', 'user', 'Alice Mackenzie', '+44-7700-900001');
  const u2 = createUser('bob@example.com',   'User@123', 'user', 'Bob Stewart',     '+44-7700-900002');
  console.log('  alice@example.com / User@123');
  console.log('  bob@example.com   / User@123');

  const v1 = createVendor('sparkle@vendor.com',    'Vendor@123', 'Claire Shine',  'Sparkle Home Clean',        'Award-winning cleaning with eco-friendly products.', 'Home Cleaning', 'Edinburgh', 4.8, 142);
  const v2 = createVendor('pipepro@vendor.com',    'Vendor@123', 'Duncan Pipes',  'PipePro Plumbing',          '24/7 emergency plumbing, no call-out fee before 9 pm.', 'Plumbing', 'Glasgow', 4.6, 89);
  const v3 = createVendor('volts@vendor.com',      'Vendor@123', 'Emma Watt',     'Volt and Bright Electricals','NICEIC-certified electricians for domestic work.', 'Electrical', 'Edinburgh', 4.9, 211);
  const v4 = createVendor('greenthumb@vendor.com', 'Vendor@123', 'Fraser Bloom',  'Green Thumb Gardens',       'From lawn mowing to full landscape redesign.', 'Gardening', 'Dundee', 4.7, 67);
  const v5 = createVendor('techfix@vendor.com',    'Vendor@123', 'Grace MacLeod', 'TechFix Scotland',          'Same-day laptop, PC, and smart home repair.', 'IT & Tech', 'Aberdeen', 4.5, 53);
  console.log('  5 vendor accounts created');

  svc(v1, 'Home Cleaning', 'Standard Home Clean',   'Full clean of all rooms including kitchen and bathrooms.', 65,  'fixed',  180);
  svc(v1, 'Home Cleaning', 'Deep Clean',            'Intensive top-to-bottom clean, perfect for end-of-tenancy.', 130,'fixed', 360);
  svc(v1, 'Home Cleaning', 'Regular Weekly Clean',  'Ongoing weekly home maintenance clean.',                  50,  'fixed',  120);
  svc(v1, 'Home Cleaning', 'Oven Clean',            'Professional oven degreasing and restoration.',           45,  'fixed',   90);
  svc(v2, 'Plumbing',      'Leak Detection',        'Find and fix water leaks fast.',                          80,  'hourly', null);
  svc(v2, 'Plumbing',      'Boiler Service',        'Annual boiler safety check and service.',                 120, 'fixed',   90);
  svc(v2, 'Plumbing',      'Bathroom Installation', 'Full toilet or shower unit installation.',                250, 'fixed',  240);
  svc(v2, 'Plumbing',      'Drain Unblocking',      'Clear blocked sinks, toilets and drains.',                70,  'fixed',   60);
  svc(v3, 'Electrical',    'Safety Inspection',     'Full EICR report for landlords and homeowners.',          180, 'fixed',  180);
  svc(v3, 'Electrical',    'Consumer Unit Upgrade', 'Replace old fuseboard with modern RCD unit.',             450, 'fixed',  300);
  svc(v3, 'Electrical',    'Socket Installation',   'Add or move plug sockets and light switches.',             60, 'hourly', null);
  svc(v3, 'Electrical',    'EV Charger Install',    'Home EV wall-box supply and install.',                    600, 'fixed',  240);
  svc(v4, 'Gardening',     'Lawn Mowing',           'Regular lawn care keeping your garden pristine.',          35, 'fixed',   60);
  svc(v4, 'Gardening',     'Garden Clearance',      'Remove overgrowth, weeds and garden waste.',               90, 'fixed',  180);
  svc(v4, 'Gardening',     'Hedge Trimming',        'Shape and trim hedges of all sizes.',                      55, 'fixed',   90);
  svc(v4, 'Gardening',     'Landscape Consultation','Professional advice on transforming your outdoor space.',   75, 'fixed',   60);
  svc(v5, 'IT & Tech',     'Screen Replacement',    'Genuine-spec screen fitting, same-day.',                  120, 'fixed',   60);
  svc(v5, 'IT & Tech',     'Virus Removal',         'Malware removal and PC optimisation.',                     60, 'fixed',   90);
  svc(v5, 'IT & Tech',     'Network Setup',         'Router config, Wi-Fi extenders and mesh systems.',         80, 'fixed',   90);
  svc(v5, 'IT & Tech',     'Smart Home Setup',      'Alexa and Google Home device pairing and automation.',    100, 'fixed',  120);
  console.log('  20 services created');

  const services = db.prepare('SELECT * FROM services').all();

  function makeOrder(userId, svcName, status, payStatus, payRef, daysAgo) {
    const s = services.find(function(x) { return x.name === svcName; });
    if (!s) return;
    const exists = db.prepare('SELECT id FROM orders WHERE user_id=? AND service_id=?').get(userId, s.id);
    if (exists) return;
    const dt = new Date(Date.now() - daysAgo * 86400000).toISOString();
    db.prepare('INSERT INTO orders (id,user_id,service_id,vendor_id,status,total_price,payment_status,payment_ref,scheduled_at,address,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(uuidv4(), userId, s.id, s.vendor_id, status, s.price, payStatus, payRef || null, dt, '14 Royal Mile Edinburgh', 'Eco products preferred.', NOW, NOW);
  }

  makeOrder(u1, 'Standard Home Clean', 'completed',   'paid',   'MOCK-PAY-001', 14);
  makeOrder(u1, 'Lawn Mowing',         'completed',   'paid',   'MOCK-PAY-002',  7);
  makeOrder(u1, 'Drain Unblocking',    'confirmed',   'paid',   'MOCK-PAY-003',  2);
  makeOrder(u2, 'Boiler Service',      'pending',     'unpaid', null,             1);
  makeOrder(u2, 'Virus Removal',       'in_progress', 'paid',   'MOCK-PAY-004',  3);
  console.log('  5 sample orders created');

  console.log('\nSeed complete!');
  console.log('Demo accounts:');
  console.log('  Admin  -> admin@marketplace.com  / Admin@123');
  console.log('  User   -> alice@example.com       / User@123');
  console.log('  User   -> bob@example.com         / User@123');
  console.log('  Vendor -> sparkle@vendor.com      / Vendor@123');
  console.log('  Vendor -> techfix@vendor.com      / Vendor@123');
}

seed().catch(function(err) { console.error('Seed error:', err); process.exit(1); });
