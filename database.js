const Database = require('better-sqlite3');
const path = require('path');

// على Render المجاني الملفات في /tmp تنمسح عند إعادة التشغيل
const dbPath = process.env.DB_PATH || path.join('/tmp', 'followzone.db');
const db = new Database(dbPath);

// تفعيل WAL mode للأداء
db.pragma('journal_mode = WAL');

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT DEFAULT '',
      first_name TEXT DEFAULT '',
      balance REAL DEFAULT 0,
      is_banned INTEGER DEFAULT 0,
      referrer_id INTEGER,
      join_date DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '📁',
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL,
      min_qty INTEGER DEFAULT 1,
      max_qty INTEGER DEFAULT 10000,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      service_id INTEGER,
      service_name TEXT,
      link TEXT,
      quantity INTEGER DEFAULT 1,
      price REAL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (service_id) REFERENCES services(id)
    );

    CREATE TABLE IF NOT EXISTS recharge_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      amount REAL,
      method TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      details TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      max_uses INTEGER DEFAULT 1,
      used_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS coupon_uses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coupon_id INTEGER,
      user_id INTEGER,
      used_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY,
      role TEXT DEFAULT 'moderator',
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // إضافة الأدمن الرئيسي
  const adminId = parseInt(process.env.ADMIN_ID);
  if (adminId) {
    db.prepare(`INSERT OR IGNORE INTO admins (id, role) VALUES (?, 'owner')`).run(adminId);
  }
}

// ============ المستخدمين ============
const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const addUser = (id, username, first_name, referrer_id) => {
  db.prepare('INSERT OR IGNORE INTO users (id, username, first_name, referrer_id) VALUES (?, ?, ?, ?)').run(id, username || '', first_name || '', referrer_id || null);
};
const updateBalance = (id, amount) => db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, id);
const setBalance = (id, amount) => db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(amount, id);
const getUsersCount = () => db.prepare('SELECT COUNT(*) as count FROM users').get().count;
const getAllUsers = () => db.prepare('SELECT * FROM users').all();
const banUser = (id) => db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(id);
const unbanUser = (id) => db.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').run(id);

// ============ الأقسام ============
const getCategories = () => db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order').all();
const getAllCategories = () => db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
const addCategory = (name, emoji) => db.prepare('INSERT INTO categories (name, emoji) VALUES (?, ?)').run(name, emoji || '📁');
const deleteCategory = (id) => db.prepare('DELETE FROM categories WHERE id = ?').run(id);
const getCategoryById = (id) => db.prepare('SELECT * FROM categories WHERE id = ?').get(id);

// ============ الخدمات ============
const getServicesByCategory = (categoryId) => db.prepare('SELECT * FROM services WHERE category_id = ? AND is_active = 1').all(categoryId);
const getAllServices = () => db.prepare('SELECT * FROM services').all();
const getServiceById = (id) => db.prepare('SELECT * FROM services WHERE id = ?').get(id);
const addService = (categoryId, name, price, description) => db.prepare('INSERT INTO services (category_id, name, price, description) VALUES (?, ?, ?, ?)').run(categoryId, name, price, description || '');
const deleteService = (id) => db.prepare('DELETE FROM services WHERE id = ?').run(id);
const toggleService = (id) => {
  const s = getServiceById(id);
  if (s) db.prepare('UPDATE services SET is_active = ? WHERE id = ?').run(s.is_active ? 0 : 1, id);
};

// ============ الطلبات ============
const createOrder = (userId, serviceId, serviceName, link, quantity, price) => {
  const info = db.prepare('INSERT INTO orders (user_id, service_id, service_name, link, quantity, price) VALUES (?, ?, ?, ?, ?, ?)').run(userId, serviceId, serviceName, link, quantity, price);
  return info.lastInsertRowid;
};
const getOrdersByUser = (userId) => db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(userId);
const getAllOrders = () => db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
const getOrderById = (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
const updateOrderStatus = (id, status) => db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
const getPendingOrders = () => db.prepare("SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC").all();

// ============ طلبات الشحن ============
const addRechargeRequest = (userId, amount, method) => {
  const info = db.prepare('INSERT INTO recharge_requests (user_id, amount, method) VALUES (?, ?, ?)').run(userId, amount, method);
  return info.lastInsertRowid;
};
const getPendingRecharges = () => db.prepare("SELECT * FROM recharge_requests WHERE status = 'pending'").all();
const getRechargeById = (id) => db.prepare('SELECT * FROM recharge_requests WHERE id = ?').get(id);
const approveRecharge = (id) => db.prepare("UPDATE recharge_requests SET status = 'approved' WHERE id = ?").run(id);
const rejectRecharge = (id) => db.prepare("UPDATE recharge_requests SET status = 'rejected' WHERE id = ?").run(id);

// ============ طرق الدفع ============
const getPaymentMethods = () => db.prepare('SELECT * FROM payment_methods WHERE is_active = 1').all();
const getAllPaymentMethods = () => db.prepare('SELECT * FROM payment_methods').all();
const addPaymentMethod = (name, details) => db.prepare('INSERT INTO payment_methods (name, details) VALUES (?, ?)').run(name, details);
const deletePaymentMethod = (id) => db.prepare('DELETE FROM payment_methods WHERE id = ?').run(id);

// ============ الكوبونات ============
const getCouponByCode = (code) => db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(code);
const getAllCoupons = () => db.prepare('SELECT * FROM coupons').all();
const addCoupon = (code, amount, maxUses) => db.prepare('INSERT INTO coupons (code, amount, max_uses) VALUES (?, ?, ?)').run(code, amount, maxUses);
const deleteCoupon = (id) => db.prepare('DELETE FROM coupons WHERE id = ?').run(id);
const useCoupon = (couponId, userId) => {
  db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(couponId);
  db.prepare('INSERT INTO coupon_uses (coupon_id, user_id) VALUES (?, ?)').run(couponId, userId);
};
const hasUsedCoupon = (couponId, userId) => db.prepare('SELECT * FROM coupon_uses WHERE coupon_id = ? AND user_id = ?').get(couponId, userId);

// ============ المشرفين ============
const getAdmins = () => db.prepare('SELECT * FROM admins').all();
const addAdmin = (id, role) => db.prepare('INSERT OR REPLACE INTO admins (id, role) VALUES (?, ?)').run(id, role || 'moderator');
const removeAdmin = (id) => db.prepare('DELETE FROM admins WHERE id = ? AND role != ?').run(id, 'owner');
const isAdmin = (id) => !!db.prepare('SELECT * FROM admins WHERE id = ?').get(id);

// ============ الإعدادات ============
const getSetting = (key) => { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key); return r ? r.value : null; };
const setSetting = (key, value) => db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);

// ============ الإحصائيات ============
const getStats = () => {
  const users = getUsersCount();
  const orders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  const revenue = db.prepare('SELECT COALESCE(SUM(price), 0) as total FROM orders').get().total;
  const pending = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").get().count;
  return { users, orders, revenue, pending };
};

module.exports = {
  initDB, db,
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
