const API = "";

const state = {
  token: localStorage.getItem("gz_token") || "",
  authMode: "login",
  user: null,
  cards: [],
  games: [],
  series: [],
  albumGame: "",
  exchangeGame: "",
  challenge: null,
  activePack: null,
  selectedHandIds: [],
  introTimer: null,
  introCountdownTimer: null,
  tourIndex: 0,
  tourSteps: []
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "请求失败");
  return data;
}

function toast(message) {
  $("#modalContent").innerHTML = `<div class="message">${message}</div>`;
  $("#modal").classList.remove("hidden");
}

function introKey() {
  return state.user ? `gz_intro_seen_${state.user.id}` : "gz_intro_seen";
}

function tourKey() {
  return state.user ? `gz_tour_seen_${state.user.id}` : "gz_tour_seen";
}

function maybeStartOnboarding() {
  if (!state.user) return;
  if (!localStorage.getItem(introKey())) {
    setTimeout(startIntro, 150);
    return;
  }
  if (!localStorage.getItem(tourKey())) setTimeout(startTour, 150);
}

function startIntro() {
  const scenes = [
    {
      title: "宇宙深处，有一座殿堂",
      text: "它由无数玩家的笑声、怒吼、叹息和尖叫堆砌而成，名字叫作「名场面之殿」。"
    },
    {
      title: "这里只有永恒的一瞬间",
      text: "一次离谱的翻盘，一句传遍社区的梗，一个让策划连夜发道歉信的 BUG，都像星辰一样漂浮在穹顶之上。"
    },
    {
      title: "你是被选中的拾忆者",
      text: "每打开一枚记忆晶核，你就从时间的尘埃中捞回一个值得被记住的瞬间。"
    },
    {
      title: "名场面之柱正在等待你的名字",
      text: "殿堂深处的石柱刻满先行者的名字，而你，刚刚推开了那扇门。"
    }
  ];
  let sceneIndex = 0;
  let skipCountdown = 3;
  const overlay = $("#introOverlay");
  const skip = $("#introSkip");
  overlay.classList.remove("hidden");
  skip.disabled = true;
  skip.textContent = "3 秒后可跳过";

  const renderScene = () => {
    const scene = scenes[Math.min(sceneIndex, scenes.length - 1)];
    $("#introTitle").textContent = scene.title;
    $("#introText").textContent = scene.text;
  };

  renderScene();
  state.introCountdownTimer = setInterval(() => {
    skipCountdown -= 1;
    if (skipCountdown > 0) {
      skip.textContent = `${skipCountdown} 秒后可跳过`;
      return;
    }
    clearInterval(state.introCountdownTimer);
    state.introCountdownTimer = null;
    skip.disabled = false;
    skip.textContent = "跳过";
  }, 1000);

  const sceneTimer = setInterval(() => {
    sceneIndex += 1;
    renderScene();
  }, 3600);

  state.introTimer = setTimeout(() => finishIntro(sceneTimer), 15000);
  skip.onclick = () => {
    if (!skip.disabled) finishIntro(sceneTimer);
  };
}

function finishIntro(sceneTimer = null) {
  if (sceneTimer) clearInterval(sceneTimer);
  if (state.introTimer) clearTimeout(state.introTimer);
  if (state.introCountdownTimer) clearInterval(state.introCountdownTimer);
  state.introTimer = null;
  state.introCountdownTimer = null;
  localStorage.setItem(introKey(), "1");
  $("#introOverlay").classList.add("hidden");
  startTour();
}

function buildTourSteps() {
  return [
    { key: "event", title: "今日事件", text: "先处理策划事件。每次三选一，会改变热度、口碑、碎片或抽卡次数。你每天最多处理 3 个事件。" },
    { key: "draws", title: "抽卡次数", text: "抽卡次数用来开启记忆晶核。可以通过事件奖励、积分档位、累计开包返还、分享和时间恢复获得。" },
    { key: "heat", title: "热度", text: "热度代表活动传播声量。更会制造话题的选择会提高热度，也会帮助你冲排行榜。" },
    { key: "reputation", title: "口碑", text: "口碑代表玩家信任。透明沟通、降低负担、尊重体验通常会提高口碑。口碑太低会影响结局评价。" },
    { key: "fragments", title: "碎片", text: "碎片用于在兑换页解锁未收录卡牌。重复卡也会自动转化为碎片。" },
    { key: "score", title: "积分", text: "积分是排行榜核心。抽到新卡、处理事件获得热度和口碑，都会提升积分。达到积分档位还会奖励抽卡次数。" },
    { key: "pack", title: "记忆晶核", text: "这里开包抽取名场面卡。累计开包达到指定数量，会返还额外抽卡次数。" },
    { key: "album", title: "卡册", text: "卡册按游戏浏览已收录和未收录卡牌，已经发现的隐藏彩蛋也会记录在这里。" },
    { key: "exchange", title: "兑换", text: "兑换页按游戏筛选全部卡牌，未拥有卡可用碎片确认兑换。" },
    { key: "rank", title: "排行榜", text: "排行榜主要按积分排序。想提升排行，就多处理事件、积累热度和口碑、收集高价值卡牌。" }
  ];
}

