/* Android 12 replaced the old overscroll glow with a stretch: the content is
   pulled past the edge, stretches a little, and springs back. A fixed app
   shell with its own scroller never reaches that effect, so the hub rebuilds
   it — this time the way the platform actually moves.

   The old version scaled the shell from the pulled edge and stopped there. That
   leaves the edge under the finger standing still while the far end of the page
   grows: the content slides *away* from the gesture instead of following it,
   which is what read as unnatural. Here the near edge travels exactly with the
   finger, the content behind it stretches by at most 4.5%, and the far end
   moves out of the window, which is what the platform's stretch does. The
   return is a damped spring rather than a CSS transition, so a new touch can
   take over the frame that is on screen without a snap, and a fling that
   arrives at an edge throws one short pulse of the same stretch.

   iOS keeps its native rubber band: this file does nothing there, and the CSS
   that turns off the native edge effect is scoped to the class added below. */
(function () {
  'use strict';

  const ua = navigator.userAgent || '';
  if (!/Android/i.test(ua) || /iPhone|iPad|iPod/i.test(ua)) return;

  const motion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  if (motion && motion.matches) return;

  const root = document.documentElement;
  const MAX_PULL = 96;       // finger travel, in px, that fills the stretch
  const MAX_STRETCH = 0.045; // never more than 4.5% — a cue, not a distortion
  const FLING_MIN = 0.4;     // px/ms — below this a scroll just stops at the edge
  const STIFFNESS = 260;
  const DAMPING = 26;

  let hub = null;
  let surface = null;
  let height = 1;
  let tracking = false;
  let dir = 0; // 1 = pulled at the top, -1 = pulled at the bottom
  let pull = 0;
  let startY = 0;
  let startTop = 0;
  let lastPull = 0;
  let lastMoveAt = 0;
  let releaseSpeed = 0;
  let spring = 0;
  let allowed = true;
  let lastTop = null;
  let lastAt = 0;

  function atTop() {
    return hub.scrollTop <= 0;
  }

  function atBottom() {
    return hub.scrollTop + hub.clientHeight >= hub.scrollHeight - 1;
  }

  function paint() {
    if (!surface) return;
    if (pull < 0.05) {
      surface.style.transform = '';
      surface.style.transformOrigin = '';
      surface.style.willChange = '';
      return;
    }
    // The stretch grows with the pull but never past the cap, so a hard drag
    // cannot turn the page into a smear.
    const stretch = Math.min(MAX_STRETCH, (pull / height) * 0.5);
    surface.style.transformOrigin = dir > 0 ? '50% 0%' : '50% 100%';
    surface.style.willChange = 'transform';
    surface.style.transform =
      'translate3d(0,' + (dir > 0 ? pull : -pull).toFixed(2) + 'px,0)' +
      ' scale(1,' + (1 + stretch).toFixed(4) + ')';
  }

  function cancelSpring() {
    if (!spring) return;
    window.cancelAnimationFrame(spring);
    spring = 0;
  }

  function rest() {
    cancelSpring();
    pull = 0;
    dir = 0;
    paint();
  }

  /* A damped spring, integrated on the frame clock. Stopping it is just a
     cancelled frame: the live pull stays where the fingers last saw it, which
     is what lets a new touch catch the animation mid-flight. */
  function springToRest(from, velocity) {
    cancelSpring();
    let x = from;
    let v = velocity || 0;
    let last = window.performance && performance.now ? performance.now() : Date.now();

    function step(now) {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      const accel = -STIFFNESS * x - DAMPING * v;
      v += accel * dt;
      x += v * dt;
      if (x <= 0 && v <= 0) {
        spring = 0;
        rest();
        return;
      }
      pull = Math.max(0, x);
      paint();
      spring = window.requestAnimationFrame(step);
    }

    spring = window.requestAnimationFrame(step);
  }

  function onStart(event) {
    if (!allowed || !hub || event.touches.length !== 1) {
      if (tracking) rest();
      return;
    }
    // Catching an animation is what Android calls the touch that stops a
    // stretch: the content stays exactly where the frame put it.
    cancelSpring();
    const touch = event.touches[0];
    startY = touch.clientY;
    startTop = hub.scrollTop;
    tracking = true;
    lastPull = pull;
    lastMoveAt = event.timeStamp || 0;
    releaseSpeed = 0;
    if (!pull) dir = 0;
  }

  function onMove(event) {
    if (!allowed || !tracking || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dy = touch.clientY - startY;

    if (!dir) {
      // Horizontal gestures belong to whatever is under the finger, and a
      // vertical one needs a few pixels of slop before the edge reacts.
      if (Math.abs(dy) < 5) return;
    }

    // How far the finger has travelled past what the scroller could use. The
    // scrollTop term means a swipe that starts halfway down only begins
    // pulling once the list has actually reached the top (or bottom).
    let over = 0;
    if (dir > 0) {
      over = dy - startTop + hub.scrollTop;
    } else if (dir < 0) {
      over = -dy + startTop - hub.scrollTop;
    } else if (dy > 0 && atTop()) {
      over = dy - startTop + hub.scrollTop;
    } else if (dy < 0 && atBottom()) {
      over = -dy + startTop - hub.scrollTop;
    } else {
      return;
    }

    if (over <= 0) {
      // The finger turned back past the edge: hand the gesture back to the
      // scroller instead of holding the content hostage.
      if (dir) rest();
      return;
    }

    if (!dir) {
      if (over < 3) return;
      dir = dy > 0 ? 1 : -1;
      height = surface.offsetHeight || height;
    }

    if (event.cancelable) event.preventDefault();

    // Damped: (1 - e^-x) saturates the pull instead of tracking the finger 1:1,
    // so it never feels like the page is being dragged off the screen.
    pull = MAX_PULL * (1 - Math.exp(-over / 72));
    const now = event.timeStamp || 0;
    if (now > lastMoveAt) {
      releaseSpeed = (pull - lastPull) / (now - lastMoveAt);
      lastMoveAt = now;
    }
    lastPull = pull;
    paint();
  }

  function onEnd() {
    if (!tracking) return;
    tracking = false;
    if (!dir) return;
    // Released mid-stretch: hand the finger's own speed to the spring, which
    // is what makes a flick back feel like it was thrown rather than dropped.
    if (pull > 0) springToRest(pull, releaseSpeed * 12);
    else rest();
  }

  /* A fling arrives at an edge with the finger already gone. Play the stretch
     it was heading for as one short pulse and let the spring take it back. */
  function pulse(direction, speed) {
    if (!allowed || !surface || tracking || spring) return;
    if (direction > 0 ? !atTop() : !atBottom()) return;
    height = surface.offsetHeight || height;
    dir = direction;
    pull = Math.min(MAX_PULL * 0.7, 12 + speed * 26);
    paint();
    springToRest(pull, 0);
  }

  function onScroll() {
    if (!allowed || !hub || !surface) return;
    const now = window.performance && performance.now ? performance.now() : Date.now();
    const top = hub.scrollTop;
    if (lastTop === null) {
      lastTop = top;
      lastAt = now;
      return;
    }
    const dt = Math.max(1, now - lastAt);
    const speed = (top - lastTop) / dt;
    const max = hub.scrollHeight - hub.clientHeight;

    // Momentum is still moving towards the edge when the scroller reaches it.
    if (top <= 0 && lastTop > 0 && speed < -FLING_MIN) pulse(1, -speed);
    else if (max > 0 && top >= max && lastTop < max && speed > FLING_MIN) pulse(-1, speed);

    lastTop = top;
    lastAt = now;
  }

  function attach() {
    hub = document.getElementById('hub');
    if (!hub) return;
    surface = hub.querySelector('.hub-shell');
    if (!surface) return;
    height = surface.offsetHeight || window.innerHeight;
    root.classList.add('has-stretch');
    hub.addEventListener('touchstart', onStart, { passive: true });
    hub.addEventListener('touchmove', onMove, { passive: false });
    hub.addEventListener('touchend', onEnd, { passive: true });
    hub.addEventListener('touchcancel', onEnd, { passive: true });
    hub.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () {
      height = surface.offsetHeight || height;
      if (tracking || spring) return;
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
