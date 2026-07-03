const API = "";
const PENDING_SHARE_KEY = "gz_pending_share_id";
const params = new URLSearchParams(window.location.search);
const shareId = params.get("shareId");
const scene = params.get("scene") || "invite";
const token = localStorage.getItem("gz_token") || "";
let activeTemplate = window.getShareTemplate ? window.getShareTemplate(scene) : { key: "invite" };

function applyTemplate(sceneKey = activeTemplate.key) {
  activeTemplate = window.getShareTemplate ? window.getShareTemplate(sceneKey) : activeTemplate;
  document.title = `光仔卡牌${activeTemplate.label || ""}分享`;
  document.querySelector("#sharePage").className = `share-page panel share-page-${activeTemplate.key}`;
  document.querySelector("#sharePoster").className = `share-poster share-poster-${activeTemplate.key}`;
  document.querySelector("#shareEyebrow").textContent = activeTemplate.eyebrow;
  document.querySelector("#shareSceneLabel").textContent = activeTemplate.label;
  document.querySelector("#shareHeading").textContent = activeTemplate.shareTitle;
  document.querySelector("#shareTemplateCopy").textContent = activeTemplate.shareCopy;
}

function rewardSummary(reward = {}) {
  return [
    reward.drawChances ? `${reward.drawChances} 次抽卡机会` : "",
    reward.fragments ? `${reward.fragments} 碎片` : ""
  ].filter(Boolean).join(" + ") || "奖励";
}

function rememberShare() {
  if (!shareId) return;
  localStorage.setItem(PENDING_SHARE_KEY, shareId);
  const url = new URL("./index.html", window.location.href);
  url.searchParams.set("shareId", shareId);
  document.querySelector("#enterGameLink").href = url.href;
}

async function visitShare() {
  if (!shareId) {
    document.querySelector("#shareText").textContent = "分享链接缺少 shareId。";
    return;
  }
  try {
    const response = await fetch(`${API}/api/share/visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "分享访问失败");
    applyTemplate(data.share?.scene || scene);
    document.querySelector("#shareText").textContent = `你正在访问 ${data.owner.nickname} 的分享页面。`;
    const taskText = data.taskRewards?.length ? ` ${data.taskRewards.join(" ")}` : "";
    document.querySelector("#rewardText").textContent = data.reward
      ? `${data.owner.nickname} 获得 1 次抽卡机会。${taskText}`
      : `今日该分享场景奖励已领取，访问已记录。${taskText}`;
  } catch (error) {
    document.querySelector("#shareText").textContent = error.message;
  }
}

async function claimShare() {
  if (!shareId) {
    document.querySelector("#rewardText").textContent = "分享链接缺少 shareId。";
    return;
  }
  rememberShare();
  if (!token) {
    document.querySelector("#rewardText").textContent = "请先进入游戏登录，登录后会自动完成蹭包。";
    window.location.href = document.querySelector("#enterGameLink").href;
    return;
  }
  const button = document.querySelector("#claimShareBtn");
  button.disabled = true;
  button.textContent = "蹭包中...";
  try {
    const response = await fetch(`${API}/api/share/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ shareId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "蹭包失败");
    localStorage.removeItem(PENDING_SHARE_KEY);
    const visitorReward = rewardSummary(data.claim?.visitorReward);
    const ownerReward = rewardSummary(data.claim?.ownerReward);
    document.querySelector("#rewardText").textContent = data.claim?.claimed
      ? `蹭包成功：你获得 ${visitorReward}，${data.owner.nickname} 获得 ${ownerReward}。`
      : data.claim?.message || "今日已蹭过这个包。";
    button.textContent = "已蹭包";
  } catch (error) {
    document.querySelector("#rewardText").textContent = error.message;
    button.disabled = false;
    button.textContent = "蹭一下好友的包";
  }
}

applyTemplate();
rememberShare();
document.querySelector("#claimShareBtn").addEventListener("click", claimShare);
visitShare();
