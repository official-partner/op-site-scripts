console.log("[sparky.js] build 2026-10-27a");
/* ═══════════════════════════════════════════════
   SETUP
═══════════════════════════════════════════════ */
gsap.registerPlugin(CustomEase, ScrollTrigger, SplitText);
history.scrollRestoration = "manual";

// Signal to the head watchdog that the main script arrived —
// if this never runs, the inline fallback reveals the crisp header.
window.__sparkyLoaded = true;

// MWG motion language: one shared, gentle vanishing point (≈250vw) used by
// every 3D depth animation on the site so all planes recede consistently.
const mwgPersp = () => window.innerWidth * 2.5;

// ── State
let lenis           = null;
let nextPage        = document;
let onceFunctions   = false;
let swiperInstances = [];
let activeObservers = []; // MutationObservers — disconnected on every transition
let splitInstances  = []; // SplitText instances — reverted on every transition
let crispLoaderDone = false; // true once the first-load crisp loader has run (or been skipped)

// ── Feature detection
const hasLenis         = typeof window.Lenis        !== "undefined";
const hasScrollTrigger = typeof window.ScrollTrigger !== "undefined";

// ── ScrollTrigger refresh gate ──
// Any refresh while a barba container is TRANSLATED measures every
// trigger's start/end offset by a full viewport (rects include transforms)
// and revert-cycles scrubbed tweens in plain view — async code (Finsweet
// re-init callbacks, image loads) can fire refreshes at any moment during
// the 1.2s transition. So: while the incoming container is transformed,
// refresh() queues instead of running; afterEnter flushes with clean
// geometry. Our own two safe refreshes run outside the gated window.
let refreshBlocked = false;
let refreshQueued = false;
if (hasScrollTrigger) {
  const _origRefresh = ScrollTrigger.refresh.bind(ScrollTrigger);
  ScrollTrigger.refresh = (safe) => {
    if (refreshBlocked) { refreshQueued = true; return; }
    return _origRefresh(safe);
  };
}

// ── Reduced motion (stays reactive if the user changes OS setting mid-session)
const rmMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = rmMQ.matches;
rmMQ.addEventListener?.("change", e => (reducedMotion = e.matches));

// ── Query helper — always scoped to the incoming container
const has = (s) => !!nextPage.querySelector(s);

// ── Eases defined once globally
CustomEase.create("osmo",     "0.625, 0.05, 0, 1");
CustomEase.create("parallax", "0.7, 0.05, 0.13, 1");
gsap.defaults({ ease: "osmo", duration: 0.6 });


