import { NArray } from "wasm-array";
import { np } from "./wasm-array";

import { make_recip_grid, Electron } from "./optics";

type Params = Array<number> & { length: 12 };

const ATOM_PARAMS: Map<number, Params> = new Map([
    // S
    [16, [1.0164691e+00, 1.6918197e+00, 4.4176674e-01, 1.7418028e-01,
        1.2150386e-01, 1.6701109e+02, 8.2796669e-01, 2.3034282e+00,
        2.3302253e-02, 1.5695415e-01, 1.1830285e+00, 5.8578291e+00]],
    // Mo
    [42, [6.1016011e-01, 9.1162808e-02, 1.2654400e+00, 5.0677603e-01,
        1.9742876e+00, 5.8959036e+00, 6.4802897e-01, 1.4663411e+00,
        2.6038082e-03, 7.8433631e-03, 1.1388750e-01, 1.5511434e-01]],
]);

function scattering_amplitude(
    k2: NArray,
    z: number,
): NArray {
    let params = ATOM_PARAMS.get(z);
    if (!params) throw new Error(`Unknown/unsupported atomic number '${z}'`);

    let out = np!.zeros(k2.shape, 'complex64');

    for (let i = 0; i < 3; i++) {
        const even = 2 * i;
        const odd = even + 1;

        out = np!.expr`${out} + ${params[even]}/(${k2}+${params[odd]}) + ${params[even + 6]}*exp(-${params[odd + 6]}*${k2})`.astype('complex64');
    }

    // returns in angstroms
    return out;
}

function unit_cell_amp(
    ky: NArray, kx: NArray, k2: NArray
): NArray {
    let amp = np!.zeros(k2.shape, 'complex64');

    const [a, b] = [3.16, 5.48];
    const cell: Array<[number, number, Array<[number, number]>]> = [
        [42, 1.0, [[0., 0.], [1/2, 1/2]]],
        [16, 2.0, [[0., 1/3], [1/2, 1/2 + 1/3]]],
    ];

    for (let [z, frac, pts] of cell) {
        const atom_amp = scattering_amplitude(k2, z);
        for (let [x, y] of pts) {
            const shift = np!.expr`exp(-2.j*pi*(${ky}*${y*b} + ${kx}*${x*a}))`.astype('complex64');

            const new_amp = np!.expr`${amp} + ${atom_amp}*${shift}*${frac}`;
            amp.free();
            amp = new_amp;

            shift.free();
        }
        atom_amp.free();
    }
    return amp;
}

export function object_phase(
    extent: readonly [number, number], n: readonly [number, number],
    electron: Electron
): NArray {
    const [ky, kx] = make_recip_grid(extent, n);
    const k2 = np!.expr`${ky}**2 + ${kx}**2`;

    // lattice constants of MoS2
    const [a, b] = [3.16, 5.48];

    const [n_a, n_b] = [
        Math.floor(Math.min(extent[0], 50) / a),
        Math.floor(Math.min(extent[1], 50) / b),
    ];
    const global_shift = [
        -(n_a - 0.5) * a / 2.,
        -n_b * b / 2.,
    ];

    let amp = np!.zeros(k2.shape, 'complex64');

    let unit_amp = unit_cell_amp(ky, kx, k2);

    for (let i = 0; i < n_a; i++) {
        for (let j = 0; j < n_b; j++) {
            const [x, y] = [i * a + global_shift[0], j * b + global_shift[1]];
            const shift = np!.expr`exp(-2.j*pi*(${ky}*${y} + ${kx}*${x}))`.astype('complex64');

            const new_amp = np!.expr`${amp} + ${unit_amp}*${shift}`;
            amp.free();
            amp = new_amp;

            shift.free();
        }
    }

    const new_amp = np!.ifft2(amp);
    amp.free();

    const scale = n[0]*n[1] / (extent[0]*extent[1]) * electron.gamma * electron.wavelength;
    const out = np!.expr`abs(${new_amp})*${scale}`; // phase in radians
    new_amp.free();
    return out;
}