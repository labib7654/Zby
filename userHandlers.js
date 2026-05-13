const db = require('./database');
const kb = require('./keyboards');

// ============ أمر /start ============
function startHandler(ctx) {
  const userId = ctx.from.id;
  const username = ctx.from.username || '';
  const firstName = ctx.from.first_name || '';

  let referrerId = null;
  if (ctx.startPayload) {
    const ref = parseInt(ctx.startPayload);
    if (!isNaN(ref) && ref !== userId) referrerId = ref;
  }

  db.addUser(userId, username, firstName, referrerId);
  const user = db.getUser(userId);
  const isAdm = db.isAdmin(userId);

  const menu = isAdm ? kb.adminMainMenu() : kb.userMainMenu();
  return ctx.reply(
    `🟡 أهلاً بك في بوت *Follow Zone*!\n\n💰 رصيدك الحالي: ${user.balance.toFixed(2)} $`,
    { parse_mode: 'Markdown', ...menu }
  );
}

// ============ عرض الخدمات (الأقسام) ============
function showCategories(ctx) {
  const categories = db.getCategories();
  if (categories.length === 0) {
    return ctx.reply('لا توجد أقسام متاحة حالياً.');
  }
  return ctx.reply('*••• قائمة الخدمات:*\nيرجى اختيار القسم المناسب لك:', {
    parse_mode: 'Markdown',
    ...kb.categoriesInline(categories),
  });
}

// ============ عرض خدمات قسم معين ============
function showServicesInCategory(ctx) {
  const categoryId = parseInt(ctx.match[1]);
  const category = db.getCategoryById(categoryId);
  const services = db.getServicesByCategory(categoryId);

  if (services.length === 0) {
    return ctx.editMessageText('لا توجد خدمات في هذا القسم حالياً.', kb.backMainInline());
  }
  return ctx.editMessageText(`${category ? category.emoji + ' ' + category.name : 'الخدمات'}:`, kb.servicesInline(services));
}

// ============ اختيار خدمة ============
function chooseService(ctx) {
  const serviceId = parseInt(ctx.match[1]);
  const service = db.getServiceById(serviceId);
  if (!service) return ctx.answerCbQuery('الخدمة غير متوفرة');

  ctx.session.pendingOrder = { serviceId: service.id, serviceName: service.name, price: service.price };
  ctx.session.step = 'awaiting_link';

  return ctx.editMessageText(
    `📝 *${service.name}*\n💰 السعر: ${service.price}$\n\nأرسل الرابط أو المعرف المطلوب:`,
    { parse_mode: 'Markdown' }
  );
}

// ============ شحن الرصيد ============
function rechargeMenu(ctx) {
  const methods = db.getPaymentMethods();
  if (methods.length === 0) {
    return ctx.reply('لا توجد طرق دفع متاحة حالياً. تواصل مع الإدارة.');
  }
  return ctx.reply('💰 اختر طريقة الدفع:', kb.paymentMethodsInline(methods));
}

function choosePaymentMethod(ctx) {
  const methodId = parseInt(ctx.match[1]);
  const method = db.getPaymentMethods().find(m => m.id === methodId);
  if (!method) return ctx.answerCbQuery('طريقة الدفع غير متوفرة');

  ctx.session.recharge = { method: method.name };
  ctx.session.step = 'awaiting_recharge_amount';

  return ctx.editMessageText(
    `💳 *${method.name}*\n${method.details ? '📋 ' + method.details + '\n' : ''}\nأرسل المبلغ الذي تريد شحنه (بالدولار):`,
    { parse_mode: 'Markdown' }
  );
}

