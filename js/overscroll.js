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

   iOS keeps its native rubber band: this file does nothing there. */

(function () {
  'use strict';

  const ua = navigator.userAgent || '';
  if (!/Android/i.test(ua) || /iPhone|iPad|iPod/i.test(ua)) return;

  const motion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  if (motion && motion.matches) return;

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

  // How much the content can grow (as a fraction of the viewport) at a
  // saturated pull, and how quickly the pull fills that up. The stretch lags
  // the finger — that lag is the effect — and saturates instead of following it
  // all the way to the boundary.
  const MAX_TRAVEL = 0.18;
  const PULL_SCALE = 0.5;
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
  let allowed = true;
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

  /* The pull is saturating, like EdgeEffect.dampStretchVector: a hard drag
     keeps adding travel, but each extra pixel buys less than the last, so the
     page can never be pulled off the screen. tanh keeps the first few
     millimetres responsive and then flattens out quietly. */
  function travelOf(distance) {
    const d = Math.max(0, Math.min(MAX_FRACTION, distance));
    return height * MAX_TRAVEL * Math.tanh(d / PULL_SCALE);
  }

  function paint() {
    if (!hub) return;
    const growth = travelOf(pull);
    if (growth < 0.05 || !dir) {
      hub.style.transform = '';
      hub.style.transformOrigin = '';
      hub.style.willChange = '';
      return;
    }
    // Magnify about the pulled edge — no translation, so the edge never leaves
    // the viewport and no gap can open above the page. The content between the
    // edges is stretched and the far edge is pushed out of view.
    const scale = (height + growth) / height;
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
    root.classList.add('has-stretch');
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

  if (motion) {
    const syncMotion = function () {
      allowed = !motion.matches;
      if (!allowed) {
        rest();
        root.classList.remove('has-stretch');
      } else {
        root.classList.add('has-stretch');
      }
    };
    if (motion.addEventListener) motion.addEventListener('change', syncMotion);
    else if (motion.addListener) motion.addListener(syncMotion);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
