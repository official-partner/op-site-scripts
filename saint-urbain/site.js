gsap.registerPlugin(ScrollTrigger);

// Safari (iOS especially) shows/hides its URL bar when you scroll to the top or
// bottom, which changes innerHeight and would trigger a ScrollTrigger refresh →
// visible "jump". Ignore those toolbar-driven resizes.
ScrollTrigger.config({ ignoreMobileResize: true });

/* ─────────────────────────────────────────────
   CONFIG & STATE
───────────────────────────────────────────── */
const mm = gsap.matchMedia();
let lenis, lenisActive = false;
const hasLenis         = typeof window.Lenis        !== "undefined";
const hasScrollTrigger = typeof window.ScrollTrigger !== "undefined";
let swiperInstances = [];

/* ─────────────────────────────────────────────
   UTILS
───────────────────────────────────────────── */
function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

function clearStyles(el) {
  (typeof el === 'string' ? [...document.querySelectorAll(el)] : [el])
    .forEach(e => e?.removeAttribute('style'));
}

const isStaging = window.location.hostname.includes('webflow.io');

/* ─────────────────────────────────────────────
   LAZY LIBRARIES
   — Libraries only some pages need (Swiper) are loaded on demand
     instead of on every page. Promise-cached so a library is fetched
     once per session. Resolves immediately if the footer still loads
     it, so the footer tag can be removed whenever you're ready.
───────────────────────────────────────────── */
const LIBS = {
  swiper:     { global: 'Swiper',     src: 'https://cdn.jsdelivr.net/npm/swiper@8/swiper-bundle.min.js' },
  // Pinned to the running GSAP version so the plugin always matches the core.
  customEase: { global: 'CustomEase', src: `https://cdn.jsdelivr.net/npm/gsap@${gsap.version}/dist/CustomEase.min.js` }
};
const libPromises = {};
function ensureLib(name) {
  if (libPromises[name]) return libPromises[name];
  const lib = LIBS[name];
  libPromises[name] = new Promise((resolve, reject) => {
    if (window[lib.global]) return resolve(window[lib.global]);
    const s = document.createElement('script');
    s.src = lib.src;
    s.async = true;
    s.onload  = () => resolve(window[lib.global]);
    s.onerror = () => { delete libPromises[name]; reject(new Error('Failed to load ' + name)); };
    document.head.appendChild(s);
  });
  return libPromises[name];
}

/* ─────────────────────────────────────────────
   EASES
   — Sam's CustomEase library, registered as soon as CustomEase is
     available (lazy-loaded, 2 KB, pinned to the running GSAP version).
     Until it lands, easeOr(name, fallback) returns the fallback so no
     tween ever runs on a missing ease (GSAP would silently default).
───────────────────────────────────────────── */
const EASE_LIBRARY = {
  osmo:       'M0,0 C0.625,0.05 0,1 1,1',      // slow lead, authoritative settle
  energy:     'M0,0 C0.32,0.72 0,1 1,1',       // snappy ease-out: click reactions, entrances
  smooth:     'M0,0 C0.38,0.005 0.215,1 1,1',  // refined expo-out
  punch:      'M0,0 C0.19,1 0.22,1 1,1',       // near-instant snap
  relaxed:    'M0,0 C0.7,0 0.3,1 1,1',         // gentle symmetric in-out
  parallax:   '0.7, 0.05, 0.13, 1',            // big surface travel (OSMO / Nouvelle Idée)
  jump:       'M0,0 C0.35,1.5 0.6,1 1,1',      // overshoot accent
  anticipate: 'M0,0 C0.8,-0.4 0.5,1 1,1',      // winds back then springs
  fade:       'M0,0 C0.25,0.1 0.25,1 1,1'      // gentle, for opacity
};

function registerEases() {
  if (!window.CustomEase) return;
  gsap.registerPlugin(CustomEase);
  Object.entries(EASE_LIBRARY).forEach(([name, path]) => {
    if (!gsap.parseEase(name)) CustomEase.create(name, path);
  });
}
registerEases();
if (!window.CustomEase) ensureLib('customEase').then(registerEases).catch(() => {});

function easeOr(name, fallback) {
  return gsap.parseEase(name) ? name : fallback;
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ═══════════════════════════════════════════════
   RECIPES — plain GSAP timeline code
   Edit these (or live in the tune panel with "t" on staging). Everything
   structural is plumbing; recipes only animate. Each gets an empty (or
   prepared) timeline `tl` and a context, adds tweens to `tl`, returns
   nothing. A recipe that throws is logged as "[recipe] <kind>" and the
   plumbing falls back to an instant swap, never a broken site.

   enter        page transition. Both containers are in the DOM.
                ctx.current  outgoing page, still in flow
                ctx.next     incoming page, fixed on top (.fixed)
                ctx.dir      +1 / -1 from the clicked nav link's position
                ctx.vh       window.innerHeight
                ctx.scrollY  scroll position of the outgoing page
                ctx.q(s)     next.querySelectorAll(s)
                Barba waits for `tl`, then the plumbing clears inline styles.
   txtBtnLine   .txt-btn hover. ctx.wrap = .txt-btn-line-wrap, ctx.btn = the .txt-btn
   logoShrink   nav logo on scroll. `tl` is paused; a ScrollTrigger plays it past
                nav.shrinkTriggerAt and reverses on the way back up.
                ctx.nav = live breakpoint config (logoShrunk, shrinkDuration, shrinkEase, ...)
   servicesSwap Services page frame and project cards: a new visual comes in on top.
                ctx.next = incoming layer (visible, on top) · ctx.media = what
                zooms inside it · ctx.prev = the layer underneath (or null)
                The plumbing reshapes the window to the new format alongside
                and hides what's underneath when `tl` ends.
   servicesCard Services page project card, dealt out of the frame or folded back.
                ctx.card · ctx.show (false = fold, scale 0) · ctx.rotation =
                its tilt · ctx.index = its place in the row (0 next to the frame)
                Travel is plumbing (the cards trail the pointer); this sets scale and tilt.
   awardsBadge  About awards: the floating award badge coming out or going away.
                ctx.badge · ctx.show (false = going away). Travel, lean and the
                coin flip between awards are plumbing (springs in AWARDS_HOVER).
   awardsRow    About awards: the hovered row steps right and its line draws across.
                ctx.row (what steps) · ctx.line · ctx.show · ctx.nudge = px ·
                ctx.origin = where the line grows from or leaves to (chosen so
                it never jumps when a hover is cut short)
   heroTrail    Services hero: one visual popping out of a hovered service word.
                ctx.image (a new one each time, on top) · ctx.x / ctx.y = where
                its centre lands (the word's middle, sideways jitter included)
                · ctx.rise = px it starts below that · ctx.tilt = max random
                tilt (deg). The plumbing removes the visual when `tl` ends.
   industryFlip Services industries: a pill rolling over like a cube onto its
                yellow side, or back. ctx.box (turns on rotationX) · ctx.to =
                the angle it lands on (a quarter turn per roll, either way) ·
                ctx.show (false = back to its own colour)
   marqueeIn    Marquees: a slide coming into the strip (dragged, scrolled or
                drifting in). ctx.item = the slide's content (the slide keeps
                its place) · ctx.side = 1 coming in on the right, -1 on the
                left · ctx.rem = px per rem. The plumbing puts the content
                back in place when the slide leaves the strip.
   filtersToggle Work page: the Filters button opening or closing the filter
                block. ctx.panel (grows from its current height to its own,
                or back to 0) · ctx.rows (its .line-flex rows) · ctx.icon
                (the + that turns into an ×) · ctx.open · ctx.rem = px per rem.
                The plumbing hides the block once it has closed.
   workHover    Work cards: the hover visuals coming up over the thumbnail, or
                going away. ctx.layer (.work-hover-visuals) · ctx.show. Only
                fades: what's inside switches crisply, every WORK_HOVER.step s.
   labSwap      services lab frame (wave, follow): a new visual comes in on top.
                ctx.next = incoming .lab-media-item (already visible, on top)
                ctx.media = its <img>/<video> · ctx.frame = the .lab-frame
                ctx.dir = +1 moving down the list, -1 moving up
                The plumbing hides the previous visual when `tl` ends.
   labDeal      services lab cards (deal): one card travels to its slot.
                ctx.card · ctx.x / ctx.y / ctx.rotation = where it lands
                ctx.show = false when it folds back into the word (scale 0)
                ctx.ripple = true on a line change (each card its own pace)
   Eases: osmo · smooth · energy · punch · relaxed · jump · anticipate · fade · parallax + GSAP built-ins.
═══════════════════════════════════════════════ */
const RECIPES = {
  enter(tl, { current, next, dir }) {

    // ── outgoing page pushed out the way the nav points, incoming page follows it in
    tl.to(current, {
      xPercent: 100 * dir,
      duration: 1.25,
      ease: "power4.inOut",
    }, 0);

    tl.from(next, {
      xPercent: -100 * dir,
      duration: 1.25,
      ease: "power4.inOut",
    }, 0);
  },

  txtBtnLine(tl, { wrap }) {

    // ── line enters from the left and leaves on the right, every hover from the start
    tl.fromTo(wrap, {
      xPercent: -100,
      x: 0,
    }, {
      xPercent: 100,
      x: 0,
      duration: 0.6,
      ease: "power2.inOut",
      overwrite: true,
    }, 0);
  },

  logoShrink(tl, { nav }) {

    // ── logo collapses to its small state; the bottom divider fades in alongside
    tl.to(".nav-big-logo-wrap", {
      ...nav.logoShrunk,
      duration: nav.shrinkDuration,
      ease: nav.shrinkEase,
    }, 0);

    tl.to(".line-divider-nav.is-bottom", {
      opacity: nav.dividerVisibleOpacity,
      duration: nav.shrinkDuration,
      ease: nav.shrinkEase,
    }, "<");
  },

  servicesSwap(tl, { next, media }) {

    // ── the new visual comes in over the one showing with a quick fade and settles from a slight zoom
    tl.fromTo(next, {
      opacity: 0,
    }, {
      opacity: 1,
      duration: 0.15,
      ease: "power1.out",
    }, 0);

    tl.fromTo(media, {
      scale: 1.06,
    }, {
      scale: 1,
      duration: 0.5,
      ease: "energy",
    }, 0);
  },

  servicesCard(tl, { card, show, rotation, index }) {

    // ── a project card is dealt out of the frame with a little overshoot, or folds back into it
    tl.to(card, {
      scale: show ? 1 : 0,
      rotation,
      duration: show ? 0.42 : 0.25,
      delay: show ? index * 0.03 : 0,
      ease: show ? "back.out(1.5)" : "power2.in",
    }, 0);
  },

  awardsBadge(tl, { badge, show }) {

    // ── the award badge pops out with a little overshoot, or shrinks away
    tl.to(badge, {
      scale: show ? 1 : 0.6,
      opacity: show ? 1 : 0,
      duration: show ? 0.5 : 0.25,
      ease: show ? "back.out(1.7)" : "power2.in",
    }, 0);
  },

  awardsRow(tl, { row, line, show, nudge, origin }) {

    // ── the hovered award steps right and its line draws across; leaving, both ease back
    tl.to(row, {
      x: show ? nudge : 0,
      duration: show ? 0.45 : 0.35,
      ease: show ? "energy" : "power3.out",
    }, 0);

    tl.set(line, { transformOrigin: origin }, 0);
    tl.to(line, {
      scaleX: show ? 1 : 0,
      duration: show ? 0.5 : 0.35,
      ease: show ? "energy" : "power2.inOut",
    }, 0);
  },

  heroTrail(tl, { image, x, y, rise, tilt }) {

    // ── a visual pops up out of the hovered word with a bounce, holds a beat, then shrinks a touch and is gone
    tl.fromTo(image, {
      xPercent: -50,
      yPercent: -50,
      x,
      y: y + rise,
      rotation: gsap.utils.random(-tilt, tilt),
    }, {
      y,
      rotation: gsap.utils.random(-tilt, tilt),
      duration: 0.4,
      ease: "back.out(3)",
    }, 0);

    tl.to(image, {
      scale: 0.9,
      duration: 0.2,
      ease: "back.in(2)",
    }, 0.5);
  },

  industryFlip(tl, { box, to, show }) {

    // ── the pill rolls over like a cube onto its colour with a little overshoot; leaving, it rolls back a touch quicker
    tl.to(box, {
      rotationX: to,
      duration: show ? 0.6 : 0.45,
      ease: show ? "back.out(1.6)" : "power3.out",
    }, 0);
  },

  marqueeIn(tl, { item, side, rem }) {

    // ── a slide coming into the strip flies in from further out on its side and grows into place (after mwg_effect088)
    tl.fromTo(item, {
      x: side * 25 * rem,
      scale: 0.6,
    }, {
      x: 0,
      scale: 1,
      duration: 0.8,
      ease: "power3.out",
    }, 0);
  },

  filtersToggle(tl, { panel, rows, icon, open, rem }) {

    // ── the filter block unfolds under the button and its rows rise in one after the other; closing, it folds back up quicker
    tl.to(panel, {
      height: open ? "auto" : 0,
      duration: open ? 0.6 : 0.45,
      ease: open ? "smooth" : "power3.inOut",
    }, 0);

    if (open) {
      tl.fromTo(rows, {
        opacity: 0,
        y: 0.75 * rem,
      }, {
        opacity: 1,
        y: 0,
        duration: 0.5,
        stagger: 0.06,
        ease: "power3.out",
      }, 0.12);
    } else {
      tl.to(rows, {
        opacity: 0,
        duration: 0.2,
        ease: "power2.in",
      }, 0);
    }

    // ── the + turns a quarter of the way round into an ×, and back
    tl.to(icon, {
      rotation: open ? 45 : 0,
      duration: 0.5,
      ease: "energy",
    }, 0);
  },

  workHover(tl, { layer, show }) {

    // ── the card's hover visuals come up over its thumbnail, and go away as the pointer leaves
    tl.to(layer, {
      opacity: show ? 1 : 0,
      duration: 0.2,
      ease: show ? "power1.out" : "power1.in",
    }, 0);
  },

  labSwap(tl, { next, media, frame, dir }) {

    // ── new visual wipes in from the side the list is moving toward, settles from a zoom; the frame kicks
    tl.fromTo(next, {
      clipPath: dir > 0 ? "inset(100% 0% 0% 0%)" : "inset(0% 0% 100% 0%)",
    }, {
      clipPath: "inset(0% 0% 0% 0%)",
      duration: 0.6,
      ease: "osmo",
    }, 0);

    tl.fromTo(media, {
      scale: 1.25,
    }, {
      scale: 1,
      duration: 0.9,
      ease: "osmo",
    }, 0);

    tl.fromTo(frame, {
      scale: 0.95,
    }, {
      scale: 1,
      duration: 0.5,
      ease: "jump",
    }, 0);
  },

  labDeal(tl, { card, x, y, rotation, show, ripple }) {

    // ── card travels to its slot; on a line change each card takes its own time so the strip ripples
    tl.to(card, {
      x,
      y,
      rotation,
      scale: show ? 1 : 0,
      duration: ripple ? gsap.utils.random(0.25, 0.55) : 0.4,
      ease: show ? "back.out(1.3)" : "power3.in",
    }, 0);
  },

  serviceCard(tl, { visual, show }) {

    // ── service picture comes up behind the card's name on hover, leaves a little quicker
    tl.to(visual, {
      opacity: show ? 1 : 0,
      duration: show ? 0.35 : 0.25,
      ease: show ? "power2.out" : "power2.in",
      overwrite: true,
    }, 0);
  },

  workView(tl, { cards }) {

    // ── switching Bento / 3x3, every card travels and reshapes into its new place, a hair after the one before it
    tl.to(cards, {
      p: 1,
      duration: 0.85,
      ease: "parallax",
      stagger: { each: 0.012, from: "start" },
    }, 0);
  },

  featureSwap(tl, { next, prev }) {

    // ── the sticky picture and its caption cross-fade to the feature being read
    tl.to(prev, {
      opacity: 0,
      duration: 0.4,
      ease: "power1.out",
      overwrite: true,
    }, 0);
    tl.to(next, {
      opacity: 1,
      duration: 0.4,
      ease: "power1.out",
      overwrite: true,
    }, 0);
  },
};

// Plumbing entry point: run a recipe on `tl`; a throwing recipe becomes an instant swap.
function runRecipe(kind, tl, ctx) {
  if (reducedMotion) return tl;
  try { RECIPES[kind](tl, ctx); }
  catch (e) { console.error("[recipe] " + kind, e); tl.clear(); }
  return tl;
}

/* ── Dev helpers — staging only ── */
function initTuner() {
  if (!isStaging || window.__suDevHelpers) return;
  window.__suDevHelpers = true;

  // Recipe editor (initTunePanel below). Press "t" or add ?tune.
  const toggleTune = () => (window.SU_TUNE ? window.SU_TUNE.toggle() : initTunePanel());
  if (new URLSearchParams(location.search).has("tune")) toggleTune();

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, [contenteditable]")) return; // typing in the panel
    if (e.key === "t" || e.key === "T") toggleTune();
  });
}

/* ═══════════════════════════════════════════════
   TUNE PANEL — recipe editor (staging only)
   Shows the source of each RECIPES entry. Edit, Apply (⌘/Ctrl+S or Enter)
   → the function is rebuilt and the next run uses it. It's real GSAP:
   tl.to / from / fromTo / set / add, "<", ">", labels, any registered ease.
   Edits persist in localStorage until Reset. Copy → paste the block in chat.
═══════════════════════════════════════════════ */
function initTunePanel() {
  const STORAGE = "su-recipes";
  const KEYS    = Object.keys(RECIPES); // enter · txtBtnLine · logoShrink · servicesSwap · servicesCard · awardsBadge · awardsRow · heroTrail · industryFlip · marqueeIn · filtersToggle · workHover · labSwap · labDeal · serviceCard · featureSwap · workView

  // toString() returns the method as nested in the object (body at 4 spaces, brace at 2);
  // dedent so the editor shows the same shape as the file. `copy` re-indents for pasting.
  const normalize = (src) => {
    const lines = src.split("\n");
    const rest  = lines.slice(1).filter(l => l.trim());
    const min   = rest.length ? Math.min(...rest.map(l => l.match(/^ */)[0].length)) : 0;
    return [lines[0], ...lines.slice(1).map(l => l.slice(Math.min(min, l.match(/^ */)[0].length)))].join("\n");
  };
  const DEFAULTS = Object.fromEntries(KEYS.map(k => [k, normalize(RECIPES[k].toString())])); // code as shipped

  // Method-shorthand source (`enter(tl, ctx) { … }`) → function, via an object literal wrapper
  const compile = (key, src) => new Function(`return ({ ${src} }).${key};`)();

  // ── Restore last session's edits — only if they were made against THIS version of the file.
  // Saved alongside the defaults they started from; a changed file wins and the edits are dropped.
  let sources = { ...DEFAULTS };
  let loadNote = "ready";
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    if (saved) {
      const sameFile = KEYS.every(k => saved.base?.[k] === DEFAULTS[k]);
      if (sameFile) {
        KEYS.forEach(k => { RECIPES[k] = compile(k, saved.sources[k]); sources[k] = saved.sources[k]; });
        loadNote = "running your saved edits (↺ reset for the file's code)";
      } else {
        localStorage.removeItem(STORAGE);
        loadNote = "sainturbain-v2.js changed — showing the file's code, previous edits dropped";
      }
    }
  } catch (e) { console.warn("[tune] saved recipes ignored:", e); localStorage.removeItem(STORAGE); }
  const save = () => localStorage.setItem(STORAGE, JSON.stringify({ base: DEFAULTS, sources }));

  // ── Styles (palette ≈ CodeSandbox dark)
  const css = document.createElement("style");
  css.textContent = `
    #su-tune { position: fixed; right: 16px; bottom: 16px; z-index: 99999; width: 620px; max-height: calc(100vh - 32px);
      display: flex; flex-direction: column; gap: 8px; padding: 10px 12px 12px; box-sizing: border-box; overflow: auto;
      background: #151515; color: #e0e0e0; border: 1px solid #2a2a2a; border-radius: 10px;
      font: 12.5px/1.55 ui-monospace, "SF Mono", Menlo, Consolas, monospace; box-shadow: 0 12px 40px rgba(0,0,0,.6); }
    #su-tune * { box-sizing: border-box; }
    #su-tune header { display: flex; align-items: center; gap: 10px; }
    #su-tune header b { flex: 1; font-weight: 600; color: #fff; }
    #su-tune label { display: block; color: #757575; margin: 6px 0 3px; font-style: italic; }

    /* editor = highlighted <pre> underneath, transparent-text <textarea> on top, identical metrics */
    #su-tune .editor { position: relative; }
    #su-tune .editor pre, #su-tune .editor textarea { margin: 0; padding: 10px 12px; border: 1px solid #2a2a2a; border-radius: 6px;
      font: inherit; line-height: inherit; tab-size: 2; white-space: pre; overflow: auto; overflow-wrap: normal; }
    #su-tune .editor pre { position: absolute; inset: 0; pointer-events: none; background: #0f0f0f; color: #e0e0e0; }
    #su-tune .editor textarea { position: relative; display: block; width: 100%; resize: vertical; background: transparent;
      color: transparent; caret-color: #fff; }
    #su-tune .editor textarea::selection { background: rgba(120,140,255,.3); }
    #su-tune .editor textarea:focus { outline: 1px solid #8f9cff; }
    #su-tune .editor textarea { min-height: 300px; height: 440px; }

    /* tokens */
    #su-tune .c { color: #757575; font-style: italic; }   /* comment  */
    #su-tune .k { color: #8f9cff; }                       /* keyword  */
    #su-tune .s { color: #ff9e64; }                       /* string   */
    #su-tune .n { color: #ff9e64; }                       /* number   */
    #su-tune .f { color: #ffd77a; }                       /* call()   */
    #su-tune .v { color: #e5c07b; }                       /* identifier / property */
    #su-tune .b { color: #c792ea; }                       /* {} () [] */
    #su-tune .o { color: #c9c9c9; }                       /* operators, punctuation */

    #su-tune .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    #su-tune button { padding: 5px 10px; background: #222; color: #eee; border: 1px solid #3a3a3a; border-radius: 6px;
      font: inherit; cursor: pointer; }
    #su-tune button:hover { background: #2e2e2e; }
    #su-tune button.primary { background: #8f9cff; border-color: #8f9cff; color: #000; font-weight: 600; }
    #su-tune input[type=range] { width: 120px; }
    #su-tune input[type=number], #su-tune input[type=text] { width: 70px; padding: 4px 6px; background: #0f0f0f; color: #eee;
      border: 1px solid #2a2a2a; border-radius: 6px; font: inherit; }
    #su-tune input[type=text] { width: 100px; }
    #su-tune .status { min-height: 16px; color: #8a8; white-space: pre-wrap; }
    #su-tune .status.err { color: #f66; }
    #su-tune .hint { color: #666; }

    /* ease picker — floating dropdown anchored to the ease string in the code */
    #su-tune label { display: flex; align-items: center; gap: 8px; }
    #su-tune .tabs { display: flex; gap: 4px; }
    #su-tune .tab { padding: 5px 12px; background: transparent; color: #8a8a8a; border: 1px solid transparent; border-radius: 6px; }
    #su-tune .tab:hover { color: #ddd; background: #1c1c1c; }
    #su-tune .tab.active { color: #fff; background: #1c1c1c; border-color: #2a2a2a; }
    #su-tune .editor[hidden] { display: none; }
    #su-tune .editor .e { text-decoration: underline dotted #ff9e64; text-underline-offset: 3px; } /* clickable ease value */
    #su-tune .easepop { position: absolute; z-index: 5; min-width: 160px; max-height: 220px; overflow: auto; padding: 4px;
      background: #1b1b1b; border: 1px solid #3a3a3a; border-radius: 8px; box-shadow: 0 10px 28px rgba(0,0,0,.55); }
    #su-tune .easepop[hidden] { display: none; }
    #su-tune .easepop .grp { display: block; padding: 5px 8px 2px; color: #757575; font-style: italic; }
    #su-tune .easepop .chip { display: block; width: 100%; text-align: left; padding: 3px 8px; border: 0; border-radius: 4px;
      background: transparent; color: #ff9e64; }
    #su-tune .easepop .chip:hover { background: #2a2a2a; }
    #su-tune .easepop .chip.active { background: #8f9cff; color: #000; }
  `;
  document.head.appendChild(css);

  // ── Syntax highlighter (small, regex-based — enough for GSAP timeline code)
  const KW  = new Set("const let var function return if else new await async true false null undefined typeof of in for while".split(" "));
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const TOKENS = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([{}()[\]])|([^\sA-Za-z0-9_$"'`{}()[\]]+)/g;
  const highlight = (src) => src.replace(TOKENS, (m, c, s, n, id, br, op, offset) => {
    if (c)  return `<span class="c">${esc(m)}</span>`;
    if (s) {
      // `ease: "…"` strings get a class + their offset → the picker anchors its dropdown to them
      const isEase = /\bease:\s*$/.test(src.slice(Math.max(0, offset - 16), offset));
      return `<span class="s${isEase ? " e" : ""}"${isEase ? ` data-pos="${offset}"` : ""}>${esc(m)}</span>`;
    }
    if (n)  return `<span class="n">${m}</span>`;
    if (id) {
      if (KW.has(id)) return `<span class="k">${id}</span>`;
      const isCall = /^\s*\(/.test(src.slice(offset + id.length));
      return `<span class="${isCall ? "f" : "v"}">${id}</span>`;
    }
    if (br) return `<span class="b">${esc(m)}</span>`;
    return `<span class="o">${esc(m)}</span>`;
  }) + "\n"; // trailing newline keeps the overlay scroll height in sync with the textarea

  // ── Eases offered by the picker (CustomEase names registered above + GSAP built-ins)
  const EASES = {
    library: Object.keys(EASE_LIBRARY),
    gsap:    ["power1.out", "power2.out", "power3.out", "power4.out", "expo.out",
              "power1.in", "power2.in", "power3.in", "power4.in", "expo.in",
              "power2.inOut", "power3.inOut", "power4.inOut", "expo.inOut", "none"],
  };
  const chips = Object.entries(EASES)
    .map(([grp, list]) => `<span class="grp">${grp}</span>` + list.map(e => `<button class="chip" data-ease="${e}">${e}</button>`).join(""))
    .join("");
  const TITLES = {
    enter: "enter · page transition", txtBtnLine: "txtBtnLine · .txt-btn hover", logoShrink: "logoShrink · nav logo on scroll",
    servicesSwap: "servicesSwap · services visual swap", servicesCard: "servicesCard · services card deal",
    awardsBadge: "awardsBadge · awards badge in and out", awardsRow: "awardsRow · awards row hover",
    heroTrail: "heroTrail · hero hover trail", industryFlip: "industryFlip · industries pill flip",
    marqueeIn: "marqueeIn · marquee slide coming in", filtersToggle: "filtersToggle · work filters open and close",
    workHover: "workHover · work card hover visuals in and out",
    labSwap: "labSwap · lab frame swap", labDeal: "labDeal · lab card move",
    serviceCard: "serviceCard · service card picture on hover", featureSwap: "featureSwap · service features picture switch",
    workView: "workView · work Bento / 3x3 morph",
  };
  const editor = (k) => `
    <div class="editor" data-key="${k}" ${k === KEYS[0] ? "" : "hidden"}>
      <pre aria-hidden="true"><code></code></pre>
      <textarea spellcheck="false" data-lenis-prevent></textarea>
      <div class="easepop" data-lenis-prevent hidden>${chips}</div>
    </div>`;

  const el = document.createElement("div");
  el.id = "su-tune";
  el.setAttribute("data-lenis-prevent", "");
  el.innerHTML = `
    <header><b>SU · recipes</b>
      <span class="hint">ctx: current · next · dir · vh · scrollY · q(sel) | wrap · btn | nav | next · media · prev | card · show · rotation · index | badge · show | row · line · show · nudge · origin | image · x · y · rise · tilt | box · to · show | item · side · rem | panel · rows · icon · open · rem | layer · show | next · media · frame · dir | card · x · y · rotation · show · ripple</span>
      <button data-act="hide" title="t">✕</button>
    </header>
    <div class="tabs">
      ${KEYS.map(k => `<button class="tab${k === KEYS[0] ? " active" : ""}" data-tab="${k}">${TITLES[k] || k}</button>`).join("")}
    </div>
    ${KEYS.map(editor).join("")}
    <div class="row">
      <button class="primary" data-act="apply" title="⌘/Ctrl+S">Apply</button>
      <button data-act="go">→ go</button>
      <input type="text" data-field="path" value="/work" title="path to open (/work, /about, a project URL…)">
      <button data-act="back">← back</button>
      <button data-act="home">⌂ home</button>
      <span style="flex:1"></span>
      <button data-act="copy">⎘ copy</button>
      <button data-act="reset">↺ reset</button>
    </div>
    <div class="row">
      <span>time scale</span>
      <input type="range" data-field="timeScale" min="0.05" max="1" step="0.05" value="1">
      <span data-out="timeScale">1</span>
      <span class="hint" style="margin-left:12px">slows every GSAP animation on the page, to see a recipe frame by frame</span>
    </div>
    <div class="status" data-status></div>
  `;
  document.body.appendChild(el);

  const $   = (s) => el.querySelector(s);
  const ta  = Object.fromEntries(KEYS.map(k => [k, $(`.editor[data-key=${k}] textarea`)]));
  const hl  = Object.fromEntries(KEYS.map(k => [k, $(`.editor[data-key=${k}] code`)]));
  const pop = Object.fromEntries(KEYS.map(k => [k, $(`.editor[data-key=${k}] .easepop`)]));

  // ── Tabs — one recipe visible at a time
  const showTab = (key) => {
    KEYS.forEach(k => {
      el.querySelector(`.editor[data-key=${k}]`).hidden = k !== key;
      el.querySelector(`.tab[data-tab=${k}]`).classList.toggle("active", k === key);
      pop[k].hidden = true;
    });
    ta[key].focus();
  };
  el.querySelector(".tabs").addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]");
    if (tab) showTab(tab.dataset.tab);
  });

  const render = (k) => { hl[k].innerHTML = highlight(ta[k].value); };
  const setSrc = (k, src) => { ta[k].value = src; render(k); };

  // ── Ease picker — dropdown floating over the code, anchored to the ease string at the caret
  const EASE_RE = /\bease:\s*(["'])([^"']*)\1/g;
  const easeAtCaret = (k) => {
    const src = ta[k].value, pos = ta[k].selectionStart;
    const lineStart = src.lastIndexOf("\n", pos - 1) + 1;
    const lineEnd   = (src.indexOf("\n", pos) + 1 || src.length + 1) - 1;
    for (const m of src.matchAll(EASE_RE)) {
      const vStart = m.index + m[0].indexOf(m[2], 6), vEnd = vStart + m[2].length;
      const inToken = pos >= m.index && pos <= m.index + m[0].length;
      const onLine  = m.index >= lineStart && m.index <= lineEnd;
      if (inToken || onLine) return { vStart, vEnd, value: m[2] };
    }
    return null;
  };

  const hidePop = (k) => { pop[k].hidden = true; };
  const showPop = (k) => {
    const hit = easeAtCaret(k);
    const anchor = hit && hl[k].querySelector(`.e[data-pos="${hit.vStart - 1}"]`); // the opening quote's offset
    if (!anchor) return hidePop(k);

    const p = pop[k], ed = ta[k].parentElement;
    p.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.ease === hit.value));
    p.hidden = false;

    // Anchor under the string; clamp inside the editor; flip above if there's no room below
    const a = anchor.getBoundingClientRect(), r = ed.getBoundingClientRect();
    if (a.bottom < r.top || a.top > r.bottom) return hidePop(k); // scrolled out of view
    const w = p.offsetWidth, h = p.offsetHeight;
    let left = a.left - r.left, top = a.bottom - r.top + 4;
    left = Math.max(4, Math.min(left, ed.clientWidth - w - 4));
    if (top + h > ed.clientHeight - 4 && a.top - r.top - h - 4 > 0) top = a.top - r.top - h - 4;
    p.style.left = `${left}px`;
    p.style.top  = `${top}px`;
    p.querySelector(".chip.active")?.scrollIntoView({ block: "nearest" });
  };

  // Replace the ease at the caret (or on its line); with none, insert an `ease:` line at the caret
  const applyEase = (k, name) => {
    const t = ta[k], src = t.value, hit = easeAtCaret(k);
    let caret;
    if (hit) {
      t.value = src.slice(0, hit.vStart) + name + src.slice(hit.vEnd);
      caret = hit.vStart + name.length;
    } else {
      const pos = t.selectionStart;
      const lineStart = src.lastIndexOf("\n", pos - 1) + 1;
      const indent = (src.slice(lineStart).match(/^[ \t]*/) || [""])[0];
      const insert = `\n${indent}ease: "${name}",`;
      t.value = src.slice(0, pos) + insert + src.slice(pos);
      caret = pos + insert.length - 2; // inside the quotes
    }
    t.selectionStart = t.selectionEnd = caret;
    render(k);
    hidePop(k);
    t.focus();
    status(`ease → ${name}  ·  Apply to run it`);
  };

  KEYS.forEach(k => {
    setSrc(k, sources[k]);
    ta[k].addEventListener("input", () => { render(k); if (!pop[k].hidden) showPop(k); });
    ta[k].addEventListener("scroll", () => {       // overlay + dropdown follow the textarea
      const pre = hl[k].parentElement;
      pre.scrollTop = ta[k].scrollTop; pre.scrollLeft = ta[k].scrollLeft;
      if (!pop[k].hidden) showPop(k);
    });
    // Caret enters / leaves an ease string → dropdown opens on it / closes
    ta[k].addEventListener("click", () => showPop(k));
    ta[k].addEventListener("keyup", (e) => {
      if (e.key === "Escape") return hidePop(k);
      if (/^Arrow|^Home$|^End$/.test(e.key)) showPop(k);
    });
    pop[k].addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (chip) applyEase(k, chip.dataset.ease);
    });
  });
  // Click anywhere outside a dropdown (and not in an editor) → close
  document.addEventListener("mousedown", (e) => {
    if (e.target.closest(".easepop, #su-tune textarea")) return;
    KEYS.forEach(hidePop);
  });

  const status = (msg, err = false) => {
    const s = $("[data-status]");
    s.textContent = msg;
    s.classList.toggle("err", err);
  };

  // ── Actions
  // History of applied versions: ⌘Z steps back (5 max), ⌘⇧Z forward. Restoring also re-applies.
  const MAX_UNDO = 5;
  const hist = [], future = [];
  const snapshot = () => ({ ...sources });
  const afterApply = () => { initNavReveal(); }; // logoShrink lives in a prebuilt timeline: rebuild it
  const restore = (snap) => {
    KEYS.forEach(k => { setSrc(k, snap[k]); RECIPES[k] = compile(k, snap[k]); sources[k] = snap[k]; });
    save();
    afterApply();
  };
  const pushHistory = () => {
    hist.push(snapshot());
    if (hist.length > MAX_UNDO) hist.shift();
    future.length = 0;
  };

  const apply = () => {
    const next = {}, errors = [];
    KEYS.forEach(k => {
      const src = ta[k].value.trim();
      try { compile(k, src); next[k] = src; }
      catch (e) { errors.push(`${k}: ${e.message}`); }
    });
    if (errors.length) return status(errors.join("\n"), true);

    const changed = KEYS.some(k => next[k] !== sources[k]);
    if (changed) pushHistory();
    KEYS.forEach(k => { RECIPES[k] = compile(k, next[k]); sources[k] = next[k]; });
    save();
    afterApply();
    status(changed ? "applied — next navigation / hover / scroll runs the new recipe" : "applied — no change");
  };

  const undo = () => {
    if (!hist.length) return status("nothing to undo");
    future.push(snapshot());
    restore(hist.pop());
    status(`↶ undo — ${hist.length} step${hist.length === 1 ? "" : "s"} left`);
  };
  const redo = () => {
    if (!future.length) return status("nothing to redo");
    hist.push(snapshot());
    restore(future.pop());
    status(`↷ redo — ${future.length} ahead`);
  };

  const actions = {
    hide:   () => window.SU_TUNE.toggle(),
    apply,
    go:     () => { if (!barba.transitions.isRunning) barba.go($("[data-field=path]").value || "/work"); },
    back:   () => { if (!barba.transitions.isRunning) history.back(); },
    home:   () => { if (!barba.transitions.isRunning) barba.go("/"); },
    copy:   () => {
      const indent = (s) => s.replace(/^(?=.)/gm, "  "); // blank lines stay blank
      const code = `const RECIPES = {\n${KEYS.map(k => indent(sources[k]) + ",").join("\n\n")}\n};`;
      navigator.clipboard?.writeText(code);
      console.log("%c[tune] RECIPES", "font-weight:bold", "\n" + code);
      status("copied — paste it in chat");
    },
    reset:  () => {
      pushHistory();
      restore(DEFAULTS);
      localStorage.removeItem(STORAGE);
      status("reset to the code in sainturbain-v2.js (⌘Z to get your edits back)");
    },
  };
  el.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act) actions[act]();
  });

  // Editor niceties: Tab inserts two spaces, ⌘/Ctrl+S applies, ⌘/Ctrl+Z / ⌘/Ctrl+⇧Z step through applied versions
  const shortcut = (e) => {
    if (!(e.metaKey || e.ctrlKey)) return null;
    const key = e.key.toLowerCase();
    if (key === "s" || e.key === "Enter") return apply;
    if (key === "z") return e.shiftKey ? redo : undo;
    return null;
  };

  KEYS.forEach(k => ta[k].addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: d, value } = ta[k];
      ta[k].value = value.slice(0, s) + "  " + value.slice(d);
      ta[k].selectionStart = ta[k].selectionEnd = s + 2;
      render(k);
    }
    const fn = shortcut(e);
    if (fn) { e.preventDefault(); fn(); }
  }));

  // Same shortcuts anywhere on the page while the panel is open
  document.addEventListener("keydown", (e) => {
    if (el.style.display === "none" || e.target.closest("#su-tune textarea")) return;
    const fn = shortcut(e);
    if (fn) { e.preventDefault(); fn(); }
  });

  // Playback
  $("[data-field=timeScale]").addEventListener("input", (e) => {
    gsap.globalTimeline.timeScale(+e.target.value);
    $("[data-out=timeScale]").textContent = e.target.value;
  });

  // Surface recipe runtime errors (runRecipe logs them; mirror in the panel)
  const origError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === "string" && args[0].startsWith("[recipe]")) status(args.map(String).join(" "), true);
    origError.apply(console, args);
  };

  let hidden = false;
  window.SU_TUNE = {
    el,
    toggle() { hidden = !hidden; el.style.display = hidden ? "none" : ""; },
  };
  window.SU = { RECIPES, nav: NAV_CONFIG, EASE_LIBRARY };

  status(loadNote);
}

