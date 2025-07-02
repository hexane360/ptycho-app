import React from 'react';
import { atom, useAtom, useAtomValue, Atom, PrimitiveAtom } from 'jotai';

import * as d3_format from 'd3-format';
import * as d3_array from 'd3-array';
import { NArray } from 'wasm-array';
import { np } from '../wasm-array';

import { Transform1D, Transform2D } from './transform';
import { PlotScale, Pair, isClose } from './scale';
import { Zoomer } from "./zoom";

import './plot.css';

export interface AxisSpec {
    scale: PlotScale

    translateExtent?: Pair | boolean
    label?: React.ReactNode
    show?: boolean | 'one'

    ticks?: number
    tickFormat?: string
    tickLength?: number
}

export interface Axis {
    scale: PlotScale

    translateExtent: Pair
    label?: React.ReactNode
    show: boolean | 'one'

    ticks?: number
    tickFormat?: string
    tickLength?: number
}

function normalize_axis(axis: AxisSpec | PlotScale): Axis {
    if (axis instanceof PlotScale) {
        axis = {
            scale: axis
        };
    } else {
        axis = { ...axis };
    }

    axis.show = ("show" in axis) ? axis.show : true;

    if (axis.translateExtent === true || !("translateExtent" in axis)) {
        axis.translateExtent = axis.scale.domain;
    } else if (!axis.translateExtent) {
        axis.translateExtent = [-Infinity, Infinity];
    }

    return axis as Axis;
}

export interface ColorScale {
    cmap?: string
    range?: [number | null, number | null]
    label?: React.ReactNode
}

export interface FigureContextData<K> {
    axes: Map<K, Axis>
    transforms: Map<K, PrimitiveAtom<Transform1D>>

    scales: Map<K, ColorScale>
    currentRanges: Map<K, PrimitiveAtom<[number | null, number | null]>>

    zoomExtent: Pair
}

export const FigureContext = React.createContext<FigureContextData<string> | undefined>(undefined);

interface FigureProps {
    axes: Map<string, AxisSpec | PlotScale>
    zoomExtent?: Pair

    scales?: Map<string, ColorScale>

    children?: React.ReactNode
}

// very hacky way to preserve figure contexts

function mapEqual<K, V>(map1: Map<K, V>, map2: Map<K, V>, f: (val1: V, val2: V) => boolean): boolean {
    if (map1.size !== map2.size) return false;

    for (const [k, v1] of map1.entries()) {
        const v2 = map2.get(k);
        if (v2 === undefined || !f(v1, v2)) return false;
    }
    return true;
}

function axisSpecEqual(old_spec: AxisSpec | PlotScale, new_spec: AxisSpec | PlotScale): boolean {
    if (old_spec instanceof PlotScale) {
        old_spec = {scale: old_spec} as AxisSpec
    }
    if (new_spec instanceof PlotScale) {
        new_spec = {scale: new_spec} as AxisSpec
    }

    return (
        old_spec.scale.isClose(new_spec.scale) &&
        old_spec.label === new_spec.label &&
        old_spec.show === new_spec.show &&
        old_spec.ticks === new_spec.ticks &&
        old_spec.tickFormat === new_spec.tickFormat &&
        old_spec.tickLength === new_spec.tickLength &&
        typeof old_spec.translateExtent === typeof new_spec.translateExtent &&
        typeof old_spec.translateExtent === "object" ? isClose(old_spec.translateExtent, new_spec.translateExtent as Pair) : old_spec.translateExtent === new_spec.translateExtent
    );
}

function scalesEqual(old_scale: ColorScale, new_scale: ColorScale): boolean {
    if (typeof old_scale.range !== typeof new_scale.range) return false;
    if (old_scale.range) {
        if (typeof old_scale.range[0] !== typeof new_scale.range![0] || typeof old_scale.range[1] !== typeof new_scale.range![1]) return false;
        if (old_scale.range[0] === undefined && !isClose(old_scale.range[0], new_scale.range![0]!)) return false;
        if (old_scale.range[1] === undefined && !isClose(old_scale.range[1], new_scale.range![1]!)) return false;
    }
    return (
        old_scale.cmap === new_scale.cmap &&
        old_scale.label === new_scale.label &&
        typeof old_scale.range === typeof new_scale.range
    );
}

