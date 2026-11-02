import { Injectable, signal } from '@angular/core';
import { BetaMe } from '../beta';

/** Whether an answer means the person is not signed in (no or stale cookie); a network error or any other status does not. */
export const signedOutBy = (status: number): boolean => status === 401;

/**
 * Orders a page's polls: `begin()` numbers one and `latest(n)` stays true until a newer one began, so a slow answer never
 * overwrites a fresher one. `signOut()` (on a 401) drops every poll still in flight, so none can refill the lists.
 */
export function pollGate(): { begin: () => number; latest: (n: number) => boolean; signOut: () => void } {
  let n = 0;
  return { begin: () => ++n, latest: (k) => k === n, signOut: () => void ++n };
}

/** The signed-in person, shared by the shell and the pages; the song pages' poll keeps it fresh. */
@Injectable({ providedIn: 'root' })
export class BetaSession {
  readonly me = signal<BetaMe | null>(null);

  /** One read of `/beta/me` for pages that do not poll it themselves; a 401 forgets the person, a network error leaves `me` as it was. */
  async load() {
    try {
      const r = await fetch('/beta/me', { cache: 'no-store' });
      if (signedOutBy(r.status)) this.signOut();
      else if (r.ok) this.me.set(await r.json());
    } catch {
      // the pages show their own sign-in or network message
    }
  }

  /** Forgets the person after a 401, so the shell drops the balance and the 我 sheet. */
  signOut() {
    this.me.set(null);
  }
}
