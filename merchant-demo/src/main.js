import "./style.css";
import { animate, inView } from "motion";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";
const KEY = import.meta.env.VITE_RAZORPAY_KEY_ID || "rzp_test_TSWZCi3dGR5e2Y";
const app = document.getElementById("app");
const state = {
  token: localStorage.getItem("recoverai_token"),
  user:null, workspace:null, summary:null, insights:null,
  incidents:[], payments:[], orders:[], logs:[], connection:null,
  automation:null, proof:null, policy:null, paymentLinks:[], detail:null, route:location.hash.slice(1).split("?")[0] || "home",
  loading:false, mobileNav:false
};

const icons = {
  shield:'<path d="M12 3 5 6v5c0 4.5 3 7.3 7 9 4-1.7 7-4.5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  activity:'<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  alert:'<path d="M10.3 3.7 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  credit:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  logout:'<path d="M10 17l5-5-5-5M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/>',
  settings:'<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.6V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.6-1H6v-2.6h.2A1.7 1.7 0 0 0 8 10.4a1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h2.6v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 .3 1.9 1.7 1.7 0 0 0 1.6 1h.2V14h-.2a1.7 1.7 0 0 0-1.6 1Z"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  spark:'<path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"/><path d="m19 17 .7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z"/>',
  bolt:'<path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v2M22 12h-2M12 22v-2M2 12h2"/>'
};
const icon=(name,size=18)=>`<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name]||icons.activity}</svg>`;
const esc=s=>String(s??"").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money=n=>`₹${(Number(n||0)/100).toLocaleString("en-IN",{maximumFractionDigits:0})}`;
const time=d=>d?new Date(d).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"-";
const relative=d=>{if(!d)return"-";const mins=Math.max(0,Math.floor((Date.now()-new Date(d))/60000));if(mins<1)return"just now";if(mins<60)return`${mins}m ago`;const h=Math.floor(mins/60);if(h<24)return`${h}h ago`;return`${Math.floor(h/24)}d ago`};
const status=s=>`<span class="status ${String(s||"").toLowerCase().replaceAll("_","-")}"><i></i>${esc(s||"unknown")}</span>`;
const severity=s=>`<span class="severity ${String(s||"medium").toLowerCase()}">${esc(s||"medium")}</span>`;
const scoreClass=n=>Number(n)>=75?"strong":Number(n)>=50?"possible":"low";
const actionLabel=a=>a==="Retry after failure window"||a==="Customer recovery prompt"?"Reconcile and verify payment state":a||"Manual review";
const timelineEvent=l=>{
  const map={
    INCIDENT_CREATED:{stage:"DETECT",title:"Incident detected",copy:"RecoverAI recorded the provider failure and opened an incident."},
    RECOVERY_DECIDED:{stage:"DECIDE",title:"Recovery decision made",copy:"Policy and recovery intelligence selected a safe reconciliation path."},
    RECOVERY_COMPLETED:{stage:"ACT",title:"Recovery completed",copy:"RecoverAI executed the selected recovery action."},
    RECOVERY_REQUIRES_REVIEW:{stage:"ACT",title:"Recovery requires review",copy:"The selected recovery action completed but needs human review."},
    INCIDENT_RESOLVED:{stage:"VERIFY",title:"Incident resolved",copy:"The final payment and order state was verified."},
    RECOVERY_BLOCKED_BY_POLICY:{stage:"DECIDE",title:"Recovery blocked by policy",copy:"Guardrails prevented the recovery action from running."},
    RECOVERY_FAILED:{stage:"ACT",title:"Recovery failed",copy:"The recovery action could not complete and was recorded for review."}
  };
  return map[l.action]||{stage:"EVENT",title:String(l.action||"Event").replaceAll("_"," "),copy:"Audit event recorded by RecoverAI."};
};

function toast(message,type="info"){const el=document.createElement("div");el.className=`toast ${type}`;el.innerHTML=`${icon(type==="error"?"alert":type==="success"?"check":"activity",16)}<span>${esc(message)}</span>`;document.getElementById("toast-root").appendChild(el);requestAnimationFrame(()=>el.classList.add("show"));setTimeout(()=>{el.classList.remove("show");setTimeout(()=>el.remove(),250)},3200)}
async function api(path,options={}){const headers={"Content-Type":"application/json",...(options.headers||{})};if(state.token)headers.Authorization=`Bearer ${state.token}`;const r=await fetch(`${API}${path}`,{...options,headers});const text=await r.text();let data={};try{data=JSON.parse(text)}catch{}if(r.status===401&&state.token){logout(false);throw new Error("Session expired")};if(!r.ok)throw new Error(data.message||`Request failed (${r.status})`);return data}
async function loadMe(){if(!state.token)return;try{const d=await api("/api/auth/me");state.user=d.user;state.workspace=d.workspace}catch{logout(false)}}
async function loadData(){if(!state.token)return;const incidentId=state.route.startsWith("incident/")?state.route.split("/")[1]:null;state.loading=true;render();try{const [s,i,p,o,a,c,ai,aut,pr,pol,pls]=await Promise.all([api("/api/dashboard/summary"),api("/api/dashboard/incidents"),api("/api/dashboard/payments"),api("/api/dashboard/orders"),api("/api/dashboard/audit"),api("/api/razorpay/status?mode=test"),api("/api/dashboard/intelligence"),api("/api/dashboard/automation"),api("/api/proof"),api("/api/policy"),api("/api/payment-links")]);state.summary=s.summary;state.incidents=i.incidents;state.payments=p.payments;state.orders=o.orders;state.logs=a.logs;state.connection=c.connection;state.insights=ai.insights;state.automation=aut.automation;state.proof=pr.proof;state.policy=pol.policy;state.paymentLinks=pls.paymentLinks;if(incidentId){state.detail=await api(`/api/dashboard/incident/${incidentId}`)}}catch(e){toast(e.message,"error")}finally{state.loading=false;render()}}
function logout(show=true){localStorage.removeItem("recoverai_token");state.token=null;state.user=null;state.workspace=null;if(show)toast("Signed out","info");location.hash="#home";render()}
function go(route){state.route=route;state.mobileNav=false;location.hash=`#${route}`;window.scrollTo({top:0,behavior:"smooth"});render()}
window.addEventListener("hashchange",()=>{state.route=location.hash.slice(1).split("?")[0]||"home";render()});