function figPropsEqual(old_props: FigureProps, new_props: FigureProps): boolean {
    if (!mapEqual(old_props.axes, new_props.axes, axisSpecEqual)) return false;
    if (typeof old_props.scales !== typeof new_props.scales) return false;
    if (old_props.scales && !mapEqual(old_props.scales, new_props.scales!, scalesEqual)) return false;

    if (typeof old_props.zoomExtent !== typeof new_props.zoomExtent) return false;
    if (old_props.zoomExtent && !isClose(old_props.zoomExtent, new_props.zoomExtent!)) return false;

    return true;
}

export function Figure(props: FigureProps) {

    function make_context(props: FigureProps): FigureContextData<string> {
        let axes: Map<string, Axis> = new Map();
        let transforms: Map<string, PrimitiveAtom<Transform1D>> = new Map();

        for (let [k, axis] of props.axes) {
            axes.set(k, normalize_axis(axis));
            transforms.set(k, atom(new Transform1D()));
        }

        const scales: Map<string, ColorScale> = new Map();
        const currentRanges: Map<string, PrimitiveAtom<[number | null, number | null]>> = new Map();

        if (props.scales) {
            for (const [k, v] of props.scales) {
                scales.set(k, v);
                currentRanges.set(k, atom(v.range ?? [null, null]));
            }
        }

        return {
            axes: axes,
            transforms: transforms,
            zoomExtent: props.zoomExtent || [1, Infinity],
            scales: scales,
            currentRanges: currentRanges,
        };
    }

    const ref: React.MutableRefObject<[FigureProps, FigureContextData<string>] | null> = React.useRef(null);

    const ctx = React.useMemo(() => {
        if (ref.current) {
            const [old_props, ctx] = ref.current;
            if (figPropsEqual(old_props, props)) {
                return ctx;
            }
        }

        console.log("Redrawing Figure");
        ref.current = [props, make_context(props)];
        return ref.current[1];
    }, [props])

    return <FigureContext.Provider value={ctx}>
        {props.children}
    </FigureContext.Provider>;
}

export interface PlotContextData<K> {
    xaxis: K | Axis
    yaxis: K | Axis

    xaxis_pos: 'bottom' | 'top'
    yaxis_pos: 'left' | 'right'

    fixedAspect: boolean
}

export const PlotContext = React.createContext<PlotContextData<string> | undefined>(undefined);

function makeId(prefix: string): string {
    return prefix + `-${d3_format.format("06g")(Math.floor(Math.random() * 1000000))}`;
}

interface AxisProps {
    label?: React.ReactNode | undefined
}

