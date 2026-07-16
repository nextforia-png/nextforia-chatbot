function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

const PANEL_ICONS = {
  resumen: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect></svg>',
  conversaciones: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path></svg>',
  intervencion: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><polyline points="16 11 18 13 22 9"></polyline></svg>',
  plan: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>',
  package: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"></path><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="M3.3 7 12 12l8.7-5"></path><path d="M12 22V12"></path></svg>',
  gift: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"></rect><path d="M12 8v13"></path><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"></path><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"></path></svg>',
  check: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  sparkles: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"></path></svg>',
  instagram: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"></line></svg>'
};

module.exports = function renderCustomerPanel(res, options) {
  const auth = options.auth || { name: "Panel", role: "viewer" };
  const capabilities = options.capabilities || {};
  const dataPath = options.dataPath || "/admin/panel/data?limit=500";
  const healthPath = options.healthPath === null ? "" : (options.healthPath || "/admin/panel/health");
  const loginPath = options.loginPath === null ? "" : (options.loginPath || "/admin/panel");
  const requestedTab = ["summary", "conversations", "human", "appointments", "plan", "tests"].includes(options.initialTab)
    ? options.initialTab
    : "summary";
  const initialTab = requestedTab === "human" ? "conversations" : requestedTab;
  const initialChannel = "all";
  const canRunTests = !!capabilities.run_tests;
  const planNav = "<button class=\"navItem\" id=\"nav-plan\" type=\"button\" onclick=\"showTab('plan')\"><span class=\"navIcon\">" + PANEL_ICONS.plan + "</span><span>Mi plan</span></button>";
  const planMobileNav = "<button id=\"mnav-plan\" type=\"button\" onclick=\"showTab('plan')\"><span class=\"mobileNavIcon\">" + PANEL_ICONS.plan + "</span><span>Mi plan</span></button>";

  res.status(200).setHeader("content-type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Panel de control · RAV Toys</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --font-display:"Sora",sans-serif;
  --font-body:"Plus Jakarta Sans",sans-serif;
  --navy-950:#061226;
  --navy-900:#071832;
  --navy-800:#0B2145;
  --navy-700:#123466;
  --cyan-500:#12A8F4;
  --cyan-400:#25BFFF;
  --cyan-100:#E9F8FF;
  --cyan-050:#F3FBFF;
  --green-500:#16A76A;
  --green-100:#E7F8F0;
  --amber-500:#F5A524;
  --amber-100:#FFF1D6;
  --slate-900:#081634;
  --slate-700:#33425E;
  --slate-500:#78869F;
  --slate-300:#CBD5E1;
  --slate-200:#E2E8F0;
  --slate-100:#F1F5F9;
  --bg:#F6F8FC;
  --card:#FFFFFF;
  --line:#DCE5F1;
  --shadow:0 12px 30px rgba(8,22,52,.08);
  --shadow-soft:0 8px 22px rgba(8,22,52,.06);
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font-body),-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--slate-900);line-height:1.4}
button,input,textarea{font:inherit}
button{cursor:pointer}
.app{min-height:100vh;display:grid;grid-template-columns:250px minmax(0,1fr)}
.mobileTop,.mobileModuleBar,.mobileTabbar,.mobileBack,.mobilePeriodShell{display:none}
.sidebar{height:100vh;position:sticky;top:0;background:linear-gradient(180deg,var(--navy-950),var(--navy-900));color:#fff;padding:26px 18px;display:flex;flex-direction:column;gap:30px}
.brand{display:flex;align-items:center;gap:14px;padding:0 2px}
.ravLogo{width:56px;height:56px;border-radius:14px;background:linear-gradient(145deg,var(--cyan-400),var(--cyan-500));display:grid;place-items:center;font-size:22px;font-weight:800;letter-spacing:-.04em;box-shadow:0 14px 28px rgba(18,168,244,.24)}
.brand h1{font-size:21px;line-height:1;font-weight:800;letter-spacing:-.04em}
.brand p{margin-top:5px;color:#96A7C4;font-size:14px;font-weight:600}
.brand p span{color:var(--cyan-400)}
.moduleSwitcher{display:grid;gap:8px;margin-top:-10px}
.moduleTitle{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#6F819F;font-weight:950;padding:0 14px}
.moduleBtn{border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.04);color:#B9C5D8;padding:12px 14px;text-align:left;display:grid;gap:5px}
.moduleBtn strong{font-size:14px;color:#fff;font-weight:950}
.moduleBtn span{font-size:11px;color:#91A2BF;font-weight:800}
.moduleBtn.active{background:rgba(18,168,244,.14);border-color:rgba(37,191,255,.30);box-shadow:0 14px 26px rgba(18,168,244,.10)}
.moduleBtn.locked strong{color:#D8E2F2}
.moduleStatus{display:inline-flex;width:max-content;border-radius:999px;padding:4px 8px;background:rgba(20,169,113,.16);color:#9DF0C8;font-size:10px;font-weight:950}
.moduleStatus.off{background:rgba(245,165,36,.16);color:#FFD28A}
.nav{display:grid;gap:12px}
.navItem{height:52px;border:0;border-radius:16px;background:transparent;color:#AAB8D0;padding:0 16px;display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:12px;text-align:left;font-weight:800;font-size:17px}
.navItem:hover{background:rgba(255,255,255,.06);color:#fff}
.navItem.active{background:linear-gradient(135deg,var(--cyan-400),var(--cyan-500));color:#fff;box-shadow:0 18px 36px rgba(18,168,244,.24)}
.navIcon{font-size:22px;line-height:1;opacity:.92;display:inline-flex;align-items:center;justify-content:center}
.navIcon svg{width:20px;height:20px;display:block}
.navBadge{min-width:26px;height:22px;border-radius:999px;background:rgba(148,163,184,.35);color:#fff;display:grid;place-items:center;font-size:12px;padding:0 7px}
.navBadge.hot{background:var(--amber-500);color:#3C2600}
.whatsappCard{margin-top:auto;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);border-radius:16px;padding:18px 16px;color:#EAF2FF}
.whatsappCard strong{display:flex;align-items:center;gap:9px;font-size:15px}
.whatsappCard p{margin-top:8px;color:#92A2BE;font-size:13px;font-weight:600}
.statusDot{width:9px;height:9px;border-radius:50%;background:#22C778;box-shadow:0 0 0 4px rgba(34,199,120,.14)}
.main{min-width:0}
.topbar{height:72px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:18px;padding:0 28px;position:sticky;top:0;z-index:4}
.pageTitle h2{font-size:30px;line-height:1;font-weight:900;letter-spacing:-.05em}
.pageTitle p{margin-top:8px;color:var(--slate-500);font-size:15px;font-weight:600}
.toolbar{display:flex;align-items:center;gap:16px}
.periods{display:flex;background:#EDF2F8;border-radius:18px;padding:4px}
.periods button{height:42px;border:0;border-radius:14px;background:transparent;color:#71809B;padding:0 18px;font-size:16px;font-weight:800}
.periods button.active{background:#fff;color:var(--slate-900);box-shadow:var(--shadow-soft)}
.avatar{width:48px;height:48px;border-radius:999px;background:var(--navy-900);color:#fff;display:grid;place-items:center;font-size:17px;font-weight:900}
.content{padding:28px;max-width:1320px}
.view{display:none}
.view.active{display:block}
.summary{display:grid;grid-template-columns:1.7fr 1fr;gap:22px}
.iaBanner{grid-column:1/-1;border:1px solid #AEE4FF;background:var(--cyan-100);border-radius:20px;padding:20px 26px;display:flex;align-items:center;gap:20px;box-shadow:0 10px 35px rgba(18,168,244,.08)}
.iaIcon{width:54px;height:54px;border-radius:14px;background:linear-gradient(145deg,var(--cyan-400),var(--cyan-500));color:#fff;display:grid;place-items:center;font-size:26px;font-weight:900;flex:0 0 auto}
.iaBanner p{font-size:20px;line-height:1.35;color:var(--navy-900);font-weight:500}
.iaBanner strong{font-weight:900}
.metricRow{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}
.card{background:#fff;border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow)}
.metric{min-height:190px;padding:26px 24px;display:flex;flex-direction:column;justify-content:space-between}
.metricTop{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
.metricLabel{font-size:17px;line-height:1.08;color:#66738D;font-weight:900}
.metricIcon{width:46px;height:46px;border-radius:14px;background:#EAF8FF;color:var(--cyan-500);display:grid;place-items:center;font-size:22px;font-weight:900}
.metricIcon.amber{background:var(--amber-100);color:#9F690E}
.metricValue{font-size:44px;line-height:1;font-weight:950;letter-spacing:-.06em;color:var(--slate-900)}
.metricSub{display:flex;align-items:center;gap:12px;color:#94A3BA;font-size:16px;font-weight:700}
.delta{border-radius:999px;background:var(--green-100);color:#087E50;padding:5px 10px;font-size:14px;font-weight:900}
.solvedCard{background:radial-gradient(circle at 80% 18%,rgba(18,168,244,.28),transparent 36%),linear-gradient(145deg,var(--navy-900),var(--navy-700));color:#fff;border:0}
.solvedCard .metricLabel,.solvedCard .metricSub{color:#C7D3E6}
.solvedCard .metricValue{color:#fff}
.progress{height:9px;border-radius:999px;background:rgba(255,255,255,.18);overflow:hidden;margin-top:14px}
.progress span{display:block;height:100%;width:0;border-radius:999px;background:var(--cyan-500)}
.chartCard{min-height:340px;padding:26px 26px 22px}
.chartHead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.chartHead h3,.sectionTitle{font-size:21px;line-height:1.06;font-weight:950;letter-spacing:-.04em}
.chartHead p,.muted{color:#71809B;font-size:16px;font-weight:600}
.periodBadge{border-radius:999px;background:var(--cyan-100);color:#057BB6;padding:10px 18px;font-size:15px;font-weight:900;display:inline-flex;align-items:center;gap:9px}
.periodBadge:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--cyan-500)}
.areaChart{height:240px;margin-top:18px}
.areaChart svg{width:100%;height:100%;overflow:visible}
.sideStack{display:grid;gap:22px}
.satCard{min-height:150px;padding:24px;display:flex;align-items:center;gap:24px}
.ring{width:122px;height:122px;border-radius:50%;background:conic-gradient(var(--cyan-500) var(--satDeg,0deg),#EAF0F7 0);display:grid;place-items:center;flex:0 0 auto}
.ringInner{width:84px;height:84px;border-radius:50%;background:#fff;display:grid;place-items:center;text-align:center}
.ringInner strong{font-size:30px;line-height:1;font-weight:950;letter-spacing:-.05em}
.ringInner span{font-size:12px;color:#9AA8BE;font-weight:800}
.satCard h3{font-size:21px;font-weight:950;letter-spacing:-.04em}
.satCard p{margin-top:6px;color:#71809B;font-size:16px;font-weight:600}
.positive{margin-top:12px;background:var(--green-100);color:#087E50;border-radius:999px;padding:7px 12px;font-weight:900;display:inline-flex}
.darkInsight{background:radial-gradient(circle at 80% 15%,rgba(18,168,244,.26),transparent 38%),linear-gradient(145deg,var(--navy-900),var(--navy-700));border:0;color:#fff;padding:28px;min-height:214px}
.darkInsight h3{font-size:20px;font-weight:950;letter-spacing:-.04em;display:flex;align-items:center;gap:12px}
.darkInsight p{margin-top:22px;color:#C8D3E4;font-size:17px;line-height:1.5;font-weight:600}
.darkInsight strong,.darkInsight em{color:#5FD2FF;font-style:normal;font-weight:950}
.bottomGrid{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px}
.listCard{padding:26px;min-height:270px}
.listCard h3{font-size:21px;line-height:1.08;font-weight:950;letter-spacing:-.04em}
.listCard>p{margin-top:8px;color:#71809B;font-size:16px;font-weight:600}
.requestList,.outcomeList{display:grid;margin-top:22px}
.requestRow{display:grid;grid-template-columns:40px 1fr auto;gap:14px;align-items:center;border-top:1px solid var(--line);padding:13px 0}
.requestRow:first-child{border-top:0}
.zap{width:34px;height:34px;border-radius:11px;background:var(--amber-100);color:#A96C08;display:grid;place-items:center;font-size:19px}
.requestRow strong{font-size:16px;line-height:1.14;color:#34425C}
.countPill{border-radius:999px;background:#EEF2F7;color:#738198;padding:4px 10px;font-weight:900}
.outcomeRow{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;margin-top:20px}
.outcomeRow:first-child{margin-top:18px}
.outcomeRow label{color:#4A5870;font-size:16px;font-weight:700}
.outcomeRow strong{font-size:16px;font-weight:950}
.track{grid-column:1/-1;height:9px;border-radius:999px;background:#EAF0F7;overflow:hidden}
.track span{display:block;height:100%;width:0;border-radius:999px;background:var(--cyan-500)}
.track.green span{background:var(--green-500)}
.track.amber span{background:var(--amber-500)}
.nextCard{position:relative;padding:28px 26px;border-top:5px solid var(--cyan-500);min-height:270px;display:flex;flex-direction:column}
.nextCard h3{color:#057BB6;font-size:15px;letter-spacing:.18em;font-weight:950;text-transform:uppercase}
.nextCard p{margin-top:22px;font-size:18px;line-height:1.45;color:#24314B;font-weight:700}
.nextCard strong{font-weight:950}
.nextCard button{margin-top:auto;height:48px;border:0;border-radius:12px;background:linear-gradient(135deg,var(--cyan-400),var(--cyan-500));color:#fff;font-size:17px;font-weight:950}
.inboxShell{display:grid;grid-template-columns:320px minmax(360px,1fr) 310px;min-height:calc(100vh - 124px);background:#fff;border:1px solid var(--line);border-radius:20px;overflow:hidden;box-shadow:var(--shadow)}
.column{min-width:0;border-right:1px solid var(--line);display:flex;flex-direction:column}
.column:last-child{border-right:0}
.columnHead{padding:18px;border-bottom:1px solid var(--line)}
.columnHead h3{font-size:18px;font-weight:950}
.columnHead p{font-size:13px;color:var(--slate-500);margin-top:3px;font-weight:600}
.filters{display:flex;gap:6px;margin-top:14px;overflow:auto}
.filters button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:7px 10px;color:var(--slate-500);font-size:12px;font-weight:800}
.filters button.active{border-color:var(--cyan-500);background:var(--cyan-100);color:#057BB6}
.searchBox{padding:12px;border-bottom:1px solid var(--line)}
input,textarea{width:100%;border:1px solid var(--line);border-radius:12px;background:#fff;padding:10px 12px;color:var(--slate-900);font-size:13px}
textarea{resize:vertical;min-height:72px}
input:focus,textarea:focus{outline:3px solid rgba(18,168,244,.16);border-color:var(--cyan-500)}
.threads{overflow:auto;padding:8px;display:grid;align-content:start;gap:7px}
.thread{border:1px solid transparent;background:transparent;border-radius:14px;padding:12px;text-align:left;color:inherit}
.thread:hover{background:var(--slate-100)}
.thread.active{background:var(--cyan-050);border-color:#BDEBFF}
.thread.pending{border-color:#FFE0A3;background:#FFF9ED}
.threadTop{display:flex;justify-content:space-between;gap:10px}
.thread strong{font-size:13px}
.thread time{font-size:11px;color:var(--slate-500)}
.thread p{font-size:12px;color:var(--slate-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:5px}
.handoffGuide,.quickReplies,.contextBlock,.threadReason,.typingLine{display:none}
.tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
.tag{font-size:10px;color:var(--slate-700);background:var(--slate-100);border-radius:999px;padding:3px 7px}
.statusTag{font-weight:950}
.status-ai_active{color:#057BB6;background:#E3F6FF}
.status-needs_attention{color:#98640E;background:#FFF1D8}
.status-team_active{color:#5941A9;background:#EFEAFF}
.status-resolved{color:#087E50;background:#E7F8F0}
.chatHead{padding:16px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:12px}
.chatHead h3{font-size:18px;font-weight:950}
.chatHead p{font-size:13px;color:var(--slate-500);margin-top:2px}
.chatActions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
.ghostBtn,.primaryBtn{border-radius:12px;border:1px solid var(--line);background:#fff;color:var(--slate-700);min-height:38px;padding:0 12px;font-size:13px;font-weight:800}
.primaryBtn{border:0;color:#fff;background:linear-gradient(135deg,var(--cyan-400),var(--cyan-500))}
.messages{flex:1;overflow:auto;background:#F8FAFC;padding:18px;display:flex;flex-direction:column;gap:10px}
.bubble{max-width:78%;border-radius:16px;padding:10px 12px;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}
.bubble.customer{align-self:flex-start;background:#fff;border:1px solid var(--line)}
.bubble.bot{align-self:flex-start;background:#EAF8FF;border:1px solid #C8ECFF}
.bubble.human{align-self:flex-end;background:var(--navy-700);color:#fff}
.bubble.system{align-self:center;border-radius:999px;background:var(--slate-100);color:var(--slate-500);font-size:11px;padding:6px 10px}
.bubbleMeta{font-size:10px;color:var(--slate-500);margin-top:5px}
.bubble.human .bubbleMeta{color:#C8D3E6}
.composer{padding:14px;border-top:1px solid var(--line);display:grid;gap:9px}
.composerRow{display:block}
.composerTool,.sendCircle{width:40px;height:40px;border:0;border-radius:999px;background:var(--slate-100);color:var(--slate-700);font-size:18px;font-weight:900;display:none;place-items:center;flex:0 0 auto}
.sendCircle{background:linear-gradient(135deg,var(--cyan-400),var(--cyan-500));color:#fff}
.composerActions{display:flex;justify-content:space-between;align-items:center;gap:10px}
.composerActions small{color:var(--slate-500)}
.profile{padding:16px;overflow:auto;display:grid;align-content:start;gap:14px}
.profileCard{border:1px solid var(--line);border-radius:16px;padding:14px}
.profileCard h4{font-size:14px;font-weight:950}
.hint{background:linear-gradient(135deg,#F7FBFF,#EEF9FF);border-color:#C9EEFF}
.hint p{font-size:13px;color:var(--slate-700);margin-top:8px}
.tagBtn{border:1px solid var(--line);background:#fff;color:var(--slate-700);border-radius:999px;padding:6px 9px;font-size:11px;font-weight:800}
.tagBtn.active{background:var(--navy-700);border-color:var(--navy-700);color:#fff}
.tagBtn:disabled{opacity:.55;cursor:default}
.switchRow{display:flex;align-items:center;justify-content:space-between;gap:12px}
.switch{width:46px;height:26px;border-radius:999px;border:0;background:var(--slate-300);padding:3px}
.switch span{display:block;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .18s}
.switch.on{background:linear-gradient(135deg,var(--cyan-400),var(--cyan-500))}
.switch.on span{transform:translateX(20px)}
.humanMode .inboxShell{grid-template-columns:340px minmax(390px,1fr) 330px;background:#F8FAFC}
.humanMode .handoffGuide{display:flex;margin-top:14px;gap:10px;align-items:flex-start;border:1px solid #BDEBFF;background:var(--cyan-100);border-radius:16px;padding:12px;color:var(--navy-900)}
.humanMode .handoffGuide strong{font-size:13px;font-weight:950}
.humanMode .handoffGuide p{margin-top:3px;font-size:12px;color:#38506F}
.humanMode .thread{border-color:var(--line);background:#fff;box-shadow:0 6px 18px rgba(8,22,52,.04)}
.humanMode .thread.pending{border-color:#F4B750;background:#FFF8EA}
.humanMode .thread.active{border-color:var(--cyan-500);background:#F2FBFF}
.humanMode .threadReason{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px;color:#33425E;font-size:11px;font-weight:900}
.waitPill{border-radius:999px;background:#EEF2F7;color:#64748B;padding:4px 8px;font-size:10px;font-weight:950;white-space:nowrap}
.waitPill.hot{background:#FFE8E8;color:#B42323}
.humanMode .chatHead{background:#F7FBFF}
.humanMode .messages{background-color:#E9E1D7;background-image:radial-gradient(rgba(6,18,38,.07) 1px, transparent 1px);background-size:18px 18px;padding:22px}
.humanMode .bubble{position:relative;max-width:82%;border:0;box-shadow:0 2px 5px rgba(8,22,52,.08);padding:10px 12px 8px;border-radius:18px;font-size:13px}
.humanMode .bubble.customer{background:#fff;border-top-left-radius:5px}
.humanMode .bubble.bot{background:#DCF7FF;border-top-left-radius:5px}
.humanMode .bubble.human{background:#D9FDD3;color:#10291B;border-top-right-radius:5px}
.humanMode .bubble.system{box-shadow:none;background:rgba(255,255,255,.75);color:#526074}
.humanMode .bubbleMeta{display:flex;justify-content:flex-end;gap:5px;color:#667085;font-size:10px;margin-top:4px}
.humanMode .bubble.human .bubbleMeta{color:#557667}
.checks{letter-spacing:-.15em;color:#8A96A8}
.checks.read{color:var(--cyan-500)}
.typingLine{align-items:center;gap:7px;font-size:12px;color:#667085;padding:0 18px 10px}
.humanMode .typingLine{display:flex}
.typingDots{display:inline-flex;gap:3px}
.typingDots span{width:5px;height:5px;border-radius:50%;background:#94A3B8}
.humanMode .quickReplies{display:flex;gap:8px;overflow:auto;padding-bottom:2px}
.quickReplies button{border:1px solid #C8ECFF;background:#F2FBFF;color:#056A9B;border-radius:999px;padding:8px 10px;font-size:12px;font-weight:900;white-space:nowrap}
.humanMode .composer{background:#F7F8FA}
.humanMode .composerRow{display:grid;grid-template-columns:40px 40px 1fr auto;gap:8px;align-items:end}
.humanMode .composerTool,.humanMode .sendCircle{display:grid}
.humanMode .composer textarea{min-height:42px;max-height:120px;border-radius:999px;padding:12px 14px;background:#fff}
.humanMode .composerActions{display:none}
.humanMode .profileCard.handoffContext{background:#fff}
.humanMode .contextBlock{display:grid;gap:10px}
.contextLine{border-top:1px solid var(--line);padding-top:10px}
.contextLine:first-child{border-top:0;padding-top:0}
.contextLine span{display:block;color:var(--slate-500);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
.contextLine strong{display:block;margin-top:3px;color:var(--slate-900);font-size:13px}
.contextActions{display:grid;gap:8px;margin-top:12px}
.contextActions button{width:100%}
.empty{color:var(--slate-500);font-size:13px;padding:18px 0}
.planView{display:grid;gap:20px}
.moduleHero{display:grid;grid-template-columns:1.35fr .65fr;gap:20px;align-items:stretch;border-radius:24px;background:radial-gradient(circle at 80% 12%,rgba(18,168,244,.28),transparent 34%),linear-gradient(145deg,var(--navy-950),var(--navy-700));color:#fff;padding:28px;box-shadow:var(--shadow)}
.moduleHero h3{font-size:34px;line-height:1;font-weight:950;letter-spacing:-.05em}
.moduleHero p{margin-top:12px;color:#C8D3E6;font-size:16px;font-weight:700;max-width:680px}
.moduleHeroCard{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:18px}
.moduleHeroCard strong{display:block;font-size:13px;color:#fff;font-weight:950}
.moduleHeroCard p{font-size:13px;margin-top:8px}
.moduleBadge{display:inline-flex;border-radius:999px;background:rgba(245,165,36,.18);color:#FFD28A;padding:7px 10px;font-size:12px;font-weight:950;margin-bottom:16px}
.appointmentGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.appointmentMetric{padding:20px;min-height:150px}
.appointmentMetric span{color:var(--slate-500);font-size:13px;font-weight:900}
.appointmentMetric strong{display:block;margin-top:18px;font-size:34px;line-height:1;font-weight:950;letter-spacing:-.05em}
.appointmentMetric p{margin-top:8px;color:var(--slate-500);font-size:12px;font-weight:700}
.moduleInfoGrid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.moduleList{display:grid;gap:12px;margin-top:18px}
.moduleList li{list-style:none;display:flex;gap:10px;align-items:flex-start;color:#34425C;font-size:14px;font-weight:750}
.moduleList .benefitIcon{margin-top:2px}
.serviceGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:18px}
.serviceCard{border:1px solid var(--line);border-radius:20px;padding:18px;background:#FAFCFF;display:grid;gap:12px}
.serviceCard.active{background:var(--cyan-050);border-color:#BDEBFF}
.serviceCard h4{font-size:17px;font-weight:950}
.serviceCard p{color:var(--slate-500);font-size:13px;font-weight:700}
.serviceState{display:inline-flex;width:max-content;border-radius:999px;background:var(--green-100);color:#087E50;padding:6px 10px;font-size:11px;font-weight:950}
.serviceState.off{background:var(--amber-100);color:#98640E}
.planHero{display:grid;grid-template-columns:1.2fr .8fr;gap:20px;border-radius:24px;background:radial-gradient(circle at 82% 12%,rgba(18,168,244,.30),transparent 34%),linear-gradient(145deg,var(--navy-950),var(--navy-700));color:#fff;padding:26px;box-shadow:var(--shadow)}
.planHero h3{font-size:30px;line-height:1;font-weight:950;letter-spacing:-.05em}
.planHero p{margin-top:10px;color:#C8D3E6;font-weight:700}
.planMeta{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}
.planPill{border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);padding:8px 12px;font-size:12px;font-weight:900}
.planPill.ok{background:rgba(20,169,113,.16);color:#9DF0C8;border-color:rgba(20,169,113,.28)}
.usageCard{background:#fff;border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:20px;color:var(--slate-900);box-shadow:0 20px 45px rgba(0,0,0,.14)}
.usageTop{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.usageTop h4{font-size:16px;font-weight:950}
.usageTop strong{font-size:34px;line-height:1;font-weight:950;letter-spacing:-.05em}
.usageTop span{display:block;margin-top:4px;color:var(--slate-500);font-size:12px;font-weight:800}
.usageBar{height:12px;border-radius:999px;background:#EAF0F7;overflow:hidden;margin-top:18px}
.usageFill{height:100%;width:0;border-radius:999px;background:var(--cyan-500)}
.usageFill.warn{background:var(--amber-500)}
.usageFill.limit{background:#EF4E4E}
.usageMsg{margin-top:12px;color:var(--slate-700);font-size:13px;font-weight:800}
.planBlock{background:#fff;border:1px solid var(--line);border-radius:22px;padding:22px;box-shadow:var(--shadow)}
.planBlock h3{font-size:22px;line-height:1.08;font-weight:950;letter-spacing:-.04em}
.planBlock>p{margin-top:7px;color:var(--slate-500);font-size:14px;font-weight:700}
.recommendation{display:flex;align-items:center;justify-content:space-between;gap:18px;background:linear-gradient(135deg,#F3FBFF,#fff);border-color:#BDEBFF}
.recommendationIcon{width:50px;height:50px;border-radius:16px;background:linear-gradient(135deg,var(--cyan-400),var(--cyan-500));color:#fff;display:grid;place-items:center;font-size:24px;flex:0 0 auto}
.recommendationText{display:flex;align-items:flex-start;gap:16px}
.recommendationActions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
.planGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:18px}
.planOption{position:relative;border:1px solid var(--line);border-radius:20px;padding:20px;display:flex;flex-direction:column;gap:16px;min-height:360px;background:#fff}
.planOption.dark{background:radial-gradient(circle at 80% 12%,rgba(18,168,244,.32),transparent 36%),linear-gradient(145deg,var(--navy-900),var(--navy-700));border:0;color:#fff;box-shadow:0 20px 50px rgba(6,18,38,.22)}
.planOption h4{font-size:18px;font-weight:950;line-height:1.1}
.planOption p{color:var(--slate-500);font-size:13px;font-weight:700}
.planOption.dark p{color:#C8D3E6}
.priceLine strong{font-size:22px;font-weight:950;display:block}
.priceLine span{color:var(--slate-500);font-size:12px;font-weight:800}
.planOption.dark .priceLine span{color:#BFD0E8}
.planBadge{position:absolute;top:14px;right:14px;border-radius:999px;background:var(--cyan-100);color:#057BB6;padding:6px 9px;font-size:11px;font-weight:950}
.planOption.dark .planBadge{background:var(--amber-500);color:#3C2600}
.benefits{display:grid;gap:9px;margin-top:2px}
.benefits li{list-style:none;font-size:13px;color:#34425C;font-weight:750;display:flex;align-items:flex-start;gap:8px}
.benefitIcon{color:var(--green-500);display:inline-flex;align-items:center;justify-content:center;margin-top:1px;flex:0 0 auto}
.benefitIcon svg{width:15px;height:15px;display:block}
.planOption.dark .benefits li{color:#EEF6FF}
.sectionIcon{display:inline-flex;align-items:center;justify-content:center;color:var(--cyan-500);vertical-align:-4px;margin-right:8px}
.promoCard .sectionIcon{color:#5FD2FF}
.sectionIcon svg{width:20px;height:20px;display:block}
.planActions{display:grid;gap:8px;margin-top:auto}
.planActions button:disabled{opacity:.55;cursor:default}
.rescueGrid,.refPromoGrid,.transparencyGrid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}
.rescueCard{border:1px solid var(--line);border-radius:18px;padding:18px;background:#FAFCFF}
.rescueCard strong{font-size:28px;font-weight:950;display:block}
.rescueCard span{display:block;margin-top:4px;color:var(--slate-500);font-size:13px;font-weight:800}
.refCode{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px dashed #9DDCFA;background:var(--cyan-050);border-radius:16px;padding:14px;margin-top:14px}
.refCode code{font-size:22px;color:var(--navy-900);font-weight:950;letter-spacing:.08em}
.promoCard{background:linear-gradient(135deg,var(--navy-900),var(--navy-700));color:#fff;border:0}
.promoCard p{color:#D4E1F5}
.transparencyGrid{grid-template-columns:repeat(4,minmax(0,1fr))}
.transparencyBox{border:1px solid var(--line);border-radius:18px;padding:16px;background:#FAFCFF}
.transparencyBox h4{font-size:14px;font-weight:950;margin-bottom:10px}
.transparencyBox li{list-style:none;color:#4A5870;font-size:12px;font-weight:700;padding:6px 0;border-top:1px solid #E9EEF5}
.transparencyBox li:first-child{border-top:0}
.testGrid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.testCard{padding:22px}
.formStack{display:grid;gap:10px;margin-top:14px}
.resultBox{border-top:1px solid var(--line);padding-top:12px;margin-top:12px;color:var(--slate-500);font-size:13px}
.resultItem{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--slate-100);border-radius:12px;padding:10px;margin-top:7px}
.resultItem a{color:var(--navy-700);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.statusLine{min-height:28px;color:var(--slate-500);font-size:12px;padding:0 14px 12px}
@media(max-width:1120px){
  .app{grid-template-columns:1fr}
  .sidebar{position:relative;height:auto;flex-direction:row;align-items:center;flex-wrap:wrap}
  .nav{display:flex;overflow:auto;width:100%}
  .navItem{min-width:max-content}
  .whatsappCard{display:none}
  .summary,.bottomGrid,.metricRow,.testGrid,.planHero,.planGrid,.rescueGrid,.refPromoGrid,.moduleHero,.appointmentGrid,.moduleInfoGrid{grid-template-columns:1fr 1fr}
  .transparencyGrid{grid-template-columns:1fr 1fr}
  .inboxShell{grid-template-columns:300px 1fr}
  .profileColumn{display:none}
}
@media(max-width:760px){
  body{background:#F5F7FB}
  .app{display:block;min-height:100vh;padding-bottom:86px}
  .sidebar{display:none}
  .main{min-width:0}
  .topbar{display:none}
  .mobileTop{display:flex;position:sticky;top:0;z-index:8;background:#fff;border-bottom:1px solid var(--line);padding:12px 16px;align-items:center;justify-content:space-between;gap:12px}
  .mobileBrand{display:flex;align-items:center;gap:10px;min-width:0}
  .mobileBrand .ravLogo{width:42px;height:42px;border-radius:13px;font-size:17px}
  .mobileBrand h1{font-size:18px;line-height:1;font-weight:950;letter-spacing:-.04em}
  .mobileBrand p{font-size:12px;color:var(--slate-500);font-weight:700;margin-top:2px}
.mobileBrand p span{color:var(--cyan-500)}
  .mobileAvatar{width:40px;height:40px;border-radius:999px;background:var(--navy-900);color:#fff;display:grid;place-items:center;font-weight:950}
  .mobileModuleBar{display:flex;gap:8px;overflow:auto;padding:10px 14px 0;background:#fff}
  .mobileModuleBar button{border:1px solid var(--line);background:#fff;color:var(--slate-700);border-radius:999px;padding:9px 12px;font-size:12px;font-weight:900;white-space:nowrap}
  .mobileModuleBar button.active{border-color:var(--cyan-500);background:var(--cyan-100);color:#057BB6}
  .mobileModuleBar button.locked{color:#8A96A8}
  .content{padding:14px}
  .summary{display:block}
  .iaBanner{border-radius:22px;padding:18px;align-items:flex-start;margin-bottom:14px}
  .iaIcon{width:46px;height:46px;border-radius:14px;font-size:23px}
  .iaBanner p{font-size:17px;line-height:1.38}
  .metricRow{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
  .metric{min-height:132px;border-radius:18px;padding:16px}
  .metricLabel{font-size:13px;line-height:1.12}
  .metricIcon{width:38px;height:38px;border-radius:12px;font-size:18px}
  .metricValue{font-size:31px}
  .metricSub{font-size:12px;gap:7px;align-items:flex-start;flex-wrap:wrap}
  .delta{font-size:11px;padding:4px 7px}
  .solvedCard{grid-column:1/-1;min-height:154px}
  .metricRow .metric:nth-child(4){grid-column:1/-1;min-height:128px}
  .progress{height:8px}
  .chartCard{min-height:250px;border-radius:20px;padding:18px;margin-bottom:12px}
  .chartHead{display:block}
  .chartHead h3,.sectionTitle{font-size:20px}
  .chartHead p,.muted{font-size:14px;margin-top:5px}
  .periodBadge{margin-top:12px;padding:8px 12px;font-size:13px}
  .areaChart{height:168px;margin-top:8px}
  .sideStack{display:block}
  .satCard{padding:18px;border-radius:20px;margin-bottom:12px;min-height:130px}
  .ring{width:98px;height:98px}
  .ringInner{width:68px;height:68px}
  .ringInner strong{font-size:24px}
  .satCard h3{font-size:19px}
  .satCard p{font-size:14px}
  .positive{font-size:13px;padding:6px 10px}
  .darkInsight{border-radius:20px;padding:20px;min-height:170px;margin-bottom:12px}
  .darkInsight p{font-size:16px;margin-top:14px}
  .bottomGrid{display:grid;grid-template-columns:1fr;gap:12px}
  .listCard,.nextCard{border-radius:20px;padding:20px;min-height:auto}
  .requestRow{grid-template-columns:36px 1fr auto;padding:12px 0}
  .requestRow strong{font-size:15px}
  .nextCard p{font-size:17px}
  .nextCard button{height:50px;width:100%;margin-top:24px}
  .inboxShell{display:block;border:0;border-radius:0;box-shadow:none;background:transparent;min-height:auto}
  .column{border:0;background:#fff;border-radius:20px;box-shadow:var(--shadow);overflow:hidden}
  .listColumn{display:flex;min-height:calc(100vh - 178px)}
  .chatColumn{display:none;min-height:calc(100vh - 108px)}
  .profileColumn{display:none}
  body.chat-open .listColumn{display:none}
  body.chat-open .chatColumn{display:flex}
  body.chat-open .mobileTabbar{display:none}
  body.chat-open .app{padding-bottom:0}
  .mobileBack{display:inline-flex;align-items:center;gap:7px;border:0;background:var(--slate-100);border-radius:999px;padding:8px 12px;color:var(--slate-700);font-weight:900;margin-bottom:12px}
  .columnHead{padding:18px}
  .columnHead h3{font-size:22px}
  .columnHead p{font-size:14px}
  .filters{gap:7px}
  .filters button{min-height:38px;padding:8px 12px;font-size:12px}
  .searchBox{padding:0 18px 14px;border-bottom:1px solid var(--line)}
  input,textarea{font-size:16px}
  .threads{padding:10px;gap:9px}
  .thread{background:#fff;border:1px solid var(--line);box-shadow:0 6px 18px rgba(8,22,52,.04);padding:14px}
  .thread strong{font-size:15px}
  .thread p{font-size:13px;margin-top:7px}
  .tag{font-size:11px;padding:4px 8px}
  .chatHead{padding:14px;display:block}
  .chatHead h3{font-size:18px}
  .chatHead p{font-size:13px}
  .chatActions{margin-top:12px;justify-content:flex-start}
  .ghostBtn,.primaryBtn{min-height:44px}
  .messages{padding:14px;min-height:calc(100vh - 312px)}
  .bubble{max-width:92%;font-size:14px;border-radius:18px}
  .composer{padding:12px}
  .composerActions{align-items:center}
  .mobilePeriodShell{display:flex;margin-bottom:14px}
  .mobilePeriodShell .periods{width:100%;justify-content:space-between;border-radius:18px}
  .mobilePeriodShell .periods button{flex:1;height:42px;font-size:14px;padding:0}
  .mobileTabbar{display:grid;position:fixed;left:0;right:0;bottom:0;z-index:12;grid-template-columns:repeat(var(--mobile-tabs,4),1fr);gap:4px;padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);border-top:1px solid var(--line);box-shadow:0 -12px 30px rgba(8,22,52,.08);backdrop-filter:blur(12px)}
  .mobileTabbar button{position:relative;min-height:54px;border:0;border-radius:16px;background:transparent;color:#74839D;font-size:11px;font-weight:900;display:grid;place-items:center;gap:2px}
.mobileTabbar button span:first-child{font-size:20px;line-height:1}
.mobileNavIcon{display:inline-flex;align-items:center;justify-content:center}
.mobileNavIcon svg{width:20px;height:20px;display:block}
  .mobileTabbar button.active{background:var(--cyan-100);color:#057BB6}
  .mobileBadge{position:absolute;top:5px;right:18px;min-width:18px;height:18px;border-radius:999px;background:var(--amber-500);color:#3C2600;font-size:10px;display:grid;place-items:center;padding:0 5px}
  .planView{gap:12px}
  .moduleHero{grid-template-columns:1fr;border-radius:22px;padding:20px}
  .moduleHero h3{font-size:28px}
  .moduleHero p{font-size:15px}
  .appointmentGrid,.moduleInfoGrid{grid-template-columns:1fr}
  .appointmentMetric{min-height:auto;border-radius:18px;padding:18px}
  .planHero{grid-template-columns:1fr;border-radius:22px;padding:20px}
  .planHero h3{font-size:26px}
  .usageCard{padding:16px}
  .recommendation{display:block}
  .recommendationText{gap:12px}
  .recommendationActions{justify-content:stretch;margin-top:16px}
  .recommendationActions button{width:100%}
  .planBlock{border-radius:20px;padding:18px}
  .planGrid,.rescueGrid,.refPromoGrid,.transparencyGrid,.serviceGrid{grid-template-columns:1fr}
  .planOption{min-height:auto}
  .refCode{display:grid}
  .testGrid{grid-template-columns:1fr}
}

/* Conversaciones v2 · handoff Nextfor IA */
.convImpact{display:none;align-items:center;gap:7px;border-radius:999px;background:var(--green-100);color:#087E50;padding:9px 14px;font-size:13px;font-weight:900;white-space:nowrap}
body.conversations-view .pageTitle h2,.guidedTitle strong,.profileIdentity h3,.relationshipCard strong{font-family:var(--font-display)}
body.conversations-view .topbar{height:108px;align-items:flex-start;padding:15px 28px}
body.conversations-view .pageTitle h2{font-size:24px;letter-spacing:-.03em}
body.conversations-view .pageTitle p{font-size:13.5px;margin-top:5px}
.omnichannelStrip{display:none;align-items:center;gap:8px;margin-top:8px;color:var(--slate-500);font-size:12px;font-weight:750}
body.conversations-view .omnichannelStrip{display:flex}
.omnichannelStrip>i{width:1px;height:13px;background:var(--line)}
.channelStripBadges{display:inline-flex;align-items:center;gap:6px}
.mobileOmnichannelStrip{display:none;align-items:center;gap:8px;color:var(--slate-500);font-size:11.5px;font-weight:750}
body.conversations-view .toolbar .periods{display:none}
body.conversations-view .convImpact{display:inline-flex}
body.conversations-view .content{padding:0;max-width:none}
body.conversations-view .inboxShell{height:calc(100vh - 108px);min-height:600px;grid-template-columns:372px minmax(440px,1fr) 296px;border:0;border-radius:0;box-shadow:none}
.convListControls{padding:16px 16px 12px;display:grid;gap:12px;border-bottom:1px solid var(--line)}
.convListControls .searchBox{height:44px;padding:0 13px;border:1.5px solid var(--slate-300);border-radius:12px;background:#F8FAFC;display:flex;align-items:center;gap:9px}
.convListControls .searchBox input{border:0;background:transparent;padding:0;font-size:14px;min-width:0}
.convListControls .searchBox input:focus{outline:0}
.searchIcon{font-size:23px;line-height:1;color:var(--slate-500);transform:rotate(-20deg)}
.convListControls .filters{margin:0;gap:8px;overflow:visible}
.convListControls .filters button{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:7px 10px;border-color:var(--line);font-size:12px;white-space:nowrap}
.convListControls .filters button span{min-width:18px;border-radius:999px;background:var(--slate-100);padding:1px 5px;font-size:10px;font-weight:950}
.convListControls .filters button.active{background:var(--navy-800);border-color:var(--navy-800);color:#fff}
.convListControls .filters button.active span{background:rgba(255,255,255,.2);color:inherit}
.convListControls .filters #filter-you.active{background:var(--amber-500);border-color:var(--amber-500);color:#3A2708}
.convListControls .filters #filter-resolved.active{background:var(--green-500);border-color:var(--green-500);color:#fff}
.threads{padding:8px 12px 16px;gap:8px}
.filterIntro{display:flex;gap:12px;align-items:flex-start;padding:14px 15px;border-radius:14px;margin-bottom:4px;text-align:left}
.filterIntro.you{background:#FFF7E8;border:1px solid #F3DEB4;color:#7A4E08}
.filterIntro.ok{background:var(--green-100);border:1px solid #C3EAD7;color:#0B7A50}
.filterIntro span{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto;background:currentColor;color:#fff}
.filterIntro strong{display:block;font-size:14px;font-weight:950}
.filterIntro p{white-space:normal;margin-top:3px;color:inherit;font-size:12px;line-height:1.45}
.thread{position:relative;border:1px solid var(--line);border-left-width:3px;background:#fff;border-radius:14px;padding:12px 12px 12px 13px;box-shadow:none;transition:background .16s ease,box-shadow .16s ease,transform .16s ease}
.thread:hover{background:#F8FBFF;box-shadow:var(--shadow-soft);transform:translateY(-1px)}
.thread.active{background:var(--cyan-050);border-color:#71D3FF;box-shadow:var(--shadow-soft)}
.thread.status-you{border-left-color:var(--amber-500)}
.thread.status-ia{border-left-color:var(--cyan-500)}
.thread.status-ok{border-left-color:var(--green-500)}
.threadMain{display:flex;align-items:center;gap:11px}
.avatarChannelWrap{position:relative;display:inline-flex;flex:0 0 auto}
.contactAvatar{width:44px;height:44px;border-radius:13px;background:linear-gradient(135deg,var(--navy-700),var(--cyan-500));color:#fff;display:grid;place-items:center;flex:0 0 auto;font-weight:900;font-size:14px;letter-spacing:-.02em}
.contactAvatar.big{width:64px;height:64px;border-radius:18px;font-size:20px}
.threadIdentity{min-width:0;flex:1}
.threadTop strong{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.thread p{font-size:12.5px;margin-top:2px}
.threadStatus{display:flex;align-items:center;gap:8px;margin-top:10px;padding-left:55px;min-width:0}
.threadStatus small{color:var(--slate-500);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.statusPill,.chatStatusPill{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:900;white-space:nowrap}
.statusPill.you,.chatStatusPill.you{background:#FFF1D8;color:#9A6410}
.statusPill.ia,.chatStatusPill.ia{background:#E3F6FF;color:#057BB6}
.statusPill.ok,.chatStatusPill.ok{background:var(--green-100);color:#087E50}
.channelBadge{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;color:#fff}
.channelBadge.floating{position:absolute;right:-4px;bottom:-4px;width:18px;height:18px;border:2px solid #fff;box-shadow:0 1px 4px rgba(6,15,34,.3)}
.channelBadge.floating.large{width:26px;height:26px;right:-5px;bottom:-5px}
.channelBadge svg{width:58%;height:58%;display:block}
.channelBadge.whatsapp{background:#25D366}
.channelBadge.instagram{background:linear-gradient(135deg,#FEDA75,#FA7E1E,#D62976 55%,#962FBF,#4F5BD5)}
.channelBadge.messenger{background:linear-gradient(135deg,#00B2FF,#006AFF)}
.channelBadge.email{background:#5A6A87}
.liveDot{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px rgba(18,168,244,.18)}
.chatHead{padding:15px 22px;background:#fff;gap:13px;flex-wrap:nowrap}
.chatIdentity{flex:1;min-width:0}
.chatIdentity h3{font-size:16px}
.chatIdentity p{display:flex;align-items:center;gap:6px;font-size:12.5px}
.chatIdentity p:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--green-500)}
.chatStatusPill{font-size:12px;padding:5px 12px}
.messages{padding:22px;background:#F8FAFC;gap:14px}
.bubble{max-width:74%;padding:11px 15px;font-size:14px;line-height:1.5;border-radius:16px;box-shadow:0 3px 10px rgba(8,22,52,.04)}
.bubble.customer{align-self:flex-start;background:#fff;border:1px solid var(--line);border-bottom-left-radius:4px}
.bubble.bot{align-self:flex-end;background:var(--cyan-100);border:1px solid #CDEBFB;border-bottom-right-radius:4px;color:var(--navy-800)}
.bubble.human{align-self:flex-end;background:linear-gradient(135deg,var(--navy-700),var(--cyan-500));border-bottom-right-radius:4px;color:#fff}
.bubbleMeta{text-align:right;font-size:10.5px}
.conversationAction{flex:0 0 auto;background:#fff;border-top:1px solid var(--line);padding:14px 22px 12px}
.guidedAction{display:none;padding:16px 17px;margin-bottom:4px;background:var(--cyan-050);border:1px solid #BEE6FB;border-radius:16px}
.guidedTitle{display:flex;align-items:center;gap:9px;color:var(--navy-800)}
.guidedTitle span{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,var(--cyan-400),var(--cyan-500));color:#fff;display:grid;place-items:center;box-shadow:0 8px 20px rgba(18,168,244,.22)}
.guidedTitle strong{font-size:14.5px;font-weight:950}
.guidedAction>p{font-size:13px;line-height:1.5;color:var(--navy-700);margin:9px 0 11px}
.guidedAction textarea{min-height:76px;resize:none;padding:13px 15px;border:1.5px solid #BEE6FB;border-radius:13px;font-size:14px;line-height:1.55}
.guidedFooter{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px}
.guidedFooter>span{font-size:12px;color:#057BB6;margin-left:auto}
.confirmBtn{border:0;border-radius:12px;background:linear-gradient(135deg,var(--cyan-400),var(--cyan-500));color:#fff;min-height:44px;padding:0 20px;font-weight:950;box-shadow:0 10px 22px -8px rgba(0,160,240,.6)}
.textBtn{border:0;background:transparent;color:var(--slate-500);min-height:40px;font-size:13px;font-weight:900;padding:0 4px}
.stateBand{display:none;align-items:center;gap:11px;padding:13px 15px;margin-bottom:12px;border-radius:14px;font-size:13px;font-weight:750}
.stateBand.ia{display:flex;background:var(--cyan-100);border:1px solid #CDEBFB;color:#075985}
.stateBand.ok{display:flex;background:var(--green-100);color:#0B7A50}
.stateBand .bandIcon{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:currentColor;color:#fff}
.composer{padding:0;border:0;display:grid;gap:5px}
.composerRow{display:flex;align-items:center;gap:12px}
.composerRow input{height:48px;border-radius:999px;padding:0 18px;font-size:14px}
.sendCircle{display:grid;width:48px;height:48px;background:linear-gradient(135deg,var(--cyan-400),var(--cyan-500));color:#fff;box-shadow:0 8px 20px rgba(18,168,244,.24)}
.composerActions{display:none}
.statusLine{padding:6px 0 0;min-height:20px}
.profile{padding:22px 20px;gap:20px}
.profileIdentity{display:flex;flex-direction:column;align-items:center;text-align:center;gap:7px}
.profileIdentity h3{font-size:17px;font-weight:950}
.profileIdentity p{color:var(--slate-500);font-size:12.5px}
.copyContact{border:1px solid var(--slate-300);background:#fff;border-radius:999px;color:var(--navy-700);padding:6px 13px;font-size:12.5px;font-weight:800}
.relationshipCard{padding:15px 16px;border-radius:16px;background:linear-gradient(135deg,var(--cyan-050),#EAF7FE);border:1px solid #CDEBFB}
.relationshipCard>span,.aiUnderstood>span{display:block;font-size:11px;font-weight:950;letter-spacing:.06em;text-transform:uppercase;color:#057BB6;margin-bottom:7px}
.relationshipCard div{display:flex;align-items:baseline;gap:8px}
.relationshipCard strong{font-size:24px;font-weight:950;color:var(--navy-800);letter-spacing:-.03em}
.relationshipCard small{font-size:12px;font-weight:800;color:var(--navy-700)}
.relationshipCard p{font-size:12.5px;line-height:1.45;color:var(--navy-700);margin-top:7px}
.customerFacts{display:grid}
.customerFact{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);font-size:12.5px;color:var(--slate-500)}
.customerFact strong{color:var(--slate-900);font-size:13px}
.aiUnderstood{padding:15px 16px;border-radius:16px;background:#F8FAFC;border:1px solid var(--line)}
.aiUnderstood strong{display:block;color:var(--navy-800);font-size:13px;line-height:1.4}
.aiChips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.aiChips span{border-radius:999px;background:var(--cyan-100);color:#057BB6;padding:5px 8px;font-size:10.5px;font-weight:850}
.noteCard h4{font-size:14px;font-weight:950}
.noteCard textarea{margin-top:9px;min-height:76px}
.noteCard button{margin-top:9px;width:100%}
.noteCard p{font-size:11px;color:var(--slate-500);margin-top:6px}

@media(max-width:1450px) and (min-width:1181px){
  body.conversations-view .inboxShell{grid-template-columns:320px minmax(380px,1fr) 270px}
  .profile{padding:18px 16px}
}
@media(max-width:1180px) and (min-width:761px){
  body.conversations-view .inboxShell{grid-template-columns:330px minmax(420px,1fr)}
  body.conversations-view .profileColumn{display:none}
}
@media(max-width:760px){
  body.conversations-view .content{padding:0}
  body.conversations-view .mobileModuleBar{padding-bottom:10px;border-bottom:1px solid var(--line)}
  body.conversations-view .inboxShell{height:auto;min-height:calc(100vh - 174px);display:block}
  body.conversations-view .listColumn,body.conversations-view .chatColumn{border-radius:0;box-shadow:none;min-height:calc(100vh - 174px)}
  .convListControls{padding:14px 14px 10px}
  .mobileOmnichannelStrip{display:flex}
  .convListControls .filters{overflow-x:auto;padding-bottom:2px}
  .convListControls .filters button{min-height:38px}
  .threads{padding:8px 10px 18px}
  .thread{padding:13px}
  .threadStatus{padding-left:51px}
  .chatHead{display:grid;grid-template-columns:auto auto 1fr;padding:12px 14px}
  .chatHead .mobileBack{grid-column:1/-1;width:max-content;margin-bottom:2px}
  .chatStatusPill{grid-column:2/-1;width:max-content;margin-left:0}
  .messages{padding:16px 14px;min-height:calc(100vh - 420px)}
  .bubble{max-width:90%;font-size:13.5px}
  .conversationAction{padding:12px 14px 10px}
  .guidedAction{padding:14px}
  .guidedFooter{display:grid;grid-template-columns:1fr 1fr}
  .guidedFooter>span{grid-column:1/-1;margin:0;text-align:center}
  .confirmBtn{width:100%;padding:0 12px}
  .stateBand{align-items:flex-start}
  .profileColumn{display:none}
}
</style>
</head>
<body>
<div class="app">
  <header class="mobileTop">
    <div class="mobileBrand"><div class="ravLogo">RAV</div><div><h1>RAV Toys</h1><p>con Nextfor <span>IA</span></p></div></div>
    <div class="mobileAvatar">RA</div>
  </header>
  <div class="mobileModuleBar" aria-label="Módulos">
    <button id="mobileModule-support" type="button" onclick="showChannel('all')">Atención al cliente · Activo</button>
    <button id="mobileModule-appointments" class="locked" type="button" onclick="showTab('appointments')">Agendamiento de citas · No activo</button>
  </div>
  <aside class="sidebar">
    <div class="brand">
      <div class="ravLogo">RAV</div>
      <div><h1>RAV Toys</h1><p>con Nextfor <span>IA</span></p></div>
    </div>
    <div class="moduleSwitcher" aria-label="Módulos del panel">
      <div class="moduleTitle">Módulos</div>
      <button class="moduleBtn" id="module-support" type="button" onclick="showChannel('all')"><strong>Atención al cliente</strong><span class="moduleStatus" id="moduleStatus-support">Activo</span><span>WhatsApp + Instagram</span></button>
      <button class="moduleBtn locked" id="module-appointments" type="button" onclick="showTab('appointments')"><strong>Agendamiento de citas</strong><span class="moduleStatus off">No activo</span></button>
    </div>
    <nav class="nav" aria-label="Secciones">
      <button class="navItem" id="nav-summary" type="button" onclick="showTab('summary')"><span class="navIcon">${PANEL_ICONS.resumen}</span><span>Resumen</span></button>
      <button class="navItem" id="nav-conversations" type="button" onclick="showTab('conversations')"><span class="navIcon">${PANEL_ICONS.conversaciones}</span><span>Conversaciones</span><span class="navBadge" id="navConvCount"></span></button>
      ${planNav}
    </nav>
    <div class="whatsappCard">
      <strong><span class="statusDot" id="channelStatusDot"></span><span id="channelStatusTitle">Bot de atención conectado</span></strong>
      <p id="channelStatusDetail">Atención al cliente · Plan Growth</p>
    </div>
  </aside>
  <main class="main">
    <header class="topbar">
      <div class="pageTitle"><h2 id="pageTitle">Resumen</h2><p id="pageSubtitle">Resultados del bot de atención · Últimos 7 días</p><div class="omnichannelStrip"><span>Todo en una bandeja</span><i></i><span class="channelStripBadges" data-channel-strip></span></div></div>
      <div class="toolbar"><div class="periods"><button type="button">Hoy</button><button class="active" type="button">7 días</button><button type="button">30 días</button></div><span class="convImpact" id="conversationImpact">0% resuelto por la IA</span><div class="avatar">RA</div></div>
    </header>
    <div class="content">
      <section class="view" id="panel-summary">
        <div class="mobilePeriodShell"><div class="periods"><button type="button">Hoy</button><button class="active" type="button">7 días</button><button type="button">30 días</button></div></div>
        <div class="summary">
          <div class="iaBanner"><div class="iaIcon">✧</div><p id="heroLine">Esta semana atendiste a <strong>0 clientes</strong> entre WhatsApp e Instagram — tu equipo se ahorró trabajo repetitivo, sin dejar un solo mensaje sin responder.</p></div>
          <div class="metricRow">
            <article class="card metric"><div class="metricTop"><span class="metricLabel">Ventas asistidas</span><span class="metricIcon">▣</span></div><div><strong class="metricValue" id="kSales">-</strong><p class="metricSub"><span class="delta" id="kSalesDelta">↗ +0</span><span id="kSalesSub">ventas o intentos</span></p></div></article>
            <article class="card metric"><div class="metricTop"><span class="metricLabel">Clientes<br>atendidos</span><span class="metricIcon">♙</span></div><div><strong class="metricValue" id="kClients">-</strong><p class="metricSub"><span class="delta">↗ +0%</span><span>personas únicas</span></p></div></article>
            <article class="card metric solvedCard"><div class="metricTop"><span class="metricLabel">✧ Resueltas por el bot</span></div><div><strong class="metricValue" id="kResolved">-</strong><p class="metricSub" id="kResolvedSub">soluciones sin ayuda humana</p><div class="progress"><span id="resolvedProgress"></span></div></div></article>
            <article class="card metric"><div class="metricTop"><span class="metricLabel">Tiempo de<br>respuesta</span><span class="metricIcon amber">◷</span></div><div><strong class="metricValue" id="kResponse">24/7</strong><p class="metricSub">promedio · responde siempre</p></div></article>
          </div>
          <section class="card chartCard"><div class="chartHead"><div><h3>Clientes atendidos por día</h3><p>Volumen que absorbió el bot · Últimos 7 días</p></div><span class="periodBadge" id="activityRange">Sin datos</span></div><div class="areaChart" id="activityChart"></div></section>
          <aside class="sideStack">
            <section class="card satCard"><div class="ring" id="satRing"><div class="ringInner"><strong id="satValue">-</strong><span>de 5</span></div></div><div><h3>Satisfacción</h3><p id="satCopy">Sin calificaciones suficientes</p><span class="positive" id="satPositive">0 % positivas</span></div></section>
            <section class="card darkInsight"><h3>✧ Resumen IA</h3><p id="iaSummary">El bot está listo para mostrar aprendizajes cuando tenga más conversaciones.</p></section>
          </aside>
          <div class="bottomGrid">
            <section class="card listCard"><h3>Lo que te pidieron y no tenías</h3><p>Cada búsqueda es tu próximo pedido.</p><div class="requestList" id="gapList"></div></section>
            <section class="card listCard"><h3>Qué logró el bot</h3><p>Resolvió, vendió y derivó cuando hacía falta.</p><div class="outcomeList" id="outcomeList"></div></section>
            <section class="card nextCard"><h3>Tu próximo paso</h3><p id="nextStep">Cuando haya conversaciones pendientes, aquí verás qué atender primero.</p><button type="button" onclick="showNeedsYou()">Atender ahora</button></section>
          </div>
        </div>
      </section>

      <section class="view" id="panel-inbox">
        <div class="inboxShell">
          <section class="column listColumn">
            <div class="convListControls"><div class="searchBox"><span class="searchIcon" aria-hidden="true">⌕</span><input id="conversationSearch" aria-label="Buscar conversaciones" placeholder="Buscar por nombre, teléfono, correo o mensaje" oninput="renderThreads()"></div><div class="mobileOmnichannelStrip"><span>Todo en una bandeja</span><i></i><span class="channelStripBadges" data-channel-strip></span></div><div class="filters"><button id="filter-all" type="button" onclick="setConversationFilter('all')">Todas <span>0</span></button><button id="filter-you" type="button" onclick="setConversationFilter('you')">Necesitan de ti <span>0</span></button><button id="filter-resolved" type="button" onclick="setConversationFilter('resolved')">Resueltas <span>0</span></button></div></div>
            <div class="threads" id="threadList"><div class="empty">Cargando conversaciones...</div></div>
          </section>
          <section class="column chatColumn">
            <div class="chatHead"><button class="mobileBack" type="button" onclick="closeMobileChat()">← Chats</button><span class="avatarChannelWrap"><span class="contactAvatar" id="chatAvatar">—</span><span class="channelBadge floating" id="chatChannelBadge" hidden></span></span><div class="chatIdentity"><h3 id="chatTitle">Selecciona una conversación</h3><p id="chatSubtitle">Elige un cliente para ver el historial.</p></div><span class="chatStatusPill" id="chatStatusPill">—</span></div>
            <div class="messages" id="messages"><div class="empty">Sin conversación seleccionada.</div></div>
            <div class="conversationAction">
              <section class="guidedAction" id="guidedAction"><div class="guidedTitle"><span>✦</span><strong>La IA ya redactó la respuesta por ti</strong></div><p id="guidedContext">Un mensaje tuyo puede cerrar esta conversación.</p><textarea id="guidedReply" maxlength="1200" placeholder="La respuesta sugerida aparece aquí…" oninput="updateGuidedCount()"></textarea><div class="guidedFooter"><button class="confirmBtn" id="confirmSendBtn" type="button" onclick="confirmAndSend()">Confirmar y enviar →</button><button class="textBtn" id="alreadyResolvedBtn" type="button" onclick="resolveConversation()">Ya está resuelta</button><span>Solo revisas y envías — la IA hizo lo difícil.</span></div></section>
              <div class="stateBand" id="stateBand"></div>
              <div class="composer" id="composer"><div class="composerRow"><input id="replyText" maxlength="1200" placeholder="Escribe para responder tú mismo…" oninput="updateReplyCount()"><button class="sendCircle" type="button" id="sendCircleBtn" onclick="sendReply()" aria-label="Enviar mensaje">➤</button></div><div class="composerActions"><small id="replyCount">0/1200</small><button class="primaryBtn" type="button" id="sendBtn" onclick="sendReply()">Enviar</button></div></div>
              <div class="statusLine" id="chatStatus" aria-live="polite">Listo.</div>
            </div>
          </section>
          <aside class="column profileColumn"><div class="profile"><div class="profileIdentity"><span class="avatarChannelWrap"><span class="contactAvatar big" id="profileAvatar">—</span><span class="channelBadge floating large" id="profileChannelBadge" hidden></span></span><h3 id="profileName">Selecciona un cliente</h3><p id="profileContact">—</p><button class="copyContact" id="copyBtn" type="button" onclick="copyPhone()">Copiar número</button></div><section class="relationshipCard"><span id="relationshipEyebrow">Relación</span><div><strong id="relationshipValue">—</strong><small id="relationshipLabel"></small></div><p id="relationshipCopy">Selecciona una conversación para ver el valor que la IA está ayudando a construir.</p></section><div class="customerFacts" id="customerFacts"></div><section class="aiUnderstood"><span>✦ Lo que la IA entendió</span><strong id="aiIntent">Selecciona una conversación.</strong><div class="aiChips" id="aiChips"></div></section><section class="noteCard"><h4>Nota interna</h4><textarea id="customerNote" placeholder="Agrega contexto útil para tu equipo…" oninput="markMetaDirty()"></textarea><button class="ghostBtn" id="saveMetaBtn" type="button" onclick="saveCustomerMeta()">Guardar nota</button><p id="metaHint">Selecciona una conversación.</p></section></div></aside>
        </div>
      </section>

      <section class="view" id="panel-appointments">
        <div class="planView">
          <section class="moduleHero">
            <div>
              <span class="moduleBadge">Módulo no activo</span>
              <h3>Agendamiento de citas</h3>
              <p>Este módulo tendrá su propio resumen, agenda, recordatorios y métricas cuando el bot de citas esté contratado y funcionando. No mezclamos estas métricas con Atención al cliente.</p>
              <div class="planMeta"><span class="planPill">Servicio independiente</span><span class="planPill">Activación desde Mi plan</span></div>
            </div>
            <aside class="moduleHeroCard">
              <strong>Qué pasará al activarlo</strong>
              <p>El panel mostrará solo datos del bot de citas: solicitudes, citas agendadas, confirmaciones, recordatorios, cancelaciones y no-shows.</p>
              <button class="primaryBtn" type="button" onclick="showTab('plan')" style="margin-top:16px">Ver en Mi plan</button>
            </aside>
          </section>

          <div class="appointmentGrid">
            <article class="card appointmentMetric"><span>Citas solicitadas</span><strong>—</strong><p>Clientes que pidieron reservar una cita.</p></article>
            <article class="card appointmentMetric"><span>Citas agendadas</span><strong>—</strong><p>Reservas confirmadas por el bot.</p></article>
            <article class="card appointmentMetric"><span>Recordatorios enviados</span><strong>—</strong><p>Mensajes automáticos para evitar ausencias.</p></article>
            <article class="card appointmentMetric"><span>No-shows reducidos</span><strong>—</strong><p>Impacto esperado cuando haya historial.</p></article>
          </div>

          <div class="moduleInfoGrid">
            <section class="planBlock">
              <h3>Qué medirá este módulo</h3>
              <p>Métricas pensadas para negocios que dependen de agenda, reservas y asistencia.</p>
              <ul class="moduleList">
                <li><span class="benefitIcon">${PANEL_ICONS.check}</span>Citas solicitadas, agendadas y confirmadas</li>
                <li><span class="benefitIcon">${PANEL_ICONS.check}</span>Reagendamientos y cancelaciones</li>
                <li><span class="benefitIcon">${PANEL_ICONS.check}</span>Recordatorios enviados por WhatsApp</li>
                <li><span class="benefitIcon">${PANEL_ICONS.check}</span>Tasa de asistencia y no-shows</li>
              </ul>
            </section>
            <section class="planBlock recommendation">
              <div class="recommendationText"><div class="recommendationIcon">${PANEL_ICONS.sparkles}</div><div><h3>Te recomiendo mantenerlo separado</h3><p>Atención al cliente prueba cuánto responde y resuelve tu bot. Agendamiento prueba cuántas citas logra llenar y confirmar. Son dos valores distintos.</p></div></div>
            </section>
          </div>
        </div>
      </section>

      <section class="view" id="panel-plan">
        <div class="planView">
          <section class="planHero">
            <div>
              <span class="planPill ok">Activo</span>
              <h3 id="planName">Bot Atención al cliente</h3>
              <p>Tu asistente de Nextfor IA está atendiendo clientes 24/7. Aquí ves tu plan, consumo y caminos para crecer sin sorpresas.</p>
              <div class="planMeta"><span class="planPill" id="planMonthly">$299.900/mes</span><span class="planPill" id="planRenewal">Renueva el 1 de agosto</span><span class="planPill">RAV Toys</span></div>
            </div>
            <article class="usageCard">
              <div class="usageTop"><div><h4>Consumo de chats</h4><span id="usageMessage">Calculando consumo…</span></div><div><strong id="usagePct">0%</strong><span id="usageState">Vas al día</span></div></div>
              <div class="usageBar"><div class="usageFill" id="usageFill"></div></div>
              <p class="usageMsg"><strong id="chatsConsumed">0</strong> consumidos · <strong id="chatsIncluded">0</strong> incluidos · <strong id="chatsAvailable">0</strong> disponibles</p>
            </article>
          </section>

          <section class="planBlock recommendation">
            <div class="recommendationText"><div class="recommendationIcon">${PANEL_ICONS.sparkles}</div><div><h3>Te recomiendo mirar esto</h3><p id="planRecommendation">Tu plan actual sigue siendo el adecuado para este ritmo de consumo.</p></div></div>
            <div class="recommendationActions"><button class="primaryBtn" type="button" onclick="scrollToPlan('duo')">Ver plan recomendado</button><button class="ghostBtn" type="button">Mantener plan actual</button></div>
          </section>

          <section class="planBlock">
            <h3>Módulos del panel</h3>
            <p>Cada bot tiene sus propias métricas y se activa cuando el servicio está funcionando.</p>
            <div class="serviceGrid">
              <article class="serviceCard active"><span class="serviceState">Activo</span><h4>Bot de atención al cliente</h4><p>Un solo módulo con resultados y conversaciones de WhatsApp e Instagram, diferenciadas por canal dentro de la bandeja.</p><button class="ghostBtn" type="button" onclick="showChannel('all')">Ver módulo</button></article>
              <article class="serviceCard"><span class="serviceState off">No activo</span><h4>Agendamiento de citas</h4><p>Se activará como módulo independiente cuando el bot de citas esté contratado y funcionando.</p><button class="ghostBtn" type="button" onclick="showTab('appointments')">Ver estructura</button></article>
            </div>
          </section>

          <section class="planBlock">
            <h3>Planes disponibles</h3>
            <p>Elige el bot que mejor acompaña la operación de tu negocio.</p>
            <div class="planGrid">
              <article class="planOption"><h4>Bot Agendamiento de citas</h4><p>Ideal para negocios que necesitan reservar, confirmar y recordar citas automáticamente.</p><div class="priceLine"><strong>$990.000 setup</strong><span>$299.900/mes · chats incluidos por definir</span></div><ul class="benefits"><li><span class="benefitIcon">${PANEL_ICONS.check}</span>Agenda y confirma citas</li><li><span class="benefitIcon">${PANEL_ICONS.check}</span>Recordatorios automáticos</li><li><span class="benefitIcon">${PANEL_ICONS.check}</span>Derivación a humano cuando haga falta</li></ul><div class="planActions"><button class="primaryBtn" type="button">Elegir plan</button><button class="ghostBtn" type="button">Ver detalles</button></div></article>
              <article class="planOption"><span class="planBadge">Tu plan actual</span><h4>Bot Atención al cliente</h4><p>Responde preguntas frecuentes, guía compras y escala casos importantes a tu equipo.</p><div class="priceLine"><strong>$990.000 setup</strong><span>$299.900/mes · chats incluidos por definir</span></div><ul class="benefits"><li><span class="benefitIcon">${PANEL_ICONS.check}</span>Atención 24/7 en WhatsApp e Instagram</li><li><span class="benefitIcon">${PANEL_ICONS.check}</span>Resumen unificado de resultados</li><li><span class="benefitIcon">${PANEL_ICONS.check}</span>Respuestas humanas asistidas</li></ul><div class="planActions"><button class="primaryBtn" type="button" disabled>Plan activo</button><button class="ghostBtn" type="button">Ver detalles</button></div></article>
              <article class="planOption dark" id="plan-duo"><span class="planBadge">Mejor valor</span><h4>Nextfor Dúo</h4><p>Combina atención al cliente y agendamiento para crecer con menos trabajo operativo.</p><div class="priceLine"><strong>$1.690.000 setup</strong><span>$499.900/mes · chats incluidos por definir</span></div><ul class="benefits"><li><span class="benefitIcon">${PANEL_ICONS.check}</span>Atención + agendamiento</li><li><span class="benefitIcon">${PANEL_ICONS.check}</span>Mejor cobertura operativa</li><li><span class="benefitIcon">${PANEL_ICONS.check}</span>Más automatización por el mismo canal</li></ul><div class="planActions"><button class="primaryBtn" type="button">Elegir plan</button><button class="ghostBtn" type="button">Ver detalles</button></div></article>
            </div>
          </section>

          <section class="planBlock">
            <h3>Paquetes de rescate</h3>
            <p>Si te acercas al límite, puedes sumar chats extra sin cambiar de plan.</p>
            <div class="rescueGrid"><article class="rescueCard"><strong><span class="sectionIcon">${PANEL_ICONS.package}</span>20 chats</strong><span>Precio disponible próximamente</span><button class="primaryBtn" type="button" style="margin-top:14px">Comprar chats adicionales</button></article><article class="rescueCard"><strong><span class="sectionIcon">${PANEL_ICONS.package}</span>50 chats</strong><span>Precio disponible próximamente</span><button class="primaryBtn" type="button" style="margin-top:14px">Comprar chats adicionales</button></article></div>
          </section>

          <div class="refPromoGrid">
            <section class="planBlock"><h3><span class="sectionIcon">${PANEL_ICONS.gift}</span>Programa de referidos</h3><p>Refiere un nuevo cliente y recibe un mes gratis de tu plan actual.</p><div class="refCode"><code id="refCode">RAVTOYS</code><button class="ghostBtn" type="button" onclick="copyReferral()">Copiar</button></div><p id="refHint" style="margin-top:12px">0 referidos activos · Se activa cuando tu referido esté activo y realice su primer pago a Nextfor IA.</p><button class="primaryBtn" type="button" onclick="shareReferral()" style="margin-top:14px">Compartir</button></section>
            <section class="planBlock promoCard"><h3><span class="sectionIcon">${PANEL_ICONS.sparkles}</span>Promoción activa</h3><p><strong>50% off en el setup de Nextfor Dúo</strong></p><p>Si decides subir de plan este mes, puedes ahorrar en la implementación inicial.</p><button class="primaryBtn" type="button" style="margin-top:16px">Ver promoción</button></section>
          </div>

          <section class="planBlock">
            <h3>Transparencia del plan</h3>
            <p>Claro desde el principio: qué incluye, qué no incluye y cuándo habría costos adicionales.</p>
            <div class="transparencyGrid">
              <div class="transparencyBox"><h4>Qué incluye</h4><ul><li>WhatsApp e Instagram</li><li>Panel de control unificado</li><li>Respuestas humanas asistidas</li><li>Soporte base</li></ul></div>
              <div class="transparencyBox"><h4>Qué no incluye</h4><ul><li>Campañas pagas</li><li>Diseño de piezas externas</li><li>Integraciones nuevas no pactadas</li></ul></div>
              <div class="transparencyBox"><h4>Límites</h4><ul><li>Chats incluidos por definir</li><li>Uso justo del servicio</li><li>Una marca por panel</li></ul></div>
              <div class="transparencyBox"><h4>Condiciones</h4><ul><li>Facturación mensual</li><li>Cancela cuando quieras</li><li>Sin permanencia</li><li>Costos extra se aprueban antes</li></ul></div>
            </div>
          </section>
        </div>
      </section>

      <section class="view" id="panel-tests">
        <div class="testGrid">
          <article class="card testCard"><h3 class="sectionTitle">Buscar producto</h3><p class="muted">Consulta el catálogo visible para clientes.</p><form id="searchTestForm" class="formStack"><input id="testQuery" name="q" maxlength="80" placeholder="Ej. carro control remoto" required><button class="primaryBtn" id="searchTestBtn" type="submit">Probar búsqueda</button></form><div class="resultBox" id="searchTestResult">Aún no se ha ejecutado una búsqueda.</div></article>
          <article class="card testCard"><h3 class="sectionTitle">Consultar pedido</h3><p class="muted">Valida número y nombre sin mostrar datos sensibles.</p><form id="orderTestForm" class="formStack"><input id="orderNumber" maxlength="80" placeholder="Número de pedido" required><input id="customerName" maxlength="120" placeholder="Nombre completo" required><input id="phoneOrEmail" maxlength="160" placeholder="Teléfono o correo opcional"><button class="primaryBtn" id="orderTestBtn" type="submit">Consultar estado</button></form><div class="resultBox" id="orderTestResult">Aún no se ha consultado un pedido.</div></article>
        </div>
      </section>
    </div>
  </main>
  <nav class="mobileTabbar" aria-label="Navegación móvil" style="--mobile-tabs:3">
    <button id="mnav-summary" type="button" onclick="showTab('summary')"><span class="mobileNavIcon">${PANEL_ICONS.resumen}</span><span>Resumen</span></button>
    <button id="mnav-conversations" type="button" onclick="showTab('conversations')"><span class="mobileNavIcon">${PANEL_ICONS.conversaciones}</span><span>Chats</span></button>
    ${planMobileNav}
  </nav>
</div>
<script>
var INITIAL_TAB=${safeJson(initialTab)},INITIAL_CHANNEL=${safeJson(initialChannel)},SERVER_ROLE=${safeJson(auth.role)},SERVER_CAPABILITIES=${safeJson(capabilities)},PANEL_DATA_PATH=${safeJson(dataPath)},PANEL_HEALTH_PATH=${safeJson(healthPath)},PANEL_LOGIN_PATH=${safeJson(loginPath)};
var PLAN_DATA={nombre:"Bot Atención al cliente",estado:"Activo",mensualidad:"$299.900/mes",renovacion:"Renueva el 1 de agosto",chatsIncluidos:500,chatsConsumidos:410,rescatesFrecuentes:true,referidos:{codigo:"RAVTOYS",count:0,mesesGanados:0}};
var state={tab:INITIAL_TAB,channel:INITIAL_CHANNEL,filter:"all",data:null,health:null,allConversations:[],conversations:[],selected:null,metaDirty:false,draftTags:[],loading:false,guidedDraft:"",guidedFor:null};
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function attr(v){return esc(v).replace(/"/g,"&quot;");}
function text(id,value){var el=document.getElementById(id);if(el)el.textContent=value;}
function api(url,opts){opts=opts||{};opts.headers=Object.assign({accept:"application/json"},opts.headers||{});if(opts.body&&!opts.headers["content-type"])opts.headers["content-type"]="application/json";return fetch(url,opts).then(function(response){return response.json().catch(function(){return {};}).then(function(body){if(response.status===401){if(PANEL_LOGIN_PATH)location.href=PANEL_LOGIN_PATH;throw new Error("Sesión vencida");}if(!response.ok){var error=new Error(body.message||body.error||("HTTP "+response.status));error.body=body;throw error;}return body;});});}
function when(ts){if(!ts)return "";var d=new Date(ts);if(isNaN(d.getTime()))return "";return d.toLocaleString("es-CO",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});}
function setBusy(id,busy,busyText,normalText){var b=document.getElementById(id);if(!b)return;b.disabled=!!busy;b.textContent=busy?busyText:normalText;}
function channelLabel(){return "WhatsApp e Instagram";}
function conversationKey(item){return item&&(item.id||item.phone)||"";}
function customerDisplay(item){if(!item)return "—";var channel=channelType(item);if(item.display_name)return item.display_name;if(channel==="instagram")return "Instagram · …"+String(item.phone||"").slice(-6);if(channel==="email")return item.email||item.copy_value||item.phone||"Cliente por correo";return item.phone?("+"+String(item.phone).replace(/^\\+/,"")):"Cliente";}
function combineSummaries(first,second){first=first||{};second=second||{};var salesA=first.sales_assisted||{},salesB=second.sales_assisted||{},solA=first.solutions_provided||{},solB=second.solutions_provided||{},ratingA=first.rating||{},ratingB=second.rating||{},ratingCount=(ratingA.count||0)+(ratingB.count||0),resolved=(solA.count||0)+(solB.count||0),resolvedTotal=(solA.total||0)+(solB.total||0);var dayRows={};[first.messages_by_day||[],second.messages_by_day||[]].forEach(function(list){list.forEach(function(item){var day=item.day||"";if(day)dayRows[day]=(dayRows[day]||0)+(item.messages||0);});});var gapRows={};[first.search_gaps||[],second.search_gaps||[]].forEach(function(list){list.forEach(function(item){var query=item.query||"";if(query)gapRows[query]=(gapRows[query]||0)+(item.count||0);});});return {clients_attended:(first.clients_attended||0)+(second.clients_attended||0),messages:(first.messages||0)+(second.messages||0),active_handoffs:(first.active_handoffs||0)+(second.active_handoffs||0),handoffs_to_human:(first.handoffs_to_human||0)+(second.handoffs_to_human||0),pending_human_replies:(first.pending_human_replies||0)+(second.pending_human_replies||0),zero_result_searches:(first.zero_result_searches||0)+(second.zero_result_searches||0),opportunities_detected:(first.opportunities_detected||0)+(second.opportunities_detected||0),sales_assisted:{count:(salesA.count||0)+(salesB.count||0),label:"ventas o intentos de compra",confidence:"combined"},solutions_provided:{count:resolved,by_human:(solA.by_human||0)+(solB.by_human||0),total:resolvedTotal,partial:(solA.partial||0)+(solB.partial||0),evaluated:(solA.evaluated||0)+(solB.evaluated||0),rate:resolvedTotal?Math.round(resolved/resolvedTotal*100):null},rating:{average:ratingCount?Math.round((((ratingA.average||0)*(ratingA.count||0))+((ratingB.average||0)*(ratingB.count||0)))/ratingCount*10)/10:null,count:ratingCount},messages_by_day:Object.keys(dayRows).sort().map(function(day){return {day:day,messages:dayRows[day]};}),search_gaps:Object.keys(gapRows).map(function(query){return {query:query,count:gapRows[query]};}).sort(function(a,b){return b.count-a.count;})};}
function activeSummary(){var summaries=state.data&&state.data.summaries||{};return combineSummaries(summaries.whatsapp,summaries.instagram);}
function applyChannelData(){state.channel="all";state.conversations=state.allConversations.slice();if(state.selected&&!findConversation(state.selected))state.selected=null;if(!state.selected&&state.conversations.length)state.selected=conversationKey(state.conversations[0]);}
function showChannel(){state.channel="all";state.selected=null;state.metaDirty=false;applyChannelData();showTab("summary");renderChannelState();renderHeader();renderSummary();renderInbox();}
function showTab(name){
  if(name==="human")name="conversations";
  if(name==="tests"&&!SERVER_CAPABILITIES.run_tests)name="plan";
  state.tab=name;
  document.body.classList.remove("chat-open");
  document.body.classList.toggle("conversations-view",name==="conversations");
  var supportModule=name==="summary"||name==="conversations",appointmentsModule=name==="appointments";
  ["summary","conversations","appointments","plan","tests"].forEach(function(tab){var nav=document.getElementById("nav-"+tab),mnav=document.getElementById("mnav-"+tab);if(nav)nav.classList.toggle("active",tab===name);if(mnav)mnav.classList.toggle("active",tab===name);});
  ["module-support","mobileModule-support"].forEach(function(id){var el=document.getElementById(id);if(el)el.classList.toggle("active",supportModule);});
  ["module-appointments","mobileModule-appointments"].forEach(function(id){var el=document.getElementById(id);if(el)el.classList.toggle("active",appointmentsModule);});
  var summary=document.getElementById("panel-summary"),inbox=document.getElementById("panel-inbox"),appointments=document.getElementById("panel-appointments"),plan=document.getElementById("panel-plan"),tests=document.getElementById("panel-tests"),toolbar=document.querySelector(".toolbar");
  if(summary)summary.classList.toggle("active",name==="summary");
  if(inbox)inbox.classList.toggle("active",name==="conversations");
  if(appointments)appointments.classList.toggle("active",name==="appointments");
  if(plan)plan.classList.toggle("active",name==="plan");
  if(tests)tests.classList.toggle("active",name==="tests");
  if(toolbar)toolbar.style.display=(name==="plan"||name==="appointments")?"none":"flex";
  var pageTitle=name==="summary"?"Resumen":name==="tests"?"Pruebas":name==="plan"?"Mi plan":name==="appointments"?"Agendamiento de citas":"Conversaciones";
  var pageSubtitle=name==="summary"?"Resultados del bot de atención · Últimos 7 días":name==="tests"?"Herramientas seguras para validar el bot.":name==="plan"?"Plan, módulos y consumo":name==="appointments"?"Módulo independiente · Se activa cuando esté funcionando":"La IA atiende y te deja solo lo que necesita de ti.";
  text("pageTitle",pageTitle);
  text("pageSubtitle",pageSubtitle);
  try{var url=new URL(location.href);url.searchParams.set("tab",name);url.searchParams.delete("channel");url.searchParams.delete("key");history.replaceState(null,"",url.pathname+url.search+url.hash);}catch(e){}
  renderInbox();renderPlan();window.scrollTo(0,0);
}
function loadPanelData(manual){if(state.loading)return;state.loading=true;if(manual)text("chatStatus","Actualizando datos...");api(PANEL_DATA_PATH).then(function(data){state.data=data;state.allConversations=data.conversations||[];applyChannelData();SERVER_CAPABILITIES=data.user&&data.user.capabilities||SERVER_CAPABILITIES;renderChannelState();renderHeader();renderSummary();renderInbox();if(manual)text("chatStatus","Datos actualizados.");}).catch(function(error){text("chatStatus","No se pudieron actualizar los datos: "+error.message);}).finally(function(){state.loading=false;});}
function loadPanelHealth(){if(!PANEL_HEALTH_PATH)return;api(PANEL_HEALTH_PATH).then(function(health){state.health=health;}).catch(function(){});}
function renderChannelState(){if(!state.data)return;var channels=state.data.business&&state.data.business.channels||{},rows=Object.keys(channels).map(function(key){return channels[key]||{};}),readyCount=rows.filter(function(row){return row.status==="ready";}).length,ready=readyCount>0,total=rows.reduce(function(sum,row){return sum+(row.conversations_count||0);},0),status=document.getElementById("moduleStatus-support");text("moduleStatus-support",readyCount+" canales activos");if(status)status.classList.toggle("off",!ready);text("mobileModule-support","Atención al cliente · "+(ready?"Activo":"Pendiente"));text("channelStatusTitle",ready?"Bot de atención conectado":"Configuración pendiente");text("channelStatusDetail",readyCount+" canales · "+total+" conversaciones visibles");var search=document.getElementById("conversationSearch");if(search)search.placeholder="Buscar por nombre, @usuario, teléfono, correo o mensaje";var dot=document.getElementById("channelStatusDot");if(dot)dot.style.background=ready?"#22C778":"#F5A524";}
function renderPlan(){var p=PLAN_DATA,included=Math.max(1,Number(p.chatsIncluidos)||1),used=Math.max(0,Number(p.chatsConsumidos)||0),available=Math.max(0,included-used),pct=Math.min(100,Math.round(used/included*100)),status=pct>=100?"limit":(pct>=80?"warn":"normal"),fill=document.getElementById("usageFill");text("planName",p.nombre);text("planMonthly",p.mensualidad);text("planRenewal",p.renovacion);text("usagePct",pct+"%");text("chatsConsumed",used);text("chatsIncluded",included);text("chatsAvailable",available);text("usageState",status==="limit"?"Límite alcanzado":(status==="warn"?"Atención":"Vas al día"));text("usageMessage",status==="limit"?"Alcanzaste el 100% de tus chats. Suma un paquete de rescate para seguir atendiendo.":(status==="warn"?"Has utilizado el "+pct+"% de tus chats disponibles.":"Vas al día con tu consumo de chats."));if(fill){fill.className="usageFill"+(status==="warn"?" warn":(status==="limit"?" limit":""));fill.style.width=pct+"%";}text("planRecommendation",p.rescatesFrecuentes?"Estás cerca del límite. Si compras rescates seguido, cambiar a Nextfor Dúo podría salirte más económico y darte más margen para crecer.":"Tu consumo adicional es ocasional. Tu plan actual sigue siendo el adecuado.");text("refCode",p.referidos.codigo);text("refHint",(p.referidos.count||0)+" referidos activos · Se activa cuando tu referido esté activo y realice su primer pago a Nextfor IA.");}
function scrollToPlan(id){var el=document.getElementById("plan-"+id);if(el)el.scrollIntoView({behavior:"smooth",block:"center"});}
function copyReferral(){var code=(PLAN_DATA.referidos&&PLAN_DATA.referidos.codigo)||"RAVTOYS",msg="Código copiado: "+code;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(code).then(function(){text("refHint","¡Copiado! Comparte "+code+" con tu referido.");}).catch(function(){text("refHint",msg);});}else{text("refHint",msg);}}
function shareReferral(){var code=(PLAN_DATA.referidos&&PLAN_DATA.referidos.codigo)||"RAVTOYS",message="Te comparto Nextfor IA. Usa mi código "+code+" y cuéntales que vienes referido por RAV Toys.";if(navigator.share){navigator.share({title:"Nextfor IA",text:message}).catch(function(){copyReferral();});}else if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(message).then(function(){text("refHint","Mensaje de referido copiado. Pégalo en WhatsApp.");});}else{text("refHint",message);}}
function renderHeader(){if(!state.data)return;var pending=state.conversations.filter(function(item){return uiStatus(item)==="you";}).length;text("navConvCount",pending||"");}
function renderSummary(){if(!state.data)return;var s=activeSummary(),sales=s.sales_assisted||{},sol=s.solutions_provided||{},rating=s.rating||{};var clients=s.clients_attended||0,saved=estimateHours(clients),rate=sol.rate==null?null:sol.rate,solvedValue=rate==null?(sol.count||0):(rate+"%");text("heroLine","Esta semana atendiste a "+clients+" clientes entre WhatsApp e Instagram — tu equipo se ahorró ≈ "+saved+" de trabajo repetitivo, sin dejar un solo mensaje sin responder.");text("kSales",sales.count||0);text("kSalesSub",(sales.count||0)+" ventas o intentos");text("kSalesDelta","↗ +"+(sales.count||0));text("kClients",clients);text("kResolved",solvedValue);text("kResolvedSub",(sol.count||0)?((sol.count||0)+" soluciones sin ayuda humana"):"Aún no hay conversaciones resueltas");var progress=rate==null?0:Math.max(0,Math.min(100,rate));var bar=document.getElementById("resolvedProgress");if(bar)bar.style.width=progress+"%";text("kResponse",clients?"4 s":"24/7");text("satValue",rating.average==null?"-":rating.average);text("satCopy",(rating.count||0)+" calificaciones");text("satPositive",rating.count?"94 % positivas":"0 % positivas");var deg=rating.average==null?0:Math.max(0,Math.min(360,Math.round(rating.average/5*360)));var ring=document.getElementById("satRing");if(ring)ring.style.setProperty("--satDeg",deg+"deg");renderActivity(s.messages_by_day||[]);renderGaps(s.search_gaps||[]);renderOutcomes(s);renderNextStep(s);renderInsight(s,solvedValue);}
function estimateHours(clients){if(!clients)return "0 h";var hours=Math.max(1,Math.round(clients*8/60));return hours+" h";}
function renderActivity(items){var box=document.getElementById("activityChart");if(!box)return;if(!items.length){box.innerHTML='<svg viewBox="0 0 700 220" preserveAspectRatio="none"><path d="M0 140 C90 120 150 118 230 80 C310 42 360 160 440 80 C520 0 610 10 700 92" fill="none" stroke="#12A8F4" stroke-width="5"/><path d="M0 220 L0 140 C90 120 150 118 230 80 C310 42 360 160 440 80 C520 0 610 10 700 92 L700 220 Z" fill="rgba(18,168,244,.14)"/></svg>';text("activityRange","vs. período anterior");return;}var max=Math.max.apply(null,items.map(function(i){return i.messages||0;}))||1;var pts=items.map(function(i,idx){var x=items.length===1?350:idx*(700/(items.length-1));var y=190-((i.messages||0)/max*150);return [x,y];});var d=pts.map(function(p,i){return (i?"L":"M")+p[0]+" "+p[1];}).join(" ");box.innerHTML='<svg viewBox="0 0 700 220" preserveAspectRatio="none"><path d="'+d+'" fill="none" stroke="#12A8F4" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="'+d+' L700 220 L0 220 Z" fill="rgba(18,168,244,.14)"/></svg>';text("activityRange","+18% vs. período anterior");}
function renderGaps(gaps){var box=document.getElementById("gapList");if(!box)return;box.innerHTML=gaps.length?gaps.slice(0,4).map(function(item){return '<div class="requestRow"><span class="zap">⚡</span><strong>'+esc(item.query)+'</strong><span class="countPill">'+esc(item.count)+'×</span></div>';}).join(""):'<div class="empty">No hay búsquedas sin resultado en este período.</div>';}
function renderOutcomes(s){var sol=s.solutions_provided||{},sales=s.sales_assisted||{};var max=Math.max(sol.count||0,sales.count||0,s.pending_human_replies||0,1);var rows=[["Soluciones del bot",sol.count||0,""],["Ventas asistidas",sales.count||0,"green"],["Pendientes del equipo",s.pending_human_replies||0,"amber"]];var box=document.getElementById("outcomeList");if(box)box.innerHTML=rows.map(function(row){var pct=Math.round(row[1]/max*100);return '<div class="outcomeRow"><label>'+esc(row[0])+'</label><strong>'+esc(row[1])+'</strong><div class="track '+row[2]+'"><span style="width:'+pct+'%"></span></div></div>';}).join("");}
function renderNextStep(s){var msg="Cuando aparezcan conversaciones pendientes, retómalas antes de que se enfríen.";if((s.pending_human_replies||0)>0)msg="<strong>"+s.pending_human_replies+" conversaciones</strong> esperan tu toque humano. Retómalas antes de que se enfríen.";else if((s.opportunities_detected||0)>0)msg="<strong>"+s.opportunities_detected+" oportunidades</strong> muestran productos que tus clientes están pidiendo.";document.getElementById("nextStep").innerHTML=msg;}
function renderInsight(s,solvedValue){var opportunities=s.opportunities_detected||0,pending=s.handoffs_to_human||0;document.getElementById("iaSummary").innerHTML="El bot resolvió <strong>"+esc(solvedValue)+"</strong> solo. Detectó <em>"+opportunities+" oportunidades</em> de venta y derivó "+pending+" casos a tu equipo cuando hacía falta. Vas por buen camino.";}
function findConversation(key){return state.conversations.find(function(item){return conversationKey(item)===key;})||null;}
function tagLabel(id){var tags=state.data&&state.data.tags||[],tag=tags.find(function(item){return item.id===id;});return tag?tag.label:id;}
function matchesConversation(item,query){if(!query)return true;var messages=(item.messages||[]).map(function(m){return m.text||"";}).join(" "),tags=(item.tags||[]).map(tagLabel).join(" "),haystack=[item.phone,item.email,item.id,item.instagram_username,item.messenger_username,item.channel,item.channel_label,item.display_name,item.note,item.last_text,messages,tags].join(" ").toLowerCase();return haystack.indexOf(query)>=0;}
function setConversationFilter(filter){state.filter=filter;renderInbox();}
function filteredConversations(){var input=document.getElementById("conversationSearch"),query=input?input.value.trim().toLowerCase():"";return state.conversations.filter(function(item){var status=item.conversation_status||(item.mode==="human"?(item.needs_reply?"needs_attention":"team_active"):"ai_active");if(state.tab==="human"&&status!=="needs_attention"&&status!=="team_active")return false;if(state.filter!=="all"&&status!==state.filter)return false;return matchesConversation(item,query);});}
function isHumanTab(){return state.tab==="human";}
function waitMinutes(item){var ts=Date.parse(item&&item.last_ts||"");if(!ts)return 0;return Math.max(1,Math.round((Date.now()-ts)/60000));}
function handoffReason(item){var tags=item&&item.tags||[],text=((item&&item.last_text)||"").toLowerCase();if(tags.indexOf("garantia")>=0||/garant|reclamo|dañado|malo/.test(text))return "😟 Reclamo o garantía";if(tags.indexOf("pendiente_pago")>=0||/precio|descuento|pago|negoci/.test(text))return "💸 Negociación o pago";if(tags.indexOf("envio")>=0||/env[ií]o|domicilio|pedido|gu[ií]a/.test(text))return "📦 Pedido o envío";if(tags.indexOf("venta")>=0||/compr|quiero|disponible|stock/.test(text))return "🧸 Oportunidad de venta";if(item&&item.needs_reply)return "🙋 Pidió hablar con alguien";return "✅ En seguimiento";}
function handoffStatus(item){if(!item)return "Sin caso seleccionado";if(item.conversation_status==="resolved")return item.resolution_label||"✓ Resuelta";if(item.conversation_status==="needs_attention")return "🙋 Necesita tu atención · "+waitMinutes(item)+" min";if(item.conversation_status==="team_active")return "👤 Tu equipo está atendiendo";return "✦ La IA está atendiendo";}
function setFilterLabels(human){var visible=human?state.conversations.filter(function(item){return item.conversation_status==="needs_attention"||item.conversation_status==="team_active";}):state.conversations,counts={ai_active:0,needs_attention:0,team_active:0,resolved:0};visible.forEach(function(item){if(counts[item.conversation_status]!=null)counts[item.conversation_status]++;});var labels={all:"Todas "+visible.length,ai:"IA atendiendo "+counts.ai_active,attention:"Te necesitan "+counts.needs_attention,team:"Con tu equipo "+counts.team_active,resolved:"Resueltas "+counts.resolved};Object.keys(labels).forEach(function(key){var b=document.getElementById("filter-"+key);if(b){b.textContent=labels[key];b.style.display=human&&(key==="ai"||key==="resolved")?"none":"";}});}
function renderInbox(){var panel=document.getElementById("panel-inbox"),human=isHumanTab();if(panel)panel.classList.toggle("humanMode",human);setFilterLabels(human);text("inboxTitle",human?"Intervención humana":"Conversaciones");text("inboxSubtitle",human?"Solo los casos donde tu equipo puede aportar valor.":"Ve qué está haciendo la IA y qué ya quedó resuelto.");[{id:"all",value:"all"},{id:"ai",value:"ai_active"},{id:"attention",value:"needs_attention"},{id:"team",value:"team_active"},{id:"resolved",value:"resolved"}].forEach(function(filter){var b=document.getElementById("filter-"+filter.id);if(b)b.classList.toggle("active",state.filter===filter.value);});renderThreads();renderChat();}
function renderThreads(){var box=document.getElementById("threadList");if(!box)return;var human=isHumanTab(),items=filteredConversations();box.innerHTML=items.length?items.map(function(item){var key=conversationKey(item),status=item.conversation_status||"ai_active",classes="thread"+(key===state.selected?" active":"")+(status==="needs_attention"?" pending":"");var tags=(item.tags||[]).slice(0,2).map(function(tag){return '<span class="tag">'+esc(tagLabel(tag))+'</span>';}).join("");var wait=waitMinutes(item),hot=wait>=6,reason=human?'<div class="threadReason"><span>'+esc(handoffReason(item))+'</span>'+(status==="needs_attention"?'<span class="waitPill'+(hot?' hot':'')+'">⏱️ '+wait+' min</span>':'')+'</div>':"",resolution=item.resolution_label?'<span class="tag statusTag status-resolved">'+esc(item.resolution_label)+'</span>':'<span class="tag statusTag status-'+attr(status)+'">'+esc(item.status_label||handoffStatus(item))+'</span>';return '<button type="button" class="'+classes+'" data-key="'+attr(key)+'" onclick="selectConversation(this.dataset.key)"><div class="threadTop"><strong>'+esc(customerDisplay(item))+'</strong><time>'+esc(when(item.last_ts))+'</time></div><p>'+esc(item.last_text||"Sin mensajes")+'</p>'+reason+'<div class="tags">'+resolution+'<span class="tag">'+esc(item.channel_label||channelLabel())+'</span>'+tags+'</div></button>';}).join(""):'<div class="empty">'+(human?"No hay casos esperando intervención. La IA lo tiene bajo control 👌":"No hay conversaciones en este estado.")+'</div>';}
function selectConversation(key){state.selected=key;state.metaDirty=false;var item=findConversation(key);state.draftTags=item?(item.tags||[]).slice():[];renderThreads();renderChat();document.body.classList.add("chat-open");window.scrollTo(0,0);}
function closeMobileChat(){document.body.classList.remove("chat-open");}
function renderQuickReplies(item){var box=document.getElementById("quickReplies");if(!box)return;if(!isHumanTab()||!item){box.innerHTML="";return;}var replies=["🙌 ¡Hola! Ya te ayudo","🙏 Lamento mucho eso","📦 Reviso tu pedido","✅ Te confirmo disponibilidad"];box.innerHTML=replies.map(function(reply){return '<button type="button" data-reply="'+attr(reply)+'" onclick="applyQuickReply(this.dataset.reply)">'+esc(reply)+'</button>';}).join("");}
function applyQuickReply(reply){var input=document.getElementById("replyText");if(input){input.value=reply;updateReplyCount();input.focus();}}
function renderHandoffContext(item){text("handoffReason",item?handoffReason(item):"Selecciona una conversación.");text("contextCustomer",item?customerDisplay(item):"—");text("contextStatus",item?handoffStatus(item):"—");}
function renderChat(){var item=findConversation(state.selected),canWrite=!!SERVER_CAPABILITIES.intervene,canMeta=!!SERVER_CAPABILITIES.manage_notes_tags,human=isHumanTab();["copyBtn","takeBtn","resolveTopBtn","resolveBtn","releaseBtn","sendBtn","sendCircleBtn"].forEach(function(id){var el=document.getElementById(id);if(el)el.disabled=!item;});var send=document.getElementById("sendBtn"),sendCircle=document.getElementById("sendCircleBtn");if(send)send.disabled=!item||!canWrite;if(sendCircle)sendCircle.disabled=!item||!canWrite;var take=document.getElementById("takeBtn"),release=document.getElementById("releaseBtn"),resolveTop=document.getElementById("resolveTopBtn"),resolveSide=document.getElementById("resolveBtn"),composer=document.getElementById("composer"),note=document.getElementById("customerNote"),copy=document.getElementById("copyBtn");if(copy)copy.textContent=item&&item.channel==="instagram"?(item.instagram_username?"Copiar @usuario":"Copiar ID de Instagram"):"Copiar teléfono";if(take){take.textContent=human?"Atender ahora 🙌":"Tomar control";take.disabled=!item||!canWrite||item.conversation_status==="team_active"||item.conversation_status==="resolved";}if(release){release.textContent="Devolver a la IA";release.disabled=!item||!canWrite||!["needs_attention","team_active"].includes(item.conversation_status);}var canResolve=!!item&&canWrite&&["needs_attention","team_active"].includes(item.conversation_status);if(resolveTop)resolveTop.disabled=!canResolve;if(resolveSide)resolveSide.disabled=!canResolve;if(composer)composer.style.display=(!item||!canWrite||item.conversation_status==="resolved")?"none":"grid";text("hintTitle",human?"✧ Te recomiendo mirar":"✧ Sugerencia IA");if(!item){text("chatTitle",human?"Selecciona un caso":"Selecciona una conversación");text("chatSubtitle",human?("Elige una alerta para responder en "+channelLabel()+"."):"Elige un cliente para ver su historial.");document.getElementById("messages").innerHTML='<div class="empty">'+(human?"No hay caso seleccionado.":"Sin conversación seleccionada.")+'</div>';renderTags(null,canMeta);renderQuickReplies(null);renderHandoffContext(null);if(note){note.value="";note.disabled=true;}text("aiHint",human?"Cuando elijas un caso, te dejo una respuesta lista para usar.":"El bot lo tiene bajo control.");text("autopilotCopy","El bot responde mientras no tomes control.");text("metaHint","Selecciona una conversación.");return;}text("chatTitle",customerDisplay(item));text("chatSubtitle",handoffStatus(item));if(!state.metaDirty)state.draftTags=(item.tags||[]).slice();renderTags(item,canMeta);renderQuickReplies(item);renderHandoffContext(item);if(note&&!state.metaDirty)note.value=item.note||"";if(note)note.disabled=!canMeta;var save=document.getElementById("saveMetaBtn");if(save)save.disabled=!canMeta||!state.metaDirty;text("metaHint",!canMeta?"Tu rol es de solo lectura.":(state.metaDirty?"Cambios sin guardar.":(item.meta_updated_at?"Guardado "+when(item.meta_updated_at):"Sin nota guardada")));text("autopilotCopy",item.conversation_status==="resolved"?"Conversación cerrada.":(["needs_attention","team_active"].includes(item.conversation_status)?"Autopiloto en pausa mientras intervienes.":"La IA responde y mantiene el caso bajo control."));renderSuggestion(item);var messages=document.getElementById("messages");messages.innerHTML=(item.messages||[]).length?item.messages.map(function(m){var author=m.author||"bot",label=author==="customer"?"Cliente":(author==="human"?"Agente":(author==="system"?"Evento":"🤖 Autopiloto IA"));var checks=author==="human"?'<span class="checks read">✓✓</span>':(author==="bot"?'<span class="checks">✓✓</span>':"");return '<div class="bubble '+attr(author)+'">'+esc(m.text)+'<div class="bubbleMeta"><span>'+esc(label)+(m.ts?" · "+esc(when(m.ts)):"")+'</span>'+checks+'</div></div>';}).join(""):'<div class="empty">No hay mensajes para este cliente.</div>';messages.scrollTop=messages.scrollHeight;updateReplyCount();}
function renderSuggestion(item){var textValue="El bot lo tiene bajo control.",reply="";if(item.needs_reply){textValue=isHumanTab()?"🙌 Un mensaje tuyo puede destrabar esta conversación. Te dejo una respuesta lista para usar.":"Te recomiendo responder: este cliente está esperando una acción del equipo.";reply="🙌 ¡Hola! Soy del equipo de RAV Toys. Ya revisé tu caso y te ayudo con mucho gusto.";}else if((item.tags||[]).includes("venta")){textValue="Hay señal de venta. Confirmar disponibilidad o envío puede cerrar esta conversación.";reply="✅ Te confirmo disponibilidad y opciones de envío para que puedas completar tu compra.";}state.suggestion=reply;text("aiHint",textValue);}
function useSuggestion(){var input=document.getElementById("replyText");if(input&&state.suggestion){input.value=state.suggestion;updateReplyCount();input.focus();}}
function toggleAutopilot(){state.autopilot=!state.autopilot;var sw=document.getElementById("autopilotSwitch");if(sw)sw.classList.toggle("on",state.autopilot);text("autopilotCopy",state.autopilot?"El bot responde mientras no tomes control.":"El equipo humano está priorizado.");}
function renderTags(item,canEdit){var box=document.getElementById("tagRow"),tags=state.data&&state.data.tags||[];if(!box)return;box.innerHTML=tags.map(function(tag){var active=state.draftTags.indexOf(tag.id)>=0;return '<button type="button" class="tagBtn'+(active?" active":"")+'" data-tag="'+attr(tag.id)+'" onclick="toggleTag(this.dataset.tag)" '+(!item||!canEdit?"disabled":"")+'>'+esc(tag.label)+'</button>';}).join("");}
function markMetaDirty(){if(!state.selected||!SERVER_CAPABILITIES.manage_notes_tags)return;state.metaDirty=true;var save=document.getElementById("saveMetaBtn");if(save)save.disabled=false;text("metaHint","Cambios sin guardar.");}
function toggleTag(tag){if(!state.selected||!SERVER_CAPABILITIES.manage_notes_tags)return;var index=state.draftTags.indexOf(tag);if(index>=0)state.draftTags.splice(index,1);else state.draftTags.push(tag);markMetaDirty();renderTags(findConversation(state.selected),true);}
function saveCustomerMeta(){var item=findConversation(state.selected),note=document.getElementById("customerNote");if(!item||!SERVER_CAPABILITIES.manage_notes_tags)return;var button=document.getElementById("saveMetaBtn");if(button)button.disabled=true;text("metaHint","Guardando...");api("/admin/customer-meta/"+encodeURIComponent(conversationKey(item)),{method:"POST",body:JSON.stringify({tags:state.draftTags,note:note?note.value.trim():""})}).then(function(response){item.tags=(response.meta&&response.meta.tags)||state.draftTags.slice();item.note=(response.meta&&response.meta.note)||"";item.meta_updated_at=response.meta&&response.meta.updated_at;state.metaDirty=false;renderInbox();text("chatStatus","Nota y tags guardados.");}).catch(function(error){text("metaHint","No se pudo guardar: "+error.message);if(button)button.disabled=false;});}
function copyPhone(){var item=findConversation(state.selected);if(!item)return;var channel=channelType(item),value=contactValue(item),label=channel==="instagram"?(item.instagram_username?"@usuario copiado.":"ID de Instagram copiado."):(channel==="email"?"Correo copiado.":(channel==="messenger"?"Contacto de Messenger copiado.":"Teléfono copiado."));if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(value).then(function(){text("chatStatus",label);}).catch(function(){text("chatStatus",value);});}else{text("chatStatus",value);}}
function takeControl(){var item=findConversation(state.selected);if(!item||!SERVER_CAPABILITIES.intervene)return;text("chatStatus","Tomando control...");api("/admin/takeover/"+encodeURIComponent(conversationKey(item)),{method:"POST",body:"{}"}).then(function(){text("chatStatus","Control humano activo.");loadPanelData(false);}).catch(function(error){text("chatStatus","No se pudo tomar control: "+error.message);});}
function resolveConversation(){var item=findConversation(state.selected);if(!item||!SERVER_CAPABILITIES.intervene||!["needs_attention","team_active"].includes(item.conversation_status))return;text("chatStatus","Marcando como resuelta...");api("/admin/resolve/"+encodeURIComponent(conversationKey(item)),{method:"POST",body:"{}"}).then(function(){text("chatStatus","✓ Conversación resuelta por tu equipo.");loadPanelData(false);}).catch(function(error){text("chatStatus","No se pudo marcar como resuelta: "+error.message);});}
function releaseControl(){var item=findConversation(state.selected);if(!item||!SERVER_CAPABILITIES.intervene)return;text("chatStatus","Devolviendo a la IA...");api("/admin/release/"+encodeURIComponent(conversationKey(item)),{method:"POST",body:"{}"}).then(function(){text("chatStatus","✦ La IA volvió a atender esta conversación.");loadPanelData(false);}).catch(function(error){text("chatStatus","No se pudo devolver a la IA: "+error.message);});}
function updateReplyCount(){var input=document.getElementById("replyText");text("replyCount",((input&&input.value)||"").length+"/1200");}
function setSendBusy(busy){var normal=document.getElementById("sendBtn"),circle=document.getElementById("sendCircleBtn");if(normal){normal.disabled=!!busy;normal.textContent=busy?"Enviando...":"Enviar";}if(circle){circle.disabled=!!busy;circle.textContent=busy?"…":"➤";}}
function sendReply(){var item=findConversation(state.selected),input=document.getElementById("replyText"),message=input?input.value.trim():"";if(!item||!SERVER_CAPABILITIES.respond)return;if(!message){text("chatStatus","Escribe un mensaje antes de enviar.");return;}setSendBusy(true);api("/admin/send-message",{method:"POST",body:JSON.stringify({userId:conversationKey(item),text:message})}).then(function(){if(input)input.value="";updateReplyCount();text("chatStatus","Mensaje enviado por "+channelLabelFor(item)+".");loadPanelData(false);}).catch(function(error){text("chatStatus","No se pudo enviar: "+error.message);}).finally(function(){setSendBusy(false);});}
function uiStatus(item){var status=item&&item.conversation_status||(item&&item.mode==="human"?"needs_attention":"ai_active");if(status==="resolved")return "ok";if(status==="needs_attention"||status==="team_active")return "you";return "ia";}
function statusMeta(status){if(status==="you")return {label:"Necesita de ti",icon:'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 21a6 6 0 0 0-12 0"></path><circle cx="12" cy="8" r="4"></circle></svg>'};if(status==="ok")return {label:"Resuelta por la IA",icon:'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>'};return {label:"La IA está atendiendo",icon:'<span class="liveDot"></span>'};}
function initialsFor(item){var value=customerDisplay(item).replace(/^@/,"").replace(/^\\+?57/,"").trim();if(/^\\d+$/.test(value))return "CL";var parts=value.split(/[\\s._-]+/).filter(Boolean);return ((parts[0]||"C").charAt(0)+(parts[1]||parts[0]||"L").charAt(0)).toUpperCase();}
function conversationNudge(item){var tags=item&&item.tags||[],value=((item&&item.last_text)||"").toLowerCase();if(tags.indexOf("garantia")>=0||/garant|reclamo|dañad|incomplet/.test(value))return "Reclamo en curso";if(tags.indexOf("venta")>=0||/compr|quiero|interesa|disponible/.test(value))return "Lista para comprar";if(tags.indexOf("envio")>=0||/env[ií]o|pedido|entrega/.test(value))return "Confirmar envío";if(tags.indexOf("pendiente_pago")>=0||/pago|precio|descuento/.test(value))return "Confirmar pago";return uiStatus(item)==="you"?"Lista para revisar":"";}
function conversationCounts(){return state.conversations.reduce(function(counts,item){counts[uiStatus(item)]++;return counts;},{you:0,ia:0,ok:0});}
function setConversationFilter(filter){state.filter=["all","you","resolved"].includes(filter)?filter:"all";renderInbox();}
function filteredConversations(){var input=document.getElementById("conversationSearch"),query=input?input.value.trim().toLowerCase():"";return state.conversations.filter(function(item){var status=uiStatus(item);if(state.filter==="you"&&status!=="you")return false;if(state.filter==="resolved"&&status!=="ok")return false;return matchesConversation(item,query);});}
function renderConversationHeader(){var counts=conversationCounts(),total=state.conversations.length,handled=counts.ia+counts.ok,pct=total?Math.round(counts.ok/total*100):0,hero=counts.you===0?"La IA está atendiendo las "+total+" conversaciones. Nada requiere tu atención 👌":"La IA atendió "+handled+" de "+total+" esta semana — solo "+counts.you+(counts.you===1?" necesita":" necesitan")+" de ti.";if(state.tab==="conversations")text("pageSubtitle",hero);text("conversationImpact","✦ "+pct+"% resuelto por la IA");text("navConvCount",counts.you||"");return {counts:counts,total:total,pct:pct};}
function renderFilterIntro(counts,pct){if(state.filter==="you")return counts.you?'<div class="filterIntro you"><span>☝</span><div><strong>'+counts.you+(counts.you===1?' cliente te necesita ahora':' clientes te necesitan ahora')+'</strong><p>Son las únicas que dependen de ti — un mensaje tuyo cierra la venta o resuelve el caso.</p></div></div>':'<div class="filterIntro ok"><span>✓</span><div><strong>Nada pendiente 👌</strong><p>La IA está atendiendo todo. Ningún cliente está esperando por ti.</p></div></div>';if(state.filter==="resolved")return '<div class="filterIntro ok"><span>✓</span><div><strong>'+counts.ok+(counts.ok===1?' conversación resuelta por la IA':' conversaciones resueltas por la IA')+'</strong><p>El '+pct+'% de tu servicio quedó resuelto solo.</p></div></div>';return "";}
function renderInbox(){var info=renderConversationHeader();[{id:"all",filter:"all",count:info.total},{id:"you",filter:"you",count:info.counts.you},{id:"resolved",filter:"resolved",count:info.counts.ok}].forEach(function(row){var button=document.getElementById("filter-"+row.id);if(!button)return;button.classList.toggle("active",state.filter===row.filter);var badge=button.querySelector("span");if(badge)badge.textContent=row.count;});renderThreads(info);renderChat();}
function channelType(item){var value=String(item&&item.channel||"whatsapp").toLowerCase();return ["whatsapp","instagram","messenger","email"].includes(value)?value:"whatsapp";}
function channelLabelFor(item){var channel=channelType(item),labels={whatsapp:"WhatsApp",instagram:"Instagram",messenger:"Messenger",email:"Correo"};return item&&item.channel_label||labels[channel];}
function channelGlyph(channel){if(channel==="instagram")return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>';if(channel==="messenger")return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 3 4 14h6l-1 7 9-11h-6z"></path></svg>';if(channel==="email")return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path></svg>';return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"></path></svg>';}
function channelBadge(item,floating,large){var channel=channelType(item),label=channelLabelFor(item),classes="channelBadge "+channel+(floating?" floating":"")+(large?" large":"");return '<span class="'+classes+'" title="'+attr(label)+'" aria-label="'+attr(label)+'">'+channelGlyph(channel)+'</span>';}
function paintChannelBadge(id,item,large){var badge=document.getElementById(id);if(!badge)return;if(!item){badge.hidden=true;badge.innerHTML="";return;}var channel=channelType(item),label=channelLabelFor(item);badge.hidden=false;badge.className="channelBadge floating "+channel+(large?" large":"");badge.title=label;badge.setAttribute("aria-label",label);badge.innerHTML=channelGlyph(channel);}
function renderChannelStrips(){document.querySelectorAll("[data-channel-strip]").forEach(function(strip){strip.innerHTML=["whatsapp","instagram","messenger","email"].map(function(channel){return channelBadge({channel:channel},false,false);}).join("");});}
function contactValue(item){var channel=channelType(item);if(item&&item.copy_value)return item.copy_value;if(channel==="email")return item&&item.email||item&&item.phone||"";if(channel==="instagram")return item&&item.instagram_username||item&&item.phone||"";if(channel==="messenger")return item&&item.messenger_username||item&&item.phone||"";return item&&item.phone?("+"+String(item.phone).replace(/^\\+/,"")):"";}
function copyActionLabel(item){var channel=channelType(item);if(channel==="instagram")return item&&item.instagram_username?"Copiar @usuario":"Copiar ID";if(channel==="email")return "Copiar correo";if(channel==="messenger")return "Copiar contacto";return "Copiar número";}
function renderThreads(info){var box=document.getElementById("threadList");if(!box)return;info=info||renderConversationHeader();var items=filteredConversations(),intro=renderFilterIntro(info.counts,info.pct);var cards=items.map(function(item){var key=conversationKey(item),status=uiStatus(item),meta=statusMeta(status),nudge=conversationNudge(item),icon=meta.icon;return '<button type="button" class="thread status-'+status+(key===state.selected?' active':'')+'" data-key="'+attr(key)+'" onclick="selectConversation(this.dataset.key)"><div class="threadMain"><span class="avatarChannelWrap"><span class="contactAvatar">'+esc(initialsFor(item))+'</span>'+channelBadge(item,true,false)+'</span><div class="threadIdentity"><div class="threadTop"><strong>'+esc(customerDisplay(item))+'</strong><time>'+esc(when(item.last_ts))+'</time></div><p>'+esc(item.last_text||"Sin mensajes")+'</p></div></div><div class="threadStatus"><span class="statusPill '+status+'">'+icon+esc(meta.label)+'</span>'+(nudge?'<small>'+esc(nudge)+'</small>':'')+'</div></button>';}).join("");box.innerHTML=intro+(cards||'<div class="empty">No hay conversaciones en este estado.</div>');}
function suggestedReply(item){var tags=item&&item.tags||[],value=((item&&item.last_text)||"").toLowerCase();if(tags.indexOf("garantia")>=0||/garant|reclamo|dañad|incomplet/.test(value))return "Hola, ya revisé tu caso y voy a ayudarte a resolverlo. ¿Me confirmas por favor el número del pedido y una foto del producto?";if(tags.indexOf("envio")>=0||/env[ií]o|pedido|entrega/.test(value))return "¡Hola! Ya revisé tu solicitud 🙌 Te confirmo la opción de envío para que podamos dejar todo listo hoy.";if(tags.indexOf("venta")>=0||/compr|quiero|interesa|disponible/.test(value))return "¡Hola! Ya revisé lo que buscas 🙌 Te confirmo disponibilidad y te ayudo a dejar la compra lista.";return "¡Hola! Soy del equipo de RAV Toys. Ya revisé tu conversación y te ayudo con mucho gusto.";}
function selectConversation(key){state.selected=key;state.metaDirty=false;var item=findConversation(key);state.draftTags=item?(item.tags||[]).slice():[];state.guidedFor=key;state.guidedDraft=item&&uiStatus(item)==="you"?suggestedReply(item):"";renderThreads();renderChat();document.body.classList.add("chat-open");window.scrollTo(0,0);}
function showNeedsYou(){state.filter="you";showTab("conversations");var item=state.conversations.find(function(row){return uiStatus(row)==="you";});if(item)selectConversation(conversationKey(item));}
function closeMobileChat(){document.body.classList.remove("chat-open");}
function aiUnderstanding(item){var tags=item&&item.tags||[],value=((item&&item.last_text)||"").toLowerCase(),chips=[];if(tags.indexOf("garantia")>=0||/garant|reclamo|dañad|incomplet/.test(value))return {intent:"Reclamo o garantía — necesita seguimiento",chips:["Garantía","Prioridad"]};if(tags.indexOf("pendiente_pago")>=0||/pago|precio|descuento/.test(value))return {intent:"Consulta sobre pago o cierre de compra",chips:["Forma de pago","Seguimiento"]};if(tags.indexOf("envio")>=0||/env[ií]o|pedido|entrega/.test(value))return {intent:"Quiere confirmar envío o estado de pedido",chips:["Envío",channelLabelFor(item)]};if(tags.indexOf("venta")>=0||/compr|quiero|interesa|disponible|regalo/.test(value))return {intent:"Quiere comprar — la IA detectó una oportunidad",chips:["Oportunidad de venta",channelLabelFor(item)]};if(tags.indexOf("revisar")>=0)chips.push("Revisar");chips.push(channelLabelFor(item));return {intent:"Consulta general atendida por la IA",chips:chips};}
function relationshipData(item){var messages=(item.messages||[]).filter(function(message){return message.author!=="system";}).length,hasSale=(item.tags||[]).indexOf("venta")>=0;return hasSale?{eyebrow:"Oportunidad de relación",value:"Venta",label:"asistida por la IA",copy:"La IA entendió lo que busca y dejó el contexto listo para que tú cierres 🙌"}:{eyebrow:"Relación en construcción",value:messages,label:messages===1?"mensaje atendido":"mensajes atendidos",copy:"La IA conserva el contexto para que tu equipo no empiece desde cero."};}
function renderProfile(item,canMeta){var note=document.getElementById("customerNote"),save=document.getElementById("saveMetaBtn"),chips=document.getElementById("aiChips"),facts=document.getElementById("customerFacts"),copy=document.getElementById("copyBtn");paintChannelBadge("profileChannelBadge",item,true);if(!item){text("profileAvatar","—");text("profileName","Selecciona un cliente");text("profileContact","—");text("relationshipEyebrow","Relación");text("relationshipValue","—");text("relationshipLabel","");text("relationshipCopy","Selecciona una conversación para ver el valor que la IA está ayudando a construir.");text("aiIntent","Selecciona una conversación.");if(chips)chips.innerHTML="";if(facts)facts.innerHTML="";if(note){note.value="";note.disabled=true;}if(save)save.disabled=true;if(copy)copy.disabled=true;text("metaHint","Selecciona una conversación.");return;}var relation=relationshipData(item),understanding=aiUnderstanding(item),first=(item.messages||[]).map(function(message){return message.ts;}).filter(Boolean).sort()[0],contact=contactValue(item);text("profileAvatar",initialsFor(item));text("profileName",customerDisplay(item));text("profileContact",contact);text("relationshipEyebrow",relation.eyebrow);text("relationshipValue",relation.value);text("relationshipLabel",relation.label);text("relationshipCopy",relation.copy);text("aiIntent",understanding.intent);if(chips)chips.innerHTML=understanding.chips.map(function(chip){return '<span>'+esc(chip)+'</span>';}).join("");if(facts)facts.innerHTML=[["Canal",channelLabelFor(item)],["Mensajes",(item.messages||[]).filter(function(message){return message.author!=="system";}).length],["Cliente desde",first?new Date(first).toLocaleDateString("es-CO",{day:"numeric",month:"short"}):"—"]].map(function(row){return '<div class="customerFact"><span>'+esc(row[0])+'</span><strong>'+esc(row[1])+'</strong></div>';}).join("");if(note&&!state.metaDirty)note.value=item.note||"";if(note)note.disabled=!canMeta;if(save)save.disabled=!canMeta||!state.metaDirty;text("metaHint",!canMeta?"Tu rol es de solo lectura.":(state.metaDirty?"Cambios sin guardar.":(item.meta_updated_at?"Guardado "+when(item.meta_updated_at):"Sin nota guardada")));if(copy){copy.disabled=false;copy.textContent=copyActionLabel(item);}}
function renderChat(){var item=findConversation(state.selected),canWrite=!!SERVER_CAPABILITIES.respond,canMeta=!!SERVER_CAPABILITIES.manage_notes_tags,guided=document.getElementById("guidedAction"),composer=document.getElementById("composer"),band=document.getElementById("stateBand"),reply=document.getElementById("replyText"),guidedReply=document.getElementById("guidedReply"),confirm=document.getElementById("confirmSendBtn"),already=document.getElementById("alreadyResolvedBtn"),pill=document.getElementById("chatStatusPill");renderProfile(item,canMeta);paintChannelBadge("chatChannelBadge",item,false);if(!item){text("chatAvatar","—");text("chatTitle","Selecciona una conversación");text("chatSubtitle","Elige un cliente para ver el historial.");if(pill){pill.className="chatStatusPill";pill.textContent="—";}document.getElementById("messages").innerHTML='<div class="empty">Sin conversación seleccionada.</div>';if(guided)guided.style.display="none";if(composer)composer.style.display="none";if(band)band.style.display="none";return;}var status=uiStatus(item),meta=statusMeta(status),contact=contactValue(item),presence=channelType(item)==="email"?"por correo":"en línea";text("chatAvatar",initialsFor(item));text("chatTitle",customerDisplay(item));text("chatSubtitle",contact+" · "+channelLabelFor(item)+" · "+presence);if(pill){pill.className="chatStatusPill "+status;pill.innerHTML=meta.icon+esc(meta.label);}var messages=document.getElementById("messages");messages.innerHTML='<div style="text-align:center"><span class="tag">Hoy</span></div>'+((item.messages||[]).length?item.messages.map(function(message){var author=message.author||"bot",label=author==="customer"?"":(author==="human"?"Tú":(author==="system"?"Evento":"IA"));return '<div class="bubble '+attr(author)+'">'+esc(message.text)+'<div class="bubbleMeta">'+esc((label?label+" · ":"")+(message.ts?when(message.ts):""))+'</div></div>';}).join(""):'<div class="empty">No hay mensajes para este cliente.</div>');messages.scrollTop=messages.scrollHeight;if(state.guidedFor!==conversationKey(item)){state.guidedFor=conversationKey(item);state.guidedDraft=status==="you"?suggestedReply(item):"";}if(guided)guided.style.display=status==="you"?"block":"none";if(guidedReply){guidedReply.value=state.guidedDraft;guidedReply.disabled=!canWrite;}if(confirm)confirm.disabled=!canWrite;if(already)already.disabled=!canWrite;text("guidedContext",conversationNudge(item)+". Un mensaje tuyo puede cerrar esta conversación.");if(band){band.className="stateBand "+status;if(status==="ia")band.innerHTML='<span class="liveDot"></span><span>La IA está atendiendo esta conversación por ti. Se pausa sola en cuanto respondas.</span>';else if(status==="ok")band.innerHTML='<span class="bandIcon">✓</span><span>La IA resolvió esta conversación sin ayuda humana. Todo bajo control 👌</span>';else band.innerHTML="";}if(composer)composer.style.display=status==="you"?"none":"grid";if(reply)reply.disabled=!canWrite;var send=document.getElementById("sendCircleBtn");if(send)send.disabled=!canWrite;updateReplyCount();}
function markMetaDirty(){if(!state.selected||!SERVER_CAPABILITIES.manage_notes_tags)return;state.metaDirty=true;var save=document.getElementById("saveMetaBtn");if(save)save.disabled=false;text("metaHint","Cambios sin guardar.");}
function saveCustomerMeta(){var item=findConversation(state.selected),note=document.getElementById("customerNote");if(!item||!SERVER_CAPABILITIES.manage_notes_tags)return;var button=document.getElementById("saveMetaBtn");if(button)button.disabled=true;text("metaHint","Guardando...");api("/admin/customer-meta/"+encodeURIComponent(conversationKey(item)),{method:"POST",body:JSON.stringify({tags:(item.tags||[]),note:note?note.value.trim():""})}).then(function(response){item.tags=(response.meta&&response.meta.tags)||item.tags||[];item.note=(response.meta&&response.meta.note)||"";item.meta_updated_at=response.meta&&response.meta.updated_at;state.metaDirty=false;renderInbox();text("chatStatus","Nota guardada.");}).catch(function(error){text("metaHint","No se pudo guardar: "+error.message);if(button)button.disabled=false;});}
function resolveConversation(){var item=findConversation(state.selected);if(!item||!SERVER_CAPABILITIES.intervene||uiStatus(item)!=="you")return;text("chatStatus","Marcando como resuelta...");api("/admin/resolve/"+encodeURIComponent(conversationKey(item)),{method:"POST",body:"{}"}).then(function(){text("chatStatus","✓ Conversación resuelta.");loadPanelData(false);}).catch(function(error){text("chatStatus","No se pudo marcar como resuelta: "+error.message);});}
function updateGuidedCount(){var input=document.getElementById("guidedReply");state.guidedDraft=input?input.value:"";}
function setConfirmBusy(busy){var button=document.getElementById("confirmSendBtn");if(button){button.disabled=!!busy;button.textContent=busy?"Enviando…":"Confirmar y enviar →";}}
function confirmAndSend(){var item=findConversation(state.selected),input=document.getElementById("guidedReply"),message=input?input.value.trim():"";if(!item||!SERVER_CAPABILITIES.respond||uiStatus(item)!=="you")return;if(!message){text("chatStatus","Revisa la respuesta antes de enviarla.");return;}setConfirmBusy(true);text("chatStatus","Enviando tu confirmación...");api("/admin/send-message",{method:"POST",body:JSON.stringify({userId:conversationKey(item),text:message})}).then(function(){return api("/admin/resolve/"+encodeURIComponent(conversationKey(item)),{method:"POST",body:"{}"});}).then(function(){state.guidedDraft="";text("chatStatus","✓ Enviada y resuelta. La IA hizo lo difícil.");loadPanelData(false);}).catch(function(error){text("chatStatus","No se pudo completar: "+error.message);}).finally(function(){setConfirmBusy(false);});}
function renderProductResults(result){var box=document.getElementById("searchTestResult");if(!box)return;var products=result.products||[];box.innerHTML=products.length?products.map(function(p){return '<div class="resultItem"><a href="'+attr(p.product_url)+'" target="_blank" rel="noreferrer">'+esc(p.title)+'</a><span>'+esc(p.price||"")+'</span></div>';}).join(""):'La búsqueda no devolvió productos.';}
function runProductTest(event){event.preventDefault();var q=document.getElementById("testQuery").value.trim();if(!q)return;setBusy("searchTestBtn",true,"Buscando...","Probar búsqueda");text("searchTestResult","Consultando catálogo...");api("/admin/panel/test-search?q="+encodeURIComponent(q)).then(renderProductResults).catch(function(error){text("searchTestResult","No se pudo completar: "+error.message);}).finally(function(){setBusy("searchTestBtn",false,"Buscando...","Probar búsqueda");});}
function runOrderTest(event){event.preventDefault();var payload={order_number:document.getElementById("orderNumber").value.trim(),customer_name:document.getElementById("customerName").value.trim(),phone_or_email:document.getElementById("phoneOrEmail").value.trim()};setBusy("orderTestBtn",true,"Consultando...","Consultar estado");text("orderTestResult","Validando pedido...");api("/admin/panel/order-status-test",{method:"POST",body:JSON.stringify(payload)}).then(function(result){text("orderTestResult",result.message||"Consulta completada.");}).catch(function(error){text("orderTestResult",(error.body&&error.body.message)||("No se pudo completar: "+error.message));}).finally(function(){setBusy("orderTestBtn",false,"Consultando...","Consultar estado");});}
var reply=document.getElementById("replyText");if(reply)reply.addEventListener("keydown",function(event){if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();sendReply();}});var searchForm=document.getElementById("searchTestForm");if(searchForm)searchForm.addEventListener("submit",runProductTest);var orderForm=document.getElementById("orderTestForm");if(orderForm)orderForm.addEventListener("submit",runOrderTest);
renderChannelStrips();showTab(INITIAL_TAB);loadPanelData(false);loadPanelHealth();setInterval(function(){if(!state.metaDirty)loadPanelData(false);},30000);setInterval(loadPanelHealth,120000);
</script>
</body>
</html>`);
};
