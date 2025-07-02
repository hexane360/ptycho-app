import React from "react";
import { useAtomValue } from 'jotai';

import { np } from "../wasm-array";
import { FigureContext, Axis, Plot, PlotImage } from "./plot"
import { PlotScale } from "./scale";

interface ColorBarProps {
    scale: string

    length?: number
    width?: number
}


export function Colorbar(props: ColorBarProps) {
    const fig = React.useContext(FigureContext);
    if (fig === undefined) {
        throw new Error("Component 'ColorBar' must be used inside a 'Figure'");
    }

    if (!fig.scales.has(props.scale)) {
        throw new Error("Invalid scale passed to component 'ColorBar'");
    }

    const scale = fig.scales.get(props.scale)!;

    const [min, max] = useAtomValue(fig.currentRanges.get(props.scale)!);
    //console.log(`Colorbar min: ${min} max: ${max}`);
    if (min == null || max == null || !np) {
        return <></>;
    }

    const width = props.width ?? 20;
    const height = props.length ?? 150;

    let xaxis: Axis = {
        scale: new PlotScale([0, width], [0, width]),
        translateExtent: [-Infinity, Infinity],
        show: false,
    };
    let yaxis: Axis = {
        scale: new PlotScale([min, max], [0, height]),
        label: scale.label,
        translateExtent: [-Infinity, Infinity],
        show: true,
    };

    let yy = np.linspace(min, max, height);
    let xx = np.arange(width);
    [yy, xx] = np.meshgrid(yy, xx);

    return <Plot xaxis={xaxis} yaxis={yaxis} yaxis_pos="right">
        <PlotImage data={yy} scale={props.scale}/>
    </Plot>;
}