export function XAxis(props: AxisProps) {
    const fig = React.useContext(FigureContext);
    const plot = React.useContext(PlotContext);
    if (fig === undefined || plot === undefined) {
        throw new Error("Component 'XAxis' must be used inside a 'Plot'");
    }

    let xtransform = (typeof plot.xaxis === "string") ? useAtomValue(fig.transforms.get(plot.xaxis)!) : new Transform1D();
    let xaxis = (typeof plot.xaxis === "string") ? fig.axes.get(plot.xaxis)! : plot.xaxis;
    let yaxis = (typeof plot.yaxis === "string") ? fig.axes.get(plot.yaxis)! : plot.yaxis;

    let cross_pos = (plot.xaxis_pos === "top") ? 0.0 : 1.0;
    let sign = (plot.xaxis_pos === "top") ? -1.0 : 1.0;
    const className = (plot.xaxis_pos === "top") ? 'top-axis' : 'bot-axis';

    let fullScale = xaxis.scale;
    let scale = new PlotScale(
        fullScale.untransform(xtransform.unapply(fullScale.range)),
        fullScale.range
    );

    let label: React.ReactElement | undefined = undefined;
    if (props.label) {
        label = <text className="axis-label" transform={`translate(${scale.rangeFromUnit(0.5)}, ${sign * 50})`}>
            {props.label}
        </text>;
    }

    // TODO factor some stuff out
    // TODO replace with path

    const fmt = d3_format.format(xaxis.tickFormat ?? "~g");
    const tickLength = xaxis.tickLength ?? 8;

    let ticks = d3_array.ticks(...scale.domain, xaxis.ticks ?? 4).map((val) => {
        const text = fmt(val);
        const pos = scale.transform(val);
        return <g className="tick" key={val}>
            <line x1={pos} x2={pos} y1={0} y2={sign * tickLength} stroke="black"/>
            <text x={pos} y={sign * tickLength} dy={`${sign*0.9}em`}>{text}</text>
        </g>;
    });

    let ax_ypos = yaxis.scale.rangeFromUnit(cross_pos);
    let [ax_start, ax_stop] = scale.range;
    return <g className='bot-axis' transform={`translate(0, ${ax_ypos})`}>
        <line x1={ax_start} x2={ax_stop} y1="0" y2="0" stroke="black"/>
        { ticks }
        { label }
    </g>;
}

export function YAxis(props: AxisProps) {
    const fig = React.useContext(FigureContext);
    const plot = React.useContext(PlotContext);
    if (fig === undefined || plot === undefined) {
        throw new Error("Component 'YAxis' must be used inside a 'Plot'");
    }

    let ytransform = (typeof plot.yaxis === "string") ? useAtomValue(fig.transforms.get(plot.yaxis)!) : new Transform1D();
    let xaxis = (typeof plot.xaxis === "string") ? fig.axes.get(plot.xaxis)! : plot.xaxis;
    let yaxis = (typeof plot.yaxis === "string") ? fig.axes.get(plot.yaxis)! : plot.yaxis;

    let cross_pos = (plot.yaxis_pos === "left") ? 0.0 : 1.0;
    let sign = (plot.yaxis_pos === "left") ? -1.0 : 1.0;
    const className = (plot.yaxis_pos === "left") ? 'left-axis' : 'right-axis';

    let fullScale = yaxis.scale;
    let scale = new PlotScale(
        fullScale.untransform(ytransform.unapply(fullScale.range)),
        fullScale.range
    );

    let label: React.ReactElement | undefined = undefined;
    if (props.label) {
        label = <text className="axis-label" transform={`translate(${sign * 70}, ${scale.rangeFromUnit(0.5)}) rotate(${sign * -90})`}>
            {props.label}
        </text>;
    }

    const fmt = d3_format.format(yaxis.tickFormat ?? "~g");
    const tickLength = yaxis.tickLength ?? 8;

    let ticks = d3_array.ticks(...scale.domain, yaxis.ticks ?? 4).map((val) => {
        const text = fmt(val);
        const pos = scale.transform(val);
        return <g className="tick" key={val}>
            <line x1={sign * tickLength} x2={0} y1={pos} y2={pos} stroke="black"/>
            <text x={sign * tickLength} y={pos} dx={`${sign*0.3}em`} dy="0.4em">{text}</text>
        </g>;
    });

    let ax_xpos = xaxis.scale.rangeFromUnit(cross_pos);
    let [ax_start, ax_stop] = scale.range;
    return <g className={className} transform={`translate(${ax_xpos}, 0)`}>
        <line x1="0" x2="0" y1={ax_start} y2={ax_stop} stroke="black"/>
        { ticks }
        { label }
    </g>;
}

interface PlotProps {
    xaxis?: string | AxisSpec
    yaxis?: string | AxisSpec

    fixedAspect?: boolean /* = false*/
    /*width: number
    height: number
    xDomain?: [number, number]
    yDomain?: [number, number]*/
    margins?: [number, number, number, number]

