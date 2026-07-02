const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB_FILE = path.join(__dirname, "db.json");
const ROOT_DIR = path.resolve(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
loadEnv(path.join(ROOT_DIR, ".env"));
loadEnv(path.join(__dirname, ".env"));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || "",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "",
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 20),
  queueLimit: 0,
  charset: "utf8mb4"
};
const USE_MYSQL = Boolean(MYSQL_CONFIG.host && MYSQL_CONFIG.user && MYSQL_CONFIG.database);
const REDIS_URL = process.env.REDIS_URL || "";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);
const MAX_DRAW_CHANCES = 15;
const DRAW_RECOVERY_INTERVAL_MS = 30 * 60 * 1000;
const PACK_SUBMIT_LOCK_MS = 30 * 1000;
const TOKEN_CACHE_TTL_MS = 2 * 60 * 1000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const RANKING_CACHE_TTL_SECONDS = 8;
const RANKING_CACHE_KEY = "ranking:v2";
const RANKING_ZSET_KEY = "ranking:zset:v1";
const RANKING_ZSET_SEEDED_KEY = `${RANKING_ZSET_KEY}:seeded`;
const tokenUserCache = new Map();
const packSubmitLocks = new Map();
let mysqlPool = null;
let redisClient = null;
let redisReady = false;
let mysqlCardsSynced = false;
let supabaseCardsSynced = false;
const SCORE_MILESTONES = [
  { score: 100, drawChances: 1, text: "积分达到 100，奖励 1 次抽卡" },
  { score: 260, drawChances: 1, fragments: 20, text: "积分达到 260，奖励 1 次抽卡 + 20 碎片" },
  { score: 520, drawChances: 2, text: "积分达到 520，奖励 2 次抽卡" },
  { score: 900, drawChances: 3, fragments: 50, text: "积分达到 900，奖励 3 次抽卡 + 50 碎片" }
];
const PACK_MILESTONES = [
  { packs: 5, drawChances: 1, text: "累计开包 5 次，返还 1 次抽卡" },
  { packs: 10, drawChances: 1, fragments: 20, text: "累计开包 10 次，返还 1 次抽卡 + 20 碎片" },
  { packs: 20, drawChances: 2, text: "累计开包 20 次，返还 2 次抽卡" },
  { packs: 35, drawChances: 3, fragments: 40, text: "累计开包 35 次，返还 3 次抽卡 + 40 碎片" }
];

const GAME_IPS = [
  "和平精英",
  "英雄联盟手游",
  "金铲铲之战",
  "待定游戏 IP 04",
  "待定游戏 IP 05",
  "待定游戏 IP 06",
  "待定游戏 IP 07",
  "待定游戏 IP 08",
  "待定游戏 IP 09",
  "待定游戏 IP 10"
];
const COMMUNITY_GROUP = "通用社区梗";
const CARD_GROUPS = [...GAME_IPS, COMMUNITY_GROUP];
const SERIES = CARD_GROUPS;
const NPC_RANKING = [
  { nickname: "高光猎人", score: 680, collected: 12 },
  { nickname: "服务器守夜人", score: 520, collected: 10 },
  { nickname: "下次一定本尊", score: 360, collected: 8 },
  { nickname: "冥场面收藏家", score: 260, collected: 6 },
  { nickname: "新手村夕阳", score: 120, collected: 4 }
];
const RARITIES = {
  normal: { name: "普通", weight: 58, score: 10, fragment: 2, price: 12 },
  rare: { name: "稀有", weight: 27, score: 30, fragment: 6, price: 28 },
  epic: { name: "史诗", weight: 11, score: 80, fragment: 16, price: 70 },
  legend: { name: "传说", weight: 3.5, score: 180, fragment: 36, price: 160 },
  hidden: { name: "隐藏款", weight: 0.5, score: 400, fragment: 80, price: 360 }
};

const KNOWN_CARD_DEFS = [
  ["c001", "丝血反杀", "待定游戏 IP 04", "既有卡牌", "legend", "这波不亏，直接起飞！"],
  ["c002", "人体描边", "和平精英", "彩蛋示例", "normal", "每一枪都很真诚，只是敌人不配合。"],
  ["c003", "伏地魔的胜利", "和平精英", "彩蛋示例", "normal", "待文案策划补充梗评语。"],
  ["c004", "信号枪骗局", "和平精英", "彩蛋示例", "rare", "待文案策划补充梗评语。"],
  ["c005", "闪现撞墙", "英雄联盟手游", "彩蛋示例", "normal", "不是墙太硬，是梦想太近。"],
  ["c006", "0-21 的亚索", "英雄联盟手游", "彩蛋示例", "rare", "待文案策划补充梗评语。"],
  ["c007", "盲僧 R 闪失败", "英雄联盟手游", "彩蛋示例", "epic", "待文案策划补充梗评语。"],
  ["c008", "老八出局", "金铲铲之战", "彩蛋示例", "normal", "待文案策划补充梗评语。"],
  ["c009", "空城连败", "金铲铲之战", "彩蛋示例", "rare", "待文案策划补充梗评语。"],
  ["c010", "D 牌上头", "金铲铲之战", "彩蛋示例", "epic", "待文案策划补充梗评语。"],
  ["c011", "非酋の自我修养", "通用社区梗", "彩蛋示例", "rare", "待文案策划补充梗评语。"],
  ["c012", "下次一定", "通用社区梗", "彩蛋示例", "normal", "最强承诺，最弱执行。"]
];
const PLACEHOLDER_RARITIES = ["normal", "normal", "rare", "normal", "epic", "rare", "normal", "legend", "normal", "rare", "hidden"];
const PLACEHOLDER_CARD_DEFS = Array.from({ length: 42 }, (_, index) => {
  const number = index + 13;
  const idNumber = String(number).padStart(3, "0");
  const displayNumber = String(number).padStart(2, "0");
  const game = CARD_GROUPS[index % CARD_GROUPS.length];
  const rarity = PLACEHOLDER_RARITIES[index % PLACEHOLDER_RARITIES.length];
  return [`c${idNumber}`, `待定卡牌 ${displayNumber}`, game, "待定主题", rarity, "待文案策划补充梗评语。"];
});
const CARD_DEFS = [...KNOWN_CARD_DEFS, ...PLACEHOLDER_CARD_DEFS];

const CARDS = CARD_DEFS.map(([id, name, game, theme, rarity, quote]) => ({
  id,
  name,
  game,
  ip: game,
  theme,
  series: game,
  rarity,
  rarityName: RARITIES[rarity].name,
  score: RARITIES[rarity].score,
  fragment: RARITIES[rarity].fragment,
  price: RARITIES[rarity].price,
  quote
}));

function cardSortOrder(card) {
  return Number.parseInt(String(card.id || "").replace(/\D/g, ""), 10) || 0;
}

function isPlaceholderCard(card) {
  return cardSortOrder(card) > KNOWN_CARD_DEFS.length;
}

function cardCatalogRow(card) {
  return {
    id: card.id,
    name: card.name,
    game: card.game,
    ip: card.ip || card.game,
    theme: card.theme,
    series: card.series || card.game,
    rarity: card.rarity,
    rarityName: card.rarityName,
    score: card.score,
    fragment: card.fragment,
    price: card.price,
    quote: card.quote,
    isPlaceholder: isPlaceholderCard(card),
    sortOrder: cardSortOrder(card)
  };
}

function cardCatalogRows() {
  return CARDS.map(cardCatalogRow);
}

function supabaseCardRow(card) {
  const row = cardCatalogRow(card);
  return {
    id: row.id,
    name: row.name,
    game: row.game,
    ip: row.ip,
    theme: row.theme,
    series: row.series,
    rarity: row.rarity,
    rarity_name: row.rarityName,
    score: row.score,
    fragment: row.fragment,
    price: row.price,
    quote: row.quote,
    is_placeholder: row.isPlaceholder,
    sort_order: row.sortOrder,
    updated_at: new Date().toISOString()
  };
}

function uniqueCardsById(cards) {
  const map = new Map();
  for (const card of cards || []) {
    if (card?.id) map.set(card.id, card);
  }
  return [...map.values()];
}

const COMBOS = [
  { id: "peace-grass-signal", name: "和平精英待定彩蛋", game: "和平精英", cardIds: ["c002", "c003", "c004"], reward: { drawChances: 3 } },
  { id: "lol-reverse-highlight", name: "英雄联盟手游待定彩蛋", game: "英雄联盟手游", cardIds: ["c005", "c006", "c007"], reward: { drawChances: 5 } },
  { id: "jcc-eighth-economy", name: "金铲铲之战待定彩蛋", game: "金铲铲之战", cardIds: ["c008", "c009", "c010"], reward: { fragments: 4 } },
  { id: "community-luck-contract", name: "通用社区梗待定彩蛋", game: "通用社区梗", cardIds: ["c011", "c012"], reward: { fragments: 2 } }
];

