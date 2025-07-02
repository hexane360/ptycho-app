import { atom, useAtomValue, Atom } from 'jotai';

const _memo_cache = new WeakMap()
const memo1 = <T,>(create: () => T, dep1: object): T =>
  (_memo_cache.has(dep1) ? _memo_cache : _memo_cache.set(dep1, create())).get(dep1);

class _Sentinel {}


export function atomValueDeferred<Value>(anAtom: Atom<PromiseLike<Awaited<Value>>>): Awaited<Value> {
    // memoize on atom (one cache and lastValue per atom)
    const derivedAtom = memo1(() => {
        console.log("new cache");
        // stores promises we've already attached to
        const seenPromises = new WeakSet<PromiseLike<Awaited<Value>>>();
        // stores the last value
        let lastValue: Awaited<Value> | _Sentinel = new _Sentinel();

        // refreshAtom is a hack to chain setSelf into an update of self
        const refreshAtom = atom(0);

        return atom(
            (get, { setSelf }) => {
                get(refreshAtom);
                const promise = get(anAtom);

                if (!seenPromises.has(promise)) {
                    // no cached value, set up a handler
                    seenPromises.add(promise);
                    promise.then(
                        (data) => {
                            lastValue = data;
                            setSelf()
                        },
                        (error) => {
                            throw(error);
                        }
                    )
                }

                // return lastValue if present, otherwise the promise
                return (lastValue instanceof _Sentinel) ? promise : lastValue;
            },
            (_get, set) => {
                set(refreshAtom, (c) => c + 1);
            }
        );
    }, anAtom);
    return useAtomValue(derivedAtom);
}