    show_xaxis?: boolean
    show_yaxis?: boolean

    xaxis_pos?: 'bottom' | 'top'
    yaxis_pos?: 'left' | 'right'

    children?: React.ReactNode
}

export function Plot(props: PlotProps) {
    //console.log("Redrawing Plot");

    const fig = React.useContext(FigureContext);
    if (fig === undefined) {
        throw new Error("Component 'Plot' must be used inside a 'Figure'");
    }

    if (!props.xaxis || !props.yaxis) {
        throw new Error("Component 'Plot' must have xaxis and yaxis props defined.");
    }

    let xaxis = (typeof props.xaxis === "string") ? fig.axes.get(props.xaxis)! : normalize_axis(props.xaxis);
    let yaxis = (typeof props.yaxis === "string") ? fig.axes.get(props.yaxis)! : normalize_axis(props.yaxis);
    if (!xaxis) throw new Error("Invalid xaxis passed to component 'Plot'");
    if (!yaxis) throw new Error("Invalid yaxis passed to component 'Plot'");

    const xaxis_pos = props.xaxis_pos ?? 'bottom';
    const yaxis_pos = props.yaxis_pos ?? 'left';

    let ctx: PlotContextData<string> = {
        xaxis: (typeof props.xaxis === "string") ? props.xaxis : xaxis,
        yaxis: (typeof props.yaxis === "string") ? props.yaxis : yaxis,
        fixedAspect: props.fixedAspect ?? false,

        xaxis_pos: xaxis_pos,
        yaxis_pos: yaxis_pos,
    };

    const show_xaxis = props.show_xaxis ?? !!xaxis.show;
    const show_yaxis = props.show_yaxis ?? !!yaxis.show;

    let clippedChildren: React.ReactNode[] = [];
    let children: React.ReactNode[] = [];

    React.Children.forEach(props.children, child => {
        clippedChildren.push(child);
    });

    if (show_xaxis) children.push(<XAxis label={xaxis.label} key="xaxis"/>)
    if (show_yaxis) children.push(<YAxis label={yaxis.label} key="yaxis"/>)

    const dims = calc_plot_dims(fig, xaxis, yaxis, show_xaxis, show_yaxis, xaxis_pos, yaxis_pos, props.margins);

    const clipId = React.useMemo(() => makeId("ax-clip"), []);

    return <PlotContext.Provider value={ctx}> <Zoomer>
        <svg className="plot" viewBox={dims.viewBox.join(" ")} width={dims.totalWidth} height={dims.totalHeight}>
            <clipPath id={clipId}><rect x={0} y={0} width={dims.width} height={dims.height}/></clipPath>
            <g className="ax-cont">
                <rect className="ax-box" width={dims.width} height={dims.height}/>
                { children }
                <g className="ax-clip" clipPath={`url(#${clipId})`}>
                    <g className="zoom">
                        { clippedChildren }
                    </g>
                </g>
            </g>
        </svg>
    </Zoomer> </PlotContext.Provider>;
}

interface PlotDims {
    width: number
    height: number
    totalWidth: number
    totalHeight: number
    viewBox: [number, number, number, number]
}

function calc_plot_dims(
    fig: FigureContextData<string>,
    xaxis: Axis, yaxis: Axis,
    show_xaxis: boolean, show_yaxis: boolean,
    xaxis_pos: 'bottom' | 'top', yaxis_pos: 'left' | 'right',
    margins?: [number, number, number, number]
): PlotDims {
    let [xscale, yscale] = [xaxis.scale, yaxis.scale] ;

    const [width, height] = [xscale.rangeSize(), yscale.rangeSize()];

    let marginTop: number, marginRight: number, marginBottom: number, marginLeft: number;

    if (margins) {
        [marginTop, marginRight, marginBottom, marginLeft] = margins;
    } else {
        [marginTop, marginRight, marginBottom, marginLeft] = [10, 10, 10, 10];
        if (show_xaxis) {
            if (xaxis_pos === 'bottom')
                marginBottom += 60;
            else
                marginTop += 60;
        }
        if (show_yaxis) {
            if (yaxis_pos === 'left')
                marginLeft += 80;
            else
                marginRight += 80;
        }
    }

    const totalWidth = width + marginLeft + marginRight;
    const totalHeight = height + marginBottom + marginTop; 
    const viewBox: [number, number, number, number] = [-marginLeft, -marginTop, totalWidth, totalHeight];

    return {
        width: width, height: height,
        totalWidth: totalWidth, totalHeight: totalHeight,
        viewBox: viewBox,
    }
}