const MAX_DAILY_CHALLENGES = 3;
const OPS_EVENTS = [
  {
    id: "version_burnout",
    title: "版本太肝，玩家开始流失",
    context: "玩家吐槽新版本任务像上班，社区热帖已经冲到首页。你作为光仔策划要先处理什么？",
    choices: [
      { id: "reduce_grind", text: "砍掉重复日常，把核心奖励前置", result: "玩家觉得你终于听劝了，口碑回升。", rewards: { reputation: 18, heat: 8, fragments: 12 } },
      { id: "free_draw", text: "发 1 次抽卡补偿，先稳住情绪", result: "短期热度上来了，但玩家还在等后续优化。", rewards: { drawChances: 1, heat: 18, reputation: 4 } },
      { id: "rank_event", text: "加限时冲榜活动，刺激活跃", result: "热度冲得很快，但疲劳玩家更破防了。", rewards: { heat: 28, reputation: -12, fragments: 8 } }
    ]
  },
  {
    id: "server_crash",
    title: "服务器炸了，玩家群沸腾",
    context: "晚高峰突然大面积掉线，群里开始刷屏。你要怎么止损？",
    choices: [
      { id: "clear_notice", text: "先发清晰公告，再补偿碎片", result: "信息透明，玩家至少知道发生了什么。", rewards: { reputation: 16, fragments: 18, heat: 6 } },
      { id: "big_compensation", text: "直接发全服补偿，少解释", result: "大家先去领东西了，讨论热度也被压住。", rewards: { fragments: 30, reputation: 6, heat: 10 } },
      { id: "silent_fix", text: "先闷头修，等好了再说", result: "服务恢复了，但沉默期间口碑掉得很快。", rewards: { heat: 16, reputation: -18, drawChances: 1 } }
    ]
  },
  {
    id: "share_campaign",
    title: "需要设计一个分享活动",
    context: "训练营要看谁的设计更有传播力。你准备怎么让玩家愿意转发？",
    choices: [
      { id: "poster_identity", text: "生成个性化结局海报，让玩家晒身份", result: "玩家愿意晒自己的称号，传播更自然。", rewards: { heat: 22, reputation: 12, drawChances: 1 } },
      { id: "hard_invite", text: "强制邀请 3 个好友才能领奖", result: "数据看起来很高，但反感也在积累。", rewards: { heat: 34, reputation: -20, fragments: 16 } },
      { id: "soft_bonus", text: "分享可领小奖励，不强制好友助力", result: "转发门槛低，虽然爆发没那么猛，但体验稳。", rewards: { heat: 14, reputation: 16, fragments: 20 } }
    ]
  },
  {
    id: "card_design",
    title: "新卡面被吐槽不够有记忆点",
    context: "玩家说卡只是好看，但抽到后没用。你准备怎么改？",
    choices: [
      { id: "card_effects", text: "给稀有卡加被动效果，影响挑战奖励", result: "卡牌从纪念品变成了能力，收集欲上升。", rewards: { reputation: 20, heat: 14, drawChances: 1 } },
      { id: "more_art", text: "继续堆美术表现，先把卡面做帅", result: "视觉变强了，但玩法问题还没有完全解决。", rewards: { heat: 18, fragments: 18, reputation: 4 } },
      { id: "rarity_only", text: "只提高传说卡概率，制造刺激", result: "短期爽感增加，但卡牌价值感被稀释。", rewards: { drawChances: 1, reputation: -10, heat: 20 } }
    ]
  },
  {
    id: "bug_meme",
    title: "BUG 被玩家做成梗图疯传",
    context: "角色模型在结算页突然变形，玩家剪了十几个鬼畜视频。你要怎么接招？",
    choices: [
      { id: "own_meme", text: "官方下场玩梗，同时承诺修复时间", result: "玩家觉得你接得住梗，骂声变成二创素材。", rewards: { heat: 26, reputation: 10, fragments: 12 } },
      { id: "delete_posts", text: "先联系删帖，控制负面传播", result: "热帖少了，但玩家开始截图嘲讽你怕了。", rewards: { reputation: -18, heat: 18 } },
      { id: "hidden_reward", text: "把 BUG 做成限时彩蛋，修复后发纪念卡", result: "灾难被包装成事件，玩家开始主动参与。", rewards: { heat: 22, reputation: 14, drawChances: 1 } }
    ]
  },
  {
    id: "newbie_churn",
    title: "新玩家第一天留存很差",
    context: "数据显示新玩家刚进来就迷路，不知道热度、口碑和碎片有什么用。",
    choices: [
      { id: "onboarding", text: "重做新手引导，先解释目标和奖励循环", result: "玩家终于知道自己为什么要开包和处理事件。", rewards: { reputation: 20, fragments: 10, heat: 8 } },
      { id: "free_pack", text: "注册即送 5 抽，先制造爽感", result: "开局很热闹，但部分玩家抽完就走。", rewards: { drawChances: 2, heat: 18, reputation: 2 } },
      { id: "more_buttons", text: "首页加更多入口，让玩家自己探索", result: "信息更丰富了，也更像一台没有说明书的机器。", rewards: { heat: 10, reputation: -10, fragments: 16 } }
    ]
  },
  {
    id: "whale_pressure",
    title: "付费玩家和普通玩家吵起来了",
    context: "社区争论奖励是不是太偏向重度玩家，普通玩家觉得自己永远追不上。",
    choices: [
      { id: "fair_ladder", text: "把排行榜奖励拆成参与档和冲榜档", result: "高手还有目标，普通玩家也能拿到正反馈。", rewards: { reputation: 18, heat: 12, fragments: 18 } },
      { id: "hard_core", text: "继续强化冲榜刺激，制造头部竞争", result: "榜首打得很凶，但中腰部玩家开始躺平。", rewards: { heat: 28, reputation: -14, drawChances: 1 } },
      { id: "equal_gift", text: "所有人发一样奖励，直接平息争议", result: "争吵暂时停了，但排行榜的追逐感也变弱了。", rewards: { reputation: 12, fragments: 28, heat: 4 } }
    ]
  },
  {
    id: "community_vote",
    title: "下一张卡该做什么，社区吵翻了",
    context: "一派想要高光瞬间，一派想要冥场面，评论区已经变成投票战场。",
    choices: [
      { id: "public_vote", text: "开放投票，让玩家决定下一张卡", result: "玩家参与感爆棚，顺手把投票链接转出去了。", rewards: { heat: 24, reputation: 12, fragments: 10 } },
      { id: "designer_pick", text: "坚持策划判断，直接公布设计理由", result: "理由说清楚后有人理解，但没参与感。", rewards: { reputation: 14, heat: 8, fragments: 14 } },
      { id: "both_cards", text: "两张都做，但降低单张制作规格", result: "大家都有糖吃，不过精品感被稀释了一点。", rewards: { heat: 18, reputation: 4, drawChances: 1 } }
    ]
  },
  {
    id: "boring_loop",
    title: "玩家说每天只是点点点",
    context: "有人吐槽：这不是游戏，是签到表换皮。你要怎么补玩法？",
    choices: [
      { id: "event_choice", text: "加入事件抉择，让奖励和选择绑定", result: "玩家开始讨论不同选择的后果，循环终于有了参与感。", rewards: { reputation: 18, heat: 18, drawChances: 1 } },
      { id: "more_tasks", text: "增加更多每日任务，填满活跃时间", result: "在线时间涨了，但疲劳感也跟着涨。", rewards: { heat: 16, reputation: -8, fragments: 22 } },
      { id: "auto_collect", text: "简化操作，让奖励自动领取", result: "压力降下来了，但可玩内容还是略薄。", rewards: { reputation: 12, fragments: 24, heat: 4 } }
    ]
  },
  {
    id: "bad_luck",
    title: "非酋玩家开始晒黑脸截图",
    context: "有人连续十包没出高稀有，评论区开始质疑概率不透明。",
    choices: [
      { id: "show_rates", text: "公开概率和保底规则", result: "信任感上升，玩家至少知道自己在和什么对赌。", rewards: { reputation: 22, heat: 8, fragments: 12 } },
      { id: "luck_title", text: "给非酋玩家发专属称号和碎片补偿", result: "黑脸也变成可晒的身份，怨气少了不少。", rewards: { heat: 20, reputation: 12, fragments: 24 } },
      { id: "ignore_rng", text: "强调随机就是随机，不做额外说明", result: "逻辑没错，但玩家情绪并不会因为逻辑消失。", rewards: { reputation: -16, heat: 14, drawChances: 1 } }
    ]
  },
  {
    id: "poster_weak",
    title: "分享海报没人愿意转",
    context: "海报信息很全，但像公告截图，玩家没有晒出去的冲动。",
    choices: [
      { id: "identity_poster", text: "突出玩家称号、结局和稀有卡，做成个人战绩", result: "玩家开始把海报当作自己的名片，而不是广告。", rewards: { heat: 24, reputation: 10, drawChances: 1 } },
      { id: "qr_bigger", text: "把二维码放大，转化优先", result: "扫码更清楚了，但转发欲望没有明显变强。", rewards: { heat: 10, fragments: 18, reputation: 4 } },
      { id: "reward_only", text: "只强调分享可领奖", result: "短期点击上升，但分享内容显得有点功利。", rewards: { heat: 20, reputation: -6, fragments: 16 } }
    ]
  },
  {
    id: "balance_patch",
    title: "卡牌效果被吐槽不平衡",
    context: "部分玩家说强卡太强，抽不到的人像少了一个系统。",
    choices: [
      { id: "soft_nerf", text: "降低触发频率，保留爽点", result: "强卡还值得期待，但不会压垮普通玩家。", rewards: { reputation: 18, heat: 8, fragments: 16 } },
      { id: "buff_all", text: "给普通卡也加小效果", result: "每张卡都有点用，卡册价值更完整。", rewards: { reputation: 16, heat: 16, drawChances: 1 } },
      { id: "no_change", text: "不改，强卡就该强", result: "拥有者很爽，没抽到的人开始沉默。", rewards: { heat: 18, reputation: -12, fragments: 12 } }
    ]
  },
  {
    id: "content_delay",
    title: "新内容延期，玩家等急了",
    context: "原定今天上线的新系列卡还没做完，群里已经开始催进度。",
    choices: [
      { id: "dev_log", text: "发布开发日志，展示半成品和延期原因", result: "玩家看到进度后愿意再等等。", rewards: { reputation: 18, heat: 10, fragments: 12 } },
      { id: "teaser", text: "先放一张剪影预告，吊住期待", result: "猜测帖变多了，但也有人嫌你卖关子。", rewards: { heat: 24, reputation: 4, drawChances: 1 } },
      { id: "quiet_delay", text: "不解释，等做完直接上线", result: "上线时内容还行，但等待期间流失了一些关注。", rewards: { reputation: -12, fragments: 24, heat: 8 } }
    ]
  },
  {
    id: "survey_fatigue",
    title: "问卷发太多，玩家开始烦",
    context: "你想收集反馈，但玩家吐槽每次打开都被问卷糊脸。",
    choices: [
      { id: "optional_reward", text: "改成可选入口，完成后给少量碎片", result: "愿意反馈的人留下了，不想填的人也不被打扰。", rewards: { reputation: 16, fragments: 18, heat: 6 } },
      { id: "short_survey", text: "压缩成 3 个问题，结局页再出现", result: "打扰感变低，反馈质量也还可以。", rewards: { reputation: 14, heat: 10, drawChances: 1 } },
      { id: "force_popup", text: "继续强弹，不填不能关", result: "样本量上去了，口碑也下去了。", rewards: { heat: 16, reputation: -18, fragments: 20 } }
    ]
  }
];

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function emptyDb() {
  return {
    users: [],
    sessions: {},
    shares: [],
    events: [],
    cards: cardCatalogRows(),
    playerCards: [],
    scoreEvents: [],
    drawRecords: [],
    packRecords: [],
    packCards: []
  };
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

async function readDb() {
  if (USE_SUPABASE) return readSupabaseDb();
  if (!fs.existsSync(DB_FILE)) {
    const initial = emptyDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  db.users ||= [];
  db.sessions ||= {};
  db.shares ||= [];
  db.events ||= [];
  db.cards = cardCatalogRows();
  db.playerCards ||= [];
  db.scoreEvents ||= [];
  db.drawRecords ||= [];
  db.packRecords ||= [];
  db.packCards ||= [];
  db.users = db.users.filter(isObject);
  for (const user of db.users) ensureUserShape(user);
  return db;
}

async function writeDb(db) {
  if (USE_SUPABASE) return writeSupabaseDb(db);
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

async function supabaseFetch(table, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${options.query || ""}`;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase ${table} ${response.status}: ${detail}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function mysql() {
  if (!mysqlPool) {
    const mysql2 = require("mysql2/promise");
    mysqlPool = mysql2.createPool(MYSQL_CONFIG);
  }
  return mysqlPool;
}

async function mysqlQuery(sql, params = []) {
  const pool = await mysql();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function redis() {
  if (!REDIS_URL) return null;
  if (redisReady) return redisClient;
  if (!redisClient) {
    const { createClient } = require("redis");
    redisClient = createClient({ url: REDIS_URL });
    redisClient.on("error", error => {
      redisReady = false;
      console.error("redis error:", error.message);
    });
  }
  try {
    await redisClient.connect();
    redisReady = true;
    return redisClient;
  } catch (error) {
    console.error("redis connect failed:", error.message);
    return null;
  }
}

async function redisGet(key) {
  const client = await redis();
  if (!client) return null;
  try {
    return client.get(key);
  } catch {
    return null;
  }
}

async function redisSet(key, value, ttlSeconds = null) {
  const client = await redis();
  if (!client) return false;
  try {
    if (ttlSeconds) await client.set(key, value, { EX: ttlSeconds });
    else await client.set(key, value);
    return true;
  } catch {
    return false;
  }
}

async function redisDel(key) {
  const client = await redis();
  if (!client) return false;
  try {
    await client.del(key);
    return true;
  } catch {
    return false;
  }
}

async function redisSend(command) {
  const client = await redis();
  if (!client) return null;
  try {
    return client.sendCommand(command);
  } catch {
    return null;
  }
}

async function redisZAdd(key, score, member) {
  const result = await redisSend(["ZADD", key, String(Number(score) || 0), String(member)]);
  return result != null;
}

async function redisZRevRangeWithScores(key, start = 0, stop = 49) {
  const result = await redisSend(["ZREVRANGE", key, String(start), String(stop), "WITHSCORES"]);
  if (!Array.isArray(result)) return [];
  const rows = [];
  for (let index = 0; index < result.length; index += 2) {
    rows.push({
      member: result[index],
      score: Number(result[index + 1]) || 0
    });
  }
  return rows;
}

function parseJsonValue(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function sqlDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 23).replace("T", " ");
}

function isoDate(value) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function mysqlRowToUser(row) {
  if (!row) return null;
  const user = {
    id: row.id,
    nickname: row.nickname,
    passwordHash: row.password_hash,
    score: row.score,
    fragments: row.fragments,
    heat: row.heat,
    reputation: row.reputation,
    drawChances: row.draw_chances,
    lastRecoveredAt: isoDate(row.last_recovered_at),
    openedPacks: row.opened_packs,
    ownedCards: parseJsonValue(row.owned_cards, {}),
    shareRewards: parseJsonValue(row.share_rewards, {}),
    taskRewards: parseJsonValue(row.task_rewards, {}),
    seriesRewards: parseJsonValue(row.series_rewards, {}),
    milestoneRewards: parseJsonValue(row.milestone_rewards, { score: {}, packs: {} }),
    challengeState: parseJsonValue(row.challenge_state, {}),
    effectState: parseJsonValue(row.effect_state, {})
  };
  ensureUserShape(user);
  return user;
}

function mysqlDrawRecord(row) {
  return {
    id: row.id,
    userId: row.player_id,
    nickname: row.nickname,
    cardId: row.card_id,
    cardName: row.card_name,
    series: row.series,
    rarity: row.rarity,
    rarityName: row.rarity_name,
    duplicated: Boolean(row.duplicated),
    scoreGained: row.score_gained,
    fragmentsGained: row.fragments_gained,
    createdAt: isoDate(row.created_at)
  };
}

function mysqlPackRecord(row) {
  return {
    id: row.id,
    userId: row.player_id,
    nickname: row.nickname,
    status: row.status,
    drawChanceCost: row.draw_chance_cost,
    selectedCount: row.selected_count,
    scoreGained: row.score_gained,
    fragmentsGained: row.fragments_gained,
    drawChanceReward: row.draw_chance_reward,
    abandonedHandId: row.abandoned_hand_id,
    abandonedCardId: row.abandoned_card_id,
    abandonedPoint: row.abandoned_point,
    twentyFourSuccess: row.twenty_four_success == null ? null : Boolean(row.twenty_four_success),
    twentyFourFormula: row.twenty_four_formula || "",
    twentyFourPoints: parseJsonValue(row.twenty_four_points, []),
    createdAt: isoDate(row.created_at),
    submittedAt: row.submitted_at ? isoDate(row.submitted_at) : null
  };
}

function mysqlPackCard(row) {
  return {
    id: row.id,
    packId: row.pack_id,
    userId: row.player_id,
    slot: row.slot,
    cardId: row.card_id,
    cardName: row.card_name,
    series: row.series,
    rarity: row.rarity,
    rarityName: row.rarity_name,
    point: row.point,
    selectionStatus: row.selection_status,
    duplicated: row.duplicated == null ? null : Boolean(row.duplicated),
    scoreGained: row.score_gained,
    fragmentsGained: row.fragments_gained,
    createdAt: isoDate(row.created_at),
    settledAt: row.settled_at ? isoDate(row.settled_at) : null
  };
}

function mysqlEvent(row) {
  const payload = parseJsonValue(row.payload, {});
  return {
    id: row.id,
    type: row.type,
    userId: row.player_id,
    ownerId: payload.ownerId || row.player_id,
    shareId: row.share_id,
    cardId: row.card_id,
    scene: row.scene,
    duplicated: row.duplicated == null ? null : Boolean(row.duplicated),
    rewarded: row.rewarded == null ? null : Boolean(row.rewarded),
    createdAt: isoDate(row.created_at),
    payload
  };
}

function playerCardRow(user, card, source, obtainedAt) {
  const count = Number(user.ownedCards?.[card.id]) || 0;
  return {
    playerId: user.id,
    nickname: user.nickname,
    cardId: card.id,
    cardName: card.name,
    game: card.game,
    series: card.series || card.game,
    rarity: card.rarity,
    rarityName: card.rarityName,
    count,
    firstObtainedAt: obtainedAt,
    lastObtainedAt: obtainedAt,
    source
  };
}

function supabasePlayerCardRow(row) {
  return {
    player_id: row.playerId,
    nickname: row.nickname,
    card_id: row.cardId,
    card_name: row.cardName,
    game: row.game,
    series: row.series,
    rarity: row.rarity,
    rarity_name: row.rarityName,
    count: row.count,
    first_obtained_at: row.firstObtainedAt,
    last_obtained_at: row.lastObtainedAt,
    source: row.source
  };
}

function scoreEventFromDelta(user, options) {
  const delta = Number(options.delta) || 0;
  if (!delta) return null;
  return {
    id: id("score"),
    userId: user.id,
    nickname: user.nickname,
    type: options.type,
    sourceId: options.sourceId || null,
    cardId: options.cardId || options.card?.id || null,
    delta,
    scoreAfter: user.score,
    reason: options.reason || "",
    payload: options.payload || {},
    createdAt: options.createdAt || new Date().toISOString()
  };
}

function supabaseScoreEventRow(event) {
  return {
    id: event.id,
    player_id: event.userId,
    nickname: event.nickname,
    type: event.type,
    source_id: event.sourceId,
    card_id: event.cardId,
    delta: event.delta,
    score_after: event.scoreAfter,
    reason: event.reason,
    payload: event.payload || {},
    created_at: event.createdAt
  };
}

function rankingPlayerRow(user) {
  ensureUserShape(user);
  return {
    player: true,
    userId: user.id,
    nickname: user.nickname,
    score: user.score || 0,
    heat: user.heat || 0,
    reputation: user.reputation || 0,
    title: plannerTitle(user),
    collected: Object.keys(user.ownedCards || {}).length,
    total: CARDS.length
  };
}

function rankingWithNpcs(playerRows) {
  return [...playerRows, ...NPC_RANKING.map(npc => ({ ...npc, total: CARDS.length, player: false }))]
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((row, index) => ({ rank: index + 1, ...row }));
}

async function updateRankingCacheMember(user) {
  if (!user?.id) return;
  await redisZAdd(RANKING_ZSET_KEY, user.score || 0, user.id);
  await redisDel(RANKING_CACHE_KEY);
}

async function markRankingZSetSeeded() {
  await redisSet(RANKING_ZSET_SEEDED_KEY, "1");
}

async function isRankingZSetSeeded() {
  return Boolean(await redisGet(RANKING_ZSET_SEEDED_KEY));
}

async function getMysqlPlayerByNickname(nickname) {
  const rows = await mysqlQuery("select * from players where nickname = ? limit 1", [nickname]);
  return mysqlRowToUser(rows[0]);
}

async function getMysqlPlayerById(userId) {
  const rows = await mysqlQuery("select * from players where id = ? limit 1", [userId]);
  return mysqlRowToUser(rows[0]);
}

async function updateMysqlPlayer(user) {
  ensureUserShape(user);
  await mysqlQuery(
    `insert into players (
      id, nickname, password_hash, score, fragments, heat, reputation,
      draw_chances, last_recovered_at, opened_packs, owned_cards, share_rewards,
      task_rewards, series_rewards, milestone_rewards, challenge_state, effect_state
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on duplicate key update
      nickname = values(nickname),
      password_hash = values(password_hash),
      score = values(score),
      fragments = values(fragments),
      heat = values(heat),
      reputation = values(reputation),
      draw_chances = values(draw_chances),
      last_recovered_at = values(last_recovered_at),
      opened_packs = values(opened_packs),
      owned_cards = values(owned_cards),
      share_rewards = values(share_rewards),
      task_rewards = values(task_rewards),
      series_rewards = values(series_rewards),
      milestone_rewards = values(milestone_rewards),
      challenge_state = values(challenge_state),
      effect_state = values(effect_state)`,
    [
      user.id,
      user.nickname,
      user.passwordHash,
      user.score,
      user.fragments,
      user.heat,
      user.reputation,
      user.drawChances,
      sqlDate(user.lastRecoveredAt),
      user.openedPacks,
      JSON.stringify(user.ownedCards || {}),
      JSON.stringify(user.shareRewards || {}),
      JSON.stringify(user.taskRewards || {}),
      JSON.stringify(user.seriesRewards || {}),
      JSON.stringify(user.milestoneRewards || { score: {}, packs: {} }),
      JSON.stringify(user.challengeState || {}),
      JSON.stringify(user.effectState || {})
    ]
  );
  await updateRankingCacheMember(user);
}

async function setMysqlSession(token, userId) {
  const stored = await redisSet(`session:${token}`, userId, SESSION_TTL_SECONDS);
  if (!stored) {
    await mysqlQuery(
      `insert into sessions (token, player_id, expires_at)
       values (?, ?, ?)
       on duplicate key update player_id = values(player_id), expires_at = values(expires_at)`,
      [token, userId, sqlDate(Date.now() + SESSION_TTL_SECONDS * 1000)]
    );
  }
}

async function getMysqlUserByToken(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const cached = cachedUser(token);
  if (cached) return cached;
  let userId = await redisGet(`session:${token}`);
  if (!userId) {
    const rows = await mysqlQuery(
      "select player_id from sessions where token = ? and expires_at > now(3) limit 1",
      [token]
    );
    userId = rows[0]?.player_id;
  }
  const user = userId ? await getMysqlPlayerById(userId) : null;
  cacheUser(token, user);
  return user;
}

async function insertMysqlEvent(event) {
  await mysqlQuery(
    `insert into events (id, type, player_id, share_id, card_id, scene, duplicated, rewarded, payload, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id || id("evt"),
      event.type,
      event.userId || event.ownerId || null,
      event.shareId || null,
      event.cardId || null,
      event.scene || null,
      event.duplicated == null ? null : Number(Boolean(event.duplicated)),
      event.rewarded == null ? null : Number(Boolean(event.rewarded)),
      JSON.stringify({ ...(event.payload || {}), ownerId: event.ownerId || event.payload?.ownerId }),
      sqlDate(event.createdAt || new Date())
    ]
  );
}

function queueMysqlEvent(event) {
  insertMysqlEvent(event).catch(error => {
    console.error("mysql event insert failed:", error.message);
  });
}

async function ensureMysqlCardsSynced() {
  if (mysqlCardsSynced) return;
  await Promise.all(CARDS.map(card => {
    const row = cardCatalogRow(card);
    return mysqlQuery(
      `insert into cards (
        id, name, game, ip, theme, series, rarity, rarity_name,
        score, fragment, price, quote, is_placeholder, sort_order
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on duplicate key update
        name = values(name),
        game = values(game),
        ip = values(ip),
        theme = values(theme),
        series = values(series),
        rarity = values(rarity),
        rarity_name = values(rarity_name),
        score = values(score),
        fragment = values(fragment),
        price = values(price),
        quote = values(quote),
        is_placeholder = values(is_placeholder),
        sort_order = values(sort_order)`,
      [
        row.id,
        row.name,
        row.game,
        row.ip,
        row.theme,
        row.series,
        row.rarity,
        row.rarityName,
        row.score,
        row.fragment,
        row.price,
        row.quote,
        Number(Boolean(row.isPlaceholder)),
        row.sortOrder
      ]
    );
  }));
  mysqlCardsSynced = true;
}

async function upsertMysqlPlayerCards(user, cards, source, obtainedAt) {
  await ensureMysqlCardsSynced();
  const rows = uniqueCardsById(cards)
    .map(card => playerCardRow(user, card, source, obtainedAt))
    .filter(row => row.count > 0);
  await Promise.all(rows.map(row => mysqlQuery(
    `insert into player_cards (
      player_id, nickname, card_id, card_name, game, series, rarity,
      rarity_name, count, first_obtained_at, last_obtained_at, source
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on duplicate key update
      nickname = values(nickname),
      card_name = values(card_name),
      game = values(game),
      series = values(series),
      rarity = values(rarity),
      rarity_name = values(rarity_name),
      count = values(count),
      last_obtained_at = values(last_obtained_at),
      source = values(source)`,
    [
      row.playerId,
      row.nickname,
      row.cardId,
      row.cardName,
      row.game,
      row.series,
      row.rarity,
      row.rarityName,
      row.count,
      sqlDate(row.firstObtainedAt),
      sqlDate(row.lastObtainedAt),
      row.source
    ]
  )));
}

async function insertMysqlScoreEvent(event) {
  if (!event) return;
  await ensureMysqlCardsSynced();
  await mysqlQuery(
    `insert into score_events (
      id, player_id, nickname, type, source_id, card_id,
      delta, score_after, reason, payload, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.userId,
      event.nickname,
      event.type,
      event.sourceId,
      event.cardId,
      event.delta,
      event.scoreAfter,
      event.reason,
      JSON.stringify(event.payload || {}),
      sqlDate(event.createdAt)
    ]
  );
}

async function insertMysqlDrawRecord(record) {
  await mysqlQuery(
    `insert into draw_records (
      id, player_id, nickname, card_id, card_name, series, rarity, rarity_name,
      duplicated, score_gained, fragments_gained, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.userId,
      record.nickname,
      record.cardId,
      record.cardName,
      record.series,
      record.rarity,
      record.rarityName,
      Number(Boolean(record.duplicated)),
      record.scoreGained,
      record.fragmentsGained,
      sqlDate(record.createdAt)
    ]
  );
}

async function getMysqlRecentDrawRecords(userId, limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20));
  const rows = await mysqlQuery(
    `select * from draw_records where player_id = ? order by created_at desc limit ${safeLimit}`,
    [userId]
  );
  return rows.map(mysqlDrawRecord);
}

async function upsertMysqlPackRecord(record) {
  await mysqlQuery(
    `insert into pack_records (
      id, player_id, nickname, status, draw_chance_cost, selected_count,
      score_gained, fragments_gained, draw_chance_reward,
      abandoned_hand_id, abandoned_card_id, abandoned_point,
      twenty_four_success, twenty_four_formula, twenty_four_points,
      created_at, submitted_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on duplicate key update
      nickname = values(nickname),
      status = values(status),
      selected_count = values(selected_count),
      score_gained = values(score_gained),
      fragments_gained = values(fragments_gained),
      draw_chance_reward = values(draw_chance_reward),
      abandoned_hand_id = values(abandoned_hand_id),
      abandoned_card_id = values(abandoned_card_id),
      abandoned_point = values(abandoned_point),
      twenty_four_success = values(twenty_four_success),
      twenty_four_formula = values(twenty_four_formula),
      twenty_four_points = values(twenty_four_points),
      submitted_at = values(submitted_at)`,
    [
      record.id,
      record.userId,
      record.nickname,
      record.status,
      record.drawChanceCost,
      record.selectedCount,
      record.scoreGained,
      record.fragmentsGained,
      record.drawChanceReward,
      record.abandonedHandId || null,
      record.abandonedCardId || null,
      record.abandonedPoint ?? null,
      record.twentyFourSuccess == null ? null : Number(Boolean(record.twentyFourSuccess)),
      record.twentyFourFormula || null,
      JSON.stringify(record.twentyFourPoints || []),
      sqlDate(record.createdAt),
      record.submittedAt ? sqlDate(record.submittedAt) : null
    ]
  );
}

async function upsertMysqlPackCards(cards) {
  await Promise.all(cards.map(card => mysqlQuery(
    `insert into pack_cards (
      id, pack_id, player_id, slot, card_id, card_name, series, rarity,
      rarity_name, point, selection_status, duplicated, score_gained,
      fragments_gained, created_at, settled_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on duplicate key update
      selection_status = values(selection_status),
      duplicated = values(duplicated),
      score_gained = values(score_gained),
      fragments_gained = values(fragments_gained),
      settled_at = values(settled_at)`,
    [
      card.id,
      card.packId,
      card.userId,
      card.slot,
      card.cardId,
      card.cardName,
      card.series,
      card.rarity,
      card.rarityName,
      card.point,
      card.selectionStatus,
      card.duplicated == null ? null : Number(Boolean(card.duplicated)),
      card.scoreGained,
      card.fragmentsGained,
      sqlDate(card.createdAt),
      card.settledAt ? sqlDate(card.settledAt) : null
    ]
  )));
}

async function getMysqlRecentPackRecords(userId, limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20));
  const rows = await mysqlQuery(
    `select * from pack_records where player_id = ? order by created_at desc limit ${safeLimit}`,
    [userId]
  );
  if (!rows.length) return [];
  const packIds = rows.map(row => row.id);
  const placeholders = packIds.map(() => "?").join(",");
  const cardRows = await mysqlQuery(
    `select * from pack_cards where pack_id in (${placeholders}) order by pack_id asc, slot asc`,
    packIds
  );
  const cardsByPack = new Map();
  for (const card of cardRows.map(mysqlPackCard)) {
    if (!cardsByPack.has(card.packId)) cardsByPack.set(card.packId, []);
    cardsByPack.get(card.packId).push(card);
  }
  return rows.map(row => ({
    ...mysqlPackRecord(row),
    cards: cardsByPack.get(row.id) || []
  }));
}

