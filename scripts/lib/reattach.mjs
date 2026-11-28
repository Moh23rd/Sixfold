/* The Android smoke's attach retry, kept apart from adb so the decision can be
   tested without an emulator. A cold-starting WebView can be torn down and
   recreated after the activity started, which closes its devtools socket before
   any page answers. Only the attach is retried, and only while the launched
   process is still alive and the platform recorded no death for it. */

import { describeDeath, recordsDeath } from './death-report.mjs';

export const ATTACH_RETRY_WINDOW = 20000;

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