function brand(){return`<a class="brand" href="#dashboard" aria-label="RecoverAI"><span class="brand-mark">${icon("shield",18)}</span><span>Recover<span>AI</span></span></a>`}
function navItem(route,label,ico,badge=""){return`<a class="nav-item ${state.route===route?"active":""}" href="#${route}"><span class="nav-ico">${icon(ico,18)}</span><span>${label}</span>${badge?`<b class="nav-badge">${badge}</b>`:""}</a>`}
function shell(content){
  const open=state.mobileNav?" open":"";
  return `<div class="app-shell"><aside class="sidebar${open}" id="sidebar">
    <div class="side-top"><div class="side-brand">${brand()}<button class="mobile-close" data-action="close-menu">${icon("close",18)}</button></div>
    <a class="workspace-switch" href="#settings"><span class="workspace-avatar">${esc((state.workspace?.name||"R")[0].toUpperCase())}</span><span><b>${esc(state.workspace?.name||"Workspace")}</b><small>Private workspace</small></span>${icon("arrow",14)}</a></div>
    <div class="nav-scroll">
      <div class="nav-group"><span class="nav-label">Monitor</span>${navItem("dashboard","Overview","activity")}${navItem("incidents","Incidents","alert",state.summary?.incidents?.open||"")}</div>
      <div class="nav-group"><span class="nav-label">Payments</span>${navItem("payments","Payments","credit")}${navItem("orders","Orders","clock")}${navItem("payment-links","Recovery links","credit")}</div>
      <div class="nav-group"><span class="nav-label">Intelligence</span>${navItem("intelligence","Recovery intelligence","spark")}${navItem("automation","Automation","bolt")}${navItem("proof","Proof lab","target")}${navItem("policy","Policy & guardrails","shield")}</div>
      <div class="nav-group"><span class="nav-label">Workspace</span>${navItem("audit","Audit log","shield")}${navItem("architecture","Architecture","activity")}${navItem("settings","Settings","settings")}</div>
    </div>
    <div class="side-bottom"><div class="security-mini">${icon("shield",14)} <span>Workspace data isolated</span></div><button class="user-card" data-action="logout"><span class="user-avatar">${esc((state.user?.name||"U")[0].toUpperCase())}</span><span><b>${esc(state.user?.name||"User")}</b><small>${esc(state.user?.email||"")}</small></span>${icon("logout",15)}</button></div>
  </aside><div class="sidebar-scrim" data-action="close-menu"></div>
  <div class="main-area"><header class="app-top"><button class="menu-btn" data-action="open-menu">${icon("menu",20)}</button><div class="crumbs"><span>${esc(state.workspace?.name||"Workspace")}</span><span>/</span><b>${esc((state.route.split("/")[0]||"overview").replaceAll("-"," "))}</b></div><div class="top-right"><button class="top-search" data-action="focus-search">${icon("search",16)}<span>Search workspace</span><kbd>⌘˜ K</kbd></button><span class="private-pill">${icon("shield",13)} Private</span><span class="top-avatar">${esc((state.user?.name||"U")[0].toUpperCase())}</span></div></header><main class="content">${content}</main></div></div>`;
}