async function getMysqlTodayUserEvents(userId) {
  const rows = await mysqlQuery(
    "select * from events where player_id = ? and created_at >= ? order by created_at asc",
    [userId, `${today()} 00:00:00.000`]
  );
  return rows.map(mysqlEvent);
}

async function mysqlUserView(user, includeDrawRecords = false) {
  const [drawRecords, events] = await Promise.all([
    includeDrawRecords ? getMysqlRecentDrawRecords(user.id) : Promise.resolve([]),
    getMysqlTodayUserEvents(user.id)
  ]);
  return userView(user, { drawRecords, events });
}

async function getMysqlShareById(shareId) {
  const rows = await mysqlQuery("select * from shares where id = ? limit 1", [shareId]);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.player_id,
    nickname: row.nickname,
    scene: row.scene,
    visits: row.visits,
    rewarded: Boolean(row.rewarded),
    createdAt: isoDate(row.created_at)
  };
}

async function upsertMysqlShare(share) {
  await mysqlQuery(
    `insert into shares (id, player_id, nickname, scene, visits, rewarded, created_at)
     values (?, ?, ?, ?, ?, ?, ?)
     on duplicate key update visits = values(visits), rewarded = values(rewarded)`,
    [
      share.id,
      share.userId,
      share.nickname,
      share.scene,
      share.visits,
      Number(Boolean(share.rewarded)),
      sqlDate(share.createdAt)
    ]
  );
}

async function getMysqlRankingRows() {
  const zsetSeeded = await isRankingZSetSeeded();
  const rankedIds = zsetSeeded ? await redisZRevRangeWithScores(RANKING_ZSET_KEY, 0, 49) : [];
  if (rankedIds.length) {
    const ids = rankedIds.map(item => item.member);
    const placeholders = ids.map(() => "?").join(",");
    const rows = await mysqlQuery(
      `select id, nickname, score, heat, reputation, owned_cards from players where id in (${placeholders})`,
      ids
    );
    const rowById = new Map(rows.map(row => [row.id, row]));
    const playerRows = ids
      .map(userId => rowById.get(userId))
      .filter(Boolean)
      .map(row => rankingPlayerRow(mysqlRowToUser(row)));
    if (playerRows.length) return rankingWithNpcs(playerRows);
  }
  const cached = await redisGet(RANKING_CACHE_KEY);
  if (cached) return JSON.parse(cached);
  const rows = await mysqlQuery(
    "select id, nickname, score, heat, reputation, owned_cards from players order by score desc limit 50"
  );
  const users = rows.map(mysqlRowToUser).filter(Boolean);
  await Promise.all(users.map(updateRankingCacheMember));
  await markRankingZSetSeeded();
  const ranking = rankingWithNpcs(users.map(rankingPlayerRow));
  await redisSet(RANKING_CACHE_KEY, JSON.stringify(ranking), RANKING_CACHE_TTL_SECONDS);
  return ranking;
}

async function invalidateRankingCache() {
  await redisDel(RANKING_CACHE_KEY);
}

async function readSupabaseDb() {
  const [players, sessions, shares, events, drawRecords, packRecords, packCards, playerCards, scoreEvents] = await Promise.all([
    supabaseFetch("players", { query: "?select=*" }),
    supabaseFetch("sessions", { query: "?select=*" }),
    supabaseFetch("shares", { query: "?select=*" }),
    supabaseFetch("events", { query: "?select=*" }),
    supabaseFetch("draw_records", { query: "?select=*" }),
    supabaseFetch("pack_records", { query: "?select=*" }),
    supabaseFetch("pack_cards", { query: "?select=*" }),
    supabaseFetch("player_cards", { query: "?select=*" }),
    supabaseFetch("score_events", { query: "?select=*" })
  ]);
  const db = emptyDb();
  db.users = (players || []).map(row => ({
    id: row.id,
    nickname: row.nickname,
    passwordHash: row.password_hash,
    score: row.score,
    fragments: row.fragments,
    heat: row.heat,
    reputation: row.reputation,
    drawChances: row.draw_chances,
    lastRecoveredAt: row.last_recovered_at,
    openedPacks: row.opened_packs,
    ownedCards: row.owned_cards || {},
    shareRewards: row.share_rewards || {},
    taskRewards: row.task_rewards || {},
    seriesRewards: row.series_rewards || {},
    milestoneRewards: row.milestone_rewards || {},
    challengeState: row.challenge_state || {},
    effectState: row.effect_state || {}
  }));
  for (const row of sessions || []) db.sessions[row.token] = row.player_id;
  db.shares = (shares || []).map(row => ({
    id: row.id,
    userId: row.player_id,
    nickname: row.nickname,
    scene: row.scene,
    visits: row.visits,
    rewarded: row.rewarded,
    createdAt: row.created_at
  }));
  db.events = (events || []).map(row => ({
    id: row.id,
    type: row.type,
    userId: row.player_id,
    ownerId: row.payload?.ownerId,
    shareId: row.share_id,
    cardId: row.card_id,
    scene: row.scene,
    duplicated: row.duplicated,
    rewarded: row.rewarded,
    createdAt: row.created_at,
    payload: row.payload || {}
  }));
  db.drawRecords = (drawRecords || []).map(row => ({
    id: row.id,
    userId: row.player_id,
    nickname: row.nickname,
    cardId: row.card_id,
    cardName: row.card_name,
    series: row.series,
    rarity: row.rarity,
    rarityName: row.rarity_name,
    duplicated: row.duplicated,
    scoreGained: row.score_gained,
    fragmentsGained: row.fragments_gained,
    createdAt: row.created_at
  }));
  db.packRecords = (packRecords || []).map(rowToPackRecord);
  db.packCards = (packCards || []).map(rowToPackCard);
  db.playerCards = (playerCards || []).map(row => ({
    playerId: row.player_id,
    nickname: row.nickname,
    cardId: row.card_id,
    cardName: row.card_name,
    game: row.game,
    series: row.series,
    rarity: row.rarity,
    rarityName: row.rarity_name,
    count: row.count,
    firstObtainedAt: row.first_obtained_at,
    lastObtainedAt: row.last_obtained_at,
    source: row.source
  }));
  db.scoreEvents = (scoreEvents || []).map(row => ({
    id: row.id,
    userId: row.player_id,
    nickname: row.nickname,
    type: row.type,
    sourceId: row.source_id,
    cardId: row.card_id,
    delta: row.delta,
    scoreAfter: row.score_after,
    reason: row.reason,
    payload: row.payload || {},
    createdAt: row.created_at
  }));
  for (const user of db.users) ensureUserShape(user);
  return db;
}

function rowToUser(row) {
  if (!row) return null;
  const user = {
    id: row.id,
    nickname: row.nickname,
    passwordHash: row.password_hash,
    score: row.score,
    fragments: row.fragments,
    heat: row.heat,
    reputation: row.reputation,
    drawChances: row.draw_chances,
    lastRecoveredAt: row.last_recovered_at,
    openedPacks: row.opened_packs,
    ownedCards: row.owned_cards || {},
    shareRewards: row.share_rewards || {},
    taskRewards: row.task_rewards || {},
    seriesRewards: row.series_rewards || {},
    milestoneRewards: row.milestone_rewards || {},
    challengeState: row.challenge_state || {},
    effectState: row.effect_state || {}
  };
  ensureUserShape(user);
  return user;
}

function userToPlayerRow(user) {
  ensureUserShape(user);
  return {
    id: user.id,
    nickname: user.nickname,
    password_hash: user.passwordHash,
    score: user.score,
    fragments: user.fragments,
    heat: user.heat,
    reputation: user.reputation,
    draw_chances: user.drawChances,
    last_recovered_at: user.lastRecoveredAt,
    opened_packs: user.openedPacks,
    owned_cards: user.ownedCards || {},
    share_rewards: user.shareRewards || {},
    task_rewards: user.taskRewards || {},
    series_rewards: user.seriesRewards || {},
    milestone_rewards: user.milestoneRewards || {},
    challenge_state: user.challengeState || {},
    effect_state: user.effectState || {},
    updated_at: new Date().toISOString()
  };
}

