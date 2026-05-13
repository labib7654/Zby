require('dotenv').config();
const http = require('http');
const { Telegraf, session } = require('telegraf');
const { initDB } = require('./database');
const db = require('./database');
const kb = require('./keyboards');
const userHandlers = require('./handlers/user');
const adminHandlers = require('./handlers/admin');

// ============ تهيئة قاعدة البيانات ============
initDB();

// ============ إنشاء البوت ============
const bot = new Telegraf(process.env.BOT_TOKEN);

// ============ Session middleware ============
bot.use(session());

// ============ Middleware: تهيئة session + فحص الحظر ============
bot.use((ctx, next) => {
  ctx.session = ctx.session || {};
  // فحص الحظر
  if (ctx.from) {
    const user = db.getUser(ctx.from.id);
    if (user && user.is_banned) {
      if (ctx.callbackQuery) return ctx.answerCbQuery('⛔ تم حظرك من استخدام البوت.');
      return ctx.reply('⛔ تم حظرك من استخدام البوت. تواصل مع الإدارة.');
    }
  }
  return next();
});

// ============ أمر /start ============
bot.start(userHandlers.startHandler);

// ============ معالجة الأزرار النصية (Reply Keyboard) ============
bot.hears('••• الخدمات', userHandlers.showCategories);
bot.hears('🎁 طلباتي', userHandlers.myOrders);
bot.hears('💰 شحن الرصيد', userHandlers.rechargeMenu);
bot.hears('👤 حسابي', userHandlers.account);
bot.hears('👥 الإحالات', userHandlers.referral);
bot.hears('🎟 كوبون', userHandlers.couponHandler);
bot.hears('⚙️ لوحة الإدارة', adminHandlers.adminPanelHandler);

// ============ أزرار Inline - المستخدم ============
bot.action(/^cat_(\d+)$/, userHandlers.showServicesInCategory);
bot.action(/^srv_(\d+)$/, userHandlers.chooseService);
bot.action(/^pay_(\d+)$/, userHandlers.choosePaymentMethod);
bot.action('back_main', userHandlers.backMain);
bot.action('back_categories', userHandlers.backCategories);

// ============ أزرار Inline - الأدمن ============
bot.action('admin_stats', adminHandlers.statsHandler);
bot.action('admin_users', adminHandlers.usersHandler);
bot.action('admin_categories', adminHandlers.categoriesHandler);
bot.action('admin_services', adminHandlers.servicesHandler);
bot.action('admin_recharges', adminHandlers.rechargesHandler);
bot.action('admin_orders', adminHandlers.ordersHandler);
bot.action('admin_payments', adminHandlers.paymentsHandler);
bot.action('admin_moderators', adminHandlers.moderatorsHandler);
bot.action('admin_broadcast', adminHandlers.broadcastHandler);
bot.action('admin_coupons', adminHandlers.couponsHandler);
bot.action('admin_logs', adminHandlers.logsHandler);
bot.action('admin_settings', adminHandlers.settingsHandler);
bot.action('admin_back', adminHandlers.adminBackHandler);

// ============ أزرار إدارة الطلبات والشحن ============
bot.action(/^approve_(\d+)$/, adminHandlers.approveRechargeHandler);
bot.action(/^reject_(\d+)$/, adminHandlers.rejectRechargeHandler);
bot.action(/^complete_(\d+)$/, adminHandlers.completeOrderHandler);
bot.action(/^cancel_order_(\d+)$/, adminHandlers.cancelOrderHandler);

// ============ معالجة الرسائل النصية ============
bot.on('text', (ctx) => {
  // أوامر الأدمن
  if (ctx.message.text.startsWith('/') && db.isAdmin(ctx.from.id)) {
    const result = adminHandlers.handleAdminCommands(ctx);
    if (result) return result;
  }

  // إذاعة الأدمن
  if (ctx.session.step === 'admin_broadcast' && db.isAdmin(ctx.from.id)) {
    if (ctx.message.text === '/cancel') {
      ctx.session.step = null;
      return ctx.reply('تم إلغاء الإذاعة.');
    }
    return adminHandlers.handleBroadcastMessage(ctx);
  }

  // خطوات المستخدم
  return userHandlers.handleTextMessage(ctx);
});

// ============ معالجة الصور (للإذاعة) ============
bot.on('photo', (ctx) => {
  if (ctx.session.step === 'admin_broadcast' && db.isAdmin(ctx.from.id)) {
    return adminHandlers.handleBroadcastMessage(ctx);
  }
});

// ============ HTTP Server لـ Render ============
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Follow Zone Bot is running!');
}).listen(PORT, () => {
  console.log(`🌐 Health check server on port ${PORT}`);
});

// ============ تشغيل البوت ============
bot.launch()
  .then(() => console.log('✅ Follow Zone Bot is running...'))
  .catch(err => {
    console.error('❌ Failed to start bot:', err);
    process.exit(1);
  });

// ============ إيقاف آمن ============
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
