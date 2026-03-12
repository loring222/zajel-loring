// ╔══════════════════════════════════════════════════════════════╗
// ║                    🕊️  بوت الزاجل                          ║
// ║                     discord.js v14                          ║
// ╚══════════════════════════════════════════════════════════════╝

const {
  Client, GatewayIntentBits, Partials,
  EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, Events,
} = require("discord.js");

const fs   = require("fs");
const path = require("path");
const http = require("http");
require("dotenv").config();

// ═══════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════
const TOKEN = process.env.DISCORD_TOKEN;

const DEFAULT_CONFIG = {
  logChannelId:    process.env.LOG_CHANNEL_ID    || "",
  publicChannelId: process.env.PUBLIC_CHANNEL_ID || "",
  panelChannelId:  process.env.PANEL_CHANNEL_ID  || "",
  embedColor:      "0x5865F2",
  panelTitle:      "🕊️ بوت الزاجل",
  panelDesc:       "اضغط على الزر أدناه لإرسال رسالتك 👇",
};

// ═══════════════════════════════════════════════════════════════
//  JSON STORE
// ═══════════════════════════════════════════════════════════════
const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ config: DEFAULT_CONFIG, bans: {}, sessions: {} }, null, 2));
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  if (!data.sessions) data.sessions = {};
  return data;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getConfig()                { return loadData().config; }
function updateConfig(key, value)   { const d = loadData(); d.config[key] = value; saveData(d); }
function getBans()                  { return loadData().bans; }
function addBan(uid, info)          { const d = loadData(); d.bans[uid] = info; saveData(d); }
function removeBan(uid)             { const d = loadData(); delete d.bans[uid]; saveData(d); }
function getSession(uid)            { return loadData().sessions[uid] || null; }
function setSession(uid, data)      { const d = loadData(); d.sessions[uid] = data; saveData(d); }
function clearSession(uid)          { const d = loadData(); delete d.sessions[uid]; saveData(d); }

function isBanned(uid) {
  const b = getBans()[uid];
  if (!b) return false;
  if (b.until === "permanent") return true;
  if (Date.now() < b.until) return true;
  removeBan(uid);
  return false;
}

function parseDuration(str) {
  if (!str || str === "permanent") return "permanent";
  const m = str.match(/^(\d+)(h|d|w)$/);
  if (!m) return null;
  return Date.now() + parseInt(m[1]) * { h: 3600000, d: 86400000, w: 604800000 }[m[2]];
}

function formatDuration(until) {
  if (until === "permanent") return "دائم ♾️";
  const diff = until - Date.now();
  if (diff <= 0) return "انتهى";
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d} يوم` : `${h} ساعة`;
}

// ═══════════════════════════════════════════════════════════════
//  CLIENT
// ═══════════════════════════════════════════════════════════════
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

// ═══════════════════════════════════════════════════════════════
//  COLORS
// ═══════════════════════════════════════════════════════════════
const C = {
  main:     0x5865F2,
  dm:       0x57F287,
  log:      0xFEE75C,
  delete:   0xED4245,
  edit:     0xEB459E,
  join:     0x57F287,
  leave:    0xED4245,
  ban:      0xFF0000,
  unban:    0x00FF99,
  warn:     0xFF8800,
};

// ═══════════════════════════════════════════════════════════════
//  LOG HELPER
// ═══════════════════════════════════════════════════════════════
async function log(guild, title, user, fields = [], color = C.log) {
  const cfg = getConfig();
  const ch  = guild?.channels?.cache?.get(cfg.logChannelId);
  if (!ch) return;

  const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();

  if (user) {
    embed.setAuthor({ name: user.tag ?? String(user), iconURL: user.displayAvatarURL?.() });
    embed.addFields({ name: "👤 المستخدم", value: `<@${user.id}> (\`${user.id}\`)`, inline: true });
  }

  for (const f of fields) {
    embed.addFields({ name: f.name, value: String(f.value || "—").slice(0, 1024), inline: !!f.inline });
  }

  await ch.send({ embeds: [embed] }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
//  BUILD: PANEL
// ═══════════════════════════════════════════════════════════════
function buildPanel() {
  const cfg   = getConfig();
  const color = parseInt(cfg.embedColor) || C.main;

  const embed = new EmbedBuilder()
    .setTitle(cfg.panelTitle)
    .setDescription(cfg.panelDesc)
    .setColor(color)
    .setFooter({ text: "🕊️ بوت الزاجل — رسائلك تصل" })
    .setTimestamp();

  const btn = new ButtonBuilder()
    .setCustomId("start_pigeon")
    .setLabel("📬 أرسل رسالة")
    .setStyle(ButtonStyle.Primary);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] };
}