// ============ طلباتي ============
function myOrders(ctx) {
  const orders = db.getOrdersByUser(ctx.from.id);
  if (orders.length === 0) {
    return ctx.reply('📭 ليس لديك طلبات بعد.');
  }
  let text = '🎁 *طلباتك:*\n\n';
  orders.slice(0, 10).forEach(o => {
    const statusEmoji = o.status === 'completed' ? '✅' : o.status === 'cancelled' ? '❌' : '⏳';
    text += `${statusEmoji} #${o.id} | ${o.service_name}\n💰 ${o.price}$ | ${o.status === 'pending' ? 'قيد التنفيذ' : o.status === 'completed' ? 'مكتمل' : 'ملغي'}\n\n`;
  });
  return ctx.reply(text, { parse_mode: 'Markdown' });
}

// ============ حسابي ============
function account(ctx) {
  const user = db.getUser(ctx.from.id);
  if (!user) return ctx.reply('حدث خطأ.');
  const ordersCount = db.getOrdersByUser(ctx.from.id).length;
  return ctx.reply(
    `👤 *معلومات حسابك:*\n\n` +
    `الاسم: ${user.first_name}\n` +
    `المعرف: @${user.username || 'لا يوجد'}\n` +
    `💰 الرصيد: ${user.balance.toFixed(2)}$\n` +
    `📦 عدد الطلبات: ${ordersCount}\n` +
    `📅 تاريخ الانضمام: ${user.join_date}`,
    { parse_mode: 'Markdown' }
  );
}

// ============ الإحالات ============
function referral(ctx) {
  const userId = ctx.from.id;
  const botUsername = ctx.botInfo.username;
  const refLink = `https://t.me/${botUsername}?start=${userId}`;
  const referrals = db.getAllUsers().filter(u => u.referrer_id === userId);
  return ctx.reply(
    `🔗 *رابط الإحالة الخاص بك:*\n\`${refLink}\`\n\n👥 عدد المحالين: ${referrals.length}\n\n💡 ستحصل على 10% من قيمة أول طلب لكل شخص يسجل عبر رابطك.`,
    { parse_mode: 'Markdown' }
  );
}

// ============ كوبون ============
function couponHandler(ctx) {
  ctx.session.step = 'awaiting_coupon';
  return ctx.reply('🎟 أرسل كود الكوبون:');
}

// ============ معالجة الرسائل النصية (الخطوات) ============
function handleTextMessage(ctx) {
  const step = ctx.session.step;

  if (step === 'awaiting_link') {
    return handleOrderLink(ctx);
  } else if (step === 'awaiting_recharge_amount') {
    return handleRechargeAmount(ctx);
  } else if (step === 'awaiting_coupon') {
    return handleCouponCode(ctx);
  }
}

function handleOrderLink(ctx) {
  const text = ctx.message.text;
  if (!text) {
    return ctx.reply('يرجى إرسال رابط نصي.');
  }

  const order = ctx.session.pendingOrder;
  if (!order) {
    ctx.session.step = null;
    return ctx.reply('حدث خطأ. حاول مرة أخرى.');
  }

  const user = db.getUser(ctx.from.id);
  if (user.balance < order.price) {
    ctx.session.step = null;
    ctx.session.pendingOrder = null;
    return ctx.reply(`⚠️ رصيدك غير كافٍ.\nسعر الخدمة: ${order.price}$\nرصيدك: ${user.balance.toFixed(2)}$\n\nيرجى شحن رصيدك أولاً.`);
  }

  db.updateBalance(ctx.from.id, -order.price);
  const orderId = db.createOrder(ctx.from.id, order.serviceId, order.serviceName, text, 1, order.price);

  // مكافأة الإحالة (10% من أول طلب)
  const userOrders = db.getOrdersByUser(ctx.from.id);
  if (userOrders.length === 1 && user.referrer_id) {
    const bonus = order.price * 0.1;
    db.updateBalance(user.referrer_id, bonus);
    try {
      ctx.telegram.sendMessage(user.referrer_id, `🎉 حصلت على مكافأة إحالة بقيمة ${bonus.toFixed(2)}$ من ${user.first_name}`);
    } catch (e) {}
  }

  // إشعار الأدمن
  const adminId = process.env.ADMIN_ID;
  try {
    ctx.telegram.sendMessage(adminId,
      `📦 *طلب جديد #${orderId}*\n👤 ${user.first_name} (${ctx.from.id})\n🛒 ${order.serviceName}\n🔗 ${text}\n💰 ${order.price}$`,
      { parse_mode: 'Markdown', ...kb.orderManageInline(orderId) }
    );
  } catch (e) {}

  ctx.session.step = null;
  ctx.session.pendingOrder = null;

  return ctx.reply(
    `✅ *تم إنشاء طلبك بنجاح!*\n\n📦 رقم الطلب: #${orderId}\n🛒 الخدمة: ${order.serviceName}\n🔗 الرابط: ${text}\n💰 السعر: ${order.price}$\n⏳ الحالة: قيد التنفيذ`,
    { parse_mode: 'Markdown' }
  );
}