function eventToRow(event) {
  return {
    id: event.id || id("evt"),
    type: event.type,
    player_id: event.userId || event.ownerId || null,
    share_id: event.shareId || null,
    card_id: event.cardId || null,
    scene: event.scene || null,
    duplicated: event.duplicated ?? null,
    rewarded: event.rewarded ?? null,
    payload: { ...(event.payload || {}), ownerId: event.ownerId || event.payload?.ownerId },
    created_at: event.createdAt || new Date().toISOString()
  };
}

async function getPlayerByNickname(nickname) {
  const rows = await supabaseFetch("players", {
    query: `?nickname=eq.${encodeURIComponent(nickname)}&select=*&limit=1`
  });
  return rowToUser(rows?.[0]);
}

async function getPlayerById(userId) {
  const rows = await supabaseFetch("players", {
    query: `?id=eq.${encodeURIComponent(userId)}&select=*&limit=1`
  });
  return rowToUser(rows?.[0]);
}

function bearerToken(req) {
  const header = req.headers.authorization || "";
  return header.replace(/^Bearer\s+/i, "");
}

function cacheUser(token, user) {
  if (!token || !user) return;
  tokenUserCache.set(token, {
    user,
    expiresAt: Date.now() + TOKEN_CACHE_TTL_MS
  });
}

function cachedUser(token) {
  const item = tokenUserCache.get(token);
  if (!item) return null;
  if (item.expiresAt < Date.now()) {
    tokenUserCache.delete(token);
    return null;
  }
  item.expiresAt = Date.now() + TOKEN_CACHE_TTL_MS;
  return item.user;
}

async function getUserByToken(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const cached = cachedUser(token);
  if (cached) return cached;
  const sessions = await supabaseFetch("sessions", {
    query: `?token=eq.${encodeURIComponent(token)}&select=player_id&limit=1`
  });
  const playerId = sessions?.[0]?.player_id;
  const user = playerId ? await getPlayerById(playerId) : null;
  cacheUser(token, user);
  return user;
}

async function updatePlayer(user) {
  await upsert("players", [userToPlayerRow(user)], "id");
  await updateRankingCacheMember(user);
}

async function insertSession(token, userId) {
  await supabaseFetch("sessions", {
    method: "POST",
    body: [{ token, player_id: userId }]
  });
}

async function insertEvent(event) {
  await supabaseFetch("events", {
    method: "POST",
    body: [eventToRow(event)]
  });
}

function queueEvent(event) {
  insertEvent(event).catch(error => {
    console.error("event insert failed:", error.message);
  });
}

async function ensureSupabaseCardsSynced() {
  if (supabaseCardsSynced) return;
  await upsert("cards", CARDS.map(supabaseCardRow), "id");
  supabaseCardsSynced = true;
}

async function upsertPlayerCards(user, cards, source, obtainedAt) {
  await ensureSupabaseCardsSynced();
  const rows = uniqueCardsById(cards)
    .map(card => playerCardRow(user, card, source, obtainedAt))
    .filter(row => row.count > 0)
    .map(supabasePlayerCardRow);
  await upsert("player_cards", rows, "player_id,card_id");
}

async function insertScoreEvent(event) {
  if (!event) return;
  await ensureSupabaseCardsSynced();
  await supabaseFetch("score_events", {
    method: "POST",
    body: [supabaseScoreEventRow(event)]
  });
}

async function insertDrawRecord(record) {
  await supabaseFetch("draw_records", {
    method: "POST",
    body: [{
      id: record.id,
      player_id: record.userId,
      nickname: record.nickname,
      card_id: record.cardId,
      card_name: record.cardName,
      series: record.series,
      rarity: record.rarity,
      rarity_name: record.rarityName,
      duplicated: record.duplicated,
      score_gained: record.scoreGained,
      fragments_gained: record.fragmentsGained,
      created_at: record.createdAt
    }]
  });
}

function packRecordToRow(record) {
  return {
    id: record.id,
    player_id: record.userId,
    nickname: record.nickname,
    status: record.status,
    draw_chance_cost: record.drawChanceCost,
    selected_count: record.selectedCount,
    score_gained: record.scoreGained,
    fragments_gained: record.fragmentsGained,
    draw_chance_reward: record.drawChanceReward,
    abandoned_hand_id: record.abandonedHandId || null,
    abandoned_card_id: record.abandonedCardId || null,
    abandoned_point: record.abandonedPoint ?? null,
    twenty_four_success: record.twentyFourSuccess,
    twenty_four_formula: record.twentyFourFormula || null,
    twenty_four_points: record.twentyFourPoints || [],
    created_at: record.createdAt,
    submitted_at: record.submittedAt || null
  };
}

function packCardToRow(card) {
  return {
    id: card.id,
    pack_id: card.packId,
    player_id: card.userId,
    slot: card.slot,
    card_id: card.cardId,
    card_name: card.cardName,
    series: card.series,
    rarity: card.rarity,
    rarity_name: card.rarityName,
    point: card.point,
    selection_status: card.selectionStatus,
    duplicated: card.duplicated,
    score_gained: card.scoreGained,
    fragments_gained: card.fragmentsGained,
    created_at: card.createdAt,
    settled_at: card.settledAt || null
  };
}

function rowToPackRecord(row) {
  return {
    id: row.id,
    userId: row.player_id,
    nickname: row.nickname,
    status: row.status,
    drawChanceCost: row.draw_chance_cost,
    selectedCount: row.selected_count,
    scoreGained: row.score_gained,
    fragmentsGained: row.fragments_gained,
    drawChanceReward: row.draw_chance_reward,
    abandonedHandId: row.abandoned_hand_id,
    abandonedCardId: row.abandoned_card_id,
    abandonedPoint: row.abandoned_point,
    twentyFourSuccess: row.twenty_four_success,
    twentyFourFormula: row.twenty_four_formula || "",
    twentyFourPoints: row.twenty_four_points || [],
    createdAt: row.created_at,
    submittedAt: row.submitted_at || null
  };
}

function rowToPackCard(row) {
  return {
    id: row.id,
    packId: row.pack_id,
    userId: row.player_id,
    slot: row.slot,
    cardId: row.card_id,
    cardName: row.card_name,
    series: row.series,
    rarity: row.rarity,
    rarityName: row.rarity_name,
    point: row.point,
    selectionStatus: row.selection_status,
    duplicated: row.duplicated,
    scoreGained: row.score_gained,
    fragmentsGained: row.fragments_gained,
    createdAt: row.created_at,
    settledAt: row.settled_at || null
  };
}

async function upsertPackRecord(record) {
  await upsert("pack_records", [packRecordToRow(record)], "id");
}

async function upsertPackCards(cards) {
  await upsert("pack_cards", cards.map(packCardToRow), "id");
}

async function getRecentDrawRecords(userId, limit = 20) {
  const rows = await supabaseFetch("draw_records", {
    query: `?player_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=${limit}`
  });
  return (rows || []).map(row => ({
    id: row.id,
    userId: row.player_id,
    nickname: row.nickname,
    cardId: row.card_id,
    cardName: row.card_name,
    series: row.series,
    rarity: row.rarity,
    rarityName: row.rarity_name,
    duplicated: row.duplicated,
    scoreGained: row.score_gained,
    fragmentsGained: row.fragments_gained,
    createdAt: row.created_at
  }));
}

async function getRecentPackRecords(userId, limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20));
  const rows = await supabaseFetch("pack_records", {
    query: `?player_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=${safeLimit}`
  });
  if (!rows?.length) return [];
  const packIds = rows.map(row => row.id);
  const cardRows = await supabaseFetch("pack_cards", {
    query: `?pack_id=in.(${packIds.join(",")})&select=*&order=slot.asc`
  });
  const cardsByPack = new Map();
  for (const card of (cardRows || []).map(rowToPackCard)) {
    if (!cardsByPack.has(card.packId)) cardsByPack.set(card.packId, []);
    cardsByPack.get(card.packId).push(card);
  }
  return rows.map(row => ({
    ...rowToPackRecord(row),
    cards: cardsByPack.get(row.id) || []
  }));
}

async function getTodayUserEvents(userId) {
  const start = `${today()}T00:00:00.000Z`;
  const rows = await supabaseFetch("events", {
    query: `?player_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(start)}&select=*`
  });
  return (rows || []).map(row => ({
    id: row.id,
    type: row.type,
    userId: row.player_id,
    ownerId: row.payload?.ownerId || row.player_id,
    shareId: row.share_id,
    cardId: row.card_id,
    scene: row.scene,
    duplicated: row.duplicated,
    rewarded: row.rewarded,
    createdAt: row.created_at,
    payload: row.payload || {}
  }));
}

async function userViewFromSupabase(user) {
  const [drawRecords, events] = await Promise.all([
    getRecentDrawRecords(user.id),
    getTodayUserEvents(user.id)
  ]);
  return userView(user, { drawRecords, events });
}

async function userViewWithTodayEvents(user) {
  const events = await getTodayUserEvents(user.id);
  return userView(user, { drawRecords: [], events });
}

async function getShareById(shareId) {
  const rows = await supabaseFetch("shares", {
    query: `?id=eq.${encodeURIComponent(shareId)}&select=*&limit=1`
  });
  const row = rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.player_id,
    nickname: row.nickname,
    scene: row.scene,
    visits: row.visits,
    rewarded: row.rewarded,
    createdAt: row.created_at
  };
}

async function insertShare(share) {
  await upsert("shares", [{
    id: share.id,
    player_id: share.userId,
    nickname: share.nickname,
    scene: share.scene,
    visits: share.visits,
    rewarded: share.rewarded,
    created_at: share.createdAt
  }], "id");
}

async function updateShare(share) {
  await insertShare(share);
}

async function getRankingPlayers() {
  const zsetSeeded = await isRankingZSetSeeded();
  const rankedIds = zsetSeeded ? await redisZRevRangeWithScores(RANKING_ZSET_KEY, 0, 49) : [];
  if (rankedIds.length) {
    const ids = rankedIds.map(item => item.member);
    const rows = await supabaseFetch("players", {
      query: `?id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,nickname,score,heat,reputation,owned_cards`
    });
    const rowById = new Map((rows || []).map(row => [row.id, row]));
    const orderedRows = ids.map(userId => rowById.get(userId)).filter(Boolean);
    if (orderedRows.length) return orderedRows;
  }
  const rows = await supabaseFetch("players", {
    query: "?select=id,nickname,score,heat,reputation,owned_cards&order=score.desc&limit=50"
  });
  await Promise.all((rows || []).map(row => updateRankingCacheMember(rowToUser(row))));
  await markRankingZSetSeeded();
  return rows || [];
}

async function upsert(table, rows, conflict) {
  if (!rows.length) return;
  await supabaseFetch(table, {
    method: "POST",
    query: `?on_conflict=${conflict}`,
    headers: { Prefer: "resolution=merge-duplicates" },
    body: rows
  });
}

