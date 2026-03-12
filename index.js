// ╔══════════════════════════════════════════════════════════════╗
// ║              🕊️  بوت الزاجل  —  Pigeon Bot                 ║
// ║                     discord.js v14                          ║
// ╚══════════════════════════════════════════════════════════════╝

const {
  Client, GatewayIntentBits, Partials,
  EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, Events,
} = require("discord.js");

const fs   = require("fs");
const path = require("path");
require("dotenv").config();

// ═══════════════════════════════════════════════════════════════
//  CONFIG  —  ضع التوكن في ملف .env
// ═══════════════════════════════════════════════════════════════
const TOKEN = process.env.DISCORD_TOKEN; // ← حطه في .env

const DEFAULT_CONFIG = {
  logChannelId:    process.env.LOG_CHANNEL_ID    || "",
  publicChannelId: process.env.PUBLIC_CHANNEL_ID || "",
  panelChannelId:  process.env.PANEL_CHANNEL_ID  || "",
  embedColor:      "0x5865F2",
  panelTitle:      "🕊️ بوت الزاجل",
  panelDesc:       "اختر نوع رسالتك من القائمة أدناه 👇",
};

// ═══════════════════════════════════════════════════════════════
//  JSON STORE
// ═══════════════════════════════════════════════════════════════
const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ config: DEFAULT_CONFIG, bans: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getConfig() {
  return loadData().config;
}

function updateConfig(key, value) {
  const data = loadData();
  data.config[key] = value;
  saveData(data);
}

function getBans() {
  return loadData().bans;
}

function addBan(userId, info) {
  const data = loadData();
  data.bans[userId] = info;
  saveData(data);
}

function removeBan(userId) {
  const data = loadData();
  delete data.bans[userId];
  saveData(data);
}

function isBanned(userId) {
  const bans = getBans();
  if (!bans[userId]) return false;
  if (bans[userId].until === "permanent") return true;
  if (Date.now() < bans[userId].until) return true;
  removeBan(userId); // انتهت المدة تلقائياً
  return false;
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
  public:   0x5865F2,
  dm:       0x57F287,
  log:      0xFEE75C,
  delete:   0xED4245,
  edit:     0xEB459E,
  join:     0x57F287,
  leave:    0xED4245,
  ban:      0xFF0000,
  unban:    0x00FF99,
  warn:     0xFF8800,
  settings: 0x5865F2,
};