interface PlotGridProps {
    ncols: number;
    nrows: number;

    xaxes: string | ReadonlyArray<string>;
    yaxes: string | ReadonlyArray<string>;

    pad?: string | number; /* = 0px */

    zoomExtent?: [number, number];

    children?: React.ReactNode
}

export function PlotGrid(props: PlotGridProps) {
    const [ncols, nrows] = [props.ncols, props.nrows];

    const fig = React.useContext(FigureContext);
    if (fig === undefined) {
        throw new Error("Component 'Plot' must be used inside a 'Figure'");
    }

    let xaxes: Array<string>;
    if (typeof(props.xaxes) === "string") {
        // share x axis
        xaxes = Array(props.ncols).fill(props.xaxes);
    } else {
        if (props.xaxes.length !== ncols) {
            throw new Error("PlotGrid: `xaxes` must an axis key or an array of `ncols` axis keys");
        }
        xaxes = [...props.xaxes];
    }

    let yaxes: Array<string>;
    if (typeof(props.yaxes) === "string") {
        // share y axis
        yaxes = Array(props.nrows).fill(props.yaxes);
    } else {
        if (props.yaxes.length !== nrows) {
            throw new Error("PlotGrid: `yaxes` must an axis key or an array of `nrows` axis keys");
        }
        yaxes = [...props.yaxes];
    }

    if (React.Children.count(props.children) > nrows * ncols) {
        throw new Error(`PlotGrid: Too many children, maximum is nrows*ncols = ${nrows * ncols}`);
    }

    let widths: Array<number> = Array(props.ncols).fill(0);
    let heights: Array<number> = Array(props.nrows).fill(0);

    const children = React.Children.map(props.children, (child, i) => {
        const [row, col] = [Math.floor(i / ncols), i % ncols];

        if (React.isValidElement(child) && typeof child.type === "function") {
            if (child.type.name === "Plot") {
                const child_props = child.props as PlotProps;

                const props_xaxis = child_props.xaxis ?? xaxes[col];
                const props_yaxis = child_props.yaxis ?? yaxes[row];
                let xaxis = (typeof props_xaxis === "string") ? fig.axes.get(props_xaxis)! : normalize_axis(props_xaxis);
                let yaxis = (typeof props_yaxis === "string") ? fig.axes.get(props_yaxis)! : normalize_axis(props_yaxis);

                const xaxis_pos = child_props.xaxis_pos ?? 'bottom';
                const yaxis_pos = child_props.yaxis_pos ?? 'left';

                const show_xaxis: boolean = child_props.show_xaxis ?? (
                    xaxis.show === "one" ? row === (xaxis_pos === 'top' ? 0 : nrows - 1) : xaxis.show
                );
                const show_yaxis: boolean = child_props.show_yaxis ?? (
                    yaxis.show === "one" ? col === (yaxis_pos === 'left' ? 0 : ncols - 1) : yaxis.show
                );

                const dims = calc_plot_dims(fig, xaxis, yaxis, show_xaxis, show_yaxis, xaxis_pos, yaxis_pos, child_props.margins);
                widths[col] = Math.max(widths[col], dims.totalWidth);
                heights[row] = Math.max(heights[row], dims.totalHeight);

                const plotProps = {xaxis: props_xaxis, yaxis: props_yaxis, show_xaxis: show_xaxis, show_yaxis: show_yaxis};
                child = React.cloneElement(child, plotProps);
            }
        }

        const style = {
            gridColumn: col + 1,
            gridRow: row + 1,
        };

        return <div className="plotGridItem" style={style}> { child } </div>
    });

    const gridStyle = {
        display: "grid",
        gridTemplateColumns: widths.map((v) => `${v}px`).join(' '),
        gridTemplateRows: heights.map((v) => `${v}px`).join(' '),
        gap: props.pad ?? "0px",
    };

    return <div className="plotGrid" style={gridStyle}>
        { children }
    </div>;
}

