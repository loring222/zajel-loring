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
//  CONFIG — كلها من .env
// ═══════════════════════════════════════════════════════════════
const TOKEN          = process.env.DISCORD_TOKEN;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const PUBLIC_CH_ID   = process.env.PUBLIC_CHANNEL_ID;
const PANEL_CH_ID    = process.env.PANEL_CHANNEL_ID;
const EMBED_COLOR    = parseInt(process.env.EMBED_COLOR || "0x5865F2");
const PANEL_TITLE    = process.env.PANEL_TITLE || "🕊️ بوت الزاجل";
const PANEL_DESC     = process.env.PANEL_DESC  || "أرسل رسالتك لأي شخص في السيرفر أو للعام 👇";

// ═══════════════════════════════════════════════════════════════
//  JSON STORE — للجلسات والحظر فقط
// ═══════════════════════════════════════════════════════════════
const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ bans: {}, sessions: {} }, null, 2));
  }
  const d = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  if (!d.sessions) d.sessions = {};
  if (!d.bans)     d.bans     = {};
  return d;
}

function saveData(d)           { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }
function getBans()             { return loadData().bans; }
function addBan(uid, info)     { const d = loadData(); d.bans[uid] = info; saveData(d); }
function removeBan(uid)        { const d = loadData(); delete d.bans[uid]; saveData(d); }
function getSession(uid)       { return loadData().sessions[uid] ?? null; }
function setSession(uid, data) { const d = loadData(); d.sessions[uid] = data; saveData(d); }
function clearSession(uid)     { const d = loadData(); delete d.sessions[uid]; saveData(d); }

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
  if (diff <= 0) return "انتهت";
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
  main:   EMBED_COLOR,
  green:  0x57F287,
  red:    0xED4245,
  yellow: 0xFEE75C,
  pink:   0xEB459E,
  orange: 0xFF8800,
};

// ═══════════════════════════════════════════════════════════════
//  LOG
// ═══════════════════════════════════════════════════════════════
async function log(guild, title, user, fields = [], color = C.yellow) {
  const ch = guild?.channels?.cache?.get(LOG_CHANNEL_ID);
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
//  BUILDERS
// ═══════════════════════════════════════════════════════════════

function buildPanel() {
  const embed = new EmbedBuilder()
    .setTitle(PANEL_TITLE)
    .setDescription(PANEL_DESC)
    .setColor(C.main)
    .addFields(
      { name: "📢 للعام",  value: "تظهر للكل في القناة",       inline: true },
      { name: "🔒 لشخص",  value: "تصل على DM لشخص تختاره",    inline: true },
    )
    .setFooter({ text: "🕊️ بوت الزاجل — رسائلك تصل" })
    .setTimestamp();

  const btn = new ButtonBuilder()
    .setCustomId("start_pigeon")
    .setLabel("📬  أرسل رسالة")
    .setStyle(ButtonStyle.Primary);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] };
}

function buildWelcomeDM(username, guildName) {
  const embed = new EmbedBuilder()
    .setTitle("🕊️ أهلاً بك في بوت الزاجل")
    .setDescription(
      `مرحباً **${username}** 👋\n\n` +
      `جاهز تبعث رسالتك من سيرفر **${guildName}**\n\n` +
      `**الخطوة الأولى — اختر نوع رسالتك:**`
    )
    .setColor(C.main)
    .setFooter({ text: "🕊️ بوت الزاجل" })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId("dm_type_select")
    .setPlaceholder("📋 اختر نوع الرسالة...")
    .addOptions([
      { label: "📝 نص فقط",       description: "رسالة نصية",               value: "text",  emoji: "📝" },
      { label: "🖼️ صورة",         description: "صورة مع نص اختياري",       value: "image", emoji: "🖼️" },
      { label: "🎬 فيديو",        description: "فيديو مع نص اختياري",      value: "video", emoji: "🎬" },
      { label: "🎙️ رسالة صوتية", description: "ملف صوتي مع نص اختياري",   value: "voice", emoji: "🎙️" },
      { label: "📦 نص + ملف",    description: "نص مع أي نوع من الملفات",  value: "all",   emoji: "📦" },
    ]);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

function buildAskContent(type) {
  const info = {
    text:  { icon: "📝", title: "اكتب رسالتك",          hint: "أرسل نصك هنا مباشرة 👇" },
    image: { icon: "🖼️", title: "أرسل الصورة",          hint: "أرسل الصورة مع نص اختياري 👇" },
    video: { icon: "🎬", title: "أرسل الفيديو",          hint: "أرسل الفيديو مع نص اختياري 👇" },
    voice: { icon: "🎙️", title: "أرسل الرسالة الصوتية", hint: "أرسل الملف الصوتي مع نص اختياري 👇" },
    all:   { icon: "📦", title: "أرسل نصك والملف",      hint: "أرسل الملف مع النص أو بدونه 👇" },
  }[type];

  const embed = new EmbedBuilder()
    .setTitle(`${info.icon} ${info.title}`)
    .setDescription(info.hint)
    .setColor(C.main)
    .setFooter({ text: "⏳ عندك 3 دقائق • اضغط إلغاء للخروج" });

  const cancel = new ButtonBuilder()
    .setCustomId("cancel_session")
    .setLabel("❌ إلغاء")
    .setStyle(ButtonStyle.Danger);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(cancel)] };
}

