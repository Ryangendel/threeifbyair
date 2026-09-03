/* ============================================================
   3 If By Air — site interactions
   No backend: reservations validate in-browser, save to
   localStorage, and open a pre-filled email to the host stand.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Config (edit these) ---------- */
  var RESTAURANT_EMAIL = "reservations@3ifbyair.com";
  var RESTAURANT_NAME = "3 If By Air";

  // Operating hours by weekday (0 = Sunday). null = closed.
  // Times are 24h. `lastSeatingBefore` = minutes before close for last seating.
  var HOURS = {
    0: { open: 10 * 60, close: 21 * 60 }, // Sun
    1: null,                              // Mon closed
    2: { open: 16 * 60, close: 21 * 60 }, // Tue
    3: { open: 16 * 60, close: 21 * 60 }, // Wed
    4: { open: 16 * 60, close: 21 * 60 }, // Thu
    5: { open: 11 * 60, close: 22 * 60 }, // Fri
    6: { open: 10 * 60, close: 22 * 60 }  // Sat
  };
  var LAST_SEATING_BEFORE_CLOSE = 60; // minutes
  var SLOT_STEP = 30;                  // minutes between reservation times
  var MAX_DAYS_AHEAD = 90;

  var DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ============================================================
     Header: scrolled state + active nav link
     ============================================================ */
  var header = $("#siteHeader");
  var sections = $$("section[id]");
  var navAnchors = $$(".nav-links a:not(.nav-cta)");

  function onScroll() {
    if (window.scrollY > 40) header.classList.add("scrolled");
    else header.classList.remove("scrolled");

    var pos = window.scrollY + 120;
    var currentId = "";
    sections.forEach(function (s) {
      if (s.offsetTop <= pos) currentId = s.id;
    });
    navAnchors.forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("href") === "#" + currentId);
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ============================================================
     Hero parallax — nudge the lakeview as you scroll
     ============================================================ */
  var heroBg = $("#heroBg");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (heroBg && !reduceMotion) {
    var ticking = false;
    var applyParallax = function () {
      var y = window.scrollY;
      // Only bother while the hero is roughly in view
      if (y < window.innerHeight) {
        heroBg.style.transform = "translate3d(0," + (y * 0.4) + "px, 0)";
      }
      ticking = false;
    };
    window.addEventListener("scroll", function () {
      if (!ticking) {
        window.requestAnimationFrame(applyParallax);
        ticking = true;
      }
    }, { passive: true });
    applyParallax();
  }

  /* ============================================================
     Mobile nav toggle
     ============================================================ */
  var toggle = $("#navToggle");
  var navLinks = $("#navLinks");
  function closeNav() {
    navLinks.classList.remove("open");
    toggle.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  }
  toggle.addEventListener("click", function () {
    var open = navLinks.classList.toggle("open");
    toggle.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
  });
  navLinks.addEventListener("click", function (e) {
    if (e.target.tagName === "A") closeNav();
  });

  /* ============================================================
     Menu tabs
     ============================================================ */
  var tabs = $$(".menu-tab");
  var panels = $$(".menu-panel");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var key = tab.getAttribute("data-tab");
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", String(on));
      });
      panels.forEach(function (p) {
        p.classList.toggle("is-active", p.getAttribute("data-panel") === key);
      });
    });
  });

  /* ============================================================
     Footer year + today's hours highlight
     ============================================================ */
  var yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  var todayIdx = new Date().getDay();
  var hoursItems = $$("#hoursList li");
  // list order in HTML is Mon..Sun; map weekday -> list index
  var listOrder = [1, 2, 3, 4, 5, 6, 0];
  var hlIndex = listOrder.indexOf(todayIdx);
  if (hoursItems[hlIndex]) hoursItems[hlIndex].classList.add("today");

  /* ============================================================
     Reservation form
     ============================================================ */
  var form = $("#reserveForm");
  var dateInput = $("#rDate");
  var timeSelect = $("#rTime");
  var successBox = $("#reserveSuccess");

  // Constrain the date picker: today .. today + MAX_DAYS_AHEAD
  function toISODate(d) {
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  var now = new Date();
  var maxDate = new Date();
  maxDate.setDate(now.getDate() + MAX_DAYS_AHEAD);
  dateInput.min = toISODate(now);
  dateInput.max = toISODate(maxDate);

  // Parse "YYYY-MM-DD" as a LOCAL date (avoids UTC off-by-one)
  function parseLocalDate(str) {
    if (!str) return null;
    var parts = str.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function minutesToLabel(mins) {
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ":" + String(m).padStart(2, "0") + " " + ampm;
  }

  // Rebuild the time dropdown for the chosen date
  function populateTimes() {
    var d = parseLocalDate(dateInput.value);
    timeSelect.innerHTML = "";

    if (!d) {
      timeSelect.appendChild(new Option("Pick a date first…", ""));
      return;
    }
    var hrs = HOURS[d.getDay()];
    if (!hrs) {
      timeSelect.appendChild(new Option("Closed on " + DAY_NAMES[d.getDay()] + "s", ""));
      return;
    }

    var lastSeating = hrs.close - LAST_SEATING_BEFORE_CLOSE;
    var isToday = toISODate(d) === toISODate(new Date());
    var nowMins = new Date().getHours() * 60 + new Date().getMinutes();

    timeSelect.appendChild(new Option("Select a time…", ""));
    var added = 0;
    for (var t = hrs.open; t <= lastSeating; t += SLOT_STEP) {
      // For today, only show slots at least 60 min out
      if (isToday && t < nowMins + 60) continue;
      timeSelect.appendChild(new Option(minutesToLabel(t), minutesToLabel(t)));
      added++;
    }
    if (added === 0) {
      timeSelect.innerHTML = "";
      timeSelect.appendChild(new Option("No times left today — please pick another day", ""));
    }
  }
  dateInput.addEventListener("change", function () {
    populateTimes();
    clearError("rDate");
    clearError("rTime");
  });

  /* ---------- Validation helpers ---------- */
  function fieldOf(id) { return document.getElementById(id).closest(".field"); }
  function setError(id, msg) {
    var f = fieldOf(id);
    if (f) f.classList.add("invalid");
    var el = $('.error[data-for="' + id + '"]');
    if (el) el.textContent = msg;
  }
  function clearError(id) {
    var f = fieldOf(id);
    if (f) f.classList.remove("invalid");
    var el = $('.error[data-for="' + id + '"]');
    if (el) el.textContent = "";
  }
  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function isPhone(v) { return (v.replace(/[^\d]/g, "").length >= 10); }

  // Clear an error as soon as the user edits a field
  $$("#reserveForm input, #reserveForm select, #reserveForm textarea").forEach(function (el) {
    el.addEventListener("input", function () { clearError(el.id); });
    el.addEventListener("change", function () { clearError(el.id); });
  });

  function validate() {
    var ok = true;
    var v = function (id) { return (document.getElementById(id).value || "").trim(); };

    if (!v("rName")) { setError("rName", "Please tell us your name."); ok = false; }

    var party = v("rParty");
    if (!party) { setError("rParty", "Choose a party size."); ok = false; }
    else if (party === "9+") { setError("rParty", "Parties of 9+ — add a note below and we'll confirm by email."); ok = false; }

    if (!v("rEmail")) { setError("rEmail", "Email is required."); ok = false; }
    else if (!isEmail(v("rEmail"))) { setError("rEmail", "Enter a valid email address."); ok = false; }

    if (!v("rPhone")) { setError("rPhone", "Phone is required."); ok = false; }
    else if (!isPhone(v("rPhone"))) { setError("rPhone", "Enter a valid phone number."); ok = false; }

    var dateStr = v("rDate");
    var d = parseLocalDate(dateStr);
    if (!dateStr || !d) { setError("rDate", "Choose a date."); ok = false; }
    else {
      var today0 = new Date(); today0.setHours(0, 0, 0, 0);
      if (d < today0) { setError("rDate", "Please pick a future date."); ok = false; }
      else if (!HOURS[d.getDay()]) { setError("rDate", "We're closed on " + DAY_NAMES[d.getDay()] + "s."); ok = false; }
    }

    if (!v("rTime")) { setError("rTime", "Choose a time."); ok = false; }

    return ok;
  }

  /* ---------- Submit ---------- */
  function makeRef() {
    var d = new Date();
    var stamp = toISODate(d).replace(/-/g, "").slice(2); // YYMMDD
    var rand = Math.floor(1000 + Math.random() * 9000);
    return "3IBA-" + stamp + "-" + rand;
  }

  function saveLocal(record) {
    try {
      var key = "3iba_reservations";
      var list = JSON.parse(localStorage.getItem(key) || "[]");
      list.push(record);
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) { /* storage may be unavailable; not critical */ }
  }

  function buildMailto(r) {
    var subject = "Reservation Request — " + r.name + " — " + r.date + " " + r.time;
    var lines = [
      "New reservation request for " + RESTAURANT_NAME + ".",
      "",
      "Reference: " + r.ref,
      "Name: " + r.name,
      "Party size: " + r.party,
      "Date: " + r.dateLong,
      "Time: " + r.time,
      "Seating: " + r.seating,
      "Occasion: " + (r.occasion || "—"),
      "Phone: " + r.phone,
      "Email: " + r.email,
      "",
      "Special requests:",
      (r.notes || "None"),
      "",
      "— Sent from the 3 If By Air website reservation form."
    ];
    return "mailto:" + RESTAURANT_EMAIL +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(lines.join("\n"));
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!validate()) {
      var firstInvalid = $(".field.invalid input, .field.invalid select");
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    var d = parseLocalDate(dateInput.value);
    var dateLong = DAY_NAMES[d.getDay()] + ", " +
      d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

    var record = {
      ref: makeRef(),
      name: $("#rName").value.trim(),
      party: $("#rParty").value,
      email: $("#rEmail").value.trim(),
      phone: $("#rPhone").value.trim(),
      date: dateInput.value,
      dateLong: dateLong,
      time: $("#rTime").value,
      seating: $("#rSeating").value,
      occasion: $("#rOccasion").value,
      notes: $("#rNotes").value.trim(),
      submittedAt: new Date().toISOString()
    };

    saveLocal(record);

    // Open a pre-filled email to the host stand (no backend needed).
    // To use a form service instead, POST `record` to your endpoint here.
    window.location.href = buildMailto(record);

    // Show confirmation
    $("#successSummary").textContent =
      "Thanks, " + record.name + "! We received your request for a party of " +
      record.party + " on " + record.dateLong + " at " + record.time +
      " (" + record.seating + ").";
    $("#confRef").textContent = record.ref;

    form.hidden = true;
    successBox.hidden = false;
    successBox.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // "Make another request"
  var again = $("#reserveAgain");
  if (again) {
    again.addEventListener("click", function () {
      form.reset();
      populateTimes();
      successBox.hidden = true;
      form.hidden = false;
      $("#rName").focus();
    });
  }

  // init
  populateTimes();
})();
