/* The Android smoke's attach retry, kept apart from adb so the decision can be
   tested without an emulator. A cold-starting WebView can be torn down and
   recreated after the activity started, which closes its devtools socket before
   any page answers. Only the attach is retried, and only while the launched
   process is still alive and the platform recorded no death for it. */

import { describeDeath, recordsDeath } from './death-report.mjs';

/* How long one page may stay silent before the probe stops asking. The first
   question gets the whole budget: a page still booting its bridge on a loaded
   guest can stay quiet past ten seconds while the app's own plugin calls are
   already succeeding (the API 33 row's shortcut launch did exactly that), so a
   shorter budget calls a live page dead. A page already found silent is asked
   again briefly — it has had its budget — which keeps a reattach cheap without
   giving up on a page that was slow only once. */
export const BRIDGE_PROBE_BUDGET = 15000;
export const BRIDGE_REPROBE_BUDGET = 2000;

/* Long enough for one page that spends its whole probe budget before it is
   rejected, plus the retry delay and the attach that follows. A second dead page
   passes the window and stays fatal. */
export const ATTACH_RETRY_WINDOW = 30000;

/* Picks the page the player can actually see out of the WebView targets the
   devtools list exposes. `bridge` is the answer of the page's own liveness
   probe: 'alive' when its App plugin ran and answered, 'starting' when the page
   has not registered its plugins yet, and 'gone' when the call was posted to a
   bridge thread that no longer exists.

   Only an alive page can report the native paint hand-off, so a page whose
   bridge is gone is never a candidate even when it is the newest, focused and
   visible one. That is not hypothetical: a cold start on the API 26 image can
   create the activity twice, destroying the first instance about a second after
   it resumes. The first instance's page keeps answering devtools evaluations
   while every plugin call it makes is dropped, which used to make the smoke
   wait out its paint deadline against a page that could never answer. */
export function chooseLivePage(pages) {
  const live = pages.filter((page) => page.bridge === 'alive' && page.visible !== 'hidden');
  if (!live.length) return null;
  const newest = (list) => list.slice().sort((a, b) => (b.origin || 0) - (a.origin || 0))[0];
  return newest(live.filter((page) => page.focused)) || newest(live);
}

/* The page to attach to when none of them answered its bridge probe. A silent
   page is not a proven-dead one: only a refusal (`bridge: 'gone'`) is. A page
   still booting its bridge on a starved guest stays silent for as long as the
   renderer is busy, while the app's own plugin calls succeed moments later —
   the API 33 row failed exactly that way, with the page declared gone ten
   seconds before it answered. Attaching to the newest visible silent page lets
   the paint proof, which is the assertion that matters, decide instead of a
   probe that could not get an answer in time. A page that refused is never
   returned: its bridge thread is gone and no paint hand-off can arrive. */
export function chooseUnprovenPage(pages) {
  const candidates = pages.filter((page) => page.bridge !== 'gone' && page.visible !== 'hidden');
  if (!candidates.length) return null;
  const newest = (list) => list.slice().sort((a, b) => (b.origin || 0) - (a.origin || 0))[0];
  return newest(candidates.filter((page) => page.focused)) || newest(candidates);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function attachToLiveLaunch({
  pid,
  connect,
  livePid,
  deathReport,
  isHostLost = () => false,
  wait = delay,
  now = Date.now,
  windowMs = ATTACH_RETRY_WINDOW,
  log = () => {}
}) {
  const deadline = now() + windowMs;
  for (;;) {
    try {
      return await connect();
    } catch (error) {
      // A host that stopped answering is not a WebView restart.
      if (isHostLost(error)) throw error;
      // A relaunch is a different process, and a dead one is a death: neither
      // may be attached to as if the original launch had survived.
      if (livePid() !== pid) throw new Error(`${error.message} (the launched process is gone)`);
      // An ANR can leave the process alive, so the platform's own record
      // separates a recreated WebView from a stalled first paint.
      const report = await deathReport(pid);
      if (recordsDeath(report)) throw new Error(`${error.message} (${describeDeath(report)})`);
      // The window bounds when another attach may start; an attach already
      // waiting for its target is allowed to finish.
      if (now() >= deadline) throw error;
      log(`reattaching to the same launch after: ${error.message}`);
      await wait(1000);
    }
  }
}