function pageHead(eyebrow,title,copy,action=""){
 return `<section class="page-head reveal"><div><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1><p>${esc(copy)}</p></div>${action}</section>`;
}
function dashboard(){
 const s=state.summary||{incidents:{open:0,critical:0},payments:{total:0,volume:0},orders:{total:0,paid:0},recovery:{rate:100,completed:0},webhooks:{total:0}};
 const insight=state.insights||{revenueAtRisk:0,opportunities:0,highConfidence:0};
 const recent=state.incidents.slice(0,5), recovery=Number(s.recovery.rate||100);
 return `<div class="dashboard">
  <section class="welcome reveal"><div><span class="eyebrow"><i class="live-dot"></i> Payment operations</span><h1>Good to see you, ${esc((state.user?.name||"there").split(" ")[0])}.</h1><p>Your payment operation is monitored, reconciled and ready to recover.</p></div><div class="welcome-actions"><span class="sync-label">Updated ${relative(new Date())}</span><button class="button dark" data-action="refresh">${icon("activity",15)} Refresh</button></div></section>
  <section class="health-card reveal"><div class="health-main"><div class="health-mark">${icon("shield",21)}</div><div><span class="overline">SYSTEM HEALTH</span><h2>Operational</h2><p>Webhook intake, reconciliation and recovery services are online.</p></div></div><div class="health-stat"><span>Recovery rate</span><strong>${recovery}%</strong><small>${s.recovery.completed||0} recovered</small></div><div class="health-stat"><span>Open attention</span><strong>${s.incidents.open}</strong><small class="${s.incidents.critical?"bad":""}">${s.incidents.critical||0} critical</small></div><div class="health-progress"><div><span>Monitoring pipeline</span><b>100%</b></div><div class="progress"><i></i></div><small>Webhook · Reconciliation · Recovery</small></div></section>
  <section class="kpi-grid reveal">
   ${kpi("Payment volume",money(s.payments.volume),`${s.payments.total} recorded payments`,"credit","")}
   ${kpi("Orders",s.orders.total,`${s.orders.paid} paid`,"clock",s.orders.total?`${Math.round(s.orders.paid/s.orders.total*100)}% paid`:"")}
   ${kpi("Revenue at risk",money(insight.revenueAtRisk),`${insight.opportunities} recovery opportunities`,"target",insight.highConfidence?`${insight.highConfidence} high confidence`:"")}
   ${kpi("Verified recovered",money(s.verifiedRecovered?.amount||0),`${s.verifiedRecovered?.incidents||0} recovery incident(s) closed`,"check","")}
   ${kpi("Open incidents",s.incidents.open,`${s.incidents.critical||0} critical`,"alert",s.incidents.open?"Needs review":"Clear","danger")}
  </section>
<section class="panel test-payment-panel reveal">
  <div>
    <span class="overline">LIVE TEST ENVIRONMENT</span>
    <h2>Test the recovery flow</h2>
    <p>
      Run a provider-backed Razorpay Test Mode payment and watch
      RecoverAI detect, analyze and record the outcome.
    </p>
    <div class="test-payment-meta">
      <span>₹4,999 test payment</span>
      <span>Razorpay Test Mode</span>
      <span>No real money</span>
    </div>
  </div>
  <button class="button dark" data-action="test-payment">
    ${icon("bolt",15)} Run Test Payment
  </button>
</section>
  <section class="main-grid reveal">
   <article class="panel activity-panel"><div class="panel-title"><div><span class="overline">ATTENTION QUEUE</span><h2>Recent incidents</h2><p>Problems detected across this workspace.</p></div><a href="#incidents" class="link">View all ${icon("arrow",14)}</a></div>
   ${recent.length?`<div class="incident-list">${recent.map(incidentCompact).join("")}</div>`:`<div class="empty"><div class="empty-check">${icon("check",20)}</div><b>No open incidents</b><span>Your operation is quiet. That's exactly what we want.</span></div>`}</article>
   <article class="panel intelligence-card"><div class="panel-title"><div><span class="overline">RECOVERY INTELLIGENCE</span><h2>Know what to do next</h2><p>Prioritize recoverable revenue before it becomes churn.</p></div><a href="#intelligence" class="link">Open ${icon("arrow",14)}</a></div>
     <div class="intel-score"><div class="score-number">${insight.highConfidence||0}</div><div><b>high-confidence opportunities</b><span>${money(insight.revenueAtRisk)} currently at risk</span></div></div>
     <div class="intel-bars"><div><span>High confidence</span><b>${insight.highConfidence||0}</b></div><div class="bar"><i style="width:${Math.min(100,(insight.highConfidence||0)*18)}%"></i></div><div><span>Automation</span><b>${state.automation?.enabled?"ON":"OFF"}</b></div></div>
   </article>
  </section>
  <section class="panel evidence-strip reveal"><div><span class="overline">JUDGE-READY PROOF</span><h2>Recovered ${money(s.verifiedRecovered?.amount||0)} across ${s.verifiedRecovered?.incidents||0} provider-verified incident(s).</h2><p>Run the Proof Lab for a 50-event sandbox resilience batch; synthetic outcomes are clearly separated from provider-verified recovery.</p></div><a class="button" href="#proof">Open proof lab ${icon("arrow",14)}</a></section><section class="panel workflow-panel reveal"><div class="panel-title"><div><span class="overline">RECOVERY PIPELINE</span><h2>Detect → decide → recover → verify</h2><p>A controlled workflow for payment failures and state mismatches.</p></div></div><div class="workflow">${workflowStep("01","Detect","Capture and verify provider events","activity")}${workflowStep("02","Decide","Score the recovery opportunity","spark")}${workflowStep("03","Recover","Run a safe, traceable action","bolt")}${workflowStep("04","Verify","Reconcile and close the loop","check")}</div></section>
 </div>`;
}
function kpi(label,value,sub,ico,tag="",tone=""){return`<article class="kpi ${tone}"><div class="kpi-top"><span>${esc(label)}</span><span class="kpi-icon">${icon(ico,17)}</span></div><strong>${value}</strong><div><small>${esc(sub)}</small>${tag?`<em>${esc(tag)}</em>`:""}</div></article>`}
function workflowStep(n,title,copy,ico){return`<div class="workflow-step"><span class="step-no">${n}</span><div class="step-icon">${icon(ico,18)}</div><div><b>${title}</b><small>${copy}</small></div></div>`}
function incidentCompact(i){const score=i.recovery_score??i.recovery_probability??0;return`<a class="incident-compact" href="#incident/${i.id}"><span class="incident-dot ${esc(i.severity)}"></span><div><b>${esc(i.type.replaceAll("_"," "))}</b><span>${esc(i.description)}</span></div><div class="incident-right">${severity(i.severity)}<small>${score?`${score}% recovery score`:relative(i.detected_at)}</small></div>${icon("arrow",15)}</a>`}

function incidentsPage(){
 return `${pageHead("Operations","Incidents","Investigate failures, mismatches and recovery opportunities.")}<div class="toolbar reveal"><div class="searchbox">${icon("search",16)}<input id="incident-search" placeholder="Search incidents, orders or IDs..."/></div><span>${state.incidents.length} records</span></div><section class="panel table-panel reveal"><div class="table-wrap"><table><thead><tr><th>Incident</th><th>Recovery</th><th>Severity</th><th>Order</th><th>Status</th><th>Detected</th><th></th></tr></thead><tbody id="incident-table">${state.incidents.length?state.incidents.map(i=>`<tr><td><a href="#incident/${i.id}" class="primary-cell">${esc(i.type.replaceAll("_"," "))}<small>${esc(i.description)}</small></a></td><td>${i.recovery_score!=null?`<span class="score ${scoreClass(i.recovery_score)}">${i.recovery_score}%</span>`:"-"}</td><td>${severity(i.severity)}</td><td><code>${esc(i.razorpay_order_id||"Unmatched")}</code></td><td>${status(i.status)}</td><td>${time(i.detected_at)}</td><td><a class="row-arrow" href="#incident/${i.id}">${icon("arrow",15)}</a></td></tr>`).join(""):`<tr><td colspan="7">${emptyState("No incidents","Nothing needs your attention.","check")}</td></tr>`}</tbody></table></div></section>`;
}
function emptyState(title,copy,ico="clock"){return`<div class="empty"><div class="empty-check">${icon(ico,20)}</div><b>${esc(title)}</b><span>${esc(copy)}</span></div>`}

function incidentDetail(id){
 const i=state.incidents.find(x=>x.id===id);
 const insight=state.insights?.incidentScores?.find(x=>x.id===id);
 if(!i)return `${pageHead("Incident","Incident not found","This incident may have been resolved or is outside this workspace.")}`;
 const d=state.detail?.incident?.id===id?state.detail:null; const score=i.recovery_score??insight?.recovery_score??0, action=actionLabel(i.recommended_action||insight?.recommended_action||"Manual review");
 return `<div class="detail">
 ${pageHead("Incident",i.type.replaceAll("_"," "),i.description, i.status==="open"?`<button class="button dark" data-action="recover" data-id="${id}">${icon("bolt",15)} Run recovery</button>`:"")}
 <a class="back-link" href="#incidents">< Back to incidents</a>
 <div class="detail-grid">
  <section class="panel opportunity"><div class="panel-title"><div><span class="overline">RECOVERY INTELLIGENCE</span><h2>${score}% recovery score</h2><p>${esc(i.recommendation_reason||insight?.recommendation_reason||"The engine evaluated the incident using payment state, error signals and recoverability.")}</p></div><span class="confidence ${scoreClass(score)}">${score>=75?"High confidence":score>=50?"Possible":"Low confidence"}</span></div>
   <div class="opportunity-grid"><div><span>Revenue at risk</span><strong>${money(i.revenue_at_risk||insight?.revenue_at_risk||0)}</strong></div><div><span>Recommended action</span><strong>${esc(action)}</strong></div><div><span>Confidence</span><strong>${Number(i.recovery_confidence||insight?.recovery_confidence||0)}%</strong></div></div>
   <div class="reason-box">${icon("spark",16)} <div><b>Why this action?</b><span>${esc(i.recommendation_reason||insight?.recommendation_reason||"No additional recommendation is available.")}</span></div></div>
  </section>
  <section class="panel"><div class="panel-title"><div><span class="overline">EVIDENCE</span><h2>State comparison</h2></div></div><div class="compare"><div><label>Expected</label><pre>${esc(JSON.stringify(i.expected_state||{},null,2))}</pre></div><div><label>Actual</label><pre>${esc(JSON.stringify(i.actual_state||{},null,2))}</pre></div></div></section>
  <section class="panel"><div class="panel-title"><div><span class="overline">INCIDENT TIMELINE</span><h2>Detect → decide → act → verify</h2></div></div><div class="timeline">${d?.timeline?.length?d.timeline.map(l=>{const t=timelineEvent(l);return `<div class="timeline-row"><span class="timeline-dot"></span><div><b><span class="timeline-stage">${esc(t.stage)}</span> ${esc(t.title)}</b><span>${esc(t.copy)}</span><small>${esc(l.entity_type)} · ${esc(l.actor)}</small></div><time>${time(l.created_at)}</time></div>`}).join(""):emptyState("Timeline loading","Open incident evidence is being fetched.","activity")}</div></section>
  <section class="panel"><div class="panel-title"><div><span class="overline">TRACEABILITY</span><h2>Incident metadata</h2></div></div><dl class="meta-list">${meta("Incident ID",`<code>${esc(i.id)}</code>`)}${meta("Merchant order",`<code>${esc(i.merchant_order_id||"Unmatched")}</code>`)}${meta("Razorpay order",`<code>${esc(i.razorpay_order_id||"Unmatched")}</code>`)}${meta("Payment ID",`<code>${esc(i.razorpay_payment_id||i.payment_id||"Unmatched")}</code>`)}${meta("Detected",time(i.detected_at))}${meta("Status",status(i.status))}${meta("Recovery action",esc(action))}${meta("Recovery action ID",`<code>${esc(d?.recoveryActions?.[0]?.id||"—")}</code>`)}</dl></section>
 </div></div>`;
}
function meta(k,v){return`<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`}

function intelligencePage(){
 const ins=state.insights||{revenueAtRisk:0,opportunities:0,highConfidence:0,incidentScores:[]};
 return `${pageHead("Intelligence","Recovery intelligence","Score failed payment events, estimate revenue at risk and recommend the next safe action.")}<section class="intel-overview reveal"><div><span class="overline">REVENUE AT RISK</span><strong>${money(ins.revenueAtRisk)}</strong><p>Estimated across open incidents with recoverable payment context.</p></div><div><span class="overline">OPPORTUNITIES</span><strong>${ins.opportunities}</strong><p>Open incidents with an actionable recovery path.</p></div><div><span class="overline">HIGH CONFIDENCE</span><strong>${ins.highConfidence}</strong><p>Score >= 75% and eligible for safe automation.</p></div></section>
<section class="panel reveal"><div class="panel-title"><div><span class="overline">PRIORITY QUEUE</span><h2>Recovery opportunities</h2><p>Start with the highest-value, highest-confidence cases.</p></div></div><div class="opportunity-list">${ins.incidentScores?.length?ins.incidentScores.map(x=>`<a href="#incident/${x.id}" class="opportunity-row"><div class="opp-score ${scoreClass(x.recovery_score)}">${x.recovery_score}%</div><div><b>${esc(x.type.replaceAll("_"," "))}</b><span>${esc(x.recommendation_reason||"Recommended recovery path available.")}</span></div><div class="opp-value"><b>${money(x.revenue_at_risk)}</b><small>${esc(actionLabel(x.recommended_action))}</small></div>${icon("arrow",15)}</a>`).join(""):emptyState("No recovery opportunities","New failed or inconsistent payments will appear here.","spark")}</div></section>`;
}
function automationPage(){
 const a=state.automation||{enabled:false,minScore:75,mode:"safe_reconcile",lastRun:null,runCount:0};
 return `${pageHead("Automation","Recovery automation","Let RecoverAI run only the recovery actions you explicitly allow.")}<section class="automation-hero reveal"><div class="automation-icon">${icon("bolt",23)}</div><div><span class="overline">CONTROLLED AUTOMATION</span><h2>${a.enabled?"Automation is active":"Automation is paused"}</h2><p>${a.enabled?"High-confidence, safe reconciliation actions are eligible to run automatically.":"Nothing runs automatically until you enable a rule."}</p></div><button class="switch ${a.enabled?"on":""}" data-action="toggle-automation" aria-label="Toggle automation"><i></i></button></section>
<section class="automation-grid reveal"><article class="panel rule-card"><div class="panel-title"><div><span class="overline">RULE 01</span><h2>Safe reconciliation</h2><p>Automatically reconcile open incidents that have a local order and a high recovery score.</p></div><span class="rule-state">${a.enabled?"Enabled":"Disabled"}</span></div><div class="rule-row"><span>Minimum recovery score</span><b>${a.minScore}%</b></div><div class="rule-row"><span>Allowed action</span><b>Reconcile order</b></div><div class="rule-row"><span>Charges customer</span><b>No</b></div><div class="rule-row"><span>Last automation run</span><b>${a.lastRun?time(a.lastRun):"Not yet"}</b></div></article><article class="panel guardrail"><span class="overline">GUARDRAILS</span><h2>Designed to fail safely.</h2><ul><li>${icon("check",15)} Never exposes provider secrets to the browser.</li><li>${icon("check",15)} Workspace isolation is enforced server-side.</li><li>${icon("check",15)} Payment retries are never triggered by this rule.</li><li>${icon("check",15)} Every automated action is written to the audit log.</li></ul></article></section>`;
}

function proofPage(){
 const p=state.proof||{actualVerified:{recoveredAmount:0,incidents:0},incidentUniverse:{atRisk:0,incidents:0},batches:[]};
 const latest=p.batches?.[0];
 return `${pageHead("Evidence","Recovery proof lab","Separate provider-verified recovery from sandbox resilience simulations so the demo stays honest and judgeable.",`<button class="button dark" data-action="run-proof">${icon("bolt",15)} Run 50-event proof</button>`)}
 <section class="intel-overview reveal"><div><span class="overline">PROVIDER-VERIFIED RECOVERY</span><strong>${money(p.actualVerified.recoveredAmount)}</strong><p>${p.actualVerified.incidents} incident(s) resolved through a completed recovery action. This is the number you can defend as verified.</p></div><div><span class="overline">OPEN INCIDENT UNIVERSE</span><strong>${money(p.incidentUniverse.atRisk)}</strong><p>${p.incidentUniverse.incidents} incidents currently represented in this workspace.</p></div><div><span class="overline">LATEST 50-EVENT RUN</span><strong>${latest?`${latest.recovered_count}/${latest.total_events}`:"-"}</strong><p>${latest?`${money(latest.recovered_amount)} simulated recovery of ${money(latest.total_at_risk)} at risk.`:"No proof run yet."}</p></div></section>
 <section class="panel reveal"><div class="panel-title"><div><span class="overline">SCALE CHECK</span><h2>50 synthetic failure patterns</h2><p>Razorpay test-mode orders are created where credentials permit; outcomes are explicitly marked as simulation because Test Mode does not move real money.</p></div></div><div class="proof-grid"><div><b>12</b><span>UPI collect failures</span></div><div><b>12</b><span>Card declines</span></div><div><b>10</b><span>Gateway timeouts</span></div><div><b>8</b><span>Duplicate webhooks</span></div><div><b>8</b><span>Amount mismatches</span></div></div></section>
 <section class="panel reveal"><div class="panel-title"><div><span class="overline">BATCH HISTORY</span><h2>Proof runs</h2></div></div><div class="table-wrap"><table><thead><tr><th>Run</th><th>Events</th><th>At risk</th><th>Recovered</th><th>Provider orders</th><th>Mode</th><th>Created</th></tr></thead><tbody>${p.batches?.length?p.batches.map(b=>`<tr><td><code>${esc(b.id)}</code></td><td>${b.total_events}</td><td class="amount">${money(b.total_at_risk)}</td><td class="amount">${money(b.recovered_amount)}</td><td>${b.provider_order_count}</td><td>${esc(b.mode)}</td><td>${time(b.created_at)}</td></tr>`).join(""):`<tr><td colspan="7">${emptyState("No proof runs yet","Run the 50-event sandbox batch before your demo.","target")}</td></tr>`}</tbody></table></div></section>`;
}
function policyPage(){
 const p=state.policy||{max_retries:2,cooldown_minutes:30,auto_recover_score:75,human_approval_amount:10000,stop_on_chargeback:true,abandonment_minutes:20,payment_link_expiry_minutes:60};
 return `${pageHead("Governance","Policy & guardrails","Make stopping rules and compliant escalation visible instead of hiding them inside conditionals.")}
 <section class="policy-layout reveal"><article class="panel policy-card"><div class="panel-title"><div><span class="overline">VISIBLE STOPPING RULES</span><h2>Recovery policy</h2><p>These controls govern what RecoverAI may do automatically.</p></div></div><form id="policy-form" class="policy-form"><label>Max retries / actions<input name="maxRetries" type="number" min="0" max="10" value="${p.max_retries}"></label><label>Cooldown (minutes)<input name="cooldownMinutes" type="number" min="0" value="${p.cooldown_minutes}"></label><label>Auto-recovery score<input name="autoRecoverScore" type="number" min="0" max="100" value="${p.auto_recover_score}"></label><label>Human approval above (₹)<input name="humanApprovalAmount" type="number" min="0" value="${p.human_approval_amount}"></label><label>Abandonment window (minutes)<input name="abandonmentMinutes" type="number" min="5" value="${p.abandonment_minutes}"></label><label>Payment-link expiry (minutes)<input name="paymentLinkExpiryMinutes" type="number" min="5" value="${p.payment_link_expiry_minutes}"></label><label class="policy-check"><input name="stopOnChargeback" type="checkbox" ${p.stop_on_chargeback?"checked":""}> Stop automation on chargeback / dispute</label><button class="button dark" type="submit">Save policy ${icon("check",15)}</button></form></article>
 <article class="panel guardrail"><span class="overline">COMPLIANT ESCALATION</span><h2>When automation stops</h2><ul><li>${icon("check",15)} No silent retry after a mandate failure.</li><li>${icon("check",15)} Recurring-payment failures become a human-review incident when policy blocks the next step.</li><li>${icon("check",15)} Amount mismatches never auto-resolve.</li><li>${icon("check",15)} High-value recovery above the approval threshold requires a human.</li><li>${icon("check",15)} Checkout abandonment uses a fresh Payment Link rather than charging again.</li><li>${icon("check",15)} Every decision, action and verification is written to the audit trail.</li></ul><button class="button" data-action="simulate-mandate">Simulate mandate failure</button></article></section>`;
}
function paymentLinksPage(){return `${pageHead("Recovery","Payment links","Fresh, short-lived links for abandoned checkouts. The dispatch step is logged as queued for WhatsApp/SMS in the demo.")}<section class="panel reveal"><div class="panel-title"><div><span class="overline">LINK RECOVERY QUEUE</span><h2>Payment links</h2><p>Razorpay Payment Links can be created via API, expire, and emit payment-link webhooks when paid.</p></div></div><div class="table-wrap"><table><thead><tr><th>Link</th><th>Incident</th><th>Amount</th><th>Status</th><th>Channel</th><th>Expires</th></tr></thead><tbody>${state.paymentLinks.length?state.paymentLinks.map(x=>`<tr><td><a class="primary-cell" href="${esc(x.short_url||"#")}" target="_blank" rel="noreferrer">${esc(x.razorpay_payment_link_id)}<small>${esc(x.short_url||"")}</small></a></td><td>${esc(x.incident_type||"-")}</td><td class="amount">${money(x.amount_in_subunits)}</td><td>${status(x.status)}</td><td>${esc(x.channel)}</td><td>${time(x.expires_at)}</td></tr>`).join(""):`<tr><td colspan="6">${emptyState("No payment links","Abandoned checkouts will appear here after the configured window.","credit")}</td></tr>`}</tbody></table></div></section>`}
function architecturePage(){return `${pageHead("Architecture","RecoverAI architecture","One traceable path from provider authorization to verified recovery.")}<section class="panel architecture reveal"><div class="arch-flow"><div><b>OAuth / API keys</b><span>Workspace-scoped provider access</span></div><i><“</i><div><b>Webhook ingestion</b><span>Raw-body signature + replay checks + durable event queue</span></div><i><“</i><div><b>Reconciliation</b><span>Provider state vs local order/payment state</span></div><i><“</i><div><b>Recovery intelligence</b><span>Explainable score, probability, confidence and revenue at risk</span></div><i><“</i><div><b>Policy decision</b><span>Retry limits, cooldowns, human approval and stopping rules</span></div><i><“</i><div><b>Action</b><span>Reconcile safely or issue a short-lived Payment Link</span></div><i><“</i><div><b>Verification</b><span>Webhook/poll confirms outcome → incident resolved → audit timeline</span></div></div></section><section class="panel failure-story reveal"><div class="panel-title"><div><span class="overline">DEVELOPMENT FAILURE STORY</span><h2>What broke, and how it was fixed</h2></div></div><p>During development, the demo initially failed at order persistence because the application expected an <code>amount</code> column that the deployed orders table did not have. The next failure was more subtle: successful Razorpay payments were verified, but the local payments table was empty because verification only updated the order. We fixed the schema mismatch, made workspace context explicit, fetched the authoritative Razorpay payment after signature verification, persisted it, and then made webhook reconciliation idempotent and workspace-scoped.</p><p>This is now visible in the audit trail rather than hidden in a clean-room story.</p></section>`}

function genericPage(kind){
 const rows=kind==="payments"?state.payments:state.orders,title=kind==="payments"?"Payments":"Orders";
 const headers=kind==="payments"?["Payment","Order","Amount","Method","Status","Created"]:["Merchant order","Razorpay order","Amount","Currency","Status","Created"];
 return `${pageHead("Data",title,"Provider records stored in your private workspace.")}<section class="panel table-panel reveal"><div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.length?rows.map(r=>kind==="payments"?`<tr><td><code>${esc(r.razorpay_payment_id)}</code></td><td><code>${esc(r.razorpay_order_id||"-")}</code></td><td class="amount">${money(r.amount_in_subunits)}</td><td>${esc(r.method||"-")}</td><td>${status(r.status)}</td><td>${time(r.created_at)}</td></tr>`:`<tr><td><code>${esc(r.merchant_order_id)}</code></td><td><code>${esc(r.razorpay_order_id)}</code></td><td class="amount">${money(r.amount_in_subunits)}</td><td>${esc(r.currency)}</td><td>${status(r.status)}</td><td>${time(r.created_at)}</td></tr>`).join(""):`<tr><td colspan="6">${emptyState("No records yet","New provider activity will appear here.","clock")}</td></tr>`}</tbody></table></div></section>`;
}
function auditPage(){return `${pageHead("Traceability","Audit log","A chronological record of payment, incident and recovery actions.")}<section class="panel timeline reveal">${state.logs.length?state.logs.map(l=>`<div class="timeline-row"><span class="timeline-dot"></span><div><b>${esc(l.action.replaceAll("_"," "))}</b><span>${esc(l.entity_type)} · ${esc(l.actor)}</span></div><time>${time(l.created_at)}</time></div>`).join(""):emptyState("No audit events yet","Operational history will appear here.","shield")}</section>`}
function settingsPage(){
 const c=state.connection,connected=Boolean(c);
 return `${pageHead("Workspace","Settings","Manage your workspace and payment-provider connection.")}<div class="settings-grid reveal"><section class="panel setting-card"><div class="setting-icon">${icon("shield",20)}</div><div><span class="overline">WORKSPACE</span><h2>${esc(state.workspace?.name||"Workspace")}</h2><p>Private tenant workspace</p>${meta("Workspace ID",`<code>${esc(state.workspace?.id||"-")}</code>`)}${meta("Member",esc(state.user?.email||"-"))}${meta("Plan","Starter")}</div></section><section class="panel setting-card provider"><div class="setting-icon">${icon("credit",20)}</div><div class="provider-body"><div class="provider-top"><div><span class="overline">PAYMENT PROVIDER</span><h2>Razorpay</h2></div><span class="connection ${connected?"connected":""}"><i></i>${connected?"Connected":"Not connected"}</span></div><p>${connected?"RecoverAI is authorized to monitor this workspace's Razorpay account.":"Authorize RecoverAI on Razorpay without sharing your API secret."}</p>${connected?`<div class="provider-details">${meta("Account",`<code>${esc(c.razorpay_account_id)}</code>`)}${meta("Mode",esc(c.mode))}${meta("Webhook",c.webhook_id?"Active":"Pending")}</div>`:`<div class="benefits"><span>✓“ Workspace-specific access</span><span>✓“ Encrypted server-side tokens</span><span>✓“ Managed webhook subscription</span></div><button class="button dark" data-action="connect-razorpay">Connect Razorpay ${icon("arrow",15)}</button><small>OAuth authorization keeps the provider credential on the server.</small>`}</div></section></div>`;
}
function render(){
 let html;
 if(!state.token){html=state.route==="signup"?authPage("signup"):state.route==="login"?authPage("login"):state.route==="demo"?demoPage():landing();app.innerHTML=html;bind();animateReveals();return}
 let content=state.route==="dashboard"||state.route==="home"?dashboard():state.route==="incidents"?incidentsPage():state.route.startsWith("incident/")?incidentDetail(state.route.split("/")[1]):state.route==="payments"?genericPage("payments"):state.route==="orders"?genericPage("orders"):state.route==="payment-links"?paymentLinksPage():state.route==="proof"?proofPage():state.route==="policy"?policyPage():state.route==="architecture"?architecturePage():state.route==="intelligence"?intelligencePage():state.route==="automation"?automationPage():state.route==="audit"?auditPage():state.route==="settings"?settingsPage():dashboard();
 app.innerHTML=shell(content);bind();animateReveals();
}
function landing(){return`<div class="landing">
<header class="public-nav">
  ${brand()}
  <nav>
    <a href="#home">Product</a>
    <a href="#how">How it works</a>
    <a href="#security">Security</a>
  </nav>
  <div>
    <a href="#login" class="plain-link">Log in</a>
    <a href="#signup" class="button dark small">Get started ${icon("arrow",14)}</a>
  </div>
