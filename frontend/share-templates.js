(function () {
  const templates = {
    invite: {
      key: "invite",
      label: "游戏入口",
      eyebrow: "名场面召集令",
      headline: "来光仔卡牌开第一包",
      miniTitle: "一起开包",
      miniMeta: "好友入场 · 蹭包领奖",
      body: "我在名场面之殿等你，扫码进来开一枚记忆晶核。",
      nativeTitle: "来光仔卡牌收集名场面",
      nativeText: "推开名场面之殿，开一枚记忆晶核，看看你能捞回哪个游戏瞬间。",
      posterTitle: "名场面之殿正在开启",
      posterSubtitle: "扫码入场 · 好友蹭包",
      posterCopy: "拾起玩家社区的高光、冥场面与经典瞬间。扫码进入游戏，和好友一起开包领奖。",
      posterSlogan: "化身拾忆者，收集崩坏前的每一个名场面",
      shareTitle: "好友喊你来开包",
      shareCopy: "进入游戏后可蹭好友的包，双方都有每日奖励机会。"
    },
    rank: {
      key: "rank",
      label: "排名战报",
      eyebrow: "排行榜战报",
      headline: "我在名场面之柱冲榜",
      miniTitle: "冲榜战报",
      miniMeta: "积分排名 · 高光收集",
      body: "我的积分已经写上名场面之柱，来看看你能不能反超。",
      nativeTitle: "我在光仔卡牌冲榜了",
      nativeText: "来名场面之柱看看我的排名，开包、收集、凑 24，一起把积分打上去。",
      posterTitle: "名场面之柱战报",
      posterSubtitle: "扫码看榜 · 反超好友",
      posterCopy: "排行榜记录每一次开包和收集的高光。扫码进来看看好友战绩，再把自己的名字顶上去。",
      posterSlogan: "分数会说话，名场面也会",
      shareTitle: "好友晒出了排行榜",
      shareCopy: "打开后会记录一次排名分享访问，进入游戏还能继续开包冲榜。"
    },
    card: {
      key: "card",
      label: "稀有卡牌",
      eyebrow: "高光卡牌",
      headline: "我抽到了稀有名场面",
      miniTitle: "稀有掉落",
      miniMeta: "卡牌高光 · 分享领奖",
      body: "刚从记忆晶核里捞到一张高光卡，来围观这次欧气。",
      nativeTitle: "我抽到了光仔卡牌名场面",
      nativeText: "刚抽到一张高光名场面卡，扫码进来一起开包，看看你的第一张会是什么。",
      posterTitle: "稀有名场面掉落",
      posterSubtitle: "扫码围观 · 一起开包",
      posterCopy: "记忆晶核刚刚亮起，稀有卡牌已经入册。扫码进入游戏，看看你的下一张名场面。",
      posterSlogan: "这一抽，值得被好友看见",
      shareTitle: "好友抽到了高光卡",
      shareCopy: "打开后会记录一次卡牌分享访问，登录后还能蹭好友包领奖。"
    }
  };

  window.SHARE_TEMPLATES = templates;
  window.getShareTemplate = scene => templates[scene] || templates.invite;
})();