/* ─────────────────────────────────────────────
   PERF (staging only)
   — Counts rendered frames during each Barba transition and logs
     "[perf] transition: N fps". Read it in the staging console to
     judge real smoothness on a given machine.
───────────────────────────────────────────── */
let perfFrames = 0, perfStart = 0, perfTicking = false;
function perfCount() { perfFrames++; }
function perfBegin() {
  if (!isStaging || perfTicking) return;
  perfFrames = 0; perfStart = performance.now(); perfTicking = true;
  gsap.ticker.add(perfCount);
}
function perfEnd(label) {
  if (!perfTicking) return;
  gsap.ticker.remove(perfCount); perfTicking = false;
  const secs = (performance.now() - perfStart) / 1000;
  if (secs > 0.2) console.log(`[perf] ${label}: ${Math.round(perfFrames / secs)} fps over ${secs.toFixed(2)}s`);
}

/* ═══════════════════════════════════════════════
   LENIS
   — Subtle wheel smoothing (lerp 0.4). Touch stays native, Safari keeps
     native scroll, and so does reduced motion. One instance for the whole
     visit, ticked once per frame by GSAP. Needs the Lenis script in the
     site footer, before this file.
   — Transitions block wheel / touch here (scrollLocked, set by
     lockTransitionScroll) instead of lenis.stop(). stop() toggles
     html.lenis-stopped, and the Lenis CSS turns that into overflow on the
     root: with a classic scrollbar the page reflows ~15px wider on stop
     and back on start.
   — A sideways swipe or shift + wheel over a marquee is left to the
     strip (see MARQUEES); up and down there still scroll the page.
═══════════════════════════════════════════════ */
let scrollLocked = false;

function initLenis() {
  if (lenis || !hasLenis || isSafari() || reducedMotion) return;

  lenis = new Lenis({
    lerp: 0.4,
    wheelMultiplier: 1,
    virtualScroll: (data) => {
      const e = data.event;
      if (scrollLocked) {
        if (e.cancelable) e.preventDefault();
        return false;
      }
      if (e.type === 'wheel' && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))
        && e.target instanceof Element && e.target.closest('[data-marquee-init]')) return false;
      return true;
    },
  });
  lenisActive = true;

  // The contact popup scrolls on its own: wheel over it stays native.
  document.querySelectorAll('.popup-contain').forEach(el => el.setAttribute('data-lenis-prevent', ''));

  if (hasScrollTrigger) lenis.on("scroll", ScrollTrigger.update);

  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}
initLenis();

/* ─────────────────────────────────────────────
   WEBFLOW RESET
───────────────────────────────────────────── */
// Selectors that need webflow.js to (re)initialize. Persistent nav is outside the
// Barba container, so only the incoming container is checked.
const WEBFLOW_JS_SELECTOR = '.w-form, .w-dropdown, .w-tabs, .w-slider, .w-lightbox, .w-nav, .w-background-video, [data-w-id]';

// The fetched page, parsed once per navigation and shared by everything that
// reads it (Webflow reset, head sync): each parse is a full-page task.
function nextDoc(data) {
  if (!data.suNextDoc) data.suNextDoc = new DOMParser().parseFromString(data.next.html || '', 'text/html');
  return data.suNextDoc;
}

function resetWebflow(data) {
  const doc = nextDoc(data);
  $('html').attr('data-wf-page', doc.documentElement.getAttribute('data-wf-page'));

  // Webflow.destroy()/ready()/ix2.init() re-scan the whole document. Only pay
  // for it when the new page actually contains Webflow-driven elements.
  // ix2 is only in webflow.js while the site has native interactions: guarded.
  if (data.next.container && data.next.container.querySelector(WEBFLOW_JS_SELECTOR)) {
    window.Webflow?.destroy();
    window.Webflow?.ready();
    window.Webflow?.require?.('ix2')?.init?.();
  }

  $(doc).find('[data-barba-script]').each(function () {
    const code = $(this).text()
      .replace(/window\.addEventListener\("DOMContentLoaded",\s*\(\s*event\s*\)\s*=>\s*{\s*/, '')
      .replace(/\s*}\s*\);\s*$/, '');
    const script = document.createElement('script');
    script.type = 'text/javascript';
    if ($(this).attr('src')) script.src = $(this).attr('src');
    script.text = code;
    document.body.appendChild(script).remove();
  });
}

/* ─────────────────────────────────────────────
   NAV CONFIG (breakpoint-aware)
   — edit values here to tweak nav behavior per breakpoint
   — Webflow breakpoints: desktop ≥992, tablet 768–991,
     mobile-L 480–767, mobile-P <480
   — current values read from `nav` (live getter, updates on resize)
───────────────────────────────────────────── */
const NAV_DEFAULTS = {
  // Logo dimensions
  logoExpanded:  { height: '10.8cqw', marginTop: '0rem',    marginBottom: '0rem',    top: '0rem'    },
  logoShrunk:    { height: '0.75rem', marginTop: '-1rem', marginBottom: '-0.5rem', top: '-0.75rem' },

  // Nav links visible/hidden state
  linksVisibleMargin: '0rem',
  linksHiddenMargin:  '-6rem',

  // Individual nav-big-link y offset (in sync with links margin)
  linkVisibleY: '0rem',
  linkHiddenY:  '-1.5rem',

  // Img-corner-stick visible/hidden state
  imgCornerVisibleTop: '8.8rem',
  imgCornerHiddenTop:  '2.75rem',

  // Divider opacity (visible = logo shrunk)
  dividerVisibleOpacity: 1,
  dividerHiddenOpacity:  0,

  // Scroll thresholds
  shrinkTriggerAt:    60,   // pixels scrolled before the logo shrink plays (toggleActions)
  shrinkDuration:     0.45, // seconds — logo shrink plays over its own time, not the scroll
  shrinkEase:         'power3.inOut', // smoother, more pronounced ease in-out
  linksHideAtProgress: 0.9, // nav links only slide once the logo shrink is ≥90% done (home)
  linksHideMinScrollVh: 0.2, // home: must scroll past 20% of viewport height before links can hide
  linksHideMinScrollVhShrunk: 0.01, // non-home (logo already shrunk): hide almost immediately (≈ top -1%)

  // Tween timing
  expandDuration:    1.25,
  expandEase:        'power3.inOut',
  logoExpandDelay:   0.15, // delay before logo scales — lets nav links lead the sequence
  hideShowDuration:  0.4,
  hideShowEase:      'power3.inOut',
  dividerFastDuration: 0.3
};

// Per-breakpoint overrides — only specify what differs from NAV_DEFAULTS.
// Add overrides here as you test (e.g. tablet: { linksHiddenMargin: '-5rem' })
const NAV_CONFIG = {
  desktop: { ...NAV_DEFAULTS },
  tablet:  { ...NAV_DEFAULTS },
  mobileL: { ...NAV_DEFAULTS },
  mobileP: { ...NAV_DEFAULTS }
};

// Live config — always reflects current breakpoint
let nav = NAV_CONFIG.desktop;

function getCurrentBreakpoint() {
  const w = window.innerWidth;
  if (w >= 992) return 'desktop';
  if (w >= 768) return 'tablet';
  if (w >= 480) return 'mobileL';
  return 'mobileP';
}

function updateNavConfig() {
  nav = NAV_CONFIG[getCurrentBreakpoint()];
}

updateNavConfig();
$(window).off('resize.navConfig').on('resize.navConfig', updateNavConfig);

/* ─────────────────────────────────────────────
   NAV REVEAL (scroll-driven logo collapse)
   — lives outside allpages() because it's tied
     to Barba hooks and needs to survive transitions
───────────────────────────────────────────── */
let navRevealActive = false;
let navRevealTl     = null;

// Nav-links state (declared before initNavReveal so the timeline's onUpdate,
// which can fire during ScrollTrigger setup, never hits an uninitialized var).
let navLinksHidden     = false;
let navLinksLastScroll = 0;
let navLinksTicking    = false;
let navLinksDir        = 0;   // last scroll direction: 1 down, -1 up

function initNavReveal() {
  ScrollTrigger.getById('navReveal')?.kill();

  // toggleActions approach: the logo shrink is a normal eased tween that PLAYS
  // when you scroll past shrinkTriggerAt and REVERSES when you scroll back above
  // it — so the motion has its own smooth ease-in-out timing, independent of
  // scroll speed (not tied 1:1 to the scrollbar like a scrub).
  // The tweens live in RECIPES.logoShrink (tunable on staging with `t`).
  const tl = gsap.timeline({
    paused: true,
    onUpdate: reconcileNavLinks   // keep the nav aware of the logo state as it plays
  });
  // Reduced motion: the same shrunk / expanded states, applied at once.
  if (reducedMotion) {
    try { RECIPES.logoShrink(tl, { nav }); } catch (e) { console.error('[recipe] logoShrink', e); tl.clear(); }
  } else {
    runRecipe("logoShrink", tl, { nav });
  }
  navRevealTl = tl;

  ScrollTrigger.create({
    id:       'navReveal',
    trigger:  document.body,
    start:    `top+=${nav.shrinkTriggerAt} top`,
    animation: reducedMotion ? undefined : navRevealTl,
    toggleActions: 'play none none reverse', // down→shrink, back up→expand
    onEnter:     () => { navRevealActive = true;  if (reducedMotion) tl.progress(1); },
    onLeaveBack: () => { navRevealActive = false; if (reducedMotion) tl.progress(0); }
  });
}

initNavReveal();

/* Keep the logo shrink responsive. The expanded height is fluid (10.8cqw), but
   GSAP caches the computed px, so on browser resize the logo would otherwise
   stay frozen at the size calculated for the previous viewport. Debounced
   rebuild: clear GSAP's inline sizing so the responsive CSS reapplies, recreate
   the trigger with fresh dimensions, and preserve the shrunk state if scrolled. */
let navRevealResizeTimer;
let lastNavWidth = window.innerWidth;
$(window).off('resize.navReveal').on('resize.navReveal', () => {
  // Ignore height-only changes (iOS URL bar) AND small width changes such as the
  // scrollbar appearing/disappearing when Barba toggles .fixed on the container —
  // those aren't real responsive resizes and were causing a logo flash.
  if (Math.abs(window.innerWidth - lastNavWidth) < 20) return;
  lastNavWidth = window.innerWidth;

  clearTimeout(navRevealResizeTimer);
  navRevealResizeTimer = setTimeout(() => {
    // preserveShrunk pages have no navReveal and a fixed-rem shrunk logo — there's
    // nothing fluid to recalc, so leave it alone. Rebuilding would clearProps the
    // logo back to its big CSS size (and it wouldn't be re-shrunk since scroll is
    // at the top), making a shrunk logo grow after resize.
    if (!ScrollTrigger.getById('navReveal')) return;

    // Otherwise the expanded logo is fluid (cqw) and needs recalculating. Keep the
    // shrunk state if we're scrolled past the trigger.
    const shrunk = window.scrollY > nav.shrinkTriggerAt;
    gsap.set('.nav-big-logo-wrap', { clearProps: 'height,marginTop,marginBottom,top' });
    initNavReveal();
    if (shrunk) navRevealTl.progress(1); // stay shrunk (no re-shrink animation)
    ScrollTrigger.refresh();
  }, 200);
});

/* ─────────────────────────────────────────────
   NAV LINKS HIDE/SHOW ON SCROLL DIRECTION
   — hides .nav-big-links on scroll down, shows on scroll up
   — but only once the logo shrink is essentially done, so the two
     motions are sequenced (nav follows the logo, not simultaneous):
       • home: gated on the logo timeline's smoothed progress
         (≥ nav.linksHideAtProgress)
       • non-home (already shrunk, no navReveal): gated on a small
         pixel buffer
   — re-checked both on scroll AND on the logo timeline's onUpdate,
     so it stays in sync through the lerp catch-up
   — survives Barba via namespaced listener
───────────────────────────────────────────── */
function logoShrinkProgress() {
  // Home: smoothed progress of the actual logo-shrink timeline.
  // No navReveal (non-home / preserved-shrunk) → logo already small → done.
  if (!ScrollTrigger.getById('navReveal') || !navRevealTl) return 1;
  return navRevealTl.progress();
}

// Reduced motion: the nav takes the same states, without the motion.
const navDur = (d) => (reducedMotion ? 0 : d);

/* The image corners' sticky offset follows the nav links: low while they
   show, high while they're hidden. One proxy tween writes every corner on the
   page (dozens on /work); GSAP never reads them, where reading them one by
   one forced a layout per corner on every scroll reversal and page change. */
const remOf = (v) => parseFloat(v) || 0;
const cornerTop = { rem: remOf(nav.imgCornerVisibleTop) };
let cornerTween = null;
function writeCornerTop(scope) {
  const v = cornerTop.rem + 'rem';
  (scope || document).querySelectorAll('.img-corner-stick').forEach((el) => { el.style.top = v; });
}
function setCornerTop(value, duration, ease) {
  if (cornerTween) cornerTween.kill();
  cornerTween = null;
  const to = remOf(value);
  if (!duration) { cornerTop.rem = to; writeCornerTop(); return; }
  const els = document.querySelectorAll('.img-corner-stick');
  if (!els.length) { cornerTop.rem = to; return; }
  cornerTween = gsap.to(cornerTop, {
    rem: to, duration, ease,
    onUpdate: () => { const v = cornerTop.rem + 'rem'; els.forEach((el) => { el.style.top = v; }); }
  });
}

function setNavLinks(hide, durationOverride) {
  if (hide === navLinksHidden) return;
  navLinksHidden = hide;

  const tweenOpts = {
    duration: navDur(durationOverride ?? nav.hideShowDuration),
    ease: nav.hideShowEase,
    overwrite: true
  };

  gsap.to('.nav-big-links',              { marginTop: hide ? nav.linksHiddenMargin    : nav.linksVisibleMargin,    ...tweenOpts });
  gsap.to('.nav-big-link',               { y:         hide ? nav.linkHiddenY          : nav.linkVisibleY,          ...tweenOpts });
  gsap.to('.line-divider-nav.is-bottom', { opacity:   hide ? nav.dividerHiddenOpacity : nav.dividerVisibleOpacity, ...tweenOpts });
  setCornerTop(hide ? nav.imgCornerHiddenTop : nav.imgCornerVisibleTop, tweenOpts.duration, tweenOpts.ease);
}

function reconcileNavLinks() {
  // Decide nav-link visibility from the current scroll direction AND the logo
  // shrink state, so the slide is sequenced with (not simultaneous to) the
  // logo. Called on scroll and on the logo timeline's onUpdate (lerp catch-up).
  const current     = window.scrollY;
  const shrinkDone  = logoShrinkProgress() >= nav.linksHideAtProgress;
  // Don't hide too early. On home the shrink is in play → require 20% of the
  // viewport. On other pages the logo is already shrunk (no navReveal) → hide
  // almost immediately (≈ page_main top -1%).
  const minVh = ScrollTrigger.getById('navReveal') ? nav.linksHideMinScrollVh : nav.linksHideMinScrollVhShrunk;
  const pastBuffer  = current > window.innerHeight * minVh;

  if (!shrinkDone || !pastBuffer) {
    setNavLinks(false);            // logo not resolved yet (or near top) → links stay
  } else if (navLinksDir > 0) {
    setNavLinks(true);             // shrink resolved + scrolling down → hide
  } else if (navLinksDir < 0) {
    setNavLinks(false);            // scrolling up → show
  }
}

function onNavLinksScroll() {
  const current = window.scrollY;
  if (current > navLinksLastScroll)      navLinksDir = 1;
  else if (current < navLinksLastScroll) navLinksDir = -1;
  navLinksLastScroll = current;

  reconcileNavLinks();
  navLinksTicking = false;
}

function initNavLinksHide() {
  navLinksLastScroll = window.scrollY;
  navLinksHidden = false;
  navLinksDir = 0;
  gsap.set('.nav-big-links',    { marginTop: nav.linksVisibleMargin });
  gsap.set('.nav-big-link',     { y: nav.linkVisibleY });
  setCornerTop(nav.imgCornerVisibleTop, 0);

  $(window)
    .off('scroll.navLinks')
    .on('scroll.navLinks', function () {
      if (!navLinksTicking) {
        requestAnimationFrame(onNavLinksScroll);
        navLinksTicking = true;
      }
    });
}

initNavLinksHide();


/* ─────────────────────────────────────────────
   BARBA
───────────────────────────────────────────── */
// Scroll lock for Barba transitions. NB: we avoid `overflow:hidden` on <html>
// because hiding the scrollbar changes innerWidth, which would fire a resize and
// trigger the nav rebuild (causing a logo flash). Preventing scroll events keeps
// the layout — and scrollbar — untouched.
function preventTransitionScroll(e) { e.preventDefault(); }
function preventTransitionScrollKeys(e) {
  const keys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'];
  if (keys.includes(e.key)) e.preventDefault();
}
function lockTransitionScroll(lock) {
  scrollLocked = lock; // Lenis: wheel / touch ignored while locked (see LENIS)
  const fn = lock ? 'addEventListener' : 'removeEventListener';
  window[fn]('wheel',     preventTransitionScroll,     { passive: false });
  window[fn]('touchmove', preventTransitionScroll,     { passive: false });
  window[fn]('keydown',   preventTransitionScrollKeys, { passive: false });
}

barba.hooks.before(() => {
  // The cards' hover visuals stop where they are, before the pointer is let go
  // below (a card clicked mid-hover leaves as it looks; see INIT: WORK HOVER).
  teardownWorkHover(true);
  // Finsweet loads async; on a click that beats it, destroy() isn't there yet.
  if (typeof window.fsAttributes?.destroy === 'function') window.fsAttributes.destroy();
  // Block clicks AND scrolling while the next page is fetched and the transition
  // runs, so the user can't scroll freely mid-transition.
  document.body.style.pointerEvents = 'none';
  lockTransitionScroll(true);
});

// On first load, Finsweet auto-inits cmsfilter and hides the empty-filters div,
// changing page height. Refresh ScrollTrigger once cmsfilter is ready so the
// footer trigger (and others) compute against the final layout.
window.fsAttributes = window.fsAttributes || [];
window.fsAttributes.push(['cmsfilter', () => ScrollTrigger.refresh()]);

barba.hooks.after((data) => {
  document.body.style.pointerEvents = '';
  lockTransitionScroll(false); // unlock scrolling before the scroll reset below
  // cmsfilter.init() hides the empty-filters div (changes page height), which
  // shifts trigger positions — refresh ScrollTrigger once it's done (unless
  // the visitor is already on the way to another page).
  try {
    const fs = window.fsAttributes || {};
    const filterInit = fs.cmsfilter && fs.cmsfilter.init ? fs.cmsfilter.init() : null;
    if (filterInit && filterInit.then) filterInit.then(() => { if (!barba.transitions.isRunning) ScrollTrigger.refresh(); });
    if (fs.cmsload && fs.cmsload.init) fs.cmsload.init();
  } catch (e) { console.error('[finsweet]', e); }

  if (lenisActive) {
    lenis.scrollTo(0, { immediate: true, duration: 0 });
  } else {
    window.scrollTo(0, 0);
  }

  $(window).scrollTop(0);
  // Barba runs these hooks as one chain: an error here would silently skip
  // the head sync, the page view and the prefetch registered after it.
  try { resetWebflow(data); } catch (e) { console.error('[webflow reset]', e); }
});

// Slide direction and the highlighted nav link come from where the visit goes
// (nav link, card, logo, Back or Forward), worked out per navigation: a nav
// link to the right of the current one slides the page in from the right.
// Pages without a nav link of their own use the default direction.
const navPath = (p) => (p || '/').replace(/\/+$/, '') || '/';
function navLinkFor(path) {
  const want = navPath(path);
  return Array.from(document.querySelectorAll('.nav-big-link[href]'))
    .find(a => !a.closest('[data-barba="container"]') && a.origin === location.origin && navPath(a.pathname) === want) || null;
}
let dir = 1;

// Back or Forward pressed while a transition runs: Barba would reload the page.
// It's held instead and played once the page has landed (registered before
// barba.init so it runs ahead of Barba's own popstate listener).
let queuedPop = null;
window.addEventListener('popstate', (e) => {
  if (!barba.transitions || !barba.transitions.isRunning) return;
  e.stopImmediatePropagation();
  queuedPop = e;
});

// Our click handlers on the document (link to this page → scroll to top,
// Contact → popup, popup close) must see a click before Barba does. Barba
// changes the URL the moment it takes a click: run after it, the same-page
// check reads Work → About as "already on About" and scrolls the outgoing
// page to the top under the slide (scrolled down, it slides away empty).
// jQuery adds its single document click listener with the first handler bound
// there, so this one, bound before barba.init and never removed, keeps them
// all ahead of Barba's for the whole visit.
$(document).on('click.beforeBarba', () => {});

if (document.querySelector('[data-barba="wrapper"]')) barba.init({ // none on the password page
  preventRunning: true,
  timeout: 5000,
  // Contact links open the popup (see CONTACT POPUP): Barba never navigates
  // or prefetches them, whatever order the click listeners run in.
  prevent: ({ el }) => !!(el && el.matches && el.matches('a[href="/contact"], a[href="/contact/"]')),
  transitions: [{
    name: 'transition',

    before() {
      // A wheel glide still running settles where it is (no stop(): see LENIS).
      if (lenisActive) lenis.reset();
    },

    enter(data) {
      // The incoming page's card hover pictures, off the browser's lazy loading
      // before anything lays it out (see INIT: WORK HOVER).
      detachWorkHoverImages(data.next.container);
      const nextLink = navLinkFor(data.next.url.path);
      const curLink  = navLinkFor(data.current.url.path);
      const curX     = curLink ? curLink.getBoundingClientRect().left : 0;
      dir = nextLink && nextLink.getBoundingClientRect().left > curX ? -1 : 1;
      $('.nav-big-link').removeClass('w--current');
      if (nextLink) nextLink.classList.add('w--current');

      $(data.next.container).addClass('fixed');

      const cur = data.current.container;
      const nxt = data.next.container;
      const vh  = window.innerHeight;
      const sy  = window.scrollY;

      // ── Stop paying for the page that's leaving. Its observers would keep
      // firing as it moves (loading hover images, fading videos), its videos
      // would keep decoding under the slide and the services round would keep
      // swapping pictures.
      teardownVideos();
      teardownHoverTrail();
      teardownWorkHover(true); // already done in barba.hooks.before; kept as it looks
      pauseServicesFollow();
      cur.querySelectorAll('video').forEach(v => { try { v.pause(); } catch (e) {} });

      // ── Bound what the GPU rasterizes to the viewport (measured: this is what
      // removes the 100ms first frame). Both containers are page-tall; moving a
      // page-tall layer means tiling thousands of px nobody sees.
      //   incoming: overflow CLIP, not hidden. `hidden` makes the box a scroll
      //             container and therefore the scrollport for position:sticky
      //             descendants (.img-corner-stick stuck against the wrong box).
      //             `clip` only clips painting, sticky keeps using the viewport.
      //   outgoing: clip-path to the slice that was on screen (no sticky effect).
      // Both inline, cleared by clearStyles('.page_main') when the page lands.
      // Both are promoted for the slide only (will-change is cleared with the
      // rest when the page lands), so the GPU layer exists before frame one.
      if (CSS.supports('overflow', 'clip')) {
        gsap.set(nxt, { position: 'fixed', top: 0, left: 0, width: '100%', height: vh, overflow: 'clip', willChange: 'transform' });
      }
      gsap.set(cur, { clipPath: `inset(${sy}px 0 ${Math.max(0, cur.offsetHeight - sy - vh)}px 0)`, willChange: 'transform' });

      // ── The incoming page takes its final shape now, before the first
      // frame, so nothing jumps when it lands: marquee layout, merged work
      // titles (the grid is shorter once merged), section counts, the 3
      // related projects, and on a blog article its 3 more articles and
      // meta rows.
      try { initMarquees(nxt); } catch (e) { console.error('[marquee]', e); }
      runInit('relatedWork',   () => initRelatedWork(nxt, data.next.url.href));
      runInit('relatedPosts',  () => initRelatedPosts(nxt, data.next.url.href));
      runInit('blogArticle',   () => initBlogArticle(nxt, data.next.url.href));
      runInit('workTitles',    () => initWorkItemTitles(nxt));
      runInit('sectionCounts', () => initSectionCounts(nxt));
      perfBegin();

      // The motion itself lives in RECIPES.enter (tunable on staging with `t`).
      const tl = runRecipe("enter", gsap.timeline({ paused: true }), {
        current: cur, next: nxt, dir,
        vh, scrollY: sy,
        q: (sel) => nxt.querySelectorAll(sel),
      });

      // An empty timeline (reduced motion, or a recipe that failed) is an
      // instant swap. Handed to Barba it would never settle, and the page
      // would stay locked mid-transition.
      if (!tl.duration()) { tl.kill(); return; }

      // ── First-paint gate: the incoming page was just inserted and has not
      // been styled, laid out or painted yet. Starting the tween on the same
      // frame stacks that work under the first frames of motion (the classic
      // hitch at the start). Two rAFs = the browser has painted it once.
      requestAnimationFrame(() => requestAnimationFrame(() => tl.play()));
      // Barba waits on a plain promise. The timer is a safety net (a timeline
      // killed elsewhere, a tab hidden mid-slide): it finishes the slide at
      // once, so the site can never stay locked.
      return new Promise((resolve) => {
        const timer = setTimeout(() => { tl.progress(1); resolve(); }, tl.duration() * 1000 + 1500);
        tl.then(() => { clearTimeout(timer); resolve(); });
      });
    },

    after() {
      // A Back / Forward held during the transition plays next (Barba frees
      // up once this hook chain ends, hence the timeout). Queued first, so
      // nothing below can lose it.
      if (queuedPop) {
        const e = queuedPop;
        queuedPop = null;
        setTimeout(() => barba.go(location.href, 'popstate', e), 0);
      }

      // Kill ST + Swiper AFTER transition is complete — not before.
      // Exclude navReveal: it's managed by the enter hook's onComplete
      // and re-arming it here would be redundant (and racy with the
      // enter tween that's still running).
      ScrollTrigger.getAll().forEach(t => {
        if (t.vars.id !== 'navReveal') t.kill();
      });
      swiperInstances.forEach(s => s.destroy(true, true));
      swiperInstances = [];

      $('.w--current').removeClass('w--current');
      $('a').each(function () {
        if ($(this).attr('href') === window.location.pathname) $(this).addClass('w--current');
      });
      $('.page_main').removeClass('fixed');
      clearStyles('.page_main'); // drops the transition-only inline styles (fixed/overflow/clip-path/will-change)
      perfEnd('transition');
      allpages();
    }
  }]
});

/* ─────────────────────────────────────────────
   ANALYTICS & HEAD SYNC
   — Barba swaps pages without a reload. Barba updates <title>, but the
     rest of <head> (description, canonical, Open Graph) stays from the
     first page, and GA4 never sees a page view. After every transition:
     copy those tags from the fetched page, then push one
     `virtual_page_view` to the dataLayer. The first page load is counted
     by the GA4 tag itself in GTM, so nothing is pushed on load.
   — Webflow forms submit by AJAX and show .w-form-done on success:
     push one event when that message becomes visible. The project
     inquiry form (popup and Contact page) is the lead: `generate_lead`.
     The footer newsletter ("Stay tuned", inside .footer, or any form
     marked data-form="newsletter") is not: `newsletter_signup`. Both
     forms are named "Email Form" in Webflow, so form_type tells them
     apart.
   — Links to /contact open the popup instead of a page: push
     `contact_open` (see openContactPopup).
   — In GTM: trigger "Custom Event" on each event name. In GA4 turn OFF
     "Page changes based on browser history events" (enhanced
     measurement), or page views are counted twice.
───────────────────────────────────────────── */
window.dataLayer = window.dataLayer || [];
let lastPageLocation = window.location.href;

const HEAD_SYNC_SELECTORS = [
  'meta[name="description"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[property="og:image"]',
  'meta[property="og:url"]',
  'meta[property="twitter:title"]',
  'meta[property="twitter:description"]',
  'meta[property="twitter:image"]',
  'meta[name="twitter:title"]',
  'meta[name="twitter:description"]',
  'meta[name="twitter:image"]',
  'link[rel="canonical"]'
];

function syncHead(data) {
  if (!data || !data.next || !data.next.html) return;
  let doc;
  try { doc = nextDoc(data); } catch (e) { return; }
  if (!doc || !doc.head) return;

  const title = doc.querySelector('title');
  if (title && title.textContent && document.title !== title.textContent) document.title = title.textContent;

  HEAD_SYNC_SELECTORS.forEach(sel => {
    const incoming = doc.head.querySelector(sel);
    const current  = document.head.querySelector(sel);
    if (incoming && current) {
      const attr = current.tagName === 'LINK' ? 'href' : 'content';
      const val  = incoming.getAttribute(attr);
      if (val !== null && current.getAttribute(attr) !== val) current.setAttribute(attr, val);
    } else if (incoming) {
      document.head.appendChild(document.importNode(incoming, true));
    } else if (current) {
      current.remove();
    }
  });
}

function pushDataLayer(payload) {
  try { (window.dataLayer = window.dataLayer || []).push(payload); } catch (e) {}
}

barba.hooks.after((data) => {
  try { syncHead(data); } catch (e) { console.error('[head sync]', e); }
  const loc = window.location.href;
  if (loc === lastPageLocation) return; // same-URL reload through Barba: not a new page
  pushDataLayer({
    event: 'virtual_page_view',
    page_location: loc,
    page_path: window.location.pathname,
    page_title: document.title,
    page_referrer: lastPageLocation
  });
  lastPageLocation = loc;
});

function watchFormSuccess(form) {
  const wrap = form.closest('.w-form');
  const done = wrap && wrap.querySelector('.w-form-done');
  if (!done || form.dataset.leadWatch === '1') return;
  form.dataset.leadWatch = '1';

  let timer = null;
  const newsletter = !!form.closest('.footer, [data-form="newsletter"]');
  const obs = new MutationObserver(() => {
    if (getComputedStyle(done).display === 'none') return;
    stop();
    pushDataLayer({
      event: newsletter ? 'newsletter_signup' : 'generate_lead',
      form_type: newsletter ? 'newsletter' : 'project_inquiry',
      form_name: form.getAttribute('data-name') || form.getAttribute('name') || form.id || 'form',
      form_location: form.closest('.popup-contain') ? 'popup' : newsletter ? 'footer' : 'page',
      page_path: window.location.pathname
    });
  });
  function stop() {
    obs.disconnect();
    clearTimeout(timer);
    delete form.dataset.leadWatch;
  }
  obs.observe(done, { attributes: true, attributeFilter: ['style', 'class'] });
  timer = setTimeout(stop, 20000); // failed or abandoned submit: stop watching
}

// Capture phase on document: works for every form, on every page, after
// any number of Barba transitions, without re-binding.
document.addEventListener('submit', (e) => {
  const form = e.target;
  if (form && form.tagName === 'FORM') watchFormSuccess(form);
}, true);