// ═══════════════════════════════════════════════════════════════
//  BUILD: DM WELCOME
// ═══════════════════════════════════════════════════════════════
function buildWelcomeDM(user, guildName) {
  const embed = new EmbedBuilder()
    .setTitle("🕊️ أهلاً بك في بوت الزاجل")
    .setDescription(
      `مرحباً **${user.displayName}** 👋\n\n` +
      `بوت الزاجل يخليك ترسل رسائلك بشكل مرتب وأنيق من سيرفر **${guildName}**.\n\n` +
      `**وش تبي ترسل؟**\n` +
      `اختر من القائمة أدناه 👇`
    )
    .setColor(C.main)
    .setFooter({ text: "🕊️ بوت الزاجل" })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId("dm_type_select")
    .setPlaceholder("اختر نوع رسالتك...")
    .addOptions([
      { label: "📝 نص فقط",              description: "رسالة نصية",                    value: "text",  emoji: "📝" },
      { label: "🖼️ صورة",                description: "صورة مع نص اختياري",            value: "image", emoji: "🖼️" },
      { label: "🎬 فيديو",               description: "فيديو مع نص اختياري",           value: "video", emoji: "🎬" },
      { label: "🎙️ رسالة صوتية",         description: "صوتية مع نص اختياري",           value: "voice", emoji: "🎙️" },
      { label: "📦 كل شي",              description: "نص + ملف بنفس الوقت",            value: "all",   emoji: "📦" },
    ]);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

// ═══════════════════════════════════════════════════════════════
//  BUILD: ASK CONTENT (بعد اختيار النوع)
// ═══════════════════════════════════════════════════════════════
function buildAskContent(type) {
  const map = {
    text:  { title: "📝 اكتب رسالتك",         desc: "أرسل رسالتك النصية هنا وأنا بأنقلها 👇" },
    image: { title: "🖼️ أرسل الصورة",          desc: "أرسل الصورة مباشرة هنا (مع نص اختياري) 👇" },
    video: { title: "🎬 أرسل الفيديو",          desc: "أرسل الفيديو مباشرة هنا (مع نص اختياري) 👇" },
    voice: { title: "🎙️ أرسل الرسالة الصوتية", desc: "أرسل الملف الصوتي مباشرة هنا (مع نص اختياري) 👇" },
    all:   { title: "📦 أرسل رسالتك + الملف",  desc: "أرسل رسالتك النصية أولاً، أو أرسل الملف مع نص 👇" },
  };

  const info = map[type];
  const embed = new EmbedBuilder()
    .setTitle(info.title)
    .setDescription(info.desc)
    .setColor(C.main)
    .setFooter({ text: "عندك 3 دقائق للرد • 🕊️ بوت الزاجل" });

  const cancelBtn = new ButtonBuilder()
    .setCustomId("cancel_session")
    .setLabel("❌ إلغاء")
    .setStyle(ButtonStyle.Danger);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(cancelBtn)] };
}

// ═══════════════════════════════════════════════════════════════
//  BUILD: ASK DESTINATION (عام ولا خاص)
// ═══════════════════════════════════════════════════════════════
function buildAskDestination() {
  const embed = new EmbedBuilder()
    .setTitle("📮 وين تبي ترسل؟")
    .setDescription("اختر وجهة رسالتك 👇")
    .setColor(C.main)
    .setFooter({ text: "🕊️ بوت الزاجل" });

  const publicBtn = new ButtonBuilder()
    .setCustomId("send_public")
    .setLabel("📢 إرسال للعام")
    .setStyle(ButtonStyle.Primary);

  const privateBtn = new ButtonBuilder()
    .setCustomId("send_private")
    .setLabel("🔒 إرسال لخاصي")
    .setStyle(ButtonStyle.Secondary);

  const cancelBtn = new ButtonBuilder()
    .setCustomId("cancel_session")
    .setLabel("❌ إلغاء")
    .setStyle(ButtonStyle.Danger);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(publicBtn, privateBtn, cancelBtn)],
  };
}