/* ═══════════════════════════════════════════════
   LENIS
═══════════════════════════════════════════════ */
function initLenis() {
  if (lenis || !hasLenis || isSafari()) return;

  lenis = new Lenis({ lerp: 0.15, wheelMultiplier: 1 });

  if (hasScrollTrigger) lenis.on("scroll", ScrollTrigger.update);

  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

// Show Grid
(function() {
  if (!window.location.hostname.includes('webflow.io')) return;
  var wrap = document.querySelector('.guide_wrap');
  if (!wrap) return;
  wrap.style.display = 'none';
  document.addEventListener('keydown', function(e) {
    if (e.key === 'g' || e.key === 'G') {
      wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
    }
  });
})();


/* ═══════════════════════════════════════════════
   FUNCTION REGISTRY
═══════════════════════════════════════════════ */
function initOnceFunctions() {
  // initLenis always runs (has its own singleton guard)
  initLenis();

  // Everything below runs exactly once across the session
  if (onceFunctions) return;
  onceFunctions = true;

  initFsCallbacks(); // register Finsweet lifecycle hooks once
  initMobileMenu();  // persistent nav: burger + panel, bound once
  initFormGuards();  // document-level form listeners, bound once
}

function initBeforeEnterFunctions(next) {
  nextPage = next || document;
  // Add page-specific before-enter setup here
  // if (has("[data-something]")) initSomething();
}

function initAfterEnterFunctions(data) {
  nextPage = data.next.container;

  // Pass next.html so Webflow picks up the correct data-wf-page id
  resetWebflow(data.next.html);
  ensureWebflowForms(); // forms must be rebuilt for the new container
  allpages(); // init all page components
}


/* ═══════════════════════════════════════════════
   PAGE TRANSITIONS
═══════════════════════════════════════════════ */
function runPageOnceAnimation(next) {
  resetPage(next);
  // Crisp loader runs on first load only — barba awaits it, so afterEnter
  // (allpages + ScrollTrigger.refresh) fires after the height lock releases.
  return initCrispLoader(next);
}

function runPageLeaveAnimation(current) {
  const overlay = document.querySelector("[data-transition-dark]");
  const tl = gsap.timeline({ onComplete: () => current.remove() });

  if (reducedMotion) return tl.set(current, { autoAlpha: 0 });

  // Hinge near the top of the VISIBLE region. Uses the scroll offset
  // captured in `before` — the window itself has already been reset to 0
  // by the time leave runs, but the fixed container's coordinate space
  // still corresponds to the old scroll position.
  const hingeY = leaveScrollY + window.innerHeight * 0.1;
  gsap.set(current, {
    transformPerspective: mwgPersp(),
    transformOrigin: "50% " + hingeY + "px",
    force3D: true,
  });

  tl.fromTo(overlay, { autoAlpha: 0 }, {
    autoAlpha: 0.8, duration: 1.2, ease: "parallax"
  }, 0);

  tl.fromTo(current, { y: "0vh" }, {
    y: "-45vh",
    rotationX: 22,
    rotate: "-4deg",
    scale: 0.88,
    duration: 1.2,
    ease: "parallax"
  }, 0);

  tl.set(overlay, { autoAlpha: 0 });

  return tl;
}

/* ── Footer-visible leave (second Barba transition) ──
   When the user navigates while the footer is on screen, page_content is
   ALREADY mid-departure: tilted by the (frozen) footer scrub, hinge and
   perspective primed. Transforming the container on top of that composes
   two 3D contexts — the warping bug. So this variant transforms ONLY
   page_content: it continues the exact same motion deeper and fades out,
   the container never moves, and no nested 3D can exist. The footer stays
   put beneath and dims under the transition overlay. */
function runFooterLeaveAnimation(current) {
  const overlay = document.querySelector("[data-transition-dark]");
  const tl = gsap.timeline({ onComplete: () => current.remove() });

  if (reducedMotion) return tl.set(current, { autoAlpha: 0 });

  const pageContent = current.querySelector(".page_content");

  // Re-pin the tilt captured at routing time. Something in the transition
  // machinery clears page_content's transform between the click and this
  // frame (symptom: content snaps flat, THEN animates out) — rather than
  // depend on identifying every clearer, restore the exact computed matrix
  // here so the leave always starts from the frozen scrub state. Setting
  // the matrix rebuilds GSAP's transform cache, so the yPercent tween
  // below composes on top of it every frame.
  if (pageContent && footerLeaveSnapshot && footerLeaveSnapshot !== "none") {
    gsap.set(pageContent, { transform: footerLeaveSnapshot });
  }
  footerLeaveSnapshot = null;

  tl.fromTo(overlay, { autoAlpha: 0 }, {
    autoAlpha: 0.8, duration: 1.2, ease: "parallax"
  }, 0);

  if (pageContent) {
    // ONLY properties the footer scrub does NOT own. The scrub animates
    // rotationX / rotate / y(rem) / scale — touching those again fights
    // the frozen scrub state. yPercent is a separate transform channel in
    // GSAP, so the content slides up and fades while its frozen tilt
    // stays exactly as the scroll left it. Zero interference.
    tl.to(pageContent, {
      yPercent: -25,
      autoAlpha: 0,
      duration: 1.2,
      ease: "parallax",
    }, 0);
  } else {
    tl.to(current, { autoAlpha: 0, duration: 1.2 }, 0);
  }

  // The revealed footer rises with the content and dissolves in the same
  // breath — the wrap itself is untouched by the scrub (which animates
  // its children), so y + autoAlpha on it are unowned channels.
  const footerEl = current.querySelector(".footer_wrap");
  if (footerEl) {
    tl.to(footerEl, {
      y: "-12vh",
      autoAlpha: 0,
      duration: 1.2,
      ease: "parallax",
    }, 0);
  }

  tl.set(overlay, { autoAlpha: 0 });

  return tl;
}

function runPageEnterAnimation(next) {
  const tl = gsap.timeline();

  if (reducedMotion) {
    tl.set(next, { autoAlpha: 1 });
    releaseNavTheme(); // no timeline beat to anchor to — switch now
    tl.add("pageReady");
    tl.call(resetPage, [next], "pageReady");
    return new Promise(resolve => tl.call(resolve, null, "pageReady"));
  }

  tl.set(next, { zIndex: 3 });

  // MWG language, arrival side: the new page rises out of the same depth
  // space the old one recedes into — slightly tipped, slightly crooked,
  // a touch small — and resolves to the flat, straight present plane as
  // it lands. Opposite z-twist sign to the leave, so the two planes
  // shear past each other. Hinge sits in the first viewportful (pixel
  // origin — this container is document-height too, so % would drift).
  gsap.set(next, {
    transformPerspective: mwgPersp(),
    transformOrigin: "50% " + window.innerHeight * 0.2 + "px",
    force3D: true,
  });

  tl.fromTo(next,
    { y: "110vh", rotationX: 18, rotate: "4deg", scale: 0.93 },
    {
      y: "0vh",
      rotationX: 0,
      rotate: "0deg",
      scale: 1,
      duration: 1.2,
      clearProps: "all",
      ease: "parallax"
    },
  0);

  // Nav theme switches at this exact beat of the choreography — see
  // initNavTheme's hold. Anchored in the timeline, not a wall-clock timer.
  tl.call(releaseNavTheme, null, NAV_THEME_SWITCH_DELAY);

  tl.add("pageReady");
  tl.call(resetPage, [next], "pageReady");

  return new Promise(resolve => tl.call(resolve, null, "pageReady"));
}


/* ═══════════════════════════════════════════════
   BARBA HOOKS
═══════════════════════════════════════════════ */
let pendingTeardown = null;
let leaveScrollY = 0;
let inTransition = false;
let pendingFooterST = null;
let footerLeaveSnapshot = null;


barba.hooks.before(() => {
  inTransition = true;
  closeMobileMenu(); // a menu link started this navigation: fold the panel away
  // Snapshot everything owned by the outgoing page — but destroy almost
  // NOTHING yet. Reverting SplitTexts, destroying Swipers here visibly
  // snaps the old page back to its pristine state at the very start of
  // the transition. Real teardown happens in afterLeave, once the old
  // container has left the DOM.
  pendingTeardown = {
    splits: splitInstances,
    triggers: hasScrollTrigger ? ScrollTrigger.getAll() : [],
    swipers: swiperInstances,
  };
  splitInstances = [];
  swiperInstances = [];

  // Freeze (don't kill) the old ScrollTriggers: disable(false) keeps every
  // element exactly at its current animated state and stops listening —
  // required both for the scroll reset below and the scroll-to-top at the
  // end of the enter timeline.
  pendingTeardown.triggers.forEach(t => t.disable(false));

  // Observers are safe to disconnect immediately — no visual effect.
  activeObservers.forEach(obs => obs.disconnect());
  activeObservers = [];

  // Nav returns to visible for the transition — tweened, not set: if the
  // user navigates while it's scroll-hidden, it glides back in with the
  // choreography instead of snapping.
  const navEl = getNav();
  if (navEl) gsap.to(navEl, { yPercent: 0, duration: 0.45, ease: "osmo", overwrite: "auto" });

  // Finsweet is a window-level singleton: it must be destroyed BEFORE the
  // incoming page re-inits it in beforeEnter. (No fs- attributes are live
  // on the site yet; once filtering ships, a filtered old page will reset
  // visibly here — revisit then.)
  destroyFsAttributes();

  if (lenis?.stop) lenis.stop();

  // THE KEY MOVE for clean enter-side ScrollTriggers: pin the old page
  // with position:fixed at its current scroll offset (visually identical),
  // then reset the window to scroll 0. The incoming container can now
  // initialize in normal flow with true at-top geometry (see beforeEnter).
  leaveScrollY = window.scrollY;
  const cur = document.querySelector('[data-barba="container"]');
  if (cur) {
    gsap.set(cur, {
      position: "fixed",
      top: -leaveScrollY + "px",
      left: 0,
      right: 0,
      zIndex: 1, // below the transition overlay and the incoming container
    });
  }
  // Native scroll must stay dead mid-transition (Safari runs without Lenis)
  document.documentElement.style.overflow = "hidden";
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
  else window.scrollTo(0, 0);
});

barba.hooks.beforeEnter((data) => {
  const isTransition = !!data.current?.container;

  initBeforeEnterFunctions(data.next.container);
  applyTheme(data.next.container);

  // Loader is first-load only: on later navigations to a crisp page,
  // reveal the header instantly AND build its slider now — slides are
  // generated from the loader image list, so without this the hero is
  // blank for the whole slide-in and the featured image lands wrong
  // (the featured rotation otherwise only ran inside the loader).
  if (crispLoaderDone) {
    data.next.container.querySelectorAll(".crisp-header").forEach(h => {
      h.classList.remove("is--loading", "is--hidden");
      prepCrispHeader(h);
      showHeroVisual(h, false);
    });
  }

  if (isTransition) {
    // ONE clean-geometry moment: the old page is pinned fixed, the window
    // is at scroll 0, and this container sits UNtransformed in normal
    // flow — its measurements are exactly the final page at top. Init
    // everything NOW so every scrubbed element carries its correct at-top
    // state during the slide-in instead of snapping to it afterwards.
    // (allpages is idempotent via dataset guards — the afterEnter pass
    // becomes a safety no-op. Old triggers are disabled, so this refresh
    // can't touch them.)
    allpages();
    if (hasScrollTrigger) ScrollTrigger.refresh();

    // From here until afterEnter the container is transformed — close the
    // refresh gate so no async refresh can measure poisoned geometry.
    refreshBlocked = true;

    // Parked at 110vh — starting further below, the incoming page arrives
    // deeper into the choreography. Same synchronous task: never paints at 0.
    if (!reducedMotion) gsap.set(data.next.container, { y: "110vh", zIndex: 3 });
  }
});;

barba.hooks.afterLeave(() => {
  // The old container is gone (removed in the leave timeline's onComplete),
  // so destruction can no longer cause a visible reset. Only the SNAPSHOT
  // is destroyed — everything the incoming page created in beforeEnter is
  // not in it and survives.
  if (!pendingTeardown) return;
  // Reverse order: nested splits (lines around chars) unwind outer-first
  [...pendingTeardown.splits].reverse().forEach(s => s.revert?.());
  pendingTeardown.triggers.forEach(t => t.kill());
  pendingTeardown.swipers.forEach(s => s.destroy?.(true, true));
  pendingTeardown = null;
});

barba.hooks.enter((data) => {
  updateNavState(data);
});

barba.hooks.afterEnter((data) => {
  // Fires on every navigation AND on the initial once load
  inTransition = false;
  // Container geometry is clean again (clearProps ran at enter completion):
  // reopen the refresh gate. The explicit refresh below also serves
  // anything that queued during the transition.
  refreshBlocked = false;
  refreshQueued = false;
  document.documentElement.style.overflow = ""; // re-enable native scroll
  initAfterEnterFunctions(data);

  // Wake the footer trigger created dormant in beforeEnter — the final
  // refresh below measures and syncs it against clean, untransformed
  // geometry in one pass.
  if (pendingFooterST) {
    pendingFooterST.enable(false);
    pendingFooterST = null;
  }

  if (lenis)            { lenis.resize(); lenis.start(); }
  if (hasScrollTrigger) ScrollTrigger.refresh();
});


/* ═══════════════════════════════════════════════
   BARBA INIT
═══════════════════════════════════════════════ */
barba.init({
  debug: false,
  timeout: 7000,
  preventRunning: true,

  transitions: [{
    // Chosen automatically when the OLD page's footer is on screen at
    // navigation time (barba prefers transitions with matching custom
    // rules over the ruleless default). Same enter; only the leave
    // differs — see runFooterLeaveAnimation.
    name: "footer-visible",
    sync: true,

    custom: ({ current }) => {
      const f = current?.container?.querySelector(".footer_wrap");
      const visible = !!f && f.getBoundingClientRect().top < window.innerHeight;
      if (visible) {
        // Snapshot the frozen scrub tilt NOW — this rule runs before any
        // hook, so nothing has had a chance to clear it yet. The leave
        // re-pins it as its first act (see runFooterLeaveAnimation).
        const pc = current.container.querySelector(".page_content");
        footerLeaveSnapshot = pc ? getComputedStyle(pc).transform : null;
      }
      return visible;
    },

    async leave(data) {
      return runFooterLeaveAnimation(data.current.container);
    },

    async enter(data) {
      return runPageEnterAnimation(data.next.container);
    }
  }, {
    name: "default",
    sync: true, // leave + enter overlap — this is what makes transitions feel cinematic

    async once(data) {
      initOnceFunctions();
      return runPageOnceAnimation(data.next.container);
    },

    async leave(data) {
      return runPageLeaveAnimation(data.current.container);
    },

    async enter(data) {
      return runPageEnterAnimation(data.next.container);
    }
  }]
});


/* ═══════════════════════════════════════════════
   GLOBAL HELPERS
═══════════════════════════════════════════════ */
function resetPage(container) {
  window.scrollTo({ top: 0, behavior: "instant" });

  gsap.set(container, { clearProps: "position,top,left,right,zIndex" });

  if (lenis) {
    lenis.scrollTo(0, { immediate: true });
    lenis.resize();
    lenis.start();
  }
}

function resetWebflow(nextHtml) {
  try {
    const nextDoc = new DOMParser().parseFromString(nextHtml, "text/html");
    const pageId  = nextDoc.documentElement.getAttribute("data-wf-page");
    if (pageId) document.documentElement.setAttribute("data-wf-page", pageId);

    window.Webflow?.destroy();
    window.Webflow?.ready();
    // This site runs GSAP, not Webflow interactions — ix2 may not exist,
    // and unguarded .init() threw on every navigation.
    const ix2 = window.Webflow?.require?.("ix2");
    ix2?.init?.();
  } catch (e) {
    console.warn("[resetWebflow]", e);
  }
}

function destroySwipers() {
  swiperInstances.forEach(s => s.destroy?.(true, true));
  swiperInstances = [];
}

// Call .destroy() on Finsweet instances before navigating away
function destroyFsAttributes() {
  try {
    window.fsAttributes?.cmsfilter?.destroy?.();
    window.fsAttributes?.cmsload?.destroy?.();
  } catch (_) { /* not present on all pages — safe to ignore */ }
}

// Re-init Finsweet on the new page
async function reinitFsAttributes() {
  try {
    if (window.fsAttributes?.cmsfilter?.init) await window.fsAttributes.cmsfilter.init();
    if (window.fsAttributes?.cmsload?.init)   await window.fsAttributes.cmsload.init();
  } catch (_) { /* not present on all pages — safe to ignore */ }
}

// Register Finsweet lifecycle event listeners — called once only
function initFsCallbacks() {
  window.fsAttributes = window.fsAttributes || [];

  window.fsAttributes.push(["cmsload", (instances) => {
    instances.forEach(inst => {
      inst.on("afterload", () => { if (hasScrollTrigger) ScrollTrigger.refresh(); });
    });
  }]);

  window.fsAttributes.push(["cmsfilter", (instances) => {
    instances.forEach(inst => {
      inst.listInstance.on("renderitems", () => { if (hasScrollTrigger) ScrollTrigger.refresh(); });
    });
  }]);
}

function applyTheme(container) {
  const theme = container?.dataset?.pageTheme || "light";
  document.body.dataset.pageTheme = theme;
  // Nav theming is owned by initNavTheme (section probe) — the old
  // page-level nav write here fought it on every navigation.
}

function updateNavState(data) {
  // Persistent nav sits outside the barba container, so Webflow's w--current
  // goes stale on client-side navigation. Match by pathname instead of by
  // index against next.html — robust to nav markup differing per page.
  const nextPath = new URL(data.next.url.href, window.location.origin).pathname;

  document.querySelectorAll("[data-barba-update]").forEach((link) => {
    const isCurrent = link.pathname === nextPath;
    link.classList.toggle("w--current", isCurrent);
    isCurrent
      ? link.setAttribute("aria-current", "page")
      : link.removeAttribute("aria-current");
  });

  // Re-execute page-specific embed scripts in the new container.
  // The temp script is removed after execution so they don't pile up in <body>.
  data.next.container.querySelectorAll("script[data-page-script]").forEach(s => {
    const el = document.createElement("script");
    el.textContent = s.textContent;
    document.body.appendChild(el);
    el.remove();
  });
}

function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

function clearStyles(el) {
  (typeof el === "string" ? [...document.querySelectorAll(el)] : [el])
    .forEach(e => e?.removeAttribute("style"));
}


/* ═══════════════════════════════════════════════
   PAGE FUNCTIONS
═══════════════════════════════════════════════ */

/* ── Year ── */
function initYear() {
  nextPage.querySelectorAll(".current-year").forEach(el => {
    el.textContent = new Date().getFullYear();
  });
}

/* ── Mobile menu ──
   Under 992px the nav shows logo, Contact and a burger; the other links
   live in [data-nav-menu], a panel that unfolds under the bar. The nav is
   persistent (outside the barba container), so this binds once from
   initOnceFunctions. Lenis and native scroll stop while it is open; the
   panel itself scrolls (data-lenis-prevent). Closes on: burger, Escape,
   a menu link, any barba navigation, and resizing up to desktop. */
// var + function declaration: both hoist, so barba's hooks can call this
// whenever they run, even before this part of the file has executed.
var mobileMenuSetOpen = null;
function closeMobileMenu(animate = true) { mobileMenuSetOpen?.(false, animate); }

function initMobileMenu() {
  const burger = document.querySelector("[data-nav-burger]");
  const menu   = document.querySelector("[data-nav-menu]");
  if (!burger || !menu || burger.dataset.menuInit) return;
  burger.dataset.menuInit = "true";

  const [lineTop, lineBottom] = burger.querySelectorAll(".nav-burger-line");
  const links = menu.querySelectorAll(".nav-menu-link");
  const mobileMQ = window.matchMedia("(max-width: 991px)");
  let open = false;
  let tl = null;

  const setOpen = (next, animate = true) => {
    if (next === open) return;
    open = next;
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.classList.toggle("is-active", open);
    tl?.kill();
    const d = (s) => (!animate || reducedMotion ? 0 : s);

    if (open) {
      if (lenis?.stop) lenis.stop();
      document.documentElement.style.overflow = "hidden";
      const nav = getNav();
      if (nav) gsap.to(nav, { yPercent: 0, duration: d(0.3), ease: "osmo", overwrite: "auto" });
      // Lines meet at the burger's centre: half the distance between them
      const shift = lineTop && lineBottom ? (lineBottom.offsetTop - lineTop.offsetTop) / 2 : 0;
      gsap.set(menu, { display: "block" });
      tl = gsap.timeline({ defaults: { ease: "osmo" } })
        .fromTo(menu, { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: d(0.6) })
        .fromTo(links, { yPercent: 40, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: d(0.5), stagger: d(0.05) }, d(0.1))
        .to(lineTop, { y: shift, rotate: 45, duration: d(0.4) }, 0)
        .to(lineBottom, { y: -shift, rotate: -45, duration: d(0.4) }, 0);
    } else {
      tl = gsap.timeline({
        defaults: { ease: "osmo", duration: d(0.45) },
        onComplete: () => {
          gsap.set(menu, { clearProps: "display,clipPath" });
          gsap.set(links, { clearProps: "transform,opacity,visibility" });
        },
      })
        .to(menu, { clipPath: "inset(0% 0% 100% 0%)" })
        .to([lineTop, lineBottom], { y: 0, rotate: 0, clearProps: "transform" }, 0);
      // Mid-transition, barba owns scroll locking and restarts Lenis itself
      if (!inTransition) {
        document.documentElement.style.overflow = "";
        if (lenis?.start) lenis.start();
      }
    }
  };

  mobileMenuSetOpen = setOpen;

  burger.addEventListener("click", () => setOpen(!open));
  links.forEach((a) => a.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !open) return;
    setOpen(false);
    burger.focus();
  });
  mobileMQ.addEventListener?.("change", (e) => { if (!e.matches) setOpen(false, false); });
}

/* ── Current-page links → scroll to top ── */
function initCurrentLinks() {
  $(document)
    .off("click.currentLink")
    .on("click.currentLink", "a.w--current", function (e) {
      if (this.hostname !== window.location.hostname) return; // external links
      if (this.pathname !== window.location.pathname) return; // different page
      if (this.hash) return;                                  // anchor links (#section)

      e.preventDefault();
      e.stopPropagation();
      lenis
        ? lenis.scrollTo(0, { duration: 0.5 })
        : window.scrollTo({ top: 0, behavior: "smooth" });
    });
}