</header>

<main>

<section class="landing-hero reveal">
  <span class="eyebrow"><i class="live-dot"></i> Payment reliability infrastructure</span>

  <h1>Payments fail.<br><em>RecoverAI responds.</em></h1>

  <p>Detect inconsistencies, understand the failure, choose a recovery path and verify the outcome - from one private control plane.</p>

  <div class="landing-actions">
    <a href="#signup" class="button dark">Start protecting payments ${icon("arrow",16)}</a>
    <a href="#demo" class="plain-link">Try the payment demo</a>
  </div>

  <div class="trust-row">
    <span>${icon("shield",14)} Tenant isolated</span>
    <span>${icon("check",14)} Webhook verified</span>
    <span>${icon("activity",14)} Fully auditable</span>
  </div>
</section>

<section id="how" class="control-plane-section reveal">

  <div class="section-intro">
    <div>
      <span class="overline">ONE CONTROL PLANE</span>
      <h2>Detect the problem.<br><em>Decide the response.</em></h2>
    </div>

    <p>RecoverAI turns noisy payment operations into a controlled recovery loop. Every stage produces evidence that the next stage can trust.</p>
  </div>

  <div class="control-visual">

    <div class="pipeline-status">
      <span class="pulse-dot"></span>
      <span>LIVE RECOVERY PIPELINE</span>
      <b>ONLINE</b>
    </div>

    <div class="pipeline-line">
      <i></i><i></i><i></i>
    </div>

    <div class="pipeline-grid">

      <article class="pipeline-card active">
        <div class="pipeline-card-top">
          <span class="pipeline-number">01</span>
          <span class="pipeline-icon">${icon("activity",19)}</span>
        </div>

        <div class="pipeline-state">EVENT INGESTION</div>
        <h3>Detect</h3>
        <p>Capture verified provider events and open an incident when payment state becomes inconsistent.</p>

        <div class="pipeline-footer">
          <span><i></i> Webhook verified</span>
          <small>01</small>
        </div>
      </article>

      <article class="pipeline-card">
        <div class="pipeline-card-top">
          <span class="pipeline-number">02</span>
          <span class="pipeline-icon">${icon("spark",19)}</span>
        </div>

        <div class="pipeline-state">RECOVERY INTELLIGENCE</div>
        <h3>Decide</h3>
        <p>Score recoverability, inspect evidence and select the safest available response.</p>

        <div class="pipeline-footer">
          <span><i></i> Explainable decision</span>
          <small>02</small>
        </div>
      </article>

      <article class="pipeline-card">
        <div class="pipeline-card-top">
          <span class="pipeline-number">03</span>
          <span class="pipeline-icon">${icon("bolt",19)}</span>
        </div>

        <div class="pipeline-state">SAFE ACTION</div>
        <h3>Recover</h3>
        <p>Apply visible policy guardrails before reconciling payment state or issuing a fresh recovery path.</p>

        <div class="pipeline-footer">
          <span><i></i> Policy checked</span>
          <small>03</small>
        </div>
      </article>

      <article class="pipeline-card">
        <div class="pipeline-card-top">
          <span class="pipeline-number">04</span>
          <span class="pipeline-icon">${icon("check",19)}</span>
        </div>

        <div class="pipeline-state">CLOSED LOOP</div>
        <h3>Verify</h3>
        <p>Confirm the provider outcome, close the incident and preserve the complete audit trail.</p>

        <div class="pipeline-footer">
          <span><i></i> Evidence recorded</span>
          <small>04</small>
        </div>
      </article>

    </div>

    <div class="pipeline-caption">
      <span>${icon("shield",14)} Provider state</span>
      <span>${icon("target",14)} Policy guardrails</span>
      <span>${icon("activity",14)} Audit trail</span>
    </div>

  </div>
