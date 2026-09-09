// Minimal in-memory bridge so a pushed picker screen (e.g. the full-screen
// category picker) can hand its selection back to the screen that opened
// it, without a global store. Works because both screens live in the same
// JS runtime — the "opener" awaits a promise that the picker resolves.
//
// Stack, not a single slot — a picker can itself push another picker (the
// Choose Widget screen's "New custom" tile opens the New Widget editor,
// which resolves back to Choose Widget, which then relays that result up
// to whatever opened Choose Widget in the first place). Each awaitPick()
// call pushes its resolver; each resolvePick() call resolves and pops the
// most recently pushed one — LIFO matches the navigation stack, and a
// single non-nested pick (the common case) behaves exactly as before.
type Listener = (value: string) => void;

const stack: Listener[] = [];

export function awaitPick(): Promise<string> {
  return new Promise((resolve) => {
    stack.push(resolve);
  });
}

export function resolvePick(value: string) {
  const listener = stack.pop();
  listener?.(value);
}