/*

export function PlotList() {
    const listStyle = {
        display: "flex",
        flexDirection: "row",
    };

    <div className="plotList" style={listStyle}>
    </div>
}
*/

/*

PlotGrid, PlotList

Zoomer contains many plots, it attaches to each one
Each plot has an associated xscale and a yscale

on zoom, an event is tracked to a given x and y axis, which are updated


*/

interface PlotImageProps {
    data: NArray | null
    scale: string

    xlim?: [number, number] // [min, max]
    ylim?: [number, number] // [min, max]
}

export function PlotImage(props: PlotImageProps) {
    const fig = React.useContext(FigureContext);
    const plot = React.useContext(PlotContext);
    if (fig === undefined || plot === undefined) {
        throw new Error("Component 'PlotImage' must be used inside a 'Plot'");
    }

    let xaxis = (typeof plot.xaxis === "string") ? fig.axes.get(plot.xaxis)! : plot.xaxis;
    let yaxis = (typeof plot.yaxis === "string") ? fig.axes.get(plot.yaxis)! : plot.yaxis;

    const scale = fig.scales.get(props.scale);
    if (!scale) throw new Error(`Component 'PlotImage' passed invalid scale '${scale}'`);

    const data = props.data;
    if (!data) return null;

    const [currentRange, setCurrentRange] = useAtom(fig.currentRanges.get(props.scale)!);

    const [height, width] = data.shape.values();

    const xlim = xaxis.scale.transform(props.xlim ?? xaxis.scale.domain);
    const ylim = yaxis.scale.transform(props.ylim ?? yaxis.scale.domain);

    let transform = Transform2D.fromBounds([0, width], [0, height]).compose(
        Transform2D.fromBounds(xlim, ylim).invert()
    );

    /*let transform = Transform2D.fromBounds(xlim, ylim)
        .scale(Math.abs(xlim[1] - xlim[0]) / width, Math.abs(ylim[1] - ylim[0]) / height);*/
    //let transform = new Transform2D();

    const canvasRef: React.RefObject<HTMLCanvasElement | null> = React.useRef(null);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !np) return;

        let scale_range = scale.range ?? [null, null];

        // figure out set range (before currentRange)
        let range: [number, number] = [
            scale_range[0] ?? np.nanmin(data).toNestedArray() as number,
            scale_range[1] ?? np.nanmax(data).toNestedArray() as number
        ];
        if (isNaN(range[0]) || isNaN(range[1])) return;

        // TODO: currently this just sets currentRange unconditionally
        // need to make this smarter
        if (currentRange[0] == null || currentRange[1] == null || !isClose(currentRange as Pair, range)) {
            //console.log(`setCurrentRange([${range[0]}, ${range[1]}]`);
            setCurrentRange(range);
        }

        const ctx = canvas.getContext('2d')!;
        const imageData = ctx.createImageData(width, height);

        imageData.data.set(
            np.expr`(${data} - ${range[0]}) / (${range[1]} - ${range[0]})`.apply_cmap(scale.cmap ?? 'magma')
        );

        ctx.putImageData(imageData, 0, 0);
    }, [data, currentRange]);

    return <g transform={transform.toString()}>
    <foreignObject x={0} y={0} width={width} height={height}>
        <canvas width={width} height={height} ref={canvasRef} style={{imageRendering: "pixelated"}}></canvas>
    </foreignObject>
    </g>;
}