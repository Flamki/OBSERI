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
  launcher.setAttribute("aria-label", "Open voice chat");
  launcher.setAttribute("aria-expanded", "false");
  launcher.style.cssText =
    "margin-top:12px;display:flex;width:max-content;align-items:center;gap:12px;padding:8px 18px 8px 9px;border:1px solid rgba(25,28,23,.1);border-radius:999px;background:#fff;color:#20221f;box-shadow:0 12px 36px rgba(24,29,20,.12);cursor:pointer;font:500 16px/1.1 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;transition:transform 180ms ease,box-shadow 180ms ease;" +
    (position === "left" ? "margin-right:auto;" : "margin-left:auto;");

  var orb = document.createElement("span");
  orb.setAttribute("aria-hidden", "true");
  orb.style.cssText =
    "display:block;width:42px;height:42px;flex:0 0 42px;border-radius:50%;background:radial-gradient(circle at 28% 24%,rgba(255,229,76,.98),transparent 31%),radial-gradient(circle at 74% 70%,rgba(47,180,255,.98),transparent 35%),radial-gradient(circle at 24% 78%,rgba(75,205,224,.92),transparent 33%),radial-gradient(circle at 75% 20%,rgba(106,211,237,.88),transparent 31%),#88c8d4;box-shadow:inset 0 0 12px rgba(255,255,255,.25),0 5px 14px rgba(56,143,165,.2);";
  var label = document.createElement("span");
  label.textContent = "Voice chat";
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
  launcher.addEventListener("click", function () {
    if (!frame.src) {
      frame.src = origin + "/widget/" + encodeURIComponent(soulId) + "?mode=voice";
    }
    frame.style.display = "block";
    launcher.style.display = "none";
    launcher.setAttribute("aria-expanded", "true");
  });

  window.addEventListener("message", function (event) {
    if (event.source !== frame.contentWindow || event.origin !== origin) return;
    if (!event.data || event.data.type !== "obseri:close") return;
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
})();
