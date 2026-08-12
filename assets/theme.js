/* Rugby Archive — the theme switch.
   Two looks over one layout. The terminal theme is the default because nearly
   every value on this site is a number, and a monospace font aligns digits
   down the page; the light theme is kept for anyone who wants it, and for
   print.

   This file lives on its own, and is loaded from the <head> of EVERY page,
   for two reasons:

   1. The switch is drawn on all four pages. When this code lived inside
      app.js it only ran on the Super Filter, so on the other three pages the
      buttons were painted but wired to nothing - Terminal showed as selected
      while the page rendered light.
   2. Loaded in the <head>, the attribute is set before the browser paints
      anything, so a returning visitor never sees a white flash before the
      dark theme arrives.

   The buttons are wired on DOMContentLoaded, because at <head> time they do
   not exist yet.

   localStorage is wrapped: a browser can refuse it (private mode, or a
   file:// page under a strict policy) and a theme preference is never worth
   throwing an exception over. */
(function () {
  "use strict";
  var THEMES = ["terminal", "light"];
  var KEY = "rugby-theme";

  function paintButtons(name) {
    var box = document.getElementById("themeswitch");
    if (!box) return;
    Array.prototype.forEach.call(box.children, function (b) {
      b.className = b.getAttribute("data-theme") === name ? "on" : "";
    });
  }

  function applyTheme(name, remember) {
    if (THEMES.indexOf(name) === -1) name = THEMES[0];
    document.documentElement.setAttribute("data-theme", name);
    paintButtons(name);
    if (remember) {
      try { localStorage.setItem(KEY, name); } catch (err) { /* fine */ }
    }
    return name;
  }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (err) { /* fine */ }
  var current = applyTheme(saved || THEMES[0], false);

  function wire() {
    paintButtons(current);
    var box = document.getElementById("themeswitch");
    if (!box) return;
    box.addEventListener("click", function (e) {
      var t = e.target, b = null;
      while (t && t !== box) {
        if (t.getAttribute && t.getAttribute("data-theme")) { b = t; break; }
        t = t.parentNode;
      }
      if (b) current = applyTheme(b.getAttribute("data-theme"), true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

  window.RUGBY_THEME = { apply: applyTheme, current: function () { return current; } };
}());
