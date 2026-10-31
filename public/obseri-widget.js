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
      if (document.hidden || frame.style.display === "block") return;
      help = document.createElement("div");
      help.style.cssText =
        "max-width:280px;margin-bottom:12px;border:1px solid #e5e2df;border-radius:16px;padding:14px;background:white;color:#272725;box-shadow:0 8px 30px #0001;display:flex;gap:12px;font:14px/1.5 system-ui";
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

  var root = document.createElement("div");
  root.id = "obseri-soul-" + soulId;
  root.style.cssText =
    "position:fixed;z-index:2147483000;bottom:20px;" +
    position +
    ":20px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";

  var frame = document.createElement("iframe");
  frame.title = "Obseri website assistant";
  frame.allow = "microphone; autoplay";
  frame.allowFullscreen = true;
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.style.cssText =
    "display:none;width:410px;height:680px;max-height:calc(100vh - 32px);border:0;background:transparent;filter:drop-shadow(0 24px 48px rgba(0,0,0,.18));";

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Ask a question");
  launcher.setAttribute("aria-expanded", "false");
  launcher.style.cssText =
    "margin-top:12px;display:flex;width:max-content;align-items:center;gap:12px;padding:8px 18px 8px 9px;border:1px solid rgba(25,28,23,.1);border-radius:999px;background:#fff;color:#20221f;box-shadow:0 12px 36px rgba(24,29,20,.12);cursor:pointer;font:500 16px/1.1 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;transition:transform 180ms ease,box-shadow 180ms ease;" +
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
    launcher.style.transform = "translateY(-2px)";
    launcher.style.boxShadow = "0 16px 42px rgba(24,29,20,.16)";
  });
  launcher.addEventListener("mouseleave", function () {
    launcher.style.transform = "translateY(0)";
    launcher.style.boxShadow = "0 12px 36px rgba(24,29,20,.12)";
  });
  launcher.addEventListener("click", async function () {
    if (!frame.src) {
      launcher.disabled = true;
      label.textContent = "Connecting…";
      try {
        var payload = await getSession();
        frame.name = JSON.stringify({
          session: payload.session,
          parentOrigin: payload.parentOrigin,
          sessionId: trackingAllowed() ? visitorSession() : undefined,
          path: safePath(),
        });
        frame.src = origin + "/widget/" + encodeURIComponent(soulId) + "?mode=chat";
      } catch (error) {
        console.error("Obseri:", error);
        label.textContent = "Unavailable";
        launcher.disabled = false;
        return;
      }
    }
    hideHelp();
    track("widget_opened");
    frame.style.display = "block";
    launcher.style.display = "none";
    launcher.setAttribute("aria-expanded", "true");
    launcher.disabled = false;
    label.textContent = "Ask a question";
  });

  window.addEventListener("message", function (event) {
    if (event.source !== frame.contentWindow || event.origin !== origin) return;
    if (!event.data) return;
    if (event.data.type === "obseri:conversation-started") {
      track("conversation_started");
      return;
    }
    if (event.data.type !== "obseri:close") return;
    frame.style.display = "none";
    launcher.style.display = "flex";
    launcher.setAttribute("aria-expanded", "false");
  });

  function layout() {
    if (mobile.matches) {
      root.style.left = "12px";
      root.style.right = "12px";
      root.style.bottom = "12px";
      frame.style.width = "100%";
      frame.style.height = "min(680px, calc(100vh - 92px))";
    } else {
      root.style.left = position === "left" ? "20px" : "auto";
      root.style.right = position === "right" ? "20px" : "auto";
      root.style.bottom = "20px";
      frame.style.width = "410px";
      frame.style.height = "680px";
    }
  }

  layout();
  mobile.addEventListener("change", layout);
  root.appendChild(frame);
  root.appendChild(launcher);
  document.body.appendChild(root);
  pageChanged();
})();