// ═══════════════════════════════════════════════════════════════
//  HELPER: LOG
// ═══════════════════════════════════════════════════════════════
async function log(guild, title, user, fields = [], color = C.log) {
  const cfg = getConfig();
  const ch  = guild.channels.cache.get(cfg.logChannelId);
  if (!ch) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp();

  if (user) {
    embed.setAuthor({ name: user.tag ?? String(user), iconURL: user.displayAvatarURL?.() ?? undefined });
    embed.addFields({ name: "👤 المستخدم", value: `<@${user.id}> (\`${user.id}\`)`, inline: true });
  }

  for (const f of fields) {
    embed.addFields({ name: f.name, value: String(f.value || "—").slice(0, 1024), inline: !!f.inline });
  }

  await ch.send({ embeds: [embed] }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
//  HELPER: MODAL BUILDER
// ═══════════════════════════════════════════════════════════════
function modal(id, title, inputs) {
  const m = new ModalBuilder().setCustomId(id).setTitle(title);
  for (const i of inputs) {
    const field = new TextInputBuilder()
      .setCustomId(i.id)
      .setLabel(i.label)
      .setStyle(i.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(i.required ?? true)
      .setMaxLength(i.max ?? 1000);
    if (i.placeholder) field.setPlaceholder(i.placeholder);
    m.addComponents(new ActionRowBuilder().addComponents(field));
  }
  return m;
}

// ═══════════════════════════════════════════════════════════════
//  PARSE / FORMAT DURATION
// ═══════════════════════════════════════════════════════════════
function parseDuration(str) {
  if (!str || str === "permanent") return "permanent";
  const match = str.match(/^(\d+)(h|d|w)$/);
  if (!match) return null;
  const n = parseInt(match[1]);
  const map = { h: 3600000, d: 86400000, w: 604800000 };
  return Date.now() + n * map[match[2]];
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
//  BUILD: PANEL
// ═══════════════════════════════════════════════════════════════
function buildPanel() {
  const cfg   = getConfig();
  const color = parseInt(cfg.embedColor) || C.public;

  const embed = new EmbedBuilder()
    .setTitle(cfg.panelTitle)
    .setDescription(cfg.panelDesc)
    .setColor(color)
    .addFields(
      { name: "📢 رسالة + صورة",       value: "نص وصورة تطلع للعام",    inline: true },
      { name: "🎙️ رسالة + صوت/فيديو", value: "نص ورابط صوت أو فيديو", inline: true },
      { name: "✉️ رسالة خاصة",         value: "تصلك مباشرة على DM",     inline: true },
    )
    .setFooter({ text: "🕊️ بوت الزاجل" })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId("pigeon_menu")
    .setPlaceholder("📬 اختر نوع رسالتك...")
    .addOptions([
      { label: "📢 رسالة + صورة",        description: "نص وصورة تطلع للروم العام", value: "public_img", emoji: "📢" },
      { label: "🎙️ رسالة + صوت/فيديو",  description: "نص ورابط صوت أو فيديو",    value: "public_av",  emoji: "🎙️" },
      { label: "✉️ رسالة خاصة",          description: "رسالة تصلك على DM",         value: "dm",         emoji: "✉️" },
    ]);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

// ═══════════════════════════════════════════════════════════════
//  BUILD: SETTINGS PANEL
// ═══════════════════════════════════════════════════════════════
function buildSettingsPanel() {
  const cfg = getConfig();

  const embed = new EmbedBuilder()
    .setTitle("⚙️ إعدادات بوت الزاجل")
    .setColor(C.settings)
    .addFields(
      { name: "📋 قناة اللوق",        value: cfg.logChannelId    ? `<#${cfg.logChannelId}>`    : "غير محددة", inline: true  },
      { name: "📢 القناة العامة",     value: cfg.publicChannelId ? `<#${cfg.publicChannelId}>` : "غير محددة", inline: true  },
      { name: "📌 قناة البانل",       value: cfg.panelChannelId  ? `<#${cfg.panelChannelId}>`  : "غير محددة", inline: true  },
      { name: "🎨 لون الـ Embed",     value: cfg.embedColor,                                    inline: true  },
      { name: "📝 عنوان البانل",      value: cfg.panelTitle,                                    inline: false },
      { name: "💬 وصف البانل",        value: cfg.panelDesc,                                     inline: false },
    )
    .setFooter({ text: "اختر ما تبي تعدله من القائمة" })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId("settings_menu")
    .setPlaceholder("🔧 اختر الإعداد اللي تبي تعدله...")
    .addOptions([
      { label: "📋 تغيير قناة اللوق",      value: "set_log",    emoji: "📋" },
      { label: "📢 تغيير القناة العامة",   value: "set_public", emoji: "📢" },
      { label: "📌 تغيير قناة البانل",     value: "set_panel",  emoji: "📌" },
      { label: "🎨 تغيير لون الـ Embed",   value: "set_color",  emoji: "🎨" },
      { label: "📝 تغيير عنوان البانل",    value: "set_title",  emoji: "📝" },
      { label: "💬 تغيير وصف البانل",      value: "set_desc",   emoji: "💬" },
    ]);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true };
}

// ═══════════════════════════════════════════════════════════════
//  BUILD: COMMANDS LIST
// ═══════════════════════════════════════════════════════════════
function buildCommandsPanel() {
  const embed = new EmbedBuilder()
    .setTitle("📖 قائمة أوامر بوت الزاجل")
    .setColor(C.public)
    .addFields(
      { name: "━━━━━━━━━━ 👑 أوامر الأدمن ━━━━━━━━━━", value: "\u200b" },
      { name: "`!setup_panel`",                  value: "ينشر رسالة البانل الرئيسية في القناة" },
      { name: "`!settings`",                     value: "يفتح لوحة إعدادات البوت كاملة" },
      { name: "`!commands`",                     value: "يعرض هذه القائمة" },
      { name: "`!ban @عضو [مدة] [سبب]`",        value: "يحظر عضو من البوت\n**المدة:** `1h` `1d` `7d` `permanent`\n**مثال:** `!ban @علي 1d سلوك سيء`" },
      { name: "`!unban @عضو`",                   value: "يفك الحظر عن عضو" },
      { name: "`!bans`",                         value: "يعرض قائمة كل المحظورين" },
      { name: "━━━━━━━━━━ 👥 للأعضاء ━━━━━━━━━━", value: "\u200b" },
      { name: "البانل",                          value: "📢 رسالة + صورة\n🎙️ رسالة + صوت/فيديو\n✉️ رسالة خاصة DM" },
      { name: "━━━━━━━━━━ 👁️ اللوق التلقائي ━━━━━━━━━━", value: "\u200b" },
      { name: "تلقائي بدون أوامر",              value: "📩 رسائل جديدة\n✏️ تعديل رسائل\n🗑️ حذف رسائل\n✅ دخول أعضاء\n👋 خروج أعضاء\n🚫 حظر وفك حظر من البوت" },
    )
    .setFooter({ text: "🕊️ بوت الزاجل" })
    .setTimestamp();

  return { embeds: [embed], ephemeral: true };
}

// ═══════════════════════════════════════════════════════════════
//  READY
// ═══════════════════════════════════════════════════════════════
client.once(Events.ClientReady, () => {
  console.log(`✅ البوت شغّال: ${client.user.tag} (${client.user.id})`);
});

// ═══════════════════════════════════════════════════════════════
//  MESSAGE COMMANDS
// ═══════════════════════════════════════════════════════════════
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // اللوق التلقائي لكل رسالة
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

  // ── !ban @user [duration] [reason] ──
  if (content.startsWith("!ban ")) {
    if (!isAdmin) return msg.reply("❌ للأدمن فقط.");

    const target = msg.mentions.users.first();
    if (!target) return msg.reply("❌ حدد عضو. مثال: `!ban @علي 1d سبب`");

    // نأخذ الأجزاء بعد تخطي !ban والمنشن
    const afterMention = content.replace(/^!ban\s+<@!?\d+>\s*/, "");
    const parts        = afterMention.split(" ");
    const rawDur       = parts[0] || "permanent";
    const reason       = parts.slice(1).join(" ") || "لا يوجد سبب";
    const until        = parseDuration(rawDur);

    if (until === null) return msg.reply("❌ مدة خاطئة. استخدم: `1h` `1d` `7d` `permanent`");

    // تحذير قبل الحظر لو ما كان محظوراً من قبل
    if (!isBanned(target.id)) {
      await target.send({
        embeds: [new EmbedBuilder()
          .setTitle("⚠️ تحذير — بوت الزاجل")
          .setDescription(`تلقيت **تحذيراً** في سيرفر **${msg.guild.name}**\n\n**السبب:** ${reason}\n\nتكرار المخالفة سيؤدي للحظر من البوت.`)
          .setColor(C.warn).setTimestamp()
        ]
      }).catch(() => {});
    }

    addBan(target.id, { until, reason, bannedBy: msg.author.id, at: Date.now() });

    // إشعار DM للمحظور
    await target.send({
      embeds: [new EmbedBuilder()
        .setTitle("🚫 تم حظرك من بوت الزاجل")
        .setDescription(`تم حظرك في سيرفر **${msg.guild.name}**\n\n**السبب:** ${reason}\n**المدة:** ${formatDuration(until)}`)
        .setColor(C.ban).setTimestamp()
      ]
    }).catch(() => {});

    await msg.reply({
      embeds: [new EmbedBuilder()
        .setTitle("🚫 تم الحظر")
        .setDescription(`<@${target.id}> محظور الآن من البوت`)
        .addFields(
          { name: "السبب", value: reason,                 inline: true },
          { name: "المدة", value: formatDuration(until),  inline: true },
        )
        .setColor(C.ban).setTimestamp()
      ]
    });

    await log(msg.guild, "🚫 حظر من البوت", target, [
      { name: "السبب",  value: reason,                inline: false },
      { name: "المدة",  value: formatDuration(until), inline: true  },
      { name: "بواسطة", value: `<@${msg.author.id}>`, inline: true  },
    ], C.ban);
    return;
  }

  // ── !unban @user ──
  if (content.startsWith("!unban ")) {
    if (!isAdmin) return msg.reply("❌ للأدمن فقط.");

    const target = msg.mentions.users.first();
    if (!target) return msg.reply("❌ حدد عضو. مثال: `!unban @علي`");
    if (!getBans()[target.id]) return msg.reply("⚠️ هذا العضو غير محظور.");

    removeBan(target.id);

    await target.send({
      embeds: [new EmbedBuilder()
        .setTitle("✅ تم رفع الحظر عنك")
        .setDescription(`تم رفع الحظر عنك في سيرفر **${msg.guild.name}**، يمكنك الآن استخدام البوت.`)
        .setColor(C.unban).setTimestamp()
      ]
    }).catch(() => {});

    await msg.reply({
      embeds: [new EmbedBuilder()
        .setTitle("✅ تم فك الحظر")
        .setDescription(`تم رفع الحظر عن <@${target.id}>`)
        .setColor(C.unban).setTimestamp()
      ]
    });

    await log(msg.guild, "✅ فك حظر من البوت", target, [
      { name: "فُك بواسطة", value: `<@${msg.author.id}>`, inline: true },
    ], C.unban);
    return;
  }

  // ── !bans ──
  if (content === "!bans") {
    if (!isAdmin) return msg.reply("❌ للأدمن فقط.");

    const bans = getBans();
    const list = Object.entries(bans);

    if (list.length === 0) {
      return msg.reply({ embeds: [new EmbedBuilder().setTitle("📋 المحظورين").setDescription("لا يوجد محظورين حالياً ✅").setColor(C.unban)] });
    }

    const lines = list.map(([id, info]) => {
      const active = isBanned(id);
      return `${active ? "🚫" : "✅"} <@${id}> — ${formatDuration(info.until)} — ${info.reason}`;
    }).join("\n");

    await msg.reply({
      embeds: [new EmbedBuilder()
        .setTitle(`📋 المحظورين (${list.length})`)
        .setDescription(lines)
        .setColor(C.ban).setTimestamp()
      ]
    });
    await msg.delete().catch(() => {});
    return;
  }
});

// ═══════════════════════════════════════════════════════════════
//  INTERACTIONS
// ═══════════════════════════════════════════════════════════════
client.on(Events.InteractionCreate, async (interaction) => {

  // ── Select Menu: البانل ──
  if (interaction.isStringSelectMenu() && interaction.customId === "pigeon_menu") {

    if (isBanned(interaction.user.id)) {
      const info = getBans()[interaction.user.id];
      return interaction.reply({
        content: `🚫 أنت محظور من البوت.\n**السبب:** ${info?.reason || "—"}\n**المتبقي:** ${formatDuration(info?.until)}`,
        ephemeral: true,
      });
    }

    const val = interaction.values[0];

    if (val === "public_img") {
      return interaction.showModal(modal("modal_public_img", "📢 رسالة + صورة", [
        { id: "text",  label: "الرسالة",               long: true,  placeholder: "اكتب رسالتك هنا...", required: false, max: 900 },
        { id: "image", label: "رابط الصورة (اختياري)", long: false, placeholder: "https://...",        required: false, max: 500 },
      ]));
    }

    if (val === "public_av") {
      return interaction.showModal(modal("modal_public_av", "🎙️ رسالة + صوت/فيديو", [
        { id: "text",  label: "الرسالة",                          long: true,  placeholder: "اكتب رسالتك هنا...", required: false, max: 900 },
        { id: "media", label: "رابط الصوت أو الفيديو (اختياري)", long: false, placeholder: "https://...",        required: false, max: 500 },
      ]));
    }

    if (val === "dm") {
      return interaction.showModal(modal("modal_dm", "✉️ رسالة خاصة لك", [
        { id: "text", label: "الرسالة", long: true, placeholder: "اكتب رسالتك هنا..." },
      ]));
    }
  }

  // ── Select Menu: الإعدادات ──
  if (interaction.isStringSelectMenu() && interaction.customId === "settings_menu") {
    if (!interaction.member?.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ للأدمن فقط.", ephemeral: true });
    }

    const modalsMap = {
      set_log:    ["modal_set_log",    "📋 تغيير قناة اللوق",    [{ id: "value", label: "ID قناة اللوق",    placeholder: "123456789012345678" }]],
      set_public: ["modal_set_public", "📢 تغيير القناة العامة", [{ id: "value", label: "ID القناة العامة", placeholder: "123456789012345678" }]],
      set_panel:  ["modal_set_panel",  "📌 تغيير قناة البانل",   [{ id: "value", label: "ID قناة البانل",   placeholder: "123456789012345678" }]],
      set_color:  ["modal_set_color",  "🎨 تغيير لون الـ Embed", [{ id: "value", label: "كود اللون (Hex)", placeholder: "0x5865F2" }]],
      set_title:  ["modal_set_title",  "📝 تغيير عنوان البانل",  [{ id: "value", label: "العنوان الجديد",  placeholder: "🕊️ بوت الزاجل" }]],
      set_desc:   ["modal_set_desc",   "💬 تغيير وصف البانل",    [{ id: "value", label: "الوصف الجديد", long: true, placeholder: "اختر نوع رسالتك..." }]],
    };

    const m = modalsMap[interaction.values[0]];
    if (m) return interaction.showModal(modal(...m));
  }

  if (!interaction.isModalSubmit()) return;

  const cfg = getConfig();

  // ── Modal: رسالة + صورة ──
  if (interaction.customId === "modal_public_img") {
    const text  = interaction.fields.getTextInputValue("text")  || "";
    const image = interaction.fields.getTextInputValue("image") || "";

    if (!text && !image) {
      return interaction.reply({ content: "❌ يجب كتابة نص أو رابط صورة على الأقل.", ephemeral: true });
    }

    const ch = interaction.guild.channels.cache.get(cfg.publicChannelId);
    if (!ch) return interaction.reply({ content: "❌ قناة العام غير محددة. اطلب من الأدمن يفتح `!settings`", ephemeral: true });

    const embed = new EmbedBuilder()
      .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
      .setColor(parseInt(cfg.embedColor) || C.public)
      .setFooter({ text: "📢 رسالة عامة • 🕊️ بوت الزاجل" })
      .setTimestamp();

    if (text)  embed.setDescription(text);
    if (image) embed.setImage(image);

    await ch.send({ embeds: [embed] });
    await interaction.reply({ content: "✅ تم الإرسال!", ephemeral: true });
    await log(interaction.guild, "📢 رسالة عامة (نص + صورة)", interaction.user, [
      { name: "النص",   value: text  || "—", inline: false },
      { name: "الصورة", value: image || "—", inline: false },
    ], C.public);
    return;
  }

  // ── Modal: رسالة + صوت/فيديو ──
  if (interaction.customId === "modal_public_av") {
    const text  = interaction.fields.getTextInputValue("text")  || "";
    const media = interaction.fields.getTextInputValue("media") || "";

    if (!text && !media) {
      return interaction.reply({ content: "❌ يجب كتابة نص أو رابط على الأقل.", ephemeral: true });
    }

    const ch = interaction.guild.channels.cache.get(cfg.publicChannelId);
    if (!ch) return interaction.reply({ content: "❌ قناة العام غير محددة. اطلب من الأدمن يفتح `!settings`", ephemeral: true });

    const embed = new EmbedBuilder()
      .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
      .setColor(parseInt(cfg.embedColor) || C.public)
      .setFooter({ text: "🎙️ صوت/فيديو • 🕊️ بوت الزاجل" })
      .setTimestamp();

    let desc = text;
    if (media) desc += (text ? "\n\n" : "") + `🔗 [اضغط هنا للرابط](${media})`;
    embed.setDescription(desc);

    await ch.send({ embeds: [embed] });
    await interaction.reply({ content: "✅ تم الإرسال!", ephemeral: true });
    await log(interaction.guild, "🎙️ رسالة عامة (نص + صوت/فيديو)", interaction.user, [
      { name: "النص",   value: text  || "—", inline: false },
      { name: "الرابط", value: media || "—", inline: false },
    ], C.public);
    return;
  }

  // ── Modal: DM ──
  if (interaction.customId === "modal_dm") {
    const text  = interaction.fields.getTextInputValue("text");
    const embed = new EmbedBuilder()
      .setAuthor({ name: "رسالة خاصة من البوت", iconURL: client.user.displayAvatarURL() })
      .setDescription(text)
      .setColor(parseInt(cfg.embedColor) || C.dm)
      .setFooter({ text: `✉️ من سيرفر ${interaction.guild.name}` })
      .setTimestamp();

    try {
      await interaction.user.send({ embeds: [embed] });
      await interaction.reply({ content: "✅ وصلتك على DM!", ephemeral: true });
    } catch {
      await interaction.reply({ content: "❌ ما قدرت أرسل لك DM، فعّل رسائل السيرفر.", ephemeral: true });
    }

    await log(interaction.guild, "✉️ رسالة DM", interaction.user, [
      { name: "الرسالة", value: text, inline: false },
    ], C.dm);
    return;
  }

  // ── Settings Modals ──
  const settingsMap = {
    modal_set_log:    "logChannelId",
    modal_set_public: "publicChannelId",
    modal_set_panel:  "panelChannelId",
    modal_set_color:  "embedColor",
    modal_set_title:  "panelTitle",
    modal_set_desc:   "panelDesc",
  };

  if (settingsMap[interaction.customId]) {
    const key   = settingsMap[interaction.customId];
    const value = interaction.fields.getTextInputValue("value");
    updateConfig(key, value);

    await interaction.reply({ content: `✅ تم التحديث!\n\`${key}\` ← \`${value}\``, ephemeral: true });
    await log(interaction.guild, "⚙️ تغيير إعداد", interaction.user, [
      { name: "الإعداد",        value: key,   inline: true },
      { name: "القيمة الجديدة", value: value, inline: true },
    ], C.settings);
  }
});

// ═══════════════════════════════════════════════════════════════
//  LOG: EDIT
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

// ═══════════════════════════════════════════════════════════════
//  LOG: DELETE
// ═══════════════════════════════════════════════════════════════
client.on(Events.MessageDelete, async (msg) => {
  if (!msg.guild || msg.author?.bot) return;
  const fields = [
    { name: "🗑️ المحتوى", value: msg.content || "لا يوجد نص", inline: false },
    { name: "القناة",     value: `<#${msg.channel.id}>`,       inline: true  },
  ];
  if (msg.attachments?.size > 0) {
    const list = [...msg.attachments.values()].map(a => `[${a.name}](${a.url})`).join("\n");
    fields.push({ name: "📎 مرفقات", value: list, inline: false });
  }
  await log(msg.guild, "🗑️ رسالة محذوفة", msg.author, fields, C.delete);
});

// ═══════════════════════════════════════════════════════════════
//  LOG: JOIN / LEAVE
// ═══════════════════════════════════════════════════════════════
client.on(Events.GuildMemberAdd, async (member) => {
  await log(member.guild, "✅ عضو انضم", member.user, [
    { name: "🗓️ تاريخ إنشاء الحساب", value: member.user.createdAt.toLocaleDateString("ar"), inline: true },
  ], C.join);
});

client.on(Events.GuildMemberRemove, async (member) => {
  const roles = member.roles.cache
    .filter(r => r.id !== member.guild.id)
    .map(r => r.name).join(", ") || "لا يوجد";
  await log(member.guild, "👋 عضو غادر", member.user, [
    { name: "الأدوار", value: roles, inline: false },
  ], C.leave);
});

// ═══════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════
client.login(TOKEN);
