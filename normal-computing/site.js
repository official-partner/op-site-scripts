/* =========================================================================
   NORMAL COMPUTING · SITE JS
   jQuery + GSAP (ScrollTrigger, CustomEase) + Barba + Finsweet + Swiper
   Moved out of the Webflow site footer, behaviour unchanged.

   1. MAIN       the site's original footer script (Barba, menu, sections)
   2. NIS        Normal Inference Systems page: sphere, Typeform, #pre-order
   3. HARDWARE   Hardware page: model chart, mobile chart scroll, #performance

   Libraries stay in the Webflow footer, before the loader. The MathJax
   config also stays inline in Webflow, before the MathJax tag, so MathJax
   always reads it before it starts.

   Section 1 stays at the top level on purpose: resetWebflow, scrollToId,
   allpages and renderMathJax are globals other code relies on.
   ========================================================================= */


/* =========================================================================
   1. MAIN
   ========================================================================= */

function clearStyles(t) {
    "string" == typeof t ? document.querySelectorAll(t).forEach(t => t.removeAttribute("style")) : t instanceof HTMLElement && t.removeAttribute("style")
}

function isSafari() {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}
gsap.registerPlugin(ScrollTrigger, CustomEase), gsap.ticker.lagSmoothing(0);
let mm = gsap.matchMedia(),
    showAnim;
mm.add("(min-width: 992px)", () => {}), mm.add("(max-width: 991px)", () => {});
let lenis;
var lenisActive = !1;

// Same as the old footer, with the ix2 call made safe (the site has no native
// interactions, so Webflow.require("ix2") is undefined and the old call threw).
// This is what the registered script "nisResetWebflowFix" patched in.
function resetWebflow(t) {
    let e = $(new DOMParser().parseFromString(t.next.html, "text/html")).find("html");
    $("html").attr("data-wf-page", e.attr("data-wf-page")), window.Webflow && window.Webflow.destroy(), window.Webflow && window.Webflow.ready();
    let ix2 = window.Webflow && window.Webflow.require && window.Webflow.require("ix2");
    ix2 && ix2.init(), $(".w--current").removeClass("w--current"), $("a").each(function() {
        $(this).attr("href") === window.location.pathname && $(this).addClass("w--current")
    }), e.find("[data-barba-script]").each(function() {
        let t = $(this).text();
        t.includes("DOMContentLoaded") && (t = t.replace(/window\.addEventListener\("DOMContentLoaded",\s*\(\s*event\s*\)\s*=>\s*{\s*/, "").replace(/\s*}\s*\);\s*$/, ""));
        let e = document.createElement("script");
        e.type = "text/javascript", $(this).attr("src") && (e.src = $(this).attr("src")), e.text = t, document.body.appendChild(e).remove()
    })
}
$(document).ready(function() {
    void 0 != Webflow.env("editor") ? console.log("Editor is loaded: do not load custom js") : isSafari()
}), barba.hooks.before(t => {
    window.fsAttributes.destroy()
}), barba.hooks.leave(t => {}), barba.hooks.enter(t => {}), barba.hooks.after(t => {
    gsap.set(".menu-mobile-wrap", {
        display: "none"
    });
    gsap.utils.toArray(ScrollTrigger.getAll()).forEach(t => {
        t.kill()
    }), allpages(), window.fsAttributes.cmsfilter.init(), window.fsAttributes.cmsload.init(), barbaScrollTarget ? setTimeout(() => {
        scrollToId(barbaScrollTarget), barbaScrollTarget = null
    }, 200) : window.scrollTo(0, 0), $('video[autoplay="true"]').each(function() {
        this.play()
    }), resetWebflow(t), lenisActive ? lenis.scrollTo(0, {
        offset: 0,
        immediate: !0,
        duration: 0
    }) : barbaScrollTarget ? setTimeout(() => {
        scrollToId(barbaScrollTarget), barbaScrollTarget = null
    }, 200) : window.scrollTo(0, 0)
}), barba.init({
    preventRunning: !0,
    timeout: 5e3,
    transitions: [{
        name: "transition",
        before() {
            lenisActive && lenis.stop()
        },
        enter: t => ($(t.next.container).addClass("fixed"), gsap.to(".page-tr", {
            opacity: 1,
            duration: .8,
            ease: "power2.Out"
        }), gsap.to(".tr", {
            opacity: .8,
            duration: 1
        }), gsap.fromTo($(t.current.container), {
            y: "0vh"
        }, {
            y: "-10vh",
            duration: 1.55,
            ease: "power3.inOut"
        }), gsap.fromTo(t.next.container, {
            y: "60vh",
            clipPath: "inset(100% 0% 0% 0%)"
        }, {
            y: "0vh",
            clipPath: "inset(0% 0% 0% 0%)",
            duration: 1.4,
            delay: .1,
            ease: "expo.out"
        })),
        after() {
            clearStyles(".page_main"), gsap.set(".tr", {
                opacity: 0
            }), $(".page_main").removeClass("fixed"), setTimeout(() => {
                lenisActive && lenis.start()
            }, 10)
        },
        afterEnter() {
            setTimeout(renderMathJax, 800);
        }
    }],
    views: [{
        namespace: "home",
        afterEnter(t) {}
    }, {
        namespace: "about",
        afterEnter(t) {}
    }, ]
});
let barbaScrollTarget = null;