// ═══════════════════════════════════════════════════════════════
//  BUILD: FINAL EMBED (الرسالة النهائية)
// ═══════════════════════════════════════════════════════════════
function buildFinalEmbed(user, session, isPublic) {
  const cfg   = getConfig();
  const color = parseInt(cfg.embedColor) || C.main;
  const type  = session.type;

  const typeLabels = {
    text:  "📝 رسالة نصية",
    image: "🖼️ صورة",
    video: "🎬 فيديو",
    voice: "🎙️ صوتية",
    all:   "📦 رسالة + ملف",
  };

  const embed = new EmbedBuilder()
    .setAuthor({ name: user.displayName, iconURL: user.displayAvatarURL() })
    .setColor(color)
    .setFooter({ text: `${typeLabels[type]} • ${isPublic ? "📢 عام" : "🔒 خاص"} • 🕊️ بوت الزاجل` })
    .setTimestamp();

  if (session.text) embed.setDescription(session.text);

  if (session.fileUrl) {
    if (type === "image") embed.setImage(session.fileUrl);
    else embed.addFields({ name: "📎 مرفق", value: `[اضغط هنا](${session.fileUrl})`, inline: false });
  }

  return embed;
}

// ═══════════════════════════════════════════════════════════════
//  BUILD: SETTINGS PANEL
// ═══════════════════════════════════════════════════════════════
function buildSettingsPanel() {
  const cfg = getConfig();

  const embed = new EmbedBuilder()
    .setTitle("⚙️ إعدادات بوت الزاجل")
    .setColor(C.main)
    .addFields(
      { name: "📋 قناة اللوق",      value: cfg.logChannelId    ? `<#${cfg.logChannelId}>`    : "غير محددة", inline: true },
      { name: "📢 القناة العامة",   value: cfg.publicChannelId ? `<#${cfg.publicChannelId}>` : "غير محددة", inline: true },
      { name: "📌 قناة البانل",     value: cfg.panelChannelId  ? `<#${cfg.panelChannelId}>`  : "غير محددة", inline: true },
      { name: "🎨 لون الـ Embed",   value: cfg.embedColor,      inline: true },
      { name: "📝 عنوان البانل",    value: cfg.panelTitle,      inline: false },
      { name: "💬 وصف البانل",      value: cfg.panelDesc,       inline: false },
    )
    .setFooter({ text: "اختر الإعداد من القائمة" })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId("settings_menu")
    .setPlaceholder("🔧 اختر الإعداد...")
    .addOptions([
      { label: "📋 قناة اللوق",      value: "set_log",    emoji: "📋" },
      { label: "📢 القناة العامة",   value: "set_public", emoji: "📢" },
      { label: "📌 قناة البانل",     value: "set_panel",  emoji: "📌" },
      { label: "🎨 لون الـ Embed",   value: "set_color",  emoji: "🎨" },
      { label: "📝 عنوان البانل",    value: "set_title",  emoji: "📝" },
      { label: "💬 وصف البانل",      value: "set_desc",   emoji: "💬" },
    ]);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true };
}

// ═══════════════════════════════════════════════════════════════
//  BUILD: COMMANDS
// ═══════════════════════════════════════════════════════════════
function buildCommandsPanel() {
  const embed = new EmbedBuilder()
    .setTitle("📖 أوامر بوت الزاجل")
    .setColor(C.main)
    .addFields(
      { name: "━━━━━━━━━━ 👑 أوامر الأدمن ━━━━━━━━━━", value: "\u200b" },
      { name: "`!setup_panel`",           value: "ينشر رسالة البانل في القناة" },
      { name: "`!settings`",              value: "يفتح لوحة الإعدادات" },
      { name: "`!commands`",              value: "يعرض هذه القائمة" },
      { name: "`!ban @عضو [مدة] [سبب]`", value: "يحظر عضو من البوت\n**المدة:** `1h` `1d` `7d` `permanent`" },
      { name: "`!unban @عضو`",            value: "يفك الحظر عن عضو" },
      { name: "`!bans`",                  value: "قائمة المحظورين" },
      { name: "━━━━━━━━━━ 👥 للأعضاء ━━━━━━━━━━", value: "\u200b" },
      { name: "البانل",                   value: "اضغط الزر ← يجيك DM ← تختار النوع ← ترسل ← تختار عام أو خاص" },
      { name: "━━━━━━━━━━ 👁️ اللوق التلقائي ━━━━━━━━━━", value: "\u200b" },
      { name: "تلقائي",                  value: "📩 رسائل • ✏️ تعديل • 🗑️ حذف • ✅ دخول • 👋 خروج • 🚫 حظر" },
    )
    .setFooter({ text: "🕊️ بوت الزاجل" })
    .setTimestamp();

  return { embeds: [embed], ephemeral: true };
}

