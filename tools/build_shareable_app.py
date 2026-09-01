from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "poc.sqlite"
RULES = ROOT / "server" / "config" / "rules.json"
OUT_DIR = ROOT / "outputs" / "外发演示应用"
OUT = OUT_DIR / "销售质检与客户洞察_外发演示版.html"

SECRET_KEY_PATTERN = re.compile(
    r"(?:access.?key|secret|api.?key|token|authorization|password|credential|env)",
    re.I,
)
SECRET_VALUE_PATTERN = re.compile(r"(?:LTAI[A-Za-z0-9]{12,}|sk-[A-Za-z0-9_-]{16,})")
PHONE_PATTERN = re.compile(r"(?<!\d)(1[3-9]\d)\d{4}(\d{4})(?!\d)")
ID_CARD_PATTERN = re.compile(
    r"(?<!\d)([1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])"
    r"(?:0[1-9]|[12]\d|3[01]))\d{3}([0-9Xx])(?!\d)"
)
EMAIL_PATTERN = re.compile(r"([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})")


def loads(value, default):
    try:
        return json.loads(value) if value else default
    except Exception:
        return default


def clean(value):
    """Remove operational credentials and internal file paths from the export."""
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            if SECRET_KEY_PATTERN.search(str(key)):
                continue
            result[key] = clean(item)
        return result
    if isinstance(value, list):
        return [clean(item) for item in value]
    if isinstance(value, str):
        value = SECRET_VALUE_PATTERN.sub("[已隐藏]", value)
        value = PHONE_PATTERN.sub(r"\1****\2", value)
        value = ID_CARD_PATTERN.sub(r"\1***\2", value)
        value = EMAIL_PATTERN.sub(r"\1***\2", value)
        value = re.sub(r"/Users/[^\s\"']+", "[本地路径已隐藏]", value)
        return value
    return value


def load_data():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    session_rows = conn.execute(
        """
        SELECT s.*, a.fact_package, a.diagnoses, a.strategies,
               a.generated_cards, a.semantic_package, a.score, a.analyzed_at
        FROM sessions s
        LEFT JOIN analyses a ON a.session_id=s.id
        ORDER BY s.updated_at DESC
        """
    ).fetchall()
    sessions = []
    for row in session_rows:
        transcript_rows = conn.execute(
            """
            SELECT id, utterance_index, start_sec, end_sec, role, text, included,
                   status, issue_type
            FROM transcripts
            WHERE session_id=? AND version=?
            ORDER BY utterance_index
            """,
            (row["id"], row["active_version"]),
        ).fetchall()
        facts = loads(row["fact_package"], {})
        sessions.append(
            clean(
                {
                    "id": row["id"],
                    "receptionNo": row["reception_no"],
                    "store": row["store"],
                    "salesperson": row["salesperson"],
                    "customer": row["customer_name"],
                    "startAt": row["start_at"],
                    "segmentType": row["segment_type"],
                    "qualityStatus": row["quality_status"],
                    "analysisStatus": row["analysis_status"],
                    "asrStatus": row["asr_status"],
                    "source": row["transcript_source"],
                    "score": row["score"],
                    "analyzedAt": row["analyzed_at"],
                    "facts": facts,
                    "diagnoses": loads(row["diagnoses"], []),
                    "strategies": loads(row["strategies"], []),
                    "cards": loads(row["generated_cards"], []),
                    "semantic": loads(row["semantic_package"], {}),
                    "transcript": [dict(item) for item in transcript_rows],
                }
            )
        )
    conn.close()

    raw_rules = loads(RULES.read_text(encoding="utf-8"), {})
    safe_rules = clean(
        {
            "sop": raw_rules.get("sop", {}),
            "customerTags": raw_rules.get("customerTags", []),
            "customerInsightRules": raw_rules.get("customerInsightRules", {}),
            "diagnosisLayer": raw_rules.get("diagnosisLayer", {}),
            "strategyLayer": raw_rules.get("strategyLayer", {}),
            "generationLayer": raw_rules.get("generationLayer", {}),
            "feedbackLayer": raw_rules.get("feedbackLayer", {}),
            "advancedCapabilities": raw_rules.get("advancedCapabilities", {}),
            "semanticModel": raw_rules.get("semanticModel", {}),
        }
    )
    scores = [s["score"] for s in sessions if isinstance(s["score"], (int, float))]
    return {
        "meta": {
            "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "mode": "静态演示快照",
            "security": "不包含API Key、AccessKey、Secret、数据库或后端接口",
        },
        "metrics": {
            "sessions": len(sessions),
            "analyzed": len(scores),
            "utterances": sum(len(s["transcript"]) for s in sessions),
            "averageScore": round(sum(scores) / len(scores)) if scores else None,
        },
        "sessions": sessions,
        "rules": safe_rules,
    }