function scrollToId(t, e = 100) {
    let o = $("#" + t);
    if (o.length) {
        let i = o.offset().top - e;
        $("html, body").animate({
            scrollTop: i
        }, 800)
    }
}
let pagetitle;

function allpages() {
    $("[data-link-to]").on("click", function(t) {
        let i = $(this).data("link-to");
        if (!i) return;
        t.preventDefault();
        let r = $(this).attr("href");
        if (!r) return;
        let n = new URL(r, window.location.origin),
            s = new URL(window.location.href),
            a = n.pathname === s.pathname;
        a ? (console.log("Same page scroll to ID"), scrollToId(i)) : (console.log("Barba scroll", i), barbaScrollTarget = i), e || (console.log("close menu"), o.reverse(), e = !0)
    }), $(document).ready(function() {
        let t = $(".home-hero-img");
        gsap.set(t, {
            opacity: 0,
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%"
        }), gsap.set(t.first(), {
            opacity: 1
        });
        let e = 0;

        function o() {
            let i = t.eq(e),
                r = (e + 1) % t.length,
                n = t.eq(r),
                s = gsap.timeline({
                    onComplete: function() {
                        e = r, setTimeout(o, 2e3)
                    }
                });
            s.to(n, {
                opacity: 1,
                duration: 1
            }, 0).to(i, {
                opacity: 0,
                duration: 1
            }, 0)
        }
        setTimeout(o, 2e3)
    }), $(document).ready(function() {
        $(".blog-item:first").css("display", "none"), $(".radio-filter").on("click", function() {
            setTimeout(function() {
                $(".radio-filter:first").hasClass("is-active") ? $(".blog-item:first").css("display", "none") : $(".blog-item:first").css("display", "block")
            }, 50)
        })
    }), $(document).ready(function() {
        $(".solution-section").each(function(t) {
            0 === t ? gsap.set(this, {
                xPercent: 0
            }) : gsap.set(this, {
                xPercent: 100
            })
        }), $(".solution-section-trigger").each(function(t) {
            let e = $(".solution-section").eq(t),
                o = $(".solution-section").eq(t + 1);
            o.length && gsap.timeline({
                scrollTrigger: {
                    trigger: this,
                    start: "top top",
                    toggleActions: "play none none reverse",
                    fastScrollEnd: !0
                }
            }).to(e, {
                xPercent: -100,
                duration: .8,
                ease: "power3.inOut"
            }, 0).to(o, {
                xPercent: 0,
                duration: .85,
                ease: "power3.inOut"
            }, 0)
        })
    });
    var t = $(".scroll-snap-section").length + 1;
    $(".scroll-snap-section-height").css("height", 100 * t + "vh"), $(".scroll-snap-section").css("position", "absolute"), $(".scroll-snap-section").eq(0).find(".scroll-snap-content").css("pointer-events", "auto"), $(".scroll-snap-section").css("pointer-events", "none"), $(".scroll-snap-sections-wrap").css("max-height", "100vh"), $(".section-scroll-txt.is-hero").each(function() {
        let t = gsap.timeline({
            scrollTrigger: {
                trigger: $(this),
                start: "bottom 90%",
                end: "bottom 75%",
                scrub: .5
            }
        });
        t.to($(this).find(".home-scroll-txt, .btn-title-abs"), {
            opacity: 0
        }), t.from($(".home-fixed-lines"), {
            opacity: 0
        }, "<")
    }), $(".scroll-snap-section-height").each(function() {
        gsap.timeline({
            scrollTrigger: {
                trigger: $(this),
                start: "top top",
                end: "bottom top",
                scrub: 1
            }
        }).fromTo($(".scroll-snap-section"), {
            scale: 1
        }, {
            scale: 1.25,
            ease: "none"
        })
    }), mm.add("(min-width: 992px)", () => {
        gsap.set(".adam-txt", {
            opacity: .2
        }), $(".scroll-horizontal-trigger").each(function(t) {
            let e = $(this),
                o = $(".adam-txt").eq(t);
            gsap.to(o, {
                opacity: 1,
                duration: 1,
                scrollTrigger: {
                    trigger: e,
                    start: "top top",
                    end: "top -20%",
                    scrub: !0
                }
            })
        })
    }), $(".scroll-snap-section-ref").each(function() {
        let t = $(this).index(),
            e = $(".scroll-snap-section").eq(t);
        gsap.timeline({
            scrollTrigger: {
                trigger: $(this),
                start: "top bottom",
                end: "bottom 175%",
                scrub: 1
            }
        }).fromTo(e.find(".section-scrollsnap-container"), {
            opacity: 0
        }, {
            opacity: 1
        })
    }), $(".scroll-snap-section-ref").each(function() {
        gsap.timeline({
            scrollTrigger: {
                trigger: $(this),
                start: "top bottom",
                end: "top 90%",
                scrub: 1
            }
        }).fromTo($(this).find(".footnote-btn"), {
            opacity: 0
        }, {
            opacity: 1
        })
    }), $(".scroll-snap-section-ref .scroll-txt-grid").each(function() {
        gsap.timeline({
            scrollTrigger: {
                trigger: $(this),
                start: "top 5%",
                end: "top top",
                scrub: 1
            }
        }).fromTo($(this).find(".home-scroll-txt.u-text-style-h3, .home-hero-btn"), {
            opacity: 1
        }, {
            opacity: 0
        })
    }), $(".scroll-snap-section-ref").each(function() {
        let t = $(this).index();
        gsap.timeline({
            scrollTrigger: {
                trigger: $(this),
                start: "top 45%",
                end: "top top",
                scrub: 1
            }
        }).to($(".scroll-snap-section").eq(t).find(".hero-overlay"), {
            opacity: .45
        })
    }), $(".scroll-snap-section-ref").each(function() {
        gsap.timeline({
            scrollTrigger: {
                trigger: $(this),
                start: "bottom 20%",
                end: "bottom top",
                scrub: 1
            }
        }).to($(this).find(".footnote-btn"), {
            opacity: 0
        })
    }), gsap.timeline({
        scrollTrigger: {
            trigger: ".scroll-snap-section-ref:last-child",
            start: "bottom top",
            end: "bottom top",
            scrub: 1
        }
    }).to(".home-fixed-lines", {
        opacity: 0
    });
    let e = !0,
        o = gsap.timeline({
            paused: !0,
            defaults: {
                duration: .4,
                ease: "power4.inOut"
            }
        });
    o.to(".burger-line.middle", {
        marginTop: "calc(0rem - 0.09rem)",
        marginBottom: "calc(0rem - 0.09rem)"
    }).set(".burger-line.middle", {
        opacity: 0,
        duration: .2
    }, "<0.2").to(".burger-line.top", {
        rotate: "45deg"
    }, "<").to(".burger-line.bottom", {
        rotate: "-45deg"
    }, "<").set(".menu-mobile-wrap", {
        display: "flex"
    }, "<").fromTo(".menu-mobile-wrap", {
        opacity: 0
    }, {
        opacity: 1,
        duration: .2
    }, "<0.1"), $(".nav-burger").on("click", function() {
        e ? (console.log("open menu"), o.play(), e = !1) : (console.log("close menu"), o.reverse(), e = !0)
    });
    let i = $("[append-link]").attr("href");
    $.ajax({
        url: i,
        success: function(t) {
            let e = $(t).find("[append-element]");
            $("[append-parent]").append(e)
        }
    }), $(".section-video").each(function(t, e) {
        var l = $(e),
            p = l.find(".video-player")[0],
            o = l.find(".video-player video")[0],
            i = l.find(".progress-bar"),
            r = i.find(".progress"),
            a = l.find(".sound-btn"),
            pb = l.find(".play-pause-btn"),
            s = !1,
            v = !1;
        if (!o) return;
        a.find(".fss").text(o.muted ? "Sound On" : "Sound Off");

        function reveal() {
            v || (v = !0, gsap.to(p, {
                opacity: 1,
                pointerEvents: "auto",
                duration: .4,
                overwrite: !0
            }), gsap.to(l.find(".play-video-btn"), {
                opacity: 0,
                pointerEvents: "none",
                duration: .3,
                overwrite: !0
            }))
        }

        function state() {
            var playing = !o.paused && !o.ended;
            l.toggleClass("is-playing", playing), pb.css("pointer-events", playing ? "none" : "auto")
        }

        function c(t, el) {
            var b = $(el),
                n = (t.pageX - el.getBoundingClientRect().left) / b.width();
            n = Math.min(Math.max(n, 0), 1), b.find(".progress").css("width", 100 * n + "%"), o.currentTime = o.duration * n
        }
        l.find(".play-video-btn").on("click", function(t) {
            t.preventDefault(), reveal(), o.play()
        }), pb.on("click", function(t) {
            t.preventDefault(), reveal(), o.paused || o.ended ? o.play() : o.pause()
        }), a.on("click", function(t) {
            t.preventDefault(), o.muted = !o.muted, $(this).find(".fss").text(o.muted ? "Sound On" : "Sound Off")
        }), o.addEventListener("play", state), o.addEventListener("pause", state), o.addEventListener("ended", state), state(), o.addEventListener("timeupdate", function() {
            s || r.css("width", this.currentTime / this.duration * 100 + "%")
        }), i.on("touchstart mousedown", function(t) {
            s = !0, c(t, this)
        }), $(document).on("touchend mouseup", function() {
            s = !1
        }), i.on("touchmove mousemove", function(t) {
            s && c(t, this)
        })
    }), $('[class*="drawer-top"], [drawer-top]').on("click", function() {
        var t = $(this).closest(".drawer-item, [drawer-parent]"),
            e = t.data("clickCount") || 0;
        1 === e ? (t.removeClass("open"), setTimeout(function() {
            ScrollTrigger.refresh()
        }, 600)) : (t.siblings().removeClass("open").data("clickCount", 0), t.addClass("open"), setTimeout(function() {
            ScrollTrigger.refresh()
        }, 600)), ++e > 1 && (e = 0), t.data("clickCount", e)
    }), $(".button.is-filter").on("click", function() {
        setTimeout(function() {
            $(".filters-collection .button").hasClass("is-active") ? $(".filters-wrap .button.is-clear").removeClass("is-active") : $(".filters-wrap .button.is-clear").addClass("is-active")
        }, 50)
    }), $(".scroll_horizontal_wrap").each(function(t) {
        mm.add("(min-width: 992px)", () => {
            let t = $(this),
                e = $(this).find(".scroll_horizontal_inner"),
                o = $(this).find(".scroll_horizontal_track");

            function i() {
                t.css("height", "calc(" + o.outerWidth() + "px + 100vh)")
            }
            i(), ScrollTrigger.refresh(), window.addEventListener("resize", i);
            let r = gsap.timeline({
                scrollTrigger: {
                    trigger: t,
                    start: "top -10%",
                    end: "bottom 110%",
                    scrub: .1
                },
                defaults: {
                    ease: "none"
                }
            });

            function n() {
                return e.offset().left + "px"
            }

            function s() {
                return e.offset().left + e.innerWidth() + "px"
            }
            r.to(o, {
                xPercent: -100
            }), r.to(".line-section-dot", {
                x: "100vw"
            }, "<")
        })
    }), $(document).ready(function() {
        $("sup").css("cursor", "pointer").on("click", function() {
            $("#footnotes")[0].scrollIntoView({
                behavior: "smooth"
            })
        });
        var t = $(".table-of-contents");
        if (t.length) {
            var e = $("h2, h3, h4, h5, h6"),
                o = [];
            e.each(function(e) {
                var i = $(this),
                    r = "heading-" + (e + 1);
                i.attr("id", r);
                var n = $("<div></div>", {
                        class: "toc-text_anchor",
                        text: i.text()
                    }),
                    s = $("<div></div>", {
                        class: "link-dot-wrap"
                    }).append($("<div></div>", {
                        class: "link-dot"
                    }), $("<a></a>", {
                        href: "#" + r
                    }).append(n));
                t.append(s), o.push(n)
            }), t.on("click", ".toc-text_anchor", function(t) {
                t.preventDefault();
                var e = $(this).parent().attr("href").substring(1),
                    o = $("#" + e);
                o.length && $("html, body").animate({
                    scrollTop: o.offset().top - 1.5 * parseFloat($("html").css("font-size"))
                }, "smooth")
            });
            var i = function() {
                var t = $(window).scrollTop() + .3 * $(window).height();
                e.each(function(i) {
                    var r = $(this),
                        n = $(o[i]);
                    r.offset().top <= t && (i === e.length - 1 || $(e[i + 1]).offset().top > t) ? n.addClass("active") : n.removeClass("active")
                })
            };
            $(window).on("scroll", i), i()
        }
    }), $(".footer-wrap").each(function() {
        gsap.timeline({
            scrollTrigger: {
                trigger: $(this),
                start: "top bottom",
                end: "bottom bottom",
                scrub: .1
            }
        }).from($(this).find(".is-fixed .footer-logo"), {
            y: "80vh",
            ease: "linear"
        }).from($(this).find(".footer-op"), {
            opacity: .35,
            ease: "linear"
        }, "<")
    }), $(".footer-wrap").each(function() {
        gsap.timeline({
            scrollTrigger: {
                trigger: $(this),
                start: "top 30%",
                end: "bottom bottom",
                scrub: .3
            }
        }).from($(this).find(".is-fixed .indent-content-grid"), {
            yPercent: 180,
            opacity: 0,
            ease: "linear"
        })
    }), $(".adam-section-sticky-wrap").each(function() {
        let t = $(this),
            e = t.find("video").get(0),
            o = !1;
        gsap.timeline({
            scrollTrigger: {
                trigger: t,
                start: "top top",
                end: "bottom bottom",
                scrub: .3,
                onEnter() {
                    e && !o && (e.play(), o = !0)
                }
            }
        }).fromTo(t.find(".adam-anim"), {
            y: "14rem"
        }, {
            y: "0rem",
            ease: "linear"
        })
    }), $(".scroll-horizontal-trigger").eq(1).each(function() {
        let t = gsap.timeline({
            scrollTrigger: {
                trigger: $(this),
                start: "top 30%",
                end: "bottom top",
                scrub: .6
            }
        });
        t.fromTo(".thermo-gradient-img.is-02", {
            yPercent: 100
        }, {
            yPercent: 0
        }, "<"), t.fromTo(".thermo-gradient-img.is-01", {
            yPercent: 100
        }, {
            yPercent: 0
        }, "<")
    }), $(document).ready(function() {
        $(".team-coll-item").click(function() {
            var t = $(this).attr("data-slug");
            $(".team-popup-coll-item").css("visibility", "hidden").css("display", "none"), $(".right-popup-wrap").css("display", "flex");
            var e = $(".team-popup-coll-item[data-slug='" + t + "']");
            e.css("display", "flex").css("visibility", "visible"), gsap.timeline().fromTo(".popup-blur", {
                xPercent: 120
            }, {
                xPercent: 0,
                duration: 1.2,
                ease: "expo.out"
            }).fromTo(".right-popup", {
                clipPath: "inset(0% 0% 0% 100%)"
            }, {
                clipPath: "inset(0% 0% 0% 0%)",
                duration: 1.2,
                ease: "expo.out"
            }, "<").fromTo(".popup-bk", {
                opacity: 0
            }, {
                opacity: 1,
                duration: .2
            }, "<").fromTo(e.find("img"), {
                scale: 1.2
            }, {
                scale: 1,
                duration: .6,
                ease: "power2.out"
            }, "<").fromTo(e.find(".team-popup-infos").children(), {
                opacity: 0,
                yPercent: 10
            }, {
                opacity: 1,
                yPercent: 0,
                stagger: .1,
                duration: .7
            }, "<0.15")
        }), $(".popup-bk, .close-popup").click(function() {
            gsap.timeline({
                onComplete: function() {
                    $(".right-popup-wrap, .team-popup-coll-item").css("display", "none")
                }
            }).to(".popup-blur", {
                xPercent: 100,
                duration: .3,
                ease: "power2.in"
            }).to(".right-popup", {
                clipPath: "inset(0% 0% 0% 100%)",
                duration: .3,
                ease: "power2.in"
            }, "-=0.2").to(".popup-bk", {
                opacity: 0,
                duration: .15
            }, "-=0.2")
        })
    }), $(document).ready(function() {
        $(".nav-filter-txt").eq(0).find(".radio-filter").addClass("is-active-all"), $(".nav-filter-txt:not(:first-child)").click(function() {
            $(".radio-filter").removeClass("is-active-all"), $(".featured-blog-coll-wrap").hide()
        }), $(".nav-filter-txt:first-child").click(function() {
            $(".featured-blog-coll-wrap").show()
        }), $(".nav-filter-txt").click(function() {
            setTimeout(function() {
                ScrollTrigger.refresh()
            }, 1e3)
        }), $("[hov-img-corner]").hover(function() {
            var t = $(this).attr("data-slug");
            $(".sticky-img-coll-item[data-slug='" + t + "']").css("opacity", "1")
        }, function() {
            $(".sticky-img-coll-item").css("opacity", "0")
        })
    });
    var r = $(".current-link.w--current").closest(".current-link-item"),
        n = r.next(".current-link-item"),
        s = r.prev(".current-link-item");
    0 === n.length && (n = $(".current-link-item").first()), 0 === s.length && (s = $(".current-link-item").last());
    var a = n.find(".current-link").attr("href"),
        l = s.find(".current-link").attr("href");
    $("[previous-link]").attr("href", l), $("[next-link]").attr("href", a), $(document).ready(function() {
        function t() {
            $(".scroll-txt-grid").each(function(t) {
                let e = $(this),
                    o = e.find(".home-line.is-hor");
                if (e.data("scrollTrigger") && e.data("scrollTrigger").kill(), o.length) {
                    let i = o.offset().left,
                        r = gsap.timeline({
                            scrollTrigger: {
                                trigger: e,
                                start: "top 150%",
                                end: "top bottom",
                                scrub: 1
                            }
                        });
                    r.to(".home-fixed-lines .home-line.is-hor", {
                        x: i,
                        duration: .5,
                        ease: "power2.out"
                    }), e.data("scrollTrigger", r.scrollTrigger)
                }
            }), ScrollTrigger.refresh()
        }
        t(), $(window).on("resize", function() {
            t()
        })
    }), $(".section-full-img").each(function() {
        mm.add("(min-width: 992px)", () => {
            gsap.timeline({
                scrollTrigger: {
                    trigger: $(this).closest("section"),
                    start: "top bottom",
                    end: "bottom top",
                    scrub: .25
                }
            }).fromTo($(this).find(".img-section"), {
                scale: 1,
                yPercent: -5
            }, {
                scale: 1,
                yPercent: 5,
                ease: "none"
            }).fromTo($(this).find(".section-scroll-txt-wrap"), {
                yPercent: -5
            }, {
                yPercent: 5,
                ease: "none"
            }, "<")
        })
    }), $(".page_content").each(function() {
        gsap.timeline({
            scrollTrigger: {
                trigger: $(this),
                start: "top -200",
                end: "top -400",
                scrub: .5
            }
        }).to($(".nav-burger.is-nav"), {
            y: "0%",
            ease: "none"
        })
    }), $(".footer-wrap").each(function() {
        gsap.timeline({
            scrollTrigger: {
                trigger: $(this),
                start: "top 300",
                end: "top 100",
                scrub: .5
            }
        }).to($(".nav-burger.is-nav"), {
            y: "-100%",
            ease: "none"
        })
    }), $(".anim-3d-container").each(function(t) {
        let e = $(this).find("canvas")[0],
            o = $(this).find(".embed-3d")[0],
            i = e.getContext("2d");

        function r() {
            e.width = o.offsetWidth, e.height = o.offsetHeight
        }
        r();
        let n = $(this).attr("total-frames"),
            s = $(this).attr("url-start"),
            a = $(this).attr("url-end"),
            l = $(this).attr("floating-zeros"),
            c = t => `${s}${(t+1).toString().padStart(l,"0")}${a}`,
            p = [],
            d = {
                frame: 0
            };
        for (let f = 0; f < n; f++) {
            let u = new Image;
            u.src = c(f), p.push(u)
        }

        function h() {
            i.clearRect(0, 0, o.offsetWidth, o.offsetHeight),
                function t(e, o, i, r, n, s, a, l) {
                    2 === arguments.length && (i = r = 0, n = e.canvas.width, s = e.canvas.height), (a = "number" == typeof a ? a : .5) < 0 && (a = 0), (l = "number" == typeof l ? l : .5) < 0 && (l = 0), a > 1 && (a = 1), l > 1 && (l = 1);
                    var c, p, d, f, u = o.width,
                        h = o.height,
                        m = Math.min(n / u, s / h),
                        g = u * m,
                        b = h * m,
                        y = 1;
                    g < n && (y = n / g), 1e-14 > Math.abs(y - 1) && b < s && (y = s / b), g *= y, b *= y, d = u / (g / n), f = h / (b / s), (c = (u - d) * a) < 0 && (c = 0), (p = (h - f) * l) < 0 && (p = 0), d > u && (d = u), f > h && (f = h), e.drawImage(o, c, p, d, f, i, r, n, s)
                }(i, p[d.frame], 0, 0, o.offsetWidth, o.offsetHeight, .5, .5)
        }
        gsap.to(d, {
            frame: n - 1,
            snap: "frame",
            ease: "none",
            scrollTrigger: {
                trigger: $(this).closest(".scroll_horizontal_wrap"),
                start: "top bottom",
                end: "bottom bottom",
                scrub: .5
            },
            onUpdate: h
        }), p[0].onload = h;
        let m = !!navigator.platform.match(/iPhone|iPod|iPad/),
            g;
        $(window).on("resize", function(t) {
            m ? (clearTimeout(g), g = setTimeout(function() {
                r(), h()
            }, 250)) : (r(), h())
        })
    })


    $(".swiper").each(function (index, element) {
        let prev = $(this).find('.is-prev')[0]
        let next = $(this).find('.is-next')[0]
        let nav = $(this).find('.swiper-pagination')[0]
        // Check if there's no div with class w-dyn-empty inside the current .swiper-blog-featured element
        if ($(this).find("div.w-dyn-empty").length === 0) {
          let loop = $(this).data('loop');
          let centered = $(this).data('centered');
          let axis = $(this).data('axis');
          let autoplay = $(this).data('autoplay');
          let speed = $(this).data('speed') || 600; // Default speed
          let delay = $(this).data('delay') || 5000; // Default delay
          let reverseDirection = $(this).data('reverse');

          new Swiper($(this).find(".swiper-container")[0], {
            grabCursor: true,
            speed: speed,
            loop: loop,
            autoplay: autoplay ? {
              delay: delay,
              reverseDirection: reverseDirection === true ? true : undefined
           } : false,
            centeredSlides: centered,
            slidesPerView: "auto",
            slidesPerGroup: 1,
            navigation: {
              nextEl: next,
              prevEl: prev
            },
            mousewheel: {
              forceToAxis: axis === false ? false : true,
              invert: false,
              sensitivity: 1.5
            },
            pagination: {
              el: nav,
              clickable: true,
          },
          });
        }
      });
}
allpages();

