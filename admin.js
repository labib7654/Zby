const { Markup } = require('telegraf');
const db = require('../database');
const kb = require('../keyboards');

const ADMIN_ID = parseInt(process.env.ADMIN_ID);

function isAdminCheck(ctx) {
  return db.isAdmin(ctx.from.id);
}

// ============ لوحة الإدارة ============
function adminPanelHandler(ctx) {
  if (!isAdminCheck(ctx)) return;
  return ctx.reply(
    '⚙️ *لوحة تحكم الإدارة:*\nمرحباً بك أيها المدير، ماذا تريد أن تفعل اليوم؟',
    { parse_mode: 'Markdown', ...kb.adminPanel() }
  );
}

// ============ الإحصائيات ============
function statsHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  const stats = db.getStats();
  return ctx.editMessageText(
    `📊 *الإحصائيات:*\n\n👥 المستخدمين: ${stats.users}\n📦 الطلبات: ${stats.orders}\n⏳ طلبات معلقة: ${stats.pending}\n💰 إجمالي الأرباح: ${stats.revenue.toFixed(2)}$`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]]) }
  );
}

// ============ المستخدمين ============
function usersHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  const count = db.getUsersCount();
  return ctx.editMessageText(
    `👥 *المستخدمين:*\n\nإجمالي المستخدمين: ${count}\n\nلإضافة رصيد لمستخدم أرسل:\n/addbalance [ID] [المبلغ]\n\nلحظر مستخدم:\n/ban [ID]\n\nلإلغاء الحظر:\n/unban [ID]`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]]) }
  );
}

// ============ الأقسام ============
function categoriesHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  const cats = db.getAllCategories();
  let text = '📁 *الأقسام:*\n\n';
  if (cats.length === 0) text += 'لا توجد أقسام.\n';
  cats.forEach(c => { text += `${c.emoji} ${c.name} (${c.is_active ? 'مفعل' : 'معطل'})\n`; });
  text += '\nلإضافة قسم أرسل:\n/addcat [الاسم] | [الإيموجي]\n\nلحذف قسم:\n/delcat [ID]';
  return ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]]),
  });
}

// ============ الخدمات ============
function servicesHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  const services = db.getAllServices();
  let text = '••• *الخدمات:*\n\n';
  if (services.length === 0) text += 'لا توجد خدمات.\n';
  services.slice(0, 20).forEach(s => {
    text += `#${s.id} | ${s.name} | ${s.price}$ | ${s.is_active ? '✅' : '❌'}\n`;
  });
  text += '\nلإضافة خدمة:\n/addsrv [قسم_ID] | [الاسم] | [السعر]\n\nلحذف خدمة:\n/delsrv [ID]\n\nلتفعيل/تعطيل:\n/togglesrv [ID]';
  return ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]]),
  });
}

// ============ طلبات الشحن ============
function rechargesHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  const recharges = db.getPendingRecharges();
  if (recharges.length === 0) {
    return ctx.editMessageText('لا توجد طلبات شحن معلقة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]]));
  }
  let text = '💵 *طلبات الشحن المعلقة:*\n\n';
  recharges.forEach(r => {
    text += `#${r.id} | المستخدم: ${r.user_id} | ${r.amount}$ | ${r.method}\n`;
  });
  const buttons = recharges.slice(0, 10).map(r => [
    Markup.button.callback(`✅ قبول #${r.id}`, `approve_${r.id}`),
    Markup.button.callback(`❌ رفض #${r.id}`, `reject_${r.id}`),
  ]);
  buttons.push([Markup.button.callback('🔙 رجوع', 'admin_back')]);
  return ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
}

// ============ قبول/رفض شحن ============
function approveRechargeHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  const reqId = parseInt(ctx.match[1]);
  const req = db.getRechargeById(reqId);
  if (!req || req.status !== 'pending') return ctx.answerCbQuery('الطلب غير موجود أو تمت معالجته.');

  db.approveRecharge(reqId);
  db.updateBalance(req.user_id, req.amount);

  try {
    ctx.telegram.sendMessage(req.user_id, `💰 تم شحن رصيدك بمبلغ ${req.amount}$ بنجاح.`);
  } catch (e) {}

  return ctx.editMessageText(`✅ تمت الموافقة على شحن ${req.amount}$ للمستخدم ${req.user_id}`);
}

function rejectRechargeHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  const reqId = parseInt(ctx.match[1]);
  const req = db.getRechargeById(reqId);
  if (!req) return ctx.answerCbQuery('الطلب غير موجود.');

  db.rejectRecharge(reqId);

  try {
    ctx.telegram.sendMessage(req.user_id, '❌ تم رفض طلب الشحن الخاص بك.');
  } catch (e) {}

  return ctx.editMessageText(`❌ تم رفض طلب الشحن #${reqId}`);
}

// ============ إدارة الطلبات ============
function ordersHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  const orders = db.getPendingOrders();
  if (orders.length === 0) {
    return ctx.editMessageText('لا توجد طلبات معلقة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]]));
  }
  let text = '📦 *الطلبات المعلقة:*\n\n';
  orders.slice(0, 10).forEach(o => {
    text += `#${o.id} | ${o.service_name} | ${o.price}$ | ${o.user_id}\n`;
  });
  const buttons = orders.slice(0, 10).map(o => [
    Markup.button.callback(`✅ #${o.id}`, `complete_${o.id}`),
    Markup.button.callback(`❌ #${o.id}`, `cancel_order_${o.id}`),
  ]);
  buttons.push([Markup.button.callback('🔙 رجوع', 'admin_back')]);
  return ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
}

function completeOrderHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  const orderId = parseInt(ctx.match[1]);
  const order = db.getOrderById(orderId);
  if (!order) return ctx.answerCbQuery('الطلب غير موجود.');

  db.updateOrderStatus(orderId, 'completed');
  try {
    ctx.telegram.sendMessage(order.user_id, `✅ تم إتمام طلبك رقم #${orderId} بنجاح!`);
  } catch (e) {}
  return ctx.answerCbQuery('تم إتمام الطلب ✅');
}

function cancelOrderHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  const orderId = parseInt(ctx.match[1]);
  const order = db.getOrderById(orderId);
  if (!order) return ctx.answerCbQuery('الطلب غير موجود.');

  db.updateOrderStatus(orderId, 'cancelled');
  // إرجاع المبلغ
  db.updateBalance(order.user_id, order.price);
  try {
    ctx.telegram.sendMessage(order.user_id, `❌ تم إلغاء طلبك رقم #${orderId} وتم إرجاع ${order.price}$ لرصيدك.`);
  } catch (e) {}
  return ctx.answerCbQuery('تم إلغاء الطلب وإرجاع المبلغ ❌');
}

// ============ طرق الدفع ============
function paymentsHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  const methods = db.getAllPaymentMethods();
  let text = '💳 *طرق الدفع:*\n\n';
  if (methods.length === 0) text += 'لا توجد طرق دفع.\n';
  methods.forEach(m => { text += `#${m.id} | ${m.name} | ${m.is_active ? '✅' : '❌'}\n`; });
  text += '\nلإضافة طريقة دفع:\n/addpay [الاسم] | [التفاصيل]\n\nلحذف طريقة:\n/delpay [ID]';
  return ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]]),
  });
}

// ============ المشرفين ============
function moderatorsHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  const admins = db.getAdmins();
  let text = '👑 *المشرفين:*\n\n';
  admins.forEach(a => { text += `${a.id} | ${a.role}\n`; });
  text += '\nلإضافة مشرف:\n/addmod [ID]\n\nلحذف مشرف:\n/delmod [ID]';
  return ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]]),
  });
}

// ============ الإذاعة ============
function broadcastHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  ctx.session.step = 'admin_broadcast';
  return ctx.editMessageText('📢 أرسل الرسالة التي تريد إرسالها لجميع المستخدمين:\n\n(أرسل /cancel للإلغاء)');
}

async function handleBroadcastMessage(ctx) {
  const users = db.getAllUsers();
  let sent = 0;
  for (const user of users) {
    try {
      await ctx.telegram.copyMessage(user.id, ctx.chat.id, ctx.message.message_id);
      sent++;
    } catch (e) {}
  }
  ctx.session.step = null;
  return ctx.reply(`✅ تم إرسال الإذاعة لـ ${sent}/${users.length} مستخدم.`);
}

