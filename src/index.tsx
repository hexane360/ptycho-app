import React from 'react';
import ReactDOM from 'react-dom/client';
import { atom, Atom, PrimitiveAtom, useAtom, useAtomValue } from 'jotai';

import { NArray } from 'wasm-array';
import { np, np_fut } from "./wasm-array";
import { Figure, Plot, FigureContext, PlotContext, PlotImage, AxisSpec, ColorScale } from "./plotting/plot";
import { Pair, PlotScale } from './plotting/scale';
import { EventListenerManager } from './plotting/zoom';
import { Transform1D, Transform2D } from './plotting/transform';
import { Colorbar } from './plotting/colorbar';
import { make_focused_probe, make_recip_grid, Aberration, Electron } from './optics';
import { object_phase } from './atoms';
import { HCenter, HBox, SidebarContainer } from './components';
import Config from './config';

import './index.css';

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export class Simulation {
    kv: PrimitiveAtom<number>
    electron: Atom<Electron>

    maxAngle: PrimitiveAtom<number>
    n: PrimitiveAtom<Pair>

    aperture: PrimitiveAtom<number>
    aberrations: PrimitiveAtom<ReadonlyArray<Aberration>>

    probePos: PrimitiveAtom<Pair>

    // box sampling [A]
    sampling: Atom<Pair>
    // box extent [A]
    extent: Atom<Pair>

    probe: Atom<Promise<NArray>> // probe in recip. space
    object: Atom<Promise<NArray>>
    pattern: Atom<Promise<NArray>>

    constructor() {
        this.kv = atom(200);
        this.electron = atom((get) => new Electron(get(this.kv)*1e3));
        this.maxAngle = atom(50);
        this.n = atom([256, 256] as Pair);

        this.aperture = atom(15.);
        this.aberrations = atom([
            { name: "Defocus", n: 1, m: 0, real: 1000, imag: 0.},
            { name: "Astigmatism", n: 1, m: 2, real: 0, imag: 0.},
            { name: "Coma", n: 2, m: 1, real: 0, imag: 0.},
            { name: "Spherical", n: 3, m: 0, real: 0, imag: 0.},
            //{ n: 2, m: 3, real: 5000, imag: 0.},
        ] as ReadonlyArray<Aberration>);

        this.probePos = atom([0., 0.] as Pair);

        this.sampling = atom((get) => {
            const s = get(this.electron).wavelength / (2 * get(this.maxAngle)*1e-3);
            return [s, s];
        });
        this.extent = atom((get) => {
            const s = get(this.sampling);
            const [ny, nx] = get(this.n);
            return [s[0] * ny, s[1] * nx];
        });

        this.probe = atom(async (get) => {
            await np_fut;

            const [ky, kx] = make_recip_grid(get(this.extent), get(this.n));
            return make_focused_probe(
                ky, kx, get(this.electron).wavelength, get(this.aperture), get(this.aberrations)
            );
        });

        this.object = atom(async (get) => {
            await np_fut;
            await sleep(50);

            const [extent, n] = [get(this.extent), get(this.n)];
            const electron = get(this.electron);
            return object_phase(extent, n, electron);
        });

        this.pattern = atom(async (get) => {
            const np = await np_fut;
            let probe = await get(this.probe);
            const object = await get(this.object);
            const [ky, kx] = make_recip_grid(get(this.extent), get(this.n));
            const [x, y] = get(this.probePos);

            probe = np.ifft2(np.expr`${probe} * exp(-2j*pi * (${kx}*${x} + ${ky}*${y}))`.astype('complex64'));
            return np.fft2(np.expr`${probe}*exp(1.j*${object})`);
        })
    }
}

export class ProbeState {
    aperture: number
    aberrations: Array<Aberration>

    constructor(aperture: number, aberrations: Array<Aberration>) {
        this.aperture = aperture
        this.aberrations = aberrations
    }

    withAperture = (aperture: number): ProbeState => new ProbeState(aperture, this.aberrations);
    withAberrations = (aberrations: Array<Aberration>): ProbeState => new ProbeState(this.aperture, aberrations);
}