function showPage(pageId) {
  $$(".tab").forEach(item => item.classList.toggle("active", item.dataset.page === pageId));
  $$(".page").forEach(page => page.classList.toggle("active", page.id === pageId));
  if (pageId === "albumPage") renderAlbum();
  if (pageId === "exchangePage") renderExchange();
  if (pageId === "rankPage") loadRanking();
}

function gameOf(card) {
  return card.game || card.ip || card.series || "通用社区梗";
}

function cardMeta(card) {
  return `${gameOf(card)} · ${card.rarityName}`;
}

function renderGameTabs(targetSelector, activeGame, handlerName) {
  const games = state.games.length ? state.games : [...new Set(state.cards.map(gameOf))];
  const active = games.includes(activeGame) ? activeGame : games[0] || "";
  $(targetSelector).innerHTML = games.map(game => `
    <button class="game-tab ${game === active ? "active" : ""}" onclick="${handlerName}('${game}')">${game}</button>
  `).join("");
  return active;
}

function selectAlbumGame(game) {
  state.albumGame = game;
  renderAlbum();
}

function selectExchangeGame(game) {
  state.exchangeGame = game;
  renderExchange();
}

function startTour(force = false) {
  if (!state.user || (!force && localStorage.getItem(tourKey()))) return;
  showPage("homePage");
  $("#modal").classList.add("hidden");
  state.tourSteps = buildTourSteps();
  state.tourIndex = 0;
  $("#tourOverlay").classList.remove("hidden");
  renderTourStep();
}

function renderTourStep() {
  const step = state.tourSteps[state.tourIndex];
  const target = document.querySelector(`[data-tour="${step.key}"]`);
  if (!step || !target) return finishTour();
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => {
    const rect = target.getBoundingClientRect();
    const pad = 8;
    const spotlight = $("#tourSpotlight");
    spotlight.style.left = `${Math.max(8, rect.left - pad)}px`;
    spotlight.style.top = `${Math.max(8, rect.top - pad)}px`;
    spotlight.style.width = `${Math.min(window.innerWidth - 16, rect.width + pad * 2)}px`;
    spotlight.style.height = `${rect.height + pad * 2}px`;

    const card = $("#tourCard");
    const placeBelow = rect.top < window.innerHeight * 0.52;
    card.style.top = placeBelow ? `${Math.min(window.innerHeight - 190, rect.bottom + 18)}px` : "auto";
    card.style.bottom = placeBelow ? "auto" : `${Math.min(window.innerHeight - 190, window.innerHeight - rect.top + 18)}px`;

    $("#tourStep").textContent = `${state.tourIndex + 1}/${state.tourSteps.length}`;
    $("#tourTitle").textContent = step.title;
    $("#tourText").textContent = step.text;
    $("#tourNext").textContent = state.tourIndex === state.tourSteps.length - 1 ? "完成指引" : "下一步";
  }, 260);
}

function nextTourStep() {
  state.tourIndex += 1;
  if (state.tourIndex >= state.tourSteps.length) return finishTour();
  renderTourStep();
}

function finishTour() {
  localStorage.setItem(tourKey(), "1");
  $("#tourOverlay").classList.add("hidden");
}

function rewardHtml(rewards = []) {
  if (!rewards.length) return "";
  return `
    <div class="reward-list">
      <strong>奖励到账</strong>
      ${rewards.map(text => `<p>${text}</p>`).join("")}
    </div>
  `;
}

function cardFace(card, owned = true) {
  if (card.id === "c001" && owned) {
    return `
      <div class="special-card-face image-card-face">
        <img src="./assets/cards/sixue-fansha.png" alt="丝血反杀卡面" />
      </div>
    `;
  }
  return `<div class="card-art">${owned ? card.name.slice(0, 1) : "?"}</div>`;
}