// ═══════════════════════════════════════════════════════════════
//  READY
// ═══════════════════════════════════════════════════════════════
client.once(Events.ClientReady, () => {
  console.log(`✅ البوت شغّال: ${client.user.tag}`);
});

// ═══════════════════════════════════════════════════════════════
//  MESSAGE CREATE
// ═══════════════════════════════════════════════════════════════
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return;

  // ── DM: استقبال المحتوى من الجلسة ──
  if (!msg.guild) {
    const session = getSession(msg.author.id);
    if (!session || session.step !== "waiting_content") return;

    // نجمع النص والملف
    const text      = msg.content?.trim() || "";
    const attachment = msg.attachments?.first();
    const fileUrl   = attachment?.url || null;

    // تحقق إن المحتوى يناسب النوع المختار
    if (session.type === "text" && !text) {
      return msg.reply("❌ أرسل رسالة نصية.");
    }
    if (["image","video","voice"].includes(session.type) && !fileUrl && !text) {
      return msg.reply("❌ أرسل ملف أو نص على الأقل.");
    }

    // حفظ المحتوى وانتقل لخطوة الوجهة
    setSession(msg.author.id, {
      ...session,
      step:    "waiting_destination",
      text:    text || null,
      fileUrl: fileUrl || null,
    });

    await msg.reply(buildAskDestination());
    return;
  }

  // ── السيرفر: لوق كل رسالة ──
  const logFields = [
    { name: "💬 المحتوى", value: msg.content || "لا يوجد نص", inline: false },
    { name: "📍 القناة",  value: `<#${msg.channel.id}>`,       inline: true  },
  ];
  if (msg.attachments.size > 0) {
    const list = [...msg.attachments.values()].map(a => `[${a.name}](${a.url})`).join("\n");
    logFields.push({ name: "📎 مرفقات", value: list, inline: false });
  }
  await log(msg.guild, "📩 رسالة جديدة", msg.author, logFields, C.log);

  const isAdmin = msg.member?.permissions.has(PermissionFlagsBits.Administrator);
  const content = msg.content.trim();

  // ── !setup_panel ──
  if (content === "!setup_panel") {
    if (!isAdmin) return msg.reply("❌ للأدمن فقط.");
    await msg.channel.send(buildPanel());
    await msg.delete().catch(() => {});
    return;
  }

  // ── !settings ──
  if (content === "!settings") {
    if (!isAdmin) return msg.reply("❌ للأدمن فقط.");
    await msg.reply(buildSettingsPanel());
    await msg.delete().catch(() => {});
    return;
  }

  // ── !commands ──
  if (content === "!commands") {
    await msg.reply(buildCommandsPanel());
    await msg.delete().catch(() => {});
    return;
  }

  // ── !ban ──
  if (content.startsWith("!ban ")) {
    if (!isAdmin) return msg.reply("❌ للأدمن فقط.");
    const target = msg.mentions.users.first();
    if (!target) return msg.reply("❌ حدد عضو. مثال: `!ban @علي 1d سبب`");

    const afterMention = content.replace(/^!ban\s+<@!?\d+>\s*/, "");
    const parts        = afterMention.split(" ");
    const rawDur       = parts[0] || "permanent";
    const reason       = parts.slice(1).join(" ") || "لا يوجد سبب";
    const until        = parseDuration(rawDur);
    if (until === null) return msg.reply("❌ مدة خاطئة. استخدم: `1h` `1d` `7d` `permanent`");

    if (!isBanned(target.id)) {
      await target.send({ embeds: [new EmbedBuilder()
        .setTitle("⚠️ تحذير — بوت الزاجل")
        .setDescription(`تلقيت **تحذيراً** في سيرفر **${msg.guild.name}**\n\n**السبب:** ${reason}`)
        .setColor(C.warn).setTimestamp()
      ]}).catch(() => {});
    }

    addBan(target.id, { until, reason, bannedBy: msg.author.id, at: Date.now() });

    await target.send({ embeds: [new EmbedBuilder()
      .setTitle("🚫 تم حظرك من بوت الزاجل")
      .setDescription(`**السيرفر:** ${msg.guild.name}\n**السبب:** ${reason}\n**المدة:** ${formatDuration(until)}`)
      .setColor(C.ban).setTimestamp()
    ]}).catch(() => {});

    await msg.reply({ embeds: [new EmbedBuilder()
      .setTitle("🚫 تم الحظر")
      .setDescription(`<@${target.id}> محظور من البوت`)
      .addFields(
        { name: "السبب", value: reason,                inline: true },
        { name: "المدة", value: formatDuration(until), inline: true },
      ).setColor(C.ban).setTimestamp()
    ]});

    await log(msg.guild, "🚫 حظر من البوت", target, [
      { name: "السبب",  value: reason,                inline: false },
      { name: "المدة",  value: formatDuration(until), inline: true  },
      { name: "بواسطة", value: `<@${msg.author.id}>`, inline: true  },
    ], C.ban);
    return;
  }

  // ── !unban ──
  if (content.startsWith("!unban ")) {
    if (!isAdmin) return msg.reply("❌ للأدمن فقط.");
    const target = msg.mentions.users.first();
    if (!target) return msg.reply("❌ حدد عضو.");
    if (!getBans()[target.id]) return msg.reply("⚠️ هذا العضو غير محظور.");

    removeBan(target.id);

    await target.send({ embeds: [new EmbedBuilder()
      .setTitle("✅ تم رفع الحظر عنك")
      .setDescription(`يمكنك الآن استخدام البوت في **${msg.guild.name}**`)
      .setColor(C.unban).setTimestamp()
    ]}).catch(() => {});

    await msg.reply({ embeds: [new EmbedBuilder()
      .setTitle("✅ تم فك الحظر")
      .setDescription(`تم رفع الحظر عن <@${target.id}>`)
      .setColor(C.unban).setTimestamp()
    ]});

    await log(msg.guild, "✅ فك حظر", target, [
      { name: "بواسطة", value: `<@${msg.author.id}>`, inline: true },
    ], C.unban);
    return;
  }

  // ── !bans ──
  if (content === "!bans") {
    if (!isAdmin) return msg.reply("❌ للأدمن فقط.");
    const bans = getBans();
    const list = Object.entries(bans);
    if (list.length === 0) {
      return msg.reply({ embeds: [new EmbedBuilder().setTitle("📋 المحظورين").setDescription("لا يوجد محظورين ✅").setColor(C.unban)] });
    }
    const lines = list.map(([id, info]) => `${isBanned(id) ? "🚫" : "✅"} <@${id}> — ${formatDuration(info.until)} — ${info.reason}`).join("\n");
    await msg.reply({ embeds: [new EmbedBuilder().setTitle(`📋 المحظورين (${list.length})`).setDescription(lines).setColor(C.ban).setTimestamp()] });
    await msg.delete().catch(() => {});
    return;
  }
});