/* ── Custom slider ── */
function initSlider() {
  nextPage.querySelectorAll("[data-slider='component']:not([data-slider='component'] [data-slider='component'])").forEach((component) => {
    if (component.dataset.scriptInitialized) return;
    component.dataset.scriptInitialized = "true";

    const swiperElement = component.querySelector(".slider_element");
    const swiperWrapper = component.querySelector(".slider_list");
    if (!swiperElement || !swiperWrapper) return;

    // Flatten display:contents wrappers added by Webflow
    function flattenDisplayContents(slot) {
      if (!slot) return;
      let child = slot.firstElementChild;
      while (child && child.classList.contains("u-display-contents")) {
        while (child.firstChild) slot.insertBefore(child.firstChild, child);
        slot.removeChild(child);
        child = slot.firstElementChild;
      }
    }
    flattenDisplayContents(swiperWrapper);

    // Unwrap CMS list nesting
    function removeCMSList(slot) {
      const dynList = Array.from(slot.children).find(c => c.classList.contains("w-dyn-list"));
      if (!dynList) return;
      const nestedItems = dynList?.querySelector(".w-dyn-items")?.children;
      if (!nestedItems) return;
      const staticWrapper = [...slot.children];
      [...nestedItems].forEach(el => {
        const c = [...el.children].find(c => !c.classList.contains("w-condition-invisible"));
        if (c) slot.appendChild(c);
      });
      staticWrapper.forEach(el => el.remove());
    }
    removeCMSList(swiperWrapper);

    [...swiperWrapper.children].forEach(el => el.classList.add("swiper-slide"));

    const followFinger        = swiperElement.getAttribute("data-follow-finger")      === "True";
    const freeMode            = swiperElement.getAttribute("data-free-mode")           === "True";
    const mousewheel          = swiperElement.getAttribute("data-mousewheel")          === "True";
    const slideToClickedSlide = swiperElement.getAttribute("data-slide-to-clicked")   === "True";
    const loop                = swiperElement.getAttribute("data-loop")                === "True";
    const speed               = +swiperElement.getAttribute("data-speed") || 600;

    const swiper = new Swiper(swiperElement, {
      slidesPerView:        "auto",
      followFinger,
      loopAdditionalSlides: 10,
      freeMode,
      loop,
      slideToClickedSlide,
      centeredSlides:       false,
      autoHeight:           false,
      speed,
      mousewheel:  { enabled: mousewheel, forceToAxis: true },
      keyboard:    { enabled: true, onlyInViewport: true },
      navigation: {
        nextEl: component.querySelector("[data-slider='next'] button"),
        prevEl: component.querySelector("[data-slider='previous'] button"),
      },
      pagination: {
        el:                component.querySelector(".slider_bullet_list"),
        bulletActiveClass: "is-active",
        bulletClass:       "slider_bullet_item",
        bulletElement:     "button",
        clickable:         true,
      },
      slideActiveClass:          "is-active",
      slideDuplicateActiveClass: "is-active",
    });

    // Track instance so destroySwipers() can clean it up on the next navigation
    swiperInstances.push(swiper);
  });
}

/* ── Gradient wave text ── */
function initGradientWaveText() {
  nextPage.querySelectorAll('[data-anim="wave"]').forEach((wrap) => {
    // Attribute sits on the richtext wrapper — split the actual heading inside
    const heading = wrap.matches("h1,h2,h3,h4,h5,h6,p")
      ? wrap
      : wrap.querySelector("h1,h2,h3,h4,h5,h6,p");
    if (!heading) return;

    // Colors resolved from the section theme (Lumos CSS vars cascade to the heading)
    const styles     = getComputedStyle(heading);
    const endColor   = styles.color;
    const [r, g, b]  = gsap.utils.splitColor(endColor);
    const startColor = `rgba(${r}, ${g}, ${b}, 0.1)`;
    const accent     = styles.getPropertyValue("--_theme---heading-accent").trim()
                    || styles.getPropertyValue("--swatch--brand").trim()
                    || endColor;
    const waveColor  = gsap.utils.interpolate(endColor, accent, 0.65); // accent tint strength

    if (reducedMotion) return; // heading keeps its base color, no split

    const split = new SplitText(heading, {
      type: 'words, chars',
      autoSplit: true,
      onSplit(self) {
        const chars = self.chars;
        const activeChars = new Set();
        const progress = { value: 0 };
        let isReady = false;

        const syncChars = () => {
          const activeCount = Math.round(progress.value * chars.length);
          chars.forEach((char, index) => {
            const isActive = index < activeCount;
            gsap.killTweensOf(char);
            gsap.set(char, { color: isActive ? endColor : startColor });
            if (isActive) activeChars.add(char);
            else activeChars.delete(char);
          });
        };

        const ctx = gsap.context(() => {
          gsap.set(chars, { color: startColor });
          gsap.to(progress, {
            value: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: heading,
              start: 'top 90%',
              end: 'center 40%',
              scrub: 0.1,
              onRefresh: () => {
                isReady = false;
                syncChars();
                requestAnimationFrame(() => { isReady = true; });
              }
            },
            onUpdate: () => {
              if (!isReady) return;
              const activeCount = Math.round(progress.value * chars.length);
              chars.forEach((char, index) => {
                const isActive = index < activeCount;
                if (isActive && !activeChars.has(char)) {
                  activeChars.add(char);
                  gsap.killTweensOf(char);
                  gsap.timeline()
                    .to(char, { color: waveColor, duration: 0.1,  ease: 'power2.out' })
                    .to(char, { color: endColor,  duration: 0.22, ease: 'power2.in'  });
                }
                if (!isActive && activeChars.has(char)) {
                  activeChars.delete(char);
                  gsap.killTweensOf(char);
                  gsap.to(char, { color: startColor, duration: 0.2, ease: 'none' });
                }
              });
            }
          });
        }, heading);
        return ctx;
      }
    });

    splitInstances.push(split); // reverted in barba.hooks.before
  });
}

/* ── Gradient wave text — load version (plays once on enter) ── */
function initGradientWaveLoad() {
  nextPage.querySelectorAll('[data-anim="wave-load"]').forEach((wrap) => {
    const heading = wrap.matches("h1,h2,h3,h4,h5,h6,p")
      ? wrap
      : wrap.querySelector("h1,h2,h3,h4,h5,h6,p");
    if (!heading) return;
    if (heading.closest(".crisp-header")) return; // crisp loader owns its heading reveal

    const styles     = getComputedStyle(heading);
    const endColor   = styles.color;
    const [r, g, b]  = gsap.utils.splitColor(endColor);
    const startColor = `rgba(${r}, ${g}, ${b}, 0.1)`;
    const accent     = styles.getPropertyValue("--_theme---heading-accent").trim()
                    || styles.getPropertyValue("--swatch--brand").trim()
                    || endColor;
    const waveColor  = gsap.utils.interpolate(endColor, accent, 0.65);

    if (reducedMotion) return; // heading keeps its base color, no split

    // Double split: chars first (kept permanently — reverting char spans causes a
    // kerning snap), then lines wrapped around them for the masked reveal.
    const splitChars = new SplitText(heading, { type: "words, chars" });
    const splitLines = new SplitText(heading, { type: "lines", mask: "lines" });
    splitInstances.push(splitChars, splitLines); // reverted (reverse order) in barba.hooks.before

    // Masks clip ascenders/descenders — pad them out, pull back with negative margin.
    // inline-block prevents sibling margin collapsing (block masks net +0.15em per line gap).
    gsap.set(splitLines.masks, {
      display: "inline-block", width: "100%", verticalAlign: "top",
      padding: "0.15em 0", margin: "-0.15em 0"
    });

    gsap.set(splitChars.chars, { color: startColor });

    // Revert lines only on complete: masks unwrap (fixes resize reflow),
    // char spans stay so letter spacing never snaps.
    const tl = gsap.timeline({ delay: 0.15, onComplete: () => splitLines.revert() });

    // No opacity on lines — the chars' 10% alpha startColor IS the fade-in,
    // and the wave sweep is what brings them to full color (keeps it visible).
    tl.from(splitLines.lines, {
      yPercent: 110, duration: 1.2, ease: "osmo", stagger: 0.12
    }, 0);

    // Wave starts once lines have essentially landed — a color pulse on moving
    // text isn't perceptible. Keyframes = guaranteed rise→hold→decay per char.
    tl.to(splitChars.chars, {
      keyframes: [
        { color: waveColor, duration: 0.25, ease: "power2.out" },
        { color: endColor,  duration: 0.6,  ease: "power2.in"  }
      ],
      stagger: 0.035
    }, 0.9);
  });
}

/* ── Crisp loader: build slider slides from the loader images ──
   The component has ONE image list (the Images slot). Slides are generated
   from it so the client edits a single list. Idempotent per container. */
/* ── Crisp header prep: rotate the featured image into the middle slot and
   build the slider slides. Runs on first load (from the loader) AND in
   beforeEnter on Barba navigations — the slider must be populated and
   correct BEFORE the new page slides in, not after. ── */
function prepCrispHeader(header) {
  const group = header.querySelector(".crisp-loader__group.is--relative");
  if (group) {
    // The fullscreen image is whichever single sits at the CENTER. If the
    // client checked "Featured" on one Loader Image, rotate it into the
    // middle before building slides (and, on first load, cloning).
    const singles = [...group.querySelectorAll(".crisp-loader__single")];
    const isFeatured = (s) => {
      const m = s.querySelector("[data-featured-marker]");
      return !!m && getComputedStyle(m).display !== "none";
    };
    const featIndex = singles.findIndex(isFeatured);
    const targetMid = Math.floor(singles.length / 2);
    if (featIndex !== -1 && featIndex !== targetMid) {
      const feat = singles[featIndex];
      const mid  = singles[targetMid];
      const parent = mid.parentNode;
      const midNext = mid.nextSibling;
      feat.parentNode.insertBefore(mid, feat);
      parent.insertBefore(feat, midNext === feat ? mid : midNext);
    }
  }
  buildCrispSlides(header);
}

function buildCrispSlides(header) {
  const list  = header.querySelector(".crisp-header__slider-list");
  const group = header.querySelector(".crisp-loader__group.is--relative");
  if (!list || !group || list.children.length) return;

  const imgs = group.querySelectorAll(".crisp-loader__cover-img");
  const midIndex = Math.floor(imgs.length / 2);

  imgs.forEach((img, i) => {
    const slide = document.createElement("div");
    slide.className = "crisp-header__slider-slide";
    if (i === midIndex) slide.classList.add("is--current"); // loader hands off on the middle image
    slide.setAttribute("data-slideshow", "slide");

    const inner = document.createElement("img");
    inner.className = "crisp-header__slider-slide-inner";
    inner.setAttribute("data-slideshow", "parallax");
    inner.setAttribute("draggable", "false");
    inner.src = img.currentSrc || img.src;
    if (img.srcset) inner.srcset = img.srcset;
    inner.sizes = "100vw"; // slides are always fullscreen — force the largest variant
    inner.loading = "eager";
    inner.alt = img.alt || "";

    slide.appendChild(inner);
    list.appendChild(slide);
  });
}

/* ── Crisp hero visual: the video/image background behind the hero ──
   Designer default is opacity 0. Revealed in lockstep with the featured
   media's fullscreen growth ("grow"), video started on the same beat, so
   the loader's final frame cuts to an already-live hero (featured image
   and hero visual are the same asset — a match cut). Every non-loader
   path (reduced motion, Barba soft nav, missing loader markup) shows it
   instantly instead. Video plays muted/inline; skipped under reduced
   motion (ambient motion is exactly what that setting refuses). */
function showHeroVisual(scope, animate) {
  const visual = scope.querySelector(".hero-visual");
  if (!visual) return null;
  const video = visual.querySelector("video");
  const play = () => {
    if (video && !reducedMotion) {
      video.muted = true;
      video.playsInline = true;
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    }
  };
  if (!animate) {
    gsap.set(visual, { autoAlpha: 1 });
    play();
  }
  return { visual, play };
}