/* ─────────────────────────────────────────────
   PREFETCH
   — Barba core already prefetches a page into its in-memory cache on
     link mouseover/touchstart. Two gaps remain, closed here:
       1. nav destinations are prefetched in idle time after each
          page settles, so the common clicks skip the network entirely
       2. keyboard focus counts as intent
   — Once a page's HTML is cached, its eager (above-the-fold) images
     are warmed with new Image(), so the next page paints with its
     hero already in cache instead of fetching it mid-transition.
───────────────────────────────────────────── */
const prefetchedImgs = new Set();
const warmedPages = new Set();
// Warming costs data: skipped on touch devices and constrained connections.
const canWarmImages = () => {
  const c = navigator.connection;
  return !(c && (c.saveData || /2g|3g/.test(c.effectiveType || ''))) && window.matchMedia('(hover: hover)').matches;
};
const tagAttr = (tag, name) => {
  const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i'));
  return m ? (m[1] ?? m[2]).replace(/&amp;/g, '&') : null;
};
function warmEagerImages(html) {
  // Read straight from the page's markup (no full-page parse), from its Barba
  // container on: the nav and popup around it are already on screen.
  const from = html.search(/<[^>]+data-barba=["']container["']/i);
  const tags = (from >= 0 ? html.slice(from) : html).match(/<img\b[^>]*>/gi) || [];
  let n = 0;
  for (const tag of tags) {
    if (n >= 6) break; // hero + a few: enough to cover the first paint
    if (/\sloading\s*=\s*["']?lazy/i.test(tag)) continue;
    const src = tagAttr(tag, 'src');
    if (!src || prefetchedImgs.has(src)) continue;
    prefetchedImgs.add(src);
    const i = new Image();
    const srcset = tagAttr(tag, 'srcset'), sizes = tagAttr(tag, 'sizes');
    if (srcset) i.srcset = srcset;
    if (sizes)  i.sizes  = sizes;
    i.src = src;
    n++;
  }
}

function prefetchPage(href) {
  // Never mid-transition: Barba clears its running flag when any request
  // fails, which would let a second transition start on top of this one.
  if (!href || typeof barba.prefetch !== 'function' || barba.transitions?.isRunning) return;
  try {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin || url.pathname === location.pathname) return;
    if (/^\/contact\/?$/.test(url.pathname)) return; // opens the popup, never a page
    if (/\.(pdf|zip|jpe?g|png|webp|gif|svg|mp4|webm)$/i.test(url.pathname)) return;
    if (!barba.cache.has(url.href)) barba.prefetch(url.href);
    // Each page's first images are warmed once per visit, in idle time.
    if (warmedPages.has(url.href) || !canWarmImages()) return;
    warmedPages.add(url.href);
    const entry = barba.cache.get(url.href);
    // Barba 2.10 resolves the request to { html, url }; older builds to the html string.
    if (entry && entry.request) entry.request.then((res) => {
      const html = typeof res === 'string' ? res : res && res.html;
      if (!html) { warmedPages.delete(url.href); return; } // failed: tried again next time
      const run = () => warmEagerImages(html);
      window.requestIdleCallback ? requestIdleCallback(run, { timeout: 3000 }) : setTimeout(run, 500);
    }).catch(() => { warmedPages.delete(url.href); });
  } catch (e) {}
}

function prefetchNavDestinations() {
  // Skip on constrained connections; hover prefetch still works there.
  const c = navigator.connection;
  if (c && (c.saveData || /2g|3g/.test(c.effectiveType || ''))) return;
  const links = document.querySelectorAll('.nav-big-link[href], .nav-link[href], .txt-btn[href]');
  const run = () => links.forEach(a => prefetchPage(a.href));
  window.requestIdleCallback ? requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 1500);
}

// Keyboard focus as intent (mouse/touch intent is handled by Barba core).
document.addEventListener('focusin', (e) => {
  const a = e.target.closest && e.target.closest('a[href]');
  if (a && !a.hasAttribute('data-barba-prevent') && a.getAttribute('target') !== '_blank') prefetchPage(a.href);
});

// After each navigation settles, warm the nav destinations from idle time.
barba.hooks.after(() => prefetchNavDestinations());
window.addEventListener('load', () => prefetchNavDestinations(), { once: true });

// Nav logo animation per page type — runs in Barba enter hook
barba.hooks.enter((data) => {
  // Kill the previous page's navReveal immediately. Otherwise it survives the
  // transition still bound to the OLD scroll position, and a mid-transition
  // ScrollTrigger.refresh() (from other triggers rebuilt in allpages) re-applies
  // its active state — flashing the logo shrunk before it's recreated cleanly in
  // onComplete / preserveShrunk below.
  ScrollTrigger.getById('navReveal')?.kill();

  const isHome = $(data.next.container).attr('data-barba-namespace') === 'home';
  const wasHidden = navLinksHidden;

  // Reset scroll tracker — Barba lands at scrollY 0
  navLinksLastScroll = 0;
  navLinksHidden = false;

  // Bring nav links + img-corner-stick back to visible state.
  // Animated when previously hidden (matches expand timing for sync),
  // snapped otherwise (already in correct state, no-op). The incoming page's
  // corners are written straight away: they're on screen during the slide.
  if (wasHidden) {
    const tweenOpts = { duration: navDur(nav.expandDuration), ease: nav.expandEase, overwrite: true };
    gsap.to('.nav-big-links',    { marginTop: nav.linksVisibleMargin,  ...tweenOpts });
    gsap.to('.nav-big-link',     { y:         nav.linkVisibleY,        ...tweenOpts });
    setCornerTop(nav.imgCornerVisibleTop, tweenOpts.duration, tweenOpts.ease);
  } else {
    gsap.set('.nav-big-links',    { marginTop: nav.linksVisibleMargin });
    gsap.set('.nav-big-link',     { y: nav.linkVisibleY });
    if (cornerTween) { cornerTween.kill(); cornerTween = null; }
    cornerTop.rem = remOf(nav.imgCornerVisibleTop);
  }
  writeCornerTop(data.next.container);

  if (isHome) {
    gsap.to('.nav-big-logo-wrap', {
      ...nav.logoExpanded,
      ease: nav.expandEase, duration: navDur(nav.expandDuration), delay: wasHidden ? navDur(nav.logoExpandDelay) : 0, overwrite: true,
      onComplete: () => {
        navRevealActive = false;
        // Guarantee we're at the top before (re)creating the shrink trigger —
        // otherwise, if this races ahead of the after-hook scroll reset, the
        // toggleActions trigger fires "play" from the stale (scrolled) position
        // and the logo flashes shrunk before the reset reverses it.
        window.scrollTo(0, 0);
        $(window).scrollTop(0);
        ScrollTrigger.getById('navReveal')?.kill();
        initNavReveal();
      }
    });
    // Divider always ends at hidden opacity on home (logo expanded).
    // Match expand duration + delay when wasHidden so it eases out alongside the logo.
    gsap.to('.line-divider-nav.is-bottom', {
      opacity: nav.dividerHiddenOpacity,
      duration: navDur(wasHidden ? nav.expandDuration : nav.dividerFastDuration),
      delay: wasHidden ? navDur(nav.logoExpandDelay) : 0,
      ease: nav.expandEase,
      overwrite: true
    });
    return;
  }

  // Non-home
  if (navRevealActive) {
    // preserveShrunk path: logo stays shrunk, divider stays visible.
    // Links/img-corner-stick animation above handles the rest if wasHidden.
    // Logo is shrunk → remove is-padd so there's no top padding. (Class removal
    // survives the transition's clearStyles('.page_main'); an inline padding
    // override would NOT — clearStyles wipes it. The flash that once looked
    // is-padd-related was actually the stale navReveal, now killed above.)
    ScrollTrigger.getById('navReveal')?.kill();
    gsap.set('.nav-big-logo-wrap',          { ...nav.logoShrunk });
    gsap.set('.line-divider-nav.is-bottom', { opacity: nav.dividerVisibleOpacity });
    $(data.next.container).removeClass('is-padd');
  } else {
    // Animate expand path: logo grows, divider fades to hidden.
    gsap.to('.nav-big-logo-wrap', {
      ...nav.logoExpanded,
      ease: nav.expandEase, duration: navDur(nav.expandDuration), overwrite: true,
      onComplete: () => {
        ScrollTrigger.getById('navReveal')?.kill();
        initNavReveal();
      }
    });
    gsap.to('.line-divider-nav.is-bottom', {
      opacity: nav.dividerHiddenOpacity,
      duration: navDur(wasHidden ? nav.expandDuration : nav.dividerFastDuration),
      ease: nav.expandEase,
      overwrite: true
    });
  }
});

/* ─────────────────────────────────────────────
   CONTACT POPUP
   — module-level state so Barba transitions
     don't reset an open popup mid-animation
───────────────────────────────────────────── */
let contactPopupOpen    = false;
let contactPopupTl      = null;
let contactBottomST     = null;
let contactBottomVisible = false;

const contactPopup = {
  $contain: $('.popup-contain'),
  $bk:      $('.popup-contain .popup-bk'),
  $blur:    $('.popup-contain .popup-blur'),
  $panel:   $('.popup-contain .popup')
};

// The scrollbar's gutter is kept while the page is locked, so with a classic
// (Windows) scrollbar the page behind the popup doesn't shift sideways.
function lockScroll() {
  document.documentElement.style.scrollbarGutter = 'stable';
  $('html, body').css('overflow', 'hidden');
}
function unlockScroll() {
  $('html, body').css('overflow', '');
  document.documentElement.style.scrollbarGutter = '';
}
let contactCloseTl = null; // the close running, killed if the popup reopens before it ends

function killBottomST() {
  if (contactBottomST) contactBottomST.kill();
  contactBottomST     = null;
  contactBottomVisible = false;
}

function setupBottomST() {
  killBottomST();
  const $bottom = contactPopup.$contain.find('.popup-bottom').first();
  if (!$bottom.length || !contactPopup.$panel.length) return;

  contactBottomST = ScrollTrigger.create({
    trigger:   $bottom[0],
    scroller:  contactPopup.$panel[0],
    start:     'top bottom',
    end:       'top top',
    onToggle:  self => contactBottomVisible = self.isActive,
    onRefresh: self => contactBottomVisible = self.isActive
  });
  contactBottomST.refresh();
}

function buildPopupTl() {
  if (contactPopupTl) contactPopupTl.kill();
  gsap.killTweensOf([contactPopup.$panel, contactPopup.$bk, contactPopup.$blur]);

  gsap.set(contactPopup.$contain, { display: 'block' });
  gsap.set(contactPopup.$bk,    { opacity: 0 });
  gsap.set(contactPopup.$blur,  { backdropFilter: 'blur(0rem)' });
  gsap.set(contactPopup.$panel, { y: '100vh' });

  contactPopupTl = gsap.timeline({ paused: true, defaults: { ease: 'power3.inOut' } })
    .to(contactPopup.$bk,    { opacity: 1, duration: 0.25 }, 0)
    .to(contactPopup.$blur,  { backdropFilter: 'blur(0.25rem)', duration: 0.3, ease: 'power2.out' }, 0)
    .to(contactPopup.$panel, { y: '0vh', duration: 0.55 }, 0);

  contactPopupTl.eventCallback('onComplete', setupBottomST);
  return contactPopupTl;
}

function openContactPopup() {
  if (contactPopupOpen) return;
  contactPopupOpen = true;
  pushDataLayer({ event: 'contact_open', page_path: window.location.pathname });
  if (contactCloseTl) { contactCloseTl.kill(); contactCloseTl = null; } // its end would hide this one
  killBottomST();
  contactPopup.$contain.addClass('is-active').css('display', 'block');
  if (contactPopup.$panel.length) contactPopup.$panel[0].scrollTop = 0;
  lockScroll();
  buildPopupTl().play(0);
}

function closeContactPopup(immediate) {
  if (!contactPopupOpen) return;
  contactPopupOpen = false;
  const closeY = contactBottomVisible ? '-100vh' : '100vh';
  killBottomST();
  // The opening, if it's still running, stops here (its end would set up the
  // bottom trigger on a popup that's closing).
  if (contactPopupTl) { contactPopupTl.kill(); contactPopupTl = null; }
  if (contactCloseTl) { contactCloseTl.kill(); contactCloseTl = null; }

  if (immediate) {
    if (contactPopup.$panel.length) contactPopup.$panel[0].scrollTop = 0;
    contactPopup.$contain.removeClass('is-active').hide();
    gsap.set([contactPopup.$panel, contactPopup.$bk, contactPopup.$blur], { clearProps: 'all' });
    unlockScroll();
    return;
  }

  gsap.killTweensOf([contactPopup.$panel, contactPopup.$bk, contactPopup.$blur]);

  contactCloseTl = gsap.timeline({
    defaults: { ease: 'power3.in' },
    onComplete: () => {
      contactCloseTl = null;
      if (contactPopup.$panel.length) contactPopup.$panel[0].scrollTop = 0;
      contactPopup.$contain.removeClass('is-active').hide();
      gsap.set([contactPopup.$panel, contactPopup.$bk, contactPopup.$blur], { clearProps: 'all' });
      unlockScroll();
    }
  })
    .to(contactPopup.$blur,  { backdropFilter: 'blur(0rem)', duration: 0.22, ease: 'power2.out' }, 0)
    .to(contactPopup.$bk,    { opacity: 0, duration: 0.2 }, 0)
    .to(contactPopup.$panel, { y: closeY,  duration: 0.32 }, 0);
}

// Open instead of navigating to /contact
$(document).on('click', 'a[href="/contact"], a[href="/contact/"]', function (e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  openContactPopup();
});

// Close triggers
$(document).on('click', '.popup-contain .popup-bk, .popup-contain .popup-blur, .popup-bottom, .close-popup, [close-popup]', function (e) {
  e.preventDefault();
  closeContactPopup(false);
});

$(document).on('keydown', function (e) {
  if (e.key === 'Escape') closeContactPopup(false);
});

barba.hooks.leave(() => closeContactPopup(true));

/* ─────────────────────────────────────────────
   THEME (dark / light) — single source of truth
   — "Dark" == the toggle's active state: the --swatch--dark /
     --swatch--light vars are swapped on :root. (:root persists
     across Barba since <html> isn't swapped, so theme survives
     navigation.)
   — setTheme() is what BOTH the toggle click and the CLOSED→dark
     rule call, so they can never desync. It animates (or instantly
     sets) the swap and mirrors every .toggle_track_wrap's UI state.
   — Placed before the clock IIFE below because that IIFE applies
     the initial theme on load.
───────────────────────────────────────────── */
// Seeded by the pre-paint head snippet (window.__themeDark / __swatchBase) so
// the bundle starts already in the right theme — no light→dark flash on load.
let darkMode = !!(window.__themeDark);
let themeLastOpen = null;            // last known OPEN/CLOSED, for flip detection
let swatchesCaptured = false;
let swatchBaseDark = '', swatchBaseLight = '';
let swatchBaseDarkFaded = '', swatchBaseLightFaded = '', hasFaded = false;
const themeProxy = { p: darkMode ? 1 : 0 };
let themeTween = null;

function captureSwatches() {
  if (swatchesCaptured) return;      // capture the base swatches once, before any override
  // Prefer the TRUE base values captured by the head snippet BEFORE it swapped
  // the inline vars; fall back to computed style if the snippet isn't present.
  const base = window.__swatchBase || {};
  const cs = getComputedStyle(document.documentElement);
  swatchBaseDark  = base.dark  || cs.getPropertyValue('--swatch--dark').trim();
  swatchBaseLight = base.light || cs.getPropertyValue('--swatch--light').trim();
  swatchBaseDarkFaded  = base.darkFaded  || cs.getPropertyValue('--swatch--dark-faded').trim();
  swatchBaseLightFaded = base.lightFaded || cs.getPropertyValue('--swatch--light-faded').trim();
  hasFaded = !!(swatchBaseDarkFaded && swatchBaseLightFaded);
  swatchesCaptured = true;
}

function syncToggleUI(dark) {
  document.querySelectorAll('.toggle_track_wrap').forEach((track) => {
    track.classList.toggle('is-active', dark);
    track.setAttribute('aria-pressed', String(dark));
  });
}

function setTheme(dark, animate = true) {
  captureSwatches();
  darkMode = dark;

  const root = document.documentElement;
  const target = dark ? 1 : 0;

  // Footer spin videos crossfade on the SAME themeProxy.p as the colors. They're
  // opaque (white/black bg), so a symmetric crossfade lets the page bg bleed
  // through at the midpoint. Instead, keep the light video fully opaque as the
  // base layer and only fade the dark video (which sits on top in the DOM) in/out.
  const lightVids = document.querySelectorAll('.footer-spin-video.is-light-mode');
  const darkVids  = document.querySelectorAll('.footer-spin-video.is-dark-mode');
  const ventureLogos = document.querySelectorAll('.venture-logo');
  if (lightVids.length) gsap.set(lightVids, { opacity: 1 }); // always-opaque base

  const render = () => {
    const p = themeProxy.p; // 0 = light, 1 = dark
    root.style.setProperty('--swatch--dark',  gsap.utils.interpolate(swatchBaseDark,  swatchBaseLight, p));
    root.style.setProperty('--swatch--light', gsap.utils.interpolate(swatchBaseLight, swatchBaseDark,  p));
    if (hasFaded) {
      // In dark mode (p→1): --swatch--dark-faded takes --swatch--light-faded's value (and vice-versa).
      root.style.setProperty('--swatch--dark-faded',  gsap.utils.interpolate(swatchBaseDarkFaded,  swatchBaseLightFaded, p));
      root.style.setProperty('--swatch--light-faded', gsap.utils.interpolate(swatchBaseLightFaded, swatchBaseDarkFaded,  p));
    }
    if (darkVids.length) gsap.set(darkVids, { opacity: p });
    // Venture logos invert in dark mode. Flip at the crossfade midpoint rather
    // than animating invert() (which would wash through grey).
    if (ventureLogos.length) gsap.set(ventureLogos, { filter: p >= 0.5 ? 'invert(1)' : 'invert(0)' });
  };

  if (themeTween) themeTween.kill();
  if (animate) {
    themeTween = gsap.to(themeProxy, { p: target, duration: 0.4, ease: 'power2.inOut', overwrite: true, onUpdate: render });
  } else {
    themeProxy.p = target;
    render();
  }

  syncToggleUI(dark);
}

/* ─────────────────────────────────────────────
   CLOCKS — shared by the nav clock and the team clocks
   — One formatter per time zone, made once: a new one every second
     cost a few ms per tick with the whole team on the page.
───────────────────────────────────────────── */
const clockFormats = {}, dayHourFormats = {};
function clockText(tz) {
  const f = clockFormats[tz] || (clockFormats[tz] = new Intl.DateTimeFormat('en-GB', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz
  }));
  return f.format(new Date());
}
// Working hours there: Monday to Friday, 9:00 to 18:00.
function isWorkHours(tz) {
  const f = dayHourFormats[tz] || (dayHourFormats[tz] = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23'
  }));
  let day = '', hour = 0;
  f.formatToParts(new Date()).forEach((p) => {
    if (p.type === 'weekday') day = p.value;
    else if (p.type === 'hour') hour = +p.value;
  });
  return day !== 'Sat' && day !== 'Sun' && hour >= 9 && hour < 18;
}

/* ─────────────────────────────────────────────
   NAV CLOCK + STATUS
   — IIFE with self-cleaning timer tracking via
     window.__navWrapTimers, safe across Barba
   — Only the persistent nav: the copy inside the page (mobile menu)
     leaves with its page.
───────────────────────────────────────────── */
(() => {
  const cities = [
    { code: 'NYC', tz: 'America/New_York'    },
    { code: 'MTL', tz: 'America/Toronto'     },
    { code: 'MEX', tz: 'America/Mexico_City' },
    { code: 'SYD', tz: 'Australia/Sydney'    },
    { code: 'AMS', tz: 'Europe/Amsterdam'    },
  ];

  const fmt = clockText;
  const isOpenNYC = () => isWorkHours('America/New_York');

  const $wraps = $('.nav-links-wrap').filter(function () { return !this.closest('[data-barba="container"]'); });
  if (!$wraps.length) return;

  // Clean up old timers so Barba re-init doesn't stack
  window.__navWrapTimers = window.__navWrapTimers || [];
  window.__navWrapTimers.forEach(t => { clearInterval(t); clearTimeout(t); });
  window.__navWrapTimers = [];

  $wraps.each(function () {
    const $wrap   = $(this);
    const $clock  = $wrap.find('.nav-link:first .nav-link-txt').first();
    const $status = $wrap.find('.nav-link[hide-ml] .nav-link-txt').first();
    const $dot    = $wrap.find('.open-dot').length ? $wrap.find('.open-dot') : $('.open-dot');

    if (!$clock.length && !$status.length) return;

    let idx     = 0;
    let current = cities[idx];

    const updateClock = () => {
      if ($clock.length) $clock.text(`${current.code} ${fmt(current.tz)}`);
    };

    const rotateCity = () => {
      if (!$clock.length) return;
      gsap.to($clock, {
        y: -6, opacity: 0, duration: 0.2, ease: 'power2.in',
        onComplete: () => {
          idx     = (idx + 1) % cities.length;
          current = cities[idx];
          $clock.text(`${current.code} ${fmt(current.tz)}`);
          gsap.fromTo($clock,
            { y: 6, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out', clearProps: 'transform' }
          );
        }
      });
    };

    const updateStatus = () => {
      const open = isOpenNYC();

      // CLOSED (red) → dark mode, OPEN → light. Only flips theme on an
      // actual open/closed change, so a manual toggle isn't overridden
      // in between. First apply is instant to avoid a load-time flash.
      if (open !== themeLastOpen) {
        const first = themeLastOpen === null;
        themeLastOpen = open;
        setTheme(!open, !first);
      }

      if (!$status.length) return;
      if (open) {
        $status.text('OPEN');
        if ($dot.length) gsap.set($dot, { backgroundColor: '#00FF40' });
      } else {
        $status.text('CLOSED');
        if ($dot.length) gsap.set($dot, { backgroundColor: '#ff3b3b' });
      }
    };

    updateClock();
    updateStatus();

    // These start hidden (opacity:0) pre-paint via the head snippet's
    // .stats-loading rule, so there's no placeholder pop. Fade them in now that
    // they're populated. (Inline opacity from GSAP overrides the loading rule.)
    gsap.fromTo($clock.add($status).add($dot),
      { opacity: 0 },
      { opacity: 1, duration: 0.4, ease: 'power2.out' }
    );

    window.__navWrapTimers.push(
      setInterval(updateClock,  1000),
      setInterval(rotateCity,   4000),
      setInterval(updateStatus, 30000)
    );
  });

  // Hidden state no longer needed once the bundle has revealed everything.
  document.documentElement.classList.remove('stats-loading');
})();

/* ─────────────────────────────────────────────
   INIT: YEAR
───────────────────────────────────────────── */
function initYear() {
  $('.current-year').text(new Date().getFullYear());
}

/* ─────────────────────────────────────────────
   INIT: MOBILE MENU
───────────────────────────────────────────── */
// One timeline at a time: each page rebuilds it, and the old one (rewound
// first, so the burger is back to its lines) would otherwise keep the page
// that left alive in memory through the menu it animated.
let mobileMenuTl = null;
function initMobileMenu() {
  let isOpen = false;
  if (mobileMenuTl) { mobileMenuTl.progress(0).kill(); mobileMenuTl = null; }

  const tl = mobileMenuTl = gsap.timeline({
    paused: true,
    defaults: { duration: 0.4, ease: 'power4.inOut' }
  })
    .to('.burger-line.middle', { marginTop: 'calc(0rem - 1px)', marginBottom: 'calc(0rem - 1px)' })
    .set('.burger-line.middle', { opacity: 0 }, '<0.2')
    .to('.burger-line.top',    { rotate: '45deg' }, '<')
    .to('.burger-line.bottom', { rotate: '-45deg' }, '<')
    .set('.menu-mobile-wrap',  { display: 'flex' }, '<')
    .from('.menu-mobile-wrap', { opacity: 0, duration: 0.2 }, '<0.1');

  $('.burger-wrap')
    .off('click.nav')
    .on('click.nav', function () {
      isOpen ? tl.reverse() : tl.play();
      isOpen = !isOpen;
    });
}

/* ─────────────────────────────────────────────
   INIT: CURRENT PAGE LINKS → SCROLL TO TOP
───────────────────────────────────────────── */
function initCurrentLinks() {
  $(document)
    .off('click.currentLink')
    .on('click.currentLink', 'a', function (e) {
      // This page however the link is written (absolute, trailing slash);
      // anchors (a bare "#" placeholder included) and query strings still go through.
      const raw = this.getAttribute('href') || '';
      if (!raw || raw.indexOf('#') !== -1 || this.origin !== location.origin || this.search !== location.search
        || navPath(this.pathname) !== navPath(location.pathname)) return;
      e.preventDefault();
      e.stopPropagation();
      lenisActive
        ? lenis.scrollTo(0, { duration: 0.5 })
        : window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

/* ─────────────────────────────────────────────
   INIT: DRAWERS
───────────────────────────────────────────── */
function initDrawers() {
  $('[class*="drawer-top"], [drawer-top]')
    .off('click.app')
    .on('click.app', function () {
      const $item   = $(this).closest('.drawer-item, [drawer-parent]');
      const wasOpen = $item.hasClass('open');

      $item.siblings().removeClass('open');
      wasOpen ? $item.removeClass('open') : $item.addClass('open');

      setTimeout(() => ScrollTrigger.refresh(), 600);
    });
}

/* ─────────────────────────────────────────────
   INIT: SWIPERS
   — Sliders with a data-marquee attribute run on their own (see
     MARQUEES AND CAROUSELS) and are skipped once that holds them; one it
     couldn't start falls back to Swiper below.
───────────────────────────────────────────── */
function initSwipers() {
  const $swipers = $('.swiper').not('[data-marquee-init]');
  if (!$swipers.length) return; // most pages: Swiper is never even fetched

  // Load Swiper on demand (no-op if the footer still ships it), then build,
  // unless the visitor has already left for another page in the meantime.
  const page = swiperPage;
  ensureLib('swiper').then(() => { if (page === swiperPage) buildSwipers($swipers); }).catch((e) => console.warn(e));
}
let swiperPage = 0;
barba.hooks.before(() => { swiperPage++; });

function buildSwipers($swipers) {
  $swipers.each(function () {
    const $el = $(this);
    const containerEl = $el.find('.swiper-container')[0];
    // Skip only if THIS swiper has no slides of its own. Don't bail on
    // .w-dyn-empty coming from nested CMS lists inside the slides (e.g. the
    // hover-visual lists) — those placeholders are always in the DOM and were
    // aborting initialization.
    if (!containerEl || !$el.find('.swiper-slide').length) return;
    // First-ever load is async: bail if the page was left before Swiper arrived.
    if (!document.contains(containerEl)) return;

    const slideCount = $el.find('.swiper-slide').length;
    const canLoop    = slideCount > 1;
    // data-marquee="true" → slow, continuous, infinite flow (not one slide at a
    // time) that runs until the user interacts, then flips to fast + eased manual
    // navigation. Needs loop, so it's gated behind canLoop.
    const marquee       = $el.data('marquee') === true;
    const marqueeSpeed  = $el.data('marquee-speed') || 28000; // slow autoplay crawl
    const interactSpeed = $el.data('speed')         || 600;   // fast slide change once user takes over

    const instance = new Swiper(containerEl, {
      grabCursor:     true,
      speed:          marquee ? marqueeSpeed : interactSpeed,
      loop:           marquee ? canLoop : $el.data('loop'),
      centeredSlides: $el.data('centered'),
      slidesPerView:  'auto',
      slidesPerGroup: 1,
      autoplay: marquee
        ? (canLoop && { delay: 0, disableOnInteraction: true })
        : ($el.data('autoplay')
            ? { delay: $el.data('delay') || 5000, reverseDirection: $el.data('reverse') === true }
            : false),
      navigation: {
        nextEl: $el.find('.is-next')[0],
        prevEl: $el.find('.is-prev')[0]
      },
      mousewheel: {
        forceToAxis: $el.data('axis') !== false,
        invert:      false,
        sensitivity: 1.5
      },
      pagination: {
        el:        $el.find('.swiper-pagination')[0],
        clickable: true
      },
      // CMS sliders: the wrapper is Webflow's role="list", so slides must stay
      // listitems (Swiper's default role="group" breaks the list for screen
      // readers and was flagged in the SEO audit). Static sliders keep "group".
      a11y: {
        slideRole: containerEl.querySelector('.swiper-wrapper[role="list"]') ? 'listitem' : 'group',
        prevSlideMessage: 'Previous slide',
        nextSlideMessage: 'Next slide'
      }
    });

    // Marquee → on the first interaction, drop the linear crawl for normal
    // eased navigation at the faster interactSpeed. .is-marquee-auto carries the
    // linear timing in CSS (see snippet); removing it restores Swiper's ease.
    if (marquee && canLoop) {
      $el.addClass('is-marquee-auto');
      const goInteractive = () => {
        if (!$el.hasClass('is-marquee-auto')) return;
        $el.removeClass('is-marquee-auto');
        instance.params.speed = interactSpeed;
        instance.autoplay && instance.autoplay.stop();
      };
      instance.on('touchStart', goInteractive);
      $el.on('click.marquee', '.is-next, .is-prev, .swiper-pagination-bullet', goInteractive);
    }

    swiperInstances.push(instance);
  });
}

/* ─────────────────────────────────────────────
   INIT: SECTION IMAGE PARALLAX (desktop only)
───────────────────────────────────────────── */
function initSectionImgParallax() {
  if (reducedMotion || window.innerWidth < 992) return;

  $('.section-img').each(function () {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: this,
        start:   'top bottom',
        end:     'bottom top',
        scrub:   true
      }
    }).fromTo($(this).find('.g_visual_img'),
      { yPercent: -5 },
      { yPercent: 5, ease: 'none' }
    );
    tl.scrollTrigger.update(); // lands on its scrolled position this frame, not on the start values
  });
}

/* ─────────────────────────────────────────────
   INIT: SECTION ITEM COUNTS
   — for each .section-top-txt containing "(…)",
     wrap the parenthesis in a .section-txt-serif
     span and inject the live item count.
   — swiper sections: count non-cloned slides
     (ignores Swiper's loop duplicates)
   — other sections: count top-level CMS items
     (children of the first list, so nested
     hover-image repeaters aren't counted)
───────────────────────────────────────────── */
function initSectionCounts(root = document) {
  $(root).find('.section-top-txt').each(function () {
    const $txt = $(this);
    const text = $txt.text();
    if (!/\([^)]*\)/.test(text)) return;

    // Copies made for looping (Swiper's or a marquee's) don't count.
    const $section = $txt.closest('section');
    const count = $section.find('.swiper').length
      ? $section.find('.swiper-slide:not(.swiper-slide-duplicate):not([aria-hidden="true"])').length
      : $section.find('.w-dyn-items').first().children('.w-dyn-item').length;

    const label = text.replace(/\s*\([^)]*\)\s*$/, '');
    $txt.html(`${label} <span class="section-txt-serif">(${count})</span>`);
  });
}


function initStagingHelper() {
  if (!isStaging) return;
  // Replace, not stack: one listener per page, or navigations would pile them
  // up. The previous page's goes first, so it never holds on to that page.
  if (window.__stagingKeyHandler) {
    document.removeEventListener('keydown', window.__stagingKeyHandler);
    window.__stagingKeyHandler = null;
  }
  const items = document.querySelectorAll('.cs-item-name');
  if (!items.length) return;

  let hidden = true;
  items.forEach(el => { el.style.display = 'none'; });

  window.__stagingKeyHandler = (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return; // typing in a form
    if (e.key === 'g' || e.key === 'G') {
      hidden = !hidden;
      items.forEach(el => { el.style.display = hidden ? 'none' : 'flex'; });
    }
  };
  document.addEventListener('keydown', window.__stagingKeyHandler);
}


  
/* ── Toggles ── (theme handled by shared setTheme; see THEME section) */
function initToggles() {
  document.querySelectorAll(".toggle_wrap").forEach((component) => {
    if (component.dataset.scriptInitialized) return;
    component.dataset.scriptInitialized = "true";

    const track = component.querySelector(".toggle_track_wrap");
    if (!track) return;

    track.addEventListener("click", () => setTheme(!darkMode));
  });

  // After a Barba render: make freshly-inserted toggle(s) reflect the current
  // theme and re-assert the swatch swap on the new page (no animation).
  setTheme(darkMode, false);
}


/* ─────────────────────────────────────────────
   INIT: RELATED WORK — random 3
   — Keep 3 random .work-coll-item in the related list and
     remove the rest (and the project itself, if the list has it).
     After a Barba navigation this runs on the incoming page before
     the slide, so ScrollTriggers are only ever made on the final list.
   — The related list has no dedicated class, so it's located by
     its "Related work" heading and scoped to that .section-contain
     (the main /work grid has a different heading, so it's never
     touched). An explicit .related-work-coll-wrap overrides this
     if you ever add one.
   — Runs before the work-list inits below so videos/titles only
     process the kept items. Re-randomises on each Barba load.
───────────────────────────────────────────── */
// root: the document, or the incoming page during a transition (shaped
// before its first frame); href: that page's URL.
function initRelatedWork(root = document, href = location.href) {
  let scope = root.querySelector('.related-work-coll-wrap');
  if (!scope) {
    const heading = Array.from(root.querySelectorAll('.section-top-txt'))
      .find(el => /related work/i.test(el.textContent));
    scope = heading ? heading.closest('.section-contain') : null;
  }
  if (!scope) return;

  let items = Array.from(scope.querySelectorAll('.work-coll-item'));
  // The project being read is never one of its own related projects (by
  // path, so a ?utm_… on the URL doesn't matter). If every card matched,
  // paths don't tell the projects apart here: nothing is dropped.
  const here = navPath(new URL(href, location.href).pathname);
  const self = items.filter((el) => {
    const a = el.querySelector('a[href]');
    return a && a.origin === location.origin && navPath(a.pathname) === here;
  });
  if (self.length && self.length < items.length) {
    self.forEach(el => el.remove());
    items = items.filter(el => !self.includes(el));
  }
  if (items.length <= 3) return;

  // Fisher–Yates shuffle, then keep the first 3 (kept items stay in DOM order).
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  items.slice(3).forEach(el => el.remove());
}

/* ─────────────────────────────────────────────
   INIT: WORK ITEM TITLES
   — Collapse the two stacked .work-item-title divs in each
     .work-item-title-wrap into one element so the title and
     faded tagline flow / wrap as a single run. The tagline
     becomes an inline <span class="u-color-faded">.
   — Keeps fs-cmsfilter-field="name" on the merged element so
     Finsweet filtering still matches the full text.
   — Blog cards (.blog-item): the faded date and the title, stacked
     right under .work-news-title-wrap, become one run the same way,
     date first: "<span class=u-color-faded>Oct 2, 2026</span> Title".
   — Idempotent (guarded) so Barba re-init won't re-wrap.
───────────────────────────────────────────── */
function initWorkItemTitles(root = document) {
  root.querySelectorAll('.blog-item .work-news-title-wrap').forEach((wrap) => {
    if (wrap.dataset.titlesMerged === '1') return;
    const parts = Array.from(wrap.children).filter(el => el.classList.contains('work-item-title'));
    const main = parts.find(el => !el.classList.contains('u-color-faded'));
    if (parts.length < 2 || !main) return;
    // Each part keeps its place in the run; the faded ones become faded spans.
    const run = parts.map((el) => {
      const txt = el.textContent.trim();
      if (!txt) return null;
      if (el === main) return document.createTextNode(txt);
      const span = document.createElement('span');
      span.className = 'u-color-faded';
      span.textContent = txt;
      return span;
    }).filter(Boolean);
    main.textContent = '';
    run.forEach((node, i) => { if (i) main.appendChild(document.createTextNode(' ')); main.appendChild(node); });
    parts.forEach((el) => { if (el !== main) el.remove(); });
    wrap.dataset.titlesMerged = '1';
  });

  root.querySelectorAll('.work-item-title-wrap').forEach((wrap) => {
    if (wrap.dataset.titlesMerged === '1') return;

    const titles = wrap.querySelectorAll('.work-item-title');
    if (titles.length < 2) return;

    const main = titles[0];
    const sub  = titles[1];

    const span = document.createElement('span');
    span.className = 'u-color-faded';
    span.textContent = sub.textContent.trim();

    main.classList.remove('u-color-faded');
    main.textContent = main.textContent.trim() + ' '; // title, then a space
    main.appendChild(span);                            // then faded tagline, inline
    main.setAttribute('fs-cmsfilter-field', 'name');   // keep search matching full text

    sub.remove();
    wrap.dataset.titlesMerged = '1';
  });
}

/* ─────────────────────────────────────────────
   INIT: RELATED POSTS — the 3 newest others  (blog article, .blog-related-wrap)
   — "More articles" lists the 4 newest posts (Webflow sorts them by
     date). The post being read is taken out, then the first 3 are kept,
     so every article shows the 3 newest other posts, newest first.
     No other post at all: the section goes.
   — Like related work, it runs on the incoming page before the slide
     (Barba enter), so the page lands in its final shape, and again from
     allpages (a no-op the second time).
───────────────────────────────────────────── */
// root: the document, or the incoming page during a transition; href: that page's URL.
function initRelatedPosts(root = document, href = location.href) {
  const here = navPath(new URL(href, location.href).pathname);
  root.querySelectorAll('.blog-related-wrap').forEach((wrap) => {
    if (wrap.dataset.relatedPosts === '1') return;
    wrap.dataset.relatedPosts = '1';

    // The post itself, by path (a ?utm_… on the URL doesn't matter). A card
    // whose link is a bare "#" placeholder is never taken for it. Cards only:
    // a list nested in a card (tags, pictures) has .w-dyn-item too.
    const items = Array.from(wrap.querySelectorAll(':scope > .w-dyn-items > .w-dyn-item')).filter((el) => {
      const a = el.querySelector('a[href]');
      const raw = a ? a.getAttribute('href') : '';
      const self = !!raw && raw.charAt(0) !== '#' && a.origin === location.origin && navPath(a.pathname) === here;
      if (self) el.remove();
      return !self;
    });
    items.slice(3).forEach(el => el.remove());

    if (!items.length) {
      const section = wrap.closest('section');
      if (section) section.style.display = 'none';
    }
  });
}

/* ─────────────────────────────────────────────
   INIT: BLOG ARTICLE  (blog article meta column, .list-contain-flex.is-blog)
   — Share: LinkedIn, X and Facebook links ([data-share]) share the
     address of the post being read (X with its title, from
     [data-share-title]). "Copy link" copies that address and reads
     "Link copied" for 2s.
   — Project: Webflow can't link to the page of a referenced item, so the
     link carries the project's slug (data-project-slug) and is pointed at
     /work/<slug> here. Without the JS it goes to /work.
   — A row whose value is empty in the CMS (no author, no reading time,
     no project) is taken out, its label and line with it.
   — Runs on the incoming page before the slide (Barba enter), so nothing
     moves once it's on screen, and again from allpages (a no-op then).
───────────────────────────────────────────── */
const SHARE_URLS = {
  linkedin: (u)    => `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
  x:        (u, t) => `https://twitter.com/intent/tweet?url=${u}${t ? `&text=${t}` : ''}`,
  facebook: (u)    => `https://www.facebook.com/sharer/sharer.php?u=${u}`,
};
const COPY_LINK = { done: 'Link copied', hold: 2000 }; // label after copying, and how long it stays (ms)

// Older browsers, and pages not on https: copy through a selected textarea.
function copyTextFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.setAttribute('aria-hidden', 'true');
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
  const back = document.activeElement;
  document.body.appendChild(ta);
  ta.focus({ preventScroll: true });
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  ta.remove();
  if (back && back.focus) back.focus({ preventScroll: true });
  return ok;
}
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true, () => copyTextFallback(text));
  }
  return Promise.resolve(copyTextFallback(text));
}
// The first visible words in el (an icon's aria-hidden glyph is skipped).
function firstTextNode(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const hidden = n.parentElement.closest('[aria-hidden="true"]');
    if (n.nodeValue.trim() && !(hidden && hidden !== el && el.contains(hidden))) return n;
  }
  return null;
}

