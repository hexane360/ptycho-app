
import { Transform1D } from "./transform";

export type Pair = readonly [number, number];
export type ArrayOrNum = number | ReadonlyArray<number>;
export type Writable<T extends ArrayOrNum> = T & (T extends number ? number : T extends readonly number[] ? number[] : never);


export function clamp<T extends ArrayOrNum>(val: T, extent: Pair): Writable<T> {
    if (typeof val === "number") {
        return Math.max(extent[0], Math.min(extent[1], val)) as Writable<T>;
    }
    return val.map((val) => clamp(val, extent)) as Writable<T>;
}


export function isClose<T extends ArrayOrNum>(left: T, right: T, rtol: number = 1e-6, atol: number = 1e-6): boolean {
    if (typeof left === "number") {
        return typeof right == "number" && (
            Math.abs(left - right) < Math.max(rtol * Math.max(Math.abs(left), Math.abs(right)), atol)
        );
    }
    if (typeof right === "number" || left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
        if (!isClose(left[i], right[i], rtol, atol)) return false;
    }
    return true;
}


export class PlotScale {
    readonly domain: Pair
    readonly range: Pair

    constructor(domain: Pair, range: Pair) {
        this.domain = domain;
        this.range = range;
    }

    toString = () => `PlotScale { domain: [${this.domain[0]}, ${this.domain[1]}] range: [${this.range[0]}, ${this.range[1]}] }`;

    isClose = (other: PlotScale) => isClose(this.domain, other.domain) && isClose(this.range, other.range);

    domainSize = () => Math.abs(this.domain[1] - this.domain[0]);
    rangeSize = () => Math.abs(this.range[1] - this.range[0]);

    domainToUnit<T extends ArrayOrNum>(val: T, clip?: boolean): Writable<T> {
        if (clip) {
            val = clamp(val, this.domain);
        }
        if (typeof val === "number") {
            return (val - this.domain[0]) / (this.domain[1] - this.domain[0]) as Writable<T>;
        }
        return val.map((val) => (val - this.domain[0]) / (this.domain[1] - this.domain[0])) as Writable<T>;
    }

    rangeToUnit<T extends ArrayOrNum>(val: T, clip?: boolean): Writable<T> {
        if (clip) {
            val = clamp(val, this.range);
        }
        if (typeof val === "number") {
            return (val - this.range[0]) / (this.range[1] - this.range[0]) as Writable<T>;
        }
        return val.map((val) => (val - this.range[0]) / (this.range[1] - this.range[0])) as Writable<T>;
    }

    domainFromUnit<T extends ArrayOrNum>(val: T, clip?: boolean): Writable<T> {
        if (clip) {
            val = clamp(val, [0.0, 1.0]);
        }
        if (typeof val === "number") {
            return val * (this.domain[1] - this.domain[0]) + this.domain[0] as Writable<T>;
        }
        return val.map((val) => val * (this.domain[1] - this.domain[0]) + this.domain[0]) as Writable<T>;
    }

    rangeFromUnit<T extends ArrayOrNum>(val: T, clip?: boolean): Writable<T> {
        if (clip) {
            val = clamp(val, [0.0, 1.0]);
        }
        if (typeof val === "number") {
            return val * (this.range[1] - this.range[0]) + this.range[0] as Writable<T>;
        }
        return val.map((val) => val * (this.range[1] - this.range[0]) + this.range[0]) as Writable<T>;
    }

    transform<T extends ArrayOrNum>(val: T, clip?: boolean): Writable<T> {
        return this.rangeFromUnit(this.domainToUnit(val, clip), false);
    }

    untransform<T extends ArrayOrNum>(val: T, clip?: boolean): Writable<T> {
        return this.domainFromUnit(this.rangeToUnit(val, clip), false);
    }

    scale(val: number): number {
        return val * (this.range[1] - this.range[0]) / (this.domain[1] - this.domain[0]);
    }

    unscale(val: number): number {
        return val * (this.domain[1] - this.domain[0]) / (this.range[1] - this.range[0]);
    }

    transformDomain(transform: Transform1D): PlotScale {
        return new PlotScale([transform.apply(this.domain[0]), transform.apply(this.domain[1])], this.range);
    }

    transformRange(transform: Transform1D): PlotScale {
        return new PlotScale(this.domain, [transform.apply(this.range[0]), transform.apply(this.range[1])]);
    }
}