/* ── Crisp loader (Osmo) — first load only, called from runPageOnceAnimation ── */
function initCrispLoader(container) {
  const header = container.querySelector(".crisp-header");
  if (!header) {
    crispLoaderDone = true;
    return Promise.resolve();
  }

  // The loader owns the viewport: force the page to the top (refresh must
  // never land mid-page on a crisp page) and lock scrolling until the
  // loader hands off. Released in finish(); afterEnter's own restore is a
  // harmless second pass.
  window.scrollTo(0, 0);
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
  document.documentElement.style.overflow = "hidden";
  if (lenis?.stop) lenis.stop();

  return document.fonts.ready.then(() => new Promise((resolve) => {
    const groups = header.querySelector(".crisp-loader__groups");
    const group  = header.querySelector(".crisp-loader__group.is--relative");
    const heading = header.querySelectorAll("h1");

    let releaseFrame = null; // set by the grow phase when the hero visual is the frame

    const finish = () => {
      // Hero visual back to its stylesheet geometry FIRST: it is already
      // sitting on its natural rect, so the release is invisible.
      releaseFrame?.();
      header.classList.remove("is--loading");
      crispLoaderDone = true;
      // Release the scroll lock taken at loader start
      document.documentElement.style.overflow = "";
      if (lenis?.start) lenis.start();
      if (hasScrollTrigger) ScrollTrigger.refresh();
      lenis?.resize();
      resolve();
    };

    if (reducedMotion || !groups || !group) {
      header.classList.remove("is--hidden");
      showHeroVisual(header, false);
      finish();
      return;
    }

    // Un-hide BEFORE measuring: is--hidden is display:none, which makes every
    // getBoundingClientRect() return 0 and silently breaks the px travel math.
    // The h1 words are set below in the same synchronous task — no flash.
    header.classList.remove("is--hidden");

    // High-res prep: these images end up fullscreen, so force the largest
    // responsive variant and eager loading before anything animates.
    header.querySelectorAll(".crisp-loader__cover-img").forEach((img) => {
      img.loading = "eager";
      if (img.srcset) img.sizes = "100vw";
    });

    // Featured rotation + slide build — shared with the Barba beforeEnter
    // path so returns to a crisp page show the right hero immediately.
    prepCrispHeader(header);

    // Loader-scope re-query (post-rotation order): the travel math below
    // needs the singles' width and count. NOTE: removing this line breaks
    // the whole loader with a runtime ReferenceError — it happened once.
    const singles = [...group.querySelectorAll(".crisp-loader__single")];

    // Two clones frame the client's group so the stream covers the full
    // viewport at landing: [dup]  [dup2]  [relative → lands centered].
    // dup ends left of center, dup2 (left:200%) ends right of it.
    // Inline positioning: zero dependency on Webflow combo styles.
    const dup = group.cloneNode(true);
    dup.classList.remove("is--relative");
    dup.classList.add("is--duplicate");
    dup.style.position = "absolute";
    dup.style.top = "0";
    dup.style.left = "0";
    groups.insertBefore(dup, group);

    const dup2 = group.cloneNode(true);
    dup2.classList.remove("is--relative");
    dup2.classList.add("is--duplicate");
    dup2.style.position = "absolute";
    dup2.style.top = "0"; // static position would sit BELOW the relative group
    dup2.style.left = "200%";
    // Appended AFTER the relative group: the stagger runs in DOM order, and the
    // spatial order left→right is dup, relative, dup2 — matching them keeps the
    // stream one continuous wave instead of three detached batches.
    groups.appendChild(dup2);

    const revealImages = groups.querySelectorAll(".crisp-loader__single");

    // Featured media = center of the client's list (post-rotation).
    const relImgs   = [...group.querySelectorAll(".crisp-loader__cover-img")];
    const midIndex  = Math.floor(relImgs.length / 2);
    const featMedia = group.querySelectorAll(".crisp-loader__media")[midIndex];

    // Scale down EVERY image in the stream — clones included, since full-bleed
    // keeps their edges visible at landing — except the real featured one.
    const isScaleDown = [...groups.querySelectorAll(".crisp-loader__cover-img")]
      .filter((img) => !featMedia || !featMedia.contains(img));

    // Fullscreen growth via a FIXED ghost of the featured media: growing every
    // media's width inflates the group, which inflates groups, which inflates
    // the relative group's left:100% — the whole strip drifts right and the
    // wrong image ends up centered. A fixed clone has zero layout feedback:
    // it grows from the featured media's exact rect to exactly fullscreen.
    const ghost = featMedia?.cloneNode(true);
    if (ghost) {
      ghost.style.cssText = "position:fixed;display:none;margin:0;z-index:2;";
      header.querySelector(".crisp-loader").appendChild(ghost);
    }

    // Push groups: everything spatially left/right of the featured single —
    // they part outward in sync with the ghost's edges, recreating the
    // original "make room for the center image" motion.
    // Re-queried from the DOM: the `singles` array predates the featured
    // rotation, so its indices no longer match DOM order after a swap.
    const relSingles = [...group.querySelectorAll(".crisp-loader__single")];
    const pushLeft  = [...dup.querySelectorAll(".crisp-loader__single"), ...relSingles.slice(0, midIndex)];
    const pushRight = [...relSingles.slice(midIndex + 1), ...dup2.querySelectorAll(".crisp-loader__single")];

    const tl = gsap.timeline({
      defaults: { ease: "expo.inOut" },
    });

    let split;
    if (heading.length) {
      split = new SplitText(heading, { type: "words", mask: "words" });
      splitInstances.push(split); // reverted in barba.hooks.before on nav away
      gsap.set(split.words, { yPercent: 110 });
    }

    // Tags + Get Started stay hidden until they rise with the hero text.
    // The .is--loading CSS rule covers the pre-JS flash; these inline
    // values take over from here (inline beats the class rule, so the
    // fade-in below can run while is--loading is still on the header).
    // The embed rule hides the .hero-tags-flex CONTAINER — release it
    // inline here, since the hide/reveal is carried by its children.
    const tagsFlex = header.querySelector(".hero-tags-flex");
    if (tagsFlex) gsap.set(tagsFlex, { opacity: 1 });
    const heroBits = [
      ...header.querySelectorAll(".hero-tags-flex > *"),
      header.querySelector(".content-wrapper.is-home-hero > div:nth-child(2)"),
    ].filter(Boolean);
    if (heroBits.length) gsap.set(heroBits, { autoAlpha: 0 });

    const TRAVEL_DUR = 2.3;
    const TRAVEL_STAGGER = 0.05;

    if (revealImages.length) {
      // Landing: the relative group sits at left:100% (one group width), so a
      // travel of exactly -groupWidth centers it. Start: measured so the lead
      // single sits just past the right viewport edge on ANY screen width —
      // nothing is visible before the stream flies in.
      const singleW = singles[0]?.getBoundingClientRect().width || 0;
      const groupW  = singleW * singles.length;
      const startX  = (window.innerWidth + groupW) / 2 + singleW * 0.5;
      // opacity:1 inline releases the embed's pre-JS hide rule
      // (.is--loading .crisp-loader__single { opacity: 0 }) in the same
      // atomic set as the offscreen park — never visible in place.
      tl.fromTo(revealImages, { x: startX, opacity: 1 }, {
        x: -groupW, duration: TRAVEL_DUR,
        stagger: TRAVEL_STAGGER,
      });
    }

    // The featured single lands at its own stagger slot — the grow phase
    // fires the instant it settles, no waiting for trailing offscreen singles.
    // DOM index of featured = dup group (n singles) + midIndex.
    const featLand = (singles.length + midIndex) * TRAVEL_STAGGER + TRAVEL_DUR;
    tl.addLabel("grow", featLand);

    // Hero visual: hidden through the stream (Designer default is 0 too),
    // then it BECOMES the growing frame — see the grow phase below.
    const hero = showHeroVisual(header, true);
    if (hero) gsap.set(hero.visual, { autoAlpha: 0 });

    // Neighbours shrink WHILE the featured grows — same start, same pace.
    if (isScaleDown.length) {
      tl.to(isScaleDown, {
        scale: 0.5,
        duration: 1.7,
      }, "grow");
    }

    /* ── The growing frame ──
       WITH a hero visual: the real hero background (the client's video) is
       the frame. FLIP: measure its natural home while it is still in flow,
       pin it position:fixed onto the featured media's exact rect, grow it
       back to that home in the featured's own 1.7s expo.inOut, and let
       finish() clear the inline geometry — it is already there, so the
       release is a no-op visually. One element, one video, no clone, no
       hand-off cut: the loader frame simply continues as the hero.
       WITHOUT one: the fixed ghost clone of the featured image, as before.
       Both rects are taken relative to the header: position:fixed resolves
       against it (it carries the perspective transform), and the header is
       the ghost's containing block too — same coordinate space either way. */
    if (featMedia && ghost) {
      const FRAME_DUR = 1.7;
      // Video cross-fade: slow, and CENTERED on the growth's peak — the
      // expo.inOut midpoint, where the frame moves fastest and the eye reads
      // motion, not texture. The ghost (the still) grows underneath the whole
      // way, so the first half of the growth is never empty.
      const FADE_DUR   = 1.0;
      const FADE_START = (FRAME_DUR - FADE_DUR) / 2; // 0.35 → fade runs 0.35–1.35
      const VIDEO_PREROLL = 0.2; // video starts this early, still invisible,
                                 // so its start latency never shows
      if (hero) tl.call(hero.play, null, `grow+=${FADE_START - VIDEO_PREROLL}`);

      tl.call(() => {
        const r  = featMedia.getBoundingClientRect();
        const hb = header.getBoundingClientRect();
        const from = { left: r.left - hb.left, top: r.top - hb.top, width: r.width, height: r.height };

        // Where the frame grows TO: the hero visual's natural home when there
        // is one (ghost and visual stay superposed to the pixel), else fullscreen.
        let to = { left: 0, top: 0, width: "100vw", height: "100dvh" };
        if (hero) {
          const n = hero.visual.getBoundingClientRect();
          to = { left: n.left - hb.left, top: n.top - hb.top, width: n.width, height: n.height };
        }

        // The still grows first and always — it is the featured, continuing
        gsap.set(ghost, { display: "flex", ...from });
        gsap.to(ghost, { ...to, duration: FRAME_DUR, ease: "expo.inOut" });

        if (hero) {
          // The video rides the same path, on top, fading in around the peak
          gsap.set(hero.visual, { position: "fixed", ...from });
          gsap.to(hero.visual, { ...to, duration: FRAME_DUR, ease: "expo.inOut" });
          gsap.to(hero.visual, {
            autoAlpha: 1, duration: FADE_DUR, delay: FADE_START, ease: "power2.inOut",
          });
          releaseFrame = () => gsap.set(hero.visual, { clearProps: "position,left,top,width,height" });
        }

        // Part the neighbours in lockstep with the frame's opening edges:
        // left side travels exactly -r.left, right side +(vw - r.right).
        // overwrite:auto kills any still-running travel tween on the trailing
        // offscreen singles so the two never fight over x.
        gsap.to(pushLeft, {
          x: `-=${r.left}`, duration: FRAME_DUR, ease: "expo.inOut", overwrite: "auto",
        });
        gsap.to(pushRight, {
          x: `+=${window.innerWidth - r.right}`, duration: FRAME_DUR, ease: "expo.inOut", overwrite: "auto",
        });
      }, null, "grow");

      // Timeline spine: the frame tween runs outside the timeline (its end
      // values are measured at grow time), so hold the grow slot's length
      // here — textIn / finish keep their exact offsets from it.
      tl.to({}, { duration: FRAME_DUR }, "grow");
    }

    tl.addLabel("textIn", "-=0.75");
    if (split && split.words.length) {
      tl.to(split.words, {
        yPercent: 0, stagger: 0.075, ease: "expo.out", duration: 0.9
      }, "textIn");
    }

    // Tags + Get Started rise on the same beat as the hero text,
    // trailing it by a breath.
    if (heroBits.length) {
      tl.fromTo(heroBits,
        { autoAlpha: 0, y: "1.5rem" },
        { autoAlpha: 1, y: "0rem", stagger: 0.06, ease: "expo.out", duration: 0.9 },
        "textIn+=0.15"
      );
    }

    tl.call(finish, null, "+=0.35");
  }));
}

/* ── Slideshow (Osmo, crisp header hero) ── */
function initSlideshows() {
  nextPage.querySelectorAll('[data-slideshow="wrap"]').forEach((el) => {
    if (el.dataset.slideshowInit) return;
    el.dataset.slideshowInit = "true";

    // Slides are generated from the loader image list — on Barba navigations
    // the loader is skipped, so make sure they exist before wiring.
    if (el.classList.contains("crisp-header")) buildCrispSlides(el);

    const ui = {
      slides: Array.from(el.querySelectorAll('[data-slideshow="slide"]')),
      inner:  Array.from(el.querySelectorAll('[data-slideshow="parallax"]')),
      thumbs: Array.from(el.querySelectorAll('[data-slideshow="thumb"]')),
    };
    if (!ui.slides.length) return;

    let current = Math.max(0, ui.slides.findIndex((s) => s.classList.contains("is--current")));
    const length = ui.slides.length;
    let animating = false;
    const animationDuration = 1.5;

    ui.slides.forEach((slide, index) => slide.setAttribute("data-index", index));
    ui.thumbs.forEach((thumb, index) => thumb.setAttribute("data-index", index));
    ui.slides[current].classList.add("is--current");
    ui.thumbs[current]?.classList.add("is--current");

    function navigate(direction, targetIndex = null) {
      if (animating) return;
      animating = true;
      const previous = current;
      current =
        targetIndex !== null && targetIndex !== undefined
          ? targetIndex
          : direction === 1
            ? (current < length - 1 ? current + 1 : 0)
            : (current > 0 ? current - 1 : length - 1);

      const currentSlide  = ui.slides[previous];
      const currentInner  = ui.inner[previous];
      const upcomingSlide = ui.slides[current];
      const upcomingInner = ui.inner[current];

      gsap.timeline({
        defaults: { duration: animationDuration, ease: "osmo" }, // same curve as Osmo's slideshow-wipe
        onStart() {
          upcomingSlide.classList.add("is--current");
          ui.thumbs[previous]?.classList.remove("is--current");
          ui.thumbs[current]?.classList.add("is--current");
        },
        onComplete() {
          currentSlide.classList.remove("is--current");
          animating = false;
        }
      })
        .to(currentSlide, { xPercent: -direction * 100 }, 0)
        .to(currentInner, { xPercent: direction * 75 }, 0)
        .fromTo(upcomingSlide, { xPercent: direction * 100 }, { xPercent: 0 }, 0)
        .fromTo(upcomingInner, { xPercent: -direction * 75 }, { xPercent: 0 }, 0);
    }

    ui.thumbs.forEach(thumb => {
      thumb.addEventListener("click", (event) => {
        const targetIndex = parseInt(event.currentTarget.getAttribute("data-index"), 10);
        if (targetIndex === current || animating) return;
        navigate(targetIndex > current ? 1 : -1, targetIndex);
      });
    });
  });
}

