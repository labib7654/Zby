const { Markup } = require('telegraf');

// ============ كيبوردات المستخدم ============
function userMainMenu() {
  return Markup.keyboard([
    ['••• الخدمات', '🎁 طلباتي'],
    ['💰 شحن الرصيد', '👤 حسابي'],
    ['🎟 كوبون', '👥 الإحالات'],
  ]).resize();
}

function adminMainMenu() {
  return Markup.keyboard([
    ['••• الخدمات', '🎁 طلباتي'],
    ['💰 شحن الرصيد', '👤 حسابي'],
    ['🎟 كوبون', '👥 الإحالات'],
    ['⚙️ لوحة الإدارة'],
  ]).resize();
}

// ============ كيبوردات لوحة الإدارة (Inline) ============
function adminPanel() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👥 المستخدمين', 'admin_users'), Markup.button.callback('📊 الإحصائيات', 'admin_stats')],
    [Markup.button.callback('••• الخدمات', 'admin_services'), Markup.button.callback('👑 المشرفين', 'admin_moderators')],
    [Markup.button.callback('💵 طلبات الشحن', 'admin_recharges'), Markup.button.callback('📁 الأقسام', 'admin_categories')],
    [Markup.button.callback('💳 طرق الدفع', 'admin_payments'), Markup.button.callback('📦 إدارة الطلبات', 'admin_orders')],
    [Markup.button.callback('📢 إذاعة', 'admin_broadcast'), Markup.button.callback('🎟 الكوبونات', 'admin_coupons')],
    [Markup.button.callback('📜 السجلات', 'admin_logs'), Markup.button.callback('⚙️ الإعدادات', 'admin_settings')],
  ]);
}

function categoriesInline(categories) {
  const buttons = categories.map(cat => [Markup.button.callback(`${cat.emoji} ${cat.name}`, `cat_${cat.id}`)]);
  buttons.push([Markup.button.callback('🔙 رجوع', 'back_main')]);
  return Markup.inlineKeyboard(buttons);
}

function servicesInline(services) {
  const buttons = services.map(s => [Markup.button.callback(`${s.name} - ${s.price}$`, `srv_${s.id}`)]);
  buttons.push([Markup.button.callback('🔙 رجوع للأقسام', 'back_categories')]);
  return Markup.inlineKeyboard(buttons);
}

function paymentMethodsInline(methods) {
  const buttons = methods.map(m => [Markup.button.callback(m.name, `pay_${m.id}`)]);
  buttons.push([Markup.button.callback('🔙 رجوع', 'back_main')]);
  return Markup.inlineKeyboard(buttons);
}

function rechargeApproveInline(reqId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ قبول', `approve_${reqId}`), Markup.button.callback('❌ رفض', `reject_${reqId}`)],
  ]);
}

function orderManageInline(orderId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ إتمام', `complete_${orderId}`), Markup.button.callback('❌ رفض', `cancel_order_${orderId}`)],
  ]);
}

function backMainInline() {
  return Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_main')]]);
}

module.exports = {
  userMainMenu,
  adminMainMenu,
  adminPanel,
  categoriesInline,
  servicesInline,
  paymentMethodsInline,
  rechargeApproveInline,
  orderManageInline,
  backMainInline,
};