function buildAskDestination() {
  const embed = new EmbedBuilder()
    .setTitle("📮 وين تبي ترسل؟")
    .setColor(C.main)
    .addFields(
      { name: "📢 للعام",  value: "تظهر في قناة السيرفر العامة", inline: true },
      { name: "🔒 لشخص",  value: "تصل على DM لشخص تختاره",      inline: true },
    )
    .setFooter({ text: "🕊️ بوت الزاجل" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("send_public").setLabel("📢 للعام").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("send_private").setLabel("🔒 لشخص").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("cancel_session").setLabel("❌ إلغاء").setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row] };
}

function buildAskMemberId() {
  const embed = new EmbedBuilder()
    .setTitle("🔍 من تبي ترسل له؟")
    .setDescription(
      "أرسل **ID** العضو هنا 👇\n\n" +
      "**كيف أحصل على الـ ID؟**\n" +
      "كليك يمين على العضو ← `Copy User ID`\n" +
      "*(فعّل Developer Mode في إعدادات الديسكورد)*"
    )
    .setColor(C.main)
    .setFooter({ text: "⏳ عندك دقيقتين • 🕊️ بوت الزاجل" });

  const cancel = new ButtonBuilder()
    .setCustomId("cancel_session")
    .setLabel("❌ إلغاء")
    .setStyle(ButtonStyle.Danger);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(cancel)] };
}

function buildFinalEmbed(user, session, destination) {
  const typeLabel = {
    text:  "📝 نص",
    image: "🖼️ صورة",
    video: "🎬 فيديو",
    voice: "🎙️ صوتية",
    all:   "📦 نص + ملف",
  }[session.type];

  const embed = new EmbedBuilder()
    .setAuthor({ name: user.displayName, iconURL: user.displayAvatarURL() })
    .setColor(C.main)
    .setTimestamp()
    .setFooter({ text: `${typeLabel} • ${destination} • 🕊️ بوت الزاجل` });

  if (session.text) embed.setDescription(session.text);

  if (session.fileUrl) {
    if (session.type === "image") {
      embed.setImage(session.fileUrl);
    } else {
      embed.addFields({ name: "📎 مرفق", value: `[اضغط للتحميل](${session.fileUrl})`, inline: false });
    }
  }

  return embed;
}

// ═══════════════════════════════════════════════════════════════
//  READY
// ═══════════════════════════════════════════════════════════════
client.once(Events.ClientReady, () => {
  console.log(`✅ البوت شغّال: ${client.user.tag}`);
});