/* ── Parallax ── */
function initParallax() {
  // Supports both spellings: existing markup uses data-parralax (typo),
  // new elements can use data-parallax — migrate at leisure.
  gsap.utils.toArray(
    nextPage.querySelectorAll('[data-parralax="True"], [data-parallax="True"]')
  ).forEach(section => {
    const media = section.querySelector(".u-image, video");
    if (!media) return;

    gsap.fromTo(media, { yPercent: 0 }, {
      yPercent: -15,
      ease: "none",
      scrollTrigger: {
        trigger: section,
        start: "top bottom",
        end:   "bottom top",
        scrub: true,
      }
    });
  });
}

/* ── Radio filter: "All" button active state ── */
function initRadioFilter() {
  const radioList = nextPage.querySelector(".filters-coll-list");
  if (!radioList) return;

  function updateAllRadio() {
    const labels = radioList.querySelectorAll(".filter-btn.w-radio");
    const [firstLabel, ...otherLabels] = labels;
    if (!firstLabel) return;
    const anyOtherActive = otherLabels.some(l => l.classList.contains("is-active"));
    firstLabel.classList.toggle("is-active", !anyOtherActive);
  }

  updateAllRadio(); // run immediately on init

  const obs = new MutationObserver(updateAllRadio);
  obs.observe(radioList, { attributes: true, attributeFilter: ["class"], subtree: true });
  activeObservers.push(obs); // will be disconnected on next transition
}

/* ── Finsweet CMS observer: refresh ST when list mutates ── */
function initFsObserver() {
  const cmsList = nextPage.querySelector('[fs-cmsfilter-element="list"]');
  if (!cmsList) return;

  const obs = new MutationObserver(() => {
    if (hasScrollTrigger) ScrollTrigger.refresh();
  });
  obs.observe(cmsList, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
  activeObservers.push(obs);
}

/* ── Accordions ── */
function initAccordions() {
  nextPage.querySelectorAll(".accordion_wrap").forEach((component, listIndex) => {
    if (component.dataset.scriptInitialized) return;
    component.dataset.scriptInitialized = "true";

    const closePrevious      = component.getAttribute("data-close-previous")       !== "False";
    const closeOnSecondClick = component.getAttribute("data-close-on-second-click")!== "False";
    const openOnHover        = component.getAttribute("data-open-on-hover")         === "True";
    const animateContent     = component.getAttribute("data-animate-content")       === "True";
    const openByDefault      = (() => {
      const v = component.getAttribute("data-open-by-default");
      return v !== null && !isNaN(+v) ? +v : false;
    })();

    const list = component.querySelector(".accordion_list");
    let previousIndex = null;
    const closeFunctions = [];

    function flattenDisplayContents(slot) {
      if (!slot) return;
      let child = slot.firstElementChild;
      while (child && child.classList.contains("u-display-contents")) {
        while (child.firstChild) slot.insertBefore(child.firstChild, child);
        slot.removeChild(child);
        child = slot.firstElementChild;
      }
    }
    flattenDisplayContents(list);

    function removeCMSList(slot) {
      const dynList = Array.from(slot.children).find(c => c.classList.contains("w-dyn-list"));
      if (!dynList) return;
      const nestedItems = dynList?.querySelector(".w-dyn-items")?.children;
      if (!nestedItems) return;
      const staticWrapper = [...slot.children];
      [...nestedItems].forEach(el => {
        const c = [...el.children].find(c => !c.classList.contains("w-condition-invisible"));
        if (c) slot.appendChild(c);
      });
      staticWrapper.forEach(el => el.remove());
    }
    removeCMSList(list);

    const syncedDuration = 0.5;
    const syncedEase     = "power4.inOut";
    const doRefresh      = () => { if (hasScrollTrigger) ScrollTrigger.refresh(); };

    component.querySelectorAll(".accordion_component").forEach((card, cardIndex) => {
      const button  = card.querySelector(".accordion_toggle_button");
      const content = card.querySelector(".accordion_content_wrap");
      const inner   = content?.querySelector(".accordion_content_padding");
      if (!button || !content) return console.warn("Accordion: missing elements in", card);

      button.setAttribute("aria-expanded",  "false");
      button.setAttribute("id",             `accordion_button_${listIndex}_${cardIndex}`);
      content.setAttribute("id",            `accordion_content_${listIndex}_${cardIndex}`);
      button.setAttribute("aria-controls",  content.id);
      content.setAttribute("aria-labelledby", button.id);

      gsap.set(content, { height: 0, display: "none", overflow: "hidden" });
      if (animateContent && inner) gsap.set(inner, { opacity: 0, y: 16 });

      const closeAccordion = () => {
        if (!card.classList.contains("is-active")) return;
        card.classList.remove("is-active");
        button.setAttribute("aria-expanded", "false");
        gsap.set(content, { overflow: "hidden" });

        if (animateContent && inner) {
          gsap.to(inner, {
            opacity: 0, y: closePrevious ? 16 : 10,
            duration: closePrevious ? syncedDuration * 0.4 : 0.2,
            ease:    closePrevious ? syncedEase : "power2.in",
            overwrite: true,
          });
        }

        gsap.to(content, {
          height: 0,
          duration: closePrevious ? syncedDuration : 0.45,
          ease:    closePrevious ? syncedEase : "power4.inOut",
          delay:   closePrevious ? 0 : 0.05,
          overwrite: true,
          onComplete: () => { gsap.set(content, { display: "none" }); doRefresh(); },
        });
      };
      closeFunctions[cardIndex] = closeAccordion;

      const openAccordion = (instant = false) => {
        if (closePrevious && previousIndex !== null && previousIndex !== cardIndex)
          closeFunctions[previousIndex]?.();
        previousIndex = cardIndex;
        button.setAttribute("aria-expanded", "true");
        card.classList.add("is-active");

        if (instant) {
          gsap.set(content, { display: "block", height: "auto", overflow: "visible" });
          if (animateContent && inner) gsap.set(inner, { opacity: 1, y: 0 });
          return;
        }

        gsap.set(content, { display: "block", overflow: "hidden" });
        gsap.fromTo(content, { height: 0 }, {
          height: "auto",
          duration: closePrevious ? syncedDuration : 0.6,
          ease:    closePrevious ? syncedEase : "expo.out",
          overwrite: true,
          onComplete: () => { gsap.set(content, { overflow: "visible" }); doRefresh(); },
        });

        if (animateContent && inner) {
          gsap.fromTo(inner, { opacity: 0, y: 16 }, {
            opacity: 1, y: 0,
            duration: closePrevious ? syncedDuration : 0.5,
            ease:    closePrevious ? syncedEase : "power3.out",
            delay:   closePrevious ? 0 : 0.1,
            overwrite: true,
          });
        }
      };

      if (openByDefault === cardIndex + 1) openAccordion(true);

      button.addEventListener("click", () =>
        card.classList.contains("is-active") && closeOnSecondClick
          ? (closeAccordion(), (previousIndex = null))
          : openAccordion()
      );

      if (openOnHover) button.addEventListener("mouseenter", () => openAccordion());
    });
  });
}



/* ── Footer reveal: content parallax + overlay fade + logo letters ──
   One scrubbed timeline, start "top bottom" → end "bottom bottom":
   progress 0 = footer top enters viewport, 1 = page fully scrolled.
   .footer_wrap is position:relative + overflow:hidden (CSS), and the
   overlay is absolute inset-0 dark @ opacity 0 — JS drives it 0.6→0. */
function initFooterReveal() {
  const footer = nextPage.querySelector(".footer_wrap");
  if (!footer || footer.dataset.footerInit) return;
  footer.dataset.footerInit = "true";

  const overlay = footer.querySelector(".footer-overlay");
  const logoSvg = footer.querySelector(".footer_logo_wrap svg");
  const letters = logoSvg ? [...logoSvg.querySelectorAll("path")] : [];
  // Everything except the overlay drifts. Transforms don't affect layout,
  // so the footer keeps its height — overflow:hidden clips the offset.
  const parts = [...footer.children].filter(el => el !== overlay);

  if (reducedMotion) {
    if (overlay) gsap.set(overlay, { opacity: 0 });
    return;
  }

  // Letters rise from below the viewBox — the svg element itself is the
  // mask (UA default overflow:hidden, made explicit here to be safe).
  if (logoSvg) gsap.set(logoSvg, { overflow: "hidden" });

  const pageContent = nextPage.querySelector(".page_content");

  // Perspective and origin must be SET-ONCE state, never tweened: inside a
  // .to() they interpolate — perspective sweeps up from 0 (extreme fisheye
  // in the early frames) while the hinge migrates from 50% 50% to 50% 90%.
  // So: prime on activation, clear when inactive — the transform existing
  // only while active is what keeps the fixed crisp hero working.
  const primeContent = () => {
    if (pageContent) gsap.set(pageContent, {
      transformPerspective: mwgPersp(),
      transformOrigin: "50% 90%",
      force3D: true,
    });
  };
  const clearContent = () => {
    if (pageContent) gsap.set(pageContent, { clearProps: "transform" });
  };

  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: footer,
      start: "top bottom",
      end: "bottom bottom",
      scrub: true,
      onEnter: primeContent,
      onEnterBack: primeContent,
      onLeaveBack: clearContent,
      onRefresh(self) { self.isActive ? primeContent() : clearContent(); },
    },
  });

  // START STATES ARE BAKED WITH set(), AND EVERY SCRUB TWEEN IS A .to().
  // Reason: ScrollTrigger.refresh() temporarily REVERTS scrubbed tweens to
  // measure clean layout. Reverting a .to lands on the set() state — the
  // same thing the eye already sees at progress 0 — so refreshes (which
  // our transitions fire twice) are invisible. The previous fromTo/from
  // versions reverted to the UNANIMATED state (parts at 0, overlay off,
  // logo straight), flashing visibly mid-transition on pages where the
  // footer sits near the first viewport. Only the footer had this bug
  // because only the footer used fromTo.
  gsap.set(parts, { yPercent: -65 });

  // Content catch-up parallax: starts shifted up, settles at natural position
  tl.to(parts, { yPercent: 0, duration: 1.5 }, 0);
  if (pageContent) {
    // MWG language, inverted. The service cards are DEPARTING planes seen
    // from their TOP edge — hinge at the top (origin 50% 10%), positive
    // rotationX. Here the page content is also a departing plane, but we
    // see its BOTTOM edge as it exits upward, so the recipe mirrors:
    // hinge at the bottom (origin 50% 90%), NEGATIVE rotationX, angle
    // scaled way down for the full-page surface. Only animatable values
    // live in this tween — perspective/origin are primed above.
    tl.to(pageContent, {
      rotationX: -14,
      rotate: "-4.25deg",
      y: "-3rem",
      scale: 0.93,
      ease: "power1.in",
      duration: 1.5,
    }, 0);
  }
  const logoWrap = footer.querySelector(".footer_logo_wrap");
  if (logoWrap) {
    gsap.set(logoWrap, { rotate: "3.5deg", y: "10rem" });
    tl.to(logoWrap, { rotate: "0deg", y: "0rem", ease: "power1.in", duration: 1.5 }, 0);
  }

  // Dark overlay lifts as the footer lands
  if (overlay) {
    gsap.set(overlay, { opacity: 0.8 });
    tl.to(overlay, { opacity: 0, duration: 1.2 }, 0);
  }

  // Logo letters — parked for later, revisit once the footer motion is locked.
  // if (letters.length) {
  //   tl.fromTo(letters,
  //     { yPercent: 20, opacity: 1 },
  //     { yPercent: 0, opacity: 1, duration: 1.2, ease: "power4.out", stagger: 0.05 }, 0);
  // }

  // During a Barba transition the footer scrub must not render AT ALL:
  // the container itself carries perspective+rotationX while sliding in,
  // and a page_content tilt nested inside a tilted, perspectived parent
  // composes into visible warping — then pops when the container's
  // clearProps lands. The baked set() states above are the correct
  // "pre-reveal" look for an arriving page, so the trigger sleeps through
  // the transition and afterEnter wakes it against clean geometry.
  if (inTransition && tl.scrollTrigger) {
    tl.scrollTrigger.disable(false);
    clearContent(); // undo any prime from the creation-time refresh
    pendingFooterST = tl.scrollTrigger;
  }
}


