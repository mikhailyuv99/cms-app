/* ============================================================
   CMS Embed — Universal CMS editing + rendering script
   Loaded by client sites from the CMS server.
   All editing logic lives here so bug fixes propagate
   automatically to every client site.

   GENERIC: discovers editable elements via data-cms-* attributes.
   No hardcoded section names — works with any site structure.

   PostMessage: CMS_READY, CMS_CONTENT, CMS_PATCH, CMS_PAGE,
   CMS_UPLOAD_REQUEST, CMS_SAVE
   ============================================================ */
(function () {
  "use strict";

  if (window.__cmsEmbedLoaded) return;
  window.__cmsEmbedLoaded = true;

  var params = new URLSearchParams(window.location.search);
  var isCms = params.get("cmsEmbed") === "1";
  var ORIGIN = window.location.origin;
  var cmsParentOrigin = params.get("parentOrigin") || null;

  var ICON_MOVE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';
  var ICON_UPLOAD = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
  var ICON_IMAGE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
  var ICON_CROP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v6"/><path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>';

  function resolveUrl(raw) {
    if (!raw) return "";
    if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
    try { return new URL(raw, ORIGIN + "/").href; } catch (_) { return raw; }
  }
  function normalizeOrigin(o) {
    try { var u = new URL(o); var h = u.hostname === "127.0.0.1" ? "localhost" : u.hostname; return u.protocol + "//" + h + (u.port ? ":" + u.port : ""); } catch (_) { return o; }
  }
  function originOk(i) { return !cmsParentOrigin || normalizeOrigin(i) === normalizeOrigin(cmsParentOrigin); }
  function postToParent(msg) {
    if (!isCms) return;
    var t = cmsParentOrigin || "*";
    try { window.parent.postMessage(msg, t); } catch (_) { try { window.parent.postMessage(msg, "*"); } catch (__) {} }
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function esc(s) { var d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

  var content = null;
  var currentSlug = params.get("page") || "index";
  var META_KEYS = { sectionOrder: 1, sectionSizes: 1, theme: 1, pageOrder: 1, pages: 1 };

  /* ── nav ── */
  var navEl = document.getElementById("site-nav");
  function activateNav() {
    if (!content || !content.pages) return;
    if (navEl) navEl.hidden = false;
    document.querySelectorAll(".site-nav__link").forEach(function (a) { a.classList.toggle("active", a.dataset.page === currentSlug); });
  }
  if (navEl) navEl.addEventListener("click", function (e) {
    var link = e.target.closest(".site-nav__link"); if (!link) return; e.preventDefault();
    var slug = link.dataset.page;
    if (slug && slug !== currentSlug) { currentSlug = slug; renderPage(pageData(slug)); activateNav(); window.scrollTo({ top: 0, behavior: "smooth" }); postToParent({ type: "CMS_PAGE", source: "cms-site", slug: slug }); }
  });
  window.addEventListener("hashchange", function () {
    var slug = window.location.hash.replace("#", "") || "index";
    if (content && content.pages && content.pages[slug] && slug !== currentSlug) { currentSlug = slug; renderPage(pageData(slug)); activateNav(); postToParent({ type: "CMS_PAGE", source: "cms-site", slug: slug }); }
  });

  /* ── CMS embed ── */
  if (isCms) {
    window.addEventListener("message", function (e) {
      if (!e.data || e.data.source !== "cms-app") return;
      if (!cmsParentOrigin) cmsParentOrigin = e.origin;
      if (!originOk(e.origin)) return;
      if (e.data.type === "CMS_CONTENT" && e.data.content) { content = e.data.content; if (e.data.pageSlug) currentSlug = e.data.pageSlug; renderPage(pageData(currentSlug)); activateNav(); }
    });
    postToParent({ type: "CMS_READY", source: "cms-site" });
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); postToParent({ type: "CMS_SAVE", source: "cms-site" }); }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); popUndo(); }
      if (e.key === "Escape") deselect();
    });
  }

  /* ── standalone ── */
  if (!isCms) {
    fetch("content.json?v=" + Date.now()).then(function (r) { return r.json(); }).then(function (data) {
      content = data; var hash = window.location.hash.replace("#", ""); if (hash && content.pages && content.pages[hash]) currentSlug = hash;
      renderPage(pageData(currentSlug)); activateNav();
    }).catch(function (err) { console.error("[CMS] content.json load error", err); });
  }

  function pageData(slug) { return !content ? {} : content.pages ? (content.pages[slug] || {}) : content; }

  /* ============================================================
     SELECTION SYSTEM — click to select, Escape to deselect
     ============================================================ */
  var cmsControls = new Map();
  var selectedEl = null;
  var selectedCfg = null;
  var toolbar = null;
  var resizeHandles = [];

  function registerControl(el, config) {
    if (!isCms || !el) return;
    el.setAttribute("data-cms-ctrl", "");
    cmsControls.set(el, config);
  }

  function initCmsUI() {
    toolbar = document.createElement("div");
    toolbar.id = "cms-toolbar";
    document.body.appendChild(toolbar);

    document.addEventListener("click", function (e) {
      if (dragState) return;
      if (toolbar.contains(e.target)) return;
      if (e.target.closest(".cms-sec-bar, .cms-sec-resize")) return;
      if (e.target.closest(".cms-handle")) return;

      var target = e.target.closest("[data-cms-ctrl]");
      if (target) {
        if (selectedEl === target) {
          var cfg2 = cmsControls.get(target);
          if (cfg2 && cfg2.isCard) {
            var textEl = e.target.closest("[data-cms-card-field]");
            if (textEl) { textEl.contentEditable = "true"; textEl.focus(); textEl.classList.add("cms-editing"); }
          } else if (cfg2 && !cfg2.cropEl && !cfg2.isMediaContainer) {
            target.contentEditable = "true";
            target.focus();
            target.classList.add("cms-editing");
          }
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        select(target);
      } else {
        deselect();
      }
    }, true);

    document.addEventListener("dblclick", function (e) {
      var target = e.target.closest("[data-cms-ctrl]");
      if (!target) return;
      var cfg = cmsControls.get(target);
      if (cfg && cfg.isCard) {
        var textEl = e.target.closest("[data-cms-card-field]");
        if (textEl) { textEl.contentEditable = "true"; textEl.focus(); textEl.classList.add("cms-editing"); }
      } else if (cfg && !cfg.cropEl) {
        target.contentEditable = "true";
        target.focus();
        target.classList.add("cms-editing");
      }
    });

    window.addEventListener("scroll", function () {
      if (selectedEl) { positionToolbar(); positionHandles(); }
    }, { passive: true });
    window.addEventListener("resize", function () {
      if (selectedEl) { positionToolbar(); positionHandles(); }
    });
  }

  function select(el) {
    if (selectedEl === el) return;
    deselect();
    var cfg = cmsControls.get(el);
    if (!cfg) return;
    selectedEl = el;
    selectedCfg = cfg;
    el.classList.add("cms-selected");
    buildToolbar(el, cfg);
    if (cfg.canResize) showHandles(el);
    positionToolbar();
    positionHandles();
    toolbar.classList.add("cms-tb-visible");
  }

  function deselect() {
    if (!selectedEl) return;
    selectedEl.classList.remove("cms-selected");
    selectedEl.contentEditable = "false";
    selectedEl.classList.remove("cms-editing");
    selectedEl = null;
    selectedCfg = null;
    toolbar.classList.remove("cms-tb-visible");
    toolbar.innerHTML = "";
    hideHandles();
  }

  /* ── Toolbar ── */
  function buildToolbar(el, cfg) {
    toolbar.innerHTML = "";
    var isCropMedia = !!cfg.cropEl;

    if (cfg.canMove) {
      var label = isCropMedia ? "Recadrer" : "D\u00e9placer";
      var icon = isCropMedia ? ICON_CROP : ICON_MOVE;
      addTbBtn(icon, label, function (e) {
        e.preventDefault(); deselect();
        if (isCropMedia) { startCrop(cfg.cropEl, cfg.section, cfg.cropPosField, e.clientX, e.clientY); }
        else if (cfg.isCard) startCardMove(el, cfg.cardIdx, cfg.section, cfg.listField, e.clientX, e.clientY);
        else startMove(el, cfg.section, cfg.posField, e.clientX, e.clientY);
      }, true);
    }

    if (cfg.uploadKey) {
      addTbBtn(ICON_UPLOAD, "Remplacer", function () {
        postToParent({ type: "CMS_UPLOAD_REQUEST", source: "cms-site", uploadKey: cfg.uploadKey, section: cfg.section, field: cfg.srcField || "image", mediaType: cfg.mediaType || "image" });
      });
    }

    if (cfg.hasPoster) {
      addTbBtn(ICON_IMAGE, "Miniature", function () {
        postToParent({ type: "CMS_UPLOAD_REQUEST", source: "cms-site", uploadKey: cfg.section + "-poster", section: cfg.section, field: cfg.posterField || "poster", mediaType: "image" });
      });
    }

    if (cfg.isCard) {
      var d = pageData(currentSlug);
      var secData = d ? d[cfg.section] : null;
      var numItems = secData && secData[cfg.listField] ? secData[cfg.listField].length : 0;
      if (cfg.cardIdx > 0)
        addTbBtn(null, "\u2190", function () { swapCards(cfg.section, cfg.listField, cfg.cardIdx, cfg.cardIdx - 1); }, false, "cms-tb-txt");
      if (cfg.cardIdx < numItems - 1)
        addTbBtn(null, "\u2192", function () { swapCards(cfg.section, cfg.listField, cfg.cardIdx, cfg.cardIdx + 1); }, false, "cms-tb-txt");
    }
  }

  function addTbBtn(icon, label, handler, isGrip, cls) {
    var btn = document.createElement("button");
    btn.className = "cms-tb-btn" + (cls ? " " + cls : "");
    if (icon) { btn.innerHTML = icon; btn.title = label; }
    else { btn.textContent = label; btn.title = label; }
    if (isGrip) {
      btn.classList.add("cms-tb-grip");
      btn.addEventListener("mousedown", function (e) { e.stopPropagation(); handler(e); });
      btn.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return; e.preventDefault(); e.stopPropagation();
        document.body.style.touchAction = "none";
        handler({ preventDefault: function(){}, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
      }, { passive: false });
    } else {
      btn.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); handler(e); });
    }
    toolbar.appendChild(btn);
  }

  function positionToolbar() {
    if (!selectedEl || !toolbar) return;
    var r = selectedEl.getBoundingClientRect();
    var tbW = toolbar.offsetWidth || 140;
    var tbH = toolbar.offsetHeight || 38;
    var x = r.left + r.width / 2 - tbW / 2;
    var y;
    if (selectedCfg && (selectedCfg.cropEl || selectedCfg.isMediaContainer)) {
      y = r.top + r.height / 2 - tbH / 2;
    } else {
      y = r.top - tbH - 10;
      if (y < 56) y = r.bottom + 10;
    }
    x = clamp(x, 4, window.innerWidth - tbW - 4);
    y = clamp(y, 4, window.innerHeight - tbH - 4);
    toolbar.style.top = y + "px";
    toolbar.style.left = x + "px";
  }

  /* ── Resize Handles ── */
  function showHandles(el) {
    hideHandles();
    ["nw", "ne", "sw", "se"].forEach(function (pos) {
      var h = document.createElement("div");
      h.className = "cms-handle cms-handle-" + pos;
      h.addEventListener("mousedown", function (e) { e.preventDefault(); e.stopPropagation(); startResize(el, e.clientX, e.clientY); });
      h.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return; e.stopPropagation();
        startResize(el, e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      document.body.appendChild(h);
      resizeHandles.push(h);
    });
    positionHandles();
  }

  function positionHandles() {
    if (!selectedEl || !resizeHandles.length) return;
    var r = selectedEl.getBoundingClientRect();
    var positions = [
      { x: r.left, y: r.top },
      { x: r.right, y: r.top },
      { x: r.left, y: r.bottom },
      { x: r.right, y: r.bottom }
    ];
    resizeHandles.forEach(function (h, i) {
      h.style.left = (positions[i].x - 5) + "px";
      h.style.top = (positions[i].y - 5) + "px";
    });
  }

  function hideHandles() {
    resizeHandles.forEach(function (h) { h.remove(); });
    resizeHandles = [];
  }

  /* ── Resize drag ── */
  var resizeState = null;

  function startResize(el, cx, cy) {
    var cfg = cmsControls.get(el);
    if (!cfg) return;
    var base = parseFloat(el.dataset.cmsBaseSize);
    if (!base) { el.style.fontSize = ""; base = parseFloat(window.getComputedStyle(el).fontSize); el.dataset.cmsBaseSize = base; }
    var rect = el.getBoundingClientRect();
    var centerX = rect.left + rect.width / 2;
    var centerY = rect.top + rect.height / 2;
    var initDist = Math.sqrt(Math.pow(cx - centerX, 2) + Math.pow(cy - centerY, 2)) || 1;
    resizeState = { el: el, cfg: cfg, startSize: parseFloat(el.dataset.cmsSize) || 1, base: base, centerX: centerX, centerY: centerY, initDist: initDist };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
    document.body.style.touchAction = "none";
  }

  /* ── card swap (generic) ── */
  function swapCards(section, listField, fromIdx, toIdx) {
    var d = pageData(currentSlug);
    var secData = d ? d[section] : null;
    if (!secData || !secData[listField]) return;
    var items = secData[listField].map(function (it) { return Object.assign({}, it); });
    var temp = items[fromIdx];
    items[fromIdx] = items[toIdx];
    items[toIdx] = temp;
    secData[listField] = items;
    deselect();
    renderSection(section, secData);
    wireEditors();
    var patch = {}; patch[section] = {}; patch[section][listField] = items;
    postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: patch });
  }

  /* ── size control ── */
  function applySize(el, size) {
    if (!el) return;
    el.dataset.cmsSize = size || 1;
    if (!size || size === 1) return;
    el.style.fontSize = "";
    var base = parseFloat(window.getComputedStyle(el).fontSize);
    el.dataset.cmsBaseSize = base;
    el.style.fontSize = (base * size) + "px";
  }

  function applyMediaSize(el, size) {
    if (!el) return;
    el.dataset.cmsSize = size || 1;
    if (!size || size === 1) return;
    el.style.transform = "scale(" + size + ")";
    el.style.transformOrigin = "center center";
    el.style.setProperty("--cms-translate", "scale(" + size + ")");
  }

  function applyCardTransform(el) {
    var px = parseFloat(el.dataset.cmsPosX) || 0;
    var py = parseFloat(el.dataset.cmsPosY) || 0;
    var sz = parseFloat(el.dataset.cmsSize) || 1;
    var t = "";
    if (px || py) t += "translate(" + px + "px, " + py + "px) ";
    if (sz !== 1) t += "scale(" + sz + ")";
    t = t.trim();
    el.style.transform = t || "";
    el.style.setProperty("--cms-translate", t || "none");
    el.style.transformOrigin = "center center";
  }

  /* ── undo stack ── */
  var undoStack = [];
  function pushUndo(type, data) { undoStack.push({ type: type, data: data }); }
  function popUndo() {
    if (!undoStack.length) return;
    var entry = undoStack.pop();
    if (entry.type === "sectionOrder") {
      applySectionOrder(entry.data);
      refreshSectionHoverUI();
      saveSectionOrder();
    }
  }

  /* ── section hover UI ── */
  function addSectionHoverUI() {
    var main = document.querySelector("main"); if (!main) return;
    var visible = [];
    main.querySelectorAll("[data-section]").forEach(function (sec) { if (sec.style.display !== "none") visible.push(sec); });
    visible.forEach(function (sec, idx) {
      if (sec.querySelector(".cms-sec-bar")) return;
      var bar = document.createElement("div"); bar.className = "cms-sec-bar";
      if (idx > 0) {
        var up = document.createElement("button"); up.className = "cms-sec-btn"; up.textContent = "\u25B2"; up.title = "Monter";
        up.addEventListener("click", function (e) { e.stopPropagation(); moveSectionUp(sec); });
        bar.appendChild(up);
      }
      if (idx < visible.length - 1) {
        var down = document.createElement("button"); down.className = "cms-sec-btn"; down.textContent = "\u25BC"; down.title = "Descendre";
        down.addEventListener("click", function (e) { e.stopPropagation(); moveSectionDown(sec); });
        bar.appendChild(down);
      }
      sec.appendChild(bar);

      if (!sec.querySelector(".cms-sec-resize")) {
        var handle = document.createElement("div"); handle.className = "cms-sec-resize";
        handle.addEventListener("mousedown", function (e) { e.preventDefault(); e.stopPropagation(); startSectionResize(sec, e.clientY); });
        handle.addEventListener("touchstart", function (e) {
          if (e.touches.length !== 1) return; e.stopPropagation();
          startSectionResize(sec, e.touches[0].clientY);
        }, { passive: false });
        sec.appendChild(handle);
      }
    });
  }

  var sectionResizeState = null;
  function startSectionResize(sec, cy) {
    var startH = sec.getBoundingClientRect().height;
    sectionResizeState = { sec: sec, sy: cy, startH: startH };
    document.body.style.userSelect = "none"; document.body.style.cursor = "ns-resize"; document.body.style.touchAction = "none";
  }
  document.addEventListener("mousemove", function (e) { if (sectionResizeState) onSectionResizeMove(e.clientY); });
  document.addEventListener("touchmove", function (e) {
    if (!sectionResizeState) return;
    if (e.touches.length !== 1) return; e.preventDefault();
    onSectionResizeMove(e.touches[0].clientY);
  }, { passive: false });
  document.addEventListener("mouseup", onSectionResizeEnd);
  document.addEventListener("touchend", onSectionResizeEnd);

  function onSectionResizeMove(cy) {
    if (!sectionResizeState) return;
    var delta = cy - sectionResizeState.sy;
    var newH = Math.max(30, sectionResizeState.startH + delta);
    var sec = sectionResizeState.sec;
    sec.style.height = newH + "px";
    sec.style.minHeight = "0";
    sec.style.overflow = "hidden";
  }
  function onSectionResizeEnd() {
    if (!sectionResizeState) return;
    var sec = sectionResizeState.sec;
    var sectionName = sec.getAttribute("data-section");
    var finalH = sec.getBoundingClientRect().height;
    var d = pageData(currentSlug);
    var sizes = (d && d.sectionSizes) ? Object.assign({}, d.sectionSizes) : {};
    sizes[sectionName] = finalH;
    if (d) { if (!d.sectionSizes) d.sectionSizes = {}; d.sectionSizes[sectionName] = finalH; }
    postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { sectionSizes: sizes } });
    document.body.style.userSelect = ""; document.body.style.cursor = ""; document.body.style.touchAction = "";
    sectionResizeState = null;
  }

  function getCurrentOrder() {
    var order = [];
    var main = document.querySelector("main"); if (!main) return order;
    main.querySelectorAll("[data-section]").forEach(function (sec) { if (sec.style.display !== "none") order.push(sec.getAttribute("data-section")); });
    return order;
  }

  function moveSectionUp(sec) {
    var prev = sec.previousElementSibling;
    if (prev && prev.hasAttribute("data-section")) { pushUndo("sectionOrder", getCurrentOrder()); sec.parentNode.insertBefore(sec, prev); refreshSectionHoverUI(); saveSectionOrder(); }
  }
  function moveSectionDown(sec) {
    var next = sec.nextElementSibling;
    if (next && next.hasAttribute("data-section")) { pushUndo("sectionOrder", getCurrentOrder()); sec.parentNode.insertBefore(next, sec); refreshSectionHoverUI(); saveSectionOrder(); }
  }
  function refreshSectionHoverUI() { document.querySelectorAll(".cms-sec-bar, .cms-sec-resize").forEach(function (b) { b.remove(); }); addSectionHoverUI(); }
  function saveSectionOrder() {
    var order = getCurrentOrder();
    postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { sectionOrder: order } });
  }
  function applySectionOrder(order) {
    if (!order || !order.length) return;
    var main = document.querySelector("main"); if (!main) return;
    for (var i = order.length - 1; i >= 0; i--) {
      var sec = document.querySelector('[data-section="' + order[i] + '"]');
      if (sec) main.insertBefore(sec, main.querySelector("[data-section]"));
    }
  }

  function applySectionSizes(sizes) {
    if (!sizes) return;
    Object.keys(sizes).forEach(function (name) {
      var sec = document.querySelector('[data-section="' + name + '"]');
      if (sec && sizes[name]) {
        sec.style.height = sizes[name] + "px";
        sec.style.minHeight = "0";
        sec.style.overflow = "hidden";
      }
    });
  }

  /* ============================================================
     GENERIC CLEAR & RENDER
     ============================================================ */
  function clearAll() {
    if (isCms) deselect();
    document.querySelectorAll("[data-cms-field]").forEach(function (el) {
      el.textContent = "";
      el.removeAttribute("data-cms-wired");
    });
    document.querySelectorAll("[data-cms-media]").forEach(function (container) {
      var rt = container.querySelector("[data-cms-render]");
      if (rt) { rt.innerHTML = ""; } else { container.innerHTML = ""; }
    });
    document.querySelectorAll("[data-cms-list]").forEach(function (el) {
      el.innerHTML = "";
    });
    document.querySelectorAll("[data-section]").forEach(function (sec) {
      sec.style.display = "none";
      sec.style.minHeight = "";
      sec.style.height = "";
      sec.style.overflow = "";
    });
    cmsControls.clear();
    document.querySelectorAll("[data-cms-ctrl]").forEach(function (el) { el.removeAttribute("data-cms-ctrl"); el.removeAttribute("contenteditable"); });
    document.querySelectorAll(".cms-sec-bar, .cms-sec-resize").forEach(function (b) { b.remove(); });
  }

  function renderPage(d) {
    clearAll(); if (!d) return;
    var keys = Object.keys(d);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (META_KEYS[key]) continue;
      var val = d[key];
      if (!val || typeof val !== "object" || Array.isArray(val)) continue;
      var sec = document.querySelector('[data-section="' + key + '"]');
      if (sec) renderSection(key, val);
    }
    if (d.sectionOrder) applySectionOrder(d.sectionOrder);
    if (d.sectionSizes) applySectionSizes(d.sectionSizes);
    if (isCms) wireEditors();
    if (isCms) addSectionHoverUI();
    requestAnimationFrame(observeAnims);
  }

  /* ── Generic section renderer ── */
  function renderSection(sectionName, data) {
    var sec = document.querySelector('[data-section="' + sectionName + '"]');
    if (!sec) return;
    sec.style.display = "";

    /* — text fields — */
    sec.querySelectorAll("[data-cms-field]").forEach(function (el) {
      var field = el.getAttribute("data-cms-field");
      if (data[field] != null) el.textContent = data[field];

      var hrefField = el.getAttribute("data-cms-href");
      if (hrefField && data[hrefField] && el.tagName === "A") {
        el.href = "mailto:" + data[hrefField];
      }

      applyPos(el, data[field + "Position"]);
      applySize(el, data[field + "Size"]);
      registerControl(el, {
        canMove: true, canResize: true,
        section: sectionName,
        posField: field + "Position",
        sizeField: field + "Size"
      });
    });

    /* — media containers — */
    sec.querySelectorAll("[data-cms-media]").forEach(function (container) {
      var mediaType = container.getAttribute("data-cms-media");
      var srcField = container.getAttribute("data-cms-src") || (mediaType === "image" ? "image" : "video");
      var posField = srcField === "image" ? "imagePosition" : "videoPosition";
      var posterField = container.getAttribute("data-cms-poster") || null;

      var renderTarget = container.querySelector("[data-cms-render]") || container;
      renderTarget.innerHTML = "";

      var src = data[srcField];
      if (src) {
        var mediaEl;
        if (mediaType === "image") {
          mediaEl = document.createElement("img");
          mediaEl.src = resolveUrl(src);
          mediaEl.alt = "";
          mediaEl.loading = "eager";
        } else if (mediaType === "video") {
          mediaEl = document.createElement("video");
          mediaEl.src = resolveUrl(src);
          mediaEl.controls = true;
          mediaEl.playsInline = true;
          mediaEl.preload = "auto";
          mediaEl.setAttribute("playsinline", "");
          if (posterField && data[posterField]) mediaEl.poster = resolveUrl(data[posterField]);
        } else if (mediaType === "videoLoop") {
          mediaEl = document.createElement("video");
          mediaEl.src = resolveUrl(src);
          mediaEl.autoplay = true;
          mediaEl.muted = true;
          mediaEl.loop = true;
          mediaEl.playsInline = true;
          mediaEl.preload = "auto";
          mediaEl.setAttribute("playsinline", "");
        }

        if (mediaEl) {
          applyCrop(mediaEl, data[posField]);
          renderTarget.appendChild(mediaEl);
          if (mediaType === "videoLoop") mediaEl.play().catch(function () {});
        }
      }

      applyMediaSize(container, data.mediaSize);

      var isCropType = mediaType === "image" || mediaType === "videoLoop";
      var uploadKey = sectionName + "-" + srcField;
      var config = {
        canMove: true, canResize: true, isMediaContainer: true,
        uploadKey: uploadKey,
        section: sectionName,
        sizeField: "mediaSize",
        srcField: srcField,
        mediaType: mediaType === "image" ? "image" : "video"
      };

      if (isCropType) {
        config.cropEl = renderTarget;
        config.cropSection = sectionName;
        config.cropPosField = posField;
      } else {
        config.posField = "mediaPosition";
        applyPos(container, data.mediaPosition);
      }

      if (posterField) {
        config.hasPoster = true;
        config.posterField = posterField;
      }

      registerControl(container, config);
    });

    /* — card lists — */
    sec.querySelectorAll("[data-cms-list]").forEach(function (list) {
      var listField = list.getAttribute("data-cms-list");
      var items = data[listField];
      if (!items || !Array.isArray(items)) return;

      var tmpl = sec.querySelector('template[data-cms-card="' + listField + '"]');
      if (!tmpl) return;

      list.innerHTML = "";
      items.forEach(function (item, idx) {
        var clone = tmpl.content.cloneNode(true);
        var card = clone.firstElementChild;
        if (!card) return;

        card.dataset.idx = idx;
        card.setAttribute("data-cms-card-item", "");

        card.querySelectorAll("[data-cms-card-field]").forEach(function (el) {
          var f = el.getAttribute("data-cms-card-field");
          if (item[f] != null) el.textContent = item[f];
        });

        card.dataset.cmsPosX = item.position ? (item.position.x || 0) : 0;
        card.dataset.cmsPosY = item.position ? (item.position.y || 0) : 0;
        card.dataset.cmsSize = item.size || 1;

        list.appendChild(card);
        applyCardTransform(card);
        registerControl(card, { canMove: true, canResize: true, isCard: true, cardIdx: idx, section: sectionName, listField: listField });
      });
    });
  }

  /* ============================================================
     GENERIC TEXT EDITING — wired after render
     ============================================================ */
  function wireEditors() {
    document.querySelectorAll("[data-section]").forEach(function (sec) {
      if (sec.style.display === "none") return;
      var sectionName = sec.getAttribute("data-section");

      sec.querySelectorAll("[data-cms-field]").forEach(function (el) {
        if (el.dataset.cmsWired) return;
        el.dataset.cmsWired = "true";
        el.spellcheck = false;
        el.style.outline = "none";
        var field = el.getAttribute("data-cms-field");
        var timer;
        if (el.tagName === "A") el.addEventListener("click", function (e) { e.preventDefault(); });
        function emit() {
          var p = {}; p[sectionName] = {}; p[sectionName][field] = el.textContent;
          postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p });
        }
        el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emit, 350); });
        el.addEventListener("blur", function () { clearTimeout(timer); emit(); el.contentEditable = "false"; el.classList.remove("cms-editing"); });
      });

      sec.querySelectorAll("[data-cms-list]").forEach(function (list) {
        var listField = list.getAttribute("data-cms-list");
        var cards = list.children;
        for (var i = 0; i < cards.length; i++) {
          (function (card, idx) {
            card.querySelectorAll("[data-cms-card-field]").forEach(function (el) {
              if (el.dataset.cmsWired) return;
              el.dataset.cmsWired = "true";
              el.spellcheck = false;
              el.style.outline = "none";
              var cardField = el.getAttribute("data-cms-card-field");
              var timer;
              function emit() {
                var d = pageData(currentSlug);
                var secData = d ? d[sectionName] : null;
                if (!secData || !secData[listField] || !secData[listField][idx]) return;
                var items = secData[listField].map(function (it) { return Object.assign({}, it); });
                items[idx][cardField] = el.textContent;
                var patch = {}; patch[sectionName] = {}; patch[sectionName][listField] = items;
                postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: patch });
              }
              el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emit, 350); });
              el.addEventListener("blur", function () { clearTimeout(timer); emit(); el.contentEditable = "false"; el.classList.remove("cms-editing"); });
            });
          })(cards[i], i);
        }
      });
    });
  }

  /* ── positions & crop ── */
  function applyPos(el, pos) {
    if (!el || !pos) return;
    if (typeof el === "string") el = document.querySelector(el);
    if (!el) return;
    var x = pos.x || 0, y = pos.y || 0;
    el.dataset.cmsPosX = x; el.dataset.cmsPosY = y;
    if (x === 0 && y === 0) {
      el.style.removeProperty("--cms-translate");
      el.classList.remove("cms-positioned");
      return;
    }
    var t = "translate(" + x + "px, " + y + "px)";
    el.style.setProperty("--cms-translate", t);
    el.classList.add("cms-positioned");
    el.style.transform = t;
  }

  function isControlledVideo(el) {
    return el && el.tagName === "VIDEO" && el.controls;
  }

  function makeCropReady(el) {
    if (isControlledVideo(el)) {
      el.style.objectFit = "cover";
      return;
    }
    el.style.width = "130%"; el.style.height = "130%"; el.style.maxWidth = "none";
    el.style.position = "absolute"; el.style.top = "-15%"; el.style.left = "-15%";
    el.style.right = "auto"; el.style.bottom = "auto"; el.style.objectFit = "cover";
  }

  function resetCropStyling(el) {
    if (!el) return;
    el.style.width = ""; el.style.height = ""; el.style.maxWidth = "";
    el.style.position = ""; el.style.top = ""; el.style.left = "";
    el.style.right = ""; el.style.bottom = ""; el.style.objectFit = "";
    el.style.transform = ""; el.style.animation = "";
    el.style.objectPosition = "";
  }

  function applyCrop(media, pos) {
    if (!media) return;
    var x = pos ? (pos.x != null ? pos.x : 50) : 50;
    var y = pos ? (pos.y != null ? pos.y : 50) : 50;
    if (x !== 50 || y !== 50) {
      if (isControlledVideo(media)) {
        media.style.objectFit = "cover";
        media.style.objectPosition = "50% " + y + "%";
      } else {
        makeCropReady(media); media.style.animation = "none";
        media.style.transform = "translate(" + ((50 - x) * 0.3) + "%, " + ((50 - y) * 0.3) + "%)";
      }
    }
  }

  /* ============================================================
     UNIFIED DRAG SYSTEM — single set of listeners
     dragState.type: "crop" | "move" | "card"
     ============================================================ */
  var dragState = null;

  function startCrop(container, section, posField, cx, cy) {
    var media = container.querySelector("img, video"); if (!media) return;

    if (isControlledVideo(media)) {
      media.style.objectFit = "cover";
      var currentOp = (media.style.objectPosition || "50% 50%").split(/\s+/);
      var px = parseFloat(currentOp[0]) || 50, py = parseFloat(currentOp[1]) || 50;
      dragState = { type: "crop", container: container, media: media, section: section, posField: posField, sx: cx, sy: cy, px: px, py: py, lastX: px, lastY: py, controlled: true };
    } else {
      var wasCropReady = media.style.width === "130%";
      makeCropReady(media); media.style.animation = "none";
      if (!wasCropReady) media.style.transform = "translate(0%, 0%)";
      var match = (media.style.transform || "").match(/translate\(\s*([-\d.]+)%\s*,\s*([-\d.]+)%/);
      var curTx = match ? parseFloat(match[1]) : 0, curTy = match ? parseFloat(match[2]) : 0;
      var px2 = clamp(50 - curTx / 0.3, 0, 100), py2 = clamp(50 - curTy / 0.3, 0, 100);
      dragState = { type: "crop", container: container, media: media, section: section, posField: posField, sx: cx, sy: cy, px: px2, py: py2, lastX: px2, lastY: py2, controlled: false };
    }

    container.classList.add("cms-cropping");
    document.body.style.userSelect = "none"; document.body.style.cursor = "grabbing"; document.body.style.touchAction = "none";
    showSnapGrid(container.closest("[data-section]") || container);
  }

  function startMove(el, section, posField, cx, cy) {
    var parent = el.closest("[data-section]") || el.parentElement;
    dragState = { type: "move", el: el, section: section, posField: posField, sx: cx, sy: cy, ox: parseFloat(el.dataset.cmsPosX) || 0, oy: parseFloat(el.dataset.cmsPosY) || 0, elRect: el.getBoundingClientRect(), parentRect: parent ? parent.getBoundingClientRect() : null };
    el.classList.add("cms-moving"); document.body.style.userSelect = "none"; document.body.style.cursor = "grabbing"; document.body.style.touchAction = "none";
    showSnapGrid(parent || el.parentElement);
  }

  function startCardMove(card, idx, section, listField, cx, cy) {
    var parent = card.closest("[data-section]") || card.parentElement;
    dragState = { type: "card", card: card, idx: idx, section: section, listField: listField, sx: cx, sy: cy, ox: parseFloat(card.dataset.cmsPosX) || 0, oy: parseFloat(card.dataset.cmsPosY) || 0, elRect: card.getBoundingClientRect(), parentRect: parent ? parent.getBoundingClientRect() : null };
    card.classList.add("cms-moving"); document.body.style.userSelect = "none"; document.body.style.cursor = "grabbing"; document.body.style.touchAction = "none";
    showSnapGrid(parent || card.parentElement);
  }

  document.addEventListener("mousemove", function (e) { if (dragState) onDragMove(e.clientX, e.clientY); if (resizeState) onResizeMove(e.clientX, e.clientY); });
  document.addEventListener("touchmove", function (e) {
    if (!dragState && !resizeState) return;
    if (e.touches.length !== 1) return; e.preventDefault();
    if (dragState) onDragMove(e.touches[0].clientX, e.touches[0].clientY);
    if (resizeState) onResizeMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  document.addEventListener("mouseup", onDragEnd);
  document.addEventListener("touchend", onDragEnd);

  function onDragMove(cx, cy) {
    if (!dragState) return;
    if (dragState.type === "crop") {
      var dx = cx - dragState.sx, dy = cy - dragState.sy;
      var nx = clamp(dragState.px - dx * 0.15, 0, 100), ny = clamp(dragState.py - dy * 0.15, 0, 100);
      var s = snapVal(nx, ny);
      if (dragState.controlled) {
        dragState.lastX = 50; dragState.lastY = s.y;
        dragState.media.style.objectPosition = "50% " + s.y + "%";
      } else {
        dragState.lastX = s.x; dragState.lastY = s.y;
        dragState.media.style.transform = "translate(" + ((50 - s.x) * 0.3) + "%, " + ((50 - s.y) * 0.3) + "%)";
      }
      updateSnapUI(s.x, s.y);
    } else if (dragState.type === "move") {
      var rawX = dragState.ox + (cx - dragState.sx), rawY = dragState.oy + (cy - dragState.sy);
      var snap = computeTranslateSnap(rawX, rawY, dragState.elRect, dragState.parentRect, dragState.ox, dragState.oy);
      updateSnapUI(snap.sx, snap.sy);
      var t = "translate(" + snap.x + "px, " + snap.y + "px)";
      dragState.el.style.transform = t; dragState.el.style.setProperty("--cms-translate", t);
      dragState.el.dataset.cmsPosX = snap.x; dragState.el.dataset.cmsPosY = snap.y;
    } else if (dragState.type === "card") {
      var rawX2 = dragState.ox + (cx - dragState.sx), rawY2 = dragState.oy + (cy - dragState.sy);
      var snap2 = computeTranslateSnap(rawX2, rawY2, dragState.elRect, dragState.parentRect, dragState.ox, dragState.oy);
      updateSnapUI(snap2.sx, snap2.sy);
      dragState.card.dataset.cmsPosX = snap2.x; dragState.card.dataset.cmsPosY = snap2.y;
      applyCardTransform(dragState.card);
    }
  }

  function onResizeMove(cx, cy) {
    if (!resizeState) return;
    var dist = Math.sqrt(Math.pow(cx - resizeState.centerX, 2) + Math.pow(cy - resizeState.centerY, 2));
    var ratio = dist / resizeState.initDist;
    var next = Math.round(clamp(resizeState.startSize * ratio, 0.3, 3) * 100) / 100;
    resizeState.el.dataset.cmsSize = next;
    if (resizeState.cfg && (resizeState.cfg.isCard || resizeState.cfg.isMediaContainer)) {
      applyCardTransform(resizeState.el);
    } else {
      resizeState.el.style.fontSize = (resizeState.base * next) + "px";
    }
    resizeState.el.offsetHeight;
    positionToolbar(); positionHandles();
  }

  function onDragEnd() {
    if (resizeState) {
      var sz = parseFloat(resizeState.el.dataset.cmsSize) || 1;
      var cfg = resizeState.cfg;
      if (cfg.isCard) {
        var d = pageData(currentSlug);
        var secData = d ? d[cfg.section] : null;
        if (secData && secData[cfg.listField]) {
          var items = secData[cfg.listField].map(function (it) { return Object.assign({}, it); });
          items[cfg.cardIdx].size = sz;
          secData[cfg.listField] = items;
          var patch = {}; patch[cfg.section] = {}; patch[cfg.section][cfg.listField] = items;
          postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: patch });
        }
      } else if (cfg.section && cfg.sizeField) {
        var p = {}; p[cfg.section] = {}; p[cfg.section][cfg.sizeField] = sz;
        postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p });
      }
      document.body.style.userSelect = ""; document.body.style.cursor = ""; document.body.style.touchAction = "";
      resizeState = null;
      return;
    }

    if (!dragState) return;
    document.body.style.userSelect = ""; document.body.style.cursor = ""; document.body.style.touchAction = "";
    hideSnapGrid();

    if (dragState.type === "crop") {
      dragState.container.classList.remove("cms-cropping");
      var finalX = Math.round(dragState.lastX), finalY = Math.round(dragState.lastY);
      if (finalX === 50 && finalY === 50 && !dragState.controlled) {
        resetCropStyling(dragState.media);
      }
      var pc = {}; pc[dragState.section] = {}; pc[dragState.section][dragState.posField] = { x: finalX, y: finalY };
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: pc });
    } else if (dragState.type === "move") {
      dragState.el.classList.remove("cms-moving");
      var fx = Math.round(parseFloat(dragState.el.dataset.cmsPosX) || 0), fy = Math.round(parseFloat(dragState.el.dataset.cmsPosY) || 0);
      var pm = {}; pm[dragState.section] = {}; pm[dragState.section][dragState.posField] = { x: fx, y: fy };
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: pm });
    } else if (dragState.type === "card") {
      dragState.card.classList.remove("cms-moving");
      var fcx = Math.round(parseFloat(dragState.card.dataset.cmsPosX) || 0), fcy = Math.round(parseFloat(dragState.card.dataset.cmsPosY) || 0);
      var dc = pageData(currentSlug);
      var secData2 = dc ? dc[dragState.section] : null;
      if (secData2 && secData2[dragState.listField] && secData2[dragState.listField][dragState.idx]) {
        var items2 = secData2[dragState.listField].map(function (it) { return Object.assign({}, it); });
        items2[dragState.idx].position = { x: fcx, y: fcy };
        secData2[dragState.listField] = items2;
        var patch2 = {}; patch2[dragState.section] = {}; patch2[dragState.section][dragState.listField] = items2;
        postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: patch2 });
      }
    }
    dragState = null;
  }

  /* ── snap helpers ── */
  function computeTranslateSnap(nx, ny, elRect, parentRect, ox, oy) {
    if (!parentRect || !elRect) return { x: nx, y: ny, sx: -1, sy: -1 };
    var baseCX = elRect.left + elRect.width / 2 - ox - parentRect.left;
    var baseCY = elRect.top + elRect.height / 2 - oy - parentRect.top;
    var ecx = (baseCX + nx) / parentRect.width * 100, ecy = (baseCY + ny) / parentRect.height * 100;
    var s = snapVal(ecx, ecy);
    var rx = nx, ry = ny;
    if (Math.abs(s.x - ecx) > 0.01) rx = s.x / 100 * parentRect.width - baseCX;
    if (Math.abs(s.y - ecy) > 0.01) ry = s.y / 100 * parentRect.height - baseCY;
    return { x: rx, y: ry, sx: s.x, sy: s.y };
  }

  var snapOverlay = null, SNAP_PTS = [0, 25, 50, 75, 100], SNAP_T = 4;
  function snapVal(x, y) { var sx = x, sy = y; SNAP_PTS.forEach(function (p) { if (Math.abs(x - p) < SNAP_T) sx = p; if (Math.abs(y - p) < SNAP_T) sy = p; }); return { x: sx, y: sy }; }
  function createSnapOverlay() {
    if (snapOverlay) return; snapOverlay = document.createElement("div"); snapOverlay.className = "cms-snap-overlay";
    var html = ""; [0, 25, 50, 75, 100].forEach(function (p) { html += '<div class="cms-snap-v" style="left:' + p + '%" data-p="' + p + '"></div><div class="cms-snap-h" style="top:' + p + '%" data-p="' + p + '"></div>'; });
    html += '<div class="cms-snap-crosshair"></div><div class="cms-snap-label"></div>';
    snapOverlay.innerHTML = html; document.body.appendChild(snapOverlay);
  }
  function showSnapGrid(sec) { if (!isCms) return; createSnapOverlay(); var r = sec.getBoundingClientRect(); var s = snapOverlay.style; s.display = "block"; s.top = (r.top + window.scrollY) + "px"; s.left = r.left + "px"; s.width = r.width + "px"; s.height = r.height + "px"; }
  function hideSnapGrid() { if (snapOverlay) snapOverlay.style.display = "none"; }
  function updateSnapUI(x, y) {
    if (!snapOverlay || x < 0) return;
    snapOverlay.querySelectorAll(".cms-snap-v,.cms-snap-h").forEach(function (l) { var p = parseFloat(l.dataset.p); l.classList.toggle("cms-snap-hit", Math.abs((l.classList.contains("cms-snap-v") ? x : y) - p) < 3); });
    var ch = snapOverlay.querySelector(".cms-snap-crosshair"); if (ch) { ch.style.left = x + "%"; ch.style.top = y + "%"; }
    var lbl = snapOverlay.querySelector(".cms-snap-label"); if (lbl) lbl.textContent = Math.round(x) + "% , " + Math.round(y) + "%";
  }

  /* ── animations ── */
  var obs = null;
  function observeAnims() {
    if (obs) obs.disconnect();
    obs = new IntersectionObserver(function (entries) { entries.forEach(function (entry) { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); obs.unobserve(entry.target); } }); }, { threshold: 0.12 });
    document.querySelectorAll("[data-anim]").forEach(function (el) { if (!el.classList.contains("is-visible")) obs.observe(el); });
  }

  /* ============================================================
     CMS STYLES — injected only in CMS mode
     ============================================================ */
  if (isCms) {
    initCmsUI();
    var css = document.createElement("style");
    css.textContent = [
      '[data-section] { position: relative; }',

      '.cms-positioned[data-anim] { opacity: 1 !important; }',

      '[data-cms-ctrl] { cursor: pointer; }',
      '[data-cms-ctrl]:hover { outline: 1.5px dashed rgba(196,165,90,.3); outline-offset: 2px; }',

      '.cms-selected { outline: 2px solid var(--gold, #c4a55a) !important; outline-offset: 3px; }',
      '.cms-editing { outline: 2px solid rgba(196,165,90,.6) !important; outline-offset: 3px; cursor: text !important; }',

      '#cms-toolbar {',
      '  position: fixed; z-index: 10000;',
      '  display: flex; gap: 2px; padding: 4px 6px;',
      '  background: rgba(15,15,18,.92);',
      '  border: 1px solid rgba(255,255,255,.1);',
      '  border-radius: 10px;',
      '  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);',
      '  box-shadow: 0 8px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04);',
      '  pointer-events: auto;',
      '  opacity: 0; transform: translateY(6px); transition: opacity .15s, transform .15s;',
      '}',
      '#cms-toolbar.cms-tb-visible { opacity: 1; transform: translateY(0); }',

      '.cms-tb-btn {',
      '  display: flex; align-items: center; justify-content: center;',
      '  height: 30px; min-width: 30px; padding: 0 6px;',
      '  font-size: 12px; font-weight: 500; line-height: 1;',
      '  color: rgba(255,255,255,.8); background: transparent;',
      '  border: none; border-radius: 6px; cursor: pointer;',
      '  transition: background .12s, color .12s;',
      '  white-space: nowrap;',
      '}',
      '.cms-tb-btn:hover { background: rgba(255,255,255,.1); color: #fff; }',
      '.cms-tb-btn svg { flex-shrink: 0; }',
      '.cms-tb-grip { color: var(--gold, #c4a55a); }',
      '.cms-tb-grip:hover { background: rgba(196,165,90,.2); }',
      '.cms-tb-grip:active { cursor: grabbing; }',
      '.cms-tb-txt { font-family: var(--sans, system-ui); font-size: 13px; font-weight: 600; color: rgba(255,255,255,.6); min-width: 26px; padding: 0; }',
      '.cms-tb-txt:hover { color: #fff; background: rgba(255,255,255,.08); }',

      '.cms-tb-btn + .cms-tb-btn { border-left: 1px solid rgba(255,255,255,.08); }',

      '.cms-handle {',
      '  position: fixed; z-index: 9999;',
      '  width: 10px; height: 10px;',
      '  background: var(--gold, #c4a55a);',
      '  border: 2px solid rgba(15,15,18,.9);',
      '  border-radius: 3px;',
      '  cursor: nwse-resize;',
      '  pointer-events: auto;',
      '  box-shadow: 0 2px 8px rgba(0,0,0,.4);',
      '}',
      '.cms-handle-ne, .cms-handle-sw { cursor: nesw-resize; }',

      '.cms-moving { opacity: .85; z-index: 50 !important; }',
      '.cms-cropping { cursor: grabbing !important; }',
      '.cms-cropping img, .cms-cropping video { pointer-events: none !important; }',

      '.cms-snap-overlay { position: absolute; z-index: 9998; pointer-events: none; display: none; border: 1px solid rgba(196,165,90,.12); }',
      '.cms-snap-v, .cms-snap-h { position: absolute; opacity: .15; transition: opacity .1s; }',
      '.cms-snap-v { top: 0; bottom: 0; width: 1px; background: rgba(196,165,90,.6); }',
      '.cms-snap-h { left: 0; right: 0; height: 1px; background: rgba(196,165,90,.6); }',
      '.cms-snap-hit { opacity: 1 !important; background: var(--gold, #c4a55a) !important; box-shadow: 0 0 8px rgba(196,165,90,.5); }',
      '.cms-snap-crosshair { position: absolute; width: 10px; height: 10px; border: 2px solid var(--gold, #c4a55a); border-radius: 50%; transform: translate(-50%,-50%); }',
      '.cms-snap-label { position: absolute; bottom: 8px; right: 8px; padding: 2px 8px; font-size: 10px; font-family: monospace; color: var(--gold, #c4a55a); background: rgba(0,0,0,.8); border-radius: 4px; }',

      '[data-section]:hover > .cms-sec-bar, [data-section]:hover > .cms-sec-resize { opacity: 1; pointer-events: auto; }',
      '[data-section]:hover { outline: 1px dashed rgba(196,165,90,.25); outline-offset: -1px; }',

      '.cms-sec-bar { position: absolute; top: 10px; right: 10px; z-index: 500; display: flex; gap: 3px; pointer-events: none; opacity: 0; transition: opacity .15s; }',
      '.cms-sec-btn {',
      '  display: flex; align-items: center; justify-content: center;',
      '  width: 28px; height: 28px; padding: 0;',
      '  font-size: 11px; color: rgba(255,255,255,.6);',
      '  background: rgba(15,15,18,.9);',
      '  border: 1px solid rgba(255,255,255,.12);',
      '  border-radius: 6px; cursor: pointer;',
      '  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);',
      '  transition: background .12s, color .12s;',
      '  pointer-events: auto;',
      '}',
      '.cms-sec-btn:hover { background: rgba(255,255,255,.15); color: #fff; }',

      '.cms-sec-resize {',
      '  position: absolute; bottom: 0; left: 0; width: 100%; height: 8px;',
      '  z-index: 500; cursor: ns-resize; opacity: 0; transition: opacity .15s;',
      '  background: transparent; pointer-events: none;',
      '}',
      '.cms-sec-resize::after {',
      '  content: ""; position: absolute; bottom: 3px; left: 20%; width: 60%; height: 2px;',
      '  background: rgba(196,165,90,.4); border-radius: 1px; transition: background .15s;',
      '}',
      '.cms-sec-resize:hover::after { background: rgba(196,165,90,.8); }',

      '[data-cms-card-item] { position: relative; }',
      '[data-cms-card-item]:hover { transform: var(--cms-translate, none) !important; }',
      '[data-anim].is-visible.cms-positioned { transform: var(--cms-translate) !important; }',

      '@media (max-width: 680px) {',
      '  .cms-tb-btn { height: 26px; min-width: 26px; }',
      '  #cms-toolbar { padding: 3px 4px; }',
      '}',
    ].join('\n');
    document.head.appendChild(css);
  }
})();