// ============ الكوبونات ============
function couponsHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  const coupons = db.getAllCoupons();
  let text = '🎟 *الكوبونات:*\n\n';
  if (coupons.length === 0) text += 'لا توجد كوبونات.\n';
  coupons.forEach(c => {
    text += `${c.code} | ${c.amount}$ | ${c.used_count}/${c.max_uses} | ${c.is_active ? '✅' : '❌'}\n`;
  });
  text += '\nلإضافة كوبون:\n/addcoupon [الكود] | [المبلغ] | [عدد الاستخدامات]\n\nلحذف كوبون:\n/delcoupon [ID]';
  return ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]]),
  });
}

// ============ السجلات ============
function logsHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  const orders = db.getAllOrders().slice(0, 10);
  let text = '📜 *آخر العمليات:*\n\n';
  if (orders.length === 0) text += 'لا توجد عمليات.';
  orders.forEach(o => {
    text += `#${o.id} | ${o.service_name} | ${o.status} | ${o.created_at}\n`;
  });
  return ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]]),
  });
}

// ============ الإعدادات ============
function settingsHandler(ctx) {
  if (!isAdminCheck(ctx)) return ctx.answerCbQuery('غير مصرح');
  return ctx.editMessageText(
    '⚙️ *الإعدادات:*\n\nالإعدادات المتاحة:\n/setdev [نص] - تعيين نص زر المطور\n/setwelcome [نص] - تعيين رسالة الترحيب',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]]) }
  );
}

// ============ رجوع للوحة الإدارة ============
function adminBackHandler(ctx) {
  return ctx.editMessageText(
    '⚙️ *لوحة تحكم الإدارة:*\nمرحباً بك أيها المدير، ماذا تريد أن تفعل اليوم؟',
    { parse_mode: 'Markdown', ...kb.adminPanel() }
  );
}