/* ── Stacking service cards (MWG 031 adaptation) ──
   The MWG demo pins each slide with ScrollTrigger while the next covers
   it. Our .stacking-services-card is already position:sticky (top: 15rem)
   — CSS does the pinning, so each card only needs the tilt-away scrub:
   as the NEXT card travels from viewport bottom up to the sticky offset,
   the current card rotates back in 3D, shrinks, twists, then fades.
   Last card has no successor and never animates. Reduced motion: the
   CSS sticky stack still works with zero JS. */
function initStackingServiceCards() {
  const list = nextPage.querySelector(".stacking-services-card-list");
  if (!list || list.dataset.stackInit) return;
  list.dataset.stackInit = "true";

  const cards = [...list.querySelectorAll(".stacking-services-card")];
  if (cards.length < 2) return;

  // Each card's tint is a CSS formula on sibling-index(); a child can't
  // inherit that (custom properties re-evaluate the index on the child,
  // and Safari won't resolve it inside a registered property). So the
  // icon copies the card's COMPUTED colour — engine-agnostic, one read.
  cards.forEach((card) => {
    const bg = getComputedStyle(card).backgroundColor;
    if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") return;
    card.querySelectorAll(".service-icon").forEach((icon) => { icon.style.backgroundColor = bg; });
  });

  // Pin cards exactly below the pinned header: the cards' sticky top is
  // driven by the header's real rendered height instead of a hardcoded
  // 15rem, and follows it on resize / font load / content changes.
  // Runs regardless of reduced motion — this is layout, not animation.
  const header = nextPage.querySelector(".sticky-services-header");
  if (header) {
    const syncOffset = () => {
      const h = header.offsetHeight;
      cards.forEach(c => { c.style.top = h + "px"; });
    };
    syncOffset();
    const ro = new ResizeObserver(() => {
      syncOffset();
      ScrollTrigger.refresh(); // start/end are function-based — recomputed here
    });
    ro.observe(header);
    activeObservers.push(ro); // disconnected in barba.hooks.before
  }

  if (reducedMotion) return;

  // Read the sticky offset from CSS so JS and Designer never drift
  const stickyTop = () => parseFloat(getComputedStyle(cards[0]).top) || 0;

  cards.forEach((card, i) => {
    const next = cards[i + 1];

    // Last card runs a softened, EARLIER version: it has no covering card
    // to sync its motion with, so it leads its pin by 20vh (settles in as
    // it arrives) and fronts its motion with power1.out — power1.in hides
    // the first half of a scrub, which made it look like a later trigger.
    const soft = !next;
    const lead = () => (soft ? window.innerHeight * 0.2 : 0);

    // Prime the 3D state before any scroll: promotes the card to its GPU
    // layer now, so the first animated frame doesn't pop/flicker.
    gsap.set(card, {
      transformPerspective: mwgPersp(),
      transformOrigin: "50% 10%",
      rotationX: 0.001,
      force3D: true,
    });

    const st = {
      trigger: card,
      // Same anchor for every card — the pin point. The soft card starts
      // its lead earlier and ends its lead later, so it completes at the
      // same scroll position it would have without the lead.
      start: () => "top " + (stickyTop() + lead()),
      // Runway: distance to the next card, or — for the last card, which
      // has no successor — the same gap it has with its predecessor, so
      // its tempo matches the others.
      end: () =>
        "+=" +
        (lead() +
          (next
            ? next.offsetTop - card.offsetTop
            : card.offsetTop - cards[i - 1].offsetTop)),
      scrub: 0.75, // catch-up smoothing — raw scrub jumps on a short runway
      invalidateOnRefresh: true,
    };

    const tl = gsap.timeline({
      defaults: { ease: soft ? "power1.out" : "power1.in" },
      scrollTrigger: st,
    });

    tl.to(card, {
      rotationX: soft ? 24 : 40,
      rotationZ: gsap.utils.random(-1, 1) * (soft ? 2.5 : 5), // MWG's random z-tilt
      scale: soft ? 0.88 : 0.7,
      duration: 1,
    }, 0);

    // Clean-exit fade for covered cards only — card heights vary, so a
    // shorter successor could leave the old card peeking.
    if (!soft) tl.to(card, { autoAlpha: 0, duration: 0.5, ease: "none" }, 0.5);
  });
}


/* ── Nav: hide on scroll down, return on scroll up ──
   Rebuilt on every navigation (the ST dies in the standard teardown), so
   it works whether the nav is persistent or currently inside the barba
   container. Module-level handle instead of a dataset guard: allpages runs
   twice per navigation (beforeEnter + afterEnter safety pass) and the nav
   element may persist across pages, so kill-and-recreate is the guard. */
/* Shared nav lookup — the placed component's root class is `.nav`;
   `.nav_component` and [data-theme-nav] kept as fallbacks so a component
   swap doesn't silently kill the nav features again. */
const getNav = () => document.querySelector("[data-theme-nav], .nav, .nav_component");

let navScrollST = null;
function initNavScroll() {
  const nav = getNav();
  if (!nav || !hasScrollTrigger) return;
  navScrollST?.kill();
  // NOTE: no yPercent reset here — the before-hook glide tween owns that
  // (a hard set here stomped it instantly: two writers, one property).

  let hidden = false;
  navScrollST = ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate(self) {
      const shouldHide = self.direction === 1 && self.scroll() > 80;
      if (shouldHide === hidden) return;
      hidden = shouldHide;
      gsap.to(nav, {
        yPercent: shouldHide ? -100 : 0,
        duration: reducedMotion ? 0 : 0.45,
        ease: "osmo",
        overwrite: "auto",
      });
    },
  });
}

/* ── Nav theme follows the section under it ──
   Rule: u-theme-light and u-theme-brand sections under the nav → light
   nav; u-theme-dark (and anything else) → dark nav.
   Architecture: ONE ScrollTrigger + a measured boundary table, instead of
   per-section toggles. Toggle callbacks between adjacent sections have no
   guaranteed order (stale theme on fast/reverse scroll); a pure function
   of scrollY can't race and works identically in both directions.
   Barba: this runs in beforeEnter's clean-geometry moment at scroll 0, so
   the evaluation at the end picks the NEXT page's first section and sets
   the nav before the transition's first frame. */
const NAV_PROBE = 48; // px below viewport top ≈ the nav strip

function navThemeFor(el) {
  return el.classList.contains("u-theme-light") || el.classList.contains("u-theme-brand")
    ? "light"
    : "dark";
}

function setNavTheme(theme) {
  const nav = getNav();
  if (!nav || nav.dataset.navTheme === theme) return;
  nav.dataset.navTheme = theme;
  nav.dataset.themeNav = theme; // legacy attribute kept in sync
  nav.classList.toggle("u-theme-light", theme === "light");
  nav.classList.toggle("u-theme-dark", theme === "dark");
}

// Transform-immune document offset (getBoundingClientRect would measure
// mid-tilt cards wrong; offsetTop chains ignore transforms).
function absTop(el) {
  let y = 0;
  for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
  return y;
}

let navThemeST = null;
let navThemeApply = null;
let navThemeHold = false;
const NAV_THEME_SWITCH_DELAY = 0.7; // s INTO the enter timeline — anchored to the choreography

// Called from inside the enter timeline at the switch beat (and directly
// on the reduced-motion path). Timeline-anchored: no wall-clock timer to
// be killed or preempted by re-inits and refreshes.
function releaseNavTheme() {
  navThemeHold = false;
  navThemeApply?.();
}

function initNavTheme() {
  const nav = getNav();
  if (!nav || !hasScrollTrigger) return;
  navThemeST?.kill();

  // Section-level themed blocks inside the container, PLUS the crisp
  // header — the fullscreen hero counts as a section even without (or
  // with a filtered-out) u-theme class; navThemeFor still reads its
  // u-theme-* class if present, and defaults to dark (photo hero) if not.
  // A themed ancestor OUTSIDE the container (body / page wrapper carrying
  // a theme class) must not disqualify sections.
  const sections = [...nextPage.querySelectorAll('[class*="u-theme-"], .crisp-header')]
    .filter(el => {
      if (el.classList.contains("crisp-header")) return true;
      const themedAncestor = el.parentElement?.closest('[class*="u-theme-"]');
      return !themedAncestor || !nextPage.contains(themedAncestor);
    });
  if (!sections.length) return;

  let bounds = [];
  const measure = () => {
    bounds = sections
      // Unrendered blocks never vote. A display:none themed wrapper (the
      // Work template's empty `.cs-theme.u-hide-if-empty-cms` list) has
      // offsetTop 0 — the same top as the hero — and, coming later in
      // document order, won the tie and forced the nav light over a dark
      // hero. Re-measured on every refresh, so a list that fills in later
      // (Finsweet render) starts voting at its real position.
      .filter(el => el.offsetHeight > 0)
      .map(el => ({ top: absTop(el), theme: navThemeFor(el) }))
      .sort((a, b) => a.top - b.top);
    if (!bounds.length) bounds = [{ top: 0, theme: navThemeFor(sections[0]) }];
  };

  const apply = () => {
    if (navThemeHold) return; // during a transition, the delayed call releases this
    const line = window.scrollY + NAV_PROBE;
    let current = bounds[0]; // above the first section: use the first
    for (const b of bounds) {
      if (b.top <= line) current = b;
      else break;
    }
    setNavTheme(current.theme);
  };

  // The hold must engage BEFORE the trigger exists: ScrollTrigger.create()
  // fires its onRefresh synchronously at creation, which calls apply() —
  // setting the hold after creation (the previous ordering) let the theme
  // through at frame 0 of every transition.
  navThemeHold = inTransition;

  navThemeST = ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: apply,
    onRefresh() { measure(); apply(); },
  });

  navThemeApply = apply;
  measure();
  // During a Barba transition the enter timeline carries a
  // releaseNavTheme() call at the switch beat. If that call is ever
  // skipped (aborted transition), the afterEnter re-init lands here with
  // inTransition already false and applies immediately: self-healing.
  if (!inTransition) apply();
}

/* ── Home work stack (MWG 031, full strength) ──
   .home-work-item is sticky top:0 at 100vh per item — the demo's exact
   geometry, so it gets the untranslated recipe: pin via CSS sticky, tilt
   over one viewport of coverage, soft treatment for the uncovered last. */
function initHomeWorkStack() {
  const items = [...nextPage.querySelectorAll(".home-work-item")];
  if (items.length < 2) return;
  const list = items[0].parentElement;
  if (!list || list.dataset.workStackInit) return;
  list.dataset.workStackInit = "true";
  if (reducedMotion) return;

  const stickyTop = () => parseFloat(getComputedStyle(items[0]).top) || 0;

  items.forEach((item, i) => {
    const next = items[i + 1];
    const soft = !next;
    const lead = () => (soft ? window.innerHeight * 0.2 : 0);

    gsap.set(item, {
      transformPerspective: mwgPersp(),
      transformOrigin: "50% 10%",
      rotationX: 0.001,
      force3D: true,
    });

    const tl = gsap.timeline({
      defaults: { ease: soft ? "power1.out" : "power1.in" },
      scrollTrigger: {
        trigger: item,
        start: () => "top " + (stickyTop() + lead()),
        end: () =>
          "+=" +
          (lead() +
            (next
              ? next.offsetTop - item.offsetTop
              : item.offsetTop - items[i - 1].offsetTop)),
        scrub: 0.75,
        invalidateOnRefresh: true,
      },
    });

    tl.to(item, {
      rotationX: soft ? 24 : 40,
      rotationZ: gsap.utils.random(-1, 1) * (soft ? 2.5 : 5),
      scale: soft ? 0.88 : 0.7,
      duration: 1,
    }, 0);

    if (!soft) tl.to(item, { autoAlpha: 0, duration: 0.25, ease: "none" }, 0.75);
  });
}


/* ── Hero departure (MWG) ──
   Two hero species share the recipe:
   • .crisp-header (home) — sticky via its Designer styles.
   • .home-hero wrapper (About-style section heroes) — gets sticky inline
     here. The wrapper, not the inner section: a sticky child of a
     same-height parent has no travel room and never sticks. The :has()
     guard keeps home's wrapper (which contains the crisp header) from
     double-matching.
   Either way: pins at top, next section rides over it, first card in the
   site-wide stack. Runway = its own height. */
