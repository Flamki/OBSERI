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
    "margin-top:12px;display:flex;width:max-content;align-items:center;gap:4px;padding:6px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(13,17,13,.9);box-shadow:0 16px 40px rgba(0,0,0,.34);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);" +
    (position === "left" ? "margin-right:auto;" : "margin-left:auto;");

  var voiceButton = createLauncherButton("Start voice conversation", phoneIcon());
  var chatButton = createLauncherButton("Open text chat", chatIcon());
  var divider = document.createElement("span");
  divider.setAttribute("aria-hidden", "true");
  divider.style.cssText =
    "display:block;width:1px;height:20px;margin:0 1px;background:rgba(255,255,255,.1);";

  voiceButton.addEventListener("click", function () {
    toggleMode("voice");
  });
  chatButton.addEventListener("click", function () {
    toggleMode("chat");
  });

  function createLauncherButton(label, icon) {
    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = icon;
    button.style.cssText =
      "display:flex;width:44px;height:44px;flex:0 0 44px;align-items:center;justify-content:center;border:0;border-radius:999px;padding:0;background:transparent;color:rgba(255,255,255,.62);box-shadow:none;cursor:pointer;transition:color 180ms ease,box-shadow 180ms ease,background 180ms ease;";
    button.addEventListener("mouseenter", function () {
      if (button.getAttribute("aria-pressed") !== "true") {
        button.style.background = "rgba(255,255,255,.09)";
        button.style.color = "#ffffff";
      }
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
    renderButton(voiceButton, open && currentMode === "voice", "voice");
    renderButton(chatButton, open && currentMode === "chat", "chat");
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
    voiceButton.setAttribute("aria-pressed", String(open && currentMode === "voice"));
    chatButton.setAttribute("aria-pressed", String(open && currentMode === "chat"));
  }

  function renderButton(button, active, mode) {
    button.style.background = active ? (mode === "voice" ? accent : "#ffffff") : "transparent";
    button.style.color = active ? "#171a16" : "rgba(255,255,255,.62)";
    button.style.boxShadow = active ? "0 5px 14px rgba(0,0,0,.24)" : "none";
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
  launcher.appendChild(divider);
  launcher.appendChild(chatButton);
  root.appendChild(frame);
  root.appendChild(launcher);
  document.body.appendChild(root);
})();