function App(props: {}) {
    const sim = new Simulation();

    console.log("App()");

    return <div className="app">
        <SidebarContainer>
            <Config sim={sim}/>
            <HCenter>
                <React.Suspense> <Probe sim={sim}/> </React.Suspense>
                <React.Suspense> <Object sim={sim}/> </React.Suspense>
                <React.Suspense> <Detector sim={sim}/> </React.Suspense>
            </HCenter>
        </SidebarContainer>
    </div>
}

function Probe(props: {sim: Simulation}) {
    const maxAngle = useAtomValue(props.sim.maxAngle);
    const extent = useAtomValue(props.sim.extent);

    const axes: Map<string, AxisSpec> = new Map([
        ["y", {scale: new PlotScale([-extent[0]/20., extent[0]/20.], [0, 200]), label: "Y [nm]"}],
        ["x", {scale: new PlotScale([-extent[1]/20., extent[1]/20.], [0, 200]), label: "X [nm]"}],
        ["ky", {scale: new PlotScale([-maxAngle, maxAngle], [0, 200]), label: <>θ<tspan dy="0.6ex">y</tspan><tspan dy="-0.6ex"> [mrad]</tspan></>}],
        ["kx", {scale: new PlotScale([-maxAngle, maxAngle], [0, 200]), label: <>θ<tspan dy="0.6ex">x</tspan><tspan dy="-0.6ex"> [mrad]</tspan></>}],
    ]);

    const scales: Map<string, ColorScale> = new Map([
        ["real_int", {range: [0, null]}],
        ["recip_int", {range: [0, null]}],
    ]);

    const probe = useAtomValue(props.sim.probe);
    const recip_int = np!.abs2(np!.fft2shift(probe));
    const probe_int = np!.abs2(np!.fft2shift(np!.ifft2(probe)));

    return <Figure axes={axes} scales={scales}>
        <HBox>
            <Plot xaxis="kx" yaxis="ky">
                <PlotImage scale="recip_int" data={recip_int}/>
            </Plot>
            <Plot xaxis="x" yaxis="y">
                <PlotImage scale="real_int" data={probe_int}/>
            </Plot>
        </HBox>
    </Figure>
}

function Object(props: {sim: Simulation}) {
    const extent = useAtomValue(props.sim.extent);

    const axes: Map<string, AxisSpec> = new Map([
        ["y", {scale: new PlotScale([-extent[0]/20., extent[0]/20.], [0, 200]), label: "Y [nm]"}],
        ["x", {scale: new PlotScale([-extent[1]/20., extent[1]/20.], [0, 200]), label: "X [nm]"}],
    ]);

    const scales: Map<string, ColorScale> = new Map([
        ["phase", {range: [0, null], label: "Object phase [rad]"}],
    ]);

    const object = useAtomValue(props.sim.object);

    return <Figure axes={axes} scales={scales}>
        <HBox>
            <Plot xaxis="x" yaxis="y">
            <PlotImage scale="phase" data={np!.fft2shift(object)} />
            <Crosshairs pos={props.sim.probePos} />
            </Plot>
            <Colorbar scale="phase"/>
        </HBox>
    </Figure>
}

function Detector(props: {sim: Simulation}) {
    const maxAngle = useAtomValue(props.sim.maxAngle);

    const axes: Map<string, AxisSpec> = new Map([
        ["ky", {scale: new PlotScale([-maxAngle, maxAngle], [0, 400]), label: <>θ<tspan dy="0.6ex">y</tspan><tspan dy="-0.6ex"> [mrad]</tspan></>}],
        ["kx", {scale: new PlotScale([-maxAngle, maxAngle], [0, 400]), label: <>θ<tspan dy="0.6ex">x</tspan><tspan dy="-0.6ex"> [mrad]</tspan></>}],
    ]);

    const scales: Map<string, ColorScale> = new Map([
        ["recip_int", {range: [0, null]}],
    ]);

    let pattern = useAtomValue(props.sim.pattern);
    pattern = np!.abs2(np!.fft2shift(pattern));

    return <Figure axes={axes} scales={scales}>
        <HBox>
            <Plot xaxis="kx" yaxis="ky">
                <PlotImage scale="recip_int" data={pattern}/>
            </Plot>
        </HBox>
    </Figure>
}