HTML = r'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>销售质检与客户洞察｜外发演示版</title>
<style>
:root{--blue:#155eef;--blue2:#0b4fd9;--teal:#0f9f8f;--orange:#f79009;--pink:#d63c78;--purple:#7047eb;--green:#17a34a;--ink:#182230;--muted:#667085;--line:#dfe5ec;--fill:#f4f6f8;--white:#fff;--sidebar:246px}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:"PingFang SC","Microsoft YaHei",Arial,sans-serif;color:var(--ink);background:var(--fill);letter-spacing:0}button,input,select{font:inherit}button{cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid rgba(21,94,239,.22);outline-offset:2px}.app{min-height:100vh}.sidebar{position:fixed;inset:0 auto 0 0;width:var(--sidebar);padding:18px 14px;background:#fff;border-right:1px solid var(--line);z-index:20;overflow:auto}.brand{display:flex;gap:11px;align-items:center;padding:0 8px 18px;border-bottom:1px solid var(--line)}.logo{display:grid;place-items:center;width:42px;height:42px;border-radius:7px;color:#fff;background:linear-gradient(145deg,#155eef,#11a8a0);font-size:23px;font-weight:700}.brand b{display:block;font-size:17px}.brand span{display:block;margin-top:3px;color:var(--muted);font-size:12px}.nav{display:grid;gap:4px;margin-top:16px}.nav button{display:flex;align-items:center;gap:11px;width:100%;padding:11px 12px;border:1px solid transparent;border-radius:6px;color:#475467;background:transparent;text-align:left}.nav button:hover{background:#f6f8fb}.nav button.active{color:var(--blue);border-color:#cbdcff;background:#edf4ff;font-weight:600}.navIcon{width:20px;text-align:center}.safeNote{margin-top:28px;padding:12px;border:1px solid #b7e4dc;background:#f0faf8;color:#176b62;font-size:12px;line-height:1.6}.main{margin-left:var(--sidebar);min-width:0}.topbar{position:sticky;top:0;z-index:15;display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:74px;padding:13px 28px;background:rgba(255,255,255,.96);border-bottom:1px solid var(--line);backdrop-filter:blur(10px)}.topbar h1{margin:0;font-size:22px}.topbar p{margin:4px 0 0;color:var(--muted);font-size:13px}.topActions{display:flex;gap:8px}.btn{min-height:38px;padding:8px 13px;border:1px solid #cfd7e3;border-radius:5px;color:#344054;background:#fff}.btn:hover{border-color:#9dbbfa;color:var(--blue)}.btn.primary{color:#fff;border-color:var(--blue);background:var(--blue)}.btn.primary:hover{background:var(--blue2)}.content{padding:22px 28px 42px}.page{display:none}.page.active{display:block}.notice{display:flex;align-items:start;justify-content:space-between;gap:20px;margin-bottom:18px;padding:13px 16px;border:1px solid #b9d3ff;background:#eef5ff;color:#1849a9;line-height:1.6}.notice small{color:#4971b8}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--line);background:#fff}.metric{padding:18px 20px;border-right:1px solid var(--line)}.metric:last-child{border:0}.metric span{display:block;color:var(--muted);font-size:13px}.metric strong{display:block;margin-top:7px;font-size:27px}.panel{background:#fff;border:1px solid var(--line);border-radius:6px}.panelHead{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid var(--line)}.panelHead h2,.panelHead h3{margin:0;font-size:17px}.panelHead p{margin:0;color:var(--muted);font-size:12px}.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.search{width:min(320px,100%);height:38px;padding:0 12px;border:1px solid #cfd7e3;border-radius:5px}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:13px 14px;text-align:left;border-bottom:1px solid #edf0f4;vertical-align:top;line-height:1.5;overflow-wrap:anywhere}th{color:#475467;background:#f7f8fa;font-size:12px;font-weight:600}td{font-size:13px}.clickRow{cursor:pointer}.clickRow:hover{background:#f7faff}.status{display:inline-flex;align-items:center;padding:3px 7px;border-radius:3px;font-size:11px;background:#ecfdf3;color:#027a48}.status.blue{background:#eff4ff;color:#3538cd}.status.orange{background:#fff7ed;color:#b54708}.split{display:grid;grid-template-columns:330px minmax(0,1fr);gap:16px}.sessionList{display:grid;gap:7px;max-height:calc(100vh - 190px);padding:10px;overflow:auto}.sessionItem{padding:12px;border:1px solid var(--line);background:#fff;text-align:left;border-radius:5px}.sessionItem:hover,.sessionItem.active{border-color:#8fb4ff;background:#f5f8ff}.sessionItem b,.sessionItem span{display:block}.sessionItem span{margin-top:4px;color:var(--muted);font-size:12px}.caseTop{display:flex;justify-content:space-between;gap:18px;padding:18px}.caseTop h2{margin:0 0 6px}.score{font-size:38px;color:var(--blue);font-weight:700}.tabs{display:flex;gap:3px;padding:0 18px;border-bottom:1px solid var(--line);overflow:auto}.tabs button{padding:11px 13px;border:0;border-bottom:2px solid transparent;color:#5d6b7d;background:transparent;white-space:nowrap}.tabs button.active{color:var(--blue);border-color:var(--blue);font-weight:600}.tabBody{padding:16px 18px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.resultCard{min-width:0;padding:14px;border:1px solid var(--line);border-left:4px solid var(--blue);background:#fff;border-radius:4px;text-align:left}.resultCard:hover{border-color:#a9c4fc}.resultCard.fact{border-left-color:var(--teal)}.resultCard.diag{border-left-color:var(--orange)}.resultCard.strategy{border-left-color:#3478c8}.resultCard.generated{border-left-color:var(--pink)}.resultCard h3{margin:0 0 7px;font-size:15px}.resultCard p{display:-webkit-box;margin:0;color:#5f6c7d;font-size:13px;line-height:1.65;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow-wrap:anywhere}.factsTable{display:grid;gap:10px}.factRow{padding:14px;border:1px solid var(--line);border-left:4px solid var(--teal);background:#fff}.factRowHead{display:flex;justify-content:space-between;gap:10px}.factRow h3{margin:0;font-size:15px}.factValues{display:grid;grid-template-columns:180px minmax(0,1fr);gap:7px 14px;margin-top:10px}.factValues dt{color:var(--muted);font-size:12px}.factValues dd{margin:0;line-height:1.6;overflow-wrap:anywhere}.transcriptTools{display:flex;gap:8px;align-items:center;margin-bottom:12px}.transcript{display:grid;gap:7px;max-height:650px;overflow:auto;scroll-behavior:smooth}.utterance{display:grid;grid-template-columns:60px 76px minmax(0,1fr);gap:10px;padding:10px 12px;border:1px solid #e6eaf0;background:#fff;border-radius:4px;line-height:1.55}.utterance.customer{border-left:3px solid var(--teal)}.utterance.sales{border-left:3px solid var(--purple)}.utterance.highlight{animation:flash 1.5s;border-color:var(--blue);background:#eef5ff}@keyframes flash{50%{transform:translateX(4px)}}.time{color:var(--blue);font-variant-numeric:tabular-nums}.role{font-weight:600}.empty{padding:48px;text-align:center;color:var(--muted)}.flow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:16px}.flow button{min-height:92px;padding:12px;border:1px solid var(--line);border-radius:5px;background:#fff}.flow button:hover,.flow button.active{transform:translateY(-2px);border-color:var(--blue);box-shadow:0 7px 18px rgba(36,73,135,.1)}.flow button b,.flow button span{display:block}.flow button span{margin-top:6px;color:var(--muted);font-size:12px}.reasonLayout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:14px}.reasonList{display:grid;gap:7px}.reasonList button{padding:12px;text-align:left;border:1px solid var(--line);background:#fff}.reasonList button.active{border-color:var(--blue);background:#f3f7ff}.detail{padding:18px}.detail h2{margin:0 0 8px}.kv{display:grid;grid-template-columns:150px minmax(0,1fr);gap:9px 14px;margin:15px 0}.kv b{color:#475467}.quote{margin:8px 0;padding:12px;border-left:3px solid var(--blue);background:#f7f9fc;line-height:1.65;overflow-wrap:anywhere}.quote button{float:right;border:0;color:var(--blue);background:transparent}.graphWrap{display:grid;grid-template-columns:minmax(720px,1fr) 310px;gap:14px}.graphCanvas{min-height:590px;padding:20px;overflow:auto;background-color:#fbfcfe;background-image:radial-gradient(#dce5ef 1px,transparent 1px);background-size:22px 22px;border:1px solid var(--line)}.graphGrid{display:grid;grid-template-columns:repeat(5,190px);gap:20px 38px;align-items:center;min-width:1100px}.node{position:relative;min-height:76px;padding:12px;border:1.5px solid;border-radius:6px;background:#fff;transition:.18s;text-align:left;overflow-wrap:anywhere}.node:hover,.node.active{transform:scale(1.045);box-shadow:0 10px 24px rgba(35,58,98,.15);z-index:2}.node small,.node b{display:block}.node small{margin-bottom:5px;color:var(--muted)}.node.session{border-color:var(--blue);background:#eff5ff}.node.fact{border-color:#65bfae;background:#f0fbf8}.node.sales{border-color:#9d78e8;background:#f7f3ff}.node.diag{border-color:#e7a52b;background:#fff9eb}.node.strategy{border-color:#5a94d6;background:#f1f7fd}.node.cardNode{border-color:#e274a7;background:#fff2f8}.advancedLayout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:16px}.menuList{display:grid;gap:7px}.menuList button{padding:13px;border:1px solid var(--line);background:#fff;text-align:left}.menuList button.active{color:#fff;border-color:var(--blue);background:var(--blue)}.logicSteps{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:17px 0}.logicSteps span{padding:9px 11px;border:1px solid var(--line);background:#f7f8fa}.logicSteps i{color:var(--blue);font-style:normal}.configGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.configCard{padding:15px;border:1px solid var(--line);background:#fff}.configCard h3{margin:0 0 8px;font-size:15px}.configCard p{margin:0;color:var(--muted);font-size:13px;line-height:1.65}.feedbackBar{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.feedbackBar button{padding:7px 11px;border:1px solid #cfd7e3;background:#fff;border-radius:4px}.feedbackBar button:hover{border-color:var(--blue);color:var(--blue)}.drawer{position:fixed;inset:0;z-index:50;display:none;background:rgba(17,24,39,.32)}.drawer.open{display:block}.drawerPanel{position:absolute;right:0;top:0;width:min(590px,94vw);height:100%;padding:24px;background:#fff;overflow:auto;box-shadow:-12px 0 30px rgba(20,35,60,.18)}.drawerClose{float:right;width:34px;height:34px;border:1px solid var(--line);background:#fff}.toast{position:fixed;right:22px;bottom:22px;z-index:80;padding:11px 15px;color:#fff;background:#253552;border-radius:5px;opacity:0;transform:translateY(10px);transition:.2s}.toast.show{opacity:1;transform:none}.mobileNav{display:none}
@media(max-width:1050px){:root{--sidebar:210px}.cards,.configGrid{grid-template-columns:1fr}.graphWrap{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}.metric:nth-child(2){border-right:0}.metric:nth-child(-n+2){border-bottom:1px solid var(--line)}}
@media(max-width:760px){.sidebar{display:none}.main{margin-left:0}.topbar{padding:12px 14px}.topbar p{display:none}.content{padding:14px 12px 80px}.mobileNav{position:fixed;display:flex;left:0;right:0;bottom:0;z-index:30;gap:2px;padding:7px;background:#fff;border-top:1px solid var(--line);overflow:auto}.mobileNav button{min-width:86px;padding:7px;border:0;background:transparent;color:#667085;font-size:11px}.mobileNav button.active{color:var(--blue)}.split,.reasonLayout,.advancedLayout{grid-template-columns:1fr}.sessionList{max-height:250px}.flow{grid-template-columns:repeat(2,1fr)}.factsTable,.cards{grid-template-columns:1fr}.factValues{grid-template-columns:1fr}.utterance{grid-template-columns:48px 62px minmax(0,1fr)}.topActions .btn:not(.primary){display:none}.graphCanvas{min-height:480px}.panelHead{align-items:flex-start;flex-direction:column}.tableWrap{overflow-x:auto;overscroll-behavior-inline:contain}.tableWrap table{min-width:760px}.tableWrap th:first-child,.tableWrap td:first-child{white-space:nowrap}}
</style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="brand"><div class="logo">质</div><div><b>质检与客户洞察</b><span>外发交互演示版</span></div></div>
    <nav class="nav" id="nav"></nav>
    <div class="safeNote"><b>安全演示模式</b><br>不连接后端，不包含云服务密钥。页面操作仅保存在当前浏览器。</div>
  </aside>
  <main class="main">
    <header class="topbar"><div><h1 id="pageTitle">接待会话中心</h1><p>真实分析结果的脱敏静态快照，可离线点击演示</p></div><div class="topActions"><button class="btn" onclick="exportCurrent()">导出当前结果</button><button class="btn primary" onclick="showSecurity()">外发安全说明</button></div></header>
    <div class="content">
      <section class="page active" id="page-sessions"></section>
      <section class="page" id="page-workbench"></section>
      <section class="page" id="page-results"></section>
      <section class="page" id="page-reasoning"></section>
      <section class="page" id="page-graph"></section>
      <section class="page" id="page-advanced"></section>
      <section class="page" id="page-config"></section>
    </div>
  </main>
  <nav class="mobileNav" id="mobileNav"></nav>
</div>
<div class="drawer" id="drawer"><div class="drawerPanel"><button class="drawerClose" onclick="closeDrawer()">×</button><div id="drawerBody"></div></div></div>
<div class="toast" id="toast"></div>
<script>
const DATA=__DATA__;
const pages=[
  ['sessions','接待会话中心','☷'],['workbench','单次接待工作台','⌁'],['results','质检与客户洞察','◎'],
  ['reasoning','证据与推理链','↗'],['graph','语义图谱视图','◇'],['advanced','高级功能','✦'],['config','配置逻辑说明','⚙']
];
let state={page:'sessions',sessionId:DATA.sessions[0]?.id||'',resultTab:'facts',reasonLayer:'fact',reasonIndex:0,advancedIndex:0,query:''};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmtTime=n=>`${String(Math.floor((n||0)/60)).padStart(2,'0')}:${String(Math.floor((n||0)%60)).padStart(2,'0')}`;
const objText=v=>{if(v==null||v==='')return '未提及';if(Array.isArray(v))return v.map(objText).join('、');if(typeof v==='object')return Object.entries(v).map(([k,x])=>`${k}：${objText(x)}`).join('；');return String(v)};
const clip=(v,n=120)=>{const s=objText(v);return s.length>n?s.slice(0,n)+'…':s};
function current(){return DATA.sessions.find(s=>s.id===state.sessionId)||DATA.sessions[0]}
function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)}
function openDrawer(title,html){$('#drawerBody').innerHTML=`<h2>${esc(title)}</h2>${html}`;$('#drawer').classList.add('open')}
function closeDrawer(){$('#drawer').classList.remove('open')} window.closeDrawer=closeDrawer;
$('#drawer').onclick=e=>{if(e.target.id==='drawer')closeDrawer()};
function navigate(page){state.page=page;$$('.page').forEach(x=>x.classList.toggle('active',x.id===`page-${page}`));$$('[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===page));$('#pageTitle').textContent=pages.find(x=>x[0]===page)?.[1]||'';renderPage(page);scrollTo(0,0)}
function navHtml(){return pages.map(([k,l,i])=>`<button data-page="${k}" class="${state.page===k?'active':''}" onclick="navigate('${k}')"><span class="navIcon">${i}</span>${l}</button>`).join('')}
$('#nav').innerHTML=navHtml();$('#mobileNav').innerHTML=navHtml();window.navigate=navigate;
function selectSession(id,page='workbench'){state.sessionId=id;state.resultTab='facts';state.reasonIndex=0;navigate(page)} window.selectSession=selectSession;
function metric(label,value){return `<div class="metric"><span>${label}</span><strong>${value??'—'}</strong></div>`}
function renderSessions(){const q=state.query.trim().toLowerCase();const rows=DATA.sessions.filter(s=>!q||[s.receptionNo,s.store,s.salesperson,s.customer].join(' ').toLowerCase().includes(q));$('#page-sessions').innerHTML=`
 <div class="notice"><div><b>外发演示数据快照</b><br><small>以下是本地POC在 ${esc(DATA.meta.generatedAt)} 导出的分析结果。不会调用ASR或大模型，也不会写回原系统。</small></div><span class="status blue">安全静态版</span></div>
 <div class="metrics">${metric('接待记录',DATA.metrics.sessions)}${metric('已分析',DATA.metrics.analyzed)}${metric('转写句数',DATA.metrics.utterances)}${metric('平均质检分',DATA.metrics.averageScore)}</div>
 <div class="panel" style="margin-top:16px"><div class="panelHead"><div><h2>接待会话</h2><p>点击一行进入单次工作台</p></div><div class="toolbar"><input class="search" value="${esc(state.query)}" placeholder="搜索接待编号、门店或销售" oninput="state.query=this.value;renderSessions()"><button class="btn" onclick="exportSessions()">导出列表</button></div></div>
 <div class="tableWrap"><table><thead><tr><th style="width:16%">接待编号</th><th style="width:21%">门店 / 销售</th><th style="width:13%">转写</th><th style="width:22%">分析状态</th><th style="width:10%">质检分</th><th>操作</th></tr></thead><tbody>${rows.map(s=>`<tr class="clickRow" onclick="selectSession('${s.id}')"><td><b>${esc(s.receptionNo)}</b><br><small>${esc(String(s.startAt||'').slice(0,10))}</small></td><td>${esc(s.store)}<br><small>${esc(s.salesperson)}｜${esc(s.customer)}</small></td><td><span class="status">${esc(s.asrStatus)}</span><br><small>${s.transcript.length}句</small></td><td><span class="status blue">${esc(s.analysisStatus)}</span></td><td><b>${s.score??'—'}</b></td><td><button class="btn" onclick="event.stopPropagation();selectSession('${s.id}')">查看</button></td></tr>`).join('')}</tbody></table></div></div>`}
function sessionListHtml(){return DATA.sessions.map(s=>`<button class="sessionItem ${s.id===state.sessionId?'active':''}" onclick="state.sessionId='${s.id}';renderPage(state.page)"><b>${esc(s.receptionNo)} · ${s.score??'—'}分</b><span>${esc(s.store)}｜${esc(s.salesperson)}</span><span>${s.transcript.length}句｜${esc(s.analysisStatus)}</span></button>`).join('')}
function roleTone(role){return /客户|说话人2/.test(role)?'customer':'sales'}
function transcriptHtml(s){const list=s.transcript;return `<div class="transcriptTools"><input class="search" id="transcriptSearch" placeholder="搜索转写原文"><button class="btn" onclick="filterTranscript()">搜索</button><span style="color:var(--muted);font-size:12px">完整展示 ${list.length} 句</span></div><div class="transcript" id="transcript">${list.map(u=>`<div class="utterance ${roleTone(u.role)}" id="utt-${esc(u.id)}" data-text="${esc(u.text)}"><span class="time">${fmtTime(u.start_sec)}</span><span class="role">${esc(u.role)}</span><span>${esc(u.text)}</span></div>`).join('')}</div>`}
function renderWorkbench(){const s=current();$('#page-workbench').innerHTML=`<div class="split"><aside class="panel"><div class="panelHead"><h3>接待记录</h3></div><div class="sessionList">${sessionListHtml()}</div></aside><div class="panel"><div class="caseTop"><div><h2>${esc(s.receptionNo)}</h2><span>${esc(s.store)}｜${esc(s.salesperson)}｜${esc(s.customer)}</span><div style="margin-top:9px"><span class="status">${esc(s.asrStatus)}</span> <span class="status blue">${esc(s.analysisStatus)}</span></div></div><div class="score">${s.score??'—'}<small style="font-size:12px;color:var(--muted)"> 分</small></div></div><div class="tabs"><button class="active">ASR转写与角色</button><button onclick="navigate('results')">查看分析结果</button><button onclick="navigate('reasoning')">查看证据链</button></div><div class="tabBody">${transcriptHtml(s)}</div></div></div>`}
function filterTranscript(){const q=($('#transcriptSearch')?.value||'').trim().toLowerCase();$$('#transcript .utterance').forEach(x=>x.style.display=!q||x.dataset.text.toLowerCase().includes(q)?'grid':'none')} window.filterTranscript=filterTranscript;
function evidenceHtml(items=[]){return items.length?items.map(e=>`<div class="quote"><button onclick="jumpEvidence('${esc(e.id||'')}',${Number(e.startSec??e.start_sec??timeToSec(e.timestamp))||0})">定位原文</button><b>${esc(e.timestamp||fmtTime(e.startSec||e.start_sec||0))} ${esc(e.speaker||e.role||'')}</b><br>${esc(e.quote||e.text||'')}</div>`).join(''):'<p style="color:var(--muted)">暂无可定位证据，需人工复核。</p>'}
function timeToSec(t){if(!t)return 0;const p=String(t).split(':').map(Number);return p.length===2?p[0]*60+p[1]:0}
function jumpEvidence(id,sec){closeDrawer();navigate('workbench');setTimeout(()=>{let el=id&&document.getElementById('utt-'+id);if(!el){const s=current();const near=s.transcript.reduce((a,b)=>Math.abs(b.start_sec-sec)<Math.abs(a.start_sec-sec)?b:a,s.transcript[0]);el=near&&document.getElementById('utt-'+near.id)}if(el){el.classList.add('highlight');el.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>el.classList.remove('highlight'),1800)}},80)} window.jumpEvidence=jumpEvidence;
function factData(s){const f=s.facts||{};const table=f.decisionFactTable||[];if(table.length)return table.map((x,i)=>({title:x.fieldName||x.field||x.name||`事实${i+1}`,value:x.value??x.factValue??x.result??'未提及',status:x.status||x.factStatus||'',evidence:x.evidence||[]}));const signal=f.signalFacts||f.derivedResults||f.extractedFacts||{};return Object.entries(signal).map(([k,v])=>({title:k,value:v,evidence:[]}))}
function factCard(x,i){return `<button class="resultCard fact" onclick="showFact(${i})"><h3>${esc(x.title)} ${x.status?`<span class="status">${esc(x.status)}</span>`:''}</h3><p>${esc(clip(x.value,170))}</p></button>`}
function showFact(i){const x=factData(current())[i];openDrawer(x.title,`<div class="kv"><b>事实值</b><span>${esc(objText(x.value))}</span><b>状态</b><span>${esc(x.status||'已抽取')}</span></div><h3>原文证据</h3>${evidenceHtml(x.evidence)}`)} window.showFact=showFact;
function showDiagnosis(i){const x=current().diagnoses[i];openDrawer(x.issue,`<div class="kv"><b>问题分类</b><span>${esc(x.category||'未分类')}</span><b>风险等级</b><span>${esc(x.riskLevel||'待配置')}</span><b>命中逻辑</b><span>${esc(x.reason||'规则命中')}</span><b>是否可挽回</b><span>${x.recoverable?'是':'否'}</span></div><h3>形成依据</h3>${evidenceHtml(x.evidence||[])}`)}
function showStrategy(i){const x=current().strategies[i];openDrawer(x.issue||'策略建议',`<div class="kv"><b>针对问题</b><span>${esc(x.issue||'')}</span><b>销售动作</b><span>${esc(x.nextBestAction||x.action||'待配置')}</span><b>执行时机</b><span>${esc(x.timing||'待配置')}</span><b>执行渠道</b><span>${esc(x.channel||'待配置')}</span><b>准备材料</b><span>${esc(objText(x.materials||[]))}</span><b>店长介入</b><span>${x.needManagerIntervention||x.managerIntervention?'需要':'不需要'}</span></div><h3>关联证据</h3>${evidenceHtml(x.evidenceToShow||x.evidence||[])}`)}
function showCard(i){const x=current().cards[i];const actions=x.actions||x.generationSpec?.actions||[];openDrawer(x.title||x.type,`<div class="kv"><b>卡片类型</b><span>${esc(x.type||'')}</span><b>状态</b><span>${esc(x.status||'')}</span><b>内容</b><span>${esc(x.content||'')}</span></div><h3>原文证据</h3>${evidenceHtml(x.evidence||[])}${actions.length?`<div class="feedbackBar">${actions.map(a=>`<button onclick="saveFeedback('${esc(a)}','${esc(x.id||x.title||x.type)}')">${esc(a)}</button>`).join('')}</div>`:''}`)}
window.showDiagnosis=showDiagnosis;window.showStrategy=showStrategy;window.showCard=showCard;
function renderResultBody(){const s=current();if(state.resultTab==='facts'){const f=factData(s);return `<div class="cards">${f.map(factCard).join('')||'<div class="empty">暂无事实数据</div>'}</div>`}if(state.resultTab==='diagnoses')return `<div class="cards">${s.diagnoses.map((x,i)=>`<button class="resultCard diag" onclick="showDiagnosis(${i})"><h3>${esc(x.issue)} <span class="status orange">${esc(x.riskLevel||'')}</span></h3><p>${esc(x.reason||'点击查看规则和证据')}</p></button>`).join('')||'<div class="empty">暂无诊断</div>'}</div>`;if(state.resultTab==='strategies')return `<div class="cards">${s.strategies.map((x,i)=>`<button class="resultCard strategy" onclick="showStrategy(${i})"><h3>${esc(x.issue||'策略建议')}</h3><p>${esc(x.nextBestAction||x.action||'待配置策略')}</p></button>`).join('')||'<div class="empty">暂无策略</div>'}</div>`;return `<div class="cards">${s.cards.map((x,i)=>`<button class="resultCard generated" onclick="showCard(${i})"><h3>${esc(x.type)}｜${esc(x.title||'')}</h3><p>${esc(x.content||x.status||'')}</p></button>`).join('')||'<div class="empty">暂无业务卡片</div>'}</div>`}
function setResultTab(tab){state.resultTab=tab;renderResults()} window.setResultTab=setResultTab;
function renderResults(){const s=current();const tabs=[['facts','标准事实表'],['diagnoses','SOP质检 / 销售短板'],['strategies','策略建议'],['cards','洞察与业务卡片']];$('#page-results').innerHTML=`<div class="panel"><div class="caseTop"><div><h2>${esc(s.receptionNo)} · 客户洞察与质检结果</h2><span>${esc(s.store)}｜${esc(s.salesperson)}｜分析结果需复核</span></div><div class="score">${s.score??'—'}<small style="font-size:12px;color:var(--muted)"> 分</small></div></div><div class="tabs">${tabs.map(([k,l])=>`<button class="${state.resultTab===k?'active':''}" onclick="setResultTab('${k}')">${l}</button>`).join('')}</div><div class="tabBody">${renderResultBody()}</div></div>`}
function layerItems(s,layer){if(layer==='fact')return factData(s).map(x=>({title:x.title,summary:clip(x.value),evidence:x.evidence||[],raw:x}));if(layer==='diagnosis')return s.diagnoses.map(x=>({title:x.issue,summary:x.reason,evidence:x.evidence||[],raw:x}));if(layer==='strategy')return s.strategies.map(x=>({title:x.issue||'策略',summary:x.nextBestAction||x.action,evidence:x.evidenceToShow||[],raw:x}));return s.cards.map(x=>({title:x.title||x.type,summary:x.content||x.status,evidence:x.evidence||[],raw:x}))}
function chooseReasonLayer(layer){state.reasonLayer=layer;state.reasonIndex=0;renderReasoning()} window.chooseReasonLayer=chooseReasonLayer;
function chooseReasonIndex(i){state.reasonIndex=i;renderReasoning()} window.chooseReasonIndex=chooseReasonIndex;
function renderReasoning(){const s=current(), layers=[['fact','事实层','一次抽取'],['diagnosis','诊断层','规则命中'],['strategy','策略层','策略匹配'],['card','生成层','模板生成'],['feedback','反馈层','人工事件']];const items=layerItems(s,state.reasonLayer==='feedback'?'card':state.reasonLayer);const x=items[state.reasonIndex]||items[0];$('#page-reasoning').innerHTML=`<div class="flow">${layers.map(([k,l,d])=>`<button class="${state.reasonLayer===k?'active':''}" onclick="chooseReasonLayer('${k}')"><b>${l}</b><span>${d}</span></button>`).join('')}</div><div class="reasonLayout"><div class="panel"><div class="panelHead"><h3>${layers.find(x=>x[0]===state.reasonLayer)?.[1]}结果</h3></div><div class="reasonList" style="padding:10px">${items.map((a,i)=>`<button class="${i===state.reasonIndex?'active':''}" onclick="chooseReasonIndex(${i})"><b>${esc(a.title)}</b><br><small>${esc(clip(a.summary,80))}</small></button>`).join('')||'<div class="empty">暂无数据</div>'}</div></div><div class="panel detail">${x?`<h2>${esc(x.title)}</h2><p>${esc(objText(x.summary))}</p><div class="notice"><div><b>本层形成逻辑</b><br><small>${logicForLayer(state.reasonLayer)}</small></div></div><h3>可回溯证据</h3>${evidenceHtml(x.evidence||[])}${state.reasonLayer==='feedback'?'<div class="feedbackBar"><button onclick="saveFeedback(\'确认有效\',\'当前结果\')">确认有效</button><button onclick="saveFeedback(\'需复核\',\'当前结果\')">需复核</button></div>':''}`:'<div class="empty">请选择一项结果</div>'}</div></div>`}
function logicForLayer(layer){return {fact:'人工修正转写进入一次大模型抽取，输出标准事实和证据；本外发版只展示快照。',diagnosis:'只读取标准事实表和SOP完成情况，根据问题库条件命中风险与扣分。',strategy:'根据诊断问题编码、客户约束、优先级和介入条件匹配策略库，不重新判断事实。',card:'按生成规范组织事实、诊断与策略，只负责表达，不新增业务判断。',feedback:'销售、店长或运营对结果进行采纳、驳回或复核，事件保存在当前浏览器。'}[layer]||''}
function renderGraph(){const s=current(), facts=factData(s).slice(0,5), diags=s.diagnoses.slice(0,4), strategies=s.strategies.slice(0,4), cards=s.cards.slice(0,4);const columns=[{type:'session',label:'接待会话',items:[{title:s.receptionNo,sub:`${s.store} · ${s.salesperson}`}]},{type:'fact',label:'客户与事实',items:facts.map(x=>({title:x.title,sub:clip(x.value,45)}) )},{type:'diag',label:'诊断层',items:diags.map(x=>({title:x.issue,sub:x.reason}))},{type:'strategy',label:'策略层',items:strategies.map(x=>({title:x.issue||'策略',sub:x.nextBestAction||x.action}))},{type:'cardNode',label:'生成层',items:cards.map(x=>({title:x.type,sub:x.title||x.content}))}];state.graphColumns=columns;let nodes='';const max=Math.max(...columns.map(c=>c.items.length));for(let r=0;r<max;r++)for(const c of columns){const item=c.items[r];nodes+=item?`<button class="node ${c.type}" onclick="openGraphNode('${c.type}',${r})"><small>${c.label}</small><b>${esc(item.title)}</b><small>${esc(clip(item.sub,55))}</small></button>`:'<span></span>'}$('#page-graph').innerHTML=`<div class="notice"><div><b>实例语义图谱</b><br><small>按会话 → 事实 → 诊断 → 策略 → 生成结果聚合展示。悬停节点会放大，点击可查看详情。</small></div></div><div class="graphWrap"><div class="graphCanvas"><div class="graphGrid">${nodes}</div></div><aside class="panel detail"><h2>图谱说明</h2><p>不同颜色代表不同业务层，节点来自当前会话的真实分析快照。</p><div class="kv"><b>蓝色</b><span>接待会话</span><b>绿色</b><span>客户与事实</span><b>橙色</b><span>诊断层</span><b>浅蓝色</b><span>策略层</span><b>粉色</b><span>生成层</span></div><p style="color:var(--muted)">为保证可读性，每层默认最多展示5个节点；完整结果可在质检与客户洞察页面查看。</p></aside></div>`}
function openGraphNode(type,index){const column=(state.graphColumns||[]).find(x=>x.type===type),item=column?.items?.[index];if(!item)return;openDrawer(item.title,`<p>${esc(item.sub)}</p><p style="color:var(--muted)">所在层级：${esc(column.label)}</p>`)} window.openGraphNode=openGraphNode;
const advanced=[
 {name:'败单分析',desc:'对话只产生候选原因；必须结合CRM、后续跟进或人工反馈确认真实业务结果。',steps:['事实与异议','诊断候选原因','后续业务结果','人工确认','挽回或复盘'],rule:'没有真实业务结果时只显示“候选原因”，不得把对话判断写成确定败单。'},
 {name:'下一步最佳行动',desc:'策略层直接给销售动作、时机、渠道和材料，生成层不再重复制造下一步建议。',steps:['客户事实','诊断问题','策略库匹配','优先级去重','销售采纳'],rule:'没有策略匹配时显示待配置；同一问题只保留最高优先级可执行动作。'},
 {name:'销售能力诊断',desc:'单通接待只形成能力表现；累计多通后，按稳定能力维度形成销售画像。',steps:['销售行为事实','诊断问题','能力维度映射','多通聚合','陪练与复检'],rule:'当前默认累计至少10次接待后形成画像，不用单通录音给销售定性。'},
 {name:'优秀话术挖掘',desc:'识别真实会话中的有效沟通链，不依赖单个关键词，也不让模型编造漂亮句子。',steps:['客户触发','销售有效行为结构','客户有效反应','状态正向跃迁','知识校验','店长/内训师审核','后续效果验证'],rule:'至少出现一次正向状态跃迁；必须具备“客户→销售→客户”证据链；自动入库默认关闭。'},
 {name:'客户等级与店长预警',desc:'只统计客户本人表达的语义事件，结合否定、历史语境和累计分值生成三级客户等级。',steps:['客户原话','语义事件标准化','分值累计','等级阈值','三级推送店长'],rule:'销售转述、否定表达和历史事件不计入当前高意向；三级预警需人工确认。'}
];
function selectAdvanced(i){state.advancedIndex=i;renderAdvanced()} window.selectAdvanced=selectAdvanced;
function renderAdvanced(){const x=advanced[state.advancedIndex];$('#page-advanced').innerHTML=`<div class="advancedLayout"><div class="menuList">${advanced.map((a,i)=>`<button class="${i===state.advancedIndex?'active':''}" onclick="selectAdvanced(${i})">${a.name}</button>`).join('')}</div><div class="panel detail"><h2>${x.name}</h2><p>${x.desc}</p><div class="logicSteps">${x.steps.map((a,i)=>`${i?'<i>→</i>':''}<span>${a}</span>`).join('')}</div><div class="notice"><div><b>判断边界</b><br><small>${x.rule}</small></div></div>${x.name==='优秀话术挖掘'?excellentScriptConfig():''}</div></div>`}
function excellentScriptConfig(){const c=DATA.rules.advancedCapabilities?.excellentScript||{};return `<h3>当前演示配置</h3><div class="configGrid"><div class="configCard"><h3>全局窗口</h3><p>客户触发前${c.globalWindow?.customerTriggerTurns??3}句或${c.globalWindow?.customerTriggerSeconds??60}秒；销售回应最长${c.globalWindow?.salesResponseTurns??5}句；客户反应后${c.globalWindow?.customerReactionTurns??3}句。</p></div><div class="configCard"><h3>场景目标</h3><p>${(c.sceneGoals||[]).map(x=>x.name).join('、')||'需求挖掘、产品讲解、试驾推进、价格金融、异议处理'}</p></div><div class="configCard"><h3>审核规则</h3><p>自动入库：关闭。候选需店长与内训师审核，知识冲突需产品专家复核。</p></div></div>`}
function renderConfig(){const cards=[['SOP质检','SOP动作、适用条件、扣分规则和证据要求。'],['客户洞察','标签树、枚举值、互斥规则、意向计分和未提及口径。'],['诊断层','问题库、命中条件、风险等级、可挽回和人工复核。'],['策略层','问题绑定、动作、时机、渠道、材料、优先级和店长介入。'],['生成层','业务卡片类型、模板、必填内容、禁用表述与反馈动作。'],['反馈层','销售、店长、运营可执行的采纳、审核、驳回和业务结果事件。'],['本体模型','实体、属性、关系、枚举、同义词与品牌扩展。'],['高级功能','败单、最佳行动、销售能力、优秀话术和客户等级的规则。']];$('#page-config').innerHTML=`<div class="notice"><div><b>外发版仅展示配置逻辑，不提供云服务配置入口</b><br><small>API Key、AccessKey、Secret、Webhook地址和本地环境变量均未导出。业务规则在这里以只读方式说明。</small></div><span class="status">已脱敏</span></div><div class="configGrid">${cards.map(([a,b])=>`<article class="configCard"><h3>${a}</h3><p>${b}</p></article>`).join('')}</div><div class="panel" style="margin-top:16px"><div class="panelHead"><h2>固定数据链路</h2></div><div class="tabBody"><div class="logicSteps"><span>ASR转写与角色</span><i>→</i><span>一次事实抽取</span><i>→</i><span>诊断规则</span><i>→</i><span>策略库</span><i>→</i><span>生成规范</span><i>→</i><span>反馈事件</span></div><p style="color:var(--muted)">人工修正事实后，下游诊断、策略和生成结果应全部重算；规则变化时可复用现有事实包，不再次调用大模型。</p></div></div>`}
function renderPage(page){({sessions:renderSessions,workbench:renderWorkbench,results:renderResults,reasoning:renderReasoning,graph:renderGraph,advanced:renderAdvanced,config:renderConfig}[page]||renderSessions)()}
function saveFeedback(action,target){const list=JSON.parse(localStorage.getItem('qa-demo-feedback')||'[]');list.push({session:current()?.receptionNo,action,target,time:new Date().toLocaleString()});localStorage.setItem('qa-demo-feedback',JSON.stringify(list));toast(`已在本浏览器记录：${action}`)} window.saveFeedback=saveFeedback;
function download(name,text,type='text/csv;charset=utf-8'){const blob=new Blob(['\ufeff'+text],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function csvCell(v){return `"${String(v??'').replaceAll('"','""')}"`}
function exportSessions(){download('接待会话演示数据.csv',[['接待编号','门店','销售','客户','转写句数','质检分','状态'],...DATA.sessions.map(s=>[s.receptionNo,s.store,s.salesperson,s.customer,s.transcript.length,s.score,s.analysisStatus])].map(r=>r.map(csvCell).join(',')).join('\n'));toast('已导出接待列表')}
function exportCurrent(){const s=current();if(!s)return;const rows=[['层级','名称','结果'],...factData(s).map(x=>['事实层',x.title,objText(x.value)]),...s.diagnoses.map(x=>['诊断层',x.issue,x.reason]),...s.strategies.map(x=>['策略层',x.issue,x.nextBestAction||x.action]),...s.cards.map(x=>['生成层',x.type,x.content])];download(`${s.receptionNo}_分层分析结果.csv`,rows.map(r=>r.map(csvCell).join(',')).join('\n'));toast('已导出当前结果')}
window.exportSessions=exportSessions;window.exportCurrent=exportCurrent;
function showSecurity(){openDrawer('外发安全说明',`<div class="notice"><div><b>已移除敏感配置</b><br><small>${esc(DATA.meta.security)}</small></div></div><div class="kv"><b>运行方式</b><span>浏览器本地静态运行</span><b>数据来源</b><span>生成时刻的脱敏SQLite快照</span><b>网络请求</b><span>无</span><b>反馈保存</b><span>访问者浏览器 localStorage</span><b>ASR/大模型</b><span>不调用，仅展示已有结果</span></div><p style="color:var(--muted)">注意：当前工程中的真实密钥应在正式外发前轮换；本HTML不含这些密钥。</p>`)} window.showSecurity=showSecurity;
renderPage('sessions');
</script>
</body></html>'''


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    data = load_data()
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    document = HTML.replace("__DATA__", payload)
    if SECRET_VALUE_PATTERN.search(document):
        raise RuntimeError("Export still contains a credential-like value")
    OUT.write_text(document, encoding="utf-8")
    print(json.dumps({"output": str(OUT), "size": OUT.stat().st_size, "metrics": data["metrics"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