function initHeroDepart() {
  const hero =
    nextPage.querySelector(".crisp-header") ||
    nextPage.querySelector(".home-hero:not(:has(.crisp-header))");
  if (!hero || hero.dataset.heroDepartInit) return;
  hero.dataset.heroDepartInit = "true";
  if (reducedMotion) return;

  // Section heroes need the pin the crisp header gets from the Designer.
  // (Worth promoting to a `hero-depart` utility class in Webflow later —
  // inline layout from JS works but isn't the Lumos way.)
  if (!hero.classList.contains("crisp-header")) {
    gsap.set(hero, { position: "sticky", top: 0, zIndex: 0 });
  }

  gsap.set(hero, {
    transformPerspective: mwgPersp(),
    transformOrigin: "50% 10%",
    rotationX: 0.001,
    force3D: true,
  });

  const tl = gsap.timeline({
    defaults: { ease: "power1.in" },
    scrollTrigger: {
      trigger: hero,
      start: "top top",
      end: "bottom top",
      scrub: 0.75,
      invalidateOnRefresh: true,
    },
  });

  tl.to(hero, {
    rotationX: 45,
    rotationZ: gsap.utils.random(-7, 7),
    scale: 0.62,
    duration: 1,
    // LINEAR, deliberately — power1.in back-loads the motion into the
    // faded zone (at 50% scroll it had rendered only ~25% of the angle),
    // which is why bigger values kept reading subtle. Linear puts real
    // degrees on screen while the hero is still opaque.
    ease: "none",
  }, 0);

  // Fade starts early and breathes — by then the tilt is already showing.
  tl.to(hero, { autoAlpha: 0, duration: 0.5, ease: "none" }, 0.35);
}


/* ── MWG 028: infinite drag strip with hanging-card swing ──
   Collection-list adaptation. The demo duplicates its cards in markup and
   wraps x over exactly half the strip — the seam lands on identical
   pixels, which is what makes THIS loop seamless where a generic wrap
   isn't. We clone the CMS set once (same thing) and measure the exact
   set span for the wrap. Signature: while dragging, every card rotates
   from its bottom edge proportional to drag speed, springing upright on
   release — quickTo handles both channels. */
function initMwgCarousel() {
  nextPage.querySelectorAll("[data-mwg-carousel]").forEach((root) => {
    if (root.dataset.mwgInit) return;
    root.dataset.mwgInit = "true";

    const strip = root.querySelector(".w-dyn-items");
    const originals = [...root.querySelectorAll(".w-dyn-item")];
    if (!strip || originals.length < 2) return;

    // Two identical sets = the loop's invisibility guarantee
    originals.forEach((it) => strip.appendChild(it.cloneNode(true)));
    const cards = [...strip.children];

    // Exact seam width: first clone's offset minus first original's —
    // immune to list padding and gap rounding (the demo's clientWidth/2
    // is close enough for them; this is exact for us).
    const half = cards[originals.length].offsetLeft - cards[0].offsetLeft;

    // Drag hygiene, per the demo's own CSS: images must be fully
    // transparent to pointers — draggable=false alone doesn't stop
    // Safari's native image drag, which aborts the Observer's pointer
    // sequence and made dragging work only in the gaps between cards.
    // Hover choreography survives: the :hover selectors target the
    // images' parent wrappers, which receive events over the image area.
    root.querySelectorAll("img").forEach((img) => {
      img.draggable = false;
      img.style.pointerEvents = "none";
      img.style.webkitUserDrag = "none";
    });
    gsap.set(root, { userSelect: "none" });

    const wrap = gsap.utils.wrap(-half, 0);
    const xTo = gsap.quickTo(strip, "x", {
      duration: 0.5,
      ease: "power3",
      modifiers: { x: gsap.utils.unitize(wrap) },
    });

    // One quickTo drives every card's swing in lockstep
    const rotateTo = gsap.quickTo(cards, "rotation", { duration: 1, ease: "power3" });

    let total = 0;
    let didDrag = false;

    let didDragReset = null;

    const gsapObs = Observer.create({
      target: strip,
      type: "touch,pointer",
      lockAxis: true, // vertical touch gestures pass through to page scroll
      onPress: () => { didDragReset?.kill(); didDrag = false; },
      onDrag: (self) => {
        if (self.axis === "y") return;
        // lockAxis can deliver its buffered first events as one packet —
        // cap per-event delta so the first drag never hops.
        const d = gsap.utils.clamp(-60, 60, self.deltaX);
        if (Math.abs(d) > 2) didDrag = true;
        total += d;
        xTo(total);
        // Swing angle: drag speed as a fraction of screen width
        rotateTo(-(d / window.innerWidth) * 100);
      },
      onRelease: () => {
        rotateTo(0);
        // The flag must outlive the click that follows this release (to
        // suppress it) but not the interaction — a stale flag was eating
        // every later click on the page section, arrows included.
        didDragReset = gsap.delayedCall(0.1, () => { didDrag = false; });
      },
      onStop: () => rotateTo(0),
    });

    // Guard card link-clicks against drag-releases — scoped to the STRIP,
    // not the section: the arrow controls live outside it and must never
    // pass through this.
    strip.addEventListener("click", (e) => {
      if (didDrag) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    // ── Trackpad: horizontal swipes arrive as wheel deltaX. Lenis only
    // consumes deltaY, so the inputs divide cleanly: vertical swipes
    // scroll the page, horizontal swipes drive the strip. Sign mapped so
    // fingers-right moves content right, matching touch drag.
    const wheelObs = Observer.create({
      target: root,
      type: "wheel",
      onChangeX: (self) => {
        const d = gsap.utils.clamp(-60, 60, -self.deltaX);
        if (d === 0) return;
        total += d;
        xTo(total);
        rotateTo(-(d / window.innerWidth) * 100);
      },
      onStop: () => rotateTo(0),
    });

    // ── Arrows: the section's Button Arrow instances, identified by their
    // data-slider attributes (already set in the Designer). One card-step
    // per click — pure glide, no swing (the rotation belongs to physical
    // input: drag and trackpad only).
    const step = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : 0;
    const nudge = (dir) => {
      total -= dir * step;
      xTo(total);
    };
    const prevBtn = root.querySelector('[data-slider="previous"]');
    const nextBtn = root.querySelector('[data-slider="next"]');
    prevBtn?.addEventListener("click", (e) => { e.preventDefault(); nudge(-1); });
    nextBtn?.addEventListener("click", (e) => { e.preventDefault(); nudge(1); });

    // Lifecycle: ride the existing teardown — the before hook calls
    // disconnect() on everything in activeObservers.
    activeObservers.push({
      disconnect() {
        gsapObs.kill();
        wheelObs.kill();
        didDragReset?.kill();
        gsap.killTweensOf(strip);
        gsap.killTweensOf(cards);
      },
    });
  });
}


/* ── CTA entrance: the stand-up (MWG language, arrival side) ──
   Opt-in via [section-cta] / [data-section-cta]. Unique on purpose:
   every other 3D move on the site TIPS AWAY (departures, top hinges);
   the CTA is the only element that STANDS UP — bottom hinge, leaning
   back, rising past vertical (back.out maps the overshoot into the
   scroll) to land facing you. Scrubbed like every other scroll effect,
   start states baked with set() + .to() per the revert-safe rule. */
function initCtaEntrance() {
  nextPage.querySelectorAll("[section-cta], [data-section-cta]").forEach((cta) => {
    if (cta.dataset.ctaEntranceInit) return;
    cta.dataset.ctaEntranceInit = "true";
    if (reducedMotion) return;

    gsap.set(cta, {
      transformPerspective: mwgPersp(),
      transformOrigin: "50% 100%", // the site's only bottom hinge — it stands, not tips
      force3D: true,
      rotationX: 22,
      rotate: gsap.utils.random(-1, 1) * 2 + "deg", // the language's twist note
      y: "4vh",
      scale: 0.96,
    });

    gsap.timeline({
      scrollTrigger: {
        trigger: cta,
        start: "top bottom",
        end: "top 15%",
        scrub: 0.75,
        invalidateOnRefresh: true,
      },
    }).to(cta, {
      rotationX: 0,
      rotate: "0deg",
      y: "0vh",
      scale: 1,
      duration: 1,
      ease: "back.out(1.3)", // rises slightly past vertical, settles — the slam
    });
  });
}


/* ── Soft switch: visible playing-card loop for .sotf-img ──
   No curtain, no fades — the whole cycle happens in view, like shuffling
   playing cards. Depth slots stay visible: each deeper card peeks upward,
   increasingly tipped back (the "angle"), slightly smaller, with an
   alternating micro-twist; slot 0 is always z-top. The front card exits
   DOWN — tipping toward the viewer as it falls past the stack — swaps to
   the bottom z only while below the stack silhouette (the one invisible
   instant, hence seamless), then rises into the deepest slot behind
   everyone. Bottom hinge throughout: back slots lean away, the exit tips
   forward, one origin owns it all. Geometry base is Designer-owned
   (cards inset-0, full overlap); slots are pure transforms. */
function initSoftSwitch() {
  nextPage.querySelectorAll(".soft-imgs-wrap").forEach((wrap) => {
    if (wrap.dataset.softSwitchInit) return;
    wrap.dataset.softSwitchInit = "true";

    const cards = [...wrap.querySelectorAll(".sotf-img")];
    if (cards.length < 2) return;
    const N = cards.length;

    const HOLD = 3;          // seconds the front card holds
    const PEEK_Y = 15;       // yPercent upward peek per depth slot — bold stagger
    const TIP = 20;          // degrees of lean-back per depth slot
    const SCALE_STEP = 0.07; // shrink per depth slot
    const DEPTH_Z = 70;      // px pushed back into the scene per slot
    const DROP = 62;         // yPercent the exiting card falls below front

    // Tighter perspective than the site default — deliberate scene choice:
    // this section is a card trick, it earns the drama
    gsap.set(wrap, { perspective: window.innerWidth * 1.2 });
    gsap.set(cards, { transformOrigin: "50% 100%", force3D: true });

    const slot = (d) => ({
      yPercent: -PEEK_Y * d,
      rotationX: TIP * d,
      scale: 1 - SCALE_STEP * d,
      z: -DEPTH_Z * d, // true perspective depth — deeper cards recede
      rotate: d === 0 ? 0 : (d % 2 ? -1 : 1) * Math.min(d, 2) * 3,
    });

    let order = [...cards]; // order[0] = front
    const restack = () => order.forEach((c, i) => { c.style.zIndex = N - i; });
    order.forEach((c, d) => gsap.set(c, slot(d)));
    restack();

    if (reducedMotion) return; // static staggered stack

    let queue = null;

    function cycle() {
      const front = order[0];
      const rest = order.slice(1);
      order = [...rest, front];

      const tl = gsap.timeline({
        onComplete: () => { queue = gsap.delayedCall(HOLD, cycle); },
      });

      // Exit, phase 1: tip toward the viewer and fall past the stack —
      // front z the whole way down, fully in view
      tl.to(front, {
        yPercent: DROP,
        rotationX: -24,
        rotate: gsap.utils.random(-1, 1) * 4,
        scale: 1 - SCALE_STEP * (N - 1) * 0.6,
        z: 90, // falls TOWARD the viewer — the perspective sells the toss
        duration: 0.55,
        ease: "power2.in",
      }, 0);

      // Promotions: everyone steps one slot forward, staggered
      // Promotions snap into their slots with a card-dealt overshoot —
      // the front card briefly slaps past flat before settling
      rest.forEach((c, i) => {
        tl.to(c, { ...slot(i), duration: 0.9, ease: "back.out(1.25)" }, 0.1 + i * 0.08);
      });

      // The z swap — below the silhouette, the only invisible instant
      tl.call(restack, null, 0.55);

      // Exit, phase 2: rise from below into the deepest slot, behind all
      tl.to(front, { ...slot(N - 1), duration: 0.8, ease: "back.out(1.2)" }, 0.6);
    }

    queue = gsap.delayedCall(HOLD, cycle);

    activeObservers.push({
      disconnect() {
        queue?.kill();
        queue = null;
        gsap.killTweensOf(cards);
      },
    });
  });
}


/* ── MWG 013 reinterpreted: velocity-driven infinite marquee (.mwg013) ──
   One animation, one owner: a repeat:-1 timeline moves .mwg013-container
   linearly across one seam (clone of .mwg013-text-flex appended, seam
   measured at offsets, gap matched). Scroll never touches x — it drives
   the timeline's timeScale from ScrollTrigger velocity (Lenis-synced,
   pointer-independent, works for wheel/trackpad/touch/scrollbar): scroll
   down accelerates, scroll up goes negative and REWINDS the loop, and it
   eases back to cruising speed when the scroll stops. Replaces the demo's
   wheel-listener + quickTo, which lagged and only worked under the pointer. */
function initMwg013() {
  nextPage.querySelectorAll(".mwg013").forEach((root) => {
    if (root.dataset.mwg013Init) return;
    root.dataset.mwg013Init = "true";

    const container = root.querySelector(".mwg013-container");
    const flex = root.querySelector(".mwg013-text-flex");
    if (!container || !flex) return;

    const CRUISE = 60;        // px per second at rest — slow, readable
    const VELOCITY_DIV = 600; // scroll px/s per +1x of timeScale
    const MAX_FWD = 6;        // timeScale cap scrolling down
    const MAX_BACK = -4;      // timeScale floor scrolling up (rewind)

    // Seam spacing: container gets the flex block's internal gap so the
    // join between copies matches the spacing everywhere else
    const gap = getComputedStyle(flex).columnGap;
    if (gap && gap !== "normal") container.style.columnGap = gap;

    const clone = flex.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    container.appendChild(clone);

    let loop = null;
    let st = null;
    const speed = { v: 1 };
    let speedTl = null;

    // Measure after fonts (text width is the loop width)
    document.fonts.ready.then(() => {
      if (!root.isConnected) return;
      const half = clone.offsetLeft - flex.offsetLeft;
      if (half <= 0) return;

      // The loop: exactly one seam per cycle, linear, seamless on repeat
      loop = gsap.fromTo(container, { x: 0 }, {
        x: -half,
        duration: half / CRUISE,
        ease: "none",
        repeat: -1,
        paused: true,
      });
      if (reducedMotion) return; // static

      st = ScrollTrigger.create({
        trigger: root,
        start: "top bottom",
        end: "bottom top",
        onToggle: (self) => { self.isActive ? loop.play() : loop.pause(); },
        onUpdate: (self) => {
          // Velocity → timeScale: down accelerates, up rewinds
          const target = gsap.utils.clamp(MAX_BACK, MAX_FWD, 1 + self.getVelocity() / VELOCITY_DIV);
          speedTl?.kill();
          speedTl = gsap.timeline({ onUpdate: () => loop.timeScale(speed.v) })
            .to(speed, { v: target, duration: 0.25, ease: "power2.out" })
            .to(speed, { v: 1, duration: 1.4, ease: "power2.out" }); // settle back to cruise
        },
      });
      if (st.isActive) loop.play();
    });

    activeObservers.push({
      disconnect() {
        speedTl?.kill();
        st?.kill();
        loop?.kill();
        gsap.killTweensOf(container);
      },
    });
  });
}


/* ── Contact quote form: service → conditional qualifier set ──
   One native Webflow form. Both qualifier sets (.quote-set[data-quote-set])
   live in the markup, hidden by CSS. Picking a service arms the matching
   set and retires the other. "Retired" = `disabled` on its inputs: the
   browser skips disabled controls for both `required` validation and
   submission, so a hidden field can never block or pollute a submit.
   Switching family (project ↔ monthly) clears the old family's answers;
   switching inside a family keeps them. The swap is instant — a form
   step, not a motion moment. The Designer shows both sets via
   .wf-design-mode. */
function initQuoteForm() {
  nextPage.querySelectorAll("[data-quote-form]").forEach((root) => {
    if (root.dataset.quoteFormInit) return;
    root.dataset.quoteFormInit = "true";

    const services = Array.from(root.querySelectorAll('input[name="Service"]'));
    const sets = Array.from(root.querySelectorAll("[data-quote-set]"));
    if (!services.length || !sets.length) return;

    const controls = (set) => set.querySelectorAll("input, select, textarea");
    const retire = (set, clear) => {
      controls(set).forEach((c) => { c.disabled = true; if (clear) c.checked = false; });
      set.style.display = "none";
    };
    const arm = (set) => {
      controls(set).forEach((c) => { c.disabled = false; });
      set.style.display = "flex";
    };

    let active = null;

    // Baseline: every set retired until a service is picked
    sets.forEach((set) => retire(set, false));

    const swap = (next) => {
      if (next === active) return;
      if (active) retire(active, true); // family change — old answers go
      active = next;
      arm(next);
      if (hasScrollTrigger) ScrollTrigger.refresh(); // page height just changed
    };

    const onChange = (e) => {
      const next = root.querySelector(`[data-quote-set="${e.target.dataset.set}"]`);
      if (next) swap(next);
    };
    services.forEach((r) => r.addEventListener("change", onChange));

    // Restored state (bfcache / browser autofill): land on the right set
    const preset = services.find((r) => r.checked);
    if (preset) {
      const next = root.querySelector(`[data-quote-set="${preset.dataset.set}"]`);
      if (next) swap(next);
    }

    activeObservers.push({
      disconnect() { services.forEach((r) => r.removeEventListener("change", onChange)); },
    });
  });
}


/* ── Webflow forms across barba navigations ──
   Webflow's form module keeps per-form state in jQuery data ('.w-form')
   and submits through one delegated listener on document. After a barba
   swap (Webflow.destroy + ready) that state can be missing for the new
   form, and the browser then falls back to a native GET submit: the page
   reloads, nothing is sent, nothing is shown. These guards make sure
   every submit goes through Webflow's own handler, whatever happened
   during the swap. They also drive the custom Submit button and show
   which fields are missing. All listeners are document-level, bound once. */
const WF_FORM_NS = ".w-form";
const FORM_MSG_INCOMPLETE = "Please complete the highlighted fields.";
const FORM_MSG_FAILED = "Something went wrong while sending. Please refresh the page and try again.";

const wfFormData = (form) => window.jQuery?.data?.(form, WF_FORM_NS) || null;

function ensureWebflowForms() {
  const forms = document.querySelectorAll(".w-form form");
  if (!forms.length || !window.jQuery) return;
  if ([...forms].every((f) => wfFormData(f)?.handler)) return;
  try {
    window.Webflow?.require?.("forms")?.ready?.();
  } catch (e) {
    console.warn("[forms] re-init failed", e);
  }
}

// Is Webflow's delegated submit listener still bound on document?
function hasWebflowSubmitListener() {
  const events = window.jQuery?._data?.(document, "events");
  return !!events?.submit?.some((h) => (h.selector || "").includes("form"));
}

function setFormStatus(form, msg) {
  const status = form.querySelector("[data-form-status]");
  if (!status) return;
  status.textContent = msg || "";
  status.classList.toggle("is-error", !!msg);
}

function initFormGuards() {
  // 1. Custom Submit button (Lumos Button Main inside .form-btn-wrap).
  //    Capture phase: runs before barba's link listener, so a link-type
  //    clickable never turns into a page navigation.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-form-submit], .form-btn-wrap a, .form-btn-wrap button");
    const form = btn?.closest("form");
    if (!form) return;
    e.preventDefault();
    e.stopPropagation();
    ensureWebflowForms();
    if (form.requestSubmit) form.requestSubmit();
    else if (form.reportValidity()) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }, true);

  // 2. Every submit reaches Webflow's handler, never the browser's.
  window.addEventListener("submit", (e) => {
    const form = e.target;
    if (!form?.closest?.(".w-form")) return;
    ensureWebflowForms();
    const data = wfFormData(form);
    if (!data?.handler) {
      e.preventDefault();
      e.stopImmediatePropagation();
      setFormStatus(form, FORM_MSG_FAILED);
      console.warn("[forms] Webflow handler missing, submit blocked");
      return;
    }
    setFormStatus(form, "");
    if (!hasWebflowSubmitListener()) {
      // Listener lost in the swap: call Webflow's handler ourselves
      e.preventDefault();
      e.stopImmediatePropagation();
      data.evt = e;
      data.handler(data);
      console.warn("[forms] submitted through fallback handler");
    }
  }, true);

  // 3. Blocked submit: mark every missing field, scroll to the first one,
  //    say why. The browser's own bubble is replaced (it fights Lenis and
  //    points at visually hidden radios).
  let firstInvalidPending = true;
  document.addEventListener("invalid", (e) => {
    const field = e.target;
    const form = field.form;
    if (!form?.closest(".w-form")) return;
    e.preventDefault();
    const group = field.name ? form.querySelectorAll(`[name="${CSS.escape(field.name)}"]`) : [field];
    group.forEach((el) => el.setAttribute("aria-invalid", "true"));
    setFormStatus(form, FORM_MSG_INCOMPLETE);

    if (!firstInvalidPending) return;
    firstInvalidPending = false;
    requestAnimationFrame(() => { firstInvalidPending = true; });
    const target = field.closest("fieldset, .form-fieldflex") || field;
    const offset = -((getNav()?.offsetHeight || 0) + 24);
    if (lenis) lenis.scrollTo(target, { offset, duration: reducedMotion ? 0 : 0.8 });
    else window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY + offset, behavior: reducedMotion ? "auto" : "smooth" });
    field.focus({ preventScroll: true });
  }, true);

  // 4. A fixed field clears its mark; the message goes once all are fixed.
  const clear = (e) => {
    const field = e.target;
    const form = field.form;
    if (!form?.closest(".w-form") || !field.name) return;
    if (!field.validity?.valid) return;
    form.querySelectorAll(`[name="${CSS.escape(field.name)}"]`).forEach((el) => el.removeAttribute("aria-invalid"));
    if (!form.querySelector('[aria-invalid="true"]')) setFormStatus(form, "");
  };
  document.addEventListener("input", clear, true);
  document.addEventListener("change", clear, true);
}


