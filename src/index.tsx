import React from 'react';
import ReactDOM from 'react-dom/client';
import { atom, Atom, PrimitiveAtom, useAtom, useAtomValue } from 'jotai';

import { np, np_fut } from "./wasm-array";
import { Figure, Plot, FigureContext, PlotContext, PlotImage, AxisSpec, ColorScale } from "./plotting/plot";
import { Pair, PlotScale } from './plotting/scale';
import { EventListenerManager } from './plotting/zoom';
import { Transform1D, Transform2D } from './plotting/transform';
import { Colorbar } from './plotting/colorbar';
import { make_focused_probe, make_recip_grid, Aberration, Electron } from './optics';
import { object_potential } from './atoms';
import { HCenter, HBox, SidebarContainer } from './components';

import './index.css';

class Simulation {
    kv: PrimitiveAtom<number>
    electron: Atom<Electron>

    maxAngle: PrimitiveAtom<number>
    n: PrimitiveAtom<Pair>

    // box sampling [A]
    sampling: Atom<Pair>
    // box extent [A]
    extent: Atom<Pair>

    constructor() {
        this.kv = atom(200);
        this.electron = atom((get) => new Electron(get(this.kv)*1e3));
        this.maxAngle = atom(50);
        this.n = atom([256, 256] as Pair);

        this.sampling = atom((get) => {
            const s = get(this.electron).wavelength / (2 * get(this.maxAngle)*1e-3);
            return [s, s];
        });
        this.extent = atom((get) => {
            const s = get(this.sampling);
            const [ny, nx] = get(this.n);
            return [s[0] * ny, s[1] * nx];
        });
    }
}

class ProbeState {
    aperture: number
    aberrations: Array<Aberration>

    constructor(aperture: number, aberrations: Array<Aberration>) {
        this.aperture = aperture
        this.aberrations = aberrations
    }

    withAperture = (aperture: number): ProbeState => new ProbeState(aperture, this.aberrations);
    withAberrations = (aberrations: Array<Aberration>): ProbeState => new ProbeState(this.aperture, aberrations);
}

function Config(props: {sim: Simulation, probe: PrimitiveAtom<ProbeState>}) {
    const [kv, setKv] = useAtom(props.sim.kv);
    const [maxAngle, setMaxAngle] = useAtom(props.sim.maxAngle);
    const [probe, setProbe] = useAtom(props.probe);

    // this is horrible code
    function updateAberration(i: number, prop: 'mag' | 'angle', val: number) {
        if (val != val) return;
        console.log(`updateAberration i: ${i} val: ${val}`);
        setProbe((probe) => {
            const new_abs = [...probe.aberrations];
            let ang, mag;
            if (prop === 'mag') {
                ang = Math.atan2(new_abs[i].imag, new_abs[i].real);
                mag = val;
            } else {
                ang = val * Math.PI / 180;
                mag = Math.sqrt(new_abs[i].real*new_abs[i].real + new_abs[i].imag*new_abs[i].imag);
            }
            console.log(`ang: ${ang} mag: ${mag}`);

            new_abs[i] = {
                name: new_abs[i].name,
                n: new_abs[i].n,
                m: new_abs[i].m,

                real: mag * Math.cos(ang),
                imag: mag * Math.sin(ang),
            };

            console.log(`aberrations: ${JSON.stringify(new_abs)}`);

            return probe.withAberrations(new_abs);
        });
    }

    const aberration_rows = probe.aberrations.map((ab, i) => {
        const mag = Math.sqrt(ab.real*ab.real + ab.imag*ab.imag);
        const angle = Math.atan2(ab.imag, ab.real) * 180/Math.PI;

        return <tr key={i}>
            <td>{ab.name}</td>
            <td>{ab.n}</td>
            <td>{ab.m}</td>
            <td><input type="number" defaultValue={mag} onInput={(e) => updateAberration(i, 'mag', e.currentTarget.valueAsNumber)}></input></td>
            <td><input type="number" defaultValue={angle} onInput={(e) => updateAberration(i, 'angle', e.currentTarget.valueAsNumber)}></input></td>
        </tr>;
    });

    return <div className="config">
        <h1>Settings</h1>
        <ConfigOption label="Electron energy (keV)" initialValue={kv} onChange={setKv} />
        <ConfigOption label="Detector max angle (mrad)" initialValue={maxAngle} onChange={setMaxAngle} />
        <ConfigOption label="Aperture (mrad)" initialValue={probe.aperture} onChange={(val) => setProbe((probe) => probe.withAperture(val))} />

        <h2>Probe Aberrations</h2>
        <table>
            <thead>
                <tr>
                    <td></td>
                    <td>n</td>
                    <td>m</td>
                    <td>Mag. (Å)</td>
                    <td>Angle (°)</td>
                </tr>
            </thead>
            <tbody>
                {aberration_rows}
            </tbody>
        </table>
    </div>
}