// ═══════════════════════════════════════════════════════════════
//  INTERACTIONS
// ═══════════════════════════════════════════════════════════════
client.on(Events.InteractionCreate, async (interaction) => {

  // ── زر: ابدأ الإرسال (البانل) ──
  if (interaction.isButton() && interaction.customId === "start_pigeon") {

    if (isBanned(interaction.user.id)) {
      const info = getBans()[interaction.user.id];
      return interaction.reply({
        content: `🚫 أنت محظور من البوت.\n**السبب:** ${info?.reason || "—"}\n**المتبقي:** ${formatDuration(info?.until)}`,
        ephemeral: true,
      });
    }

    try {
      await interaction.user.send(buildWelcomeDM(interaction.user, interaction.guild.name));
      await interaction.reply({ content: "✅ راجع رسائلك الخاصة!", ephemeral: true });
    } catch {
      await interaction.reply({ content: "❌ ما قدرت أرسل لك DM، فعّل رسائل السيرفر.", ephemeral: true });
    }
    return;
  }

  // ── زر: إلغاء الجلسة ──
  if (interaction.isButton() && interaction.customId === "cancel_session") {
    clearSession(interaction.user.id);
    await interaction.update({ content: "❌ تم إلغاء العملية.", embeds: [], components: [] });
    return;
  }

  // ── زر: إرسال للعام ──
  if (interaction.isButton() && interaction.customId === "send_public") {
    const session = getSession(interaction.user.id);
    if (!session) return interaction.update({ content: "❌ انتهت الجلسة، ابدأ من جديد.", embeds: [], components: [] });

    const cfg = getConfig();
    // نحتاج نجيب الـ guild من السيرفر المحفوظ في الجلسة
    const guild = client.guilds.cache.get(session.guildId);
    const ch    = guild?.channels?.cache?.get(cfg.publicChannelId);

    if (!ch) {
      clearSession(interaction.user.id);
      return interaction.update({ content: "❌ قناة العام غير محددة، تواصل مع الأدمن.", embeds: [], components: [] });
    }

    const embed = buildFinalEmbed(interaction.user, session, true);

    // لو الملف موجود نرسله مع الـ embed
    if (session.fileUrl) {
      await ch.send({ embeds: [embed], files: [session.fileUrl] }).catch(() => ch.send({ embeds: [embed] }));
    } else {
      await ch.send({ embeds: [embed] });
    }

    clearSession(interaction.user.id);
    await interaction.update({ content: "✅ تم إرسال رسالتك للعام! 📢", embeds: [], components: [] });

    await log(guild, "📢 رسالة عامة جديدة", interaction.user, [
      { name: "النوع",    value: session.type,          inline: true  },
      { name: "النص",     value: session.text   || "—", inline: false },
      { name: "الملف",    value: session.fileUrl || "—", inline: false },
    ], C.main);
    return;
  }

  // ── زر: إرسال لخاصي ──
  if (interaction.isButton() && interaction.customId === "send_private") {
    const session = getSession(interaction.user.id);
    if (!session) return interaction.update({ content: "❌ انتهت الجلسة، ابدأ من جديد.", embeds: [], components: [] });

    const embed = buildFinalEmbed(interaction.user, session, false);

    try {
      if (session.fileUrl) {
        await interaction.user.send({ embeds: [embed], files: [session.fileUrl] }).catch(() => interaction.user.send({ embeds: [embed] }));
      } else {
        await interaction.user.send({ embeds: [embed] });
      }
      clearSession(interaction.user.id);
      await interaction.update({ content: "✅ وصلتك على DM! 🔒", embeds: [], components: [] });
    } catch {
      clearSession(interaction.user.id);
      await interaction.update({ content: "❌ ما قدرت أرسل لك DM.", embeds: [], components: [] });
    }

    const guild = client.guilds.cache.get(session.guildId);
    if (guild) {
      await log(guild, "🔒 رسالة خاصة أُرسلت", interaction.user, [
        { name: "النوع", value: session.type,           inline: true  },
        { name: "النص",  value: session.text    || "—", inline: false },
        { name: "الملف", value: session.fileUrl || "—", inline: false },
      ], C.dm);
    }
    return;
  }

  // ── منيو: نوع الرسالة في الـ DM ──
  if (interaction.isStringSelectMenu() && interaction.customId === "dm_type_select") {
    const type = interaction.values[0];

    // نحفظ الجلسة مع الـ guildId (من أين فتح البانل)
    // نجيب الـ guildId من أي سيرفر فيه البوت (الغالب واحد)
    const guildId = client.guilds.cache.first()?.id || "";

    setSession(interaction.user.id, {
      step:    "waiting_content",
      type,
      guildId,
      text:    null,
      fileUrl: null,
      expiresAt: Date.now() + 3 * 60 * 1000, // 3 دقائق
    });

    await interaction.update(buildAskContent(type));
    return;
  }

  // ── منيو: الإعدادات ──
  if (interaction.isStringSelectMenu() && interaction.customId === "settings_menu") {
    if (!interaction.member?.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ للأدمن فقط.", ephemeral: true });
    }

    const settingLabels = {
      set_log:    "ID قناة اللوق",
      set_public: "ID القناة العامة",
      set_panel:  "ID قناة البانل",
      set_color:  "كود اللون (مثال: 0x5865F2)",
      set_title:  "عنوان البانل الجديد",
      set_desc:   "وصف البانل الجديد",
    };

    const settingKeys = {
      set_log:    "logChannelId",
      set_public: "publicChannelId",
      set_panel:  "panelChannelId",
      set_color:  "embedColor",
      set_title:  "panelTitle",
      set_desc:   "panelDesc",
    };

    const val = interaction.values[0];

    // نحفظ الإعداد المختار في جلسة مؤقتة
    setSession(`settings_${interaction.user.id}`, { key: settingKeys[val], label: settingLabels[val] });

    await interaction.reply({
      content: `📝 أرسل **${settingLabels[val]}** الجديد في هذه القناة:`,
      ephemeral: true,
    });
    return;
  }
});