// The MathJax config object stays inline in Webflow, before the MathJax tag.
function renderMathJax() {
    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise().catch((err) => console.error('MathJax error:', err));
    }
}


/* =========================================================================
   2. NIS
   Normal Inference Systems page (/normal-inference-systems): sphere,
   Typeform, scroll to form. Runs on first load and again after every Barba
   transition. Does nothing on other pages.
   ========================================================================= */

(function () {
  // ---------- NIS sphere: gradient sphere that follows the cursor (.is-nis-energy) ----------
  var S = { el: null, img: null, tick: null, io: null, ro: null, off: [] };

  if (!document.getElementById('nis-sphere-css')) {
    var st = document.createElement('style');
    st.id = 'nis-sphere-css';
    st.textContent = '.nis-sphere{position:absolute;inset:0;pointer-events:none;opacity:0}.nis-sphere_ball{position:absolute;left:9%;top:9.5%;width:82%;height:83%;border-radius:50%;will-change:transform;transform:translate3d(var(--tx,0px),var(--ty,0px),0);background:radial-gradient(ellipse 30% 26% at var(--lx,50%) var(--ly,40%),rgba(255,255,255,.1),rgba(255,255,255,0) 100%),radial-gradient(ellipse 40% 30% at var(--wx,60%) var(--wy,18%),#ff3000 0%,rgba(255,48,0,0) 100%),radial-gradient(ellipse 34% 28% at var(--ox,26%) var(--oy,30%),#ea7430 0%,rgba(234,116,48,0) 100%),radial-gradient(ellipse 28% 20% at var(--kx,48%) var(--ky,36%),#ff6a1a 0%,rgba(255,106,26,0) 100%),radial-gradient(ellipse 22% 22% at var(--gx,12%) var(--gy,52%),#aeb29c 0%,rgba(174,178,156,0) 100%),radial-gradient(ellipse 22% 24% at var(--px,92%) var(--py,42%),#c85c5e 0%,rgba(200,92,94,0) 100%),radial-gradient(ellipse 26% 28% at var(--mx,88%) var(--my,64%),#8590a0 0%,rgba(133,144,160,0) 100%),radial-gradient(ellipse 32% 24% at var(--cx,46%) var(--cy,82%),#42e6fe 0%,rgba(66,230,254,0) 100%),radial-gradient(ellipse 30% 26% at var(--tx2,78%) var(--ty2,78%),#47bcd8 0%,rgba(71,188,216,0) 100%),radial-gradient(ellipse 28% 26% at var(--bx,22%) var(--by,70%),#8de3fa 0%,rgba(141,227,250,0) 100%),linear-gradient(var(--ang,186deg),#fd2d12 0%,#f25a20 26%,#d07a48 38%,#b9a088 48%,#a7b0a4 54%,#84c4d4 62%,#5ed2ee 74%,#4bc8e2 100%)}';
    document.head.appendChild(st);
  }

  function destroyNisSphere() {
    if (S.tick) gsap.ticker.remove(S.tick);
    S.off.splice(0).forEach(function (fn) { fn(); });
    S.io && S.io.disconnect();
    S.ro && S.ro.disconnect();
    S.el && S.el.remove();
    S.img && gsap.set(S.img, { clearProps: 'opacity' });
    S.el = S.img = S.tick = S.io = S.ro = null;
  }

  function initNisSphere(scope) {
    destroyNisSphere();
    if (window.Webflow && Webflow.env && Webflow.env('editor') !== undefined) return;
    var sec = (scope || document).querySelector('.is-nis-energy');
    var wrap = sec && sec.querySelector('.div-8');
    if (!wrap || typeof gsap === 'undefined') return;

    var el = document.createElement('div');
    el.className = 'nis-sphere';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="nis-sphere_ball"></div>';
    wrap.appendChild(el);
    S.el = el;
    var ball = el.firstChild;

    S.ro = new ResizeObserver(function () {
      ball.style.filter = 'blur(' + Math.round(ball.offsetWidth * 0.045) + 'px)';
    });
    S.ro.observe(ball);

    var m = { x: 0, y: 0 }, c = { x: 0, y: 0 }, active = false, visible = false;
    function move(e) {
      var r = ball.getBoundingClientRect();
      m.x = gsap.utils.clamp(-1, 1, (e.clientX - (r.left + r.width / 2)) / (r.width * 0.75));
      m.y = gsap.utils.clamp(-1, 1, (e.clientY - (r.top + r.height / 2)) / (r.height * 0.75));
      active = true;
    }
    function leave() { active = false; }
    sec.addEventListener('pointermove', move);
    sec.addEventListener('pointerleave', leave);
    S.off.push(function () {
      sec.removeEventListener('pointermove', move);
      sec.removeEventListener('pointerleave', leave);
    });

    S.io = new IntersectionObserver(function (en) { visible = en[0].isIntersecting; });
    S.io.observe(sec);

    function set(k, v) { ball.style.setProperty(k, v); }
    S.tick = function (t) {
      if (!visible) return;
      var tx = active ? m.x : Math.sin(t * 0.4) * 0.35;
      var ty = active ? m.y : Math.cos(t * 0.3) * 0.3;
      c.x += (tx - c.x) * 0.08;
      c.y += (ty - c.y) * 0.08;
      var x = c.x * 2, y = c.y * 2;
      set('--tx', (x * 4).toFixed(2) + '%');
      set('--ty', (y * 3).toFixed(2) + '%');
      set('--lx', (50 + x * 30).toFixed(1) + '%');
      set('--ly', (40 + y * 30).toFixed(1) + '%');
      set('--wx', (60 + x * 18).toFixed(1) + '%');
      set('--wy', (18 + y * 10).toFixed(1) + '%');
      set('--ox', (26 + x * 10).toFixed(1) + '%');
      set('--oy', (30 + y * 8).toFixed(1) + '%');
      set('--px', (92 - x * 8).toFixed(1) + '%');
      set('--py', (42 + y * 12).toFixed(1) + '%');
      set('--cx', (46 - x * 18).toFixed(1) + '%');
      set('--cy', (82 - y * 10).toFixed(1) + '%');
      set('--bx', (22 - x * 10).toFixed(1) + '%');
      set('--by', (70 - y * 8).toFixed(1) + '%');
      set('--kx', (48 + x * 14).toFixed(1) + '%');
      set('--ky', (36 + y * 10).toFixed(1) + '%');
      set('--gx', (12 - x * 6).toFixed(1) + '%');
      set('--gy', (52 - y * 6).toFixed(1) + '%');
      set('--mx', (88 - x * 6).toFixed(1) + '%');
      set('--my', (64 - y * 8).toFixed(1) + '%');
      set('--tx2', (78 - x * 12).toFixed(1) + '%');
      set('--ty2', (78 - y * 8).toFixed(1) + '%');
      set('--ang', (186 + x * 30).toFixed(1) + 'deg');
    };
    gsap.ticker.add(S.tick);

    var img = wrap.querySelector('img');
    S.img = img;
    gsap.to(el, { opacity: 1, duration: 0.6, ease: 'power2.out' });
    img && gsap.to(img, { opacity: 0, duration: 0.6, ease: 'power2.out' });
  }

  // ---------- Typeform: load the embed, or rescan it after a Barba change ----------
  function initTypeform() {
    if (!document.querySelector('[data-tf-live], [data-tf-widget]')) return;
    if (window.tf && typeof window.tf.load === 'function') {
      window.tf.load();
    } else if (!document.getElementById('tf-embed-js')) {
      var s = document.createElement('script');
      s.id = 'tf-embed-js';
      s.src = 'https://embed.typeform.com/next/embed.js';
      document.body.appendChild(s);
    }
  }

  // ---------- Hero button: smooth scroll to the form, without Barba catching the link ----------
  function initNisAnchors() {
    document.querySelectorAll('a[href="#pre-order"]').forEach(function (a) {
      if (a.dataset.nisScroll) return;
      a.dataset.nisScroll = '1';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof scrollToId === 'function') scrollToId('pre-order');
        else {
          var t = document.getElementById('pre-order');
          t && t.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  function initNis() {
    initNisSphere(document);
    initTypeform();
    initNisAnchors();
  }

  initNis();
  if (window.barba) {
    barba.hooks.beforeLeave(function () { destroyNisSphere(); });
    barba.hooks.after(function () { initNis(); });
  }
})();


/* =========================================================================
   3. HARDWARE
   Hardware page: model chart positions, chart scroll on tablet and mobile,
   "See performance" scroll. Runs on first load and after every Barba
   transition. Does nothing on other pages.
   ========================================================================= */

(function () {
  var HW = { cleanups: [] };

  function inEditor() {
    return window.Webflow && Webflow.env && Webflow.env('editor') !== undefined;
  }

  function onCleanup(fn) {
    HW.cleanups.push(fn);
  }

  function teardown() {
    HW.cleanups.splice(0).forEach(function (fn) { fn(); });
  }

  // ---------- Model chart: place each point from its date and size ----------
  // Each .hw-model-point carries data-date (YYYY-MM-DD) and data-params
  // (billions). Positions match the chart drawing (viewBox 1552 x 660):
  // x axis starts Jul 2024 at x=146, 38.06 per month;
  // y axis is log scale, 1T at y=328.2, 256.2 per decade.
  var CHART = { w: 1552, h: 660, x0: 146, perMonth: 38.06, y1T: 328.2, perDecade: 256.2 };
  var START = Date.UTC(2024, 6, 1);
  var DAY = 86400000;

  function pointPosition(date, params) {
    var p = date.split('-').map(Number);
    var months = (Date.UTC(p[0], p[1] - 1, p[2]) - START) / DAY / 30.4375;
    var x = CHART.x0 + months * CHART.perMonth;
    var y = CHART.y1T - (Math.log10(params) - 3) * CHART.perDecade;
    return { left: (x / CHART.w) * 100, top: (y / CHART.h) * 100 };
  }

  function initModelPoints() {
    var points = document.querySelectorAll('.hw-model-point[data-date][data-params]');
    if (!points.length) return;

    points.forEach(function (point) {
      var params = parseFloat(point.dataset.params);
      if (!point.dataset.date || !params) return;
      var pos = pointPosition(point.dataset.date, params);
      point.style.left = pos.left + '%';
      point.style.top = pos.top + '%';
    });
  }

  // ---------- Model chart scroll (tablet and mobile) ----------
  // The chart overflows horizontally on smaller screens (CSS). It opens
  // centred on DeepSeek V4, and the edge fades show only where there is
  // more to scroll.
  function initModelScroll() {
    var scroller = document.querySelector('[data-model-scroll]');
    if (!scroller || scroller.dataset.scriptInitialized === 'true') return;
    scroller.dataset.scriptInitialized = 'true';

    var frame = scroller.closest('.hw-model-frame') || scroller.parentElement;
    var fadeLeft = frame.querySelector('.hw-model-fade:not(.is-right)');
    var fadeRight = frame.querySelector('.hw-model-fade.is-right');

    var focus = Array.prototype.find.call(scroller.querySelectorAll('.hw-model-point'), function (point) {
      var name = point.querySelector('.hw-model-name');
      return name && /deepseek v4/i.test(name.textContent);
    });

    function scrollable() {
      return scroller.scrollWidth - scroller.clientWidth > 1;
    }

    function updateFades() {
      var max = scroller.scrollWidth - scroller.clientWidth;
      if (fadeLeft) fadeLeft.style.opacity = max > 1 && scroller.scrollLeft > 4 ? '1' : '0';
      if (fadeRight) fadeRight.style.opacity = max > 1 && scroller.scrollLeft < max - 4 ? '1' : '0';
    }

    var centred = false;
    function centreOnFocus() {
      if (!focus || !scrollable()) {
        centred = false;
        updateFades();
        return;
      }
      if (centred) return;
      var s = scroller.getBoundingClientRect();
      var p = focus.getBoundingClientRect();
      scroller.scrollLeft += p.left + p.width / 2 - (s.left + s.width / 2);
      centred = true;
      updateFades();
    }

    scroller.addEventListener('scroll', updateFades, { passive: true });
    var ro = new ResizeObserver(centreOnFocus);
    ro.observe(scroller);
    centreOnFocus();

    onCleanup(function () {
      scroller.removeEventListener('scroll', updateFades);
      ro.disconnect();
      delete scroller.dataset.scriptInitialized;
    });
  }

  // ---------- "See performance": smooth scroll, same as #pre-order on NIS ----------
  function initPerformanceLink() {
    if (!document.getElementById('performance')) return;

    document.querySelectorAll('a[href="#performance"]').forEach(function (a) {
      if (a.dataset.hwScroll) return;
      a.dataset.hwScroll = '1';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof scrollToId === 'function') scrollToId('performance');
        else document.getElementById('performance').scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  function initHardware() {
    teardown();
    if (inEditor()) return;
    initModelPoints();
    initModelScroll();
    initPerformanceLink();
  }

  initHardware();
  if (window.barba) {
    barba.hooks.beforeLeave(teardown);
    barba.hooks.after(initHardware);
  }
})();