function ConfigOption(props: {label: React.ReactNode, initialValue: number, onChange: (val: number) => void}) {
    return <div className="config-item">
        {props.label}: <input type="number" defaultValue={props.initialValue} onInput={(e) => props.onChange(e.currentTarget.valueAsNumber)} />
    </div>
}

function App(props: {}) {
    const [_, npLoaded] = React.useState<typeof import("wasm-array") | null>(null);
    const sim = new Simulation();
    const probe: PrimitiveAtom<ProbeState> = atom(new ProbeState(10., [
        { name: "Defocus", n: 1, m: 0, real: 1000, imag: 0.},
        { name: "Astigmatism", n: 1, m: 2, real: 0, imag: 0.},
        { name: "Coma", n: 2, m: 1, real: 0, imag: 0.},
        { name: "Spherical", n: 3, m: 0, real: 0, imag: 0.},
        //{ n: 2, m: 3, real: 5000, imag: 0.},
    ]));

    const probePosition: PrimitiveAtom<Pair> = atom([0., 0.] as Pair);

    console.log("App()");

    if (!np) {
        np_fut.then((np) => npLoaded(np))

        return <div className="app">Loading...</div>
    }

    return <div className="app">
        <SidebarContainer>
            <Config sim={sim} probe={probe}/>
            <HCenter>
                <Probe sim={sim} state={probe}/>
                <Object sim={sim} probePosition={probePosition}/>
            </HCenter>
        </SidebarContainer>
    </div>
}

function Probe(props: {sim: Simulation, state: PrimitiveAtom<ProbeState>}) {
    const maxAngle = useAtomValue(props.sim.maxAngle);
    const extent = useAtomValue(props.sim.extent);
    const n = useAtomValue(props.sim.n);
    const electron = useAtomValue(props.sim.electron);
    const state = useAtomValue(props.state);

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

    const [ky, kx] = make_recip_grid(extent, n);

    //console.log(`samp: [${sampling[0]}, ${sampling[1]}], extent: [${extent[0]}, ${extent[1]}], n: ${n}`);
    //console.log(`Making probe, wavelength: ${wavelength} A, maxAngle: ${maxAngle} mrad, aperture: ${state.aperture} mrad`);
    const probe = make_focused_probe(ky, kx, electron.wavelength, state.aperture, state.aberrations);
    const probe_int = np!.abs2(probe);
    const recip_int = np!.abs2(np!.fft2shift(np!.fft2(probe)));

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

function Object(props: {sim: Simulation, probePosition: PrimitiveAtom<Pair>}) {
    const extent = useAtomValue(props.sim.extent);
    const n = useAtomValue(props.sim.n);
    const electron = useAtomValue(props.sim.electron);

    const axes: Map<string, AxisSpec> = new Map([
        ["y", {scale: new PlotScale([-extent[0]/20., extent[0]/20.], [0, 200]), label: "Y [nm]"}],
        ["x", {scale: new PlotScale([-extent[1]/20., extent[1]/20.], [0, 200]), label: "X [nm]"}],
    ]);

    const scales: Map<string, ColorScale> = new Map([
        ["phase", {range: [0, null], label: "Object phase [rad]"}],
    ]);

    // TODO make this asynchronous
    const object = object_potential(extent, n, electron);

    return <Figure axes={axes} scales={scales}>
        <HBox>
            <Plot xaxis="x" yaxis="y">
            <PlotImage scale="phase" data={np!.fft2shift(object)} />
            <Crosshairs pos={props.probePosition} />
            </Plot>
            <Colorbar scale="phase"/>
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