// ═══════════════════════════════════════════════════════════════
//  استقبال إدخال الإعدادات من الأدمن في القناة
// ═══════════════════════════════════════════════════════════════
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  const settingsSession = getSession(`settings_${msg.author.id}`);
  if (!settingsSession) return;

  const isAdmin = msg.member?.permissions.has(PermissionFlagsBits.Administrator);
  if (!isAdmin) return;

  updateConfig(settingsSession.key, msg.content.trim());
  clearSession(`settings_${msg.author.id}`);

  await msg.reply({ content: `✅ تم تحديث **${settingsSession.label}** → \`${msg.content.trim()}\``, ephemeral: true });
  await log(msg.guild, "⚙️ تغيير إعداد", msg.author, [
    { name: "الإعداد",        value: settingsSession.key,  inline: true },
    { name: "القيمة الجديدة", value: msg.content.trim(),   inline: true },
  ], C.main);
  await msg.delete().catch(() => {});
});

// ═══════════════════════════════════════════════════════════════
//  CLEANUP: جلسات منتهية الصلاحية كل دقيقة
// ═══════════════════════════════════════════════════════════════
setInterval(() => {
  const data = loadData();
  const now  = Date.now();
  let changed = false;
  for (const [uid, session] of Object.entries(data.sessions)) {
    if (session.expiresAt && now > session.expiresAt) {
      delete data.sessions[uid];
      changed = true;
    }
  }
  if (changed) saveData(data);
}, 60 * 1000);