function viewCoords(node: SVGElement, client: Pair): Pair {
    let svg = node.ownerSVGElement || node as SVGSVGElement;
    let pt = svg.createSVGPoint();
    pt.x = client[0]; pt.y = client[1];
    pt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [pt.x, pt.y];
}

class CrosshairsManager {
    xscale: PlotScale;
    yscale: PlotScale;
    transform: Transform2D;
    setPos: (_: Pair) => void;

    dragging: boolean = false;
    listeners: EventListenerManager = new EventListenerManager();

    constructor(xscale: PlotScale, yscale: PlotScale, transform: Transform2D, setPos: (_: Pair) => void) {
        this.xscale = xscale;
        this.yscale = yscale;
        this.transform = transform;
        this.setPos = setPos;
    }

    mousedown(elem: (HTMLElement & SVGElement), event: MouseEvent) {
        this.dragging = true;
        this.listeners.addDocumentListener("mousemove", (ev) => this.mousemove(elem, ev));
        this.listeners.addDocumentListener("mouseup", (ev) => this.mouseup(elem, ev));

        event.stopPropagation(); event.preventDefault();
    };

    mousemove(elem: (HTMLElement & SVGElement), event: MouseEvent) {
        if (!this.dragging) return;

        const pos = this.transform.unapply(viewCoords(elem, [event.clientX, event.clientY]));
        const dataPos = [
            this.xscale.untransform(pos[0]), this.yscale.untransform(pos[1])
        ] as const;

        this.setPos(dataPos);
        event.stopPropagation(); event.preventDefault();
    };

    mouseup(elem: (HTMLElement & SVGElement), event: MouseEvent) {
        this.dragging = false;
        this.listeners.removeDocumentListeners();
        event.stopPropagation(); event.preventDefault();
    };

    register(elem: HTMLElement & SVGElement) {
        this.listeners.addEventListener(elem, "mousedown", (ev) => this.mousedown(elem, ev))
        this.listeners.addEventListener(elem, "mousemove", (ev) => this.mousemove(elem, ev))
        this.listeners.addEventListener(elem, "mouseup", (ev) => this.mouseup(elem, ev))
    }

    unregister(elem: HTMLElement & SVGElement) {
        this.listeners.removeElementListeners(elem);
    }
}

function Crosshairs(props: {pos: PrimitiveAtom<Pair>}) {
    const fig = React.useContext(FigureContext)!;
    const plot = React.useContext(PlotContext)!;

    const managerRef: React.MutableRefObject<CrosshairsManager | null> = React.useRef(null);
    const ref: React.RefObject<HTMLElement & SVGPathElement> = React.useRef(null);

    const [pos, setPos] = useAtom(props.pos);

    const xscale = (typeof plot.xaxis === 'string') ? fig.axes.get(plot.xaxis)!.scale : plot.xaxis.scale;
    const yscale = (typeof plot.yaxis === 'string') ? fig.axes.get(plot.yaxis)!.scale : plot.yaxis.scale;
    const xtrans = (typeof plot.xaxis === 'string') ? useAtomValue(fig.transforms.get(plot.xaxis)!) : new Transform1D();
    const ytrans = (typeof plot.yaxis === 'string') ? useAtomValue(fig.transforms.get(plot.yaxis)!) : new Transform1D();
    const transform = Transform2D.from_1d(xtrans, ytrans);

    React.useEffect(() => {
        if (!managerRef.current) {
            managerRef.current = new CrosshairsManager(xscale, yscale, transform, setPos);
        } else {
            managerRef.current.xscale = xscale;
            managerRef.current.yscale = yscale;
            managerRef.current.transform = transform;
            managerRef.current.setPos = setPos;
        }
        const manager = managerRef.current;
        const elem = ref.current;
        if (elem) {
            manager.register(elem);
            return () => { manager.unregister(elem) };
        }
    }, [xscale, yscale, transform, setPos]);

    const pathTransform = (new Transform2D([1., 1.], [xscale.transform(pos[0]), yscale.transform(pos[1])])).toString();
    return <path ref={ref}
        transform={pathTransform} d="M -10 0 H 10 M 0 -10 V 10" stroke="red" strokeWidth={4}
    />;
}

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);