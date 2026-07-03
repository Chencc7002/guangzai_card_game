const params = new URLSearchParams(window.location.search);
const shareId = params.get("shareId");
const scene = params.get("scene") || "invite";
const template = window.getShareTemplate ? window.getShareTemplate(scene) : { key: "invite" };
const input = document.querySelector("#targetUrl");
const qrImage = document.querySelector("#qrImage");

function applyTemplate() {
  document.title = `光仔卡牌${template.label || ""}海报`;
  document.querySelector("#campaignPoster").className = `campaign-poster poster-${template.key}`;
  document.querySelector("#posterBadge").textContent = `光仔卡牌 · ${template.label}`;
  document.querySelector("#posterTitle").innerHTML = template.posterTitle.replace("正在", "<br />正在");
  document.querySelector("#posterSubtitle").textContent = template.posterSubtitle;
  document.querySelector("#posterCopy").textContent = template.posterCopy;
  document.querySelector("#posterSlogan").textContent = template.posterSlogan;
}

function defaultTargetUrl() {
  if (!shareId) return new URL("./index.html", window.location.href).href;
  const target = new URL("./share.html", window.location.href);
  target.searchParams.set("shareId", shareId);
  target.searchParams.set("scene", template.key);
  return target.href;
}

function renderQr() {
  const targetUrl = input.value.trim() || defaultTargetUrl();
  const qrUrl = new URL("https://api.qrserver.com/v1/create-qr-code/");
  qrUrl.searchParams.set("size", "260x260");
  qrUrl.searchParams.set("margin", "12");
  qrUrl.searchParams.set("data", targetUrl);
  qrImage.src = qrUrl.href;
}

applyTemplate();
input.value = defaultTargetUrl();
document.querySelector("#refreshQr").addEventListener("click", renderQr);
renderQr();