function showCardResult(card, result) {
  const rewards = result.rewards || [];
  const action = ["rare", "epic", "legend", "hidden"].includes(card.rarity)
    ? `<button class="secondary" onclick="shareScene('card')">分享这张卡 · 跳转领奖</button>`
    : "";
  $("#modalContent").innerHTML = `
    <div class="result-showcase">
      <p class="eyebrow">抽取结果</p>
      <div class="card result-card rarity-${card.rarity} ${card.id === "c001" ? "special-result-card" : ""}">
        <div class="card-shine"></div>
        ${cardFace(card)}
        <strong>${card.name}</strong>
        <small>${cardMeta(card)}</small>
        <p>${card.quote}</p>
      </div>
    </div>
    <p class="message">${
      result.duplicated
        ? `重复卡已转化为 ${result.fragmentsGained} 碎片`
        : `新卡入册，积分 +${result.scoreGained}`
    }</p>
    ${rewardHtml(rewards)}
    ${action}
  `;
  $("#modal").classList.remove("hidden");
}

function hydratePendingPack() {
  const pending = state.user?.effectState?.pendingPack;
  if (!pending || !Array.isArray(pending.cards) || pending.cards.length !== 4) {
    state.activePack = null;
    state.selectedHandIds = [];
    return;
  }
  const cards = pending.cards
    .map(entry => {
      const card = state.cards.find(item => item.id === entry.cardId);
      return card ? { ...card, handId: entry.handId, slot: entry.slot, point: entry.point } : null;
    })
    .filter(Boolean);
  if (cards.length !== 4) {
    state.activePack = null;
    state.selectedHandIds = [];
    return;
  }
  state.activePack = { id: pending.id, createdAt: pending.createdAt, maxSelections: 3, cards };
  state.selectedHandIds = [];
}

function renderHand() {
  const hasPack = Boolean(state.activePack);
  $("#handArea").classList.toggle("hidden", !hasPack);
  $("#drawBtn").disabled = hasPack;
  $("#drawBtn").textContent = hasPack ? "请先确认本次选择" : "开启记忆晶核";
  if (!hasPack) {
    $("#handGrid").innerHTML = "";
    $("#handCounter").textContent = "0/3";
    $("#confirmSelectionBtn").disabled = true;
    return;
  }
  $("#handCounter").textContent = `${state.selectedHandIds.length}/3`;
  $("#confirmSelectionBtn").disabled = state.selectedHandIds.length !== 3;
  $("#handGrid").innerHTML = state.activePack.cards.map(card => {
    const selected = state.selectedHandIds.includes(card.handId);
    return `
      <article class="hand-card card rarity-${card.rarity} ${selected ? "selected" : ""}" onclick="toggleHandCard('${card.handId}')">
        <b class="point-badge">${card.point}</b>
        ${cardFace(card, true)}
        <strong>${card.name}</strong>
        <small>${cardMeta(card)}</small>
      </article>
    `;
  }).join("");
}

function toggleHandCard(handId) {
  if (!state.activePack) return;
  const selected = state.selectedHandIds.includes(handId);
  if (selected) {
    state.selectedHandIds = state.selectedHandIds.filter(id => id !== handId);
  } else if (state.selectedHandIds.length < 3) {
    state.selectedHandIds = [...state.selectedHandIds, handId];
  } else {
    toast("最多选择 3 张卡牌。");
    return;
  }
  renderHand();
}

function resultLine(card) {
  return card.duplicated
    ? `重复转化：碎片 +${card.fragmentsGained}`
    : `新卡入册：积分 +${card.scoreGained}`;
}

function showPackResult(result, rewards = []) {
  const action = result.selectedCards.some(card => ["rare", "epic", "legend", "hidden"].includes(card.rarity))
    ? `<button class="secondary" onclick="shareScene('card')">分享本次高光 · 跳转领奖</button>`
    : "";
  $("#modalContent").innerHTML = `
    <div class="pack-result">
      <p class="eyebrow">本次入库结果</p>
      <div class="settled-grid">
        ${result.selectedCards.map(card => `
          <article class="card result-card rarity-${card.rarity} ${card.id === "c001" ? "special-result-card" : ""}">
            <b class="point-badge">${card.point}</b>
            ${cardFace(card, true)}
            <strong>${card.name}</strong>
        <small>${cardMeta(card)}</small>
            <p>${resultLine(card)}</p>
          </article>
        `).join("")}
      </div>
      <div class="abandoned-card">
        <strong>放弃卡牌</strong>
        <span>${result.abandonedCard.name} · 点数 ${result.abandonedCard.point}</span>
        <small>不会入库，也不会转化碎片</small>
      </div>
      <div class="twenty-four-result ${result.twentyFour.success ? "success" : ""}">
        <strong>${result.twentyFour.success ? "满梗全席！" : "未凑成 24"}</strong>
        <p>${result.twentyFour.success ? `${result.twentyFour.formula} = 24，额外获得 1 次抽卡机会。` : "选中卡牌已正常入库，本次没有额外抽卡奖励。"}</p>
      </div>
    </div>
    ${rewardHtml(rewards)}
    ${action}
  `;
  $("#modal").classList.remove("hidden");
}