</section>

<section id="security" class="security-section security-redesign reveal">

  <div class="security-visual">
    <div class="security-orbit orbit-one"></div>
    <div class="security-orbit orbit-two"></div>

    <div class="security-core">
      <div class="security-core-icon">${icon("shield",30)}</div>
      <span>WORKSPACE</span>
      <strong>PROTECTED</strong>
      <small>Isolation active</small>
    </div>

    <div class="security-signal signal-one">
      <i></i>
      <span>API</span>
      <b>ENCRYPTED</b>
    </div>

    <div class="security-signal signal-two">
      <i></i>
      <span>WEBHOOK</span>
      <b>VERIFIED</b>
    </div>

    <div class="security-signal signal-three">
      <i></i>
      <span>AUDIT</span>
      <b>TRACEABLE</b>
    </div>
  </div>

  <div class="security-copy">
    <span class="overline">SECURITY BY DESIGN</span>

    <h2>Your incidents<br><em>are yours.</em></h2>

    <p>Every customer operates inside a private workspace. RecoverAI keeps provider access, payment records, recovery actions and audit history scoped to that tenant.</p>

    <div class="security-grid">

      <article class="security-card">
        <span class="security-card-icon">${icon("shield",17)}</span>
        <div>
          <b>Workspace isolation</b>
          <small>Every request is scoped server-side to its workspace.</small>
        </div>
      </article>

      <article class="security-card">
        <span class="security-card-icon">${icon("key",17)}</span>
        <div>
          <b>Server-side secrets</b>
          <small>Provider credentials never need to live in the browser.</small>
        </div>
      </article>

      <article class="security-card">
        <span class="security-card-icon">${icon("activity",17)}</span>
        <div>
          <b>Verified webhooks</b>
          <small>Signed provider events feed the reconciliation pipeline.</small>
        </div>
      </article>

      <article class="security-card">
        <span class="security-card-icon">${icon("target",17)}</span>
        <div>
          <b>Auditable recovery</b>
          <small>Decisions, actions and verification remain traceable.</small>
        </div>
      </article>

    </div>

    <div class="security-foot">
      <span><i></i> Workspace protected</span>
      <span>Private by default</span>
    </div>
  </div>