// ═══════════════════════════════════════════════════════════════
//  LOG: EDIT / DELETE / JOIN / LEAVE
// ═══════════════════════════════════════════════════════════════
client.on(Events.MessageUpdate, async (before, after) => {
  if (!after.guild || after.author?.bot) return;
  if (before.content === after.content) return;
  await log(after.guild, "✏️ رسالة معدّلة", after.author, [
    { name: "قبل",    value: before.content || "—",    inline: false },
    { name: "بعد",    value: after.content  || "—",    inline: false },
    { name: "القناة", value: `<#${after.channel.id}>`, inline: true  },
  ], C.edit);
});

client.on(Events.MessageDelete, async (msg) => {
  if (!msg.guild || msg.author?.bot) return;
  const fields = [
    { name: "🗑️ المحتوى", value: msg.content || "لا يوجد نص", inline: false },
    { name: "القناة",     value: `<#${msg.channel.id}>`,       inline: true  },
  ];
  if (msg.attachments?.size > 0) {
    fields.push({ name: "📎 مرفقات", value: [...msg.attachments.values()].map(a => `[${a.name}](${a.url})`).join("\n"), inline: false });
  }
  await log(msg.guild, "🗑️ رسالة محذوفة", msg.author, fields, C.delete);
});

client.on(Events.GuildMemberAdd, async (member) => {
  await log(member.guild, "✅ عضو انضم", member.user, [
    { name: "تاريخ إنشاء الحساب", value: member.user.createdAt.toLocaleDateString("ar"), inline: true },
  ], C.join);
});

client.on(Events.GuildMemberRemove, async (member) => {
  const roles = member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.name).join(", ") || "لا يوجد";
  await log(member.guild, "👋 عضو غادر", member.user, [
    { name: "الأدوار", value: roles, inline: false },
  ], C.leave);
});

// ═══════════════════════════════════════════════════════════════
//  HTTP SERVER — عشان Render ما يوقف البوت
// ═══════════════════════════════════════════════════════════════
http.createServer((req, res) => res.end("🕊️ بوت الزاجل شغّال")).listen(process.env.PORT || 3000);

// ═══════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════
client.login(TOKEN);