async function writeSupabaseDb(db) {
  await upsert("cards", CARDS.map(supabaseCardRow), "id");
  await upsert("players", db.users.map(user => ({
    id: user.id,
    nickname: user.nickname,
    password_hash: user.passwordHash,
    score: user.score,
    fragments: user.fragments,
    heat: user.heat,
    reputation: user.reputation,
    draw_chances: user.drawChances,
    last_recovered_at: user.lastRecoveredAt,
    opened_packs: user.openedPacks,
    owned_cards: user.ownedCards || {},
    share_rewards: user.shareRewards || {},
    task_rewards: user.taskRewards || {},
    series_rewards: user.seriesRewards || {},
    milestone_rewards: user.milestoneRewards || {},
    challenge_state: user.challengeState || {},
    effect_state: user.effectState || {},
    updated_at: new Date().toISOString()
  })), "id");
  await upsert("sessions", Object.entries(db.sessions).map(([token, userId]) => ({
    token,
    player_id: userId
  })), "token");
  await upsert("shares", db.shares.map(share => ({
    id: share.id,
    player_id: share.userId,
    nickname: share.nickname,
    scene: share.scene,
    visits: share.visits,
    rewarded: share.rewarded,
    created_at: share.createdAt
  })), "id");
  await upsert("draw_records", db.drawRecords.map(record => ({
    id: record.id,
    player_id: record.userId,
    nickname: record.nickname,
    card_id: record.cardId,
    card_name: record.cardName,
    series: record.series,
    rarity: record.rarity,
    rarity_name: record.rarityName,
    duplicated: record.duplicated,
    score_gained: record.scoreGained,
    fragments_gained: record.fragmentsGained,
    created_at: record.createdAt
  })), "id");
  await upsert("pack_records", (db.packRecords || []).map(packRecordToRow), "id");
  await upsert("pack_cards", (db.packCards || []).map(packCardToRow), "id");
  await upsert("player_cards", (db.playerCards || []).map(supabasePlayerCardRow), "player_id,card_id");
  await upsert("score_events", (db.scoreEvents || []).map(supabaseScoreEventRow), "id");
  await upsert("events", db.events.map(event => ({
    id: event.id,
    type: event.type,
    player_id: event.userId || event.ownerId || null,
    share_id: event.shareId || null,
    card_id: event.cardId || null,
    scene: event.scene || null,
    duplicated: event.duplicated ?? null,
    rewarded: event.rewarded ?? null,
    payload: { ...event.payload, ownerId: event.ownerId || event.payload?.ownerId },
    created_at: event.createdAt
  })), "id");
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  });
  res.end(JSON.stringify(data));
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(FRONTEND_DIR, pathname));
  if (!filePath.startsWith(FRONTEND_DIR)) return json(res, 403, { message: "Forbidden" });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const fallback = path.join(FRONTEND_DIR, "index.html");
    return sendFile(res, fallback);
  }
  return sendFile(res, filePath);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function hash(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function normalizeAccount(value) {
  return String(value || "").trim().toLowerCase();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dayIndex(date = today()) {
  return Math.floor(new Date(`${date}T00:00:00.000Z`).getTime() / 86_400_000);
}

function plannerTitle(user) {
  ensureUserShape(user);
  const total = user.heat + user.reputation + Object.keys(user.ownedCards).length * 12;
  if (total >= 260) return "顶级共鸣策划";
  if (total >= 170) return "高光运营官";
  if (total >= 90) return "社区救火队长";
  return "见习名场面策划";
}

function endingText(user) {
  ensureUserShape(user);
  if (user.reputation >= 120 && user.heat >= 120) return "你把热度和口碑都稳住了，玩家开始期待下一次活动。";
  if (user.heat >= 150 && user.reputation < 60) return "你制造了爆点，但社区也留下了不少争议。";
  if (user.reputation >= 120) return "你赢得了玩家信任，虽然热度还需要继续破圈。";
  return "世界还没有崩塌，但你的策划案还需要更多高光时刻。";
}

function userView(user, db = null) {
  ensureUserShape(user);
  const drawHistory = db
    ? db.drawRecords.filter(record => record.userId === user.id).slice(-20).reverse()
    : [];
  return {
    id: user.id,
    nickname: user.nickname,
    score: user.score,
    fragments: user.fragments,
    heat: user.heat,
    reputation: user.reputation,
    plannerTitle: plannerTitle(user),
    endingText: endingText(user),
    drawChances: user.drawChances,
    maxDrawChances: MAX_DRAW_CHANCES,
    lastRecoveredAt: user.lastRecoveredAt,
    recoveryIntervalMs: DRAW_RECOVERY_INTERVAL_MS,
    openedPacks: user.openedPacks,
    ownedCards: user.ownedCards,
    shareRewards: user.shareRewards || {},
    taskRewards: user.taskRewards || {},
    seriesRewards: user.seriesRewards || {},
    milestoneRewards: user.milestoneRewards || {},
    challengeState: user.challengeState || {},
    effectState: user.effectState || {},
    comboRewards: user.effectState.comboRewards || {},
    combos: comboSummary(user),
    drawRecords: drawHistory,
    tasks: taskStatus(user, db)
  };
}

function ensureUserShape(user) {
  if (!isObject(user)) return;
  user.id ||= id("usr");
  user.nickname ||= user.username || "拾忆者";
  user.ownedCards ||= {};
  user.shareRewards ||= {};
  user.taskRewards ||= {};
  user.seriesRewards ||= {};
  user.milestoneRewards ||= {};
  user.milestoneRewards.score ||= {};
  user.milestoneRewards.packs ||= {};
  user.challengeState ||= {};
  user.effectState ||= {};
  if (!isObject(user.effectState)) user.effectState = {};
  if (!isObject(user.effectState.comboRewards)) user.effectState.comboRewards = {};
  user.fragments ||= 0;
  user.score ||= 0;
  user.heat ||= 0;
  user.reputation ||= 0;
  user.drawChances ||= 0;
  user.drawChances = Math.min(user.drawChances, MAX_DRAW_CHANCES);
  user.lastRecoveredAt ||= new Date().toISOString();
  user.openedPacks ||= 0;
}

function addDrawChances(user, amount) {
  ensureUserShape(user);
  user.drawChances = Math.min(MAX_DRAW_CHANCES, user.drawChances + amount);
  if (user.drawChances >= MAX_DRAW_CHANCES) user.lastRecoveredAt = new Date().toISOString();
}

function recoverDrawChances(user, now = new Date()) {
  ensureUserShape(user);
  if (user.drawChances >= MAX_DRAW_CHANCES) {
    user.lastRecoveredAt = now.toISOString();
    return 0;
  }
  const lastTime = Date.parse(user.lastRecoveredAt);
  if (!Number.isFinite(lastTime)) {
    user.lastRecoveredAt = now.toISOString();
    return 0;
  }
  const elapsed = now.getTime() - lastTime;
  if (elapsed < DRAW_RECOVERY_INTERVAL_MS) return 0;
  const recoverable = Math.floor(elapsed / DRAW_RECOVERY_INTERVAL_MS);
  const gained = Math.min(recoverable, MAX_DRAW_CHANCES - user.drawChances);
  user.drawChances += gained;
  user.lastRecoveredAt = user.drawChances >= MAX_DRAW_CHANCES
    ? now.toISOString()
    : new Date(lastTime + recoverable * DRAW_RECOVERY_INTERVAL_MS).toISOString();
  return gained;
}

function todayChallengeState(user) {
  ensureUserShape(user);
  const date = today();
  user.challengeState[date] ||= { count: 0, choices: [] };
  user.challengeState[date].choices ||= [];
  user.challengeState[date].count ||= user.challengeState[date].choices.length;
  return user.challengeState[date];
}

function seededNumber(seed) {
  const value = crypto.createHash("sha256").update(seed).digest().readUInt32BE(0);
  return value / 0xffffffff;
}

function dailyEventOrder(user) {
  const date = today();
  return OPS_EVENTS
    .map(event => ({ event, roll: seededNumber(`${date}:${user.id}:${event.id}`) }))
    .sort((a, b) => a.roll - b.roll)
    .map(item => item.event);
}

function currentChallenge(user) {
  const state = todayChallengeState(user);
  if (state.count >= MAX_DAILY_CHALLENGES) return null;
  return dailyEventOrder(user)[state.count % OPS_EVENTS.length];
}

function publicChallenge(event) {
  if (!event) return null;
  return {
    id: event.id,
    title: event.title,
    context: event.context,
    choices: event.choices.map(choice => ({ id: choice.id, text: choice.text }))
  };
}

function challengeSummary(user) {
  const state = todayChallengeState(user);
  return {
    todayCount: state.count,
    maxDaily: MAX_DAILY_CHALLENGES,
    remaining: Math.max(0, MAX_DAILY_CHALLENGES - state.count),
    completed: state.count >= MAX_DAILY_CHALLENGES,
    event: publicChallenge(currentChallenge(user)),
    recentChoices: state.choices.slice(-3).reverse()
  };
}

function markEffectUsed(user, effectId) {
  const key = `${today()}:${effectId}`;
  if (user.effectState[key]) return false;
  user.effectState[key] = true;
  return true;
}

function ownsNamedCard(user, name) {
  ensureUserShape(user);
  return CARDS.some(card => card.name === name && user.ownedCards[card.id]);
}

function applyCardEffects(user, rewards) {
  ensureUserShape(user);
  const effects = [];
  if (ownsNamedCard(user, "丝血反杀") && rewards.reputation < 0 && markEffectUsed(user, "silk_blood_counter")) {
    effects.push("丝血反杀：抵消本次口碑损失");
    rewards.reputation = 0;
  }
  if (ownsNamedCard(user, "全服补偿") && rewards.fragments > 0) {
    effects.push("全服补偿：额外 +5 碎片");
    rewards.fragments += 5;
  }
  if (ownsNamedCard(user, "五杀时刻") && rewards.drawChances > 0 && markEffectUsed(user, "pentakill_moment")) {
    effects.push("五杀时刻：额外 +1 抽卡");
    rewards.drawChances += 1;
  }
  if (ownsNamedCard(user, "服务器维护") && rewards.heat > 0) {
    effects.push("服务器维护：事件热度额外 +4");
    rewards.heat += 4;
  }
  return effects;
}

function applyChallengeRewards(user, rewards) {
  const result = {
    heat: rewards.heat || 0,
    reputation: rewards.reputation || 0,
    fragments: rewards.fragments || 0,
    drawChances: rewards.drawChances || 0
  };
  const effects = applyCardEffects(user, result);
  user.heat = Math.max(0, user.heat + result.heat);
  user.reputation = Math.max(0, user.reputation + result.reputation);
  user.fragments += result.fragments;
  if (result.drawChances) addDrawChances(user, result.drawChances);
  user.score += Math.max(0, result.heat) + Math.max(0, result.reputation) * 2;
  return { rewards: result, effects };
}

function currentUser(req, db) {
  const header = req.headers.authorization || "";
  const token = header.replace(/^Bearer\s+/i, "");
  const userId = db.sessions[token];
  return userId ? db.users.find(user => user.id === userId) : null;
}

function weightedCard() {
  const rarityKeys = Object.keys(RARITIES);
  const total = rarityKeys.reduce((sum, key) => sum + RARITIES[key].weight, 0);
  let roll = Math.random() * total;
  let rarity = "normal";
  for (const key of rarityKeys) {
    roll -= RARITIES[key].weight;
    if (roll <= 0) {
      rarity = key;
      break;
    }
  }
  const pool = CARDS.filter(card => card.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomPoint() {
  return Math.floor(Math.random() * 13) + 1;
}

function cardById(cardId) {
  return CARDS.find(card => card.id === cardId);
}

function publicHandCard(entry) {
  const card = cardById(entry.cardId);
  if (!card) return null;
  return {
    ...card,
    handId: entry.handId,
    slot: entry.slot,
    point: entry.point
  };
}

function activePendingPack(user) {
  ensureUserShape(user);
  const pack = user.effectState.pendingPack;
  if (!pack || !Array.isArray(pack.cards) || pack.cards.length !== 4) return null;
  if (pack.cards.some(entry => !entry.handId || !cardById(entry.cardId) || !entry.point)) return null;
  return pack;
}

function packSubmitLockKey(user, pack) {
  return `${user.id}:${pack.id}`;
}

function cleanupPackSubmitLocks(now = Date.now()) {
  for (const [key, lockedAt] of packSubmitLocks) {
    if (now - lockedAt >= PACK_SUBMIT_LOCK_MS) packSubmitLocks.delete(key);
  }
}

function beginPackSubmit(user, pack) {
  const now = Date.now();
  cleanupPackSubmitLocks(now);
  const key = packSubmitLockKey(user, pack);
  if (packSubmitLocks.has(key)) {
    const error = new Error("本次开包正在结算，请稍候");
    error.status = 409;
    throw error;
  }
  packSubmitLocks.set(key, now);
  pack.submittingAt = new Date(now).toISOString();
  return key;
}

function releasePackSubmit(user, pack, key = packSubmitLockKey(user, pack)) {
  packSubmitLocks.delete(key);
  const currentPack = activePendingPack(user);
  if (currentPack?.id === pack.id) delete currentPack.submittingAt;
}

function createPendingPack(user) {
  ensureUserShape(user);
  const pack = {
    id: id("pack"),
    createdAt: new Date().toISOString(),
    cards: Array.from({ length: 4 }, (_, index) => {
      const card = weightedCard();
      return {
        handId: id("hand"),
        slot: index + 1,
        cardId: card.id,
        point: randomPoint()
      };
    })
  };
  user.effectState.pendingPack = pack;
  return pack;
}

function clearPendingPack(user) {
  ensureUserShape(user);
  delete user.effectState.pendingPack;
}

function packView(pack) {
  return {
    id: pack.id,
    createdAt: pack.createdAt,
    maxSelections: 3,
    cards: pack.cards.map(publicHandCard).filter(Boolean)
  };
}

function selectedPackEntries(pack, selectedHandIds) {
  const ids = Array.isArray(selectedHandIds)
    ? selectedHandIds.map(value => String(value || "").trim()).filter(Boolean)
    : [];
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length !== 3) {
    const error = new Error("请选择 3 张卡牌后再确认");
    error.status = 400;
    throw error;
  }
  const selected = uniqueIds.map(handId => pack.cards.find(entry => entry.handId === handId));
  if (selected.some(entry => !entry)) {
    const error = new Error("手牌已失效，请重新开包");
    error.status = 409;
    throw error;
  }
  return selected;
}

function solveTwentyFour(points) {
  const items = points.map(point => ({ value: Number(point), expr: String(point) }));
  const seen = new Set();

  function search(list) {
    if (list.length === 1) {
      return Math.abs(list[0].value - 24) < 1e-8 ? list[0].expr : null;
    }
    const key = list.map(item => `${Math.round(item.value * 1e8) / 1e8}:${item.expr}`).sort().join("|");
    if (seen.has(key)) return null;
    seen.add(key);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const rest = list.filter((_, index) => index !== i && index !== j);
        const candidates = [
          { value: a.value + b.value, expr: `(${a.expr} + ${b.expr})` },
          { value: a.value - b.value, expr: `(${a.expr} - ${b.expr})` },
          { value: b.value - a.value, expr: `(${b.expr} - ${a.expr})` },
          { value: a.value * b.value, expr: `(${a.expr} × ${b.expr})` }
        ];
        if (Math.abs(b.value) > 1e-8) candidates.push({ value: a.value / b.value, expr: `(${a.expr} ÷ ${b.expr})` });
        if (Math.abs(a.value) > 1e-8) candidates.push({ value: b.value / a.value, expr: `(${b.expr} ÷ ${a.expr})` });
        for (const candidate of candidates) {
          const result = search([...rest, candidate]);
          if (result) return result;
        }
      }
    }
    return null;
  }

  return search(items);
}

function settlePendingPack(user, pack, selectedEntries) {
  const selectedIds = new Set(selectedEntries.map(entry => entry.handId));
  const abandonedEntry = pack.cards.find(entry => !selectedIds.has(entry.handId));
  const selectedCards = [];

  for (const entry of selectedEntries) {
    const card = cardById(entry.cardId);
    const oldCount = user.ownedCards[card.id] || 0;
    const result = {
      ...publicHandCard(entry),
      duplicated: oldCount > 0,
      scoreGained: 0,
      fragmentsGained: 0
    };
    if (oldCount > 0) {
      user.ownedCards[card.id] = oldCount + 1;
      user.fragments += card.fragment;
      result.fragmentsGained = card.fragment;
    } else {
      user.ownedCards[card.id] = 1;
      user.score += card.score;
      result.scoreGained = card.score;
    }
    selectedCards.push(result);
  }

  const points = selectedCards.map(card => card.point);
  const formula = solveTwentyFour(points);
  const twentyFour = {
    success: Boolean(formula),
    formula: formula || "",
    points
  };
  if (formula) addDrawChances(user, 1);
  user.openedPacks += 1;
  clearPendingPack(user);

  return {
    packId: pack.id,
    selectedCards,
    abandonedCard: publicHandCard(abandonedEntry),
    twentyFour
  };
}

function drawRecordFromPackResult(user, card, createdAt) {
  return {
    id: id("draw"),
    userId: user.id,
    nickname: user.nickname,
    cardId: card.id,
    cardName: card.name,
    series: card.series,
    rarity: card.rarity,
    rarityName: card.rarityName,
    duplicated: card.duplicated,
    scoreGained: card.scoreGained,
    fragmentsGained: card.fragmentsGained,
    createdAt
  };
}

function drawEventFromPack(user, result, createdAt) {
  return {
    type: "draw",
    userId: user.id,
    scene: "pack_submit",
    createdAt,
    payload: {
      packId: result.packId,
      selected: result.selectedCards.map(card => ({
        handId: card.handId,
        cardId: card.id,
        point: card.point,
        duplicated: card.duplicated,
        scoreGained: card.scoreGained,
        fragmentsGained: card.fragmentsGained
      })),
      abandoned: result.abandonedCard ? {
        handId: result.abandonedCard.handId,
        cardId: result.abandonedCard.id,
        point: result.abandonedCard.point
      } : null,
      twentyFour: result.twentyFour
    }
  };
}

function packRecordFromStart(user, pack) {
  return {
    id: pack.id,
    userId: user.id,
    nickname: user.nickname,
    status: "pending",
    drawChanceCost: 1,
    selectedCount: 0,
    scoreGained: 0,
    fragmentsGained: 0,
    drawChanceReward: 0,
    abandonedHandId: null,
    abandonedCardId: null,
    abandonedPoint: null,
    twentyFourSuccess: null,
    twentyFourFormula: "",
    twentyFourPoints: [],
    createdAt: pack.createdAt,
    submittedAt: null
  };
}

function packRecordFromResult(user, pack, result, submittedAt) {
  return {
    ...packRecordFromStart(user, pack),
    status: "submitted",
    selectedCount: result.selectedCards.length,
    scoreGained: result.selectedCards.reduce((sum, card) => sum + card.scoreGained, 0),
    fragmentsGained: result.selectedCards.reduce((sum, card) => sum + card.fragmentsGained, 0),
    drawChanceReward: result.twentyFour.success ? 1 : 0,
    abandonedHandId: result.abandonedCard?.handId || null,
    abandonedCardId: result.abandonedCard?.id || null,
    abandonedPoint: result.abandonedCard?.point ?? null,
    twentyFourSuccess: result.twentyFour.success,
    twentyFourFormula: result.twentyFour.formula,
    twentyFourPoints: result.twentyFour.points,
    submittedAt
  };
}

function packCardRecordFromCard(user, pack, card, selectionStatus, settledAt = null) {
  return {
    id: card.handId,
    packId: pack.id,
    userId: user.id,
    slot: card.slot,
    cardId: card.id,
    cardName: card.name,
    series: card.series,
    rarity: card.rarity,
    rarityName: card.rarityName,
    point: card.point,
    selectionStatus,
    duplicated: card.duplicated ?? null,
    scoreGained: card.scoreGained || 0,
    fragmentsGained: card.fragmentsGained || 0,
    createdAt: pack.createdAt,
    settledAt
  };
}

function packCardRecordsFromStart(user, pack) {
  return pack.cards
    .map(publicHandCard)
    .filter(Boolean)
    .map(card => packCardRecordFromCard(user, pack, card, "pending"));
}

function packCardRecordsFromResult(user, pack, result, settledAt) {
  return [
    ...result.selectedCards.map(card => packCardRecordFromCard(user, pack, card, "selected", settledAt)),
    packCardRecordFromCard(user, pack, result.abandonedCard, "abandoned", settledAt)
  ];
}

function upsertLocalById(items, item) {
  const index = items.findIndex(current => current.id === item.id);
  if (index >= 0) items[index] = item;
  else items.push(item);
}

function insertLocalPackStart(db, user, pack) {
  db.packRecords ||= [];
  db.packCards ||= [];
  upsertLocalById(db.packRecords, packRecordFromStart(user, pack));
  for (const card of packCardRecordsFromStart(user, pack)) upsertLocalById(db.packCards, card);
}

function settleLocalPack(db, user, pack, result, settledAt) {
  db.packRecords ||= [];
  db.packCards ||= [];
  upsertLocalById(db.packRecords, packRecordFromResult(user, pack, result, settledAt));
  for (const card of packCardRecordsFromResult(user, pack, result, settledAt)) upsertLocalById(db.packCards, card);
}

function upsertLocalPlayerCards(db, user, cards, source, obtainedAt) {
  db.playerCards ||= [];
  for (const card of uniqueCardsById(cards)) {
    const next = playerCardRow(user, card, source, obtainedAt);
    if (next.count <= 0) continue;
    const index = db.playerCards.findIndex(row => row.playerId === next.playerId && row.cardId === next.cardId);
    if (index >= 0) {
      db.playerCards[index] = {
        ...db.playerCards[index],
        ...next,
        firstObtainedAt: db.playerCards[index].firstObtainedAt || next.firstObtainedAt
      };
    } else {
      db.playerCards.push(next);
    }
  }
}

function appendLocalScoreEvent(db, event) {
  if (!event) return;
  db.scoreEvents ||= [];
  db.scoreEvents.push(event);
}

async function insertMysqlPackStart(user, pack) {
  await Promise.all([
    upsertMysqlPackRecord(packRecordFromStart(user, pack)),
    upsertMysqlPackCards(packCardRecordsFromStart(user, pack))
  ]);
}

async function settleMysqlPack(user, pack, result, settledAt) {
  await Promise.all([
    upsertMysqlPackRecord(packRecordFromResult(user, pack, result, settledAt)),
    upsertMysqlPackCards(packCardRecordsFromResult(user, pack, result, settledAt))
  ]);
}

async function insertPackStart(user, pack) {
  await Promise.all([
    upsertPackRecord(packRecordFromStart(user, pack)),
    upsertPackCards(packCardRecordsFromStart(user, pack))
  ]);
}

async function settlePack(user, pack, result, settledAt) {
  await Promise.all([
    upsertPackRecord(packRecordFromResult(user, pack, result, settledAt)),
    upsertPackCards(packCardRecordsFromResult(user, pack, result, settledAt))
  ]);
}

function record(db, event) {
  db.events.push({ id: id("evt"), createdAt: new Date().toISOString(), ...event });
}

function todayEvents(db, predicate) {
  const prefix = today();
  return db.events.filter(event => event.createdAt?.startsWith(prefix) && predicate(event));
}

function taskStatus(user, db = null) {
  ensureUserShape(user);
  const date = today();
  const drawCount = db ? todayEvents(db, event => event.type === "draw" && event.userId === user.id).length : 0;
  const shareJumpCount = db ? todayEvents(db, event => event.type === "share_visit" && event.ownerId === user.id).length : 0;
  const collectionCount = Object.keys(user.ownedCards).length;
  return [
    {
      id: "draw3",
      title: "今日开 3 包",
      progress: Math.min(drawCount, 3),
      target: 3,
      reward: "+1 抽卡",
      claimed: Boolean(user.taskRewards[`${date}:draw3`])
    },
    {
      id: "share1",
      title: "完成 1 次分享跳转",
      progress: Math.min(shareJumpCount, 1),
      target: 1,
      reward: "+20 碎片",
      claimed: Boolean(user.taskRewards[`${date}:share1`])
    },
    {
      id: "collect4",
      title: "收集 4 张不同卡",
      progress: Math.min(collectionCount, 4),
      target: 4,
      reward: "+30 碎片",
      claimed: Boolean(user.taskRewards[`${date}:collect4`])
    }
  ];
}

function applyDailyTasks(user, db) {
  ensureUserShape(user);
  const date = today();
  const rewards = [];
  const rules = [
    { id: "draw3", done: todayEvents(db, event => event.type === "draw" && event.userId === user.id).length >= 3, drawChances: 1, text: "今日开 3 包完成，奖励 1 次抽卡" },
    { id: "share1", done: todayEvents(db, event => event.type === "share_visit" && event.ownerId === user.id).length >= 1, fragments: 20, text: "分享跳转任务完成，奖励 20 碎片" },
    { id: "collect4", done: Object.keys(user.ownedCards).length >= 4, fragments: 30, text: "收集 4 张不同卡完成，奖励 30 碎片" }
  ];
  for (const rule of rules) {
    const key = `${date}:${rule.id}`;
    if (!rule.done || user.taskRewards[key]) continue;
    user.taskRewards[key] = true;
    if (rule.drawChances) addDrawChances(user, rule.drawChances);
    if (rule.fragments) user.fragments += rule.fragments;
    rewards.push(rule.text);
  }
  return rewards;
}

function comboRewardText(reward = {}) {
  return [
    reward.drawChances ? `${reward.drawChances} 次抽卡机会` : "",
    reward.fragments ? `${reward.fragments} 碎片` : ""
  ].filter(Boolean).join(" + ");
}

function publicCombo(combo, claimed = null) {
  return {
    id: combo.id,
    name: combo.name,
    game: combo.game,
    rewardText: comboRewardText(combo.reward),
    triggeredAt: claimed?.triggeredAt || ""
  };
}

function comboSummary(user) {
  ensureUserShape(user);
  const claimed = user.effectState.comboRewards || {};
  const triggered = COMBOS
    .filter(combo => claimed[combo.id])
    .map(combo => publicCombo(combo, claimed[combo.id]));
  return {
    total: COMBOS.length,
    discovered: triggered.length,
    triggered
  };
}

function grantComboReward(user, combo) {
  if (combo.reward.drawChances) addDrawChances(user, combo.reward.drawChances);
  if (combo.reward.fragments) user.fragments += combo.reward.fragments;
}

function applyComboRewards(user) {
  ensureUserShape(user);
  const rewards = [];
  for (const combo of COMBOS) {
    const completed = combo.cardIds.every(cardId => user.ownedCards[cardId]);
    if (!completed || user.effectState.comboRewards[combo.id]) continue;
    user.effectState.comboRewards[combo.id] = { triggeredAt: new Date().toISOString() };
    grantComboReward(user, combo);
    rewards.push(`发现隐藏彩蛋「${combo.name}」，奖励 ${comboRewardText(combo.reward)}`);
  }
  return rewards;
}

function applyMilestoneRewards(user) {
  ensureUserShape(user);
  const rewards = [];
  for (const milestone of SCORE_MILESTONES) {
    const key = String(milestone.score);
    if (user.score < milestone.score || user.milestoneRewards.score[key]) continue;
    user.milestoneRewards.score[key] = true;
    if (milestone.drawChances) addDrawChances(user, milestone.drawChances);
    if (milestone.fragments) user.fragments += milestone.fragments;
    rewards.push(milestone.text);
  }
  for (const milestone of PACK_MILESTONES) {
    const key = String(milestone.packs);
    if (user.openedPacks < milestone.packs || user.milestoneRewards.packs[key]) continue;
    user.milestoneRewards.packs[key] = true;
    if (milestone.drawChances) addDrawChances(user, milestone.drawChances);
    if (milestone.fragments) user.fragments += milestone.fragments;
    rewards.push(milestone.text);
  }
  return rewards;
}

async function handleMySQL(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/cards") {
      await ensureMysqlCardsSynced();
      return json(res, 200, { cards: CARDS, games: CARD_GROUPS, series: SERIES, rarities: RARITIES, comboTotal: COMBOS.length });
    }

    if (req.method === "POST" && url.pathname === "/api/register") {
      const body = await parseBody(req);
      const password = String(body.password || "");
      const nickname = normalizeAccount(body.nickname || body.username);
      if (!/^[a-z0-9_\u4e00-\u9fa5]{2,18}$/i.test(nickname) || password.length < 3) {
        return json(res, 400, { message: "账号需 2-18 位，可用中文、字母、数字、下划线；密码至少 3 位" });
      }
      if (await getMysqlPlayerByNickname(nickname)) {
        return json(res, 409, { message: "这个名字已经被注册了，要不再换一个捏" });
      }
      const user = {
        id: id("usr"),
        passwordHash: hash(password),
        nickname,
        score: 0,
        fragments: 0,
        heat: 0,
        reputation: 0,
        drawChances: 3,
        lastRecoveredAt: new Date().toISOString(),
        openedPacks: 0,
        ownedCards: {},
        shareRewards: {},
        taskRewards: {},
        seriesRewards: {},
        milestoneRewards: { score: {}, packs: {} },
        challengeState: {},
        effectState: {}
      };
      const token = id("tok");
      await updateMysqlPlayer(user);
      await setMysqlSession(token, user.id);
      cacheUser(token, user);
      queueMysqlEvent({ type: "register", userId: user.id });
      return json(res, 200, { token, user: userView(user, { drawRecords: [], events: [] }) });
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      const body = await parseBody(req);
      const nickname = normalizeAccount(body.nickname || body.username);
      const user = await getMysqlPlayerByNickname(nickname);
      if (!user || user.passwordHash !== hash(String(body.password || ""))) {
        return json(res, 401, { message: "账号或密码错误" });
      }
      const token = id("tok");
      const recovered = recoverDrawChances(user);
      if (recovered) await updateMysqlPlayer(user);
      await setMysqlSession(token, user.id);
      cacheUser(token, user);
      queueMysqlEvent({ type: "login", userId: user.id });
      return json(res, 200, { token, user: userView(user, { drawRecords: [], events: [] }) });
    }

    if (req.method === "GET" && url.pathname === "/api/profile") {
      const user = await getMysqlUserByToken(req);
      if (!user) return json(res, 401, { message: "请先登录" });
      const recovered = recoverDrawChances(user);
      const events = await getMysqlTodayUserEvents(user.id);
      const rewards = [
        ...applyDailyTasks(user, { events, drawRecords: [] }),
        ...applyComboRewards(user),
        ...applyMilestoneRewards(user)
      ];
      if (recovered || rewards.length) {
        await updateMysqlPlayer(user);
        await invalidateRankingCache();
      }
      return json(res, 200, { user: await mysqlUserView(user, true), rewards });
    }

    if (req.method === "GET" && url.pathname === "/api/challenge") {
      const user = await getMysqlUserByToken(req);
      if (!user) return json(res, 401, { message: "请先登录" });
      const recovered = recoverDrawChances(user);
      if (recovered) await updateMysqlPlayer(user);
      return json(res, 200, { challenge: challengeSummary(user), user: await mysqlUserView(user) });
    }

    if (req.method === "POST" && url.pathname === "/api/challenge/choose") {
      const user = await getMysqlUserByToken(req);
      if (!user) return json(res, 401, { message: "请先登录" });
      recoverDrawChances(user);
      const state = todayChallengeState(user);
      if (state.count >= MAX_DAILY_CHALLENGES) return json(res, 400, { message: "今日事件已处理完" });
      const event = currentChallenge(user);
      const body = await parseBody(req);
      if (!event || body.eventId !== event.id) return json(res, 409, { message: "事件已刷新，请重试" });
      const choice = event.choices.find(item => item.id === body.choiceId);
      if (!choice) return json(res, 404, { message: "选项不存在" });
      const outcome = applyChallengeRewards(user, { ...choice.rewards });
      const entry = {
        id: id("chg"),
        eventId: event.id,
        eventTitle: event.title,
        choiceId: choice.id,
        choiceText: choice.text,
        result: choice.result,
        rewards: outcome.rewards,
        effects: outcome.effects,
        createdAt: new Date().toISOString()
      };
      const scoreEvent = scoreEventFromDelta(user, {
        type: "challenge",
        sourceId: entry.id,
        delta: Math.max(0, outcome.rewards.heat) + Math.max(0, outcome.rewards.reputation) * 2,
        reason: "challenge_reward",
        payload: { eventId: event.id, choiceId: choice.id },
        createdAt: entry.createdAt
      });
      state.count += 1;
      state.choices.push(entry);
      const challengeEvent = { type: "challenge", userId: user.id, scene: event.id, payload: entry, createdAt: entry.createdAt };
      queueMysqlEvent(challengeEvent);
      const events = await getMysqlTodayUserEvents(user.id);
      events.push(challengeEvent);
      const rewards = [
        ...applyDailyTasks(user, { events, drawRecords: [] }),
        ...applyComboRewards(user),
        ...applyMilestoneRewards(user)
      ];
      await insertMysqlScoreEvent(scoreEvent);
      await updateMysqlPlayer(user);
      await invalidateRankingCache();
      return json(res, 200, {
        outcome: entry,
        rewards,
        challenge: challengeSummary(user),
        user: userView(user, { drawRecords: [], events })
      });
    }

    if (req.method === "POST" && url.pathname === "/api/draw") {
      const user = await getMysqlUserByToken(req);
      if (!user) return json(res, 401, { message: "请先登录" });
      const recovered = recoverDrawChances(user);
      const currentPack = activePendingPack(user);
      if (currentPack) {
        if (recovered) await updateMysqlPlayer(user);
        return json(res, 200, {
          pack: packView(currentPack),
          pending: true,
          user: userView(user, { drawRecords: [], events: await getMysqlTodayUserEvents(user.id) })
        });
      }
      if (user.drawChances <= 0) return json(res, 400, { message: "抽卡次数不足" });
      user.drawChances -= 1;
      const pack = createPendingPack(user);
      await insertMysqlPackStart(user, pack);
      await updateMysqlPlayer(user);
      return json(res, 200, { pack: packView(pack), pending: false, user: userView(user, { drawRecords: [], events: await getMysqlTodayUserEvents(user.id) }) });
    }

    if (req.method === "POST" && url.pathname === "/api/draw/submit") {
      const user = await getMysqlUserByToken(req);
      if (!user) return json(res, 401, { message: "请先登录" });
      const pack = activePendingPack(user);
      if (!pack) return json(res, 400, { message: "请先开包获得 4 张手牌" });
      let selectedEntries;
      let locked = false;
      let lockKey = "";
      try {
        lockKey = beginPackSubmit(user, pack);
        locked = true;
        const body = await parseBody(req);
        selectedEntries = selectedPackEntries(pack, body.selectedHandIds);
      } catch (error) {
        if (locked) releasePackSubmit(user, pack, lockKey);
        return json(res, error.status || 400, { message: error.message });
      }
      const result = settlePendingPack(user, pack, selectedEntries);
      const createdAt = new Date().toISOString();
      const drawRecords = result.selectedCards.map(card => drawRecordFromPackResult(user, card, createdAt));
      const drawEvent = drawEventFromPack(user, result, createdAt);
      const scoreEvent = scoreEventFromDelta(user, {
        type: "draw_new_cards",
        sourceId: result.packId,
        delta: result.selectedCards.reduce((sum, card) => sum + card.scoreGained, 0),
        reason: "draw_new_cards",
        payload: { cardIds: result.selectedCards.filter(card => card.scoreGained > 0).map(card => card.id) },
        createdAt
      });
      const [events] = await Promise.all([
        getMysqlTodayUserEvents(user.id),
        Promise.all(drawRecords.map(insertMysqlDrawRecord)),
        settleMysqlPack(user, pack, result, createdAt),
        upsertMysqlPlayerCards(user, result.selectedCards, "draw", createdAt)
      ]);
      queueMysqlEvent(drawEvent);
      events.push(drawEvent);
      const rewards = [
        ...applyDailyTasks(user, { events, drawRecords: [] }),
        ...applyComboRewards(user),
        ...applyMilestoneRewards(user)
      ];
      await insertMysqlScoreEvent(scoreEvent);
      await updateMysqlPlayer(user);
      await invalidateRankingCache();
      return json(res, 200, { result, drawRecords, rewards, user: userView(user, { drawRecords, events }) });
    }

    if (req.method === "POST" && url.pathname === "/api/exchange") {
      const user = await getMysqlUserByToken(req);
      if (!user) return json(res, 401, { message: "请先登录" });
      recoverDrawChances(user);
      const body = await parseBody(req);
      const card = CARDS.find(item => item.id === body.cardId);
      if (!card) return json(res, 404, { message: "卡牌不存在" });
      if (user.ownedCards[card.id]) return json(res, 400, { message: "你已经拥有这张卡" });
      if (user.fragments < card.price) return json(res, 400, { message: "碎片不足" });
      user.fragments -= card.price;
      user.ownedCards[card.id] = 1;
      user.score += card.score;
      const createdAt = new Date().toISOString();
      const scoreEvent = scoreEventFromDelta(user, {
        type: "exchange_card",
        sourceId: card.id,
        card,
        delta: card.score,
        reason: "exchange_card",
        createdAt
      });
      queueMysqlEvent({ type: "exchange", userId: user.id, cardId: card.id, createdAt });
      const events = await getMysqlTodayUserEvents(user.id);
      const rewards = [
        ...applyDailyTasks(user, { events, drawRecords: [] }),
        ...applyComboRewards(user),
        ...applyMilestoneRewards(user)
      ];
      await upsertMysqlPlayerCards(user, [card], "exchange", createdAt);
      await insertMysqlScoreEvent(scoreEvent);
      await updateMysqlPlayer(user);
      await invalidateRankingCache();
      return json(res, 200, { card, rewards, user: userView(user, { drawRecords: [], events }) });
    }

    if (req.method === "POST" && url.pathname === "/api/share/create") {
      const user = await getMysqlUserByToken(req);
      if (!user) return json(res, 401, { message: "请先登录" });
      const recovered = recoverDrawChances(user);
      const body = await parseBody(req);
      const scene = String(body.scene || "invite");
      const share = {
        id: id("shr"),
        userId: user.id,
        nickname: user.nickname,
        scene,
        visits: 0,
        rewarded: false,
        createdAt: new Date().toISOString()
      };
      await upsertMysqlShare(share);
      queueMysqlEvent({ type: "share_create", userId: user.id, shareId: share.id, scene });
      if (recovered) await updateMysqlPlayer(user);
      return json(res, 200, { share, shareUrl: `../frontend/share.html?shareId=${share.id}` });
    }

    if (req.method === "POST" && url.pathname === "/api/share/visit") {
      const body = await parseBody(req);
      const share = await getMysqlShareById(String(body.shareId || ""));
      if (!share) return json(res, 404, { message: "分享不存在" });
      const owner = await getMysqlPlayerById(share.userId);
      if (!owner) return json(res, 404, { message: "分享者不存在" });
      recoverDrawChances(owner);
      share.visits += 1;
      let reward = null;
      const key = `${today()}:${share.scene}`;
      if (!owner.shareRewards[key]) owner.shareRewards[key] = 0;
      if (owner.shareRewards[key] < 1) {
        owner.shareRewards[key] += 1;
        addDrawChances(owner, 1);
        share.rewarded = true;
        reward = { drawChances: 1, message: "分享跳转奖励已到账" };
      }
      await upsertMysqlShare(share);
      const shareEvent = {
        type: "share_visit",
        shareId: share.id,
        ownerId: owner.id,
        scene: share.scene,
        rewarded: Boolean(reward),
        createdAt: new Date().toISOString()
      };
      queueMysqlEvent(shareEvent);
      const events = await getMysqlTodayUserEvents(owner.id);
      events.push(shareEvent);
      const rewards = [...applyDailyTasks(owner, { events, drawRecords: [] }), ...applyMilestoneRewards(owner)];
      await updateMysqlPlayer(owner);
      return json(res, 200, { share, owner: { nickname: owner.nickname }, reward, taskRewards: rewards });
    }

    if (req.method === "GET" && url.pathname === "/api/ranking") {
      return json(res, 200, { ranking: await getMysqlRankingRows() });
    }

    if (req.method === "GET" && url.pathname === "/api/stats") {
      await ensureMysqlCardsSynced();
      const [users, shares, visits, draws, packs, cards, playerCards, scoreEvents] = await Promise.all([
        mysqlQuery("select count(*) as count from players"),
        mysqlQuery("select count(*) as count from shares"),
        mysqlQuery("select count(*) as count from events where type = 'share_visit'"),
        mysqlQuery("select count(*) as count from draw_records"),
        mysqlQuery("select count(*) as count from pack_records"),
        mysqlQuery("select count(*) as count from cards"),
        mysqlQuery("select count(*) as count from player_cards"),
        mysqlQuery("select count(*) as count from score_events")
      ]);
      return json(res, 200, {
        users: users[0]?.count || 0,
        shares: shares[0]?.count || 0,
        visits: visits[0]?.count || 0,
        draws: draws[0]?.count || 0,
        packs: packs[0]?.count || 0,
        cards: cards[0]?.count || 0,
        playerCards: playerCards[0]?.count || 0,
        scoreEvents: scoreEvents[0]?.count || 0
      });
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      const rows = await mysqlQuery(
        "select id, nickname, score, heat, reputation, fragments, draw_chances, opened_packs, owned_cards from players order by created_at desc"
      );
      const users = await Promise.all(rows.map(async row => ({
        id: row.id,
        nickname: row.nickname,
        score: row.score || 0,
        heat: row.heat || 0,
        reputation: row.reputation || 0,
        fragments: row.fragments || 0,
        drawChances: row.draw_chances || 0,
        openedPacks: row.opened_packs || 0,
        collected: Object.keys(parseJsonValue(row.owned_cards, {})).length,
        drawRecords: await getMysqlRecentDrawRecords(row.id, 50),
        packRecords: await getMysqlRecentPackRecords(row.id, 20)
      })));
      return json(res, 200, { users });
    }

    return json(res, 404, { message: "接口不存在" });
  } catch (error) {
    return json(res, 500, { message: "服务器错误", detail: error.message });
  }
}