// root: the document, or the incoming page during a transition; href: that page's URL.
function initBlogArticle(root = document, href = location.href) {
  const meta = root.querySelector('.list-contain-flex.is-blog');
  if (!meta || meta.dataset.blogArticle === '1') return;
  meta.dataset.blogArticle = '1';

  const url = new URL(href, location.href);
  const pageUrl = url.origin + url.pathname;
  const titleEl = root.querySelector('[data-share-title]');
  const u = encodeURIComponent(pageUrl);
  const t = encodeURIComponent(titleEl ? titleEl.textContent.trim() : '');

  // Project link → the project's page.
  meta.querySelectorAll('[data-project-slug]').forEach((a) => {
    const slug = (a.getAttribute('data-project-slug') || '').trim();
    if (slug) a.setAttribute('href', '/work/' + encodeURIComponent(slug));
  });

  // Empty rows go. A row's value is the first element in its value column
  // (author name, reading time, project name): Webflow marks a bound field
  // with nothing in it .w-dyn-bind-empty. Static content (an icon, a label)
  // never hides a row.
  meta.querySelectorAll('.list-wrap').forEach((row) => {
    const value = row.querySelector('.txt-main-flex');
    if (!value) return;
    const lead = Array.from(value.querySelectorAll('*')).find(el => !el.children.length) || value;
    const noProject = Array.from(value.querySelectorAll('[data-project-slug]'))
      .some(a => !(a.getAttribute('data-project-slug') || '').trim());
    if (lead.classList.contains('w-dyn-bind-empty') || noProject) row.style.display = 'none';
  });

  // Share links → this post.
  meta.querySelectorAll('[data-share]').forEach((a) => {
    const kind = a.getAttribute('data-share');
    if (SHARE_URLS[kind]) {
      a.setAttribute('href', SHARE_URLS[kind](u, t));
      return;
    }
    if (kind !== 'copy') return;

    // Copy link: an <a href="#"> with role="button". The scroll-to-top on
    // links to this page skips "#"; Barba is told to leave it alone too
    // (it would prefetch this very page on hover).
    a.setAttribute('data-barba-prevent', '');
    // Only the words change: the [data-copy-label] element's, or the link's
    // first text, so an icon or wrapper inside the link survives the swap.
    const labelEl = a.querySelector('[data-copy-label]');
    const textNode = labelEl ? null : firstTextNode(a);
    const setLabel = (s) => { if (labelEl) labelEl.textContent = s; else if (textNode) textNode.nodeValue = s; };
    const label = labelEl ? labelEl.textContent : textNode ? textNode.nodeValue : '';
    // Screen readers hear the result once, from a hidden status line.
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    status.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
    a.after(status);
    let timer = 0;
    const copy = (e) => {
      e.preventDefault();
      copyText(pageUrl).then((ok) => {
        if (!ok) return;
        setLabel(COPY_LINK.done);
        status.textContent = COPY_LINK.done;
        clearTimeout(timer);
        timer = setTimeout(() => { setLabel(label); status.textContent = ''; }, COPY_LINK.hold);
      });
    };
    a.addEventListener('click', copy);
    a.addEventListener('keydown', (e) => { if (e.key === ' ') copy(e); }); // a button also answers Space
  });
}

/* ─────────────────────────────────────────────
   VIDEO PLAY (shared by every video the site plays itself)
   — play() can be refused: iOS in Low Power Mode, or a browser set to
     never autoplay. The video then shows anyway once its first frame is
     in (never an empty box: the case studies have no picture under
     their videos), and the ones on screen try again on the visitor's
     first tap or click, which browsers do allow.
───────────────────────────────────────────── */
const refusedVideos = new Set();
function retryRefusedVideos() {
  document.removeEventListener('pointerdown', retryRefusedVideos, true);
  document.removeEventListener('touchend', retryRefusedVideos, true);
  refusedVideos.forEach((v) => {
    const r = v.getBoundingClientRect();
    if (v.isConnected && r.width && r.bottom > 0 && r.top < window.innerHeight) v.play().catch(() => {});
  });
  refusedVideos.clear();
}
function playVideo(v, reveal) {
  const p = v.play();
  if (!p || !p.catch) return;
  p.catch((err) => {
    if (!err || err.name !== 'NotAllowedError') return; // AbortError: paused on purpose
    if (reveal) {
      if (v.readyState >= 2) reveal(v);
      else v.addEventListener('loadeddata', () => reveal(v), { once: true });
    }
    if (!refusedVideos.size) {
      document.addEventListener('pointerdown', retryRefusedVideos, true);
      document.addEventListener('touchend', retryRefusedVideos, true);
    }
    refusedVideos.add(v);
  });
}

/* ─────────────────────────────────────────────
   INIT: HERO VIDEO
   — Videos inside .hero-section carry their URL in data-source
     (not src), so nothing loads until we promote it. Play them
     after the Barba transition (allpages runs in transition.after
     / on first load) and fade opacity 0 → 1 once they're actually
     playing, so there's no black-frame pop.
   — Plays only while on screen: paused once scrolled past, so the
     hero isn't decoded for the rest of the visit.
   — Class-agnostic: any <video data-source> inside .hero-section
     (except in a marquee, which plays its own slides).
───────────────────────────────────────────── */
function initHeroVideos() {
  const videos = Array.from(document.querySelectorAll('.hero-section video[data-source]'))
    .filter(v => !v.closest('[data-marquee-init]'));
  if (!videos.length) return;

  const reveal = (v) => gsap.to(v, { opacity: 1, duration: 0.6, ease: 'power2.out', overwrite: true });
  const hio = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) playVideo(e.target, reveal);
    else { try { e.target.pause(); } catch (err) {} }
  }));
  videoTeardown.push(() => hio.disconnect());

  videos.forEach((v) => {
    const src = v.getAttribute('data-source');
    if (src && v.getAttribute('src') !== src) {
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.removeAttribute('autoplay'); // we drive play ourselves, post-transition
      v.src = src;
      v.load();
    }

    gsap.set(v, { opacity: 0 });
    // Fade in only once it's truly playing (avoids revealing a black frame).
    if (v.readyState >= 3) reveal(v);
    else v.addEventListener('playing', () => reveal(v), { once: true });
    hio.observe(v);
  });
}

/* ─────────────────────────────────────────────
   INIT: TXT-BTN LINE SWEEP
   — On hover of a .txt-btn, sweep its .txt-btn-line-wrap across:
     xPercent -100 → 100 (enters from left, exits right).
   — Delegated + namespaced so it survives Barba and never stacks.
───────────────────────────────────────────── */
function initTxtBtnLines() {
  $(document)
    .off('mouseenter.txtBtn')
    .on('mouseenter.txtBtn', '.txt-btn', function () {
      const wrap = this.querySelector('.txt-btn-line-wrap');
      if (!wrap) return;
      runRecipe("txtBtnLine", gsap.timeline(), { wrap, btn: this }); // tunable on staging with `t`
    });
}

/* ─────────────────────────────────────────────
   INIT: SERVICES HOVER
   — Hovering a .service-item (text) reveals the .service-img-item
     at the SAME INDEX (opacity → 1, others → 0). The active image
     stays until another item is hovered (no reset on hover-out).
   — The two .services-list lists are told apart by their children
     (text = .service-item, images = .service-img-item). Index i in
     one maps to index i in the other.
   — Stands down on the Services page once initServicesFollow drives
     it (section[data-follow-init]); the fallback if that one can't run.
───────────────────────────────────────────── */
function initServicesHover() {
  const textItems = Array.from(document.querySelectorAll('.service-item'));
  if (!textItems.length) return;

  const firstImg = document.querySelector('.service-img-item');
  const imgList  = firstImg ? firstImg.closest('.services-list') : null;
  const imgItems = imgList ? Array.from(imgList.querySelectorAll('.service-img-item')) : [];
  if (!imgList || !imgItems.length) return;
  if (imgList.closest('[data-follow-init]')) return; // driven by initServicesFollow

  if (imgList.dataset.servicesHoverInit) return;
  imgList.dataset.servicesHoverInit = '1';

  // First image visible on load; the rest hidden.
  imgItems.forEach((el, idx) => gsap.set(el, { opacity: idx === 0 ? 1 : 0 }));

  textItems.forEach((item, i) => {
    item.addEventListener('mouseenter', () => {
      imgItems.forEach((el, idx) =>
        gsap.to(el, { opacity: idx === i ? 1 : 0, duration: 0.4, ease: 'power2.out', overwrite: true })
      );
    });
  });
}

/* ─────────────────────────────────────────────
   INIT: SERVICE PAGE  (Services template: /services/<slug>)
   — Sections marked data-hide-if-empty go when their [data-key] field is
     empty in the CMS. What's included, Featured work, FAQs and All
     services go when their list has no item.
   — Features (section[data-service-features]): three texts scroll on the
     left; the square picture beside them stays put (CSS sticky) and, with
     its caption, cross-fades to the feature whose text crosses the middle
     of the screen (featureSwap recipe). A feature with no title is taken
     out with its picture and caption. Without JS the first one shows.
   — All services: the cards run on the site's carousel (MARQUEES). Each
     takes its colour from data-color (hex from the CMS). Hover or keyboard
     focus shows the service picture behind the name (serviceCard recipe)
     and plays its video if it has one; .is-active turns the text white.
     The card of the page being read gets aria-current.
   — What's included has its own feature below (INCLUDED FOLLOW).
   — Reduced motion: pictures and cards swap without a fade. Idempotent;
     undone on every re-init.
───────────────────────────────────────────── */
let servicePageTeardown = [];
function teardownServicePage() {
  servicePageTeardown.splice(0).reverse().forEach(fn => { try { fn(); } catch (e) {} });
}

const serviceFieldEmpty = (el) => !el || el.classList.contains('w-dyn-bind-empty') || !el.textContent.trim();

function initServicePage(root = document) {
  teardownServicePage();

  // Empty CMS sections out of the page.
  root.querySelectorAll('section[data-hide-if-empty]').forEach((section) => {
    if (serviceFieldEmpty(section.querySelector('[data-key]'))) section.style.display = 'none';
  });
  root.querySelectorAll('[data-service-included], [data-service-work], [data-service-faq], [data-service-cards]').forEach((section) => {
    const list = section.querySelector('.w-dyn-items');
    if (!list || !list.children.length) section.style.display = 'none';
  });

  initServiceFeatures(root);
  initServiceCards(root);
}

function initServiceFeatures(root) {
  const section = root.querySelector('[data-service-features]');
  if (!section || section.style.display === 'none') return;
  const live = [1, 2, 3].map(n => ({
    n,
    text:  section.querySelector(`[data-feature="${n}"]`),
    layer: section.querySelector(`[data-feature-layer="${n}"]`),
    cap:   section.querySelector(`[data-feature-caption="${n}"]`)
  })).filter((f) => {
    if (!f.text) return false;
    if (f.n > 1 && serviceFieldEmpty(f.text.querySelector('h2, h3'))) {
      [f.text, f.layer, f.cap].forEach(el => el && el.remove());
      return false;
    }
    return true;
  });
  if (live.length < 2) return;

  const parts = (f) => [f.layer, f.cap].filter(Boolean);
  let active = 0;
  live.forEach((f, k) => gsap.set(parts(f), { opacity: k === 0 ? 1 : 0 }));
  const show = (i) => {
    if (i === active) return;
    const prev = parts(live[active]), next = parts(live[i]);
    active = i;
    const tl = runRecipe('featureSwap', gsap.timeline(), { next, prev });
    if (!tl.duration()) { tl.kill(); gsap.set(prev, { opacity: 0 }); gsap.set(next, { opacity: 1 }); }
  };
  live.forEach((f, i) => {
    const st = ScrollTrigger.create({
      trigger: f.text, start: 'top center', end: 'bottom center',
      onToggle: (self) => { if (self.isActive) show(i); }
    });
    servicePageTeardown.push(() => st.kill());
  });
  servicePageTeardown.push(() => live.forEach(f => gsap.killTweensOf(parts(f))));
}

function initServiceCards(root) {
  const cards = Array.from(root.querySelectorAll('[data-service-cards] .service-card'));
  if (!cards.length) return;
  const here = navPath(location.pathname);

  cards.forEach((card) => {
    const raw = (card.getAttribute('data-color') || '').trim();
    const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw) ? (raw[0] === '#' ? raw : '#' + raw) : '';
    if (hex) card.style.backgroundColor = hex;
    if (card.pathname && navPath(card.pathname) === here) card.setAttribute('aria-current', 'page');

    const visual = card.querySelector('.service-card-visual');
    const hasMedia = visual && visual.querySelector('img:not(.w-dyn-bind-empty)[src], video');
    if (!visual || !hasMedia) return;
    const video = visual.querySelector('video');

    const on = (show) => {
      card.classList.toggle('is-active', show);
      const tl = runRecipe('serviceCard', gsap.timeline(), { card, visual, show });
      if (!tl.duration()) gsap.set(visual, { opacity: show ? 1 : 0 });
      if (video) {
        if (show) { const p = video.play(); if (p && p.catch) p.catch(() => {}); }
        else video.pause();
      }
    };
    const enter = () => on(true);
    const leave = () => on(false);
    card.addEventListener('mouseenter', enter);
    card.addEventListener('mouseleave', leave);
    card.addEventListener('focus', enter);
    card.addEventListener('blur', leave);
    servicePageTeardown.push(() => {
      card.removeEventListener('mouseenter', enter);
      card.removeEventListener('mouseleave', leave);
      card.removeEventListener('focus', enter);
      card.removeEventListener('blur', leave);
      gsap.killTweensOf(visual);
    });
  });
}

/* ─────────────────────────────────────────────
   INIT: INCLUDED FOLLOW  (Services template, What's included: [data-included-follow])
   — A mix of the About awards list and the Services list. The rows are
     award rows: the hovered one steps right and its line draws across
     (awardsRow recipe), the others fade (site CSS, hov-list).
   — Each row's number sits at "(0)" in Webflow; it's written here in
     list order, (1), (2)… on every load.
   — A picture frame floats beside the list and follows the pointer up
     and down on a spring, on the rail of the rows' own pictures. It pops
     in and out like the awards badge (awardsBadge recipe) and swaps to
     the hovered row's picture like the Services frame (servicesSwap
     recipe), the window taking each picture's format (portrait, square
     or landscape: the Inclusion's Image Format in the CMS, bound as
     data-format on the row; empty or Auto follows the picture). No
     project cards trail it.
   — Hooks: [data-included-follow] on the list of .award-item rows, each
     with its .award-img-wrap picture (read for the frame, hidden while
     this runs; the static CSS hover shows it otherwise).
   — Mouse and trackpad from 992px only. Reduced motion, touch and smaller
     screens keep the static hover. Undone on every re-init.
───────────────────────────────────────────── */
const INCLUDED_FOLLOW = {
  size:   11,    // rem, longest side of the frame
  float:  0.55,  // s, vertical follow: the frame floats after the pointer on a spring
  bounce: 0.3,   // overshoot of that float (0 = settles straight)
  intent: 0.06,  // s the pointer rests on a row before the picture swaps
  nudge:  1,     // rem the hovered row steps right
  morph:  0.2    // s, spring time of a format change
};

let includedTeardown = [];
function teardownIncludedFollow() {
  includedTeardown.splice(0).reverse().forEach(fn => { try { fn(); } catch (e) {} });
}

function initIncludedFollow(root = document) {
  teardownIncludedFollow();
  const list = root.querySelector('[data-included-follow]');
  if (!list) return;
  const rows = Array.from(list.children).filter(el => el.classList.contains('award-item'));
  rows.forEach((row, i) => {
    const n = row.querySelector('[data-included-num]');
    if (n) n.textContent = '(' + (i + 1) + ')';
  });
  if (!rows.length || reducedMotion || !list.parentElement) return;
  const mm = gsap.matchMedia();
  includedTeardown.push(() => mm.revert());
  mm.add(FOLLOW_HOVER, () => {
    try { return setupIncludedFollow(list, rows); }
    catch (e) { console.error('[init] includedFollow failed:', e); } // the static CSS hover stays
  });
}

function setupIncludedFollow(list, rows) {
  const CFG  = INCLUDED_FOLLOW;
  const host = list.parentElement; // the frame sits beside the list, outside its hover fade
  const undo = [];
  let alive = true;
  const cleanup = () => {
    alive = false;
    undo.splice(0).reverse().forEach(fn => { try { fn(); } catch (e) {} });
  };

  // Each row's own picture: read for the frame, hidden (layout kept, to measure) while this runs.
  const wraps = rows.map(row => row.querySelector('.award-img-wrap'));
  const pics = wraps.map((wrap, i) => {
    const media = wrap && wrap.querySelector('.g_visual_img:not(.w-condition-invisible):not(.w-dyn-bind-empty), .g_visual_video:not(.w-condition-invisible)');
    if (wrap) wrap.style.visibility = 'hidden';
    if (!media) return null;
    const video = media.tagName === 'VIDEO';
    const src = video ? media.getAttribute('data-source') || media.getAttribute('src') || '' : media.getAttribute('src') || '';
    return src ? { video, src, srcset: video ? '' : media.getAttribute('srcset') || '', item: rows[i] } : null;
  });
  undo.push(() => wraps.forEach((w) => { if (w) w.style.visibility = ''; }));
  const ref = wraps.find(Boolean);
  if (!ref || !pics.some(Boolean)) return cleanup;

  if (getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
    undo.push(() => { host.style.position = ''; });
  }

  // Frame: travels and scales in and out; its box clips to the current picture's format.
  const frame = document.createElement('div');
  const box   = document.createElement('div');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:absolute;left:0;top:0;z-index:3;pointer-events:none;';
  box.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
  frame.appendChild(box);
  host.appendChild(frame);
  gsap.set(frame, { visibility: 'hidden', opacity: 0, scale: 0.6, transformOrigin: '50% 50%' });
  const sh = followShape(box, 1);
  undo.push(() => { gsap.killTweensOf(frame); if (sh.swap) sh.swap.kill(); frame.remove(); });

  const layers = pics.map((p) => {
    if (!p) return null;
    const el    = document.createElement('div');
    const media = document.createElement(p.video ? 'video' : 'img');
    el.style.cssText = 'position:absolute;top:0;left:0;transform-origin:50% 50%;';
    media.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;max-width:none;object-fit:cover;';
    if (p.video) { media.muted = true; media.loop = true; media.playsInline = true; media.preload = 'none'; }
    else { media.alt = ''; media.decoding = 'async'; }
    el.appendChild(media);
    box.appendChild(el);
    gsap.set(el, { visibility: 'hidden', opacity: 0 });
    const L = { el, inner: media, img: p.video ? null : media, video: p.video ? media : null, sizes: !p.video,
                on: false, z: 0, mw: 0, mh: 0, tf: '', ar: 0, loaded: false, pic: p,
                fixed: followFormat(p.item, 'included:' + p.src),
                get ratio() { return followRatio(this.fixed, this.ar); } };
    const onMeta = () => {
      const ar = L.img ? L.img.naturalWidth / L.img.naturalHeight : L.video.videoWidth / L.video.videoHeight;
      if (!(ar > 0) || !isFinite(ar)) return;
      L.ar = ar;
      // Auto format: the window takes the picture's shape once it's known.
      if (!L.fixed && sh.current === L) [sh.tw, sh.th] = followFit(L.ratio);
      sh.dirty = true;
      wake();
    };
    media.addEventListener(p.video ? 'loadedmetadata' : 'load', onMeta);
    undo.push(() => { media.removeEventListener(p.video ? 'loadedmetadata' : 'load', onMeta); if (L.video) { try { L.video.pause(); } catch (e) {} } });
    sh.layers.push(L);
    return L;
  });
  const load = (L) => {
    if (!L || L.loaded) return;
    L.loaded = true;
    if (L.img && L.pic.srcset) { L.img.sizes = Math.ceil(sh.size || 200) + 'px'; L.img.srcset = L.pic.srcset; }
    L.inner.src = L.pic.src;
  };

  // A line per row, drawn over its own border on hover.
  const lines = rows.map((row) => {
    const line = document.createElement('div');
    line.setAttribute('aria-hidden', 'true');
    line.style.cssText = 'position:absolute;left:0;right:0;pointer-events:none;background-color:currentColor;';
    line.dataset.origin = '0% 50%';
    row.appendChild(line);
    gsap.set(line, { scaleX: 0, transformOrigin: '0% 50%' });
    return line;
  });
  const steps = rows.map(row => row.querySelector('.award-grid') || row);
  undo.push(() => {
    lines.forEach(l => { gsap.killTweensOf(l); l.remove(); });
    gsap.killTweensOf(steps);
    gsap.set(steps, { clearProps: 'transform' });
  });

  /* ── geometry ── */
  let R = 16, S = 176, railX = 0, centers = [];
  const measure = () => {
    R = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    S = CFG.size * R;
    const hr = host.getBoundingClientRect(), r = ref.getBoundingClientRect();
    railX = Math.min(r.left - hr.left, hr.width - S);
    centers = rows.map((row) => { const b = row.getBoundingClientRect(); return b.top - hr.top + b.height / 2; });
    frame.style.width = frame.style.height = S + 'px';
    sh.size = S;
    sh.radius = parseFloat(getComputedStyle(ref).borderTopLeftRadius) || 0;
    sh.dirty = true;
    const lineH = parseFloat(getComputedStyle(rows[0]).borderBottomWidth) || 1;
    lines.forEach((l) => { l.style.height = lineH + 'px'; l.style.bottom = -lineH + 'px'; });
    followRender(sh);
  };

  /* ── springs ── */
  const fy = { p: 0, v: 0, t: 0 }; // frame top (px in the host)
  let py = 0, over = false, on = false, aimDirty = false, ticking = false;
  const rowY = (i) => centers[i] - S / 2;
  const aim = () => {
    const hr = host.getBoundingClientRect();
    fy.t = gsap.utils.clamp(centers[0], centers[centers.length - 1], py - hr.top) - S / 2;
  };
  const reaim = () => { if (!over) return; aimDirty = true; wake(); };

  function wake() {
    if (ticking || !alive) return;
    ticking = true;
    gsap.ticker.add(tick);
  }
  undo.push(() => { gsap.ticker.remove(tick); ticking = false; });
  function tick(time, deltaMS) {
    if (!alive) return;
    const dt = Math.min(Math.max(deltaMS || 16.7, 1), 64) / 1000;
    if (aimDirty) { aimDirty = false; aim(); }
    const a = followFloat(fy, CFG.float, CFG.bounce, dt);
    const b = followSpring(sh, 'w', sh.tw, CFG.morph, dt);
    const c = followSpring(sh, 'h', sh.th, CFG.morph, dt);
    gsap.set(frame, { x: railX, y: fy.p });
    followRender(sh);
    if (!a && !b && !c && !sh.dirty) { ticking = false; gsap.ticker.remove(tick); }
    sh.dirty = false;
  }

  /* ── pictures ── */
  // The hovered row's picture comes in over the one showing (servicesSwap);
  // the window takes its format; what's underneath hides once the swap ends.
  const swapTo = (i, instant) => {
    const L = layers[i];
    if (!L || sh.current === L) return;
    load(L);
    sh.current = L;
    [sh.tw, sh.th] = followFit(L.ratio);
    if (instant) { sh.w = sh.tw; sh.h = sh.th; sh.wv = sh.hv = 0; }
    if (sh.swap) { sh.swap.kill(); sh.swap = null; }
    L.on = true;
    L.z = ++sh.z;
    gsap.killTweensOf([L.el, L.inner]);
    gsap.set(L.el, { zIndex: L.z, visibility: 'visible', opacity: 1 });
    gsap.set(L.inner, { scale: 1 });
    if (L.video) { const pr = L.video.play(); if (pr && pr.catch) pr.catch(() => {}); }
    followRender(sh);
    const settle = () => {
      sh.swap = null;
      sh.layers.forEach((o) => {
        if (o === L || !o.on) return;
        o.on = false;
        gsap.set(o.el, { visibility: 'hidden', opacity: 0 });
        if (o.video) o.video.pause();
      });
    };
    const tl = instant ? null : runRecipe('servicesSwap', gsap.timeline(), { next: L.el, media: L.inner });
    if (tl && tl.duration()) { sh.swap = tl; tl.eventCallback('onComplete', settle); }
    else { if (tl) tl.kill(); settle(); }
    wake();
  };

  let frameTl = null;
  const frameMove = (show) => {
    if (frameTl) { frameTl.kill(); frameTl = null; }
    if (show) gsap.set(frame, { visibility: 'visible' });
    const tl = runRecipe('awardsBadge', gsap.timeline(), { badge: frame, show });
    const done = () => {
      frameTl = null;
      if (show) return;
      gsap.set(frame, { visibility: 'hidden' });
      sh.layers.forEach(o => { if (o.video) o.video.pause(); });
    };
    if (tl.duration()) { frameTl = tl; tl.eventCallback('onComplete', done); }
    else { tl.kill(); gsap.set(frame, { opacity: show ? 1 : 0, scale: show ? 1 : 0.6 }); done(); }
  };

  /* ── rows ── */
  const rowTls = rows.map(() => null);
  const rowMove = (i, show) => {
    if (i < 0) return;
    if (rowTls[i]) rowTls[i].kill();
    // The line grows from the left and leaves to the right, from wherever it is, never jumping.
    const line = lines[i], sx = gsap.getProperty(line, 'scaleX');
    if (show && sx < 0.01) line.dataset.origin = '0% 50%';
    if (!show && sx > 0.99) line.dataset.origin = '100% 50%';
    const tl = runRecipe('awardsRow', gsap.timeline(), {
      row: steps[i], line, show, nudge: CFG.nudge * R, origin: line.dataset.origin
    });
    if (tl.duration()) rowTls[i] = tl;
    else { tl.kill(); gsap.set(steps[i], { x: show ? CFG.nudge * R : 0 }); gsap.set(line, { scaleX: show ? 1 : 0 }); }
  };
  undo.push(() => rowTls.forEach(tl => tl && tl.kill()));

  let current = -1, intent = null;
  const enterRow = (i) => {
    if (i === current) return;
    rowMove(current, false);
    rowMove(i, true);
    current = i;
    if (intent) { intent.kill(); intent = null; }
    if (!layers[i]) { if (on) { on = false; frameMove(false); } return; }
    if (!on) {
      on = true;
      swapTo(i, true);
      fy.p = fy.t = rowY(i);
      fy.v = 0;
      aim();
      gsap.set(frame, { x: railX, y: fy.p, scale: 0.6, opacity: 0 });
      frameMove(true);
      wake();
      return;
    }
    // The picture swaps once the pointer rests on a row, so a sweep stays calm.
    intent = gsap.delayedCall(CFG.intent, () => { intent = null; swapTo(i); });
  };
  const leaveList = () => {
    over = false;
    if (intent) { intent.kill(); intent = null; }
    rowMove(current, false);
    current = -1;
    if (on) { on = false; frameMove(false); }
  };
  undo.push(() => { if (intent) intent.kill(); if (frameTl) frameTl.kill(); });

  const enters = rows.map((row, i) => {
    const fn = (e) => { py = e.clientY; over = true; enterRow(i); };
    row.addEventListener('mouseenter', fn);
    return fn;
  });
  const onMove = (e) => { py = e.clientY; reaim(); };
  list.addEventListener('mouseleave', leaveList);
  window.addEventListener('mousemove', onMove, { passive: true });
  window.addEventListener('scroll', reaim, { passive: true });
  undo.push(() => {
    rows.forEach((row, i) => row.removeEventListener('mouseenter', enters[i]));
    list.removeEventListener('mouseleave', leaveList);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('scroll', reaim);
  });

  measure();
  const onRefresh = () => { measure(); reaim(); };
  ScrollTrigger.addEventListener('refresh', onRefresh);
  undo.push(() => ScrollTrigger.removeEventListener('refresh', onRefresh));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (alive) onRefresh(); });
  // Every picture loaded before the first hover, as the list nears the screen.
  const near = new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting)) return;
    near.disconnect();
    layers.forEach(L => { if (L && L.img) load(L); });
  }, { rootMargin: '100% 0px' });
  near.observe(list);
  undo.push(() => near.disconnect());

  list.dataset.includedInit = '1';
  undo.push(() => { delete list.dataset.includedInit; });
  return cleanup;
}

/* ─────────────────────────────────────────────
   INIT: LOCATIONS HOVER (map dots)
   — Hovering a .location-item adds is-active to the .map-dot-wrap
     in the SAME-INDEX .map-dots-item (removed from the rest).
     First location is active on load; the active dot stays until
     another item is hovered (no reset on hover-out).
   — Index i in the location list maps to index i in the dots list.
───────────────────────────────────────────── */
function initLocationsHover() {
  const textItems = Array.from(document.querySelectorAll('.location-item'));
  if (!textItems.length) return;

  const dotsList = document.querySelector('.map-dots-list');
  const dotWraps = dotsList
    ? Array.from(dotsList.querySelectorAll('.map-dots-item .map-dot-wrap'))
    : [];
  if (!dotsList || !dotWraps.length) return;

  if (dotsList.dataset.locationsHoverInit) return;
  dotsList.dataset.locationsHoverInit = '1';

  const setActive = (i) =>
    dotWraps.forEach((wrap, idx) => wrap.classList.toggle('is-active', idx === i));

  setActive(0); // first location active on load

  textItems.forEach((item, i) =>
    item.addEventListener('mouseenter', () => setActive(i))
  );
}

/* ─────────────────────────────────────────────
   INIT: TEAM STATUS (per-member clock + online dot)
   — Same idea as the nav clock, but per team member. Reads each
     .team-item's `team-location`, maps it to a timezone, then:
       • live-updates the member's HH:MM:SS clock (.nav-link-txt)
       • colours .team-online-dot green/red for online (work hours:
         Mon–Fri 09:00–18:00 local) — matching the nav status.
   — Members with no location (empty attr, no dot) are skipped.
   — Timers are tracked on window.__teamTimers and cleared on every
     re-init so Barba navigation never stacks them.
───────────────────────────────────────────── */
function initTeamStatus() {
  // Clear timers from a previous page first (also when leaving the team page).
  window.__teamTimers = window.__teamTimers || [];
  window.__teamTimers.forEach(clearInterval);
  window.__teamTimers = [];

  const items = Array.from(document.querySelectorAll('.team-item'));
  if (!items.length) return;

  const TZ = {
    'new york':    'America/New_York',
    'montreal':    'America/Toronto',
    'mexico city': 'America/Mexico_City',
    'cdmx':        'America/Mexico_City',
    'l.a.':        'America/Los_Angeles',
    'los angeles': 'America/Los_Angeles',
    'berlin':      'Europe/Berlin',
    'prague':      'Europe/Prague',
    'amsterdam':   'Europe/Amsterdam',
    'sydney':      'Australia/Sydney',
  };

  const DOT_ONLINE  = '#00FF40';
  const DOT_OFFLINE = '#ff3b3b';
  const clockRe = /^\d{1,2}:\d{2}:\d{2}$/;

  const timeInTZ = clockText;
  const isOnline = isWorkHours;

  // Resolve each member once (location → tz, dot, clock element).
  const members = [];
  items.forEach((item) => {
    const loc = (item.getAttribute('team-location') || '').trim().toLowerCase();
    const tz  = TZ[loc];
    if (!tz) return; // no/unknown location → leave the item untouched

    const dot   = item.querySelector('.team-online-dot');
    const clock = Array.from(item.querySelectorAll('.nav-link-txt'))
      .find(el => clockRe.test(el.textContent.trim()));

    members.push({ tz, dot, clock, online: null });
  });
  if (!members.length) return;

  const render = () => {
    members.forEach((m) => {
      if (m.clock) m.clock.textContent = timeInTZ(m.tz);
      if (!m.dot) return;
      const online = isOnline(m.tz);
      if (online === m.online) return; // the dot only changes when the status does
      m.online = online;
      gsap.set(m.dot, { backgroundColor: online ? DOT_ONLINE : DOT_OFFLINE });
      m.dot.classList.toggle('is-online', online);
    });
  };

  render();
  window.__teamTimers.push(setInterval(render, 1000));
}

/* ─────────────────────────────────────────────
   INIT: WORK FILTERS  (Work page: button[data-filters-toggle] opens [data-filters-panel])
   — Every visit lands with the filter block closed: a CSS embed just
     before it keeps it shut before the first paint (and leaves it open
     in the Designer), so nothing jumps as the page shows.
   — The Filters button opens and closes it through the filtersToggle
     recipe (tune panel): the block unfolds, its rows rise in, the +
     turns into an ×. aria-expanded follows. A click half-way turns it
     round from where it is.
   — One listener on the document for the whole visit: a page brought in
     by Barba arrives closed from its own markup, so there is nothing to
     set up or undo per page. Reduced motion: it opens and closes at once.
───────────────────────────────────────────── */
function toggleWorkFilters(btn) {
  const scope = btn.closest('[data-barba="container"]') || document;
  const id    = btn.getAttribute('aria-controls');
  const panel = (id && scope.querySelector(`[id="${id}"]`)) || scope.querySelector('[data-filters-panel]');
  if (!panel) return;

  const open = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.classList.toggle('is-open', open);

  if (panel.suFiltersTl) panel.suFiltersTl.kill();
  const rows = panel.querySelectorAll('.line-flex');
  const icon = btn.querySelector('[data-filters-icon]') || btn.querySelector('svg');

  // Held at the height it shows right now (shut, open or half-way), then
  // freed from the closed CSS while it moves.
  gsap.set(panel, { height: panel.offsetHeight, overflow: 'hidden' });
  panel.classList.add('is-open');

  const done = () => {
    panel.suFiltersTl = null;
    if (!open) panel.classList.remove('is-open');
    gsap.set(panel, { clearProps: 'height,overflow' });
    gsap.set(rows, { clearProps: 'opacity,transform' });
    // The list below has moved: triggers measured against the old height catch up.
    if (panel.isConnected && !(barba.transitions && barba.transitions.isRunning)) ScrollTrigger.refresh();
  };
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const tl  = runRecipe('filtersToggle', gsap.timeline({ onComplete: done }), { panel, rows, icon, open, rem });
  if (!tl.duration()) {
    tl.kill();
    if (icon) gsap.set(icon, { rotation: open ? 45 : 0 });
    done();
    return;
  }
  panel.suFiltersTl = tl;
}

function initWorkFilters() {
  $(document)
    .off('click.workFilters')
    .on('click.workFilters', '[data-filters-toggle]', function (e) {
      e.preventDefault();
      toggleWorkFilters(this);
    });
}
initWorkFilters();

/* ─────────────────────────────────────────────
   INIT: VIEW TOGGLE (Bento / 3x3)  (Work: .view-toggle buttons, .work-list)
   — Clicking a .view-toggle makes it .is-active (the other loses it,
     aria-pressed follows) and toggles .is-3x3 on .work-list. The grid one
     is told by data-view="3x3" (or a "3x3" label), so order doesn't
     matter. The page starts on whichever toggle is .is-active (Bento).
   — While a filter is on (a ticked box or a search in the Finsweet
     filters form), the list shows as 3x3 whatever the chosen view:
     .filter-active on .work-list, which the site CSS already reads. The
     buttons keep the view the visitor chose; clearing the filters goes
     back to it.
   — The change between the two layouts is a morph (workView recipe, tune
     panel): each card travels from where it was to where it lands and
     its picture reshapes on the way, cropped like a cover, corners kept
     round. Transforms and a clip only; the layout is final from the
     first frame, so scrolling, resizing or clicking again mid-way never
     breaks it (a resize ends it at once, a second click turns it round
     from where it is). Only the cards near the screen move; the rest
     just land. When the visitor is down in the list, the card at the
     top of the screen keeps its place, so the page doesn't jump.
   — A change from the filters is instant (Finsweet is showing and hiding
     cards at the same moment). Reduced motion: instant.
───────────────────────────────────────────── */
let workViewTeardown = [];
let workViewRecheck = null; // the current page's filter check, for Finsweet's ready callback
function teardownWorkView() {
  workViewRecheck = null;
  workViewTeardown.splice(0).reverse().forEach(fn => { try { fn(); } catch (e) {} });
}
window.fsAttributes = window.fsAttributes || [];
window.fsAttributes.push(['cmsfilter', () => { if (workViewRecheck) workViewRecheck(); }]);

function initViewToggle() {
  teardownWorkView();
  const toggles = Array.from(document.querySelectorAll('.view-toggle'));
  const list = document.querySelector('.work-list');
  if (!toggles.length || !list) return;

  const is3x3 = (t) => /3\s*x\s*3/i.test(t.getAttribute('data-view') || t.textContent);
  const form = document.querySelector('[fs-cmsfilter-element="filters"]');
  const filtering = () => !!form && Array.from(form.querySelectorAll('input, textarea, select')).some((el) => {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
    if (el.type === 'submit' || el.type === 'button' || el.type === 'hidden') return false;
    return !!(el.value && el.value.trim());
  });

  let chosen = toggles.find(t => t.classList.contains('is-active')) || toggles[0];
  let filtered = filtering();
  const press = () => toggles.forEach((t) => {
    t.classList.toggle('is-active', t === chosen);
    t.setAttribute('aria-pressed', t === chosen ? 'true' : 'false');
  });
  const layout = () => {
    list.classList.toggle('is-3x3', is3x3(chosen));
    list.classList.toggle('filter-active', filtered);
  };
  press();
  layout();

  const morph = workListMorph(list);
  workViewTeardown.push(() => morph.destroy());
  // Only a change of what shows moves the cards; a button pressed under a filter just stays pressed.
  const change = (update, animate) => {
    const was = list.classList.contains('is-3x3') || list.classList.contains('filter-active');
    update();
    const now = is3x3(chosen) || filtered;
    if (now === was) { layout(); return; }
    if (animate) morph.run(layout);
    else { morph.stop(); layout(); morph.settled(); }
  };

  toggles.forEach((t) => {
    const onClick = () => { if (t !== chosen) change(() => { chosen = t; press(); }, true); };
    t.addEventListener('click', onClick);
    workViewTeardown.push(() => t.removeEventListener('click', onClick));
  });

  // Filters: read again on any change in the form, a beat later too (Finsweet clears boxes on its own time).
  const recheck = () => {
    if (!list.isConnected) return;
    const f = filtering();
    if (f !== filtered) change(() => { filtered = f; }, false);
  };
  workViewRecheck = recheck;
  if (form) {
    const timers = [];
    const soon = () => { recheck(); timers.push(setTimeout(recheck, 60), setTimeout(recheck, 400)); };
    ['change', 'input', 'click', 'reset'].forEach(ev => form.addEventListener(ev, soon));
    workViewTeardown.push(() => {
      ['change', 'input', 'click', 'reset'].forEach(ev => form.removeEventListener(ev, soon));
      timers.forEach(clearTimeout);
    });
  }
}