function showSharePoster(scene, shareId) {
  const sceneText = {
    invite: "邀请好友来收集名场面",
    rank: "晒出我的排行榜战绩",
    card: "炫耀刚抽到的稀有卡"
  }[scene] || "分享光仔卡牌";
  const shareUrl = shareLink(shareId);
  $("#modalContent").innerHTML = `
    <div class="share-card-preview">
      <p class="eyebrow">分享卡片预览</p>
      <h3>${sceneText}</h3>
      <div class="share-mini-card">
        <span>光仔卡牌</span>
        <strong>名场面召集令</strong>
      </div>
      <p>我在光仔卡牌里打开了名场面之殿，来一起抽一包。</p>
      <small>分享码：${shareId}</small>
    </div>
    <p class="message">点击立即转发会调用手机系统分享面板。好友打开链接后，会记录一次分享跳转并发放奖励。</p>
    <div class="share-actions">
      <button class="primary" onclick="nativeShare('${shareId}', '${scene}')">立即转发给好友</button>
      <button class="secondary" onclick="openPoster('${shareId}')">生成二维码海报</button>
      <button class="secondary" onclick="copyShareLink('${shareId}')">复制分享链接</button>
    </div>
    <p class="share-link-text">${shareUrl}</p>
  `;
  $("#modal").classList.remove("hidden");
}

function shareLink(shareId) {
  return new URL(`./share.html?shareId=${encodeURIComponent(shareId)}`, window.location.href).href;
}

async function copyShareLink(shareId) {
  const url = shareLink(shareId);
  try {
    await navigator.clipboard.writeText(url);
    toast("分享链接已复制，可以粘贴发给好友。");
  } catch {
    window.prompt("复制这个分享链接", url);
  }
}

async function nativeShare(shareId, scene = "invite") {
  const title = {
    invite: "来光仔卡牌收集名场面",
    rank: "我在光仔卡牌冲榜了",
    card: "我抽到了光仔卡牌名场面"
  }[scene] || "光仔卡牌";
  const url = shareLink(shareId);
  const payload = {
    title,
    text: "推开名场面之殿，开一枚记忆晶核，看看你能捞回哪个游戏瞬间。",
    url
  };
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  await copyShareLink(shareId);
}

function showHelpGuide() {
  $("#modalContent").innerHTML = `
    <div class="guide">
      <p class="eyebrow">玩法说明</p>
      <h3>拾忆者行动手册</h3>
      <p class="guide-lead">你的目标是处理策划事件，积累热度、口碑和积分，获得抽卡机会，解锁更多名场面卡牌，并冲上名场面之柱排行榜。</p>
      <div class="guide-grid">
        <div>
          <strong>抽卡次数</strong>
          <p>用于开启记忆晶核。可通过今日事件、积分档位、累计开包返还、分享跳转和时间恢复获得。</p>
        </div>
        <div>
          <strong>热度</strong>
          <p>代表话题传播声量。热度越高，说明你的运营选择越容易被玩家讨论和转发。</p>
        </div>
        <div>
          <strong>口碑</strong>
          <p>代表玩家信任。透明沟通、降低负担、尊重体验会提高口碑，口碑太低会影响结局评价。</p>
        </div>
        <div>
          <strong>碎片</strong>
          <p>用于在兑换页解锁未收录卡牌。抽到重复卡时，也会自动转化为碎片。</p>
        </div>
        <div>
          <strong>积分</strong>
          <p>排行榜核心指标。抽到新卡、处理事件、积累热度和口碑都会提高积分。</p>
        </div>
        <div>
          <strong>卡牌效果</strong>
          <p>部分名场面卡不是只收藏，会触发额外效果，例如补偿碎片、失败兜底或额外抽卡。</p>
        </div>
      </div>
      <div class="guide-ranking">
        <strong>排行榜怎么算？</strong>
        <p>排行榜主要按积分排序。想提升排名，就多处理今日事件、获取抽卡次数、解锁高价值卡牌，并利用碎片补齐卡册。</p>
      </div>
      <div class="guide-ranking">
        <strong>抽卡次数怎么变多？</strong>
        <p>每 30 分钟恢复 1 次，最多恢复到 15 次；积分达到指定档位会奖励抽卡；累计开包达到指定数量也会返还抽卡次数。</p>
      </div>
    </div>
  `;
  $("#modal").classList.remove("hidden");
}