async function handleSupabase(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/cards") {
      await ensureSupabaseCardsSynced();
      return json(res, 200, { cards: CARDS, games: CARD_GROUPS, series: SERIES, rarities: RARITIES, comboTotal: COMBOS.length });
    }

    if (req.method === "POST" && url.pathname === "/api/register") {
      const body = await parseBody(req);
      const password = String(body.password || "");
      const nickname = normalizeAccount(body.nickname || body.username);
      if (!/^[a-z0-9_\u4e00-\u9fa5]{2,18}$/i.test(nickname) || password.length < 3) {
        return json(res, 400, { message: "账号需 2-18 位，可用中文、字母、数字、下划线；密码至少 3 位" });
      }
      if (await getPlayerByNickname(nickname)) {
        return json(res, 409, { message: "这个名字已经被注册了，要不再换一个捏" });
      }
      const user = {
        id: id("usr"),
        passwordHash: hash(password),
        nickname,
        score: 0,
        fragments: 0,
        heat: 0,
        reputation: 0,
        drawChances: 3,
        lastRecoveredAt: new Date().toISOString(),
        openedPacks: 0,
        ownedCards: {},
        shareRewards: {},
        taskRewards: {},
        seriesRewards: {},
        milestoneRewards: { score: {}, packs: {} },
        challengeState: {},
        effectState: {}
      };
      const token = id("tok");
      await updatePlayer(user);
      await insertSession(token, user.id);
      cacheUser(token, user);
      queueEvent({ type: "register", userId: user.id });
      return json(res, 200, { token, user: userView(user, { drawRecords: [], events: [] }) });
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      const body = await parseBody(req);
      const nickname = normalizeAccount(body.nickname || body.username);
      const user = await getPlayerByNickname(nickname);
      if (!user || user.passwordHash !== hash(String(body.password || ""))) {
        return json(res, 401, { message: "账号或密码错误" });
      }
      const token = id("tok");
      const recovered = recoverDrawChances(user);
      if (recovered) await updatePlayer(user);
      await insertSession(token, user.id);
      cacheUser(token, user);
      queueEvent({ type: "login", userId: user.id });
      return json(res, 200, { token, user: userView(user, { drawRecords: [], events: [] }) });
    }

    if (req.method === "GET" && url.pathname === "/api/profile") {
      const user = await getUserByToken(req);
      if (!user) return json(res, 401, { message: "请先登录" });
      const recovered = recoverDrawChances(user);
      const events = await getTodayUserEvents(user.id);
      const rewards = [
        ...applyDailyTasks(user, { events, drawRecords: [] }),
        ...applyComboRewards(user),
        ...applyMilestoneRewards(user)
      ];
      if (recovered || rewards.length) await updatePlayer(user);
      return json(res, 200, { user: await userViewFromSupabase(user), rewards });
    }

    if (req.method === "GET" && url.pathname === "/api/challenge") {
      const user = await getUserByToken(req);
      if (!user) return json(res, 401, { message: "请先登录" });
      const recovered = recoverDrawChances(user);
      if (recovered) await updatePlayer(user);
      return json(res, 200, { challenge: challengeSummary(user), user: await userViewWithTodayEvents(user) });
    }

    if (req.method === "POST" && url.pathname === "/api/challenge/choose") {
      const user = await getUserByToken(req);
      if (!user) return json(res, 401, { message: "请先登录" });
      recoverDrawChances(user);
      const state = todayChallengeState(user);
      if (state.count >= MAX_DAILY_CHALLENGES) return json(res, 400, { message: "今日事件已处理完" });
      const event = currentChallenge(user);
      const body = await parseBody(req);
      if (!event || body.eventId !== event.id) return json(res, 409, { message: "事件已刷新，请重试" });
      const choice = event.choices.find(item => item.id === body.choiceId);
      if (!choice) return json(res, 404, { message: "选项不存在" });
      const outcome = applyChallengeRewards(user, { ...choice.rewards });
      const entry = {
        id: id("chg"),
        eventId: event.id,
        eventTitle: event.title,
        choiceId: choice.id,
        choiceText: choice.text,
        result: choice.result,
        rewards: outcome.rewards,
        effects: outcome.effects,
        createdAt: new Date().toISOString()
      };
      const scoreEvent = scoreEventFromDelta(user, {
        type: "challenge",
        sourceId: entry.id,
        delta: Math.max(0, outcome.rewards.heat) + Math.max(0, outcome.rewards.reputation) * 2,
        reason: "challenge_reward",
        payload: { eventId: event.id, choiceId: choice.id },
        createdAt: entry.createdAt
      });
      state.count += 1;
      state.choices.push(entry);
      queueEvent({ type: "challenge", userId: user.id, scene: event.id, payload: entry });
      const events = await getTodayUserEvents(user.id);
      const rewards = [
        ...applyDailyTasks(user, { events, drawRecords: [] }),
        ...applyComboRewards(user),
        ...applyMilestoneRewards(user)
      ];
      await insertScoreEvent(scoreEvent);
      await updatePlayer(user);
      return json(res, 200, {
        outcome: entry,
        rewards,
        challenge: challengeSummary(user),
        user: userView(user, { drawRecords: [], events })
      });
    }

    if (req.method === "POST" && url.pathname === "/api/draw") {
      const user = await getUserByToken(req);
      if (!user) return json(res, 401, { message: "请先登录" });
      const recovered = recoverDrawChances(user);
      const currentPack = activePendingPack(user);
      if (currentPack) {
        if (recovered) await updatePlayer(user);
        return json(res, 200, {
          pack: packView(currentPack),
          pending: true,
          user: userView(user, { drawRecords: [], events: await getTodayUserEvents(user.id) })
        });
      }
      if (user.drawChances <= 0) return json(res, 400, { message: "抽卡次数不足" });
      user.drawChances -= 1;
      const pack = createPendingPack(user);
      await insertPackStart(user, pack);
      await updatePlayer(user);
      return json(res, 200, { pack: packView(pack), pending: false, user: userView(user, { drawRecords: [], events: await getTodayUserEvents(user.id) }) });
    }

    if (req.method === "POST" && url.pathname === "/api/draw/submit") {
      const user = await getUserByToken(req);
      if (!user) return json(res, 401, { message: "请先登录" });
      const pack = activePendingPack(user);
      if (!pack) return json(res, 400, { message: "请先开包获得 4 张手牌" });
      let selectedEntries;
      let locked = false;
      let lockKey = "";
      try {
        lockKey = beginPackSubmit(user, pack);
        locked = true;
        const body = await parseBody(req);
        selectedEntries = selectedPackEntries(pack, body.selectedHandIds);
      } catch (error) {
        if (locked) releasePackSubmit(user, pack, lockKey);
        return json(res, error.status || 400, { message: error.message });
      }
      const result = settlePendingPack(user, pack, selectedEntries);
      const createdAt = new Date().toISOString();
      const drawRecords = result.selectedCards.map(card => drawRecordFromPackResult(user, card, createdAt));
      const drawEvent = drawEventFromPack(user, result, createdAt);
      const scoreEvent = scoreEventFromDelta(user, {
        type: "draw_new_cards",
        sourceId: result.packId,
        delta: result.selectedCards.reduce((sum, card) => sum + card.scoreGained, 0),
        reason: "draw_new_cards",
        payload: { cardIds: result.selectedCards.filter(card => card.scoreGained > 0).map(card => card.id) },
        createdAt
      });
      queueEvent(drawEvent);
      const [events] = await Promise.all([
        getTodayUserEvents(user.id),
        Promise.all(drawRecords.map(insertDrawRecord)),
        settlePack(user, pack, result, createdAt),
        upsertPlayerCards(user, result.selectedCards, "draw", createdAt)
      ]);
      events.push(drawEvent);
      const rewards = [
        ...applyDailyTasks(user, { events, drawRecords: [] }),
        ...applyComboRewards(user),
        ...applyMilestoneRewards(user)
      ];
      await insertScoreEvent(scoreEvent);
      await updatePlayer(user);
      return json(res, 200, { result, drawRecords, rewards, user: userView(user, { drawRecords, events }) });
    }

    if (req.method === "POST" && url.pathname === "/api/exchange") {
      const user = await getUserByToken(req);
      if (!user) return json(res, 401, { message: "请先登录" });
      recoverDrawChances(user);
      const body = await parseBody(req);
      const card = CARDS.find(item => item.id === body.cardId);
      if (!card) return json(res, 404, { message: "卡牌不存在" });
      if (user.ownedCards[card.id]) return json(res, 400, { message: "你已经拥有这张卡" });
      if (user.fragments < card.price) return json(res, 400, { message: "碎片不足" });
      user.fragments -= card.price;
      user.ownedCards[card.id] = 1;
      user.score += card.score;
      const createdAt = new Date().toISOString();
      const scoreEvent = scoreEventFromDelta(user, {
        type: "exchange_card",
        sourceId: card.id,
        card,
        delta: card.score,
        reason: "exchange_card",
        createdAt
      });
      queueEvent({ type: "exchange", userId: user.id, cardId: card.id, createdAt });
      const events = await getTodayUserEvents(user.id);
      const rewards = [
        ...applyDailyTasks(user, { events, drawRecords: [] }),
        ...applyComboRewards(user),
        ...applyMilestoneRewards(user)
      ];
      await upsertPlayerCards(user, [card], "exchange", createdAt);
      await insertScoreEvent(scoreEvent);
      await updatePlayer(user);
      return json(res, 200, { card, rewards, user: userView(user, { drawRecords: [], events }) });
    }

    if (req.method === "POST" && url.pathname === "/api/share/create") {
      const user = await getUserByToken(req);
      if (!user) return json(res, 401, { message: "请先登录" });
      const recovered = recoverDrawChances(user);
      const body = await parseBody(req);
      const scene = String(body.scene || "invite");
      const share = {
        id: id("shr"),
        userId: user.id,
        nickname: user.nickname,
        scene,
        visits: 0,
        rewarded: false,
        createdAt: new Date().toISOString()
      };
      await insertShare(share);
      queueEvent({ type: "share_create", userId: user.id, shareId: share.id, scene });
      if (recovered) await updatePlayer(user);
      return json(res, 200, { share, shareUrl: `../frontend/share.html?shareId=${share.id}` });
    }

    if (req.method === "POST" && url.pathname === "/api/share/visit") {
      const body = await parseBody(req);
      const share = await getShareById(String(body.shareId || ""));
      if (!share) return json(res, 404, { message: "分享不存在" });
      const owner = await getPlayerById(share.userId);
      if (!owner) return json(res, 404, { message: "分享者不存在" });
      recoverDrawChances(owner);
      share.visits += 1;
      let reward = null;
      const key = `${today()}:${share.scene}`;
      if (!owner.shareRewards[key]) owner.shareRewards[key] = 0;
      if (owner.shareRewards[key] < 1) {
        owner.shareRewards[key] += 1;
        addDrawChances(owner, 1);
        share.rewarded = true;
        reward = { drawChances: 1, message: "分享跳转奖励已到账" };
      }
      await updateShare(share);
      const shareEvent = {
        type: "share_visit",
        shareId: share.id,
        ownerId: owner.id,
        scene: share.scene,
        rewarded: Boolean(reward),
        createdAt: new Date().toISOString()
      };
      queueEvent(shareEvent);
      const events = await getTodayUserEvents(owner.id);
      events.push(shareEvent);
      const rewards = [...applyDailyTasks(owner, { events, drawRecords: [] }), ...applyMilestoneRewards(owner)];
      await updatePlayer(owner);
      return json(res, 200, { share, owner: { nickname: owner.nickname }, reward, taskRewards: rewards });
    }

    if (req.method === "GET" && url.pathname === "/api/ranking") {
      const players = await getRankingPlayers();
      const playerRows = players.map(row => {
        const user = rowToUser(row);
        return {
          player: true,
          userId: row.id,
          nickname: row.nickname,
          score: row.score || 0,
          heat: row.heat || 0,
          reputation: row.reputation || 0,
          title: plannerTitle(user),
          collected: Object.keys(row.owned_cards || {}).length,
          total: CARDS.length
        };
      });
      const ranking = [...playerRows, ...NPC_RANKING.map(npc => ({ ...npc, total: CARDS.length, player: false }))]
        .sort((a, b) => b.score - a.score)
        .slice(0, 50)
        .map((row, index) => ({ rank: index + 1, ...row }));
      return json(res, 200, { ranking });
    }

    if (req.method === "GET" && url.pathname === "/api/stats") {
      await ensureSupabaseCardsSynced();
      const [users, shares, visits, draws, packs, cards, playerCards, scoreEvents] = await Promise.all([
        supabaseFetch("players", { query: "?select=id" }),
        supabaseFetch("shares", { query: "?select=id" }),
        supabaseFetch("events", { query: "?type=eq.share_visit&select=id" }),
        supabaseFetch("draw_records", { query: "?select=id" }),
        supabaseFetch("pack_records", { query: "?select=id" }),
        supabaseFetch("cards", { query: "?select=id" }),
        supabaseFetch("player_cards", { query: "?select=player_id,card_id" }),
        supabaseFetch("score_events", { query: "?select=id" })
      ]);
      return json(res, 200, {
        users: users?.length || 0,
        shares: shares?.length || 0,
        visits: visits?.length || 0,
        draws: draws?.length || 0,
        packs: packs?.length || 0,
        cards: cards?.length || 0,
        playerCards: playerCards?.length || 0,
        scoreEvents: scoreEvents?.length || 0
      });
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      const players = await supabaseFetch("players", {
        query: "?select=id,nickname,score,heat,reputation,fragments,draw_chances,opened_packs,owned_cards&order=created_at.desc"
      });
      const users = await Promise.all((players || []).map(async row => ({
        id: row.id,
        nickname: row.nickname,
        score: row.score || 0,
        heat: row.heat || 0,
        reputation: row.reputation || 0,
        fragments: row.fragments || 0,
        drawChances: row.draw_chances || 0,
        openedPacks: row.opened_packs || 0,
        collected: Object.keys(row.owned_cards || {}).length,
        drawRecords: await getRecentDrawRecords(row.id, 50),
        packRecords: await getRecentPackRecords(row.id, 20)
      })));
      return json(res, 200, { users });
    }

    return json(res, 404, { message: "接口不存在" });
  } catch (error) {
    return json(res, 500, { message: "服务器错误", detail: error.message });
  }
}