</section>

</main>
</div>`}function authPage(mode){const signup=mode==="signup";return`<div class="auth-page"><a class="auth-logo" href="#home">${brand()}</a><div class="auth-card reveal"><span class="eyebrow">${signup?"CREATE WORKSPACE":"WELCOME BACK"}</span><h1>${signup?"Start with a private workspace.":"Back to your operations."}</h1><p>${signup?"Your payment data and incidents stay isolated to your workspace.":"Sign in to view your payment operation."}</p><form id="auth-form"><label>Name<input name="name" placeholder="Your name" autocomplete="name" ${signup?"required":""}></label><label>Email<input name="email" type="email" placeholder="you@company.com" autocomplete="email" required></label><label>Password<input name="password" type="password" minlength="8" placeholder="At least 8 characters" autocomplete="${signup?"new-password":"current-password"}" required></label>${signup?`<label>Workspace name<input name="workspaceName" placeholder="Acme Payments"></label>`:""}<button class="button dark full" type="submit">${signup?"Create account":"Log in"} ${icon("arrow",15)}</button></form><div class="auth-switch">${signup?"Already have an account?":"New to RecoverAI?"} <a href="#${signup?"login":"signup"}">${signup?"Log in":"Create an account"}</a></div><small class="auth-secure">${icon("shield",13)} Secure session · workspace isolated</small></div></div>`}
function demoPage(){return`<div class="auth-page"><a class="auth-logo" href="#home">${brand()}</a><div class="auth-card demo-card reveal"><span class="eyebrow">SANDBOX CHECKOUT</span><h1>RecoverAI Demo Store</h1><p>Run the validated Razorpay payment flow and watch the transaction enter the recovery pipeline.</p><div class="demo-product"><div><b>AI Engineering Course</b><span>Fundamentals to deployment</span></div><strong>₹4,999</strong></div><button class="button dark full" id="demo-pay">Pay ₹4,999 ${icon("arrow",15)}</button><div id="demo-status">Test mode · no real charge</div><a href="#home" class="plain-link">< Back to RecoverAI</a></div></div>`}

async function runTestPayment(button){
  if(!button) return;

  button.disabled=true;
  button.innerHTML=`${icon("activity",15)} Creating order...`;

  try{
    const r=await api("/api/orders",{
      method:"POST",
      body:JSON.stringify({
        amount:4999,
        currency:"INR"
      })
    });

    const o=r.order;

    if(!window.Razorpay){
      throw new Error("Razorpay checkout could not load");
    }

    button.innerHTML=`${icon("activity",15)} Opening checkout...`;

    const rz=new window.Razorpay({
      key:KEY,
      amount:o.amountInSubunits,
      currency:o.currency,
      name:"RecoverAI Test Store",
      description:"RecoverAI recovery-flow test",
      order_id:o.id,

      handler:async p=>{
        try{
          button.innerHTML=`${icon("activity",15)} Verifying...`;

          const vd=await api("/api/orders/verify",{
            method:"POST",
            body:JSON.stringify({
              merchantOrderId:o.merchantOrderId,
              razorpay_payment_id:p.razorpay_payment_id,
              razorpay_signature:p.razorpay_signature
            })
          });

          if(!vd.verified){
            throw new Error(vd.message||"Payment verification failed");
          }

          toast("Test payment verified - refreshing workspace","success");

          await loadData();

          button.disabled=false;
          button.innerHTML=`${icon("bolt",15)} Run Test Payment`;

        }catch(e){
          toast(e.message,"error");
          button.disabled=false;
          button.innerHTML=`${icon("bolt",15)} Run Test Payment`;
        }
      },

      modal:{
        ondismiss:async()=>{
          button.innerHTML=`${icon("activity",15)} Checking result...`;

          /*
           * Give the webhook a moment to reach RecoverAI,
           * then refresh the authenticated workspace.
           */
          await new Promise(resolve=>setTimeout(resolve,2500));

          try{
            await loadData();
          }finally{
            button.disabled=false;
            button.innerHTML=`${icon("bolt",15)} Run Test Payment`;
          }
        }
      }
    });

    rz.on("payment.failed",async response=>{
      toast("Payment failed - RecoverAI is processing the incident","info");

      /*
       * Razorpay failure webhook is asynchronous.
       * Wait briefly, then reload the workspace data.
       */
      await new Promise(resolve=>setTimeout(resolve,2500));

      try{
        await loadData();

        const latest=state.incidents?.[0];

        if(latest && latest.type==="PAYMENT_FAILED"){
          toast("Payment failure detected by RecoverAI","success");
        }
      }finally{
        button.disabled=false;
        button.innerHTML=`${icon("bolt",15)} Run Test Payment`;
      }
    });

    rz.open();

  }catch(e){
    toast(e.message,"error");
    button.disabled=false;
    button.innerHTML=`${icon("bolt",15)} Run Test Payment`;
  }
}
async function runDemo(){const b=document.getElementById("demo-pay"),st=document.getElementById("demo-status");if(!b)return;b.onclick=async()=>{b.disabled=true;st.textContent="Creating order...";try{const r=await fetch(`${API}/api/orders`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount:4999,currency:"INR"})});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||"Order creation failed");const o=d.order;st.textContent="Opening secure checkout...";if(!window.Razorpay)throw new Error("Razorpay checkout could not load");const rz=new window.Razorpay({key:KEY,amount:o.amountInSubunits,currency:o.currency,name:"RecoverAI Demo Store",description:"AI Engineering Course",order_id:o.id,handler:async p=>{st.textContent="Payment successful. Verifying...";const vr=await fetch(`${API}/api/orders/verify`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({merchantOrderId:o.merchantOrderId,razorpay_payment_id:p.razorpay_payment_id,razorpay_signature:p.razorpay_signature})});const vd=await vr.json();if(!vr.ok||!vd.verified)throw new Error(vd.message||"Verification failed");st.textContent="✓“ Payment verified successfully";b.disabled=false},modal:{ondismiss:()=>{st.textContent="Checkout closed";b.disabled=false}}});rz.open()}catch(e){st.textContent=e.message;b.disabled=false}}}

function bind(){
 document.querySelectorAll('[data-action="logout"]').forEach(b=>b.onclick=()=>logout());
 document.querySelectorAll('[data-action="refresh"]').forEach(b=>b.onclick=()=>loadData());
 document.querySelectorAll('[data-action="open-menu"]').forEach(b=>b.onclick=()=>{state.mobileNav=true;render()});
 document.querySelectorAll('[data-action="close-menu"]').forEach(b=>b.onclick=()=>{state.mobileNav=false;render()});
 document.querySelectorAll('[data-action="connect-razorpay"]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.innerHTML="Connecting...";try{const d=await api("/api/razorpay/connect?mode=test");location.href=d.authorizationUrl}catch(e){toast(e.message,"error");b.disabled=false}});
 document.querySelectorAll('[data-action="toggle-automation"]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const d=await api("/api/dashboard/automation",{method:"POST",body:JSON.stringify({enabled:!state.automation?.enabled})});state.automation=d.automation;toast(d.automation.enabled?"Automation enabled":"Automation paused",d.automation.enabled?"success":"info");render()}catch(e){toast(e.message,"error");b.disabled=false}});
document.querySelectorAll('[data-action="test-payment"]').forEach(b=>{
  b.onclick=()=>runTestPayment(b);
});
 document.querySelectorAll('[data-action="recover"]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.innerHTML=`${icon("activity",15)} Running...`;try{const d=await api(`/api/incidents/${b.dataset.id}/recover`,{method:"POST"});toast(d.policyBlocked?"Recovery blocked by policy - review required":d.resolved?"Incident recovered - verified":"Recovery executed - review required",d.policyBlocked?"info":d.resolved?"success":"info");await loadData();go("incident/"+b.dataset.id)}catch(e){toast(e.message,"error");b.disabled=false;b.innerHTML=`${icon("bolt",15)} Run recovery`}});
 document.querySelectorAll('[data-action="run-proof"]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent="Running 50-event proof...";try{await api('/api/proof/run',{method:'POST',body:JSON.stringify({count:50,createProviderOrders:true})});toast('50-event sandbox proof completed','success');await loadData();go('proof')}catch(e){toast(e.message,'error');b.disabled=false;b.innerHTML=`${icon('bolt',15)} Run 50-event proof`}});
 document.querySelectorAll('[data-action="simulate-mandate"]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const d=await api('/api/proof/mandate-failure',{method:'POST',body:JSON.stringify({reason:'insufficient_balance',attempts:1})});toast('Synthetic mandate failure created','info');await loadData();go('incident/'+d.incident.id)}catch(e){toast(e.message,'error')}finally{b.disabled=false}});
 const pf=document.getElementById('policy-form'); if(pf)pf.onsubmit=async e=>{e.preventDefault();const fd=new FormData(pf);try{const d=await api('/api/policy',{method:'PUT',body:JSON.stringify({maxRetries:Number(fd.get('maxRetries')),cooldownMinutes:Number(fd.get('cooldownMinutes')),autoRecoverScore:Number(fd.get('autoRecoverScore')),humanApprovalAmount:Number(fd.get('humanApprovalAmount')),abandonmentMinutes:Number(fd.get('abandonmentMinutes')),paymentLinkExpiryMinutes:Number(fd.get('paymentLinkExpiryMinutes')),stopOnChargeback:fd.get('stopOnChargeback')==='on'})});state.policy=d.policy;toast('Policy updated','success');render()}catch(e){toast(e.message,'error')}};
 const form=document.getElementById("auth-form");if(form)form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form),signup=location.hash==="#signup",payload=Object.fromEntries(fd.entries()),button=form.querySelector("button");button.disabled=true;button.textContent="Working...";try{const d=await api(`/api/auth/${signup?"signup":"login"}`,{method:"POST",body:JSON.stringify(payload)});state.token=d.token;localStorage.setItem("recoverai_token",d.token);state.user=d.user;state.workspace=d.workspace;toast(signup?"Workspace created":"Welcome back","success");go("dashboard");await loadData()}catch(e){toast(e.message,"error")}finally{button.disabled=false;button.innerHTML=`${signup?"Create account":"Log in"} ${icon("arrow",15)}`}};
 const search=document.getElementById("incident-search");if(search)search.oninput=()=>{const q=search.value.toLowerCase();document.querySelectorAll("#incident-table tr").forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?"":"none")};
 document.querySelectorAll('[data-action="focus-search"]').forEach(b=>b.onclick=()=>{const s=document.getElementById("incident-search");if(s)s.focus();});
 if(state.route==="demo")runDemo();
 if(state.route.startsWith("incident/") && state.detail?.incident?.id!==state.route.split("/")[1]) loadIncidentDetail(state.route.split("/")[1]);
}
async function loadIncidentDetail(id){try{const d=await api(`/api/dashboard/incident/${id}`);state.detail=d;render();}catch(e){toast(e.message,"error")}}
function animateReveals(){
 document.querySelectorAll(".reveal").forEach((el,i)=>{el.style.opacity="0";el.style.transform="translateY(14px)";inView(el,()=>{animate(el,{opacity:1,transform:"translateY(0)"},{duration:.55,delay:Math.min(i*.035,.2),ease:"easeOut"})},{amount:.08,once:true})});
 document.querySelectorAll(".kpi,.panel,.health-card").forEach(el=>{el.addEventListener("pointerenter",()=>animate(el,{y:-2},{duration:.18}));el.addEventListener("pointerleave",()=>animate(el,{y:0},{duration:.22}))});
}
loadMe().then(()=>{const h=location.hash.slice(1).split("?")[0];state.route=h||"home";render();if(state.token&&!state.summary)loadData()});