// The Bento / 3x3 morph for one list. run(apply): apply() changes the
// layout, the cards animate from how they looked to where they land.
function workListMorph(list) {
  let tl = null, live = []; // live: the cards moving, each { el, thumb, title, corners, L, Lt, F, Ft, oF, oL, p, r, w, h }

  const cardsOf = () => Array.from(list.children).filter(el => el.getClientRects().length);
  const part = (el) => ({
    thumb:   el.querySelector('.work-item-thumbnail'),
    title:   el.querySelector('.work-news-title-wrap'),
    corners: el.querySelector('.work-item-thumbnail .img-corner-wrap')
  });
  const clear = (c) => {
    gsap.set([c.el, c.thumb, c.title].filter(Boolean), { clearProps: 'transform,transformOrigin,clipPath,willChange' });
    if (c.corners) c.corners.style.visibility = '';
  };
  const stop = () => {
    if (tl) { tl.kill(); tl = null; }
    live.forEach(clear);
    live = [];
  };
  const settled = () => {
    if (!(barba.transitions && barba.transitions.isRunning)) ScrollTrigger.refresh();
  };

  // How every card looks right now: a card still moving is read where it shows.
  const snapshot = (cards) => {
    const moving = new Map(live.map(c => [c.el, c]));
    return cards.map((el) => {
      const r = el.getBoundingClientRect();
      const c = moving.get(el);
      const { thumb } = part(el);
      if (c) return { left: r.left, top: r.top, tw: c.w, th: c.h, ox: c.ox, oy: c.oy };
      const t = thumb ? thumb.getBoundingClientRect() : r;
      return { left: r.left, top: r.top, tw: t.width, th: t.height, ox: t.left - r.left, oy: t.top - r.top };
    });
  };

  const render = () => live.forEach((c) => {
    const p = c.p, k = 1 - p;
    gsap.set(c.el, { x: (c.F.left - c.L.left) * k, y: (c.F.top - c.L.top) * k });
    if (!c.thumb) return;
    // The picture's window goes from its old size to its new one; the picture inside
    // is scaled to cover it and clipped to it, its corners kept at the site radius.
    const w = c.F.tw + (c.Lt.w - c.F.tw) * p, h = c.F.th + (c.Lt.h - c.F.th) * p;
    const s = Math.max(w / c.Lt.w, h / c.Lt.h);
    const ix = (c.Lt.w - w / s) / 2, iy = (c.Lt.h - h / s) / 2;
    const ox = (c.F.ox - c.L.ox) * k, oy = (c.F.oy - c.L.oy) * k;
    c.w = w; c.h = h;
    c.thumb.style.transform = `translate(${(ox - ix * s).toFixed(2)}px, ${(oy - iy * s).toFixed(2)}px) scale(${s.toFixed(4)})`;
    c.thumb.style.clipPath = `inset(${iy.toFixed(2)}px ${ix.toFixed(2)}px ${iy.toFixed(2)}px ${ix.toFixed(2)}px round ${(c.r / s).toFixed(2)}px)`;
    // What sits under the picture follows its bottom edge.
    if (c.title) c.title.style.transform = `translate(${ox.toFixed(2)}px, ${(oy + h - c.Lt.h).toFixed(2)}px)`;
  });

  const scrollBy = (dy) => {
    const y = Math.max(0, Math.min(window.scrollY + dy, document.documentElement.scrollHeight - window.innerHeight));
    // At once, before the cards are measured where they land (Lenis only applies its scroll on its next frame).
    window.scrollTo(0, y);
    if (lenisActive && lenis) lenis.scrollTo(y, { immediate: true, force: true });
  };

  const run = (apply) => {
    const cards = cardsOf();
    if (reducedMotion || !cards.length) { stop(); apply(); settled(); return; }
    const first = snapshot(cards);
    stop();
    apply();

    // Down in the list, the card at the top of the screen keeps its place.
    if (list.getBoundingClientRect().top < 0) {
      const a = first.findIndex(f => f.top + f.th > 0);
      if (a >= 0) {
        const dy = cards[a].getBoundingClientRect().top - first[a].top;
        if (Math.abs(dy) > 0.5) scrollBy(dy); // the cards start from where they showed on screen, so nothing jumps
      }
    }

    const vh = window.innerHeight, near = (top, h) => top < vh * 2 && top + h > -vh;
    live = [];
    cards.forEach((el, i) => {
      const F = first[i], r = el.getBoundingClientRect();
      const { thumb, title, corners } = part(el);
      const t = thumb ? thumb.getBoundingClientRect() : r;
      const L = { left: r.left, top: r.top, ox: t.left - r.left, oy: t.top - r.top };
      const Lt = { w: t.width, h: t.height };
      const still = Math.abs(F.left - L.left) < 0.5 && Math.abs(F.top - L.top) < 0.5 && Math.abs(F.tw - Lt.w) < 0.5 && Math.abs(F.th - Lt.h) < 0.5;
      if (still || !Lt.w || !Lt.h || !(near(F.top, F.th) || near(L.top, Lt.h))) return;
      const radiusEl = thumb && (thumb.querySelector('.visual-radius') || thumb);
      const c = { el, thumb, title, corners, F, L, Lt, p: 0, w: F.tw, h: F.th, ox: L.ox, oy: L.oy,
                  r: radiusEl ? parseFloat(getComputedStyle(radiusEl).borderTopLeftRadius) || 0 : 0 };
      if (thumb) gsap.set(thumb, { transformOrigin: '0 0' });
      if (corners) corners.style.visibility = 'hidden'; // the clip rounds the corners while it moves
      live.push(c);
    });
    if (!live.length) { settled(); return; }

    // Cards in reading order, top to bottom, so the stagger runs down the list.
    live.sort((a, b) => (a.L.top - b.L.top) || (a.L.left - b.L.left));
    render();
    const t2 = runRecipe('workView', gsap.timeline({ onUpdate: render }), { cards: live });
    if (!t2.duration()) { t2.kill(); stop(); settled(); return; }
    tl = t2;
    t2.eventCallback('onComplete', () => { tl = null; stop(); settled(); });
  };

  // A resize mid-way lands it at once: the measures it runs on no longer hold.
  const onResize = () => { if (tl) { stop(); settled(); } };
  window.addEventListener('resize', onResize);
  return {
    run, settled,
    stop: () => stop(),
    destroy: () => { window.removeEventListener('resize', onResize); stop(); }
  };
}

/* ─────────────────────────────────────────────
   INIT: WORK HOVER  (.work-coll-item cards: Work, Home, related work)
   — Hovering a card plays its hover visuals over the thumbnail: the video
     first (WORK_HOVER.videoHold s when pictures follow), then the pictures
     in order, WORK_HOVER.step s each, round and round. One picture just
     shows; a video alone just plays. Leaving fades it all away; the next
     hover starts from the beginning (coming back before the fade is over
     carries on from the picture showing).
   — Nothing shows before it's ready. A picture comes up once it has loaded
     and decoded, the video once it's playing; until the first visual is
     ready the card keeps its thumbnail, then the layer fades in. A picture
     that's late makes the one showing hold a beat longer (the round skips
     ahead to one that's ready), so there's never a blank frame.
   — Loading is ours, not the browser's: its lazy loading would fetch the
     hover pictures of every card within a screen or two (dozens on /work,
     big originals), so they're taken off it as soon as the cards exist.
     A card on screen gets its first picture, sized to the card, once the
     page is idle; the rest load as the pointer reaches the card. Videos
     load as their card comes on screen (on hover only on a slow or
     data-saver connection). Phones never load any of it.
   — Card kinds come from what's really there (a video URL, real pictures),
     not from which blocks exist: Webflow leaves conditionally hidden ones
     in the page.
   — This replaces the CSS cycle in the custom code embed: those rules are
     switched off here (inline), so they can stay until deleted.
   — Mouse and trackpad from 992px, like the CSS. Reduced motion: the first
     picture shows still; no video, no cycle. Undone on every re-init and
     as a page leaves (Barba): there everything stops but each card keeps
     its look, so a card clicked mid-hover slides away with its picture.
───────────────────────────────────────────── */
const WORK_HOVER = {
  step:      1,    // s each picture shows
  videoHold: 3,    // s the video plays before the pictures (cards with both)
  videoWait: 1.5,  // s a video that hasn't started is waited for before going straight to the pictures
};
const WORK_HOVER_MQ = '(hover: hover) and (pointer: fine) and (min-width: 992px)';
const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

let workHoverTeardown = [];
let workHoverKeepLook = false;
// keepLook: the page is leaving (Barba). Everything stops, but each card stays
// as it looks, so a card clicked mid-hover slides away with its picture up
// instead of snapping back to the thumbnail as the slide starts.
function teardownWorkHover(keepLook) {
  workHoverKeepLook = !!keepLook;
  workHoverTeardown.splice(0).reverse().forEach(fn => { try { fn(); } catch (e) {} });
  workHoverKeepLook = false;
}

// Takes the hover pictures off the browser's lazy loading (their URLs move to
// data-su-src / data-su-srcset). Runs on the first page as the file starts and
// on a page brought in by Barba before it's shown, so they never start loading.
function detachWorkHoverImages(scope) {
  (scope || document).querySelectorAll('.work-hover-visual-item img').forEach((img) => {
    if (img.dataset.suSrc !== undefined) return;
    const src = img.getAttribute('src') || '';
    if (!src || src.startsWith('data:') || img.classList.contains('w-dyn-bind-empty')) return;
    img.dataset.suSrc = src;
    img.dataset.suSrcset = img.getAttribute('srcset') || '';
    img.removeAttribute('srcset');
    img.src = BLANK_IMG;
  });
}
detachWorkHoverImages(document);

function initWorkHover() {
  teardownWorkHover();
  const isMedia = (url) => /\.(mp4|webm|ogv|mov|m4v)(\?.*)?$/i.test(url || '');
  const hidden  = (el) => !el || el.classList.contains('w-condition-invisible');

  // ── what each card really has
  const models = [];
  document.querySelectorAll('.work-coll-item').forEach((card) => {
    const layer = card.querySelector('.work-hover-visuals');
    if (!layer || layer.dataset.workHover) return;
    const vWrap = layer.querySelector('.work-hover-video');
    const video = !hidden(vWrap) && vWrap.querySelector('video');
    const list  = layer.querySelector('.work-hover-visual-wrap');
    const pics  = hidden(list) ? [] : Array.from(list.querySelectorAll('.work-hover-visual-item')).map((item) => {
      const img = item.querySelector('img');
      return img && img.dataset.suSrc ? { item, img, state: 'idle', ready: null } : null;
    }).filter(Boolean);
    const hasVideo = !!(video && isMedia(video.getAttribute('data-source')));
    if (!hasVideo && !pics.length) return;
    models.push({ card, layer, vWrap, list, pics, video: hasVideo ? video : null,
                  gen: 0, hovering: false, phase: null, at: -1, waiting: false, shown: false, fade: null, timers: [] });
  });
  if (!models.length) return;

  // ── the CSS cycle off for good (every device): from here only inline styles show anything
  const quiet = (el) => {
    if (!el) return;
    el.style.setProperty('animation', 'none', 'important');
    el.style.setProperty('transition', 'none', 'important');
    el.style.opacity = '0';
  };
  models.forEach((m) => {
    m.layer.dataset.workHover = '1';
    quiet(m.layer); quiet(m.vWrap); quiet(m.list);
    m.pics.forEach(p => quiet(p.item));
  });
  workHoverTeardown.push(() => models.forEach(m => delete m.layer.dataset.workHover));

  const mm = gsap.matchMedia();
  workHoverTeardown.push(() => mm.revert());
  mm.add(WORK_HOVER_MQ, () => {
    let alive = true;
    const conn = navigator.connection;
    const slowNet = !!(conn && (conn.saveData || /2g|3g/.test(conn.effectiveType || '')));

    const later = (m, s, fn) => { const t = gsap.delayedCall(s, fn); m.timers.push(t); return t; };
    const clear = (m) => { m.timers.splice(0).forEach(t => t.kill()); m.waiting = false; };

    // ── loading: a picture is ready once loaded AND decoded (no blank first frame)
    const loadPic = (m, k, priority) => {
      const p = m.pics[k];
      if (p.state !== 'idle') return p.done;
      p.state = 'loading';
      // Sized to the card, so the browser takes the smallest Webflow variant
      // that fits it (on a slow or data-saver connection, at 1x density).
      const img = p.img, w = Math.ceil(m.layer.offsetWidth * (slowNet ? 0.5 : 1));
      img.loading = 'eager';
      img.decoding = 'async';
      try { img.fetchPriority = priority; } catch (e) {}
      if (img.dataset.suSrcset) { if (w) img.sizes = w + 'px'; img.srcset = img.dataset.suSrcset; }
      img.src = img.dataset.suSrc;
      p.done = (img.decode ? img.decode() : Promise.reject())
        .then(() => true, () => img.complete && img.naturalWidth > 0)
        .then((ok) => {
          p.state = ok ? 'ready' : 'failed';
          if (ok && alive) picReady(m, k);
        });
      return p.done;
    };
    const loadVideo = (m) => {
      const v = m.video;
      if (!v || v.dataset.vloaded === '1') return;
      v.dataset.vloaded = '1';
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.removeAttribute('autoplay'); // played here, only while hovered
      v.src = v.getAttribute('data-source');
      v.load();
    };

    // ── what shows: one visual at a time, switched crisply; the layer fades
    const fadeLayer = (m, show) => {
      if (m.shown === show) return;
      m.shown = show;
      if (m.fade) m.fade.kill();
      const rest = () => { m.fade = null; if (!show && !m.hovering) settle(m); };
      const tl = runRecipe('workHover', gsap.timeline({ onComplete: rest }), { layer: m.layer, show });
      if (tl.duration()) m.fade = tl;
      else { tl.kill(); m.layer.style.opacity = show ? '1' : '0'; rest(); }
    };
    const showVideo = (m) => {
      m.vWrap.style.opacity = '1';
      if (m.list) m.list.style.opacity = '0';
      fadeLayer(m, true);
    };
    const showPic = (m, k) => {
      m.pics.forEach((p, i) => { p.item.style.opacity = i === k ? '1' : '0'; });
      m.list.style.display = 'block'; // display:none in Webflow, so the browser never fetches these on its own
      m.list.style.opacity = '1';
      if (m.vWrap) m.vWrap.style.opacity = '0';
      m.at = k;
      fadeLayer(m, true);
    };
    // Back to rest once the layer has faded out: nothing showing, video paused.
    const settle = (m) => {
      m.pics.forEach(p => { p.item.style.opacity = '0'; });
      if (m.list) m.list.style.opacity = '0';
      if (m.vWrap) m.vWrap.style.opacity = '0';
      if (m.video) { try { m.video.pause(); } catch (e) {} }
      m.at = -1;
      m.phase = null;
    };

    // ── the round: the next picture in order that's ready; none ready, the one showing holds
    const next = (m) => {
      if (!m.hovering || m.phase !== 'pics') return;
      const n = m.pics.length;
      for (let s = 1; s <= n; s++) {
        const k = (m.at + s + n) % n;
        if (m.at >= 0 && k === m.at) break; // back round to the one showing: nothing else is ready
        if (m.pics[k].state === 'ready') {
          showPic(m, k);
          if (n > 1 && !reducedMotion) later(m, WORK_HOVER.step, () => next(m));
          return;
        }
      }
      m.waiting = true; // the first picture that becomes ready goes up at once (picReady)
    };
    const picReady = (m, k) => {
      if (m.hovering && m.phase === 'pics' && (m.waiting || m.at < 0)) { m.waiting = false; next(m); }
    };
    const startPics = (m) => {
      clear(m);
      m.phase = 'pics';
      if (m.video) { try { m.video.pause(); } catch (e) {} }
      next(m);
    };
    const startVideo = (m) => {
      const v = m.video, gen = m.gen;
      m.phase = 'video';
      let up = false;
      const onPlaying = () => {
        if (gen !== m.gen || !m.hovering || up) return;
        up = true;
        showVideo(m);
        if (m.pics.length) later(m, WORK_HOVER.videoHold, () => startPics(m));
      };
      if (!v.paused && v.readyState >= 3) onPlaying();
      else {
        v.addEventListener('playing', onPlaying, { once: true });
        m.timers.push({ kill: () => v.removeEventListener('playing', onPlaying) });
      }
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
      // A video that hasn't started yet doesn't keep the pictures waiting.
      if (m.pics.length) later(m, WORK_HOVER.videoWait, () => { if (!up) startPics(m); });
    };

    const enter = (m) => {
      m.hovering = true;
      m.gen++;
      clear(m);
      // Everything this card needs, now: the first two pictures first.
      m.pics.forEach((p, k) => loadPic(m, k, k < 2 ? 'high' : 'auto'));
      if (reducedMotion) { m.phase = 'pics'; m.at = -1; next(m); return; } // first picture, still
      // Back on the card before its pictures had faded out: they carry on from the one showing.
      if (m.phase === 'pics' && m.at >= 0) {
        fadeLayer(m, true);
        if (m.pics.length > 1) later(m, WORK_HOVER.step, () => next(m));
        return;
      }
      if (m.video) { loadVideo(m); startVideo(m); }
      else startPics(m);
    };
    const leave = (m) => {
      m.hovering = false;
      m.gen++;
      clear(m);
      fadeLayer(m, false);
      if (!m.shown && !m.fade) settle(m);
    };

    // ── ahead of the hover: each card on screen, once the page is idle, one
    // card at a time (so a hover's own pictures never queue behind a burst)
    const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 300));
    const queue = [];
    let pumping = false;
    const pump = () => {
      if (pumping || !alive || !queue.length) return;
      const m = queue.shift();
      pumping = true;
      if (m.video && !slowNet && !reducedMotion) loadVideo(m);
      Promise.resolve(m.pics.length ? loadPic(m, 0, 'low') : null).then(() => {
        pumping = false;
        idle(pump);
      });
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const m = models.find(x => x.layer === e.target);
        if (m) { queue.push(m); idle(pump); }
      });
    });
    models.forEach(m => io.observe(m.layer));

    const offs = models.map((m) => {
      const on = () => enter(m), off = () => leave(m);
      m.card.addEventListener('mouseenter', on);
      m.card.addEventListener('mouseleave', off);
      return () => { m.card.removeEventListener('mouseenter', on); m.card.removeEventListener('mouseleave', off); };
    });

    return () => {
      alive = false;
      io.disconnect();
      offs.forEach(fn => fn());
      models.forEach((m) => {
        m.hovering = false;
        m.gen++;
        clear(m);
        if (workHoverKeepLook) return; // leaving: as it looks (a fade under way finishes; the transition pauses the videos)
        if (m.fade) { m.fade.kill(); m.fade = null; }
        m.shown = false;
        m.layer.style.opacity = '0';
        settle(m);
      });
    };
  });
}

/* ─────────────────────────────────────────────
   INIT: VIDEO PLAYBACK  (placeholder src + data-source)
   — The real file URL always lives in `data-source`; `src` is
     a blank/junk placeholder so nothing downloads on load.
     A data-source with no media extension (the CMS repo
     placeholder) is ignored — it never loads.
   — Videos that autoplay in view (.cs-item, standalone): lazy-load
     + play while near the viewport, pause off screen, JS fades them in.
     The work cards' hover videos (.work-hover-video) are left to
     INIT: WORK HOVER, which loads and plays them with the rest of the
     card's hover.
   — Selection reads placement/source BEFORE anything mutates
     the elements. Teardown is tracked module-side so Barba
     re-init via allpages() never stacks observers/listeners.
───────────────────────────────────────────── */
let videoTeardown = [];
function teardownVideos() {
  videoTeardown.splice(0).forEach(fn => { try { fn(); } catch (e) {} });
}

function initVideos() {
  teardownVideos();

  const isMedia    = (url) => /\.(mp4|webm|ogv|mov|m4v)(\?.*)?$/i.test(url || '');
  const sourceOf   = (v) => {
    const ds = v.getAttribute('data-source');
    return ds && isMedia(ds) ? ds : null;
  };

  const loadVideo = (v) => {
    if (v.dataset.vloaded === '1') return;
    const src = sourceOf(v);
    if (!src) return;
    v.dataset.vloaded = '1';
    v.muted       = true;   // required for muted/programmatic autoplay
    v.loop        = true;
    v.playsInline = true;
    v.preload     = 'auto';
    v.removeAttribute('autoplay'); // we drive play/pause ourselves
    v.src = src;
    v.load();
  };

  // Read placement BEFORE any load() mutates the elements.
  // Hero videos are handled by initHeroVideos (play on transition), the
  // services frames by initServicesFollow / initServicesLab (only the visual
  // showing plays), marquee slides by initMarquees (only the slides near
  // the screen play) and the work cards' hover videos by initWorkHover
  // (loaded and played with the rest of the card's hover), so skip them here.
  const autoplay = Array.from(document.querySelectorAll('video.g_visual_video'))
    .filter(v => sourceOf(v) && !v.closest('.hero-section') && !v.closest('[data-lab]') && !v.closest('[data-follow-init]')
      && !v.closest('[data-marquee-init]') && !v.closest('.work-hover-video'));

  /* ── AUTOPLAY IN VIEW — JS reveals + plays/pauses ──
     Two bands. Within ~three viewports a video loads and fades in on its
     first frame (decoded, so never black), well before it scrolls on
     screen. It only plays, i.e. decodes, within half a viewport of the
     screen: a long case study never decodes all its videos at once, and
     one scrolled past keeps its frame, paused, and resumes on the way
     back. On data-saver / slow connections the load band is one viewport,
     so several MP4s don't buffer at once. */
  if (autoplay.length) {
    const reveal = (v) => gsap.to(v, { opacity: 1, duration: 0.6, ease: 'power2.out', overwrite: true });
    autoplay.forEach(v => gsap.set(v, { opacity: 0 }));

    const conn = navigator.connection;
    const constrained = !!(conn && (conn.saveData || /2g|3g/.test(conn.effectiveType || '')));
    const lio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const v = e.target;
        lio.unobserve(v);
        loadVideo(v);
        if (v.readyState >= 2) reveal(v);
        else {
          v.addEventListener('loadeddata', () => reveal(v), { once: true });
          v.addEventListener('playing', () => reveal(v), { once: true });
        }
      });
    }, { rootMargin: constrained ? '100% 0px' : '300% 0px' });
    const pio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) { loadVideo(v); playVideo(v, reveal); }
        else { try { v.pause(); } catch (err) {} }
      });
    }, { rootMargin: '50% 0px' });
    autoplay.forEach((v) => { lio.observe(v); pio.observe(v); });
    videoTeardown.push(() => { lio.disconnect(); pio.disconnect(); });
  }
}

/* ─────────────────────────────────────────────
   INIT: SERVICES FOLLOW  (Services and About pages, section[data-services-follow])
   — Hovering the list, the frame leaves its corner and follows the
     pointer at half size, just right of the names: sideways it keeps to
     the text, vertically it floats after the pointer, both on springs.
     Two to four thumbnails of that service's projects are dealt out
     beside it and trail it like a train; they fold back into the frame
     as it flies home.
   — Everything stays straight and centred on one line: no lean, no tilt,
     no offset per card (tilt, cardTilt, cardDrop at 0; raise them to
     bring the angles back).
   — A fast sweep down the list stays calm: the frame swaps once the
     pointer rests on a name (intent), the cards a beat later (cardDelay),
     with their pictures ready. A card already out keeps its place and
     only crossfades; a project the next service shares stays on its
     card. The row keeps its length for the whole visit to the list.
   — Every visual has a format: portrait 4:5, square or landscape 3:2,
     set in the CMS (Services: Image Format, Works: Thumbnail Format),
     bound as data-format on its list item. Empty or Auto: the format
     closest to the picture's own shape, once it has loaded.
     The frame's window reshapes on a spring and the picture reframes
     to fill it, never stretched. At home the window stays locked to
     the top-right corner.
   — At rest the corner frame flips through every visual on the page
     (service covers and project thumbnails) in a shuffled round: none
     comes back before all have shown. It pauses off screen, with the
     tab hidden and under the pointer.
   — Visuals come in through the servicesSwap recipe (fade + zoom
     settle), cards deal and fold through servicesCard: both editable
     live in the tune panel ("t" on staging). Distances and timings in
     SERVICES_FOLLOW.
   — Hooks: section[data-services-follow] holds [data-follow-names]
     (the names column, .service-item per service), [data-follow-home]
     > [data-follow-mover] > [data-follow-frame] (.service-img-item per
     service, same order) and a hidden [data-follow-works] Works list
     (.services-work > img + .services-work-service per tagged service).
   — Reads without JS (static first visual). Reduced motion: no travel,
     no cards, no cycle, instant swaps. Touch, or under 992px: the name
     crossing the middle of the screen lights up and, where the frame's
     column shows, the frame swaps to it at home, then carries on
     through the round.
   — Once it runs, initServicesHover and initVideos leave this section
     alone. Everything it adds or changes is undone on every re-init
     (Barba), in reverse order.
───────────────────────────────────────────── */
const SERVICES_FOLLOW = {
  scale:      0.5,    // frame size while it follows (share of its corner size)
  lag:        0.45,   // s the frame takes to catch the pointer sideways
  float:      0.6,    // s, vertical follow: the frame floats after the pointer on a spring
  bounce:     0.3,    // overshoot of that float (0 = settles straight, 0.5 = bouncy)
  tilt:       0,      // deg, max lean from the frame's own sideways speed (0 = always straight)
  offset:     2,      // rem between the end of the names and the frame
  nudge:      1,      // rem the hovered name steps right
  home:       0.6,    // s, flight back to the corner
  intent:     0.06,   // s the pointer rests on a name before the frame swaps
  cards:      [2, 4], // project cards beside the frame (fewest, most), drawn for each visit to the list
  cardDelay:  0.1,    // s more on the same name before the cards follow the frame
  cardWait:   0.3,    // s the cards wait at most for their pictures, then deal anyway
  cardSize:   5.5,    // rem, longest side of a card
  cardGap:    0.55,   // rem between the frame and the cards (site gutter)
  cardLag:    0.08,   // s each card trails the one before it (and floats a little softer)
  cardTilt:   0,      // deg, random tilt per card (0 = straight)
  cardDrop:   0,      // rem, random vertical offset per card (0 = centred on the frame's line)
  morph:      0.2,    // s, spring time of a format change (higher = softer)
  cycle:      1.4,    // s per image in the corner
  cycleVideo: 3,      // s for a video in the corner
  formats:    { portrait: 4 / 5, square: 1, landscape: 3 / 2 }
};
const FOLLOW_HOVER = '(hover: hover) and (pointer: fine) and (min-width: 992px)';

let followTeardown = [];
// Set by the running follow: on a page that's leaving, its round stops and
// nothing new loads or plays while it slides out (the full teardown, which
// restores its inline styles, waits until the page has gone).
let followPause = null;
function pauseServicesFollow() { if (followPause) followPause(); }
function teardownServicesFollow() {
  followTeardown.splice(0).reverse().forEach(fn => { try { fn(); } catch (e) {} });
}

const followKey = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const followFit = (r) => (r >= 1 ? [1, 1 / r] : [r, 1]); // window of ratio r in a unit square
const followFormats = new Map();                           // visual → random format, kept for the visit

// Format of a visual, from data-format on its CMS item (the CMS "format"
// option fields): "Portrait 4:5", "Square", "Landscape", or a ratio like
// "16:9". Empty or "Auto": 0, meaning the picture's own shape decides
// (followRatio). random: true keeps the old behaviour, a random format
// kept for the visit (carousel slides that aren't the Slide / Media component).
function followFormat(item, key, random) {
  const host = item && (item.hasAttribute('data-format') ? item : item.querySelector('[data-format]'));
  const raw  = host ? followKey(host.getAttribute('data-format')) : '';
  const F    = SERVICES_FOLLOW.formats;
  if (F[raw]) return F[raw];
  if (/^(portrait|vertical|tall)\b/.test(raw)) return F.portrait;
  if (/^square\b/.test(raw)) return F.square;
  if (/^(landscape|horizontal|wide)\b/.test(raw)) return F.landscape;
  const m = raw.match(/(\d*\.?\d+)\s*[:/x]\s*(\d*\.?\d+)/);
  if (m && +m[1] && +m[2]) return gsap.utils.clamp(0.5, 2, m[1] / m[2]);
  if (!random) return 0;
  if (!followFormats.has(key)) followFormats.set(key, gsap.utils.random(Object.values(F)));
  return followFormats.get(key);
}

// The format a visual shows in: its CMS format, else the one of the three
// closest to the picture's own shape (ar), else square until the picture is known.
function followRatio(fixed, ar) {
  if (fixed) return fixed;
  if (!(ar > 0) || !isFinite(ar)) return SERVICES_FOLLOW.formats.square;
  return Object.values(SERVICES_FOLLOW.formats)
    .reduce((best, f) => (Math.abs(Math.log(f / ar)) < Math.abs(Math.log(best / ar)) ? f : best));
}

// Critically damped spring: the value chases its target and stays smooth when
// the target changes half-way (a new format before the last one has landed).
function followSpring(o, k, target, time, dt) {
  const kv = k + 'v', w = 2 / time, x = w * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const d = o[k] - target, t = (o[kv] + w * d) * dt;
  o[kv] = (o[kv] - w * t) * e;
  o[k]  = target + (d + t) * e;
  if (Math.abs(o[k] - target) > 1e-4 || Math.abs(o[kv]) > 1e-3) return true;
  o[k] = target;
  o[kv] = 0;
  return false;
}

// Spring with a touch of bounce: the value floats after its target (o.t),
// overshoots a hair and settles, smoothing out the pointer's uneven steps.
// time ~ how long it takes to settle, bounce = overshoot (0 settles straight).
// Integrated in small steps so a slow frame never throws it. True while moving.
function followFloat(o, time, bounce, dt) {
  const w = (2 * Math.PI) / time, z = gsap.utils.clamp(0.05, 1, 1 - bounce);
  const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
  for (let i = 0; i < n; i++) {
    o.v += (w * w * (o.t - o.p) - 2 * z * w * o.v) * h;
    o.p += o.v * h;
  }
  return Math.abs(o.t - o.p) > 0.05 || Math.abs(o.v) > 1;
}

// A square box clipped to a window of the current format. Its layers (one per
// visual) are sized to their picture and scaled to cover the window, so a
// format change reframes the picture instead of stretching it. anchor 0 pins
// the window to the box's top-right corner, 1 centres it.
function followShape(box, anchor) {
  return { box, anchor, layers: [], current: null, swap: null, z: 1, size: 0, radius: 0, scale: 1,
           w: 1, h: 1, wv: 0, hv: 0, tw: 1, th: 1, clip: '', dirty: true };
}

function followRender(sh) {
  const S = sh.size;
  if (!S) return;
  const w = sh.w * S, h = sh.h * S, a = sh.anchor;
  const right = (S - w) * a / 2, left = S - w - right;
  const top = (S - h) * a / 2, bottom = S - h - top;
  // Corners keep the site radius on screen whatever the box's scale.
  const r = Math.min(sh.radius / Math.max(sh.scale, 0.05), w / 2, h / 2);
  const clip = `inset(${top.toFixed(2)}px ${right.toFixed(2)}px ${bottom.toFixed(2)}px ${left.toFixed(2)}px round ${r.toFixed(2)}px)`;
  if (clip !== sh.clip) { sh.box.style.clipPath = clip; sh.clip = clip; }
  const cx = left + w / 2, cy = top + h / 2;
  sh.layers.forEach((L) => {
    if (!L.on) return;
    const ar = L.ar || (L.video ? 16 / 9 : 1);
    const mw = ar >= 1 ? S * ar : S, mh = ar >= 1 ? S : S / ar;
    if (mw !== L.mw || mh !== L.mh) {
      L.mw = mw;
      L.mh = mh;
      L.el.style.width  = mw + 'px';
      L.el.style.height = mh + 'px';
      if (L.sizes && L.img && L.img.getAttribute('srcset')) L.img.sizes = Math.ceil(mw) + 'px';
    }
    const k = Math.max(w / mw, h / mh);
    const tf = `translate(${(cx - mw / 2).toFixed(2)}px, ${(cy - mh / 2).toFixed(2)}px) scale(${k.toFixed(4)})`;
    if (tf !== L.tf) { L.el.style.transform = tf; L.tf = tf; }
  });
}

function initServicesFollow() {
  teardownServicesFollow();
  const root = document.querySelector('[data-services-follow]');
  if (!root) return;
  try { setupServicesFollow(root); }
  catch (e) { teardownServicesFollow(); throw e; } // back to the plain hover, never half-built
}

