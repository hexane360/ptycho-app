
import { Pair, ArrayOrNum, Writable, PlotScale } from "./scale";

export class Transform1D {
    readonly k: number = 1.
    readonly p: number = 0.

    constructor(scale: number = 1., offset: number = 0.) {
        this.k = scale;
        this.p = offset;
    }

    static fromScale(scale: PlotScale): Transform1D {
        let k: number = scale.rangeSize() / scale.domainSize();
        return new Transform1D(
            k, scale.range[0] - k * scale.domain[0]
        );
    }

    translate(x: number): Transform1D {
        return new Transform1D(
            this.k,
            x + this.p
        );
    }

    scale(k: number): Transform1D {
        return new Transform1D(
            this.k * k, this.p
        );
    }

    apply<T extends ArrayOrNum>(point: T): Writable<T> {
        if (typeof point == "number") {
            return point * this.k + this.p as Writable<T>;
        }
        return point.map((val) => val * this.k + this.p) as Writable<T>;
    }

    unapply<T extends ArrayOrNum>(point: T): Writable<T> {
        if (typeof point == "number") {
            return (point - this.p)/this.k as Writable<T>;
        }
        return point.map((val) => (val - this.p)/this.k) as Writable<T>;
    }

    invert(): Transform1D {
        return new Transform1D(
            1/this.k,
            -this.p / this.k
        );
    }

    compose(other: Transform1D) {
        return new Transform1D(
            this.k * other.k,
            this.p * other.k + other.p
        );
    }
}

export class Transform2D {
    readonly k: Pair = [1., 1.];
    readonly p: Pair = [0., 0.];

    constructor(scale: Pair = [1., 1.], offset: Pair = [0., 0.]) {
        this.k = scale;
        this.p = offset;
    }

    /**
     * Create a transform from the unit box to the given bounds
     */
    static toBounds(xlim: [number, number], ylim: [number, number]): Transform2D {
        const min: [number, number] = [xlim[0], ylim[0]];
        const range: [number, number] = [xlim[1] - xlim[0], ylim[1] - ylim[0]];
        return new Transform2D(range, min);
    }

    /**
     * Create a transform from the given bounds to the unit box
     */
    static fromBounds(xlim: [number, number], ylim: [number, number]): Transform2D {
        return Transform2D.toBounds(xlim, ylim).invert();
    }

    static from_1d(xtrans: Transform1D, ytrans: Transform1D): Transform2D {
        return new Transform2D(
            [xtrans.k, ytrans.k], [xtrans.p, ytrans.p]
        );
    }

    to_1d(): [Transform1D, Transform1D] {
        return [
            new Transform1D(this.k[0], this.p[0]),
            new Transform1D(this.k[1], this.p[1]),
        ];
    }

    pretranslate(x: number, y: number): Transform2D {
        return new Transform2D(
            this.k,
            [x*this.k[0] + this.p[0], y*this.k[1] + this.p[1]]
        );
    }

    translate(x: number, y: number): Transform2D {
        return new Transform2D(
            this.k,
            [x + this.p[0], y + this.p[1]]
        );
    }

    scale(kx: number, ky: number | undefined): Transform2D {
        if (ky === undefined) {
            ky = kx
        }
        return new Transform2D(
            [this.k[0] * kx, this.k[1] * ky], this.p
        );
    }

    apply(point: readonly [number, number]): [number, number] {
        return [point[0] * this.k[0] + this.p[0], point[1] * this.k[1] + this.p[1]];
    }

    unapply(point: readonly [number, number]): [number, number] {
        return [(point[0] - this.p[0])/this.k[0], (point[1] - this.p[1])/this.k[1]];
    }

    xlim(extent: readonly [number, number] = [0.0, 1.0]): [number, number] {
        return [extent[0] * this.k[0] + this.p[0], extent[1] * this.k[0] + this.p[0]]
    }

    ylim(extent: readonly [number, number] = [0.0, 1.0]): [number, number] {
        return [extent[0] * this.k[1] + this.p[1], extent[1] * this.k[1] + this.p[1]]
    }

    invert(): Transform2D {
        return new Transform2D(
            [1/this.k[0], 1/this.k[1]],
            [-this.p[0]/this.k[0], -this.p[1]/this.k[1]]
        );
    }

    compose(other: Transform2D) {
        return new Transform2D(
            [this.k[0]*other.k[0], this.k[1]*other.k[1]],
            [this.p[0]*other.k[0] + other.p[0], this.p[1]*other.k[1] + other.p[1]]
        );
    }

    toString(): string {
        return `translate(${this.p[0]}, ${this.p[1]}) scale(${this.k[0]}, ${this.k[1]})`;
    }
}