/* The Android 12 stretch, rebuilt for a page that scrolls inside a WebView.

   The platform's own guide (developer.android.com, "Animate a scroll gesture",
   "Implement the stretch overscroll effect") and the class it points at,
   android.widget.EdgeEffect, define the effect as four rules:

   1. The pull is measured in fractions of the viewport, not pixels, and it is
      clamped at 1 — "Don't allow stretch beyond 1" in EdgeEffect.onPull.
   2. A touch that lands while the effect is animating *catches* it: the
      animation stops on the frame that is on screen and the finger takes over
      from there, so nothing ever snaps back under the finger.
   3. Dragging back towards the edge releases the stretch first — the pull is
      consumed before the list is allowed to scroll — and only then does the
      content move.
   4. The recovery is a spring, not a transition: AOSP uses a natural frequency
      of 24.657 rad/s with a damping ratio of 0.98 (an almost critically damped
      settle, roughly a quarter of a second, no visible bounce). A fling that
      arrives at the edge is absorbed into that spring with the platform's
      ON_ABSORB_VELOCITY_ADJUSTMENT of 13.

   The shape is the other half of it, and it is what went wrong before. HWUI
   draws the stretch as a *magnification* anchored on the edge being pulled:
   StretchEffect::makeLinearStretch does `setScale(1 + |stretch|, ...,
   stretch > 0 ? 0 : height)`, i.e. the pulled edge stays on the viewport
   boundary and the content grows away from it, with the falloff near the edge
   supplied by the shader. CSS cannot express the cubic falloff, but the affine
   part is exactly that scale about the pulled edge. Translating the layer down
   and squeezing it — which is what this file used to do — opens a gap above the
   page and reads as a drag with a squashed page, nothing like the platform.

   How much it magnifies comes from EdgeEffect.dampStretchVector, and it is
   small: 0.016 × (u + 1 − e^(−u·e/0.33)) for a pull u, which tops out at 3.2%
   of the viewport however hard the page is dragged. That ceiling is what makes
   the platform read as a rubber band; growing the page by anything close to the
   finger's travel turns it into a zoom of the whole screen.

   iOS keeps its native rubber band: this file does nothing there. */