function setAuthMode(mode) {
  state.authMode = mode;
  $("#showLogin").classList.toggle("active", mode === "login");
  $("#showRegister").classList.toggle("active", mode === "register");
  $("#authSubmit").textContent = mode === "login" ? "登录并进入" : "注册并进入";
  $("#authMessage").textContent = "";
}

async function loadCards() {
  const data = await request("/api/cards");
  state.cards = data.cards;
  state.games = data.games || data.series || [...new Set(state.cards.map(gameOf))];
  state.series = state.games;
  state.albumGame = state.albumGame || state.games[0] || "";
  state.exchangeGame = state.exchangeGame || state.games[0] || "";
}

async function loadProfile() {
  const data = await request("/api/profile");
  state.user = data.user;
  await loadChallenge();
  hydratePendingPack();
  render();
}

async function loadChallenge() {
  if (!state.token) return;
  const data = await request("/api/challenge");
  state.challenge = data.challenge;
  state.user = data.user;
}

function render() {
  if (!state.user) {
    $("#authView").classList.remove("hidden");
    $("#gameView").classList.add("hidden");
    return;
  }
  $("#authView").classList.add("hidden");
  $("#gameView").classList.remove("hidden");
  $("#nicknameText").textContent = state.user.nickname;
  $("#drawChances").textContent = state.user.drawChances;
  $("#heat").textContent = state.user.heat || 0;
  $("#reputation").textContent = state.user.reputation || 0;
  $("#score").textContent = state.user.score;
  $("#fragments").textContent = state.user.fragments;
  $("#collection").textContent = `${Object.keys(state.user.ownedCards).length}/${state.cards.length}`;
  renderTasks();
  renderChallenge();
  renderComboGoals();
  renderAlbum();
  renderExchange();
  renderHand();
  if ($("#rankPage").classList.contains("active")) loadRanking();
}

function rewardText(rewards = {}) {
  return [
    rewards.heat ? `热度 ${rewards.heat > 0 ? "+" : ""}${rewards.heat}` : "",
    rewards.reputation ? `口碑 ${rewards.reputation > 0 ? "+" : ""}${rewards.reputation}` : "",
    rewards.fragments ? `碎片 +${rewards.fragments}` : "",
    rewards.drawChances ? `抽卡 +${rewards.drawChances}` : ""
  ].filter(Boolean).join(" · ");
}

