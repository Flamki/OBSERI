(function () {
  "use strict";

  var script = document.currentScript;
  if (!script || script.dataset.obseriMounted === "true") return;
  script.dataset.obseriMounted = "true";

  var soulId = script.dataset.soulId;
  var widgetToken = script.dataset.widgetToken;
  if (!soulId) {
    console.error("Obseri: data-soul-id is required.");
    return;
  }
  if (!widgetToken) {
    console.error(
      "Obseri: data-widget-token is required. Publish again and copy the latest embed code.",
    );
    return;
  }

  var scriptUrl = new URL(script.src, window.location.href);
  var origin = scriptUrl.origin;
  var sessionPayload;
  var sessionExpires = 0;
  var sessionPromise;
  var consentGranted = script.dataset.consent !== "required";
  var explicitConsent = false;
  var queue = [];
  var flushing = false;
  var retryCount = 0;
  var memorySession;
  var sessionKey = "obseri-session-" + soulId;
  var helpDismissed = false;
  var help;
  var helpTimer;
  var lastPath;
  var uuid = function () {
    return crypto.randomUUID();
  };

  function trackingAllowed() {
    return (
      consentGranted &&
      (!sessionPayload || sessionPayload.analyticsEnabled !== false) &&
      script.dataset.analytics !== "off" &&
      navigator.doNotTrack !== "1" &&
      !navigator.globalPrivacyControl
    );
  }
  function visitorSession() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
      if (!saved || Date.now() - saved.at > 1800000) saved = { id: uuid(), at: Date.now() };
      saved.at = Date.now();
      sessionStorage.setItem(sessionKey, JSON.stringify(saved));
      return saved.id;
    } catch (_) {
      // Storage can be unavailable in private browsing. Use a page-scoped identifier.
      return memorySession || (memorySession = uuid());
    }
  }
  function safePath() {
    return location.pathname
      .split("/")
      .map(function (part) {
        var decoded = part;
        try {
          decoded = decodeURIComponent(part);
        } catch (_) {
          /* Malformed URL segment. */
        }
        return /@|\d{6,}|[a-f0-9]{24,}/i.test(decoded) ? ":redacted" : part;
      })
      .join("/")
      .slice(0, 500);
  }
  function campaign(key) {
    var value = new URL(location.href).searchParams.get(key) || "";
    return /^[a-z0-9 _.-]{0,100}$/i.test(value) ? value : "";
  }
  async function getSession() {
    if (sessionPayload && Date.now() < sessionExpires) return sessionPayload;
    if (sessionPromise) return sessionPromise;
    sessionPromise = (async function () {
      var response = await fetch(
        origin +
          "/api/widgets/" +
          encodeURIComponent(soulId) +
          "/session?token=" +
          encodeURIComponent(widgetToken),
        {
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "strict-origin-when-cross-origin",
        },
      );
      var payload = await response.json();
      if (!response.ok || !payload.session)
        throw new Error("Widget unavailable. Please try again.");
      sessionPayload = payload;
      if (payload.consentRequired && !explicitConsent) consentGranted = false;
      sessionExpires = Date.now() + 12 * 60000;
      return payload;
    })();
    try {
      return await sessionPromise;
    } finally {
      sessionPromise = null;
    }
  }
  function track(name) {
    if (
      !trackingAllowed() ||
      /\/(account|admin|checkout|login|auth)(\/|$)/i.test(location.pathname)
    )
      return;
    var referrer = "";
    try {
      referrer = new URL(document.referrer).origin;
    } catch (_) {
      /* Direct traffic. */
    }
    queue.push({
      id: uuid(),
      name: name,
      path: safePath(),
      referrer: referrer,
      source: campaign("utm_source"),
      campaign: campaign("utm_campaign"),
    });
    if (queue.length > 60) queue.shift();
    if (queue.length >= 10) void flush();
  }
  async function flush() {
    if (!trackingAllowed()) {
      queue = [];
      return;
    }
    if (flushing || !queue.length) return;
    flushing = true;
    var batch = queue.splice(0, 20);
    try {
      var payload = await getSession();
      if (!trackingAllowed()) return;
      var response = await fetch(
        origin + "/api/souls/" + encodeURIComponent(soulId) + "/analytics",
        {
          method: "POST",
          credentials: "omit",
          keepalive: true,
          headers: {
            "content-type": "application/json",
            authorization: "Bearer " + payload.session,
          },
          body: JSON.stringify({ sessionId: visitorSession(), events: batch }),
        },
      );
      if (!response.ok) throw new Error("Tracking unavailable");
      retryCount = 0;
    } catch (_) {
      // Analytics must never interrupt the host page or the assistant.
      if (++retryCount <= 3 && trackingAllowed()) queue = batch.concat(queue).slice(0, 60);
    } finally {
      flushing = false;
    }
  }
  function hideHelp() {
    if (help) help.remove();
    help = null;
  }
  function scheduleHelp() {
    clearTimeout(helpTimer);
    hideHelp();
    if (
      script.dataset.proactive === "off" ||
      helpDismissed ||
      !/\/(pricing|plans|products?|services?)(\/|$)/i.test(location.pathname)
    )
      return;
    try {
      if (sessionStorage.getItem("obseri-help-" + soulId)) return;
    } catch (_) {
      /* Page-scoped dismissal. */
    }
    helpTimer = setTimeout(async function () {
      try {
        if ((await getSession()).proactiveEnabled === false) return;
      } catch (_) {
        return;
      }
      if (document.hidden || opened) return;
      help = document.createElement("div");
      help.style.cssText =
        "pointer-events:auto;max-width:280px;margin-bottom:12px;border:1px solid #e5e2df;border-radius:16px;padding:14px;background:white;color:#272725;box-shadow:0 8px 30px #0001;display:flex;gap:12px;font:14px/1.5 system-ui";
      var offer = document.createElement("button");
      offer.type = "button";
      offer.textContent = /pricing|plans/i.test(location.pathname)
        ? "Not sure which plan fits? Ask me a question."
        : "Need help choosing? Ask me about your options.";
      offer.style.cssText =
        "font:inherit;color:inherit;background:none;border:0;text-align:left;cursor:pointer;padding:0";
      var dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.textContent = "×";
      dismiss.setAttribute("aria-label", "Dismiss help");
      dismiss.style.cssText = "border:0;background:none;font-size:20px;cursor:pointer;color:#777";
      function remember() {
        helpDismissed = true;
        try {
          sessionStorage.setItem("obseri-help-" + soulId, "1");
        } catch (_) {
          /* Memory dismissal remains active. */
        }
        hideHelp();
      }
      offer.onclick = function () {
        track("help_clicked");
        remember();
        launcher.click();
      };
      dismiss.onclick = remember;
      help.append(offer, dismiss);
      root.insertBefore(help, root.firstChild);
      track("help_shown");
      // Only one automatic invitation per tab, including subsequent page visits.
      helpDismissed = true;
      try {
        sessionStorage.setItem("obseri-help-" + soulId, "1");
      } catch (_) {
        /* Memory guard remains active. */
      }
    }, 20000);
  }
  function sendContext() {
    if (!frame.src || !sessionPayload) return;
    frame.contentWindow.postMessage(
      {
        type: "obseri:context",
        session: sessionPayload.session,
        parentOrigin: location.origin,
        sessionId: trackingAllowed() ? visitorSession() : undefined,
        path: safePath(),
      },
      origin,
    );
  }
  function pageChanged() {
    if (lastPath === location.pathname) return;
    lastPath = location.pathname;
    track("page_view");
    sendContext();
    scheduleHelp();
  }
  window.addEventListener("obseri:consent", function (event) {
    consentGranted = Boolean(event.detail && event.detail.granted === true);
    explicitConsent = consentGranted;
    if (!consentGranted) {
      queue = [];
      memorySession = null;
      try {
        sessionStorage.removeItem(sessionKey);
      } catch (_) {
        /* Storage may be disabled. */
      }
    } else {
      track("page_view");
    }
    sendContext();
  });
  window.addEventListener("pagehide", function () {
    void flush();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) void flush();
  });
  setInterval(function () {
    void flush();
    pageChanged();
  }, 3000);
  setInterval(function () {
    if (frame.src)
      void getSession()
        .then(sendContext)
        .catch(function () {
          /* The next interaction retries. */
        });
  }, 60000);

  var position = script.dataset.position === "bottom-left" ? "left" : "right";
  var mobile = window.matchMedia("(max-width: 520px)");
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var opened = false;
  var preparing;
  var frameReady = false;

  var root = document.createElement("div");
  root.id = "obseri-soul-" + soulId;
  root.style.cssText =
    "position:fixed;z-index:2147483000;bottom:20px;" +
    position +
    ":20px;pointer-events:none;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";

  // One rounded surface owns the shadow. Shadows inside a transparent iframe
  // are clipped to its rectangular viewport and create a visible square halo.
  var panel = document.createElement("div");
  panel.id = "obseri-panel-" + soulId;
  panel.setAttribute("aria-hidden", "true");
  panel.inert = true;
  panel.style.cssText =
    "position:absolute;bottom:0;" +
    position +
    ":0;width:394px;height:620px;max-height:calc(100dvh - 40px);overflow:hidden;border-radius:28px;background:#fff;box-shadow:0 12px 40px rgba(24,29,20,.13),0 2px 8px rgba(24,29,20,.05);opacity:0;visibility:hidden;pointer-events:none;transform:translateY(14px) scale(.96);transform-origin:bottom " +
    position +
    ";";

  var loading = document.createElement("div");
  loading.setAttribute("role", "status");
  loading.setAttribute("aria-label", "Loading chat");
  loading.style.cssText =
    "position:absolute;inset:0;padding:24px;display:flex;flex-direction:column;gap:20px;box-sizing:border-box;color:#777;background:#fff;";
  var loadingClose = document.createElement("button");
  loadingClose.type = "button";
  loadingClose.textContent = "×";
  loadingClose.setAttribute("aria-label", "Close chat");
  loadingClose.style.cssText =
    "align-self:flex-end;border:0;border-radius:50%;background:#f4f3f0;color:#777;width:36px;height:36px;font:24px sans-serif;cursor:pointer;";
  var skeleton = document.createElement("div");
  skeleton.style.cssText =
    "height:80px;width:82%;border-radius:22px;background:linear-gradient(110deg,#f4f3f0,#fafaf9,#f4f3f0);";
  var loadingMessage = document.createElement("p");
  loadingMessage.style.cssText = "font:14px/1.5 sans-serif;margin:0;";
  var retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Try again";
  retry.style.cssText =
    "display:none;align-self:flex-start;border:0;border-radius:18px;background:#f4f3f0;padding:10px 16px;color:#333;cursor:pointer;";
  var skeletonInput = document.createElement("div");
  skeletonInput.style.cssText =
    "margin-top:auto;height:48px;border:1px solid #efeeeb;border-radius:24px;";
  loading.append(loadingClose, skeleton, loadingMessage, retry, skeletonInput);

  var frame = document.createElement("iframe");
  frame.title = "Obseri website assistant";
  frame.allow = "microphone; autoplay";
  frame.allowFullscreen = true;
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.style.cssText =
    "position:absolute;inset:0;display:block;width:100%;height:100%;border:0;border-radius:inherit;background:transparent;opacity:0;pointer-events:none;";

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Ask a question");
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", panel.id);
  launcher.style.cssText =
    "pointer-events:auto;display:flex;width:max-content;align-items:center;gap:12px;padding:8px 18px 8px 9px;border:1px solid rgba(25,28,23,.1);border-radius:999px;background:#fff;color:#20221f;box-shadow:0 12px 36px rgba(24,29,20,.12);cursor:pointer;font:500 16px/1.1 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
    (position === "left" ? "margin-right:auto;" : "margin-left:auto;");

  var orb = document.createElement("span");
  orb.setAttribute("aria-hidden", "true");
  orb.style.cssText =
    "display:block;width:42px;height:42px;flex:0 0 42px;border-radius:50%;background:radial-gradient(circle at 28% 24%,rgba(255,229,76,.98),transparent 31%),radial-gradient(circle at 74% 70%,rgba(47,180,255,.98),transparent 35%),radial-gradient(circle at 24% 78%,rgba(75,205,224,.92),transparent 33%),radial-gradient(circle at 75% 20%,rgba(106,211,237,.88),transparent 31%),#88c8d4;box-shadow:inset 0 0 12px rgba(255,255,255,.25),0 5px 14px rgba(56,143,165,.2);";
  var label = document.createElement("span");
  label.textContent = "Ask a question";
  launcher.appendChild(orb);
  launcher.appendChild(label);

  launcher.addEventListener("mouseenter", function () {
    if (!opened) launcher.style.transform = "translateY(-2px)";
    launcher.style.boxShadow = "0 16px 42px rgba(24,29,20,.16)";
  });
  launcher.addEventListener("mouseleave", function () {
    if (!opened) launcher.style.transform = "translateY(0)";
    launcher.style.boxShadow = "0 12px 36px rgba(24,29,20,.12)";
  });
  function prepare() {
    if (frame.src) return Promise.resolve();
    if (preparing) return preparing;
    preparing = (async function () {
      loadingMessage.textContent = "";
      retry.style.display = "none";
      try {
        var payload = await getSession();
        frame.name = JSON.stringify({
          session: payload.session,
          parentOrigin: payload.parentOrigin,
          sessionId: trackingAllowed() ? visitorSession() : undefined,
          path: safePath(),
        });
        frame.src =
          origin +
          "/widget/" +
          encodeURIComponent(soulId) +
          "?mode=chat&parentOrigin=" +
          encodeURIComponent(location.origin);
      } catch (error) {
        console.error("Obseri:", error);
        loadingMessage.textContent = "Chat could not load. Please try again.";
        retry.style.display = "block";
      } finally {
        preparing = null;
      }
    })();
    return preparing;
  }

  function setOpen(value) {
    opened = value;
    motion();
    panel.inert = !value;
    panel.setAttribute("aria-hidden", String(!value));
    panel.style.opacity = value ? "1" : "0";
    panel.style.transform = value ? "translateY(0) scale(1)" : "translateY(14px) scale(.96)";
    panel.style.visibility = value ? "visible" : "hidden";
    panel.style.pointerEvents = value ? "auto" : "none";
    launcher.style.opacity = value ? "0" : "1";
    launcher.style.transform = value ? "translateY(5px) scale(.94)" : "translateY(0) scale(1)";
    launcher.style.visibility = value ? "hidden" : "visible";
    launcher.style.pointerEvents = value ? "none" : "auto";
    launcher.setAttribute("aria-expanded", String(value));
    launcher.tabIndex = value ? -1 : 0;
    if (!value) launcher.focus({ preventScroll: true });
    else if (frameReady) frame.focus({ preventScroll: true });
  }

  loadingClose.onclick = function () {
    setOpen(false);
  };
  retry.onclick = prepare;
  launcher.addEventListener("pointerenter", prepare, { once: true });
  launcher.addEventListener("focus", prepare, { once: true });
  launcher.addEventListener("click", function () {
    hideHelp();
    track("widget_opened");
    setOpen(true);
    void prepare();
  });

  window.addEventListener("message", function (event) {
    if (event.source !== frame.contentWindow || event.origin !== origin) return;
    if (!event.data) return;
    if (event.data.type === "obseri:ready") {
      sendContext();
      return;
    }
    if (event.data.type === "obseri:loaded") {
      frameReady = true;
      frame.style.opacity = "1";
      frame.style.pointerEvents = "auto";
      loading.style.display = "none";
      if (opened) frame.focus({ preventScroll: true });
      return;
    }
    if (event.data.type === "obseri:conversation-started") {
      track("conversation_started");
      return;
    }
    if (event.data.type !== "obseri:close") return;
    setOpen(false);
  });

  function motion() {
    panel.style.transition = reducedMotion.matches
      ? "none"
      : "opacity 220ms ease,transform 260ms cubic-bezier(.22,1,.36,1),visibility 0s linear 260ms";
    // Opening visibility is immediate; closing visibility waits for the fade.
    panel.style.transitionDelay = opened ? "0s" : "0s,0s,260ms";
    launcher.style.transition = reducedMotion.matches
      ? "none"
      : "opacity 160ms ease,transform 220ms cubic-bezier(.22,1,.36,1),visibility 0s linear 160ms";
    launcher.style.transitionDelay = opened ? "0s,0s,160ms" : "0s";
    frame.style.transition = reducedMotion.matches ? "none" : "opacity 140ms ease";
  }

  function layout() {
    if (mobile.matches) {
      root.style.left = "12px";
      root.style.right = "12px";
      root.style.bottom = "12px";
      panel.style.width = "100%";
      panel.style.height = "min(620px, calc(100dvh - 24px))";
      panel.style.maxHeight = "calc(100dvh - 24px)";
    } else {
      root.style.left = position === "left" ? "20px" : "auto";
      root.style.right = position === "right" ? "20px" : "auto";
      root.style.bottom = "20px";
      panel.style.width = "394px";
      panel.style.height = "620px";
      panel.style.maxHeight = "calc(100dvh - 40px)";
    }
  }

  layout();
  motion();
  mobile.addEventListener("change", layout);
  reducedMotion.addEventListener("change", motion);
  panel.append(loading, frame);
  root.appendChild(panel);
  root.appendChild(launcher);
  document.body.appendChild(root);
  pageChanged();
  function warm() {
    if (window.requestIdleCallback) window.requestIdleCallback(prepare, { timeout: 1500 });
    else setTimeout(prepare, 250);
  }
  if (document.readyState === "complete") warm();
  else window.addEventListener("load", warm, { once: true });
})();