// ═══════════════════════════════════════════════════════════════
//  MESSAGE CREATE — handler واحد بس
// ═══════════════════════════════════════════════════════════════
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return;

  // ══════════════════════
  //  DM
  // ══════════════════════
  if (!msg.guild) {
    const session = getSession(msg.author.id);
    if (!session) return;

    // انتظار المحتوى
    if (session.step === "waiting_content") {
      const text       = msg.content?.trim() || "";
      const attachment = msg.attachments?.first();
      const fileUrl    = attachment?.url || null;

      if (session.type === "text" && !text)
        return msg.channel.send("❌ أرسل نصاً.");

      if (["image","video","voice","all"].includes(session.type) && !fileUrl && !text)
        return msg.channel.send("❌ أرسل ملفاً أو نصاً على الأقل.");

      setSession(msg.author.id, {
        ...session,
        step:      "waiting_destination",
        text:      text    || null,
        fileUrl:   fileUrl || null,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      return msg.channel.send(buildAskDestination());
    }

    // انتظار ID العضو
    if (session.step === "waiting_member_id") {
      const rawId = msg.content?.trim().replace(/\D/g, "");
      if (!rawId) return msg.channel.send("❌ أرسل ID صحيح (أرقام فقط).");

      const guild  = client.guilds.cache.get(session.guildId);
      const member = await guild?.members.fetch(rawId).catch(() => null);

      if (!member)
        return msg.channel.send("❌ ما لقيت هذا العضو في السيرفر، تأكد من الـ ID وحاول مرة ثانية.");

      const embed = buildFinalEmbed(msg.author, session, "🔒 خاص");

      try {
        if (session.fileUrl) {
          await member.user.send({ embeds: [embed], files: [session.fileUrl] })
            .catch(() => member.user.send({ embeds: [embed] }));
        } else {
          await member.user.send({ embeds: [embed] });
        }

        clearSession(msg.author.id);
        await msg.channel.send({
          embeds: [new EmbedBuilder()
            .setTitle("✅ وصلت!")
            .setDescription(`رسالتك وصلت لـ **${member.user.displayName}** 🕊️`)
            .setColor(C.green).setTimestamp()
          ]
        });

        await log(guild, "🔒 رسالة خاصة أُرسلت", msg.author, [
          { name: "المستلم", value: `<@${member.id}>`,       inline: true  },
          { name: "النوع",   value: session.type,             inline: true  },
          { name: "النص",    value: session.text    || "—",   inline: false },
          { name: "الملف",   value: session.fileUrl || "—",   inline: false },
        ], C.green);

      } catch {
        clearSession(msg.author.id);
        await msg.channel.send("❌ العضو أغلق رسائله الخاصة، ما قدرت أرسل.");
      }
      return;
    }

    return;
  }

  // ══════════════════════
  //  السيرفر
  // ══════════════════════

  // لوق الرسائل
  const logFields = [
    { name: "💬 المحتوى", value: msg.content || "لا يوجد نص", inline: false },
    { name: "📍 القناة",  value: `<#${msg.channel.id}>`,       inline: true  },
  ];
  if (msg.attachments.size > 0) {
    logFields.push({
      name:  "📎 مرفقات",
      value: [...msg.attachments.values()].map(a => `[${a.name}](${a.url})`).join("\n"),
      inline: false,
    });
  }
  await log(msg.guild, "📩 رسالة جديدة", msg.author, logFields, C.yellow);

  const isAdmin = msg.member?.permissions.has(PermissionFlagsBits.Administrator);
  const content = msg.content.trim();

  // !setup_panel
  if (content === "!setup_panel") {
    if (!isAdmin) return msg.reply("❌ للأدمن فقط.");
    await msg.channel.send(buildPanel());
    return msg.delete().catch(() => {});
  }

  // !commands
  if (content === "!commands") {
    const embed = new EmbedBuilder()
      .setTitle("📖 أوامر بوت الزاجل")
      .setColor(C.main)
      .addFields(
        { name: "━━━━━━━ 👑 الأدمن ━━━━━━━",             value: "\u200b" },
        { name: "`!setup_panel`",                         value: "ينشر البانل في القناة" },
        { name: "`!commands`",                            value: "يعرض هذه القائمة" },
        { name: "`!ban @عضو [مدة] [سبب]`",               value: "يحظر عضو من البوت\n**المدة:** `1h` `1d` `7d` `permanent`" },
        { name: "`!unban @عضو`",                          value: "يفك الحظر عن عضو" },
        { name: "`!bans`",                                value: "قائمة المحظورين" },
        { name: "━━━━━━━ 👥 الأعضاء ━━━━━━━",            value: "\u200b" },
        { name: "البانل",                                 value: "زر ← DM ← نوع ← محتوى ← عام أو لشخص بـ ID" },
        { name: "━━━━━━━ 👁️ اللوق التلقائي ━━━━━━━",     value: "\u200b" },
        { name: "تلقائي",                                 value: "📩 رسائل • ✏️ تعديل • 🗑️ حذف • ✅ دخول • 👋 خروج • 🚫 حظر" },
      )
      .setFooter({ text: "🕊️ بوت الزاجل" })
      .setTimestamp();
    await msg.reply({ embeds: [embed] });
    return msg.delete().catch(() => {});
  }

  // !ban
  if (content.startsWith("!ban ")) {
    if (!isAdmin) return msg.reply("❌ للأدمن فقط.");
    const target = msg.mentions.users.first();
    if (!target) return msg.reply("❌ مثال: `!ban @علي 1d سبب`");

    const after  = content.replace(/^!ban\s+<@!?\d+>\s*/, "");
    const parts  = after.split(" ");
    const until  = parseDuration(parts[0] || "permanent");
    const reason = parts.slice(1).join(" ") || "لا يوجد سبب";
    if (until === null) return msg.reply("❌ مدة خاطئة. استخدم: `1h` `1d` `7d` `permanent`");

    if (!isBanned(target.id)) {
      await target.send({ embeds: [new EmbedBuilder()
        .setTitle("⚠️ تحذير — بوت الزاجل")
        .setDescription(`تلقيت تحذيراً في **${msg.guild.name}**\n**السبب:** ${reason}`)
        .setColor(C.orange).setTimestamp()
      ]}).catch(() => {});
    }

    addBan(target.id, { until, reason, bannedBy: msg.author.id, at: Date.now() });

    await target.send({ embeds: [new EmbedBuilder()
      .setTitle("🚫 تم حظرك من بوت الزاجل")
      .setDescription(`**السيرفر:** ${msg.guild.name}\n**السبب:** ${reason}\n**المدة:** ${formatDuration(until)}`)
      .setColor(C.red).setTimestamp()
    ]}).catch(() => {});

    await msg.reply({ embeds: [new EmbedBuilder()
      .setTitle("🚫 تم الحظر")
      .setDescription(`<@${target.id}> محظور من البوت`)
      .addFields(
        { name: "السبب", value: reason,                inline: true },
        { name: "المدة", value: formatDuration(until), inline: true },
      ).setColor(C.red).setTimestamp()
    ]});

    await log(msg.guild, "🚫 حظر من البوت", target, [
      { name: "السبب",  value: reason,                inline: false },
      { name: "المدة",  value: formatDuration(until), inline: true  },
      { name: "بواسطة", value: `<@${msg.author.id}>`, inline: true  },
    ], C.red);
    return;
  }

  // !unban
  if (content.startsWith("!unban ")) {
    if (!isAdmin) return msg.reply("❌ للأدمن فقط.");
    const target = msg.mentions.users.first();
    if (!target) return msg.reply("❌ مثال: `!unban @علي`");
    if (!getBans()[target.id]) return msg.reply("⚠️ هذا العضو غير محظور.");

    removeBan(target.id);

    await target.send({ embeds: [new EmbedBuilder()
      .setTitle("✅ تم رفع الحظر عنك")
      .setDescription(`يمكنك الآن استخدام البوت في **${msg.guild.name}**`)
      .setColor(C.green).setTimestamp()
    ]}).catch(() => {});

    await msg.reply({ embeds: [new EmbedBuilder()
      .setTitle("✅ تم فك الحظر")
      .setDescription(`تم رفع الحظر عن <@${target.id}>`)
      .setColor(C.green).setTimestamp()
    ]});

    await log(msg.guild, "✅ فك حظر", target, [
      { name: "بواسطة", value: `<@${msg.author.id}>`, inline: true },
    ], C.green);
    return;
  }

  // !bans
  if (content === "!bans") {
    if (!isAdmin) return msg.reply("❌ للأدمن فقط.");
    const list = Object.entries(getBans());
    if (!list.length) {
      return msg.reply({ embeds: [new EmbedBuilder().setTitle("📋 المحظورين").setDescription("لا يوجد محظورين ✅").setColor(C.green)] });
    }
    const lines = list.map(([id, info]) =>
      `${isBanned(id) ? "🚫" : "✅"} <@${id}> — ${formatDuration(info.until)} — ${info.reason}`
    ).join("\n");
    await msg.reply({ embeds: [new EmbedBuilder().setTitle(`📋 المحظورين (${list.length})`).setDescription(lines).setColor(C.red).setTimestamp()] });
    return msg.delete().catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════════════
//  INTERACTIONS
// ═══════════════════════════════════════════════════════════════
client.on(Events.InteractionCreate, async (interaction) => {

  // زر البانل
  if (interaction.isButton() && interaction.customId === "start_pigeon") {
    if (isBanned(interaction.user.id)) {
      const info = getBans()[interaction.user.id];
      return interaction.reply({
        content: `🚫 أنت محظور من البوت.\n**السبب:** ${info?.reason || "—"}\n**المتبقي:** ${formatDuration(info?.until)}`,
        ephemeral: true,
      });
    }
    try {
      await interaction.user.send(buildWelcomeDM(interaction.user.displayName, interaction.guild.name));
      await interaction.reply({ content: "✅ راجع رسائلك الخاصة!", ephemeral: true });
    } catch {
      await interaction.reply({ content: "❌ فعّل رسائل السيرفر من إعدادات الخصوصية.", ephemeral: true });
    }
    return;
  }

  // إلغاء
  if (interaction.isButton() && interaction.customId === "cancel_session") {
    clearSession(interaction.user.id);
    return interaction.update({
      embeds: [new EmbedBuilder().setTitle("❌ تم الإلغاء").setColor(C.red)],
      components: [],
    });
  }

  // إرسال للعام
  if (interaction.isButton() && interaction.customId === "send_public") {
    const session = getSession(interaction.user.id);
    if (!session) return interaction.update({ content: "❌ انتهت الجلسة.", embeds: [], components: [] });

    const guild = client.guilds.cache.get(session.guildId);
    const ch    = guild?.channels?.cache?.get(PUBLIC_CH_ID);

    if (!ch) {
      clearSession(interaction.user.id);
      return interaction.update({
        embeds: [new EmbedBuilder().setTitle("❌ خطأ").setDescription("قناة العام غير محددة، تواصل مع الأدمن.").setColor(C.red)],
        components: [],
      });
    }

    const embed = buildFinalEmbed(interaction.user, session, "📢 عام");
    if (session.fileUrl) {
      await ch.send({ embeds: [embed], files: [session.fileUrl] }).catch(() => ch.send({ embeds: [embed] }));
    } else {
      await ch.send({ embeds: [embed] });
    }

    clearSession(interaction.user.id);
    await interaction.update({
      embeds: [new EmbedBuilder().setTitle("✅ وصلت!").setDescription("رسالتك طلعت للعام 📢").setColor(C.green).setTimestamp()],
      components: [],
    });

    await log(guild, "📢 رسالة عامة", interaction.user, [
      { name: "النوع",  value: session.type,           inline: true  },
      { name: "النص",   value: session.text    || "—", inline: false },
      { name: "الملف",  value: session.fileUrl || "—", inline: false },
    ], C.main);
    return;
  }

  // إرسال لشخص
  if (interaction.isButton() && interaction.customId === "send_private") {
    const session = getSession(interaction.user.id);
    if (!session) return interaction.update({ content: "❌ انتهت الجلسة.", embeds: [], components: [] });

    setSession(interaction.user.id, { ...session, step: "waiting_member_id", expiresAt: Date.now() + 2 * 60 * 1000 });
    return interaction.update(buildAskMemberId());
  }

  // منيو النوع
  if (interaction.isStringSelectMenu() && interaction.customId === "dm_type_select") {
    const type    = interaction.values[0];
    const guildId = client.guilds.cache.first()?.id || "";

    setSession(interaction.user.id, {
      step:      "waiting_content",
      type,
      guildId,
      text:      null,
      fileUrl:   null,
      expiresAt: Date.now() + 3 * 60 * 1000,
    });

    return interaction.update(buildAskContent(type));
  }
});

// ═══════════════════════════════════════════════════════════════
//  CLEANUP — جلسات منتهية كل دقيقة
// ═══════════════════════════════════════════════════════════════
setInterval(() => {
  const data = loadData();
  const now  = Date.now();
  let dirty  = false;
  for (const [uid, s] of Object.entries(data.sessions)) {
    if (s.expiresAt && now > s.expiresAt) { delete data.sessions[uid]; dirty = true; }
  }
  if (dirty) saveData(data);
}, 60_000);

// ═══════════════════════════════════════════════════════════════
//  LOG EVENTS
// ═══════════════════════════════════════════════════════════════
client.on(Events.MessageUpdate, async (before, after) => {
  if (!after.guild || after.author?.bot) return;
  if (before.content === after.content) return;
  await log(after.guild, "✏️ رسالة معدّلة", after.author, [
    { name: "قبل",    value: before.content || "—",    inline: false },
    { name: "بعد",    value: after.content  || "—",    inline: false },
    { name: "القناة", value: `<#${after.channel.id}>`, inline: true  },
  ], C.pink);
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
  await log(msg.guild, "🗑️ رسالة محذوفة", msg.author, fields, C.red);
});

client.on(Events.GuildMemberAdd, async (member) => {
  await log(member.guild, "✅ عضو انضم", member.user, [
    { name: "تاريخ إنشاء الحساب", value: member.user.createdAt.toLocaleDateString("ar"), inline: true },
  ], C.green);
});

client.on(Events.GuildMemberRemove, async (member) => {
  const roles = member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.name).join(", ") || "لا يوجد";
  await log(member.guild, "👋 عضو غادر", member.user, [
    { name: "الأدوار", value: roles, inline: false },
  ], C.red);
});

// ═══════════════════════════════════════════════════════════════
//  HTTP SERVER — عشان Render ما يوقف البوت
// ═══════════════════════════════════════════════════════════════
http.createServer((_, res) => res.end("🕊️")).listen(process.env.PORT || 3000);

// ═══════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════
client.login(TOKEN);