(function () {
  'use strict';

  const ua = navigator.userAgent || '';
  if (!/Android/i.test(ua) || /iPhone|iPad|iPod/i.test(ua)) return;

  const motion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  const root = document.documentElement;

  // EdgeEffect's stretch spring.
  const OMEGA = 24.657;      // NATURAL_FREQUENCY, rad/s
  const ZETA = 0.98;         // DAMPING_RATIO
  const ABSORB = 13;         // ON_ABSORB_VELOCITY_ADJUSTMENT
  const STIFFNESS = OMEGA * OMEGA;
  const DAMPING = 2 * ZETA * OMEGA;
  const SETTLE_PULL = 0.0004;  // fraction of the viewport
  const SETTLE_SPEED = 0.02;   // fractions per second
  const MAX_FRACTION = 1;      // EdgeEffect clamps the pull here

  // EdgeEffect.dampStretchVector: the scale the platform shows for a pull of u.
  // A linear term plus an exponential one that is spent by u = 1, so the whole
  // effect is capped at 0.032 — 3.2% of the viewport — and a drag of half the
  // screen already shows most of what a drag of the whole screen shows.
  const STRETCH_INTENSITY = 0.016;   // LINEAR_/EXP_STRETCH_INTENSITY
  const STRETCH_EXP_DISTANCE = 0.33; // SCROLL_DIST_AFFECTED_BY_EXP_STRETCH
  const STRETCH_EXP_RATE = Math.E / STRETCH_EXP_DISTANCE;
  const STRETCH_MAX = STRETCH_INTENSITY * 2; // the ceiling at u = 1
  const SLOP = 6;            // px of travel before a drag is claimed
  const FLING_MIN = 0.35;    // px/ms

  let hub = null;
  let height = 1;
  let dir = 0;               // 1 = pulled at the top, -1 = pulled at the bottom
  let pull = 0;              // EdgeEffect's mPullDistance: viewport fractions
  let frame = 0;
  let tracking = false;
  let startY = 0;
  let startTop = 0;
  let lastY = 0;
  let lastAt = 0;
  let speed = 0;             // px/ms, finger or momentum
  let allowed = !(window.SixfoldMotion && window.SixfoldMotion.reduced());
  let lastTop = null;
  let lastScrollAt = 0;

  const now = function () {
    return window.performance && performance.now ? performance.now() : Date.now();
  };

  function atTop() {
    return hub.scrollTop <= 0;
  }

  function atBottom() {
    return hub.scrollTop + hub.clientHeight >= hub.scrollHeight - 1;
  }

  function measure() {
    height = Math.max(1, hub.clientHeight || window.innerHeight);
  }

  /* The pull saturates the way the platform's does: every extra pixel of drag
     buys less stretch than the last, and the total never leaves STRETCH_MAX. */
  function stretchOf(distance) {
    const u = Math.max(0, Math.min(MAX_FRACTION, distance));
    return Math.min(STRETCH_MAX, STRETCH_INTENSITY * (u + 1 - Math.exp(-u * STRETCH_EXP_RATE)));
  }

  function paint() {
    if (!hub) return;
    if (!dir || pull <= 0) {
      hub.style.transform = '';
      hub.style.transformOrigin = '';
      hub.style.willChange = '';
      return;
    }
    // Magnify about the pulled edge — no translation, so the edge never leaves
    // the viewport and no gap can open above the page. The content between the
    // edges is stretched and the far edge is pushed out of view.
    const scale = 1 + stretchOf(pull);
    hub.style.transformOrigin = dir > 0 ? '50% 0%' : '50% 100%';
    hub.style.willChange = 'transform';
    hub.style.transform = 'scale3d(1,' + scale.toFixed(5) + ',1)';
  }

  function cancel() {
    if (!frame) return;
    window.cancelAnimationFrame(frame);
    frame = 0;
  }

  function rest() {
    cancel();
    pull = 0;
    dir = 0;
    paint();
  }

  /* The settle. Integrated on the frame clock with fixed sub-steps so a long
     frame cannot make the spring explode; stopping it is just a cancelled
     frame, and the pull stays where the last painted frame left it, which is
     what lets a touch catch the animation mid-flight. */
  function settle(from, velocity) {
    cancel();
    let x = Math.max(0, from);
    let v = velocity || 0;
    let last = now();

    function step(at) {
      let dt = Math.min(64, at - last) / 1000;
      last = at;
      while (dt > 0) {
        const slice = Math.min(dt, 1 / 240);
        const accel = -STIFFNESS * x - DAMPING * v;
        v += accel * slice;
        x += v * slice;
        dt -= slice;
      }
      if (x <= 0 && v <= 0) {
        rest();
        return;
      }
      if (Math.abs(x) <= SETTLE_PULL && Math.abs(v) <= SETTLE_SPEED) {
        rest();
        return;
      }
      pull = Math.max(0, Math.min(MAX_FRACTION, x));
      paint();
      frame = window.requestAnimationFrame(step);
    }

    frame = window.requestAnimationFrame(step);
  }

  function onStart(event) {
    if (!allowed || !hub || event.touches.length !== 1) {
      if (tracking) rest();
      return;
    }
    const touch = event.touches[0];
    // Rule 2: a touch during the settle catches it. The pull is left exactly
    // where the frame on screen put it and the gesture continues from there.
    cancel();
    if (pull > 0) {
      // Offset the origin of the gesture so the finger resumes the stretch at
      // the pull it was already showing instead of jumping back to flat.
      startY = touch.clientY - dir * pull * height;
    } else {
      startY = touch.clientY;
      dir = 0;
    }
    startTop = hub.scrollTop;
    lastY = touch.clientY;
    lastAt = event.timeStamp || 0;
    speed = 0;
    tracking = true;
  }

  function onMove(event) {
    if (!allowed || !tracking || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dy = touch.clientY - startY;

    if (!dir) {
      if (Math.abs(dy) < SLOP) return;
      if (dy > 0 && atTop()) dir = 1;
      else if (dy < 0 && atBottom()) dir = -1;
      else return; // the list can still move: this is a scroll, not a stretch
    }

    // Travel past what the scroller could use. The scrollTop term means a
    // swipe that starts halfway down only starts pulling once the list has
    // actually reached the edge.
    const over = dir > 0 ? dy - startTop + hub.scrollTop : -dy + startTop - hub.scrollTop;

    if (over <= 0) {
      if (pull > 0) {
        // Rule 3: the finger came back past the edge, so the stretch is spent.
        // Hand the rest of the gesture to the browser and let the list scroll.
        rest();
        tracking = false;
      } else {
        // Still inside the scrollable range: keep watching for the edge.
        dir = 0;
      }
      return;
    }

    if (event.cancelable) event.preventDefault();

    const stamp = event.timeStamp || 0;
    if (stamp > lastAt) {
      speed = (touch.clientY - lastY) / (stamp - lastAt);
      lastAt = stamp;
      lastY = touch.clientY;
    }

    // Rule 1: the pull is a fraction of the viewport and it is clamped.
    pull = Math.min(MAX_FRACTION, over / height);
    paint();
  }

  function onEnd() {
    if (!tracking) return;
    tracking = false;
    if (!dir) return;
    if (pull > 0) {
      // A released drag hands the speed it was still carrying *into* the
      // stretch to the spring, in EdgeEffect's units (viewport fractions per
      // second). It is capped: a hard flick would otherwise throw the pull far
      // past what the finger ever showed. Dragging back towards the edge hands
      // nothing over — the spring takes it from where the finger left it.
      const into = Math.max(0, Math.min(1.2, (speed * 1000) / height));
      settle(pull, into);
    } else {
      rest();
    }
  }

  /* A fling that reaches the edge with momentum still in it is absorbed: the
     platform feeds the velocity into the spring scaled by 13, which shows a
     short stretch that decays instead of stopping dead on the boundary. */
  function absorb(direction, momentum) {
    if (!allowed || !hub || tracking || frame) return;
    if (direction > 0 ? !atTop() : !atBottom()) return;
    measure();
    dir = direction;
    pull = Math.min(MAX_FRACTION, Math.min(0.35, momentum * 0.18));
    settle(pull, Math.min(1.5, (momentum * 1000 * ABSORB) / height));
  }

  function onScroll() {
    if (!allowed || !hub) return;
    const at = now();
    const top = hub.scrollTop;
    if (lastTop === null) {
      lastTop = top;
      lastScrollAt = at;
      return;
    }
    const dt = Math.max(1, at - lastScrollAt);
    const momentum = (top - lastTop) / dt; // px/ms
    const max = hub.scrollHeight - hub.clientHeight;

    if (top <= 0 && lastTop > 0 && momentum < -FLING_MIN) absorb(1, -momentum);
    else if (max > 0 && top >= max && lastTop < max && momentum > FLING_MIN) absorb(-1, momentum);

    lastTop = top;
    lastScrollAt = at;
  }

  function attach() {
    hub = document.getElementById('hub');
    if (!hub) return;
    measure();
    if (allowed) root.classList.add('has-stretch');
    hub.addEventListener('touchstart', onStart, { passive: true });
    hub.addEventListener('touchmove', onMove, { passive: false });
    hub.addEventListener('touchend', onEnd, { passive: true });
    hub.addEventListener('touchcancel', onEnd, { passive: true });
    hub.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () {
      measure();
      if (tracking || frame) return;
      rest();
    });
  }

  // The stretch is part of the motion system, so it follows the page's answer
  // rather than the raw media query: a player who chose Full keeps the stretch
  // on a device that asks for reduced motion, and switching the setting applies
  // without a reload. The settings module announces every change.
  const syncMotion = function () {
    allowed = !(window.SixfoldMotion && window.SixfoldMotion.reduced());
    if (!allowed) {
      rest();
      root.classList.remove('has-stretch');
    } else if (hub) {
      root.classList.add('has-stretch');
    }
  };
  window.addEventListener('sixfold:settings', syncMotion);
  if (motion) {
    if (motion.addEventListener) motion.addEventListener('change', syncMotion);
    else if (motion.addListener) motion.addListener(syncMotion);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
