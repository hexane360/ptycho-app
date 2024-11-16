import { NArray } from 'wasm-array';
import { np } from './wasm-array';

export class Electron {
    /// Electron energy (eV)
    readonly energy: number;
    /// Electron wavelength (angstrom)
    readonly wavelength: number;
    /// Lorentz factor (unitless)
    readonly gamma: number;
    /// Interaction parameter (rad/V-A)
    readonly sigma: number;

    constructor(energy: number) {
        this.energy = energy

        // h*c [eV*angstrom]
        const hc = 1.23984244e4; 
        // electron rest energy m0*c^2 [eV]
        const rest_energy = 5.1099906e5;
        // relativistic momentum
        const momentum = Math.sqrt(energy * (2*rest_energy + energy));

        this.wavelength = hc / momentum;
        this.gamma = energy / rest_energy + 1.;

        const m0_h2 = (rest_energy / hc**2)*1e-3  // RM/h^2 = RE/(hc)^2 [1/(eV angstrom^2)]
        this.sigma = 2*Math.PI * this.wavelength * (this.gamma * m0_h2)
    }
}

function fftfreq(size: number, n: number): NArray {
    if (n % 2 === 0) {
        // even
        return np!.ifftshift(np!.linspace(-n/2 / size, (n/2 - 1) / size, n, 'float32'))
    } else {
        // odd
        return np!.ifftshift(np!.linspace(-(n - 1)/2 / size, (n - 1)/2 / size, n, 'float32'))
    }
}

export function make_recip_grid(size: readonly [number, number], n: readonly [number, number]): [NArray, NArray] {
    let ky = fftfreq(size[0], n[0]);
    let kx = fftfreq(size[1], n[1]);
    [ky, kx] = np!.meshgrid(ky, kx);
    return [ky, kx];
}

export interface Aberration {
  n: number
  m: number

  real: number
  imag: number
  name?: string
}

export function make_focused_probe(ky: NArray, kx: NArray, wavelength: number,
                                   aperture: number, aberrations: Array<Aberration> = []): NArray {
    const lambda = np!.array(wavelength, 'float32');

    const theta2 = np!.expr`(${ky}**2 + ${kx}**2) * ${lambda}**2`;

    let chi = np!.zeros(theta2.shape, theta2.dtype);
    let phi = np!.arctan2(ky, kx);

    for (const ab of aberrations) {
        const [z_real, z_imag] = [np!.expr`cos(${phi}*${ab.m})`, np!.expr`sin(${phi}*${ab.m})`];
        chi = np!.expr`${chi} + ${theta2}**${(ab.n + 1)/2.} / (${ab.n} + 1) * (${ab.real}*${z_real} + ${ab.imag}*${z_imag})`;
    }
    //const phase = np!.expr`${defocus}/(2.*${lambda}) * ${theta2}`;

    const mask = np!.expr`${theta2} <= (${aperture}*1e-3)**2`;
    let probe = np!.expr`exp(-2.j*pi * (${chi}/${wavelength}))`.astype('complex64');
    probe = np!.expr`${probe} * ${mask}`;
    let probe_int = np!.sqrt(np!.sum(np!.abs(probe)));
    return np!.fft2shift(np!.ifft2(np!.expr`${probe} / ${probe_int}`, 'ortho'));
}

export function fresnel_propagator(ky: NArray, kx: NArray, wavelength: number,
                                   delta_z: number, tilt: [number, number] = [0., 0.]): NArray {
    const k2 = np!.expr`${ky}**2 + ${kx}**2`;

    const tiltx = np!.expr`tan(${tilt[0]} * 1e-3)`.astype(k2.dtype);
    const tilty = np!.expr`tan(${tilt[1]} * 1e-3)`.astype(k2.dtype);

    const phase = np!.expr`-1.j*pi * ${delta_z} * (
        ${wavelength} * ${k2} - 2.*(${kx}*${tiltx} + ${ky}*${tilty})
    )`.astype(k2.dtype);
    return np!.expr`exp(-1.j*pi * ${phase})`.astype('complex64');
}

export function fourier_shift_filter(ky: NArray, kx: NArray, shift: [number, number]): NArray {
    return np!.expr`exp(-2.j*pi * (${ky}*${shift[0]} + ${kx}*${shift[1]}))`
}