function handleRechargeAmount(ctx) {
  const text = ctx.message.text;
  const amount = parseFloat(text);
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('⚠️ يرجى إدخال مبلغ صحيح (رقم أكبر من 0).');
  }

  const method = ctx.session.recharge ? ctx.session.recharge.method : 'غير محدد';
  const reqId = db.addRechargeRequest(ctx.from.id, amount, method);

  // إشعار الأدمن
  const adminId = process.env.ADMIN_ID;
  const user = db.getUser(ctx.from.id);
  try {
    ctx.telegram.sendMessage(adminId,
      `💵 *طلب شحن جديد #${reqId}*\n👤 ${user.first_name} (${ctx.from.id})\n💰 المبلغ: ${amount}$\n💳 الطريقة: ${method}`,
      { parse_mode: 'Markdown', ...kb.rechargeApproveInline(reqId) }
    );
  } catch (e) {}

  ctx.session.step = null;
  ctx.session.recharge = null;

  return ctx.reply(`✅ تم إرسال طلب الشحن بمبلغ ${amount}$ للمراجعة.\nسيتم إضافة الرصيد بعد التأكيد من الإدارة.`);
}

function handleCouponCode(ctx) {
  const code = (ctx.message.text || '').trim().toUpperCase();
  if (!code) return ctx.reply('يرجى إرسال كود صحيح.');

  const coupon = db.getCouponByCode(code);
  if (!coupon) {
    ctx.session.step = null;
    return ctx.reply('❌ الكوبون غير صالح أو منتهي.');
  }
  if (coupon.used_count >= coupon.max_uses) {
    ctx.session.step = null;
    return ctx.reply('❌ هذا الكوبون وصل للحد الأقصى من الاستخدام.');
  }
  if (db.hasUsedCoupon(coupon.id, ctx.from.id)) {
    ctx.session.step = null;
    return ctx.reply('❌ لقد استخدمت هذا الكوبون مسبقاً.');
  }

  db.useCoupon(coupon.id, ctx.from.id);
  db.updateBalance(ctx.from.id, coupon.amount);
  ctx.session.step = null;

  return ctx.reply(`🎉 تم تفعيل الكوبون بنجاح!\n💰 تمت إضافة ${coupon.amount}$ لرصيدك.`);
}

// ============ أزرار الرجوع ============
function backMain(ctx) {
  const categories = db.getCategories();
  return ctx.editMessageText('🏠 الرئيسية\nاختر من القائمة أدناه:', kb.categoriesInline(categories));
}

function backCategories(ctx) {
  const categories = db.getCategories();
  if (categories.length === 0) {
    return ctx.editMessageText('لا توجد أقسام.', kb.backMainInline());
  }
  return ctx.editMessageText('*••• قائمة الخدمات:*\nيرجى اختيار القسم:', {
    parse_mode: 'Markdown',
    ...kb.categoriesInline(categories),
  });
}

module.exports = {
  startHandler,
  showCategories,
  showServicesInCategory,
  chooseService,
  rechargeMenu,
  choosePaymentMethod,
  myOrders,
  account,
  referral,
  couponHandler,
  handleTextMessage,
  backMain,
  backCategories,
};
