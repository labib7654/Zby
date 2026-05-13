const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join('/tmp', 'followzone.db');

let db = null;

// حفظ قاعدة البيانات للملف
function saveDB() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (e) {
    console.error('Error saving DB:', e);
  }
}

// تهيئة قاعدة البيانات
async function initDB() {
  const SQL = await initSqlJs();

  // تحميل قاعدة بيانات موجودة أو إنشاء جديدة
  if (fs.existsSync(DB_PATH)) {
    const file = fs.readFileSync(DB_PATH);
    db = new SQL.Database(file);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT DEFAULT '',
      first_name TEXT DEFAULT '',
      balance REAL DEFAULT 0,
      is_banned INTEGER DEFAULT 0,
      referrer_id INTEGER,
      join_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '📁',
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL,
      is_active INTEGER DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      service_id INTEGER,
      service_name TEXT,
      link TEXT,
      quantity INTEGER DEFAULT 1,
      price REAL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS recharge_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      amount REAL,
      method TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      details TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      max_uses INTEGER DEFAULT 1,
      used_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS coupon_uses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coupon_id INTEGER,
      user_id INTEGER,
      used_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY,
      role TEXT DEFAULT 'moderator',
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // إضافة الأدمن الرئيسي
  const adminId = parseInt(process.env.ADMIN_ID);
  if (adminId) {
    db.run(`INSERT OR IGNORE INTO admins (id, role) VALUES (${adminId}, 'owner')`);
  }

  saveDB();
  console.log('✅ Database initialized');
}

// ============ دوال مساعدة ============
function getOne(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function getAll(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function runSql(sql, params) {
  if (params) {
    db.run(sql, params);
  } else {
    db.run(sql);
  }
  saveDB();
}

function getLastId() {
  const r = getOne('SELECT last_insert_rowid() as id');
  return r ? r.id : 0;
}

// ============ المستخدمين ============
const getUser = (id) => getOne('SELECT * FROM users WHERE id = ?', [id]);
const addUser = (id, username, first_name, referrer_id) => {
  runSql('INSERT OR IGNORE INTO users (id, username, first_name, referrer_id) VALUES (?, ?, ?, ?)', [id, username || '', first_name || '', referrer_id || null]);
};
const updateBalance = (id, amount) => { runSql('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, id]); };
const setBalance = (id, amount) => { runSql('UPDATE users SET balance = ? WHERE id = ?', [amount, id]); };
const getUsersCount = () => { const r = getOne('SELECT COUNT(*) as count FROM users'); return r ? r.count : 0; };
const getAllUsers = () => getAll('SELECT * FROM users');
const banUser = (id) => { runSql('UPDATE users SET is_banned = 1 WHERE id = ?', [id]); };
const unbanUser = (id) => { runSql('UPDATE users SET is_banned = 0 WHERE id = ?', [id]); };

// ============ الأقسام ============
const getCategories = () => getAll('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order');
const getAllCategories = () => getAll('SELECT * FROM categories ORDER BY sort_order');
const addCategory = (name, emoji) => { runSql('INSERT INTO categories (name, emoji) VALUES (?, ?)', [name, emoji || '📁']); return getLastId(); };
const deleteCategory = (id) => { runSql('DELETE FROM categories WHERE id = ?', [id]); };
const getCategoryById = (id) => getOne('SELECT * FROM categories WHERE id = ?', [id]);

// ============ الخدمات ============
const getServicesByCategory = (categoryId) => getAll('SELECT * FROM services WHERE category_id = ? AND is_active = 1', [categoryId]);
const getAllServices = () => getAll('SELECT * FROM services');
const getServiceById = (id) => getOne('SELECT * FROM services WHERE id = ?', [id]);
const addService = (categoryId, name, price, description) => { runSql('INSERT INTO services (category_id, name, price, description) VALUES (?, ?, ?, ?)', [categoryId, name, price, description || '']); return getLastId(); };
const deleteService = (id) => { runSql('DELETE FROM services WHERE id = ?', [id]); };
const toggleService = (id) => {
  const s = getServiceById(id);
  if (s) runSql('UPDATE services SET is_active = ? WHERE id = ?', [s.is_active ? 0 : 1, id]);
};

// ============ الطلبات ============
const createOrder = (userId, serviceId, serviceName, link, quantity, price) => {
  runSql('INSERT INTO orders (user_id, service_id, service_name, link, quantity, price) VALUES (?, ?, ?, ?, ?, ?)', [userId, serviceId, serviceName, link, quantity, price]);
  return getLastId();
};
const getOrdersByUser = (userId) => getAll('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [userId]);
const getAllOrders = () => getAll('SELECT * FROM orders ORDER BY created_at DESC');
const getOrderById = (id) => getOne('SELECT * FROM orders WHERE id = ?', [id]);
const updateOrderStatus = (id, status) => { runSql('UPDATE orders SET status = ? WHERE id = ?', [status, id]); };
const getPendingOrders = () => getAll("SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC");

// ============ طلبات الشحن ============
const addRechargeRequest = (userId, amount, method) => {
  runSql('INSERT INTO recharge_requests (user_id, amount, method) VALUES (?, ?, ?)', [userId, amount, method]);
  return getLastId();
};
const getPendingRecharges = () => getAll("SELECT * FROM recharge_requests WHERE status = 'pending'");
const getRechargeById = (id) => getOne('SELECT * FROM recharge_requests WHERE id = ?', [id]);
const approveRecharge = (id) => { runSql("UPDATE recharge_requests SET status = 'approved' WHERE id = ?", [id]); };
const rejectRecharge = (id) => { runSql("UPDATE recharge_requests SET status = 'rejected' WHERE id = ?", [id]); };

// ============ طرق الدفع ============
const getPaymentMethods = () => getAll('SELECT * FROM payment_methods WHERE is_active = 1');
const getAllPaymentMethods = () => getAll('SELECT * FROM payment_methods');
const addPaymentMethod = (name, details) => { runSql('INSERT INTO payment_methods (name, details) VALUES (?, ?)', [name, details]); };
const deletePaymentMethod = (id) => { runSql('DELETE FROM payment_methods WHERE id = ?', [id]); };

// ============ الكوبونات ============
const getCouponByCode = (code) => getOne('SELECT * FROM coupons WHERE code = ? AND is_active = 1', [code]);
const getAllCoupons = () => getAll('SELECT * FROM coupons');
const addCoupon = (code, amount, maxUses) => { runSql('INSERT INTO coupons (code, amount, max_uses) VALUES (?, ?, ?)', [code, amount, maxUses]); };
const deleteCoupon = (id) => { runSql('DELETE FROM coupons WHERE id = ?', [id]); };
const useCoupon = (couponId, userId) => {
  runSql('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [couponId]);
  runSql('INSERT INTO coupon_uses (coupon_id, user_id) VALUES (?, ?)', [couponId, userId]);
};
const hasUsedCoupon = (couponId, userId) => getOne('SELECT * FROM coupon_uses WHERE coupon_id = ? AND user_id = ?', [couponId, userId]);

// ============ المشرفين ============
const getAdmins = () => getAll('SELECT * FROM admins');
const addAdmin = (id, role) => { runSql('INSERT OR REPLACE INTO admins (id, role) VALUES (?, ?)', [id, role || 'moderator']); };
const removeAdmin = (id) => { runSql("DELETE FROM admins WHERE id = ? AND role != 'owner'", [id]); };
const isAdmin = (id) => !!getOne('SELECT * FROM admins WHERE id = ?', [id]);

// ============ الإعدادات ============
const getSetting = (key) => { const r = getOne('SELECT value FROM settings WHERE key = ?', [key]); return r ? r.value : null; };
const setSetting = (key, value) => { runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]); };

// ============ الإحصائيات ============
const getStats = () => {
  const users = getUsersCount();
  const ordersR = getOne('SELECT COUNT(*) as count FROM orders');
  const orders = ordersR ? ordersR.count : 0;
  const revenueR = getOne('SELECT COALESCE(SUM(price), 0) as total FROM orders');
  const revenue = revenueR ? revenueR.total : 0;
  const pendingR = getOne("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
  const pending = pendingR ? pendingR.count : 0;
  return { users, orders, revenue, pending };
};

module.exports = {
  initDB,
  getUser, addUser, updateBalance, setBalance, getUsersCount, getAllUsers, banUser, unbanUser,
  getCategories, getAllCategories, addCategory, deleteCategory, getCategoryById,
  getServicesByCategory, getAllServices, getServiceById, addService, deleteService, toggleService,
  createOrder, getOrdersByUser, getAllOrders, getOrderById, updateOrderStatus, getPendingOrders,
  addRechargeRequest, getPendingRecharges, getRechargeById, approveRecharge, rejectRecharge,
  getPaymentMethods, getAllPaymentMethods, addPaymentMethod, deletePaymentMethod,
  getCouponByCode, getAllCoupons, addCoupon, deleteCoupon, useCoupon, hasUsedCoupon,
  getAdmins, addAdmin, removeAdmin, isAdmin,
  getSetting, setSetting,
  getStats,
};
