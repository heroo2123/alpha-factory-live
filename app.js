/* Alpha Factory — live. Renders snapshot.json; refreshes every 60 s. No libraries. */
(function () {
  "use strict";
  var REMOTE = "https://raw.githubusercontent.com/heroo2123/alpha-factory-live/data/snapshot.json";
  var API = "https://api.github.com/repos/heroo2123/alpha-factory-live/contents/snapshot.json?ref=data";
  var LOCAL = "snapshot.json";
  var REFRESH_MS = 60000, STALE_MIN = 15;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var state = { snap: null, prev: null, source: "", failed: false, seenEvents: {}, selCell: null };

  // ---------------------------------------------------------------- helpers
  function $(id) { return document.getElementById(id); }
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (attrs[k] === null || attrs[k] === undefined || attrs[k] === false) continue;
      if (k === "text") el.textContent = attrs[k];
      else if (k === "cls") el.className = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  var SVGNS = "http://www.w3.org/2000/svg";
  function s(tag, attrs, kids) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs || {}) if (attrs[k] !== null && attrs[k] !== undefined) {
      if (k === "text") el.textContent = attrs[k]; else el.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }
  function fill(el, kids) { el.textContent = ""; kids.forEach(function (k) { if (k) el.appendChild(k); }); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function fmt(v) { return isNum(v) ? v.toLocaleString("en-US") : "—"; }
  function dash(v) { return (v === null || v === undefined || v === "") ? "—" : String(v); }
  function ts(iso) { var t = iso ? Date.parse(iso) : NaN; return isNaN(t) ? null : t; }
  function ago(iso) {
    var t = ts(iso); if (t === null) return "—";
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return Math.round(s) + "s ago";
    if (s < 3600) return Math.round(s / 60) + "m ago";
    if (s < 86400) return (s / 3600).toFixed(s < 36000 ? 1 : 0) + "h ago";
    return Math.round(s / 86400) + "d ago";
  }
  function hhmm(iso) {
    var t = ts(iso); if (t === null) return "—";
    var d = new Date(t);
    var day = (Date.now() - t) > 20 * 3600 * 1000 ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " : "";
    return day + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  function get(o, path) { return path.split(".").reduce(function (a, k) { return a && a[k] !== undefined ? a[k] : null; }, o); }

  // animated number: tweens from the value previously shown in this element to the real value
  function countTo(el, value, suffix) {
    suffix = suffix || "";
    if (!isNum(value)) { el.textContent = "—"; el.dataset.v = ""; return; }
    var from = el.dataset.v !== undefined && el.dataset.v !== "" ? Number(el.dataset.v) : 0;
    el.dataset.v = String(value);
    if (reduced || from === value || !isFinite(from)) { el.textContent = fmt(value) + suffix; return; }
    var start = null, dur = 900, dec = Math.round(value) === value ? 0 : 2;
    function step(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - p, 3);
      var v = from + (value - from) * e;
      el.textContent = (p < 1 ? (dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en-US")) : fmt(value)) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function numEl(cls, value, suffix) { var el = h("span", { cls: cls }); countTo(el, value, suffix); return el; }
  // keep the same element between refreshes so counters tween from the old value
  var keep = {};
  function kept(key, cls, value, suffix) {
    var el = keep[key];
    if (!el) { el = keep[key] = h("span", { cls: cls }); }
    countTo(el, value, suffix);
    return el;
  }

  var tip = $("tip");
  function showTip(ev, title, body) {
    fill(tip, [h("b", { text: title }), h("span", { text: body })]);
    var x = (ev.touches ? ev.touches[0].clientX : ev.clientX), y = (ev.touches ? ev.touches[0].clientY : ev.clientY);
    tip.classList.add("show");
    var w = tip.offsetWidth, hgt = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x + 12)) + "px";
    tip.style.top = Math.max(8, y - hgt - 12) + "px";
  }
  function hideTip() { tip.classList.remove("show"); }
  function hover(el, title, body) {
    el.addEventListener("mousemove", function (e) { showTip(e, title, body); });
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("touchstart", function (e) { showTip(e, title, body); }, { passive: true });
    el.addEventListener("touchend", function () { setTimeout(hideTip, 1600); });
  }

  // ---------------------------------------------------------------- icons
  var ICONS = {
    plan: "M4 5h16M4 12h10M4 19h7M17 15l2 2 4-4",
    build: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
    review: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    merge: "M6 3v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9",
    qa: "M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10",
    release: "M12 2s4 3 4 9l-2 4h-4l-2-4c0-6 4-9 4-9zM10 15l-2 5 4-2 4 2-2-5M12 8.5v.01",
    shadow: "M3 12h3l3-7 4 14 3-7h5"
  };
  function icon(key) {
    return s("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
      [s("path", { d: ICONS[key] || ICONS.plan })]);
  }

  // ---------------------------------------------------------------- live pill
  function renderLive() {
    var el = $("live"), snap = state.snap;
    var t = snap ? ts(snap.generated_at) : null;
    var mins = t === null ? null : (Date.now() - t) / 60000;
    el.className = "livepill " + (!snap ? "off" : state.failed ? "stale" : mins !== null && mins > STALE_MIN ? "stale" : "ok");
    el.querySelector(".word").textContent = !snap ? "OFFLINE" : (mins !== null && mins > STALE_MIN) ? "DELAYED" : state.failed ? "RETRYING" : "LIVE";
    el.querySelector(".age").textContent = snap ? "data " + ago(snap.generated_at) : "";
    el.title = snap ? "Snapshot generated " + new Date(t).toUTCString() + (state.source ? " · via " + state.source : "") : "No data yet";
    $("gen-at").textContent = snap ? "Snapshot " + ago(snap.generated_at) : "Snapshot —";
  }

  // ---------------------------------------------------------------- sections
  function renderKpis(snap) {
    var f = snap.factory || {}, a = snap.alpha || {}, r = a.readiness || {}, sh = f.self_healing || {};
    var working = (f.workers || []).filter(function (w) { return w.state === "working"; }).length + ((f.qa || {}).running ? 1 : 0);
    var heals = [get(sh, "guardian.recoveries_24h"), get(sh, "operator.runs_24h")].filter(isNum);
    var items = [
      ["merges", "Merged in the last 24 h", f.flow && f.flow.merges_24h, "", "reviewed changes integrated"],
      ["tests", "Tests passing", f.tests_passing, "", (f.qa && f.qa.last_failed === 0) ? "last full run fully green" : (f.qa && isNum(f.qa.last_failed) ? f.qa.last_failed + " failing in last full run" : "")],
      ["ready", "Readiness criteria", r.accepted, null, "of " + dash(r.total) + " accepted before funding"],
      ["work", "Workers active now", working, "", "AI builders, reviewers and test runner"],
      ["heal", "Self-healing actions 24 h", heals.length ? heals.reduce(function (x, y) { return x + y; }, 0) : null, "", "guardian recoveries + operator AI runs"]
    ];
    fill($("kpis"), items.map(function (it) {
      var v = kept("kpi-" + it[0], "", it[2]);
      var val = h("div", { cls: "k-value" }, [v]);
      if (it[0] === "ready") val.appendChild(h("small", { text: " / " + dash(r.total) }));
      return h("div", { cls: "kpi" }, [h("div", { cls: "k-label", text: it[1] }), val, h("div", { cls: "k-sub", text: it[4] || "" })]);
    }));
  }

  function renderStations(snap) {
    var st = (snap.factory || {}).stations || [];
    fill($("stations"), st.map(function (x) {
      var kids = [h("span", { cls: "s-state", title: x.active ? "active" : "idle" }), h("div", { cls: "ic" }, [icon(x.key)]), h("div", { cls: "s-name", text: x.name })];
      if (x.key === "qa") {
        var pct = isNum(x.count) ? x.count : 0, C = 2 * Math.PI * 22;
        var ring = s("svg", { "class": "ring", viewBox: "0 0 54 54", role: "img", "aria-label": isNum(x.count) ? "Full test run " + x.count + "% done" : "No full test run in progress" }, [
          s("circle", { "class": "bg", cx: 27, cy: 27, r: 22, fill: "none", "stroke-width": 5 }),
          s("circle", { "class": "fg", cx: 27, cy: 27, r: 22, fill: "none", "stroke-width": 5, "stroke-linecap": "round", "stroke-dasharray": C, "stroke-dashoffset": C * (1 - pct / 100), transform: "rotate(-90 27 27)" }),
          s("text", { x: 27, y: 31, "text-anchor": "middle", style: "font:600 12px var(--sans);fill:var(--ink)", text: isNum(x.count) ? x.count + "%" : "—" })
        ]);
        kids.push(ring);
      } else if (isNum(x.count)) {
        kids.push(h("div", { cls: "s-countbox" }, [h("div", { cls: "s-count" }, [kept("st-" + x.key, "", x.count)]), h("div", { cls: "s-unit", text: x.unit || "" })]));
      } else {
        kids.push(h("div", { cls: "s-countbox" }, [h("div", { cls: "s-count", text: x.active ? "●" : "○", style: "font-size:18px;color:" + (x.active ? "var(--good-ink)" : "var(--muted)") }),
          h("div", { cls: "s-unit", text: x.active ? "online" : "standing by" })]));
      }
      kids.push(h("div", { cls: "s-detail", text: x.detail || "" }));
      if (isNum(x.count) && x.key !== "qa") {
        var n = Math.min(x.count, 30), toks = [];
        for (var i = 0; i < n; i++) toks.push(h("i", { cls: "tok" }));
        if (x.count > n) toks.push(h("span", { cls: "tok-more", text: "+" + (x.count - n) }));
        kids.push(h("div", { cls: "tokens", "aria-hidden": "true" }, toks));
      }
      return h("div", { cls: "station" + (x.active ? " active" : ""), title: x.name + (isNum(x.count) ? ": " + x.count + " " + (x.unit || "") : "") }, kids);
    }));
  }

  function renderWorkers(snap) {
    var f = snap.factory || {}, qa = f.qa || {};
    var cards = (f.workers || []).map(function (w) {
      var on = w.state === "working";
      return h("div", { cls: "worker " + (on ? "on" : "off") }, [
        h("div", { cls: "w-top" }, [h("span", { text: w.slot }), h("span", { cls: "st", text: on ? "working" : w.state === "waiting" ? "waiting" : "idle" })]),
        h("div", { cls: "w-model", text: on ? (w.model || "AI model") : (w.role === "review" ? "Waiting for a finished build" : "Waiting for the next task") }),
        on && w.family ? h("div", { cls: "w-fam", text: w.family + " model" }) : null,
        on ? h("div", { cls: "w-task", text: (w.role === "review" ? "Reviewing: " : "Building: ") + (w.task || "a task") }) : null,
        on && isNum(w.elapsed_min) ? h("div", { cls: "w-time", text: w.elapsed_min + " min on this task" + (w.task_id ? " · " + w.task_id : "") }) : null
      ]);
    });
    var pct = isNum(qa.progress_pct) ? qa.progress_pct : null;
    cards.push(h("div", { cls: "worker qa " + (qa.running ? "on" : "off") }, [
      h("div", { cls: "w-top" }, [h("span", { text: "Test runner" }), h("span", { cls: "st", text: qa.running ? "running" : "idle" })]),
      h("div", { cls: "w-model", text: qa.running ? "Full regression suite" : "Between full runs" }),
      h("div", { cls: "w-fam", text: "deterministic, no AI" }),
      qa.running ? h("div", { cls: "bar" }, [h("i", { style: "width:" + (pct || 0) + "%" })]) : null,
      h("div", { cls: "w-time", text: qa.running ? (pct !== null ? pct + "% complete" : "running") : "last run " + ago(qa.last_finished_at) })
    ]));
    fill($("workers"), cards);
  }

  function renderThroughput(snap) {
    var fl = (snap.factory || {}).flow || {}, data = fl.commits_by_hour || [];
    var box = $("throughput");
    if (!data.length) { fill(box, [h("p", { cls: "muted", text: "—" })]); }
    else {
      var W = Math.max(300, Math.round(box.clientWidth || 560)), H = 150, L = 26, B = 22, T = 10, max = Math.max.apply(null, data.concat([1]));
      var top = Math.ceil(max / 2) * 2, bw = (W - L) / data.length;
      var svg = s("svg", { "class": "chart", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Commits landed per hour over the last 24 hours" });
      [0, top / 2, top].forEach(function (g) {
        var y = T + (H - T - B) * (1 - g / top);
        svg.appendChild(s("line", { "class": g === 0 ? "axis" : "grid", x1: L, x2: W, y1: y, y2: y }));
        svg.appendChild(s("text", { "class": "t-muted", x: L - 6, y: y + 4, "text-anchor": "end", text: String(g) }));
      });
      var now = Date.now();
      data.forEach(function (v, i) {
        var hgt = (H - T - B) * (v / top), x = L + i * bw + 1, y = T + (H - T - B) - hgt;
        var g = s("g", { "class": "col" });
        if (v > 0) {
          var r = Math.min(4, hgt / 2, (bw - 2) / 2);
          var d = "M" + x + "," + (y + hgt) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + bw - 2 - r) + "Q" + (x + bw - 2) + "," + y + " " + (x + bw - 2) + "," + (y + r) + "V" + (y + hgt) + "Z";
          g.appendChild(s("path", { "class": "mark", d: d, fill: "var(--s1)" }));
        }
        var hit = s("rect", { "class": "hit", x: L + i * bw, y: T, width: bw, height: H - T - B });
        g.appendChild(hit);
        var hrsAgo = data.length - 1 - i;
        var end = new Date(now - hrsAgo * 3600000);
        hover(hit, v + " commit" + (v === 1 ? "" : "s"), hrsAgo === 0 ? "in the last hour" : hrsAgo + "–" + (hrsAgo + 1) + " hours ago (to " + end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) + ")");
        svg.appendChild(g);
      });
      svg.appendChild(s("text", { "class": "t-muted", x: L, y: H - 5, text: "24 h ago" }));
      svg.appendChild(s("text", { "class": "t-muted", x: W, y: H - 5, "text-anchor": "end", text: "now" }));
      fill(box, [svg]);
    }
    var mini = [["Built", fl.built_24h], ["Build retries", fl.build_failed_24h], ["Reviews passed", fl.reviews_passed_24h], ["Changes asked", fl.reviews_changes_24h]];
    fill($("flowmini"), mini.map(function (m, i) { return h("div", null, [h("b", null, [kept("fm" + i, "", m[1])]), h("span", { text: m[0] + " · 24 h" })]); }));
  }

  function renderMerges(snap) {
    var f = snap.factory || {}, m = f.recent_merges || [];
    $("merge-hold").textContent = (f.flow && f.flow.merge_holds && f.flow.merge_holds.length) ? "queue: " + f.flow.merge_holds[0] : "";
    fill($("merges"), m.length ? m.map(function (x) {
      return h("li", null, [h("span", { cls: "when", text: hhmm(x.at) }), h("span", { cls: "what", text: x.title }), h("span", { cls: "area", text: x.area })]);
    }) : [h("li", null, [h("span", { cls: "what muted", text: "—" })])]);
  }

  function statusEl(tone, text) {
    var ic = { good: "●", warn: "▲", bad: "■", neutral: "○" }[tone] || "○";
    return h("span", { cls: "status " + tone }, [h("span", { cls: "ico", "aria-hidden": "true", text: ic }), h("span", { text: text })]);
  }

  function renderHeal(snap) {
    var sh = (snap.factory || {}).self_healing || {}, g = sh.guardian || {}, fa = sh.flow_auditor || {}, op = sh.operator || {};
    var sev = fa.by_severity || {};
    var faTone = (sev.P0 || 0) > 0 ? "bad" : (fa.active || 0) > 0 ? "warn" : "good";
    fill($("heal"), [
      h("div", { cls: "panel" }, [
        h("h3", null, ["Guardian", h("span", { cls: "hint", text: g.interval || "" })]),
        statusEl(g.state === "healthy" ? "good" : g.state ? "warn" : "neutral", g.state ? (g.state === "healthy" ? "Healthy" : g.state) + " · " + dash(g.active) + " open" : "—"),
        h("div", { cls: "h-val", style: "margin-top:8px" }, [kept("g-rec", "", g.recoveries_24h)]),
        h("div", { cls: "h-sub", text: "recoveries confirmed in 24 h (" + dash(g.alerts_24h) + " alerts raised)" }),
        h("div", { cls: "h-meta", text: "Watchdog: restarts stuck jobs, alerts the owner. Last check " + ago(g.last_check_at) })
      ]),
      h("div", { cls: "panel" }, [
        h("h3", null, ["Flow auditor", h("span", { cls: "hint", text: fa.interval || "" })]),
        statusEl(faTone, isNum(fa.active) ? (fa.active === 0 ? "No open incidents" : fa.active + " open incident" + (fa.active === 1 ? "" : "s")) : "—"),
        h("div", { cls: "h-val", style: "margin-top:8px" }, [kept("fa-n", "", fa.active)]),
        h("div", { cls: "h-sub", text: "P0 " + dash(sev.P0) + " · P1 " + dash(sev.P1) + " · P2 " + dash(sev.P2) + ((fa.codes && fa.codes.length) ? " · " + fa.codes.join(", ") : "") }),
        h("div", { cls: "h-meta", text: "Follows work through every stage and flags anything that stalls. Last check " + ago(fa.last_check_at) })
      ]),
      h("div", { cls: "panel" }, [
        h("h3", null, ["Operator AI", h("span", { cls: "hint", text: op.model || "" })]),
        statusEl(op.running ? "warn" : op.last_ok === true ? "good" : op.last_ok === false ? "bad" : "neutral", op.running ? "Investigating now" : op.last_ok === true ? "Last run succeeded" : op.last_ok === false ? "Last run failed" : "—"),
        h("div", { cls: "h-val", style: "margin-top:8px" }, [kept("op-n", "", op.runs_24h)]),
        h("div", { cls: "h-sub", text: "audit and repair runs in 24 h (" + dash(op.runs_total) + " total)" }),
        h("div", { cls: "h-meta", text: "Last run " + ago(op.last_run_at) + (op.last_kind ? " · " + op.last_kind : "") + ". " + (op.interval || "") })
      ])
    ]);
  }

  function renderEvents(snap) {
    var ev = (snap.factory || {}).events || [];
    var first = Object.keys(state.seenEvents).length === 0;
    fill($("events"), ev.length ? ev.slice(0, 14).map(function (e) {
      var key = e.at + e.text, fresh = !first && !state.seenEvents[key];
      state.seenEvents[key] = 1;
      return h("li", { cls: fresh ? "fresh" : "" }, [h("span", { cls: "k " + e.kind }), h("span", { cls: "when", text: hhmm(e.at) }), h("span", { cls: "what", text: e.text })]);
    }) : [h("li", null, [h("span", { cls: "what muted", text: "—" })])]);
    // ticker: duplicated once so the marquee loops seamlessly
    var items = ev.slice(0, 20).map(function (e) { return h("span", { cls: "item" }, [h("b", { text: hhmm(e.at) }), e.text]); });
    var track = $("ticker");
    if (!items.length) { fill(track, [h("span", { cls: "item muted", text: "No events yet" })]); return; }
    fill(track, items.concat(reduced ? [] : items.map(function (n) { var c = n.cloneNode(true); c.setAttribute("aria-hidden", "true"); return c; })));
  }

  function renderProviders(snap) {
    var p = (snap.factory || {}).providers || [];
    fill($("providers"), p.length ? p.map(function (n) { return h("span", { cls: "chip" }, [h("i"), n]); }) : [h("span", { cls: "muted", text: "—" })]);
  }

  function renderQa(snap) {
    var qa = (snap.factory || {}).qa || {};
    fill($("qa"), [
      statusEl(qa.running ? "warn" : qa.last_green ? "good" : "bad", qa.running ? "Full run in progress" + (isNum(qa.progress_pct) ? " · " + qa.progress_pct + "%" : "") : qa.last_green ? "Last full run green" : "Last full run not green"),
      h("div", { cls: "mini" }, [
        h("div", null, [h("b", null, [kept("qa-p", "", qa.last_passed)]), h("span", { text: "passed" })]),
        h("div", null, [h("b", null, [kept("qa-f", "", qa.last_failed)]), h("span", { text: "failed" })]),
        h("div", null, [h("b", null, [kept("qa-s", "", qa.last_skipped)]), h("span", { text: "skipped" })]),
        h("div", null, [h("b", { text: isNum(qa.last_minutes) ? qa.last_minutes + " min" : "—" }), h("span", { text: "run time" })])
      ]),
      h("p", { cls: "note", text: "Last finished " + ago(qa.last_finished_at) + " · last fully green " + ago(qa.last_green_at) + ". Every merge also re-runs targeted tests first." })
    ]);
  }

  // ---------------------------------------------------------------- Alpha
  function renderShadow(snap) {
    var a = snap.alpha || {}, sh = a.shadow || {}, sc = sh.scanner || {};
    var on = sh.service === "running";
    fill($("shadow"), [
      h("h3", null, ["Shadow", h("span", { cls: "hint", text: "paper trading service" })]),
      h("div", { cls: "big-state" }, [h("div", { cls: "radar" + (on ? "" : " off"), "aria-hidden": "true" }), h("div", null, [
        h("div", { cls: "t1", text: on ? "Running · paper only" : sh.service ? "Shadow " + sh.service : "—" }),
        h("div", { cls: "t2", text: sh.state ? "Now: " + sh.state : "" }),
        h("div", { cls: "t2 muted", text: "Heartbeat " + ago(sh.heartbeat_at) + (sh.release ? " · release " + sh.release + " live since " + hhmm(sh.commissioned_at) : "") })
      ])]),
      h("div", { cls: "facts" }, [
        h("div", null, [h("b", { text: sh.real_orders_sent === false ? "None" : sh.real_orders_sent === true ? "YES" : "—" }), h("span", { text: "real orders sent" })]),
        h("div", null, [h("b", { text: sh.trading_executor_locked ? "Locked" : "—" }), h("span", { text: "trading executor" })]),
        h("div", null, [h("b", null, [kept("sh-days", "", sh.days_with_market_data)]), h("span", { text: "days of market data" })]),
        h("div", null, [h("b", null, [kept("sh-ev", "", sc.weather_events)]), h("span", { text: "weather events scanned" })]),
        h("div", null, [h("b", null, [kept("sh-mk", "", sc.markets)]), h("span", { text: "markets watched" })]),
        h("div", null, [h("b", null, [kept("sh-op", "", sc.opportunities)]), h("span", { text: "opportunities this scan" })])
      ]),
      h("p", { cls: "note", text: "Last market scan " + ago(sc.last_scan_at) + ". The Shadow runs the same code a funded bot would, but cannot place orders." })
    ]);
    var d = a.decisions || {};
    fill($("decisions"), [["Total", d.total], ["Research picks", d.research_accept], ["Rejected", d.reject], ["Gated", d.gated]].map(function (x, i) {
      return h("div", null, [h("b", null, [kept("dec" + i, "", x[1])]), h("span", { text: x[0] })]);
    }));
    $("decision-note").textContent = (isNum(d.total) && d.total === 0 ? "No paper decisions yet on this release: " + (sh.state || "waiting") + ". " : "") +
      "Days with paper decisions: " + dash(sh.days_with_paper_decisions) + ". " + (d.note ? d.note.charAt(0).toUpperCase() + d.note.slice(1) + "." : "");
  }

  var FEED_WORD = { live: "Live", stale: "Stale", missing: "No signal", configured: "Configured", building: "Being built", merged: "Merged, not live yet" };
  function renderFeeds(snap) {
    var feeds = (snap.alpha || {}).weather || [];
    fill($("feedkey"), ["live", "stale", "configured", "building", "merged"].map(function (k) { return h("span", null, [h("span", { cls: "lamp " + k, style: "margin:0;animation:none" }), FEED_WORD[k]]); }));
    fill($("feeds"), feeds.length ? feeds.map(function (f) {
      return h("div", { cls: "feed" }, [h("span", { cls: "lamp " + f.health, title: FEED_WORD[f.health] || f.health }), h("div", { style: "min-width:0" }, [
        h("div", { cls: "f-name", text: f.name }), h("div", { cls: "f-role", text: f.role }),
        h("div", { cls: "f-det", text: (FEED_WORD[f.health] || "") + (f.updated_at ? " · " + ago(f.updated_at) : "") + (f.detail ? " · " + f.detail : "") })
      ])]);
    }) : [h("p", { cls: "muted", text: "—" })]);
  }

  var SERIES = { brain: "var(--s1)", market: "var(--s2)", challenger: "var(--s3)", equal: "var(--s-neutral)" };
  function renderBrain(snap) {
    var b = (snap.alpha || {}).brain || {}, sc = (b.scores || []).filter(function (x) { return isNum(x.brier); });
    $("brain-n").textContent = b.metric || "";
    fill($("brain-legend"), (b.scores || []).map(function (x) { return h("span", null, [h("i", { style: "background:" + (SERIES[x.key] || "var(--muted)") }), x.name]); }));
    var box = $("brain-chart");
    if (!sc.length) { fill(box, [h("p", { cls: "muted", text: "Brain scores not available —" })]); }
    else {
      var narrow = box.clientWidth && box.clientWidth < 460;
      var W = Math.max(300, Math.round(box.clientWidth || 560)), rowH = narrow ? 44 : 40, T = 8, B = 28, L = narrow ? 8 : 150, R = 54, H = T + sc.length * rowH + B;
      var max = Math.max(1.2, Math.ceil(Math.max.apply(null, sc.map(function (x) { return x.brier; })) * 4) / 4);
      var X = function (v) { return L + (W - L - R) * v / max; };
      var svg = s("svg", { "class": "chart", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Brier score by forecaster; lower is better" });
      for (var g = 0; g <= max + 1e-9; g += 0.25) {
        svg.appendChild(s("line", { "class": g === 0 ? "axis" : "grid", x1: X(g), x2: X(g), y1: T, y2: H - B }));
        svg.appendChild(s("text", { "class": "t-muted", x: X(g), y: H - B + 16, "text-anchor": "middle", text: g.toFixed(2).replace(/0$/, "") }));
      }
      var market = sc.filter(function (x) { return x.key === "market"; })[0];
      sc.forEach(function (x, i) {
        var y = T + i * rowH, barY = narrow ? y + 20 : y + 12, bh = narrow ? 12 : 16;
        var gEl = s("g", { "class": "row" });
        gEl.appendChild(s("text", { x: narrow ? L : L - 10, y: narrow ? y + 14 : barY + bh / 2 + 4, "text-anchor": narrow ? "start" : "end", "class": "t-ink", text: x.name }));
        var x1 = X(0), x2 = X(x.brier), r = Math.min(4, bh / 2);
        var d = "M" + x1 + "," + barY + "H" + (x2 - r) + "Q" + x2 + "," + barY + " " + x2 + "," + (barY + r) + "V" + (barY + bh - r) + "Q" + x2 + "," + (barY + bh) + " " + (x2 - r) + "," + (barY + bh) + "H" + x1 + "Z";
        gEl.appendChild(s("path", { "class": "mark", d: d, fill: SERIES[x.key] || "var(--muted)" }));
        gEl.appendChild(s("text", { x: x2 + 8, y: barY + bh / 2 + 4, text: x.brier.toFixed(3) }));
        var hit = s("rect", { "class": "hit", x: 0, y: y, width: W, height: rowH });
        gEl.appendChild(hit);
        hover(hit, x.name, "Brier " + x.brier.toFixed(3) + " over " + dash(x.city_days) + " city-days" + (market && x.key !== "market" ? (x.brier < market.brier ? " · better than the market" : " · worse than the market") : ""));
        svg.appendChild(gEl);
      });
      if (market) {
        svg.appendChild(s("line", { x1: X(market.brier), x2: X(market.brier), y1: T, y2: H - B, stroke: "var(--s2)", "stroke-dasharray": "3 4", "stroke-width": 1.5, opacity: 0.8 }));
      }
      fill(box, [svg]);
    }
    fill($("brain-verdict"), b.verdict ? [h("div", { cls: "verdict " + (b.verdict_tone || "neutral") }, [statusEl(b.verdict_tone === "good" ? "good" : b.verdict_tone === "bad" ? "bad" : "warn", b.verdict)])] : []);
    fill($("brain-mini"), [["Labelled city-days", b.labelled_city_days], ["Waiting for results", b.waiting_city_days], ["Labelled days", b.labelled_days], ["Stations", b.stations]].map(function (m, i) {
      return h("div", null, [h("b", null, [kept("bm" + i, "", m[1])]), h("span", { text: m[0] })]);
    }));
    var fb = b.funding_bar || [];
    fill($("fundbar"), fb.length ? fb.map(function (x) {
      var pct = isNum(x.have) && isNum(x.need) && x.need > 0 ? Math.min(100, 100 * x.have / x.need) : 0;
      return h("div", { cls: "fbar" + (x.done ? " done" : "") }, [
        h("div", { cls: "f-head" }, [statusEl(x.done ? "good" : "warn", x.item), h("b", { text: isNum(x.have) && isNum(x.need) ? x.have + " / " + x.need : (x.done ? "met" : "—") })]),
        h("div", { cls: "bar" }, [h("i", { style: "width:" + pct + "%" })]),
        x.detail ? h("div", { cls: "f-note", text: x.detail }) : null
      ]);
    }).concat([h("p", { cls: "note", text: "The model is never promoted automatically" + (b.calibrated ? "" : " and is not calibrated yet") + ". A research challenger is " + (b.challenger_trained ? "trained and being scored on new days." : "not trained yet.") })]) : [h("p", { cls: "muted", text: "—" })]);
    var sk = (snap.alpha || {}).skills || [];
    fill($("skills"), sk.length ? sk.slice(0, 8).map(function (x) {
      return h("li", null, [h("span", { cls: "when", text: hhmm(x.merged_at) }), h("span", { cls: "what", text: x.title }), h("span", { cls: "area", text: x.area })]);
    }) : [h("li", null, [h("span", { cls: "what muted", text: "—" })])]);
  }

  function renderReadiness(snap) {
    var r = (snap.alpha || {}).readiness || {}, cells = r.cells || [];
    $("ready-sum").textContent = isNum(r.accepted) ? r.accepted + " of " + dash(r.total) + " accepted" : "—";
    var detail = $("cell-detail");
    function pick(c, btn) {
      state.selCell = c.id;
      Array.prototype.forEach.call(document.querySelectorAll(".cell.sel"), function (n) { n.classList.remove("sel"); });
      if (btn) btn.classList.add("sel");
      fill(detail, [h("b", { text: c.id }), c.name + " — " + c.detail + (isNum(c.merged_tasks) ? " · " + c.merged_tasks + " task" + (c.merged_tasks === 1 ? "" : "s") + " merged" : "") + (c.open_tasks ? ", " + c.open_tasks + " in progress" : "")]);
    }
    fill($("ready"), (r.groups || []).map(function (g) {
      var mine = cells.filter(function (c) { return c.group === g.name; });
      return h("div", { cls: "rg" }, [
        h("h4", null, [g.label, h("span", { text: (g.accepted + g.owner) + "/" + g.total })]),
        h("div", { cls: "cells" }, mine.map(function (c) {
          var btn = h("button", { cls: "cell " + c.status + (state.selCell === c.id ? " sel" : ""), type: "button", "aria-label": c.id + " " + c.name + ": " + c.detail, text: c.id.split("-")[1] });
          btn.addEventListener("click", function () { pick(c, btn); });
          hover(btn, c.id + " · " + c.name, c.detail);
          return btn;
        }))
      ]);
    }));
    var sel = cells.filter(function (c) { return c.id === state.selCell; })[0];
    if (sel) pick(sel, document.querySelector(".cell.sel"));
  }

  function renderPath(snap) {
    var a = snap.alpha || {}, steps = a.funding_path || [];
    $("fund-verdict").textContent = a.ready_to_fund ? "ready for the owner's decision" : "not ready to fund yet";
    fill($("path"), steps.map(function (x, i) {
      return h("li", { cls: x.state }, [h("div", { cls: "node", text: x.state === "done" ? "✓" : String(i + 1) }), h("div", { cls: "p-step", text: x.step }),
        h("div", { cls: "p-state", text: x.state === "done" ? "done" : x.state === "active" ? "in progress" : "waiting" }), h("div", { cls: "p-det", text: x.detail || "" })]);
    }));
  }

  function render() {
    var snap = state.snap;
    renderLive();
    if (!snap) return;
    [renderKpis, renderStations, renderWorkers, renderThroughput, renderMerges, renderHeal, renderEvents, renderProviders, renderQa,
      renderShadow, renderFeeds, renderBrain, renderReadiness, renderPath].forEach(function (fn) {
      try { fn(snap); } catch (e) { if (window.console) console.error(fn.name, e); }
    });
    $("foot-src").textContent = "Data: " + (state.source || "—") + " · schema " + dash(snap.schema) + " · generated " + dash(snap.generated_at);
  }

  // ---------------------------------------------------------------- data
  function fetchJson(url, headers) {
    return fetch(url, { cache: "no-store", headers: headers || {} }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) { if (!j || typeof j !== "object" || !j.factory) throw new Error("bad snapshot"); return j; });
  }
  function newer(a, b) { return !b || (ts(a.generated_at) || 0) >= (ts(b.generated_at) || 0); }
  function load() {
    var bust = "?t=" + Date.now();
    return fetchJson(REMOTE + bust).then(function (j) { return [j, "live data branch"]; })
      .catch(function () { return fetchJson(API, { Accept: "application/vnd.github.raw+json" }).then(function (j) { return [j, "GitHub API"]; }); })
      .catch(function () { return fetchJson(LOCAL + bust).then(function (j) { return [j, "page copy (may be older)"]; }); })
      .then(function (res) {
        state.failed = false;
        if (newer(res[0], state.snap)) { state.prev = state.snap; state.snap = res[0]; state.source = res[1]; }
        $("err").className = "err";
        render();
      })
      .catch(function () {
        state.failed = true;
        var e = $("err");
        e.textContent = state.snap ? "Could not refresh — showing the last reading. Retrying every minute." : "Could not load the factory snapshot yet. Retrying every minute.";
        e.className = "err show";
        renderLive();
      });
  }

  // ---------------------------------------------------------------- theme
  var THEMES = ["auto", "dark", "light"];
  function currentTheme() { return document.documentElement.getAttribute("data-theme") || "auto"; }
  function setTheme(t) {
    if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
    try { if (t === "auto") localStorage.removeItem("af-theme"); else localStorage.setItem("af-theme", t); } catch (e) {}
    document.querySelector("#theme .lbl").textContent = t.charAt(0).toUpperCase() + t.slice(1);
    $("theme").setAttribute("aria-label", "Colour theme: " + t + ". Click to change.");
  }
  $("theme").addEventListener("click", function () { setTheme(THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length]); });
  setTheme(currentTheme());

  var resizeT;
  window.addEventListener("resize", function () { clearTimeout(resizeT); resizeT = setTimeout(function () { if (state.snap) { renderBrain(state.snap); renderThroughput(state.snap); } }, 200); });
  load();
  setInterval(load, REFRESH_MS);
  setInterval(renderLive, 15000);
})();
