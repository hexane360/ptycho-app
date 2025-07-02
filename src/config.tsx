import React from 'react';
import { PrimitiveAtom, useAtom } from 'jotai';

import { Aberration } from "./optics";
import { Simulation, ProbeState } from "./index";



export default function Config(props: {sim: Simulation}) {
    const [kv, setKv] = useAtom(props.sim.kv);
    const [maxAngle, setMaxAngle] = useAtom(props.sim.maxAngle);

    const [aperture, setAperture] = useAtom(props.sim.aperture);
    const [aberrations, setAberrations] = useAtom(props.sim.aberrations);

    // this is horrible code
    function updateAberration(i: number, prop: 'mag' | 'angle', val: number) {
        if (val != val) return;
        console.log(`updateAberration i: ${i} val: ${val}`);
        setAberrations((abs) => {
            const new_abs = [...abs];
            let angle = new_abs[i].angle;
            let mag = new_abs[i].mag;

            if (prop === 'mag') {
                mag = val;
            } else {
                angle = val;
            }

            new_abs[i] = {
                name: new_abs[i].name,
                n: new_abs[i].n,
                m: new_abs[i].m,

                mag: mag,
                angle: angle,
            };

            console.log(`aberrations: ${JSON.stringify(new_abs)}`);

            return new_abs;
        });
    }

    const aberration_rows = aberrations.map((ab, i) => {
        return <tr key={i}>
            <td>{ab.name}</td>
            <td>{ab.n}</td>
            <td>{ab.m}</td>
            <td><input type="number" defaultValue={ab.mag} onInput={(e) => updateAberration(i, 'mag', e.currentTarget.valueAsNumber)}></input></td>
            <td><input type="number" defaultValue={ab.angle} onInput={(e) => updateAberration(i, 'angle', e.currentTarget.valueAsNumber)}></input></td>
        </tr>;
    });

    return <div className="config">
        <h1>Settings</h1>
        <ConfigOption label="Electron energy (keV)" initialValue={kv} onChange={setKv} />
        <ConfigOption label="Detector max angle (mrad)" initialValue={maxAngle} onChange={setMaxAngle} />
        <ConfigOption label="Aperture (mrad)" initialValue={aperture} onChange={setAperture} />

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