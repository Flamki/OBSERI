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
  var label = script.dataset.label || "Talk to this website";
  var mobile = window.matchMedia("(max-width: 520px)");
  var open = false;

  var root = document.createElement("div");
  root.id = "obseri-soul-" + soulId;
  root.style.cssText =
    "position:fixed;z-index:2147483000;bottom:20px;" +
    position +
    ":20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;";

  var frame = document.createElement("iframe");
  frame.title = label;
  frame.src = origin + "/widget/" + encodeURIComponent(soulId);
  frame.allow = "microphone; autoplay";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.style.cssText =
    "display:none;width:390px;height:660px;max-height:calc(100vh - 110px);border:0;background:transparent;filter:drop-shadow(0 24px 48px rgba(0,0,0,.36));";

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-expanded", "false");
  button.style.cssText =
    "margin-top:12px;margin-left:auto;display:flex;height:58px;min-width:58px;align-items:center;justify-content:center;gap:10px;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:0 18px;background:rgba(7,13,9,.88);color:white;box-shadow:0 18px 45px rgba(0,0,0,.35);backdrop-filter:blur(18px);cursor:pointer;font:700 12px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:-.02em;";
  button.innerHTML =
    '<span style="position:relative;display:block;width:20px;height:20px"><span style="position:absolute;inset:0;border-radius:50%;background:' +
    accent +
    ";box-shadow:0 0 24px " +
    accent +
    '"></span><span style="position:absolute;inset:5px;border-radius:50%;background:#10140f"></span></span><span class="obseri-label">' +
    escapeHtml(label) +
    "</span>";

  button.addEventListener("click", function () {
    open = !open;
    frame.style.display = open ? "block" : "none";
    button.setAttribute("aria-expanded", String(open));
    var labelNode = button.querySelector(".obseri-label");
    if (labelNode) labelNode.textContent = open ? "Close" : label;
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
      frame.style.width = "390px";
      frame.style.height = "660px";
    }
  }

  layout();
  mobile.addEventListener("change", layout);
  root.appendChild(frame);
  root.appendChild(button);
  document.body.appendChild(root);

  function escapeHtml(value) {
    var node = document.createElement("span");
    node.textContent = value;
    return node.innerHTML;
  }
})();