// ============ أوامر الأدمن النصية ============
function handleAdminCommands(ctx) {
  if (!isAdminCheck(ctx)) return false;
  const text = ctx.message.text || '';

  if (text.startsWith('/addcat ')) {
    const parts = text.replace('/addcat ', '').split('|').map(s => s.trim());
    const name = parts[0];
    const emoji = parts[1] || '📁';
    if (!name) return ctx.reply('الصيغة: /addcat الاسم | الإيموجي');
    db.addCategory(name, emoji);
    return ctx.reply(`✅ تم إضافة القسم: ${emoji} ${name}`);
  }

  if (text.startsWith('/delcat ')) {
    const id = parseInt(text.replace('/delcat ', ''));
    if (isNaN(id)) return ctx.reply('أرسل ID صحيح.');
    db.deleteCategory(id);
    return ctx.reply('✅ تم حذف القسم.');
  }

  if (text.startsWith('/addsrv ')) {
    const parts = text.replace('/addsrv ', '').split('|').map(s => s.trim());
    if (parts.length < 3) return ctx.reply('الصيغة: /addsrv قسم_ID | الاسم | السعر');
    const catId = parseInt(parts[0]);
    const name = parts[1];
    const price = parseFloat(parts[2]);
    if (isNaN(catId) || !name || isNaN(price)) return ctx.reply('بيانات غير صحيحة.');
    db.addService(catId, name, price, '');
    return ctx.reply(`✅ تم إضافة الخدمة: ${name} - ${price}$`);
  }

  if (text.startsWith('/delsrv ')) {
    const id = parseInt(text.replace('/delsrv ', ''));
    if (isNaN(id)) return ctx.reply('أرسل ID صحيح.');
    db.deleteService(id);
    return ctx.reply('✅ تم حذف الخدمة.');
  }

  if (text.startsWith('/togglesrv ')) {
    const id = parseInt(text.replace('/togglesrv ', ''));
    if (isNaN(id)) return ctx.reply('أرسل ID صحيح.');
    db.toggleService(id);
    return ctx.reply('✅ تم تغيير حالة الخدمة.');
  }

  if (text.startsWith('/addpay ')) {
    const parts = text.replace('/addpay ', '').split('|').map(s => s.trim());
    const name = parts[0];
    const details = parts[1] || '';
    if (!name) return ctx.reply('الصيغة: /addpay الاسم | التفاصيل');
    db.addPaymentMethod(name, details);
    return ctx.reply(`✅ تم إضافة طريقة الدفع: ${name}`);
  }

  if (text.startsWith('/delpay ')) {
    const id = parseInt(text.replace('/delpay ', ''));
    if (isNaN(id)) return ctx.reply('أرسل ID صحيح.');
    db.deletePaymentMethod(id);
    return ctx.reply('✅ تم حذف طريقة الدفع.');
  }

  if (text.startsWith('/addbalance ')) {
    const parts = text.replace('/addbalance ', '').split(' ');
    const userId = parseInt(parts[0]);
    const amount = parseFloat(parts[1]);
    if (isNaN(userId) || isNaN(amount)) return ctx.reply('الصيغة: /addbalance [ID] [المبلغ]');
    db.updateBalance(userId, amount);
    try { ctx.telegram.sendMessage(userId, `💰 تمت إضافة ${amount}$ لرصيدك من قبل الإدارة.`); } catch (e) {}
    return ctx.reply(`✅ تم إضافة ${amount}$ لرصيد المستخدم ${userId}`);
  }

  if (text.startsWith('/ban ')) {
    const userId = parseInt(text.replace('/ban ', ''));
    if (isNaN(userId)) return ctx.reply('أرسل ID صحيح.');
    db.banUser(userId);
    return ctx.reply(`✅ تم حظر المستخدم ${userId}`);
  }

  if (text.startsWith('/unban ')) {
    const userId = parseInt(text.replace('/unban ', ''));
    if (isNaN(userId)) return ctx.reply('أرسل ID صحيح.');
    db.unbanUser(userId);
    return ctx.reply(`✅ تم إلغاء حظر المستخدم ${userId}`);
  }

  if (text.startsWith('/addmod ')) {
    const userId = parseInt(text.replace('/addmod ', ''));
    if (isNaN(userId)) return ctx.reply('أرسل ID صحيح.');
    db.addAdmin(userId, 'moderator');
    return ctx.reply(`✅ تم إضافة المشرف ${userId}`);
  }

  if (text.startsWith('/delmod ')) {
    const userId = parseInt(text.replace('/delmod ', ''));
    if (isNaN(userId)) return ctx.reply('أرسل ID صحيح.');
    db.removeAdmin(userId);
    return ctx.reply(`✅ تم حذف المشرف ${userId}`);
  }

  if (text.startsWith('/addcoupon ')) {
    const parts = text.replace('/addcoupon ', '').split('|').map(s => s.trim());
    if (parts.length < 3) return ctx.reply('الصيغة: /addcoupon الكود | المبلغ | عدد_الاستخدامات');
    const code = parts[0].toUpperCase();
    const amount = parseFloat(parts[1]);
    const maxUses = parseInt(parts[2]);
    if (!code || isNaN(amount) || isNaN(maxUses)) return ctx.reply('بيانات غير صحيحة.');
    db.addCoupon(code, amount, maxUses);
    return ctx.reply(`✅ تم إضافة الكوبون: ${code} - ${amount}$ - ${maxUses} استخدام`);
  }

  if (text.startsWith('/delcoupon ')) {
    const id = parseInt(text.replace('/delcoupon ', ''));
    if (isNaN(id)) return ctx.reply('أرسل ID صحيح.');
    db.deleteCoupon(id);
    return ctx.reply('✅ تم حذف الكوبون.');
  }

  if (text === '/cancel') {
    ctx.session.step = null;
    return ctx.reply('تم الإلغاء.');
  }

  return false;
}

module.exports = {
  adminPanelHandler,
  statsHandler,
  usersHandler,
  categoriesHandler,
  servicesHandler,
  rechargesHandler,
  approveRechargeHandler,
  rejectRechargeHandler,
  ordersHandler,
  completeOrderHandler,
  cancelOrderHandler,
  paymentsHandler,
  moderatorsHandler,
  broadcastHandler,
  handleBroadcastMessage,
  couponsHandler,
  logsHandler,
  settingsHandler,
  adminBackHandler,
  handleAdminCommands,
};
