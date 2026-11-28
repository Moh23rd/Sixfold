# WebView Animation Rules & References

This app is a plain HTML/CSS/JS application wrapped inside an Android WebView APK. Every UI animation must be hardware-accelerated to run smoothly at 60fps on mobile devices without bloating GPU memory.

## Required Reference Links
Before writing or modifying any animations, consult these resources for motion patterns, timing, and easing curves:
- **Motion AI Docs (use vanilla JS / CSS APIs, not React):** https://motion.dev
- **UI Animation Guide:** https://emilkowal.ski
- **CSS Keyframes Library:** https://animista.net
- **CSS Easing Curves:** https://easings.net

## Strict Android WebView Rules
1. **GPU-Only Properties:** Animate ONLY `transform` (`translate3d`, `scale`, `rotate`) and `opacity`. NEVER animate layout or paint properties (`top`, `left`, `right`, `bottom`, `width`, `height`, `margin`, or `padding`).
2. **Scoped Compositing (`will-change`):** Do NOT leave `will-change` or `translateZ(0)` permanently on elements. Apply `will-change: transform, opacity;` right before/during an active animation and remove it (`transitionend` or animation cleanup) once motion finishes so lower-end Android devices don't suffer from excess GPU layer memory.
3. **Scale-Matched Timings:** Keep small UI controls (buttons, pills, tooltips) fast at `150ms–250ms`, and use `250ms–350ms` for larger surfaces like bottom sheets, drawers, or multi-element transitions. Avoid sluggish `400ms+` transitions.
4. **Directional Easing Curves:** Use responsive `ease-out` curves like `cubic-bezier(0.2, 0.8, 0.2, 1)` for entrances and `cubic-bezier(0.4, 0, 1, 1)` for exits. Avoid generic `linear` or `ease-in-out` on UI panels.
5. **Tap & Touch Responsiveness:** Include `-webkit-tap-highlight-color: transparent;` and `touch-action: manipulation;` on interactive controls so press animations trigger cleanly without mobile tap delay.
6. **Clean Frame Loops & Reduced Motion:** Drive JS-driven motion with `requestAnimationFrame` (never `setInterval` for visual movement), clean up animation frames/listeners on completion, and respect `prefers-reduced-motion`.