function setupServicesFollow(root) {
  const CFG     = SERVICES_FOLLOW;
  const names   = root.querySelector('[data-follow-names]');
  const home    = root.querySelector('[data-follow-home]');
  const mover   = root.querySelector('[data-follow-mover]');
  const frameEl = root.querySelector('[data-follow-frame]');
  const items   = names ? Array.from(names.querySelectorAll('.service-item')) : [];
  const covers  = frameEl ? Array.from(frameEl.querySelectorAll('.service-img-item')) : [];
  if (!names || !home || !mover || !frameEl || !items.length || !covers.length) return;

  // Everything below registers its own undo; teardown runs them newest first.
  let alive = true;
  const undo = [];
  followTeardown.push(() => {
    alive = false;
    undo.splice(0).reverse().forEach(fn => { try { fn(); } catch (e) {} });
  });

  const column  = home.closest('.main-content-right') || home.parentElement;
  const corners = mover.querySelector('.img-corner-wrap');

  // Projects per service from the hidden Works list, newest first like the Work page.
  const works = Array.from(root.querySelectorAll('[data-follow-works] .services-work')).map((w) => {
    const img = w.querySelector('img');
    return {
      item:     w,
      src:      img && !img.classList.contains('w-dyn-bind-empty') ? img.getAttribute('src') || '' : '',
      srcset:   img ? img.getAttribute('srcset') || '' : '',
      services: Array.from(w.querySelectorAll('.services-work-service')).map(s => followKey(s.textContent))
    };
  }).filter(w => w.src);
  const projects = items.map((el) => {
    const key = followKey((el.querySelector('.services-txt') || el).textContent);
    return works.filter(w => w.services.includes(key));
  });

  let R = 16; // px per rem, measured
  let inView = false, overColumn = false, following = false, ticking = false, aimDirty = false, paused = false;

  /* ── layers ── */
  const main = followShape(frameEl, 0);

  const loadVideo = (v) => {
    if (v.dataset.vloaded === '1') return;
    const src = v.getAttribute('data-source');
    if (!src || !/\.(mp4|webm|ogv|mov|m4v)(\?.*)?$/i.test(src)) return;
    v.dataset.vloaded = '1';
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.removeAttribute('autoplay'); // played here, only while it shows
    v.src = src;
    v.load();
  };
  const syncVideo = (L) => {
    const v = L.video;
    if (!v) return;
    if (!(alive && !paused && L.on && inView && !document.hidden && columnShows())) { try { v.pause(); } catch (e) {} return; }
    loadVideo(v);
    playVideo(v, (x) => gsap.to(x, { opacity: 1, duration: 0.2, ease: 'power2.out', overwrite: 'auto' }));
  };

  // The picture's own proportions, once known: its layer is sized to them.
  const measureAr = (L) => {
    const ar = L.img ? L.img.naturalWidth / L.img.naturalHeight
      : L.video && L.video.videoWidth ? L.video.videoWidth / L.video.videoHeight : 0;
    if (!(ar > 0) || !isFinite(ar) || Math.abs(ar - L.ar) < 1e-3) return;
    L.ar = ar;
    L.sh.dirty = true;
    // Auto format: the window takes the picture's shape once it's known.
    if (!L.fixed && L.sh.current === L) setFormat(L.sh, L.ratio);
    wake();
  };

  const addLayer = (sh, el, inner, media, key, item, sizes) => {
    const L = { sh, el, inner, media, key, sizes, on: false, z: 0, mw: 0, mh: 0, tf: '', ar: 0, ready: null, isReady: false,
                failed: false,
                img:   media && media.tagName === 'IMG' ? media : null,
                video: media && media.tagName === 'VIDEO' ? media : null,
                fixed: followFormat(item || el, key),
                get ratio() { return followRatio(this.fixed, this.ar); } };
    el.style.position = 'absolute';
    el.style.inset = '0 auto auto 0';
    el.style.transformOrigin = '50% 50%';
    gsap.set(el, { visibility: 'hidden', opacity: 0 });
    if (media) {
      media.style.objectFit = 'cover';
      const type = L.video ? 'loadedmetadata' : 'load';
      const onMeta = () => measureAr(L);
      media.addEventListener(type, onMeta);
      undo.push(() => media.removeEventListener(type, onMeta));
      if (L.img && L.img.complete) measureAr(L);
    }
    if (L.video) {
      // A video shows once it really plays, never as a black frame.
      gsap.set(L.video, { opacity: L.video.readyState >= 3 ? 1 : 0 });
      const reveal = () => gsap.to(L.video, { opacity: 1, duration: 0.2, ease: 'power2.out', overwrite: 'auto' });
      L.video.addEventListener('playing', reveal);
      undo.push(() => L.video.removeEventListener('playing', reveal));
    }
    sh.layers.push(L);
    return L;
  };

  // A project thumbnail as a layer of a shape (the frame or a card), made on first use.
  const projectLayer = (sh, w, sizePx) => {
    const found = sh.layers.find(o => o.key === w.src);
    if (found) return found;
    const el  = document.createElement('div');
    const img = document.createElement('img');
    el.setAttribute('aria-hidden', 'true');
    img.alt = '';
    img.decoding = 'async';
    img.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;max-width:none;';
    img.dataset.sizes = Math.ceil(sizePx) + 'px';
    el.appendChild(img);
    sh.box.appendChild(el);
    undo.push(() => el.remove());
    const L = addLayer(sh, el, img, img, w.src, w.item, false);
    L.work = w;
    return L;
  };

  // Start loading a layer's picture; resolves once it's decoded and can show.
  // A picture that can't load is marked failed (the corner round leaves it out).
  const prepare = (L) => {
    if (L.ready) return L.ready;
    if (L.video) {
      loadVideo(L.video);
      L.isReady = true;
      L.ready = Promise.resolve();
      return L.ready;
    }
    const img = L.img;
    if (!img) { L.isReady = true; L.ready = Promise.resolve(); return L.ready; }
    if (L.work && !img.getAttribute('src')) {
      if (L.work.srcset) { img.sizes = img.dataset.sizes; img.srcset = L.work.srcset; }
      img.src = L.work.src;
    } else if (img.loading === 'lazy') {
      img.loading = 'eager';
    }
    const decoded = img.decode ? img.decode() : Promise.resolve();
    L.ready = Promise.race([decoded, new Promise(r => setTimeout(r, 2500))])
      .catch(() => {})
      .then(() => {
        L.failed = img.complete && !img.naturalWidth;
        measureAr(L);
        L.isReady = true;
      });
    return L.ready;
  };

  const hide = (L) => {
    L.on = false;
    gsap.killTweensOf([L.el, L.inner]);
    gsap.set(L.el, { visibility: 'hidden', opacity: 0 });
    syncVideo(L);
  };

  const setFormat = (sh, ratio, instant) => {
    [sh.tw, sh.th] = followFit(ratio);
    if (instant || reducedMotion) { sh.w = sh.tw; sh.h = sh.th; sh.wv = sh.hv = 0; }
    sh.dirty = true;
    wake();
  };

  // Bring L to the front of its shape; the window takes its format. A new
  // visual comes in through servicesSwap over what's showing; one still in the
  // stack (a quick back-and-forth) is uncovered instead, so the picture never
  // drops to the background. What's underneath hides once the latest swap ends.
  const show = (L, instant) => {
    const sh = L.sh;
    if (sh.current === L) return;
    const prev = sh.current;
    sh.current = L;
    const still = instant || reducedMotion;
    setFormat(sh, L.ratio, still);
    if (sh.swap) { sh.swap.eventCallback('onComplete', null); sh.swap = null; }
    const settle = () => {
      sh.swap = null;
      sh.layers.forEach((o) => { if (o.on && o !== sh.current) hide(o); });
    };

    let tl = null;
    if (L.on && !still) {
      const above = sh.layers.filter(o => o.on && o.z > L.z).map(o => o.el);
      gsap.killTweensOf([L.el, ...above], 'opacity');
      tl = gsap.timeline()
        .to(L.el, { opacity: 1, duration: 0.15, ease: 'power1.out' }, 0)
        .to(above, { opacity: 0, duration: 0.15, ease: 'power1.out' }, 0);
    } else {
      L.on = true;
      L.z = ++sh.z;
      gsap.killTweensOf([L.el, L.inner]);
      gsap.set(L.el, { zIndex: L.z, visibility: 'visible', opacity: 1 });
      gsap.set(L.inner, { scale: 1 });
      if (!still) tl = runRecipe('servicesSwap', gsap.timeline(), { next: L.el, media: L.inner, prev: prev ? prev.el : null });
    }
    syncVideo(L);
    followRender(sh); // placed for the window before its first frame shows
    if (tl && tl.duration()) { sh.swap = tl; tl.eventCallback('onComplete', settle); }
    else { if (tl) tl.kill(); settle(); }
  };

  const coverLayers = covers.map((item, i) => {
    const inner = item.querySelector('.g_visual_wrap') || item.firstElementChild || item;
    const media = item.querySelector('.g_visual_img:not(.w-condition-invisible), .g_visual_video:not(.w-condition-invisible)');
    const key = 'cover:' + (media ? media.getAttribute('data-source') || media.getAttribute('src') || i : i);
    const L = addLayer(main, item, inner, media, key, item, true);
    undo.push(() => {
      item.style.cssText = '';
      if (inner !== item) gsap.set(inner, { clearProps: 'transform' });
      if (media) { media.style.objectFit = ''; if (L.video) media.style.opacity = ''; }
    });
    return L;
  });

  /* ── frame and corner ── */
  if (corners) {
    corners.style.display = 'none'; // the window's own rounded clip does their job
    undo.push(() => { corners.style.display = ''; });
  }
  mover.style.zIndex = '20';
  mover.style.pointerEvents = 'none';
  undo.push(() => {
    gsap.killTweensOf(mover);
    gsap.set(mover, { clearProps: 'transform' });
    mover.style.zIndex = mover.style.pointerEvents = mover.style.willChange = '';
    frameEl.style.clipPath = '';
  });

  /* ── cards ── */
  // Each card: an outer element that travels and leans (physics) around the
  // card itself, which the servicesCard recipe scales and tilts. fx / fy / fr
  // are its sideways, vertical and lean springs.
  const cards = Array.from({ length: Math.max(0, CFG.cards[1]) }, (_, j) => {
    const el  = document.createElement('div');
    const box = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:' + (10 - j) + ';';
    box.style.cssText = 'position:absolute;inset:0;overflow:hidden;background-color:var(--swatch--dark-faded);';
    el.appendChild(box);
    home.appendChild(el);
    gsap.set(el, { visibility: 'hidden', transformOrigin: '50% 50%' });
    gsap.set(box, { scale: 0, transformOrigin: '50% 50%' });
    const c = { el, box, j, sh: followShape(box, 1), on: false, folding: false, tl: null, want: null, rot: 0, drop: 0,
                foldX: 0, foldY: 0, fx: { p: 0, pv: 0, t: 0 }, fy: { p: 0, v: 0, t: 0 }, fr: { p: 0, pv: 0 } };
    undo.push(() => { if (c.tl) c.tl.kill(); gsap.killTweensOf([el, box]); el.remove(); });
    return c;
  });

  // Nothing keeps animating once the feature is gone (runs before the restores above).
  undo.push(() => {
    gsap.killTweensOf(main);
    [main, ...cards.map(c => c.sh)].forEach((sh) => {
      if (sh.swap) sh.swap.kill();
      sh.layers.forEach((L) => {
        gsap.killTweensOf([L.el, L.inner, L.media]);
        if (L.video) { try { L.video.pause(); } catch (e) {} }
      });
    });
  });

  /* ── geometry ── */
  // Each name's right edge on screen and its top/bottom within the list
  // (scroll moves the list, not these), measured with any nudge taken out.
  let words = [];
  const measureWords = () => {
    const nt = names.getBoundingClientRect().top;
    words = items.map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el.querySelector('.services-txt') || el);
      const b = range.getBoundingClientRect();
      return { right: b.right - gsap.getProperty(el, 'x'), top: b.top - nt, bottom: b.bottom - nt };
    });
  };
  const measure = () => {
    R = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    measureWords();
    main.size = frameEl.offsetWidth;
    main.radius = parseFloat(getComputedStyle(frameEl).borderTopLeftRadius) || 0.55 * R;
    main.dirty = true;
    const Sc = CFG.cardSize * R;
    cards.forEach((c) => {
      c.sh.size = Sc;
      c.sh.radius = main.radius;
      c.sh.dirty = true;
      c.el.style.width = c.el.style.height = Sc + 'px';
    });
    wake();
  };

  // Centre of the frame's window on screen, wherever it is right now.
  const mainCenter = (hr) => {
    const S = main.size, s = gsap.getProperty(mover, 'scale');
    const w = main.w * S, h = main.h * S, a = main.anchor;
    const cx = S / 2 + (S - w) * (1 - a) / 2, cy = (S - h) * a / 2 + h / 2;
    return {
      x: hr.left + S / 2 + gsap.getProperty(mover, 'x') + (cx - S / 2) * s,
      y: hr.top  + S / 2 + gsap.getProperty(mover, 'y') + (cy - S / 2) * s
    };
  };

  /* ── render loop: springs and clips, only while something moves ── */
  function wake() {
    if (ticking || !alive) return;
    ticking = true;
    gsap.ticker.add(tick);
  }
  undo.push(() => { gsap.ticker.remove(tick); ticking = false; });
  const foldEase = gsap.parseEase('power2.out');
  const step = (sh, dt) => {
    const a = followSpring(sh, 'w', sh.tw, CFG.morph, dt);
    const b = followSpring(sh, 'h', sh.th, CFG.morph, dt);
    const moved = a || b || sh.dirty;
    sh.dirty = false;
    return moved;
  };
  let px = 0, py = 0;
  // The frame's springs, as offsets from its corner: sideways, vertical float, lean.
  const fx = { p: 0, pv: 0, t: 0 }, fy = { p: 0, v: 0, t: 0 }, fr = { p: 0, pv: 0 };
  const LEAN = 0.14; // s, spring time of the lean
  // Lean (deg) from a sideways speed (px/s): back to straight when it stops.
  const lean = (v, max) => gsap.utils.clamp(-max, max, v * 0.008);
  // Sideways follow: a spring that arrives about when a power3.out tween of
  // `lag` would, without its jolt each time the target jumps to a longer or
  // shorter name. It gets out of a longer name's way quicker than it drifts
  // back, and coming back left it never runs more than half the offset past
  // its mark, so it never ends up on a name.
  const side = (o, lag, dt) => {
    const was = o.p, floor = o.t - CFG.offset * R / 2;
    const moving = followSpring(o, 'p', o.t, lag * (o.t > o.p ? 0.2 : 0.28), dt);
    if (was >= floor && o.p < floor) { o.p = floor; o.pv = Math.max(0, o.pv); }
    return moving;
  };
  const setMover = { x: gsap.quickSetter(mover, 'x', 'px'), y: gsap.quickSetter(mover, 'y', 'px'), r: gsap.quickSetter(mover, 'rotation', 'deg') };
  let flyX = 0, flyY = 0, flyVx = 0, flyVy = 0; // the frame's speed on its way home
  // Writes only what moved, and goes to sleep once nothing does (a pointer
  // resting on a name): pointer moves and scrolls wake it through reaim().
  function tick(time, deltaMS) {
    if (!alive) return;
    const dt = Math.min(Math.max(deltaMS || 16.7, 1), 64) / 1000;
    let busy = false;

    if (following) {
      // Targets from the pointer once a frame, read before anything moves.
      if (aimDirty) { aimDirty = false; aim(); }
      // It leans with its own sideways speed, so a jump to a longer or shorter name swings it too.
      const a = side(fx, CFG.lag, dt);
      const b = followFloat(fy, CFG.float, CFG.bounce, dt);
      const c = followSpring(fr, 'p', lean(fx.pv, CFG.tilt), LEAN, dt);
      if (a || b || c) { setMover.x(fx.p); setMover.y(fy.p); setMover.r(fr.p); busy = true; }
    }

    main.scale = gsap.getProperty(mover, 'scale');
    const flying = gsap.isTweening(mover) || gsap.isTweening(main);
    if (flying && !following) {
      const mx = gsap.getProperty(mover, 'x'), my = gsap.getProperty(mover, 'y');
      flyVx = (mx - flyX) / dt; flyVy = (my - flyY) / dt; flyX = mx; flyY = my;
    }
    if (step(main, dt) || flying) { followRender(main); busy = true; }

    let hr = null;
    cards.forEach((c) => {
      if (!c.on && !c.folding) return;
      const dealing = !!(c.tl && c.tl.isActive());
      if (c.folding) {
        // Slides under the frame's centre (wherever it flies) as it folds,
        // ahead of the shrink, so it tucks in rather than vanishing in place.
        hr = hr || home.getBoundingClientRect();
        const m = mainCenter(hr), e = foldEase(c.tl ? c.tl.progress() : 1);
        followSpring(c.fr, 'p', 0, LEAN, dt);
        gsap.set(c.el, {
          x: c.foldX + (m.x - hr.left - c.sh.size / 2 - c.foldX) * e,
          y: c.foldY + (m.y - hr.top - c.sh.size / 2 - c.foldY) * e,
          rotation: c.fr.p
        });
        busy = true;
      } else {
        // Each card trails and floats a little softer than the one before: the row moves in a wave.
        const a = side(c.fx, CFG.lag + CFG.cardLag * (c.j + 1), dt);
        const b = followFloat(c.fy, CFG.float * (1 + 0.15 * (c.j + 1)), CFG.bounce, dt);
        const d = followSpring(c.fr, 'p', lean(c.fx.pv * 0.75, CFG.tilt * 0.7), LEAN, dt);
        if (a || b || d) { gsap.set(c.el, { x: c.fx.p, y: c.fy.p, rotation: c.fr.p }); busy = true; }
      }
      c.sh.scale = gsap.getProperty(c.box, 'scale');
      if (step(c.sh, dt) || dealing) { followRender(c.sh); busy = true; }
    });

    if (!busy) { ticking = false; gsap.ticker.remove(tick); }
  }

  /* ── aim: the frame just right of the names, the cards in a row after it ── */
  // Pointer moves, scrolls and swaps only flag it; the tick aims once a frame.
  const reaim = () => {
    if (!following) return;
    aimDirty = true;
    wake();
  };
  let nudged = -1;
  // The frame never sits on a name: it clears every name its height spans
  // (a longer one above or below too), the hovered one where its nudge lands.
  const clearOf = (nt, top, bottom) => {
    const push = reducedMotion ? 0 : CFG.nudge * R;
    let x = nudged >= 0 && words[nudged] ? words[nudged].right + push : -Infinity;
    words.forEach((w, i) => {
      if (nt + w.bottom < top || nt + w.top > bottom) return;
      x = Math.max(x, w.right + (i === nudged ? push : 0));
    });
    return x;
  };
  const aim = () => {
    const hr = home.getBoundingClientRect(), nt = names.getBoundingClientRect().top;
    const S = main.size, vw = window.innerWidth, vh = window.innerHeight;
    const off = CFG.offset * R, gap = CFG.cardGap * R, edge = R;
    const mw = main.tw * S * CFG.scale, mh = main.th * S * CFG.scale;
    const row = cards.filter(c => c.on);
    const ws  = row.map(c => c.sh.tw * c.sh.size);
    const cy  = gsap.utils.clamp(edge + mh / 2, vh - edge - mh / 2, py);
    let left = Math.max(px, clearOf(nt, cy - mh / 2, cy + mh / 2)) + off;
    // Short of room on the right: the cards close up like a fanned deck
    // first, then the whole group slides left.
    const need = ws.reduce((s, w) => s + gap + w, 0);
    const last = ws.length ? ws[ws.length - 1] : 0;
    const room = vw - edge - (left + mw);
    const fan  = need > room && need > last ? gsap.utils.clamp(0.45, 1, (room - last) / (need - last)) : 1;
    const span = need ? (need - last) * fan + last : 0;
    left = Math.min(left, vw - edge - mw - span);
    fx.t = left + mw / 2 - (hr.left + S / 2);
    fy.t = cy - (hr.top + S / 2);
    let x = left + mw;
    row.forEach((c, k) => {
      const w = ws[k];
      c.fx.t = x + gap * fan + w / 2 - (hr.left + c.sh.size / 2);
      c.fy.t = cy + c.drop - (hr.top + c.sh.size / 2);
      x += (gap + w) * fan;
    });
  };

  /* ── cards: dealt out of the frame, folded back into it ── */
  const hideCard = (c) => {
    c.on = c.folding = false;
    c.tl = null;
    c.el.style.willChange = '';
    gsap.set(c.el, { visibility: 'hidden' });
    gsap.set(c.box, { scale: 0 });
    // Empty again: a card dealt later never flashes the project it showed before.
    c.sh.layers.forEach((L) => { if (L.on) hide(L); });
    c.sh.current = null;
  };
  const cardMove = (c, show, rotation) => {
    if (c.tl) { c.tl.kill(); c.tl = null; }
    if (show && !c.on && !c.folding) {
      // Dealt from behind the frame's centre, leaving with the frame's own speed.
      const hr = home.getBoundingClientRect(), m = mainCenter(hr);
      const x = m.x - hr.left - c.sh.size / 2, y = m.y - hr.top - c.sh.size / 2;
      c.fx.p = c.fx.t = x;
      c.fx.pv = fx.pv;
      c.fy.p = c.fy.t = y;
      c.fy.v = fy.v;
      c.fr.p = c.fr.pv = 0;
      gsap.set(c.el, { x, y, rotation: 0, visibility: 'visible' });
      gsap.set(c.box, { scale: 0, rotation: 0 });
      c.el.style.willChange = 'transform'; // out of the frame it moves every frame: its own layer while dealt
    } else if (show && c.folding) {
      // Caught mid-fold: the row picks it up from where it is.
      c.fx.p = c.fx.t = gsap.getProperty(c.el, 'x');
      c.fy.p = c.fy.t = gsap.getProperty(c.el, 'y');
      c.fx.pv = c.fy.v = 0;
    } else if (!show) {
      // The fold carries it (tick) from where it is.
      c.foldX = gsap.getProperty(c.el, 'x');
      c.foldY = gsap.getProperty(c.el, 'y');
    }
    c.on = show;
    c.folding = !show;
    const tl = runRecipe('servicesCard', gsap.timeline(), { card: c.box, show, rotation: show ? rotation : 0, index: c.j });
    if (tl.duration()) {
      c.tl = tl;
      if (!show) tl.eventCallback('onComplete', () => hideCard(c));
    } else {
      tl.kill();
      if (show) gsap.set(c.box, { scale: 1, rotation });
      else hideCard(c);
    }
    wake();
  };

  // The row's length is drawn once per visit to the list, so moving between
  // services changes pictures, not cards; projects are drawn per service.
  let session = 0, rowLength = CFG.cards[1];
  const picks = new Map();
  const picksFor = (i) => {
    const p = picks.get(i);
    if (p && p.session === session) return p.list;
    const pool = projects[i] ? projects[i].slice() : [];
    const list = gsap.utils.shuffle(pool).slice(0, Math.min(rowLength, cards.length));
    picks.set(i, { session, list });
    return list;
  };
  // Which card takes which project: one the row already shows stays on its card.
  const slotsFor = (list) => {
    const slots = list.map(() => null), rest = [];
    list.forEach((w) => {
      const k = cards.findIndex((c, j) => j < list.length && !slots[j] && c.on && c.want && c.want.key === w.src);
      if (k >= 0) slots[k] = w;
      else rest.push(w);
    });
    return slots.map(w => w || rest.shift());
  };
  const cardSizes = () => CFG.cardSize * R * 1.5;
  const warm = (w) => {
    if (w.warm) return;
    w.warm = new Image();
    w.warm.decoding = 'async';
    w.warm.fetchPriority = 'low';
    if (w.srcset) { w.warm.sizes = Math.ceil(cardSizes()) + 'px'; w.warm.srcset = w.srcset; }
    w.warm.src = w.src;
  };

  // Cards joining the row come out of the frame with a tilt and height of
  // their own (none while cardTilt and cardDrop are 0); cards already out
  // keep theirs and only take the new picture.
  const deal = (i) => {
    const slots = slotsFor(picksFor(i));
    cards.forEach((c, j) => {
      const w = slots[j];
      if (!w) { c.want = null; if (c.on) cardMove(c, false); return; }
      const L = projectLayer(c.sh, w, cardSizes());
      if (c.want === L && c.on) return; // already showing it
      const joining = !c.on, fresh = !c.on && !c.folding;
      c.want = L;
      if (joining) {
        c.rot  = gsap.utils.random(-CFG.cardTilt, CFG.cardTilt);
        c.drop = gsap.utils.random(-CFG.cardDrop, CFG.cardDrop) * R;
      }
      // A new card grows already in its format; a card in the row reshapes and crossfades.
      if (fresh) setFormat(c.sh, L.ratio, true);
      if (L.isReady) show(L, fresh);
      else prepare(L).then(() => { if (alive && c.want === L) { show(L); reaim(); } });
      if (joining) cardMove(c, true, c.rot);
    });
    reaim();
  };

  // The cards follow once the pointer has stayed on the name a beat longer
  // than the frame needed, their pictures decoded (or cardWait later at
  // most), so a quick sweep down the list never churns them.
  let dealCall = null, dealGen = 0;
  const cancelDeal = () => {
    dealGen++;
    if (dealCall) { dealCall.kill(); dealCall = null; }
  };
  undo.push(cancelDeal);
  const queueDeal = (i) => {
    cancelDeal();
    const gen = dealGen;
    const layers = slotsFor(picksFor(i)).map((w, j) => projectLayer(cards[j].sh, w, cardSizes()));
    layers.forEach(prepare); // decoding while the pointer rests
    dealCall = gsap.delayedCall(CFG.cardDelay, () => {
      dealCall = null;
      const waiting = layers.filter(L => !L.isReady);
      if (!waiting.length) { deal(i); return; }
      Promise.race([Promise.all(waiting.map(prepare)), new Promise(r => setTimeout(r, CFG.cardWait * 1000))])
        .then(() => { if (alive && following && gen === dealGen) deal(i); });
    });
  };
  const foldCards = () => {
    cancelDeal();
    cards.forEach((c) => { c.want = null; if (c.on) cardMove(c, false); });
  };

  /* ── corner cycle: every visual on the page, in a shuffled round ── */
  let service = 0, cycleTw = null, cycleGen = 0, deck = [], deckAt = 0;
  const visuals = coverLayers.concat(works.filter((w, k) => works.findIndex(o => o.src === w.src) === k));
  const layerOf = (v) => (v.sh ? v : projectLayer(main, v, main.size * 1.5));
  const showing = (v) => !!main.current && (v.sh ? v === main.current : main.current.key === v.src);
  // Next in the round, never the one showing nor one that failed to load;
  // a new shuffle once all have shown.
  const deckPeek = () => {
    for (let n = 0; n <= visuals.length; n++) {
      if (deckAt >= deck.length) { deck = gsap.utils.shuffle(visuals.slice()); deckAt = 0; }
      const v = deck[deckAt];
      if (!v.failed && !showing(v)) return v;
      deckAt++;
    }
    return null;
  };
  const columnShows = () => main.size > 0 && column.getClientRects().length > 0;
  const cyclePaused = () => !inView || document.hidden || overColumn || following;
  const cycleSync = () => {
    if (cycleTw) cyclePaused() ? cycleTw.pause() : cycleTw.resume();
    main.layers.forEach(syncVideo);
  };
  let cycling = false; // a round is under way (its timer, or the next picture decoding)
  const cycleStop = () => {
    cycleGen++;
    cycling = false;
    if (cycleTw) { cycleTw.kill(); cycleTw = null; }
  };
  undo.push(cycleStop);
  const cycleRun = () => {
    const gen = cycleGen, next = deckPeek(), L = main.current;
    if (next) prepare(layerOf(next)); // the next one decodes while this one holds
    cycleTw = gsap.delayedCall(L && L.video ? CFG.cycleVideo : CFG.cycle, () => cycleNext(gen, 0));
    if (cyclePaused()) cycleTw.pause();
  };
  const cycleNext = (gen, skipped) => {
    cycleTw = null;
    if (!columnShows()) return; // column hidden (window narrowed): onRefresh starts the round again
    const v = deckPeek();
    if (!v) return;
    deckAt++;
    const L = layerOf(v);
    prepare(L).then(() => {
      if (!alive || gen !== cycleGen || following) return;
      if (L.failed) {
        v.failed = true; // left out of the round from now on
        if (skipped < visuals.length) cycleNext(gen, skipped + 1);
        return;
      }
      show(L);
      cycleRun();
    });
  };
  const cycleStart = () => {
    cycleStop();
    if (paused || reducedMotion || !columnShows() || visuals.length < 2) return;
    cycling = true;
    cycleRun();
  };

  // A service becomes current: its cover in the frame (once decoded, so it
  // never pops in half-loaded).
  const setService = (i, instant) => {
    const L = coverLayers[i];
    if (!L) return Promise.resolve();
    service = i;
    if (instant || L.isReady) { prepare(L); show(L, instant); reaim(); return Promise.resolve(); }
    return prepare(L).then(() => {
      if (!alive || service !== i) return;
      show(L);
      reaim(); // its format sets the row
    });
  };

  /* ── first state ── */
  measure();
  setService(0, true);
  followRender(main);

  let nearPending = false;
  const onRefresh = () => {
    measure();
    reaim();
    if (!columnShows()) { cycleStop(); return; }
    if (inView && !following && !cycling) cycleStart();
    if (nearPending) warmCovers();
  };
  ScrollTrigger.addEventListener('refresh', onRefresh);
  undo.push(() => ScrollTrigger.removeEventListener('refresh', onRefresh));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (alive) onRefresh(); }); // names reflow with the webfont

  // Covers (pictures and videos) load a screen before the list arrives, so the
  // first hovers swap at once; the cycle runs only on screen.
  // Where the column never shows (phones), they wait until it does.
  const warmCovers = () => { nearPending = false; coverLayers.forEach(prepare); };
  const near = new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting)) return;
    near.disconnect();
    if (columnShows()) warmCovers(); else nearPending = true;
  }, { rootMargin: '100% 0px' });
  near.observe(root);
  const onScreen = new IntersectionObserver((entries) => {
    inView = entries.some(e => e.isIntersecting);
    if (inView && !cycleTw && !following) cycleStart();
    cycleSync();
  }, { threshold: 0 });
  onScreen.observe(root);
  const onVisibility = () => cycleSync();
  document.addEventListener('visibilitychange', onVisibility);
  undo.push(() => {
    near.disconnect();
    onScreen.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
  });

  const columnEnter = () => { overColumn = true; cycleSync(); };
  const columnLeave = () => { overColumn = false; cycleSync(); };
  column.addEventListener('mouseenter', columnEnter);
  column.addEventListener('mouseleave', columnLeave);
  undo.push(() => {
    column.removeEventListener('mouseenter', columnEnter);
    column.removeEventListener('mouseleave', columnLeave);
  });

  /* ── pointer (desktop) / middle line (touch) ── */
  const nudge = (i) => {
    if (i === nudged) return;
    if (nudged >= 0) gsap.to(items[nudged], { x: 0, duration: 0.3, ease: 'power3.out', overwrite: 'auto' });
    nudged = i;
    if (i >= 0 && !reducedMotion) gsap.to(items[i], { x: CFG.nudge * R, duration: 0.35, ease: easeOr('energy', 'power3.out'), overwrite: 'auto' });
  };
  undo.push(() => { gsap.killTweensOf(items); gsap.set(items, { clearProps: 'transform,opacity' }); });

  const mm = gsap.matchMedia();
  undo.push(() => mm.revert());
  mm.add({ hover: FOLLOW_HOVER, touch: 'not all and ' + FOLLOW_HOVER }, (ctx) => {
    if (ctx.conditions.hover) {
      let intent = null;

      const lift = (e) => {
        if (following || reducedMotion) return;
        following = true;
        session++;
        rowLength = gsap.utils.random(CFG.cards[0], CFG.cards[1], 1);
        px = e.clientX;
        py = e.clientY;
        cycleStop();
        const homing = gsap.isTweening(mover); // caught on its way home: it keeps its speed
        gsap.killTweensOf(mover);
        gsap.killTweensOf(main, 'anchor');
        mover.style.willChange = 'transform';
        // The springs take it from where it is: the corner, or on its way back to it.
        fx.p = fx.t = gsap.getProperty(mover, 'x');
        fy.p = fy.t = gsap.getProperty(mover, 'y');
        fr.p = gsap.getProperty(mover, 'rotation');
        fx.pv = homing ? flyVx : 0;
        fy.v  = homing ? flyVy : 0;
        fr.pv = 0;
        // Leaves the corner: shrinks while its window slides to the middle.
        gsap.to(mover, { scale: CFG.scale, duration: 0.45, ease: easeOr('energy', 'power3.out') });
        gsap.to(main, { anchor: 1, duration: 0.45, ease: easeOr('energy', 'power3.out') });
        reaim();
      };
      const land = () => {
        if (intent) { intent.kill(); intent = null; }
        nudge(-1);
        if (!following) return;
        following = false;
        aimDirty = false;
        foldCards();
        gsap.killTweensOf(mover);
        gsap.killTweensOf(main, 'anchor');
        flyX = fx.p; flyY = fy.p; flyVx = fx.pv; flyVy = fy.v;
        // Flies home at full size, its window sliding back into the corner.
        const ease = easeOr('energy', 'power3.out');
        gsap.to(mover, {
          x: 0, y: 0, rotation: 0, scale: 1, duration: CFG.home, ease,
          onComplete: () => { mover.style.willChange = ''; if (alive && !following && inView) cycleStart(); }
        });
        gsap.to(main, { anchor: 0, duration: CFG.home, ease });
        wake();
      };
      const activate = (i) => {
        if (reducedMotion) { setService(i, true); return; }
        if (!following) return;
        picksFor(i).forEach(warm);
        setService(i);
        queueDeal(i);
      };
      const hover = (i) => {
        if (reducedMotion) { activate(i); return; }
        nudge(i);
        cancelDeal(); // the cards wait for the pointer to settle again
        if (coverLayers[i]) prepare(coverLayers[i]);
        if (intent) intent.kill();
        // The frame swaps once the pointer rests on a name, so a sweep down the list doesn't flicker.
        intent = gsap.delayedCall(CFG.intent, () => { intent = null; activate(i); });
        reaim();
      };

      const enters = items.map((el, i) => {
        const fn = () => hover(i);
        el.addEventListener('mouseenter', fn);
        return fn;
      });
      const onEnter = (e) => lift(e);
      const onLeave = () => land();
      const onNamesMove = (e) => {
        if (following || reducedMotion) return;
        // Already over the list when this starts (after a page change): go on the first move.
        lift(e);
        const it = e.target.closest ? e.target.closest('.service-item') : null;
        if (it && items.includes(it)) hover(items.indexOf(it));
      };
      const onMove = (e) => { px = e.clientX; py = e.clientY; reaim(); };
      names.addEventListener('mouseenter', onEnter);
      names.addEventListener('mouseleave', onLeave);
      names.addEventListener('mousemove', onNamesMove);
      window.addEventListener('mousemove', onMove, { passive: true });
      window.addEventListener('scroll', reaim, { passive: true });
      if (inView && !cycleTw) cycleStart();

      return () => {
        items.forEach((el, i) => el.removeEventListener('mouseenter', enters[i]));
        names.removeEventListener('mouseenter', onEnter);
        names.removeEventListener('mouseleave', onLeave);
        names.removeEventListener('mousemove', onNamesMove);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('scroll', reaim);
        if (intent) intent.kill();
        cancelDeal();
        following = false;
        aimDirty = false;
        nudge(-1);
        cards.forEach((c) => { if (c.tl) c.tl.kill(); c.want = null; hideCard(c); });
        gsap.killTweensOf(mover);
        gsap.killTweensOf(main, 'anchor');
        gsap.set(mover, { x: 0, y: 0, rotation: 0, scale: 1 });
        mover.style.willChange = '';
        main.anchor = 0;
        main.dirty = true;
        wake();
      };
    }

    // Touch / tablet: the name crossing the middle of the screen lights up
    // (its own CSS fade) and, where the frame's column shows, the frame swaps
    // to it, then carries on through the round.
    let lit = -1;
    const light = (i) => {
      if (i === lit) return;
      if (lit >= 0) items[lit].style.opacity = '';
      lit = i;
      if (i < 0) return;
      items[i].style.opacity = '1';
      if (columnShows() && main.current !== coverLayers[i]) {
        cycleStop();
        setService(i).then(() => { if (alive && service === i && inView) cycleStart(); });
      }
    };
    // Read from where the names are, not from the order callbacks fire, so a
    // jump (anchor link, scroll to top) lights the right one or none.
    const pick = (self) => {
      if (!self.isActive) { light(-1); return; }
      const mid = window.innerHeight / 2;
      const i = items.findIndex((el) => { const r = el.getBoundingClientRect(); return r.top <= mid && r.bottom >= mid; });
      if (i >= 0) light(i); // between two names: the last one stays lit
    };
    const st = ScrollTrigger.create({ trigger: names, start: 'top center', end: 'bottom center', onUpdate: pick, onToggle: pick });
    if (inView && !cycleTw) cycleStart();
    return () => { st.kill(); light(-1); };
  });

  followPause = () => {
    paused = true;
    cycleStop();
    cancelDeal();
    main.layers.forEach(syncVideo);
  };
  undo.push(() => { followPause = null; });

  // Marks the section as driven here (initServicesHover and initVideos skip it).
  root.dataset.followInit = '1';
  undo.push(() => { delete root.dataset.followInit; });
}

/* ─────────────────────────────────────────────
   INIT: HOVER TRAIL  (Services hero, h1[data-hover-trail])
   — Test. While one of the heading's service words is hovered, visuals
     pop out of it one after another (a new one every HOVER_TRAIL.every):
     each rises from just below the word with a bounce and a random tilt,
     holds a beat and is gone. The motion is the heroTrail recipe,
     editable live in the tune panel. The hovered word comes up to full
     opacity.
   — Visuals: the project thumbnails already on the page (the services
     section's hidden Works list), shuffled, in the same formats as the
     services frame (portrait, square or landscape: a thumbnail keeps its
     format in both places). For the CMS step, images inside a
     [data-trail-media] list take over when there are any.
   — Words: each .service-txt-faded (or [data-trail-word]) in the heading.
   — Mouse and trackpad only; nothing under reduced motion. The visuals
     sit in a layer of their own above the page (under the nav), always
     whole on screen sideways. Undone on every re-init and as a page leaves.
───────────────────────────────────────────── */
const HOVER_TRAIL = {
  every:  0.15,  // s between two visuals while a word is hovered
  size:   3.6,   // longest side of a visual, in the heading's font size
  rise:   3,     // rem a visual rises as it pops up
  jitter: 1.5,   // rem, random sideways offset from the middle of the word
  tilt:   5,     // deg, random tilt as it comes in and as it settles
  edge:   1,     // rem kept clear of the sides of the screen
  ahead:  6      // pictures loading ahead of the one showing
};

let trailTeardown = [];
function teardownHoverTrail() {
  trailTeardown.splice(0).reverse().forEach(fn => { try { fn(); } catch (e) {} });
}