async function handle(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});

  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!url.pathname.startsWith("/api/")) return serveStatic(req, res, url);
  if (USE_MYSQL) return handleMySQL(req, res, url);
  if (USE_SUPABASE) return handleSupabase(req, res, url);
  const db = await readDb();

  try {
    if (req.method === "GET" && url.pathname === "/api/cards") {
      db.cards = cardCatalogRows();
      await writeDb(db);
      return json(res, 200, { cards: CARDS, games: CARD_GROUPS, series: SERIES, rarities: RARITIES, comboTotal: COMBOS.length });
    }

    if (req.method === "POST" && url.pathname === "/api/register") {
      const body = await parseBody(req);
      const password = String(body.password || "");
      const nickname = normalizeAccount(body.nickname || body.username);
      if (!/^[a-z0-9_\u4e00-\u9fa5]{2,18}$/i.test(nickname) || password.length < 3) {
        return json(res, 400, { message: "账号需 2-18 位，可用中文、字母、数字、下划线；密码至少 3 位" });
      }
      if (db.users.some(user => user.nickname === nickname)) {
        return json(res, 409, { message: "这个名字已经被注册了，要不再换一个捏" });
      }
      const user = {
        id: id("usr"),
        passwordHash: hash(password),
        nickname,
        score: 0,
        fragments: 0,
        heat: 0,
        reputation: 0,
        drawChances: 3,
        lastRecoveredAt: new Date().toISOString(),
        openedPacks: 0,
        ownedCards: {},
        shareRewards: {},
        taskRewards: {},
        seriesRewards: {},
        milestoneRewards: { score: {}, packs: {} },
        challengeState: {},
        effectState: {}
      };
      const token = id("tok");
      db.users.push(user);
      db.sessions[token] = user.id;
      record(db, { type: "register", userId: user.id });
      await writeDb(db);
      return json(res, 200, { token, user: userView(user, db) });
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      const body = await parseBody(req);
      const nickname = normalizeAccount(body.nickname || body.username);
      const user = db.users.find(item => item.nickname === nickname);
      if (!user || user.passwordHash !== hash(String(body.password || ""))) {
        return json(res, 401, { message: "账号或密码错误" });
      }
      const token = id("tok");
      recoverDrawChances(user);
      db.sessions[token] = user.id;
      record(db, { type: "login", userId: user.id });
      await writeDb(db);
      return json(res, 200, { token, user: userView(user, db) });
    }

    if (req.method === "GET" && url.pathname === "/api/profile") {
      const user = currentUser(req, db);
      if (!user) return json(res, 401, { message: "请先登录" });
      const recovered = recoverDrawChances(user);
      const rewards = [...applyDailyTasks(user, db), ...applyComboRewards(user), ...applyMilestoneRewards(user)];
      if (recovered || rewards.length) await writeDb(db);
      return json(res, 200, { user: userView(user, db), rewards });
    }

    if (req.method === "GET" && url.pathname === "/api/challenge") {
      const user = currentUser(req, db);
      if (!user) return json(res, 401, { message: "请先登录" });
      const recovered = recoverDrawChances(user);
      if (recovered) await writeDb(db);
      return json(res, 200, { challenge: challengeSummary(user), user: userView(user, db) });
    }

    if (req.method === "POST" && url.pathname === "/api/challenge/choose") {
      const user = currentUser(req, db);
      if (!user) return json(res, 401, { message: "请先登录" });
      recoverDrawChances(user);
      const state = todayChallengeState(user);
      if (state.count >= MAX_DAILY_CHALLENGES) return json(res, 400, { message: "今日事件已处理完" });
      const event = currentChallenge(user);
      const body = await parseBody(req);
      if (!event || body.eventId !== event.id) return json(res, 409, { message: "事件已刷新，请重试" });
      const choice = event.choices.find(item => item.id === body.choiceId);
      if (!choice) return json(res, 404, { message: "选项不存在" });
      const outcome = applyChallengeRewards(user, { ...choice.rewards });
      const entry = {
        id: id("chg"),
        eventId: event.id,
        eventTitle: event.title,
        choiceId: choice.id,
        choiceText: choice.text,
        result: choice.result,
        rewards: outcome.rewards,
        effects: outcome.effects,
        createdAt: new Date().toISOString()
      };
      const scoreEvent = scoreEventFromDelta(user, {
        type: "challenge",
        sourceId: entry.id,
        delta: Math.max(0, outcome.rewards.heat) + Math.max(0, outcome.rewards.reputation) * 2,
        reason: "challenge_reward",
        payload: { eventId: event.id, choiceId: choice.id },
        createdAt: entry.createdAt
      });
      state.count += 1;
      state.choices.push(entry);
      record(db, { type: "challenge", userId: user.id, scene: event.id, payload: entry });
      const rewards = [...applyDailyTasks(user, db), ...applyComboRewards(user), ...applyMilestoneRewards(user)];
      appendLocalScoreEvent(db, scoreEvent);
      await writeDb(db);
      return json(res, 200, {
        outcome: entry,
        rewards,
        challenge: challengeSummary(user),
        user: userView(user, db)
      });
    }

    if (req.method === "POST" && url.pathname === "/api/draw") {
      const user = currentUser(req, db);
      if (!user) return json(res, 401, { message: "请先登录" });
      const recovered = recoverDrawChances(user);
      const currentPack = activePendingPack(user);
      if (currentPack) {
        if (recovered) await writeDb(db);
        return json(res, 200, { pack: packView(currentPack), pending: true, user: userView(user, db) });
      }
      if (user.drawChances <= 0) return json(res, 400, { message: "抽卡次数不足" });
      user.drawChances -= 1;
      const pack = createPendingPack(user);
      insertLocalPackStart(db, user, pack);
      await writeDb(db);
      return json(res, 200, { pack: packView(pack), pending: false, user: userView(user, db) });
    }

    if (req.method === "POST" && url.pathname === "/api/draw/submit") {
      const user = currentUser(req, db);
      if (!user) return json(res, 401, { message: "请先登录" });
      const pack = activePendingPack(user);
      if (!pack) return json(res, 400, { message: "请先开包获得 4 张手牌" });
      let selectedEntries;
      let locked = false;
      let lockKey = "";
      try {
        lockKey = beginPackSubmit(user, pack);
        locked = true;
        const body = await parseBody(req);
        selectedEntries = selectedPackEntries(pack, body.selectedHandIds);
      } catch (error) {
        if (locked) releasePackSubmit(user, pack, lockKey);
        return json(res, error.status || 400, { message: error.message });
      }
      const result = settlePendingPack(user, pack, selectedEntries);
      const createdAt = new Date().toISOString();
      const drawRecords = result.selectedCards.map(card => drawRecordFromPackResult(user, card, createdAt));
      const scoreEvent = scoreEventFromDelta(user, {
        type: "draw_new_cards",
        sourceId: result.packId,
        delta: result.selectedCards.reduce((sum, card) => sum + card.scoreGained, 0),
        reason: "draw_new_cards",
        payload: { cardIds: result.selectedCards.filter(card => card.scoreGained > 0).map(card => card.id) },
        createdAt
      });
      db.drawRecords.push(...drawRecords);
      settleLocalPack(db, user, pack, result, createdAt);
      upsertLocalPlayerCards(db, user, result.selectedCards, "draw", createdAt);
      appendLocalScoreEvent(db, scoreEvent);
      record(db, drawEventFromPack(user, result, createdAt));
      const rewards = [...applyDailyTasks(user, db), ...applyComboRewards(user), ...applyMilestoneRewards(user)];
      await writeDb(db);
      return json(res, 200, { result, drawRecords, rewards, user: userView(user, db) });
    }

    if (req.method === "POST" && url.pathname === "/api/exchange") {
      const user = currentUser(req, db);
      if (!user) return json(res, 401, { message: "请先登录" });
      recoverDrawChances(user);
      const body = await parseBody(req);
      const card = CARDS.find(item => item.id === body.cardId);
      if (!card) return json(res, 404, { message: "卡牌不存在" });
      if (user.ownedCards[card.id]) return json(res, 400, { message: "你已经拥有这张卡" });
      if (user.fragments < card.price) return json(res, 400, { message: "碎片不足" });
      user.fragments -= card.price;
      user.ownedCards[card.id] = 1;
      user.score += card.score;
      const createdAt = new Date().toISOString();
      const scoreEvent = scoreEventFromDelta(user, {
        type: "exchange_card",
        sourceId: card.id,
        card,
        delta: card.score,
        reason: "exchange_card",
        createdAt
      });
      upsertLocalPlayerCards(db, user, [card], "exchange", createdAt);
      appendLocalScoreEvent(db, scoreEvent);
      record(db, { type: "exchange", userId: user.id, cardId: card.id, createdAt });
      const rewards = [...applyDailyTasks(user, db), ...applyComboRewards(user), ...applyMilestoneRewards(user)];
      await writeDb(db);
      return json(res, 200, { card, rewards, user: userView(user, db) });
    }

    if (req.method === "POST" && url.pathname === "/api/share/create") {
      const user = currentUser(req, db);
      if (!user) return json(res, 401, { message: "请先登录" });
      recoverDrawChances(user);
      const body = await parseBody(req);
      const scene = String(body.scene || "invite");
      const share = {
        id: id("shr"),
        userId: user.id,
        nickname: user.nickname,
        scene,
        visits: 0,
        rewarded: false,
        createdAt: new Date().toISOString()
      };
      db.shares.push(share);
      record(db, { type: "share_create", userId: user.id, shareId: share.id, scene });
      await writeDb(db);
      return json(res, 200, { share, shareUrl: `../frontend/share.html?shareId=${share.id}` });
    }

    if (req.method === "POST" && url.pathname === "/api/share/visit") {
      const body = await parseBody(req);
      const share = db.shares.find(item => item.id === body.shareId);
      if (!share) return json(res, 404, { message: "分享不存在" });
      const owner = db.users.find(user => user.id === share.userId);
      if (!owner) return json(res, 404, { message: "分享者不存在" });
      recoverDrawChances(owner);
      share.visits += 1;
      let reward = null;
      const key = `${today()}:${share.scene}`;
      if (!owner.shareRewards[key]) owner.shareRewards[key] = 0;
      if (owner.shareRewards[key] < 1) {
        owner.shareRewards[key] += 1;
        addDrawChances(owner, 1);
        share.rewarded = true;
        reward = { drawChances: 1, message: "分享跳转奖励已到账" };
      }
      record(db, { type: "share_visit", shareId: share.id, ownerId: owner.id, scene: share.scene, rewarded: Boolean(reward) });
      const rewards = [...applyDailyTasks(owner, db), ...applyMilestoneRewards(owner)];
      await writeDb(db);
      return json(res, 200, { share, owner: { nickname: owner.nickname }, reward, taskRewards: rewards });
    }

    if (req.method === "GET" && url.pathname === "/api/ranking") {
      const playerRows = [...db.users]
        .sort((a, b) => b.score - a.score)
        .map(user => ({
          player: true,
          userId: user.id,
          nickname: user.nickname,
          score: user.score,
          heat: user.heat,
          reputation: user.reputation,
          title: plannerTitle(user),
          collected: Object.keys(user.ownedCards).length,
          total: CARDS.length
        }));
      const ranking = [...playerRows, ...NPC_RANKING.map(npc => ({ ...npc, total: CARDS.length, player: false }))]
        .sort((a, b) => b.score - a.score)
        .slice(0, 50)
        .map((row, index) => ({
          rank: index + 1,
          ...row
        }));
      return json(res, 200, { ranking });
    }

    if (req.method === "GET" && url.pathname === "/api/stats") {
      return json(res, 200, {
        users: db.users.length,
        shares: db.shares.length,
        visits: db.events.filter(event => event.type === "share_visit").length,
        draws: db.drawRecords.length,
        packs: db.packRecords.length,
        cards: db.cards.length,
        playerCards: db.playerCards.length,
        scoreEvents: db.scoreEvents.length
      });
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      return json(res, 200, {
        users: db.users.map(user => ({
          id: user.id,
          nickname: user.nickname,
          score: user.score,
          heat: user.heat,
          reputation: user.reputation,
          fragments: user.fragments,
          drawChances: user.drawChances,
          openedPacks: user.openedPacks,
          collected: Object.keys(user.ownedCards).length,
          drawRecords: db.drawRecords.filter(record => record.userId === user.id),
          packRecords: db.packRecords
            .filter(record => record.userId === user.id)
            .map(record => ({
              ...record,
              cards: db.packCards.filter(card => card.packId === record.id).sort((a, b) => a.slot - b.slot)
            }))
        }))
      });
    }

    return json(res, 404, { message: "接口不存在" });
  } catch (error) {
    return json(res, 500, { message: "服务器错误", detail: error.message });
  }
}

http.createServer(handle).listen(PORT, HOST, () => {
  console.log(`Guangzai backend is running at http://${HOST}:${PORT}`);
});