/* ── About values: hover a value, the right block shows its illustration + copy ──
   Each About Value carries its own hidden reference (illustration + text,
   Designer-only via .wf-design-mode). The right column is the display:
   hovering (or tapping) a value swaps the display's image and caption to
   that value. The swap is a short lift — out up, in from below, resolves
   flat — so it reads as a replacement, not a flicker. References are
   warmed at init so webp/gif swaps land instantly; GIFs restart from
   frame one on each swap, which is the point. First value shows at init.
   `is-active` on the wrap is a styling hook (dim the others, underline…). */
function initAboutValues() {
  const grid = nextPage.querySelector(".about-values-grid");
  if (!grid || grid.dataset.aboutValuesInit) return;
  grid.dataset.aboutValuesInit = "true";

  const items   = Array.from(grid.querySelectorAll(".about-value-headline-wrap"));
  const img     = grid.querySelector(".about-values-col-right .about-value-illu img");
  const caption = grid.querySelector(".about-values-col-right .about-value-caption");
  if (!items.length || !img) return;

  const refs = items.map((w) => {
    const ref = w.querySelector(".abiut-value-illu-ref img");
    return {
      src:  ref?.getAttribute("src") || "",
      alt:  ref?.getAttribute("alt") || "",
      text: w.querySelector(".about-value-txt")?.textContent.trim() || "",
    };
  });
  refs.forEach((r) => { if (r.src) new Image().src = r.src; }); // warm the cache

  const targets = caption ? [img, caption] : [img];
  let active = -1;
  let tl = null;

  const apply = (i) => {
    const r = refs[i];
    if (r.src) {
      img.removeAttribute("srcset"); // Webflow's responsive set would win over src
      img.removeAttribute("sizes");
      img.loading = "eager";
      img.src = r.src;
      img.alt = r.alt;
    }
    if (caption) caption.textContent = r.text;
  };

  const show = (i, animate) => {
    if (i === active) return;
    active = i;
    items.forEach((w, k) => w.classList.toggle("is-active", k === i));
    tl?.kill();
    if (!animate || reducedMotion) {
      apply(i);
      gsap.set(targets, { clearProps: "opacity,visibility,transform" });
      return;
    }
    tl = gsap.timeline()
      .to(targets, { autoAlpha: 0, y: -8, duration: 0.18, ease: "power2.in", stagger: 0.03 })
      .call(() => apply(i))
      .fromTo(targets, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "osmo", stagger: 0.05 })
      .set(targets, { clearProps: "transform" }); // arrivals resolve flat
  };

  items.forEach((w, i) => {
    w.addEventListener("pointerenter", () => show(i, true));
    w.addEventListener("click", () => show(i, true)); // touch has no hover
  });
  show(0, false);

  activeObservers.push({ disconnect() { tl?.kill(); } });
}


/* ═══════════════════════════════════════════════
   ALLPAGES — orchestrator
   Called by afterEnter on every navigation,
   including the initial once load.
   Do NOT call this separately at the bottom.
═══════════════════════════════════════════════ */
function allpages() {
  initYear();
  initCurrentLinks();
  initSlider();
  initSlideshows();      // crisp header hero slideshow (Osmo)
  initAccordions();
  initParallax();        // ScrollTrigger-based, killed in before hook, rebuilt here
  initFooterReveal();    // ST scrub — killed in before hook, rebuilt here
  initStackingServiceCards(); // ST scrub — killed in before hook, rebuilt here
  initHomeWorkStack();   // ST scrub — killed in before hook, rebuilt here
  initHeroDepart();      // ST scrub — hero recedes as content covers it
  initMwgCarousel();     // infinite 3D ring — cleaned up via activeObservers
  initCtaEntrance();     // stand-up arrival — killed in before hook, rebuilt here
  initSoftSwitch();      // Sparky OS card switch — cleaned up via activeObservers
  initMwg013();          // wheel-driven marquee (About) — cleaned up via activeObservers
  initQuoteForm();       // Contact: service → conditional qualifier set — listeners removed via activeObservers
  initAboutValues();     // About: hovered value drives the right-column illustration + caption
  initNavScroll();       // hide/show nav — rebuilt per page (self-killing handle)
  initNavTheme();        // nav theme per visible section — deterministic probe
  initGradientWaveText();// SplitText + ST scrub — reverted/killed in before hook
  initGradientWaveLoad();// SplitText play-once — reverted in before hook
  initRadioFilter();     // MutationObserver, tracked in activeObservers
  initFsObserver();      // MutationObserver, tracked in activeObservers
  reinitFsAttributes();  // async — ST.refresh handled internally by its own callbacks

}