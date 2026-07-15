(function () {
  "use strict";

  var script = document.currentScript;
  if (!script || script.dataset.obseriMounted === "true") return;
  script.dataset.obseriMounted = "true";

  var soulId = script.dataset.soulId;
  if (!soulId) {
    console.error("Obseri: data-soul-id is required.");
    return;
  }

  var scriptUrl = new URL(script.src, window.location.href);
  var origin = scriptUrl.origin;
  var position = script.dataset.position === "bottom-left" ? "left" : "right";
  var accent = script.dataset.accent || "#b6ff60";
  var mobile = window.matchMedia("(max-width: 520px)");
  var currentMode = null;
  var open = false;

  var root = document.createElement("div");
  root.id = "obseri-soul-" + soulId;
  root.style.cssText =
    "position:fixed;z-index:2147483000;bottom:20px;" +
    position +
    ":20px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";

  var frame = document.createElement("iframe");
  frame.title = "Obseri website assistant";
  frame.allow = "microphone; autoplay";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.style.cssText =
    "display:none;width:390px;height:660px;max-height:calc(100vh - 110px);border:0;background:transparent;filter:drop-shadow(0 24px 48px rgba(0,0,0,.36));";

  var launcher = document.createElement("div");
  launcher.setAttribute("role", "group");
  launcher.setAttribute("aria-label", "Choose how to talk with this website");
  launcher.style.cssText =
    "margin-top:12px;display:flex;align-items:center;" +
    (position === "left" ? "justify-content:flex-start;" : "justify-content:flex-end;") +
    "filter:drop-shadow(0 14px 30px rgba(0,0,0,.34));";

  var voiceButton = createLauncherButton(
    "Start voice conversation",
    phoneIcon(),
    accent,
    "#171a16",
  );
  voiceButton.style.zIndex = "1";

  var chatButton = createLauncherButton("Open text chat", chatIcon(), "#171a16", "#ffffff");
  chatButton.style.marginLeft = "-8px";

  voiceButton.addEventListener("click", function () {
    toggleMode("voice");
  });
  chatButton.addEventListener("click", function () {
    toggleMode("chat");
  });

  function createLauncherButton(label, icon, background, color) {
    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-expanded", "false");
    button.title = label;
    button.innerHTML = icon;
    button.style.cssText =
      "position:relative;display:flex;width:58px;height:58px;flex:0 0 58px;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.72);border-radius:999px;padding:0;background:" +
      background +
      ";color:" +
      color +
      ";box-shadow:0 10px 26px rgba(0,0,0,.22);cursor:pointer;transition:transform 180ms ease,box-shadow 180ms ease,background 180ms ease;";
    button.addEventListener("mouseenter", function () {
      button.style.transform = "translateY(-2px) scale(1.03)";
    });
    button.addEventListener("mouseleave", function () {
      renderLauncherState();
    });
    return button;
  }

  function toggleMode(mode) {
    if (open && currentMode === mode) {
      open = false;
      frame.style.display = "none";
      renderLauncherState();
      return;
    }

    if (currentMode !== mode) {
      frame.src =
        origin + "/widget/" + encodeURIComponent(soulId) + "?mode=" + encodeURIComponent(mode);
      frame.title = mode === "voice" ? "Obseri voice conversation" : "Obseri text chat";
    }
    currentMode = mode;
    open = true;
    frame.style.display = "block";
    renderLauncherState();
  }

  function renderLauncherState() {
    renderButton(voiceButton, open && currentMode === "voice", 2);
    renderButton(chatButton, open && currentMode === "chat", 3);
    voiceButton.setAttribute("aria-expanded", String(open && currentMode === "voice"));
    chatButton.setAttribute("aria-expanded", String(open && currentMode === "chat"));
    voiceButton.setAttribute(
      "aria-label",
      open && currentMode === "voice" ? "Close voice conversation" : "Start voice conversation",
    );
    chatButton.setAttribute(
      "aria-label",
      open && currentMode === "chat" ? "Close text chat" : "Open text chat",
    );
  }

  function renderButton(button, active, activeZIndex) {
    button.style.transform = active ? "scale(1.06)" : "none";
    button.style.zIndex = active ? String(activeZIndex) : button === voiceButton ? "1" : "0";
    button.style.boxShadow = active
      ? "0 0 0 3px rgba(255,255,255,.44),0 14px 32px rgba(0,0,0,.3)"
      : "0 10px 26px rgba(0,0,0,.22)";
  }

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
      frame.style.width = "390px";
      frame.style.height = "660px";
    }
  }

  function phoneIcon() {
    return '<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.68 2.8a2 2 0 0 1-.45 2.11L8.07 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.32 1.84.55 2.8.68A2 2 0 0 1 22 16.92z"/></svg>';
  }

  function chatIcon() {
    return '<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>';
  }

  layout();
  renderLauncherState();
  mobile.addEventListener("change", layout);
  launcher.appendChild(voiceButton);
  launcher.appendChild(chatButton);
  root.appendChild(frame);
  root.appendChild(launcher);
  document.body.appendChild(root);
})();