function initHoverTrail() {
  teardownHoverTrail();
  const root = document.querySelector('[data-hover-trail]');
  if (!root || reducedMotion) return;
  const words = Array.from(root.querySelectorAll('[data-trail-word], .service-txt-faded'));
  const own   = document.querySelectorAll('[data-trail-media] img');
  const imgs  = own.length ? own : document.querySelectorAll('[data-follow-works] .services-work img');
  const seen  = new Set(), media = [];
  imgs.forEach((img) => {
    const src = img.classList.contains('w-dyn-bind-empty') ? '' : img.getAttribute('src') || '';
    if (!src || seen.has(src)) return;
    seen.add(src);
    media.push({ src, srcset: img.getAttribute('srcset') || '', fixed: followFormat(img.closest('.w-dyn-item') || img, src),
                 get ratio() { return followRatio(this.fixed, this.pic && this.pic.naturalWidth / this.pic.naturalHeight); },
                 pic: null, ready: false, failed: false });
  });
  if (!words.length || !media.length) return;

  const mm = gsap.matchMedia();
  trailTeardown.push(() => mm.revert());
  mm.add('(hover: hover) and (pointer: fine)', () => {
    const CFG = HOVER_TRAIL;
    const R = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const frame = document.querySelector('[data-follow-frame]');
    const radius = (frame && parseFloat(getComputedStyle(frame).borderTopLeftRadius)) || 0.55 * R;
    const rest = words.map(w => getComputedStyle(w).opacity);
    const longest = () => CFG.size * (parseFloat(getComputedStyle(root).fontSize) || 4 * R);

    const layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:50;';
    document.body.appendChild(layer);

    // Each picture loads and decodes once; a visual is a copy of it, so it shows whole at once.
    const load = (m) => {
      if (m.pic) return;
      const pic = m.pic = new Image();
      pic.decoding = 'async';
      pic.alt = '';
      if (m.srcset) { pic.sizes = Math.ceil(longest()) + 'px'; pic.srcset = m.srcset; }
      pic.src = m.src;
      const done = () => { m.ready = pic.naturalWidth > 0; m.failed = !m.ready; };
      (pic.decode ? pic.decode() : Promise.resolve()).then(done, done);
    };

    // A shuffled round. Only the next few pictures load at a time; the first of
    // them that's ready goes next, so one still loading never holds the trail up.
    let deck = [], at = 0, last = null, loop = null, current = null;
    const shuffle = () => {
      deck = gsap.utils.shuffle(media.slice());
      at = 0;
      if (deck.length > 1 && deck[0] === last) deck.push(deck.shift()); // never twice in a row
    };
    const prime = (n) => {
      if (at >= deck.length) shuffle();
      for (let k = at; k < Math.min(deck.length, at + n); k++) load(deck[k]);
    };
    const next = () => {
      if (at >= deck.length) shuffle();
      while (at < deck.length && deck[at].failed) at++; // a picture that won't load drops out
      if (at >= deck.length) {
        if (media.every(m => m.failed)) return null;
        shuffle();
      }
      prime(CFG.ahead);
      for (let k = at; k < Math.min(deck.length, at + CFG.ahead); k++) {
        if (!deck[k].ready) continue;
        [deck[at], deck[k]] = [deck[k], deck[at]];
        return (last = deck[at++]);
      }
      return null;
    };

    const live = new Map(); // visual → its timeline
    const drop = (box) => {
      const tl = live.get(box);
      live.delete(box);
      if (tl) tl.kill();
      box.remove();
    };
    const spawn = (word) => {
      const m = next();
      if (!m) return;
      const L = longest(), [fw, fh] = followFit(m.ratio), w = fw * L, h = fh * L;
      const r = word.getBoundingClientRect(), o = layer.getBoundingClientRect();
      const vw = document.documentElement.clientWidth, edge = CFG.edge * R;
      const x = gsap.utils.clamp(edge + w / 2, Math.max(edge + w / 2, vw - edge - w / 2),
                                 r.left + r.width / 2 + gsap.utils.random(-1, 1) * CFG.jitter * R);
      const box = document.createElement('div');
      const pic = m.pic.cloneNode();
      box.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;overflow:hidden;border-radius:${radius}px;`;
      pic.style.cssText = 'display:block;width:100%;height:100%;max-width:none;object-fit:cover;';
      box.appendChild(pic);
      layer.appendChild(box);
      const tl = runRecipe('heroTrail', gsap.timeline({ onComplete: () => drop(box) }), {
        image: box, x: x - o.left, y: r.top + r.height / 2 - o.top, rise: CFG.rise * R, tilt: CFG.tilt
      });
      live.set(box, tl);
      if (!tl.duration()) drop(box); // a broken recipe leaves nothing behind
    };

    const stop = () => { if (loop) { loop.kill(); loop = null; } current = null; };
    const enter = (word) => {
      stop();
      current = word;
      gsap.to(word, { opacity: 1, duration: 0.2, ease: 'power2.out', overwrite: 'auto' });
      spawn(word);
      loop = gsap.timeline({ repeat: -1 }).call(spawn, [word], CFG.every);
    };
    const leave = (word, k) => {
      if (current === word) stop();
      gsap.to(word, { opacity: rest[k], duration: 0.3, ease: 'power2.out', overwrite: 'auto', clearProps: 'opacity' });
    };

    const ons = words.map((w, k) => [() => enter(w), () => leave(w, k)]);
    words.forEach((w, k) => {
      w.addEventListener('mouseenter', ons[k][0]);
      w.addEventListener('mouseleave', ons[k][1]);
    });
    const onRoot = () => prime(CFG.ahead); // the pointer is on its way to a word
    root.addEventListener('mouseenter', onRoot);
    // A first few ready before anyone hovers.
    const idle = window.requestIdleCallback ? requestIdleCallback(() => prime(3), { timeout: 2000 }) : setTimeout(() => prime(3), 1200);

    return () => {
      if (window.cancelIdleCallback) cancelIdleCallback(idle); else clearTimeout(idle);
      words.forEach((w, k) => {
        w.removeEventListener('mouseenter', ons[k][0]);
        w.removeEventListener('mouseleave', ons[k][1]);
      });
      root.removeEventListener('mouseenter', onRoot);
      stop();
      Array.from(live.keys()).forEach(drop);
      layer.remove();
      gsap.killTweensOf(words);
      gsap.set(words, { clearProps: 'opacity' });
    };
  });
}

/* ─────────────────────────────────────────────
   INIT: AWARDS HOVER  (About page, [data-awards-hover] on the awards list)
   — Hovering the list, the award's badge (its image) comes out at the
     right, where the static one used to show, and floats after the
     pointer up and down the list on a spring. It doesn't follow the
     pointer sideways, it feels its speed: a quick move left or right
     pushes it a little that way and it springs back, leaning with it.
     Moving to another award flips it like a coin onto that award's
     badge: half a turn per row, so a quick run down the list spins it
     and it lands with a small wobble. The hovered row steps right and
     its line draws across; the other rows still fade (site CSS).
   — Badge in and out: awardsBadge recipe. Row step and line: awardsRow
     recipe. Both editable live in the tune panel ("t" on staging).
     Physics and distances in AWARDS_HOVER.
   — Hooks: [data-awards-hover] on the list of .award-item rows, each
     with its .award-img-wrap image (read for the badge, hidden while
     this runs).
   — Mouse and trackpad from 992px only. Reduced motion, touch and
     smaller screens keep the static hover. Undone on every re-init.
───────────────────────────────────────────── */
const AWARDS_HOVER = {
  intent: 0.05,   // s the pointer rests on a row before the badge flips to it
  float:  0.55,   // s, vertical follow: the badge floats after the pointer on a spring
  bounce: 0.3,    // overshoot of that float (0 = settles straight)
  flip:   0.5,    // s, spring time of half a turn (higher = lazier)
  wobble: 0.35,   // overshoot of a flip (0 = lands straight)
  sway:   0.035,  // s: the pointer's sideways speed (px/s) times this = how far it pushes the badge (px)
  drift:  2,      // rem, the most the badge is pushed sideways
  swing:  0.45,   // s, spring time of that push and of the way back
  tilt:   6,      // deg, max lean, from the badge's own speed (mostly sideways)
  nudge:  1       // rem the hovered row steps right
};

let awardsTeardown = [];
function teardownAwardsHover() {
  awardsTeardown.splice(0).reverse().forEach(fn => { try { fn(); } catch (e) {} });
}

function initAwardsHover() {
  teardownAwardsHover();
  const list = document.querySelector('[data-awards-hover]');
  if (!list || reducedMotion) return;
  const rows = Array.from(list.children).filter(el => el.classList.contains('award-item'));
  if (!rows.length || !list.parentElement) return;
  const mm = gsap.matchMedia();
  awardsTeardown.push(() => mm.revert());
  mm.add(FOLLOW_HOVER, () => setupAwardsHover(list, rows));
}

function setupAwardsHover(list, rows) {
  const CFG  = AWARDS_HOVER;
  const host = list.parentElement; // the badge sits beside the list, outside its hover fade
  const undo = [];
  let alive = true;
  const cleanup = () => {
    alive = false;
    undo.splice(0).reverse().forEach(fn => { try { fn(); } catch (e) {} });
  };

  // Each row's own image: read for the badge, hidden (layout kept, to measure) while this runs.
  const pics = rows.map((row) => {
    const wrap = row.querySelector('.award-img-wrap');
    const img  = wrap && wrap.querySelector('img');
    const ok   = img && !img.classList.contains('w-dyn-bind-empty') && img.getAttribute('src');
    if (wrap) wrap.style.visibility = 'hidden';
    return { wrap, src: ok ? img.getAttribute('src') : '', srcset: ok ? img.getAttribute('srcset') || '' : '' };
  });
  undo.push(() => pics.forEach((p) => { if (p.wrap) p.wrap.style.visibility = ''; }));
  const ref = pics.find(p => p.wrap), refStep = pics.indexOf(ref);
  if (!ref || !pics.some(p => p.src)) return cleanup;

  if (getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
    undo.push(() => { host.style.position = ''; });
  }

  // Badge: travels, leans and scales in and out; its card turns (3D) between two faces.
  const badge = document.createElement('div');
  const card  = document.createElement('div');
  badge.setAttribute('aria-hidden', 'true');
  badge.style.cssText = 'position:absolute;left:0;top:0;z-index:3;pointer-events:none;';
  card.style.cssText = 'position:absolute;inset:0;transform-style:preserve-3d;';
  // No background anywhere: the award pictures are cut out, only they show.
  const faces = [0, 1].map((k) => {
    const face = document.createElement('div');
    const img  = document.createElement('img');
    face.style.cssText = 'position:absolute;inset:0;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;'
      + (k ? 'transform:rotateY(180deg);' : '');
    img.alt = '';
    img.decoding = 'async';
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;max-width:none;object-fit:cover;';
    face.appendChild(img);
    card.appendChild(face);
    return { face, img, shown: -1, want: -1 };
  });
  badge.appendChild(card);
  host.appendChild(badge);
  gsap.set(badge, { visibility: 'hidden', opacity: 0, scale: 0.6, transformOrigin: '50% 50%' });
  gsap.set(card, { transformPerspective: 1000, rotationY: 0 });
  undo.push(() => { gsap.killTweensOf([badge, card]); badge.remove(); });

  // A line per row, drawn over its own border on hover.
  const lines = rows.map((row) => {
    const line = document.createElement('div');
    line.setAttribute('aria-hidden', 'true');
    line.style.cssText = 'position:absolute;left:0;right:0;pointer-events:none;background-color:currentColor;';
    line.dataset.origin = '0% 50%';
    row.appendChild(line);
    gsap.set(line, { scaleX: 0, transformOrigin: '0% 50%' });
    return line;
  });
  const steps = rows.map(row => row.querySelector('.award-grid') || row);
  undo.push(() => {
    lines.forEach(l => { gsap.killTweensOf(l); l.remove(); });
    gsap.killTweensOf(steps);
    gsap.set(steps, { clearProps: 'transform' });
  });

  /* ── pictures ── */
  let size = 0;
  const setPic = (f, i) => {
    const p = pics[i];
    if (!p || !p.src || f.shown === i) return;
    f.shown = i;
    if (p.srcset) { f.img.sizes = Math.ceil(size) + 'px'; f.img.srcset = p.srcset; } else f.img.removeAttribute('srcset');
    f.img.src = p.src;
  };
  // Every badge decoded before the first hover, as the list nears the screen.
  const warm = () => {
    const seen = new Set();
    pics.forEach((p) => {
      if (!p.src || seen.has(p.src)) return;
      seen.add(p.src);
      const im = new Image();
      im.decoding = 'async';
      if (p.srcset) { im.sizes = Math.ceil(size) + 'px'; im.srcset = p.srcset; }
      im.src = p.src;
      if (im.decode) im.decode().catch(() => {});
    });
  };

  /* ── geometry ── */
  let R = 16, railX = 0, H = 0, centers = [], lineH = 1;
  const measure = () => {
    R = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const hr = host.getBoundingClientRect(), r = ref.wrap.getBoundingClientRect();
    size = r.width || 18 * R;
    H = r.height || size;
    railX = r.left - hr.left - (+gsap.getProperty(steps[refStep], 'x') || 0); // without that row's nudge
    centers = rows.map((row) => { const b = row.getBoundingClientRect(); return b.top - hr.top + b.height / 2; });
    badge.style.width = size + 'px';
    badge.style.height = H + 'px';
    const radius = getComputedStyle(ref.wrap).borderTopLeftRadius;
    faces.forEach((f) => { f.face.style.borderRadius = radius; });
    lineH = parseFloat(getComputedStyle(rows[0]).borderBottomWidth) || 1;
    lines.forEach((l) => { l.style.height = lineH + 'px'; l.style.bottom = -lineH + 'px'; });
  };

  /* ── springs ── */
  const fy = { p: 0, v: 0, t: 0 };     // badge top (px in the host)
  const fx = { p: 0, v: 0, t: 0 };     // badge left: its rail, plus the push from the pointer's speed
  const fr = { p: 0, pv: 0 };          // lean (deg)
  const turn = { p: 0, v: 0, t: 0 };   // card turn (deg), half a turn per row
  let px = 0, py = 0, over = false, on = false, leaving = false, aimDirty = false, ticking = false;
  let lastPx = null, speed = 0;        // the pointer's sideways speed (px/s), smoothed
  const rowY = (i) => centers[i] - H / 2;
  const aim = () => {
    const hr = host.getBoundingClientRect();
    fy.t = gsap.utils.clamp(centers[0], centers[centers.length - 1], py - hr.top) - H / 2;
  };
  const reaim = () => { if (!over) return; aimDirty = true; wake(); };

  // The face turned away takes the badge it must show when it comes round.
  const syncFaces = () => {
    const c = Math.cos(turn.p * Math.PI / 180);
    faces.forEach((f, k) => {
      const away = k === 0 ? c <= 0.02 : c >= -0.02;
      if (away && f.want >= 0 && f.shown !== f.want) setPic(f, f.want);
    });
  };

  function wake() {
    if (ticking || !alive) return;
    ticking = true;
    gsap.ticker.add(tick);
  }
  undo.push(() => { gsap.ticker.remove(tick); ticking = false; });
  function tick(time, deltaMS) {
    if (!alive) return;
    const dt = Math.min(Math.max(deltaMS || 16.7, 1), 64) / 1000;
    if (aimDirty) { aimDirty = false; aim(); }
    // Sideways it feels the pointer's speed, not its position: a quick move
    // pushes it that way, and it swings back to its rail once the pointer slows.
    const raw = over && lastPx !== null ? (px - lastPx) / dt : 0;
    lastPx = over ? px : null;
    speed += (raw - speed) * Math.min(1, dt / 0.06);
    if (!over && Math.abs(speed) < 1) speed = 0;
    fx.t = railX + gsap.utils.clamp(-CFG.drift * R, CFG.drift * R, speed * CFG.sway);
    const a = followFloat(fy, CFG.float, CFG.bounce, dt);
    const b = followFloat(fx, CFG.swing, CFG.bounce, dt);
    const c = followSpring(fr, 'p', gsap.utils.clamp(-CFG.tilt, CFG.tilt, fx.v * 0.012 + fy.v * 0.002), 0.12, dt);
    const d = followFloat(turn, CFG.flip, CFG.wobble, dt);
    gsap.set(badge, { x: fx.p, y: fy.p, rotation: fr.p });
    gsap.set(card, { rotationY: turn.p });
    syncFaces();
    if (Math.abs(speed) < 1 && !a && !b && !c && !d) { speed = 0; ticking = false; gsap.ticker.remove(tick); }
  }

  /* ── badge in and out ── */
  let badgeTl = null, dir = 1, current = -1, shownRow = -1;
  const badgeMove = (show) => {
    if (badgeTl) { badgeTl.kill(); badgeTl = null; }
    if (show) gsap.set(badge, { visibility: 'visible' });
    const tl = runRecipe('awardsBadge', gsap.timeline(), { badge, show });
    const done = () => { badgeTl = null; if (!show) { gsap.set(badge, { visibility: 'hidden' }); on = false; } };
    if (tl.duration()) { badgeTl = tl; tl.eventCallback('onComplete', done); }
    else { tl.kill(); gsap.set(badge, { opacity: show ? 1 : 0, scale: show ? 1 : 0.6 }); done(); }
  };
  // Half a turn toward the next row (the way the pointer went); the face
  // that comes round shows its badge.
  const flipTo = (i) => {
    if (i === shownRow || !pics[i].src) return;
    shownRow = i;
    turn.t += 180 * dir;
    const k = ((Math.round(turn.t / 180) % 2) + 2) % 2;
    faces[k].want = i;
    wake();
  };
  // Tossed in at the row: half a turn onto its badge, both faces on it so
  // no other shows. Caught on its way out, it simply turns to the row's badge.
  const show = (i) => {
    const fresh = !on;
    on = true;
    leaving = false;
    if (fresh) {
      shownRow = i;
      faces.forEach((f) => { f.want = i; setPic(f, i); });
      turn.t = Math.round(turn.t / 180) * 180;
      turn.p = turn.t - 180 * dir;
      turn.v = 0;
      fy.p = fy.t = rowY(i);
      fy.v = 0;
      aim();
      fx.p = fx.t = railX;
      fx.v = fr.p = fr.pv = speed = 0;
      lastPx = null;
      gsap.set(badge, { scale: 0.6, opacity: 0 });
    } else {
      flipTo(i);
    }
    badgeMove(true);
    wake();
  };
  const hide = () => {
    leaving = true;
    turn.t += 180 * dir; // spins away as it goes, on the award it was showing
    if (shownRow >= 0) faces[((Math.round(turn.t / 180) % 2) + 2) % 2].want = shownRow;
    shownRow = -1;
    badgeMove(false);
    wake();
  };

  /* ── rows ── */
  const rowTls = rows.map(() => null);
  const rowMove = (i, show) => {
    if (i < 0) return;
    if (rowTls[i]) rowTls[i].kill();
    // The line grows from the left and leaves to the right, from wherever it is, never jumping.
    const line = lines[i], sx = gsap.getProperty(line, 'scaleX');
    if (show && sx < 0.01) line.dataset.origin = '0% 50%';
    if (!show && sx > 0.99) line.dataset.origin = '100% 50%';
    const tl = runRecipe('awardsRow', gsap.timeline(), {
      row: steps[i], line, show, nudge: CFG.nudge * R, origin: line.dataset.origin
    });
    if (tl.duration()) rowTls[i] = tl;
    else { tl.kill(); gsap.set(steps[i], { x: show ? CFG.nudge * R : 0 }); gsap.set(line, { scaleX: show ? 1 : 0 }); }
  };
  undo.push(() => rowTls.forEach(tl => tl && tl.kill()));

  let intent = null;
  const enterRow = (i) => {
    if (i === current) return;
    if (current >= 0) dir = i > current ? 1 : -1;
    rowMove(current, false);
    rowMove(i, true);
    current = i;
    if (intent) { intent.kill(); intent = null; }
    if (!on || leaving) { show(i); return; }
    // The badge flips once the pointer rests on a row, so a sweep reads as one spin.
    intent = gsap.delayedCall(CFG.intent, () => { intent = null; flipTo(i); });
  };
  const leaveList = () => {
    over = false;
    if (intent) { intent.kill(); intent = null; }
    rowMove(current, false);
    current = -1;
    if (on) hide();
  };
  undo.push(() => { if (intent) intent.kill(); });

  const enters = rows.map((row, i) => {
    const fn = (e) => { px = e.clientX; py = e.clientY; over = true; enterRow(i); };
    row.addEventListener('mouseenter', fn);
    return fn;
  });
  const onMove = (e) => { px = e.clientX; py = e.clientY; reaim(); };
  list.addEventListener('mouseleave', leaveList);
  window.addEventListener('mousemove', onMove, { passive: true });
  window.addEventListener('scroll', reaim, { passive: true });
  undo.push(() => {
    rows.forEach((row, i) => row.removeEventListener('mouseenter', enters[i]));
    list.removeEventListener('mouseleave', leaveList);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('scroll', reaim);
  });

  measure();
  const onRefresh = () => { measure(); reaim(); };
  ScrollTrigger.addEventListener('refresh', onRefresh);
  undo.push(() => ScrollTrigger.removeEventListener('refresh', onRefresh));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (alive) onRefresh(); });
  const near = new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting)) return;
    near.disconnect();
    warm();
  }, { rootMargin: '100% 0px' });
  near.observe(list);
  undo.push(() => near.disconnect());

  list.dataset.awardsInit = '1';
  undo.push(() => { delete list.dataset.awardsInit; });
  return cleanup;
}

/* ─────────────────────────────────────────────
   INIT: MARQUEES AND CAROUSELS  (.swiper[data-marquee]: Home, Services hero, About)
   — Every .swiper with a data-marquee attribute runs on this engine
     instead of Swiper:
       data-marquee="true"   drifts on its own; scrolling the page pushes
                             it along a little (down = faster forward,
                             up = back) and it eases back into its drift.
       data-marquee="false"  holds still until it's moved.
     data-loop="false" keeps a still one to its slides, the first at the
     left to the last at the right; otherwise it wraps round endlessly.
     data-centered="true" starts a still one with its first slide in the
     middle (a drifting one starts at the left). data-start="center"
     starts any strip, drifting or not, with the slide linking to the
     page being read (else the first) in the middle: Services template.
     data-reverse="true" drifts the other way.
   — Drag it and it follows softly, a little further than the pointer
     (after mwg_effect088); a sideways trackpad swipe or shift + wheel
     moves it too. A drifting one keeps going under the pointer
     (MARQUEE.hover sets that); keyboard focus inside stops it, with the
     focused slide brought into view.
   — A slide coming into view flies in from further out on its side and
     grows into place (after mwg_effect088): marqueeIn recipe, tune panel
     ("t" on staging). The faster the strip moves, the more of it shows;
     at the calm drift it happens just out of sight.
   — Image slides (.img-slider-wrap) take mixed formats at one height:
     portrait 4:5, square, landscape 3:2. Random for now (kept for the
     visit), or data-format on the slide ("portrait", "square",
     "landscape" or "16:9") for the CMS step. data-format="css" (the
     Slide / Media component) is left to Webflow: its Ratio variant
     sizes it in CSS (Vertical 4:5, Square, Landscape 16:9, one height).
     Other slides (logos, news, testimonials) keep their shape.
   — Endless: each slide wraps round to the other end out of sight, with
     copies (hidden from screen readers and the keyboard) when there
     aren't enough slides to fill the strip. Out of sight means outside
     what can show: the strip's clip (.swiper-contain), or the screen for
     one that runs edge to edge. A strip only runs near the screen, its
     pictures load as it comes near, and a video in a slide plays only
     while that slide is near.
   — Reduced motion: no drift, no push, no fly-in; drag and sideways
     scroll still move it. The incoming page's strips start during the
     page transition, so nothing jumps when it lands; a strip is undone
     once its page has left. Every other .swiper stays on Swiper, which
     only loads where one is left. Speeds in MARQUEE.
───────────────────────────────────────────── */
const MARQUEE = {
  speed:    4,     // rem/s, the drift
  hover:    1,     // share of the drift kept under the pointer (1 = keeps going, 0 = glides to a stop)
  drag:     1.4,   // px the strip moves per px dragged
  follow:   0.12,  // s, how softly the strip catches up with a drag or a sideways scroll
  boost:    0.25,  // share of the page's scroll speed that pushes the strip (0 = scrolling doesn't move it)
  boostMax: 40,    // rem/s, the most scrolling adds
  release:  0.5,   // s for the strip to let go of a push once the page stops
  catchUp:  0.25   // s for the strip to pick up (or drop) its drift, or a push
};

let marquees = []; // live strips: { el, off, resync }
// The page's scroll, sampled once per scroll event for every strip: read in
// each strip's tick, after other strips had written, it forced a style recalc.
let marqueeScrollY = window.scrollY;
window.addEventListener('scroll', () => { marqueeScrollY = window.scrollY; }, { passive: true });

// scope: the document, or the incoming page during a transition.
function initMarquees(scope) {
  // Strips whose page has left are undone; the others carry on and forget
  // the scroll jump of a page change.
  marquees = marquees.filter((m) => {
    if (m.el.isConnected) { m.resync(); return true; }
    m.off();
    return false;
  });
  (scope || document).querySelectorAll('.swiper[data-marquee]').forEach((el) => {
    if (el.hasAttribute('data-marquee-init')) return;
    const undo = [];
    const off = () => undo.splice(0).reverse().forEach(fn => { try { fn(); } catch (e) {} });
    try {
      const strip = setupMarquee(el, undo);
      if (strip) marquees.push({ el, off, resync: strip.resync });
      else off();
    } catch (e) { off(); console.error('[marquee]', e); } // left as it was: Swiper takes it
  });
}

function setupMarquee(el, undo) {
  const CFG       = MARQUEE;
  const container = el.querySelector('.swiper-container');
  const wrapper   = container && container.querySelector('.swiper-wrapper');
  const originals = wrapper ? Array.from(wrapper.children).filter(s => s.classList.contains('swiper-slide')) : [];
  if (!originals.length) return null;
  const auto     = el.getAttribute('data-marquee') !== 'false';       // drifts on its own
  const loop     = auto || el.getAttribute('data-loop') !== 'false';   // wraps round (a drifting one always does)
  // data-start="center": starts with the slide of the page being read (or the first) in the middle, drifting or not.
  const startMid = el.getAttribute('data-start') === 'center';
  const centered = startMid || (!auto && el.getAttribute('data-centered') === 'true');
  const dirSign  = el.getAttribute('data-reverse') === 'true' ? 1 : -1; // -1 drifts left, as the Swiper marquee did
  let alive = true;
  undo.push(() => { alive = false; });

  // Image slides: a format each, at one height.
  const fmt = originals.map((s, i) => {
    // data-format="css" (Slide / Media component): its size comes from Webflow (the Ratio variant), never from here.
    if ((s.getAttribute('data-format') || '').trim().toLowerCase() === 'css') return null;
    const wrap = s.querySelector('.img-slider-wrap');
    if (!wrap) return null;
    const shown = wrap.querySelector('img:not(.w-condition-invisible), video:not(.w-condition-invisible)');
    const key = shown ? shown.getAttribute('src') || shown.getAttribute('data-source') : '';
    const imgs = Array.from(wrap.querySelectorAll('img[srcset]'));
    return { wrap, imgs, sizes: imgs.map(img => img.getAttribute('sizes')), ratio: followFormat(s, 'marquee:' + (key || i), true) };
  });

  /* ── layout: sizes, copies, positions ── */
  let slides = [], setW = 0, L = 0, maxW = 0, W = 0, R = 16, lastW = -1, near = false, vidsOn = false;
  let vL = 0, vR = 0; // what can show, from the container's left: its clip, or the screen edge to edge
  let minX = 0;       // a strip kept to its slides goes from 0 (first slide at the left) to minX
  let x = 0, xT = 0, started = false; // where the strip is, and where it's heading (it follows softly)
  const clamp = gsap.utils.clamp;
  // An element's left on the page from layout alone (so it holds mid-transition, under transforms).
  const pageLeft = (n) => { let p = 0; for (; n; n = n.offsetParent) p += n.offsetLeft; return p; };
  const measureView = () => {
    const cl = pageLeft(container);
    let l = 0, r = document.documentElement.clientWidth;
    for (let a = container.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).overflowX === 'visible') continue;
      const al = pageLeft(a);
      l = Math.max(l, al);
      r = Math.min(r, al + a.clientWidth);
      break;
    }
    vL = l - cl;
    vR = r - cl;
    if (!(vR > vL)) { vL = 0; vR = W; }
  };
  const clones = [];
  const restore = () => originals.forEach((s, i) => {
    const f = fmt[i];
    if (!f) return;
    s.style.width = '';
    f.wrap.style.paddingBottom = '';
    f.imgs.forEach((img, k) => (f.sizes[k] === null ? img.removeAttribute('sizes') : img.setAttribute('sizes', f.sizes[k])));
  });
  undo.push(() => { clones.splice(0).forEach(c => c.remove()); restore(); });
  const addSet = () => originals.forEach((s) => {
    const c = s.cloneNode(true);
    c.setAttribute('aria-hidden', 'true');
    c.classList.add('swiper-slide-duplicate');
    c.removeAttribute('id');
    c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    c.querySelectorAll('a, button, input, select, textarea, [tabindex]').forEach(n => n.setAttribute('tabindex', '-1'));
    c.querySelectorAll('video[data-vloaded]').forEach((vd) => { vd.removeAttribute('data-vloaded'); vd.removeAttribute('src'); vd.style.opacity = ''; });
    wrapper.appendChild(c);
    clones.push(c);
  });
  // Pictures off to the side never load on their own (they sit outside the visible strip).
  const eager = () => wrapper.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
  // A slide's content back in its place (no fly-in running).
  const land = (s) => { if (s.tl) { s.tl.revert(); s.tl = null; } };
  const layout = () => {
    slides.forEach((s) => { land(s); if (s.near) playVideos(s, false); });
    clones.splice(0).forEach(c => c.remove());
    restore();
    slides = [];
    setW = L = 0;
    R = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    W = lastW = container.clientWidth;
    if (!W) return; // hidden for now: waits for a size
    measureView();
    const ref = fmt.find(Boolean);
    const H = ref ? ref.wrap.offsetHeight : 0;
    if (H) originals.forEach((s, i) => {
      const f = fmt[i];
      if (!f) return;
      const w = H * f.ratio;
      s.style.width = w.toFixed(2) + 'px';
      f.wrap.style.paddingBottom = (100 / f.ratio).toFixed(4) + '%';
      f.imgs.forEach(img => img.setAttribute('sizes', Math.ceil(w) + 'px'));
    });
    const x0 = originals[0].offsetLeft;
    if (loop) {
      addSet(); // one set of copies, to measure a lap
      setW = clones[0].offsetLeft - x0;
      if (!(setW > 0)) { clones.splice(0).forEach(c => c.remove()); setW = 0; return; }
      // Enough sets that every slide wraps round out of sight, a slide's width past each end.
      maxW = Math.max(...originals.map(s => s.offsetWidth));
      const sets = Math.max(1, Math.ceil((vR - vL + 2 * maxW) / setW));
      if (sets === 1) clones.splice(0).forEach(c => c.remove());
      for (let k = sets - 1; k > 1; k--) addSet();
      L = setW * sets;
    } else {
      const last = originals[originals.length - 1];
      L = last.offsetLeft - x0 + last.offsetWidth; // its slides end to end
      minX = Math.min(0, W - L);
    }
    // seen: in view (null until the first look, so what shows from the start doesn't fly in)
    slides = originals.concat(clones).map(s => ({ el: s, item: s.firstElementChild || s, left: s.offsetLeft - x0, w: s.offsetWidth, tf: null, vids: null, near: false, seen: null, tl: null }));
    if (!started) {
      started = true;
      const here = startMid ? originals.findIndex(o => Array.from(o.querySelectorAll('a[href]')).some(a => navPath(a.pathname) === navPath(location.pathname))) : -1;
      const mid = slides[Math.max(0, here)];
      x = xT = centered ? (W - mid.w) / 2 - mid.left : 0;
    }
    if (!loop) { x = clamp(minX, 0, x); xT = clamp(minX, 0, xT); }
    if (near) eager();
    render();
  };
  undo.push(() => {
    slides.forEach(land);
    originals.forEach((s) => { s.style.transform = ''; });
  });

  /* ── videos: only the slides near the screen play ── */
  const MEDIA = /\.(mp4|webm|ogv|mov|m4v)(\?.*)?$/i;
  const playVideos = (s, on) => {
    if (!s.vids) s.vids = Array.from(s.el.querySelectorAll('video')).filter(vd => MEDIA.test(vd.getAttribute('data-source') || ''));
    s.vids.forEach((vd) => {
      if (!on) { try { vd.pause(); } catch (e) {} return; }
      if (vd.dataset.vloaded !== '1') {
        vd.dataset.vloaded = '1';
        vd.muted = true; vd.loop = true; vd.playsInline = true; vd.preload = 'auto';
        vd.removeAttribute('autoplay');
        gsap.set(vd, { opacity: 0 });
        vd.addEventListener('playing', () => gsap.to(vd, { opacity: 1, duration: 0.6, ease: 'power2.out', overwrite: true }), { once: true });
        vd.src = vd.getAttribute('data-source');
        vd.load();
      }
      playVideo(vd, (x) => gsap.to(x, { opacity: 1, duration: 0.6, ease: 'power2.out', overwrite: true }));
    });
  };
  undo.push(() => slides.forEach(s => s.vids && s.vids.forEach((vd) => { try { vd.pause(); } catch (e) {} })));

  // Where a slide sits: one that loops wraps round to the other end out of sight.
  const place = (s, at) => (loop ? ((s.left + at - vL + maxW) % L + L) % L + vL - maxW : s.left + at);
  function render() {
    if (!L) return;
    if (loop) {
      const lap = Math.floor(x / L) * L; // both kept within one lap
      if (lap) { x -= lap; xT -= lap; }
    }
    const reach = (vR - vL) / 2, mid = vL + reach;
    slides.forEach((s) => {
      const sx = place(s, x);
      const tf = `translate3d(${(sx - s.left).toFixed(2)}px,0,0)`;
      if (tf !== s.tf) { s.el.style.transform = tf; s.tf = tf; }
      const isNear = vidsOn && sx < vR + reach && sx + s.w > vL - reach;
      if (isNear !== s.near) { s.near = isNear; playVideos(s, isNear); }
      const seen = sx < vR && sx + s.w > vL;
      if (seen === s.seen) return;
      const first = s.seen === null;
      s.seen = seen;
      if (first) return;
      if (!seen) return land(s); // off the strip: back in its place
      if (s.tl) s.tl.kill();
      s.tl = runRecipe('marqueeIn', gsap.timeline(), { item: s.item, side: sx + s.w / 2 > mid ? 1 : -1, rem: R });
    });
  }
  layout();

  /* ── motion ── */
  let v = 0, push = 0, inView = false, over = false, focused = false, ticking = false, drag = null;
  let scrollV = 0, lastScroll = window.scrollY;
  function wake() {
    if (ticking || !alive) return;
    ticking = true;
    lastScroll = marqueeScrollY;
    gsap.ticker.add(tick);
  }
  const sleep = () => { ticking = false; gsap.ticker.remove(tick); };
  undo.push(sleep);

  function tick(time, deltaMS) {
    if (!alive) return;
    const dt = Math.min(Math.max(deltaMS || 16.7, 1), 64) / 1000;
    const sy = marqueeScrollY, ds = sy - lastScroll;
    lastScroll = sy;
    // The page's scroll speed (a jump, like a page change, is not a push).
    scrollV += ((Math.abs(ds) < window.innerHeight ? ds / dt : 0) - scrollV) * Math.min(1, dt / 0.1);
    // The push from the page's scroll comes in quick and lets go a little slower.
    const pushTo = reducedMotion || !auto ? 0 : dirSign * clamp(-CFG.boostMax * R, CFG.boostMax * R, scrollV * CFG.boost);
    push = pushTo + (push - pushTo) * Math.exp(-dt / (Math.abs(pushTo) > Math.abs(push) ? CFG.catchUp : CFG.release));
    if (!drag) {
      // Its own drift (none with keyboard focus inside), picked up and dropped softly, plus the push.
      const drift = auto ? dirSign * CFG.speed * R * (reducedMotion || focused ? 0 : over ? CFG.hover : 1) : 0;
      v = drift + (v - drift) * Math.exp(-dt / CFG.catchUp);
      const step = (v + push) * dt;
      x += step;
      xT += step;
    }
    // What the hand does (a drag, a sideways scroll, a focused slide) it catches up with softly.
    if (!loop) xT = clamp(minX, 0, xT);
    x = xT + (x - xT) * Math.exp(-dt / CFG.follow);
    render();
    // Rests off screen, or once stopped (a still one, keyboard focus, reduced motion, the pointer with hover at 0) with nothing left to settle.
    const still = !drag && Math.abs(xT - x) < 0.5 && (!auto || (Math.abs(v) < 0.5 && Math.abs(push) < 0.5
      && Math.abs(scrollV) < 1 && (reducedMotion || focused || (over && !CFG.hover))));
    if (!inView || still) sleep();
  }

  /* ── drag ── */
  const keep = { touch: container.style.touchAction, cursor: container.style.cursor, select: container.style.userSelect, wselect: container.style.webkitUserSelect };
  container.style.touchAction = 'pan-y pinch-zoom'; // vertical swipes still scroll the page, pinch still zooms
  container.style.cursor = 'grab';
  undo.push(() => { container.style.touchAction = keep.touch; container.style.cursor = keep.cursor; container.style.userSelect = keep.select; container.style.webkitUserSelect = keep.wselect; });
  const blockClick = (e) => { e.preventDefault(); e.stopPropagation(); };
  const onDown = (e) => {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { id: e.pointerId, x0: e.clientX, last: e.clientX, moved: false };
    v = 0; // caught: its drift picks up again once let go
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    wake();
  };
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) return onUp(e); // released outside the window
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x0) < 5) return;
      drag.moved = true;
      container.style.cursor = 'grabbing';
      container.style.userSelect = container.style.webkitUserSelect = 'none';
    }
    xT += (e.clientX - drag.last) * CFG.drag;
    if (!loop) xT = clamp(minX, 0, xT);
    drag.last = e.clientX;
  };
  const endDrag = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    container.style.cursor = 'grab';
    container.style.userSelect = keep.select;
    container.style.webkitUserSelect = keep.wselect;
    drag = null;
  };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    endDrag();
    if (!moved) return;
    // The click that ends a drag doesn't follow a link.
    container.addEventListener('click', blockClick, { capture: true, once: true });
    setTimeout(() => container.removeEventListener('click', blockClick, { capture: true }), 0);
    wake();
  };
  const noNativeDrag = (e) => e.preventDefault();
  container.addEventListener('pointerdown', onDown);
  container.addEventListener('dragstart', noNativeDrag);
  undo.push(() => {
    if (drag) endDrag();
    container.removeEventListener('pointerdown', onDown);
    container.removeEventListener('dragstart', noNativeDrag);
    container.removeEventListener('click', blockClick, { capture: true });
  });

  /* ── sideways wheel and trackpad (Lenis leaves these to the strip) ── */
  const onWheel = (e) => {
    let dx = e.deltaX;
    if (e.shiftKey && Math.abs(e.deltaY) > Math.abs(dx)) dx = e.deltaY;
    else if (Math.abs(dx) <= Math.abs(e.deltaY)) return; // up and down: the page scrolls
    // A sideways swipe over a strip is the strip's, even at its end: passed on,
    // the browser would take it as Back / Forward (two-finger swipe on a Mac).
    e.preventDefault();
    let to = xT - dx * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? W : 1);
    if (!loop) to = clamp(minX, 0, to);
    if (to === xT) return; // at its end
    xT = to;
    wake();
  };
  container.addEventListener('wheel', onWheel, { passive: false });
  undo.push(() => container.removeEventListener('wheel', onWheel));

  /* ── pointer over, keyboard focus, arrows, scroll ── */
  const onOver = (e) => { if (e.pointerType === 'mouse') { over = true; wake(); } };
  const onOut = (e) => { if (e.pointerType === 'mouse') { over = false; wake(); } };
  // Keyboard focus only: the focus a click leaves on a link doesn't stop it.
  const byKeyboard = (t) => { try { return t.matches(':focus-visible'); } catch (e) { return true; } };
  const onFocusIn = (e) => {
    focused = byKeyboard(e.target);
    const s = focused && slides.find(q => q.el.contains(e.target)); // brought fully on screen
    if (s) {
      const sx = place(s, xT), l = Math.max(vL, 0), r = Math.min(vR, W);
      xT += sx < l ? l - sx : sx + s.w > r ? r - sx - s.w : 0;
      if (!loop) xT = clamp(minX, 0, xT);
    }
    wake();
  };
  const onFocusOut = (e) => { if (!container.contains(e.relatedTarget)) focused = false; wake(); };
  // Arrows, where shown: about one slide.
  const nudge = (d) => () => {
    xT += d * ((loop ? setW : L) / originals.length);
    if (!loop) xT = clamp(minX, 0, xT);
    wake();
  };
  const next = el.querySelector('.is-next'), prev = el.querySelector('.is-prev');
  const onNext = nudge(dirSign), onPrev = nudge(-dirSign);
  const onScroll = () => { if (inView) wake(); };
  container.addEventListener('pointerenter', onOver);
  container.addEventListener('pointerleave', onOut);
  container.addEventListener('focusin', onFocusIn);
  container.addEventListener('focusout', onFocusOut);
  if (next) next.addEventListener('click', onNext);
  if (prev) prev.addEventListener('click', onPrev);
  if (auto) window.addEventListener('scroll', onScroll, { passive: true }); // the push
  undo.push(() => {
    container.removeEventListener('pointerenter', onOver);
    container.removeEventListener('pointerleave', onOut);
    container.removeEventListener('focusin', onFocusIn);
    container.removeEventListener('focusout', onFocusOut);
    if (next) next.removeEventListener('click', onNext);
    if (prev) prev.removeEventListener('click', onPrev);
    window.removeEventListener('scroll', onScroll);
  });

  /* ── on screen, resize ── */
  const io = new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    if (!inView) return;
    if (!near) { near = true; eager(); }
    if (!ticking) { v = push = scrollV = 0; } // back from rest: picks up its drift again
    wake();
  }, { rootMargin: '50% 0px' });
  io.observe(el);
  undo.push(() => io.disconnect());
  // Videos: only while the strip is within a screen of the viewport (up or down).
  const vio = new IntersectionObserver((entries) => {
    vidsOn = entries[entries.length - 1].isIntersecting;
    if (vidsOn) render();
    else slides.forEach((s) => { if (s.near) { s.near = false; playVideos(s, false); } });
  }, { rootMargin: '100% 0px' });
  vio.observe(el);
  undo.push(() => vio.disconnect());
  let raf = 0;
  const ro = new ResizeObserver(() => {
    if (container.clientWidth === lastW) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { if (alive) layout(); });
  });
  ro.observe(container);
  undo.push(() => { ro.disconnect(); cancelAnimationFrame(raf); });

  el.dataset.marqueeInit = '1';
  undo.push(() => { delete el.dataset.marqueeInit; });
  return {
    // After a page change: forget the scroll jump, and check what can show (it was measured mid-transition).
    resync: () => {
      lastScroll = marqueeScrollY = window.scrollY;
      scrollV = 0;
      const span = vR - vL;
      measureView();
      if (Math.abs(vR - vL - span) > 1) layout(); else render();
    }
  };
}

/* ─────────────────────────────────────────────
   INIT: INDUSTRY FLIP  (Services page, the .industry-list pills)
   — Hovering a pill rolls it over like a cube onto its yellow side (its
     hover colour), from the side the pointer came in, with a little
     overshoot. Leaving, it rolls on the way the pointer went, back to
     its own colour (or straight back if the roll hadn't landed yet).
     Keyboard focus does the same.
   — Motion: industryFlip recipe (tune panel, "t" on staging). The two
     sides copy the pill (its colour, radius, padding and text, read from
     the page); the colour it rolls onto is INDUSTRY_FLIP.color.
   — Mouse and trackpad only; touch and reduced motion keep the CSS
     hover. Undone on every re-init.
───────────────────────────────────────────── */
const INDUSTRY_FLIP = {
  color: 'var(--swatch--yellow)', // the side it rolls onto (the CSS hover colour)
  depth: 900                      // px of perspective (lower = deeper roll)
};

let industryTeardown = [];
function teardownIndustryFlip() {
  industryTeardown.splice(0).reverse().forEach(fn => { try { fn(); } catch (e) {} });
}

function initIndustryFlip() {
  teardownIndustryFlip();
  const pills = Array.from(document.querySelectorAll('.industry-list .industry-item'));
  if (!pills.length || reducedMotion) return;
  const mm = gsap.matchMedia();
  industryTeardown.push(() => mm.revert());
  mm.add('(hover: hover) and (pointer: fine)', () => {
    // The pills' own colour, read off one the pointer isn't on (that one would answer yellow).
    const ref = pills.find(p => !p.matches(':hover')) || pills[0];
    const base = getComputedStyle(ref).backgroundColor;
    const offs = pills.map(p => setupIndustryFlip(p, base)).filter(Boolean);
    return () => offs.reverse().forEach(fn => { try { fn(); } catch (e) {} });
  });
}

function setupIndustryFlip(pill, base) {
  const txt = pill.querySelector('.industry-txt');
  if (!txt) return null;
  const undo = [];
  const keep = { bg: pill.style.backgroundColor, pos: pill.style.position, z: pill.style.zIndex, op: txt.style.opacity };
  const box = document.createElement('span');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;transform-style:preserve-3d;';
  const side = (bg) => {
    const f = document.createElement('span');
    f.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:block;box-sizing:border-box;'
      + `background-color:${bg};backface-visibility:hidden;-webkit-backface-visibility:hidden;`;
    f.appendChild(txt.cloneNode(true));
    box.appendChild(f);
    return f;
  };
  const own = side(base), lit = side(INDUSTRY_FLIP.color);
  // The pill's look moves onto the cube: its background goes, its text stays (for screen readers).
  if (getComputedStyle(pill).position === 'static') pill.style.position = 'relative';
  pill.style.backgroundColor = 'transparent';
  txt.style.opacity = '0';
  pill.appendChild(box);
  undo.push(() => {
    box.remove();
    pill.style.backgroundColor = keep.bg;
    pill.style.position = keep.pos;
    pill.style.zIndex = keep.z;
    txt.style.opacity = keep.op;
  });

  // A cube as tall as the pill: the side showing faces the page, the other waits
  // on the side it rolls in from. The side showing at angle A sits at slot -A.
  let h = 0;
  const slot = (f, deg) => { f.dataset.slot = deg; f.style.transform = `rotateX(${deg}deg) translateZ(${(h / 2).toFixed(2)}px)`; };
  const measure = () => {
    const cs = getComputedStyle(pill);
    h = pill.offsetHeight;
    [own, lit].forEach((f) => {
      f.style.padding = `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`;
      f.style.borderRadius = cs.borderTopLeftRadius;
      slot(f, +f.dataset.slot || 0);
    });
    gsap.set(box, { transformPerspective: INDUSTRY_FLIP.depth, z: -h / 2 });
  };
  own.dataset.slot = 0;
  lit.dataset.slot = -90;
  measure();
  const ro = new ResizeObserver(measure);
  ro.observe(pill);
  undo.push(() => ro.disconnect());

  // st.to: the angle it's heading for; st.from: the one before.
  const st = { to: 0, from: 0, lit: false };
  let tl = null;
  const roll = (show, dir) => {
    if (show === st.lit) return;
    st.lit = show;
    if (Math.abs(gsap.getProperty(box, 'rotationX') - st.to) < 1) {
      st.from = st.to;
      st.to += 90 * dir;
      slot(show ? lit : own, -st.to);
    } else {
      [st.from, st.to] = [st.to, st.from]; // cut short: straight back
    }
    if (tl) tl.kill();
    pill.style.zIndex = '1'; // over its neighbours while the cube turns
    const done = () => { if (!st.lit) pill.style.zIndex = keep.z; };
    tl = runRecipe('industryFlip', gsap.timeline({ onComplete: done }), { box, to: st.to, show });
    if (!tl.duration()) { tl.kill(); tl = null; gsap.set(box, { rotationX: st.to }); done(); }
  };
  undo.push(() => { if (tl) tl.kill(); gsap.killTweensOf(box); });

  // From below it rolls up, from above it rolls down; leaving, it rolls on the way the pointer went.
  const half = (e) => { const r = pill.getBoundingClientRect(); return e.clientY > r.top + r.height / 2 ? 1 : -1; };
  const focusVisible = () => { try { return pill.matches(':focus-visible'); } catch (e) { return true; } };
  let hovered = false, keyed = false;
  const onEnter = (e) => { hovered = true; roll(true, half(e)); };
  const onLeave = (e) => { hovered = false; roll(keyed, -half(e)); };
  const onFocus = () => { keyed = focusVisible(); roll(hovered || keyed, 1); };
  const onBlur = () => { keyed = false; roll(hovered, 1); };
  pill.addEventListener('mouseenter', onEnter);
  pill.addEventListener('mouseleave', onLeave);
  pill.addEventListener('focus', onFocus);
  pill.addEventListener('blur', onBlur);
  undo.push(() => {
    pill.removeEventListener('mouseenter', onEnter);
    pill.removeEventListener('mouseleave', onLeave);
    pill.removeEventListener('focus', onFocus);
    pill.removeEventListener('blur', onBlur);
  });
  return () => undo.splice(0).reverse().forEach(fn => { try { fn(); } catch (e) {} });
}

/* ─────────────────────────────────────────────
   INIT: SERVICES LAB  (test page /services-animations-test)
   — Three takes on the services list, one per section[data-lab]:
       wave    Scroll. Names lean right as they cross the middle of the
               screen; a frame opens in the gap with that service's
               visual, its description in the left column.
       deal    Hover. Thumbnails of the projects tagged with the service
               are dealt out of the word, left and right. Moving across
               the screen slides the strip through the word; moving to
               another service carries the strip to that line.
       follow  Hover. The frame leaves its column and follows the pointer,
               leaning with its speed and swapping visuals between
               services; it flies home when the pointer leaves the list.
   — Everything comes from the CMS: Services (name, description, image or
     video) and, for the deal cards, a hidden Works list
     ([data-lab-works]) whose items list their services.
   — Reads without JS (plain lists). Reduced motion: no travel, instant
     swaps, no wave frame. Touch or under 992px: the wave as is; deal and
     follow pick the line crossing the middle of the screen.
   — Tunables in LAB; the frame swap and the card move are recipes
     (labSwap, labDeal), editable live in the tune panel ("t" on staging).
   — Listeners, observers and matchMedia contexts are torn down on every
     re-init (Barba), like the videos.
───────────────────────────────────────────── */
const LAB = {
  wave: {
    spread: 1,      // share of the screen height the lean spans (1 = all of it)
    lag:    0.3,    // s the names trail the scroll
    gap:    1       // rem between the frame and the leaning name
  },
  deal: {
    max:   12,      // cards per service
    gap:   0.55,    // rem between cards (site gutter)
    tilt:  3,       // deg, random tilt per card, new on each line
    zones: [0.67, 0.58, 0.5, 0.42, 0.33] // share of the cards left of the word, per fifth of the screen
  },
  follow: {
    lag:    0.55,   // s the frame trails the pointer
    scale:  0.72,   // frame size while it follows
    tilt:   9,      // deg, max lean from the pointer speed
    offset: 2       // rem between the pointer and the frame
  }
};
const LAB_HOVER = '(hover: hover) and (pointer: fine) and (min-width: 992px)';

let labTeardown = [];
function teardownLab() {
  labTeardown.splice(0).forEach(fn => { try { fn(); } catch (e) {} });
}

function labRem()     { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; }
function labKey(s)    { return (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function labFaded(el) { const o = parseFloat(getComputedStyle(el).opacity); return o > 0 && o < 1 ? o : 0.4; }

// Stacked visuals in a .lab-frame: one .lab-media-item per service, in list
// order. show(i, dir) puts item i on top through the labSwap recipe and plays
// its video if it has one; the others hide and pause once it has landed.
function labFrame(frame) {
  const items = Array.from(frame.querySelectorAll('.lab-media-item'));
  let current = -1, z = 1;

  const video = (i, play) => {
    const v = items[i] && items[i].querySelector('video.g_visual_video:not(.w-condition-invisible)');
    if (!v) return;
    if (!play) { try { v.pause(); } catch (e) {} return; }
    if (!v.dataset.vloaded) {
      const src = v.getAttribute('data-source');
      if (!src || !/\.(mp4|webm|ogv|mov|m4v)(\?.*)?$/i.test(src)) return;
      v.dataset.vloaded = '1';
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.removeAttribute('autoplay');
      v.src = src;
    }
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  };

  gsap.set(items, { autoAlpha: 0 });

  function show(i, dir, animate) {
    if (!items[i]) return;
    if (i === current) { video(i, true); return; }
    const prev = items[current] || null;
    current = i;
    const next  = items[i];
    const media = next.querySelector('.g_visual_img:not(.w-condition-invisible), .g_visual_video:not(.w-condition-invisible)') || next;
    gsap.killTweensOf([next, media]);
    gsap.set(next, { autoAlpha: 1, zIndex: ++z, clipPath: 'inset(0% 0% 0% 0%)' }); // final state first
    gsap.set(media, { scale: 1 });
    video(i, true);
    const settle = () => items.forEach((el, k) => {
      if (k === current) return;
      gsap.set(el, { autoAlpha: 0 });
      video(k, false);
    });
    const tl = animate === false ? null
      : runRecipe('labSwap', gsap.timeline(), { next, prev, media, frame, dir: dir < 0 ? -1 : 1 });
    if (tl && tl.duration()) tl.eventCallback('onComplete', settle);
    else settle();
  }

  return {
    show,
    get index() { return current; },
    pause() { items.forEach((_, k) => video(k, false)); }
  };
}

/* ── WAVE ── */
function initLabWave(root) {
  const body    = root.querySelector('.lab-wave-body');
  const items   = Array.from(root.querySelectorAll('.lab-wave-item'));
  const rail    = root.querySelector('.lab-wave-rail');
  const sticky  = root.querySelector('.lab-wave-sticky');
  const frameEl = root.querySelector('.lab-wave-sticky .lab-frame');
  if (!body || !items.length || !rail || !sticky || !frameEl) return;

  const descs = Array.from(root.querySelectorAll('.lab-wave-desc-item'));
  const frame = labFrame(frameEl);
  const faded = labFaded(items[0]);
  const lean  = gsap.parseEase('power1.inOut');
  const leanX = items.map(el => gsap.quickTo(el, 'x', { duration: LAB.wave.lag, ease: 'power3.out' }));

  // "(01)", "(02)"… above each description, in the serif of the section counts.
  descs.forEach((d, i) => {
    const n = d.querySelector('.lab-wave-count .section-txt-serif') || d.querySelector('.lab-wave-count');
    if (n) n.textContent = '(' + String(i + 1).padStart(2, '0') + ')';
  });

  gsap.set(descs, { autoAlpha: 0 });
  gsap.set(sticky, { autoAlpha: 0, scale: 0.6 });
  // No lean under reduced motion, so no gap for the frame: it stays out.
  if (!reducedMotion) gsap.set(rail, { opacity: 1 });

  let mids = [], halves = [], offset = 0, active = -1;
  const measure = () => {
    const top = body.getBoundingClientRect().top; // x transforms don't move tops
    mids   = items.map(el => { const r = el.getBoundingClientRect(); return r.top - top + r.height / 2; });
    halves = items.map(el => el.offsetHeight / 2);
    offset = sticky.offsetWidth + LAB.wave.gap * labRem();
  };

  // Description: the old one leaves the way the list moves, the new one comes
  // from the other side once it's gone (two paragraphs never cross-fade).
  let shown = -1, descCall = null;
  const showDesc = (i) => {
    if (i === shown) return;
    const prev = shown;
    shown = i;
    const dir = prev < 0 || i < 0 || i > prev ? 1 : -1;
    const rem = labRem();
    if (descs[prev]) {
      gsap.killTweensOf(descs[prev]);
      gsap.to(descs[prev], { autoAlpha: 0, y: reducedMotion ? 0 : -0.5 * rem * dir, duration: reducedMotion ? 0 : 0.2, ease: 'power2.in' });
    }
    if (descs[i]) {
      gsap.killTweensOf(descs[i]);
      gsap.fromTo(descs[i],
        { autoAlpha: 0, y: reducedMotion ? 0 : 0.75 * rem * dir },
        { autoAlpha: 1, y: 0, duration: reducedMotion ? 0 : 0.6, delay: reducedMotion || prev < 0 ? 0 : 0.18, ease: easeOr('osmo', 'power3.out') });
    }
  };

  const setActive = (i) => {
    if (i === active) return;
    const prev = active;
    active = i;
    const dir = prev < 0 || i < 0 || i > prev ? 1 : -1;

    if (prev >= 0) gsap.to(items[prev], { opacity: faded, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
    if (i >= 0)    gsap.to(items[i],    { opacity: 1,     duration: 0.25, ease: 'power2.out', overwrite: 'auto' });

    // The text waits for the list to settle, so a fast scroll doesn't flicker through it.
    if (descCall) descCall.kill();
    descCall = gsap.delayedCall(i < 0 ? 0 : 0.12, () => showDesc(i));

    if (reducedMotion) return;
    if (i < 0) {
      gsap.to(sticky, { autoAlpha: 0, scale: 0.6, duration: 0.3, ease: 'power2.in', overwrite: 'auto' });
      frame.pause();
      return;
    }
    if (prev < 0) {
      // The frame pops open on the first name; after that it only swaps.
      frame.show(i, dir, false);
      gsap.to(sticky, { autoAlpha: 1, scale: 1, duration: 0.6, ease: easeOr('jump', 'back.out(1.7)'), overwrite: 'auto' });
    } else {
      frame.show(i, dir);
    }
  };

  // Every name leans by how close it is to the middle of the screen:
  // all the way (frame width + gap) on the middle line, none at the edges.
  const render = () => {
    if (!mids.length) return;
    const vh = window.innerHeight, middle = vh / 2;
    const top = body.getBoundingClientRect().top;
    let best = -1, bestD = Infinity;
    items.forEach((el, k) => {
      const d = top + mids[k] - middle;
      const t = Math.min(1, Math.abs(d) / ((vh / 2) * LAB.wave.spread + halves[k]));
      if (!reducedMotion) leanX[k](offset * lean(1 - t));
      if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = k; }
    });
    const last  = items.length - 1;
    const pitch = last > 0 ? (mids[last] - mids[0]) / last / 2 : halves[0];
    const onList = middle >= top + mids[0] - pitch && middle <= top + mids[last] + pitch;
    setActive(onList ? best : -1);
  };

  measure();
  const st = ScrollTrigger.create({
    trigger: body,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: render,
    onRefresh: () => { measure(); render(); },
    onToggle: (self) => { if (!self.isActive) setActive(-1); }
  });
  labTeardown.push(() => { st.kill(); if (descCall) descCall.kill(); });
  render();
}

/* ── DEAL ── */
function initLabDeal(root) {
  const stage = root.querySelector('.lab-deal-stage');
  const list  = root.querySelector('.lab-deal-list');
  const layer = root.querySelector('.lab-deal-cards');
  const items = Array.from(root.querySelectorAll('.lab-deal-item'));
  if (!stage || !list || !layer || !items.length) return;

  // Projects per service, from the hidden Works list (sorted like the Work page).
  const works = Array.from(document.querySelectorAll('[data-lab-works] .lab-work')).map((w) => {
    const img = w.querySelector('img');
    return {
      src:      img ? img.getAttribute('src') : '',
      srcset:   img ? img.getAttribute('srcset') : '',
      services: Array.from(w.querySelectorAll('.lab-work-service')).map(s => labKey(s.textContent))
    };
  }).filter(w => w.src);
  const projects = items.map((el) => {
    const key = labKey(el.textContent);
    return works.filter(w => w.services.includes(key)).slice(0, LAB.deal.max);
  });
  const total = Math.max(0, ...projects.map(p => p.length));
  if (!total) return;

  // Card k shows project k of the active service; it holds one <img> per
  // service (stacked), so a line change is a crossfade, not a reload.
  const tpl = layer.querySelector('.lab-deal-card');
  const cards = Array.from({ length: total }, (_, k) => {
    const el = tpl ? tpl.cloneNode(false) : document.createElement('div');
    if (!tpl) el.className = 'lab-deal-card';
    el.setAttribute('aria-hidden', 'true');
    const imgs = projects.map((p) => {
      if (!p[k]) return null;
      const img = document.createElement('img');
      img.className = 'lab-deal-card-img';
      img.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;';
      img.alt = '';
      img.decoding = 'async';
      img.dataset.src = p[k].src;
      if (p[k].srcset) img.dataset.srcset = p[k].srcset;
      el.appendChild(img);
      return img;
    });
    layer.appendChild(el);
    gsap.set(el, { scale: 0, visibility: 'hidden' });
    gsap.set(imgs.filter(Boolean), { opacity: 0 });
    return { el, imgs, tl: null, on: false, rot: 0, cur: -1, z: 0 };
  });
  labTeardown.push(() => cards.forEach(c => { if (c.tl) c.tl.kill(); c.el.remove(); }));

  // Thumbnails load once the list is a screen away, then decode, so the first deal never waits.
  const io = new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting)) return;
    io.disconnect();
    cards.forEach(c => c.imgs.forEach((img) => {
      if (!img || img.getAttribute('src')) return;
      if (img.dataset.srcset) { img.sizes = '120px'; img.srcset = img.dataset.srcset; }
      img.src = img.dataset.src;
      if (img.decode) img.decode().catch(() => {});
    }));
  }, { rootMargin: '100% 0px' });
  io.observe(stage);
  labTeardown.push(() => io.disconnect());

  const faded = labFaded(items[0]);
  let active = -1, zone = 2;

  // The word's box in stage coordinates (a Range hugs the text, not the full-width row).
  const box = (i) => {
    const txt = items[i].querySelector('.lab-deal-txt') || items[i];
    const range = document.createRange();
    range.selectNodeContents(txt);
    const b = range.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    return { left: b.left - s.left, right: b.right - s.left, cx: (b.left + b.right) / 2 - s.left, cy: (b.top + b.bottom) / 2 - s.top };
  };

  const move = (c, t, ripple, instant) => {
    if (c.tl) { c.tl.kill(); c.tl = null; }
    if (t.show && !c.on) gsap.set(c.el, { x: t.fromX, y: t.y, scale: 0, rotation: 0, visibility: 'visible' }); // dealt out of the word
    c.on = t.show;
    const tl = instant ? null
      : runRecipe('labDeal', gsap.timeline(), { card: c.el, x: t.x, y: t.y, rotation: t.rotation, show: t.show, ripple });
    if (tl && tl.duration()) {
      c.tl = tl;
      if (!t.show) tl.eventCallback('onComplete', () => gsap.set(c.el, { visibility: 'hidden' }));
      return;
    }
    if (tl) tl.kill();
    gsap.set(c.el, { x: t.x, y: t.y, rotation: t.rotation, scale: t.show ? 1 : 0, visibility: t.show ? 'visible' : 'hidden' });
  };

  // Slots: n cards in one row with the word inserted after `left` of them.
  // Fewer projects → a shorter strip; `left` follows the pointer's fifth of the screen.
  const place = (ripple, instant) => {
    if (active < 0) return;
    const b = box(active);
    const size = cards[0].el.offsetWidth;
    const gap  = LAB.deal.gap * labRem();
    const n    = Math.min(projects[active].length, cards.length);
    const left = Math.round(n * LAB.deal.zones[zone]);
    const y = b.cy - size / 2, home = b.cx - size / 2;
    cards.forEach((c, k) => {
      const show = k < n;
      if (!show && !c.on) { gsap.set(c.el, { x: home, y }); return; }
      if (ripple && show) c.rot = gsap.utils.random(-LAB.deal.tilt, LAB.deal.tilt);
      const x = !show ? home : k < left ? b.left - (left - k) * (size + gap) : b.right + gap + (k - left) * (size + gap);
      move(c, { x, y, fromX: home, rotation: show ? c.rot : 0, show }, ripple, instant);
    });
  };

  // Each card fades its image for the new service in on top; cards that were
  // folded take it straight away (they grow out of the word with it).
  const paint = (i) => {
    cards.forEach((c) => {
      c.cur = i;
      const img = c.imgs[i];
      if (!img) return;
      gsap.killTweensOf(img);
      gsap.set(img, { zIndex: ++c.z });
      const done = () => { if (c.cur === i) c.imgs.forEach((im, j) => { if (im && j !== i) gsap.set(im, { opacity: 0 }); }); };
      if (c.on && !reducedMotion) gsap.fromTo(img, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.inOut', onComplete: done });
      else { gsap.set(img, { opacity: 1 }); done(); }
    });
  };

  const activate = (i) => {
    if (i === active) return;
    const prev = active;
    active = i;
    if (prev >= 0) gsap.to(items[prev], { opacity: faded, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
    if (i < 0) {
      // Fold the cards back into the word they came out of.
      const b = box(prev), size = cards[0].el.offsetWidth;
      cards.forEach((c) => { if (c.on) move(c, { x: b.cx - size / 2, y: b.cy - size / 2, rotation: 0, show: false }, false); });
      return;
    }
    gsap.to(items[i], { opacity: 1, duration: 0.25, ease: 'power2.out', overwrite: 'auto' });
    gsap.set(layer, { opacity: 1 });
    paint(i);
    place(true);
  };

  const onRefresh = () => place(false, true);
  ScrollTrigger.addEventListener('refresh', onRefresh);
  labTeardown.push(() => ScrollTrigger.removeEventListener('refresh', onRefresh));

  const mm = gsap.matchMedia();
  labTeardown.push(() => mm.revert());
  mm.add({ hover: LAB_HOVER, touch: 'not all and ' + LAB_HOVER }, (ctx) => {
    if (ctx.conditions.hover) {
      const enters = items.map((el, i) => { const fn = () => activate(i); el.addEventListener('mouseenter', fn); return fn; });
      const leave  = () => activate(-1);
      const onMove = (e) => {
        const z = Math.min(4, Math.max(0, Math.floor(e.clientX / (window.innerWidth / 5))));
        if (z === zone) return;
        zone = z;
        place(false);
      };
      list.addEventListener('mouseleave', leave);
      window.addEventListener('mousemove', onMove, { passive: true });
      return () => {
        items.forEach((el, i) => el.removeEventListener('mouseenter', enters[i]));
        list.removeEventListener('mouseleave', leave);
        window.removeEventListener('mousemove', onMove);
        activate(-1);
      };
    }
    // Touch: the line crossing the middle of the screen is dealt.
    zone = 2;
    const sts = items.map((el, i) => ScrollTrigger.create({
      trigger: el, start: 'top center', end: 'bottom center',
      onEnter: () => activate(i), onEnterBack: () => activate(i)
    }));
    sts.push(ScrollTrigger.create({
      trigger: list, start: 'top center', end: 'bottom center',
      onLeave: () => activate(-1), onLeaveBack: () => activate(-1)
    }));
    return () => { sts.forEach(st => st.kill()); activate(-1); };
  });
}

/* ── FOLLOW ── */
function initLabFollow(root) {
  const list    = root.querySelector('.lab-follow-names');
  const items   = Array.from(root.querySelectorAll('.lab-follow-item'));
  const home    = root.querySelector('.lab-follow-home');
  const mover   = root.querySelector('.lab-follow-mover');
  const frameEl = root.querySelector('.lab-follow-mover .lab-frame');
  if (!list || !items.length || !home || !mover || !frameEl) return;

  const frame = labFrame(frameEl);
  const faded = labFaded(items[0]);
  frame.show(0, 1, false); // first service waits at home, like the Services page

  let active = -1;
  const pick = (i) => {
    if (i === active) return;
    const prev = active;
    active = i;
    if (prev >= 0) gsap.to(items[prev], { opacity: faded, x: 0, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
    if (i < 0) return;
    gsap.to(items[i], { opacity: 1, x: reducedMotion ? 0 : labRem(), duration: 0.45, ease: easeOr('energy', 'power3.out'), overwrite: 'auto' });
    frame.show(i, prev < 0 || i > prev ? 1 : -1, !reducedMotion);
  };

  const mm = gsap.matchMedia();
  labTeardown.push(() => mm.revert());
  mm.add({ hover: LAB_HOVER, touch: 'not all and ' + LAB_HOVER }, (ctx) => {
    if (ctx.conditions.hover) {
      let following = false, px = 0, py = 0, lastX = 0, xTo = null, yTo = null, rTo = null;

      // Aim the frame just right of the pointer, but never over the name being
      // read (it waits at the end of the word), left of the pointer near the
      // screen edge. Expressed as an offset from its home in the right column.
      const wordRight = () => {
        if (active < 0) return -Infinity;
        const range = document.createRange();
        range.selectNodeContents(items[active].querySelector('.lab-follow-txt') || items[active]);
        return range.getBoundingClientRect().right;
      };
      const aim = () => {
        if (!xTo) return;
        const r = home.getBoundingClientRect();
        const w = mover.offsetWidth, h = mover.offsetHeight, s = LAB.follow.scale;
        const off = LAB.follow.offset * labRem();
        let left = Math.max(px, wordRight()) + off;
        if (left + w * s > window.innerWidth - off) left = px - off - w * s;
        xTo(left + (w * s) / 2 - (r.left + w / 2));
        yTo(py - (r.top + h / 2));
      };
      // Lean with the pointer's horizontal speed, back to straight when it stops.
      const tick = () => {
        if (!following || !rTo) return;
        const vx = px - lastX;
        lastX = px;
        rTo(gsap.utils.clamp(-LAB.follow.tilt, LAB.follow.tilt, vx * 0.5));
      };
      const onMove   = (e) => { px = e.clientX; py = e.clientY; if (following) aim(); };
      const onScroll = () => { if (following) aim(); };
      const enter = (e) => {
        if (reducedMotion) return;
        following = true;
        px = e.clientX; py = e.clientY; lastX = px;
        gsap.killTweensOf(mover);
        xTo = gsap.quickTo(mover, 'x', { duration: LAB.follow.lag, ease: 'power3.out' });
        yTo = gsap.quickTo(mover, 'y', { duration: LAB.follow.lag, ease: 'power3.out' });
        rTo = gsap.quickTo(mover, 'rotation', { duration: 0.6, ease: 'power3.out' });
        gsap.to(mover, { scale: LAB.follow.scale, duration: 0.6, ease: easeOr('osmo', 'power3.out') });
        aim();
      };
      const leave = () => {
        pick(-1);
        if (!following) return;
        following = false;
        xTo = yTo = rTo = null;
        gsap.killTweensOf(mover);
        gsap.to(mover, { x: 0, y: 0, rotation: 0, scale: 1, duration: 0.9, ease: easeOr('osmo', 'power3.inOut') });
      };
      const enters = items.map((el, i) => { const fn = () => { pick(i); if (following) aim(); }; el.addEventListener('mouseenter', fn); return fn; });
      list.addEventListener('mouseenter', enter);
      list.addEventListener('mouseleave', leave);
      window.addEventListener('mousemove', onMove, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });
      gsap.ticker.add(tick);
      return () => {
        items.forEach((el, i) => el.removeEventListener('mouseenter', enters[i]));
        list.removeEventListener('mouseenter', enter);
        list.removeEventListener('mouseleave', leave);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('scroll', onScroll);
        gsap.ticker.remove(tick);
        gsap.killTweensOf(mover);
        gsap.set(mover, { x: 0, y: 0, rotation: 0, scale: 1 });
        pick(-1);
      };
    }
    // Touch / tablet: light the line crossing the middle of the screen (the
    // home frame, when its column shows, swaps along).
    const sts = items.map((el, i) => ScrollTrigger.create({
      trigger: el, start: 'top center', end: 'bottom center',
      onEnter: () => pick(i), onEnterBack: () => pick(i)
    }));
    sts.push(ScrollTrigger.create({
      trigger: list, start: 'top center', end: 'bottom center',
      onLeave: () => pick(-1), onLeaveBack: () => pick(-1)
    }));
    return () => { sts.forEach(st => st.kill()); pick(-1); };
  });
}

function initServicesLab() {
  teardownLab();
  const roots = Array.from(document.querySelectorAll('[data-lab]'));
  if (!roots.length) return;

  const inits = { wave: initLabWave, deal: initLabDeal, follow: initLabFollow };
  roots.forEach((root) => {
    const kind = root.getAttribute('data-lab');
    if (!inits[kind] || root.dataset.labInit) return;
    root.dataset.labInit = '1';
    labTeardown.push(() => { delete root.dataset.labInit; });
    runInit('lab-' + kind, () => inits[kind](root));
  });

  // Names reflow when the webfont lands: measure everything again once it has.
  if (document.fonts && document.fonts.ready) {
    let alive = true;
    labTeardown.push(() => { alive = false; });
    document.fonts.ready.then(() => { if (alive) ScrollTrigger.refresh(); });
  }
}

/* ─────────────────────────────────────────────
   ALLPAGES — orchestrator
   — initNavReveal NOT called here: it's called once
     at top-level on first load, and re-initialized
     by barba.hooks.enter onComplete after every transition
───────────────────────────────────────────── */
// Each module runs in its own try/catch: Barba swallows errors thrown inside
// hooks, so without this one broken widget would silently skip every init
// after it (and the scroll reset) on that page.
function runInit(name, fn) {
  try { fn(); } catch (e) { console.error('[init] ' + name + ' failed:', e); }
}

function allpages() {
  runInit('relatedWork',   initRelatedWork);
  runInit('relatedPosts',  initRelatedPosts);  // blog article: the 3 newest other posts
  runInit('blogArticle',   initBlogArticle);   // blog article: share, project link, empty meta rows
  runInit('year',          initYear);
  runInit('mobileMenu',    initMobileMenu);
  runInit('currentLinks',  initCurrentLinks);
  runInit('drawers',       initDrawers);
  runInit('marquees',      initMarquees);    // before swipers, which leave its strips alone
  runInit('swipers',       initSwipers);
  runInit('parallax',      initSectionImgParallax);
  runInit('sectionCounts', initSectionCounts);
  runInit('workTitles',    initWorkItemTitles);
  runInit('stagingHelper', initStagingHelper);
  runInit('toggles',       initToggles);
  runInit('servicesFollow',initServicesFollow); // before videos + servicesHover, which skip its section
  runInit('hoverTrail',    initHoverTrail);    // Services hero test (h1[data-hover-trail])
  runInit('awardsHover',   initAwardsHover);   // About awards list ([data-awards-hover])
  runInit('videos',        initVideos);
  runInit('heroVideos',    initHeroVideos);
  runInit('workHover',     initWorkHover);     // work cards' hover video + pictures (.work-hover-visuals)
  runInit('txtBtnLines',   initTxtBtnLines);
  runInit('servicesHover', initServicesHover);
  runInit('servicePage',   initServicePage);   // Services template: empty sections, features, service cards
  runInit('includedFollow',initIncludedFollow); // Services template: What's included rows + frame
  runInit('industryFlip',  initIndustryFlip);  // Services industries pills (.industry-list)
  runInit('servicesLab',   initServicesLab);   // test page only (section[data-lab])
  runInit('locationsHover',initLocationsHover);
  runInit('teamStatus',    initTeamStatus);
  runInit('viewToggle',    initViewToggle);
  runInit('tuner',         initTuner);       // staging only, no-op after first build
}

allpages();