function renderChallenge() {
  const challenge = state.challenge;
  if (!challenge) {
    $("#challengeProgress").textContent = "-";
    $("#challengeBox").innerHTML = `<p class="message">事件加载中...</p>`;
    return;
  }
  $("#challengeProgress").textContent = `${challenge.todayCount}/${challenge.maxDaily}`;
  if (challenge.completed) {
    $("#challengeBox").innerHTML = `
      <div class="challenge-done">
        <strong>今日事件已处理完</strong>
        <p>${state.user.plannerTitle}：${state.user.endingText}</p>
      </div>
      ${challenge.recentChoices.map(item => `
        <div class="choice-log">
          <small>${item.eventTitle}</small>
          <strong>${item.choiceText}</strong>
          <span>${rewardText(item.rewards)}</span>
        </div>
      `).join("")}
    `;
    return;
  }
  const event = challenge.event;
  $("#challengeBox").innerHTML = `
    <div class="challenge-card">
      <p class="eyebrow">剩余 ${challenge.remaining} 次处理机会</p>
      <h4>${event.title}</h4>
      <p>${event.context}</p>
      <div class="choice-list">
        ${event.choices.map((choice, index) => `
          <button class="choice-button" onclick="chooseChallenge('${event.id}', '${choice.id}')">
            <b>${String.fromCharCode(65 + index)}</b>
            <span>${choice.text}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderTasks() {
  const tasks = state.user.tasks || [];
  $("#taskList").innerHTML = tasks.map(task => {
    const percent = Math.round((task.progress / task.target) * 100);
    return `
      <div class="task-row ${task.claimed ? "done" : ""}">
        <div>
          <strong>${task.title}</strong>
          <small>${task.progress}/${task.target} · ${task.reward}${task.claimed ? " · 已领取" : ""}</small>
        </div>
        <div class="bar"><span style="width:${percent}%"></span></div>
      </div>
    `;
  }).join("");
}

function comboRowsHtml(combos) {
  const rows = (combos.triggered || []).map(combo => `
    <div class="series-row combo-row done">
      <div>
        <strong>${combo.name}</strong>
        <small>${combo.game} · 已发现 · 奖励 ${combo.rewardText}</small>
      </div>
    </div>
  `);
  if ((combos.discovered || 0) < (combos.total || 0)) {
    rows.push(`
      <div class="series-row combo-row mystery">
        <div>
          <strong>仍有隐藏彩蛋未发现</strong>
          <small>集齐特定同游戏卡牌后会自动触发，条件不会提前标注。</small>
        </div>
      </div>
    `);
  }
  return rows.join("") || `
    <div class="series-row combo-row mystery">
      <div>
        <strong>彩蛋档案待唤醒</strong>
        <small>继续开包或兑换卡牌，发现后会在这里记录。</small>
      </div>
    </div>
  `;
}

function renderComboGoals() {
  const combos = state.user.combos || { discovered: 0, total: 0, triggered: [] };
  $("#comboProgress").textContent = `${combos.discovered || 0}/${combos.total || 0}`;
  $("#comboList").innerHTML = comboRowsHtml(combos);
}

function renderAlbumCombos() {
  const combos = state.user.combos || { discovered: 0, total: 0, triggered: [] };
  $("#albumComboProgress").textContent = `${combos.discovered || 0}/${combos.total || 0}`;
  $("#albumComboList").innerHTML = comboRowsHtml(combos);
}

function cardAction(card, owned, mode = "album") {
  if (mode !== "exchange") {
    return `<small class="locked-price">${cardMeta(card)} · ${card.price} 碎片</small>`;
  }
  if (owned) return `<button class="secondary card-action" disabled>已拥有</button>`;
  const disabled = state.user.fragments < card.price;
  return `
    <button class="secondary card-action" ${disabled ? "disabled" : ""} onclick="event.stopPropagation(); confirmExchange('${card.id}')">
      ${card.price} 碎片兑换
    </button>
  `;
}

function cardMarkup(card, owned, mode = "album") {
  if (!owned) {
    return `
      <article class="card locked ${mode === "exchange" ? "exchange-card" : ""}" onclick="showCardDetail('${card.id}')">
        <div class="locked-card-back">
          <span>?</span>
          <small>未解锁</small>
        </div>
        ${mode === "exchange" ? `
          <strong>${card.name}</strong>
          <small>${cardMeta(card)}</small>
          <p>${card.quote}</p>
        ` : ""}
        ${cardAction(card, owned, mode)}
      </article>
    `;
  }
  return `
    <article class="card rarity-${card.rarity} ${card.id === "c001" ? "special-album-card" : ""} ${mode === "exchange" ? "exchange-owned" : ""}" onclick="showCardDetail('${card.id}')">
      ${cardFace(card, true)}
      <strong>${card.name}</strong>
      <small>${cardMeta(card)}</small>
      <p>${card.quote}</p>
      ${mode === "exchange" ? cardAction(card, owned, mode) : ""}
    </article>
  `;
}

function renderAlbum() {
  if (!state.user) return;
  state.albumGame = renderGameTabs("#albumGameTabs", state.albumGame, "selectAlbumGame");
  const cards = state.cards.filter(card => gameOf(card) === state.albumGame);
  const owned = cards.filter(card => state.user.ownedCards[card.id]).length;
  $("#albumProgress").textContent = `${owned}/${cards.length}`;
  $("#cardGrid").innerHTML = cards
    .map(card => cardMarkup(card, Boolean(state.user.ownedCards[card.id]), "album"))
    .join("");
  renderAlbumCombos();
}

function renderExchange() {
  if (!state.user) return;
  state.exchangeGame = renderGameTabs("#exchangeGameTabs", state.exchangeGame, "selectExchangeGame");
  $("#exchangeFragments").textContent = state.user.fragments;
  const cards = state.cards.filter(card => gameOf(card) === state.exchangeGame);
  $("#exchangeGrid").innerHTML = cards
    .map(card => cardMarkup(card, Boolean(state.user.ownedCards[card.id]), "exchange"))
    .join("");
}

function showCardDetail(cardId) {
  const card = state.cards.find(item => item.id === cardId);
  if (!card) return;
  const owned = Boolean(state.user.ownedCards[card.id]);
  const action = owned ? "" : `
    <button class="secondary card-action" onclick="openExchangeForCard('${card.id}')">
      去兑换页查看
    </button>
  `;
  $("#modalContent").innerHTML = `
    <div class="card-detail">
      <p class="eyebrow">${owned ? "已收录卡牌" : "未解锁卡牌"}</p>
      <div class="detail-visual ${owned ? `rarity-${card.rarity}` : "locked"}">
        ${owned ? cardFace(card, true) : `
          <div class="locked-card-back">
            <span>?</span>
            <small>未解锁</small>
          </div>
        `}
      </div>
      ${owned ? `
        <div class="detail-meta">
          <strong>${card.name}</strong>
          <span>${cardMeta(card)} · ${card.theme || "名场面"} · 积分 ${card.score}</span>
          <p>${card.quote}</p>
        </div>
      ` : `
        <p class="message">${cardMeta(card)}。消耗 ${card.price} 碎片可在兑换页解锁这张卡。</p>
        ${action}
      `}
    </div>
  `;
  $("#modal").classList.remove("hidden");
}

function openExchangeForCard(cardId) {
  const card = state.cards.find(item => item.id === cardId);
  if (card) state.exchangeGame = gameOf(card);
  $("#modal").classList.add("hidden");
  showPage("exchangePage");
}

async function loadRanking() {
  const data = await request("/api/ranking");
  const rows = data.ranking.length ? data.ranking : [{ rank: 1, nickname: "暂无玩家", score: 0, collected: 0, total: state.cards.length }];
  $("#rankingList").innerHTML = rows.map(row => `
    <div class="rank-row">
      <b>#${row.rank}</b>
      <span>${row.nickname}${row.player ? "（玩家）" : ""}<br><small>${row.collected}/${row.total} 已收集</small></span>
      <strong>${row.score}</strong>
    </div>
  `).join("");
}

function confirmExchange(cardId) {
  const card = state.cards.find(item => item.id === cardId);
  if (!card) return;
  const disabled = state.user.fragments < card.price;
  $("#modalContent").innerHTML = `
    <div class="card-detail">
      <p class="eyebrow">确认兑换</p>
      <div class="detail-meta">
        <strong>${card.name}</strong>
        <span>${cardMeta(card)} · 需要 ${card.price} 碎片</span>
        <p>${card.quote}</p>
      </div>
      <p class="message">当前碎片：${state.user.fragments}。兑换后卡牌会直接入册，并获得 ${card.score} 积分。</p>
      <button class="primary" ${disabled ? "disabled" : ""} onclick="exchangeCard('${card.id}')">
        ${disabled ? "碎片不足" : "确认兑换"}
      </button>
    </div>
  `;
  $("#modal").classList.remove("hidden");
}

async function exchangeCard(cardId) {
  try {
    const data = await request("/api/exchange", {
      method: "POST",
      body: JSON.stringify({ cardId })
    });
    state.user = data.user;
    render();
    $("#modalContent").innerHTML = `
      <div class="challenge-result">
        <p class="eyebrow">兑换成功</p>
        <h3>${data.card.name}</h3>
        <p>${cardMeta(data.card)} 已收录，积分 +${data.card.score}。</p>
        ${rewardHtml(data.rewards || [])}
      </div>
    `;
    $("#modal").classList.remove("hidden");
  } catch (error) {
    toast(error.message);
  }
}

async function chooseChallenge(eventId, choiceId) {
  try {
    const data = await request("/api/challenge/choose", {
      method: "POST",
      body: JSON.stringify({ eventId, choiceId })
    });
    state.user = data.user;
    state.challenge = data.challenge;
    render();
    const outcome = data.outcome;
    $("#modalContent").innerHTML = `
      <div class="challenge-result">
        <p class="eyebrow">事件处理结果</p>
        <h3>${outcome.eventTitle}</h3>
        <strong>${outcome.choiceText}</strong>
        <p>${outcome.result}</p>
        <div class="reward-chips">
          ${rewardText(outcome.rewards).split(" · ").filter(Boolean).map(text => `<span>${text}</span>`).join("")}
        </div>
        ${outcome.effects.length ? `
          <div class="effect-list">
            <strong>卡牌效果触发</strong>
            ${outcome.effects.map(text => `<p>${text}</p>`).join("")}
          </div>
        ` : ""}
        ${rewardHtml(data.rewards || [])}
      </div>
    `;
    $("#modal").classList.remove("hidden");
  } catch (error) {
    toast(error.message);
  }
}

async function shareScene(scene) {
  try {
    const data = await request("/api/share/create", {
      method: "POST",
      body: JSON.stringify({ scene })
    });
    showSharePoster(scene, data.share.id);
  } catch (error) {
    toast(error.message);
  }
}

window.exchangeCard = exchangeCard;
window.confirmExchange = confirmExchange;
window.openExchangeForCard = openExchangeForCard;
window.showCardDetail = showCardDetail;
window.showPage = showPage;
window.selectAlbumGame = selectAlbumGame;
window.selectExchangeGame = selectExchangeGame;
window.toggleHandCard = toggleHandCard;
window.chooseChallenge = chooseChallenge;
window.nextTourStep = nextTourStep;
window.finishTour = finishTour;
window.shareScene = shareScene;
window.nativeShare = nativeShare;
window.copyShareLink = copyShareLink;
window.goShare = shareId => {
  window.location.href = `./share.html?shareId=${encodeURIComponent(shareId)}`;
};
window.openPoster = shareId => {
  window.location.href = `./poster.html?shareId=${encodeURIComponent(shareId)}`;
};

async function submitAuth() {
  const nickname = $("#nickname").value.trim();
  const password = $("#password").value;
  try {
    const data = await request(state.authMode === "login" ? "/api/login" : "/api/register", {
      method: "POST",
      body: JSON.stringify({ nickname, password })
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("gz_token", state.token);
    await loadChallenge();
    hydratePendingPack();
    render();
    maybeStartOnboarding();
  } catch (error) {
    $("#authMessage").textContent = error.message;
  }
}

async function drawCard() {
  try {
    $("#drawBtn").disabled = true;
    $("#drawBtn").textContent = "校验中...";
    const data = await request("/api/draw", { method: "POST" });
    $("#packStage").classList.add("charging");
    $("#crystal").classList.add("opening");
    $("#crystalText").textContent = "？";
    $("#drawBtn").textContent = "晶核共鸣中...";
    await new Promise(resolve => setTimeout(resolve, 1050));
    $("#packStage").classList.remove("charging");
    $("#packStage").classList.add("rarity-phase", "burst", "rarity-phase-epic");
    $("#crystal").className = "crystal reveal rarity-glow-epic rarity-preview-epic";
    $("#crystalText").textContent = "4";
    $("#drawBtn").textContent = "四张手牌已响应...";
    await new Promise(resolve => setTimeout(resolve, 900));
    $("#packStage").classList.remove("rarity-phase", "burst", "rarity-phase-epic");
    $("#crystal").className = "crystal";
    $("#crystalText").textContent = "开";
    state.user = data.user;
    state.activePack = data.pack;
    state.selectedHandIds = [];
    render();
    if (data.pending) toast("你还有一组未确认的手牌，请先选四张中的 3 张。");
  } catch (error) {
    $("#packStage").className = "pack-stage";
    $("#crystal").className = "crystal";
    $("#crystalText").textContent = "开";
    $("#drawBtn").disabled = false;
    $("#drawBtn").textContent = "开启记忆晶核";
    toast(error.message);
  }
}

async function submitSelection() {
  if (!state.activePack || state.selectedHandIds.length !== 3) {
    toast("请选择 3 张卡牌后再确认。");
    return;
  }
  try {
    $("#confirmSelectionBtn").disabled = true;
    $("#confirmSelectionBtn").textContent = "结算中...";
    const data = await request("/api/draw/submit", {
      method: "POST",
      body: JSON.stringify({ selectedHandIds: state.selectedHandIds })
    });
    state.user = data.user;
    state.activePack = null;
    state.selectedHandIds = [];
    render();
    showPackResult(data.result, data.rewards || []);
  } catch (error) {
    toast(error.message);
    renderHand();
  } finally {
    $("#confirmSelectionBtn").textContent = "确认选择";
  }
}

function bind() {
  $("#showLogin").addEventListener("click", () => setAuthMode("login"));
  $("#showRegister").addEventListener("click", () => setAuthMode("register"));
  $("#authSubmit").addEventListener("click", submitAuth);
  $("#drawBtn").addEventListener("click", drawCard);
  $("#confirmSelectionBtn").addEventListener("click", submitSelection);
  $("#albumInviteBtn").addEventListener("click", async () => {
    try {
      const data = await request("/api/share/create", {
        method: "POST",
        body: JSON.stringify({ scene: "invite" })
      });
      window.location.href = `./poster.html?shareId=${encodeURIComponent(data.share.id)}`;
    } catch (error) {
      toast(error.message);
    }
  });
  $("#shareRankBtn").addEventListener("click", () => shareScene("rank"));
  $("#closeModal").addEventListener("click", () => $("#modal").classList.add("hidden"));
  $("#tourNext").addEventListener("click", nextTourStep);
  $("#helpBtn").addEventListener("click", showHelpGuide);
  $("#logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("gz_token");
    state.token = "";
    state.user = null;
    state.challenge = null;
    state.activePack = null;
    state.selectedHandIds = [];
    render();
  });
  $$(".tab").forEach(tab => {
    tab.addEventListener("click", () => showPage(tab.dataset.page));
  });
}

async function init() {
  bind();
  setAuthMode("login");
  await loadCards();
  if (state.token) {
    try {
      await loadProfile();
      maybeStartOnboarding();
    } catch {
      localStorage.removeItem("gz_token");
      state.token = "";
      render();
    }
  } else {
    render();
  }
}

init();
