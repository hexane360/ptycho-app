export let np: null | typeof import("wasm-array") = null;

export let np_fut: Promise<typeof import("wasm-array")> = import("wasm-array")
    .then(mod => {
        console.log("np module loaded");
        np = mod;
        return np;
    })
    .catch(e => { throw new Error(`Error importing wasm-array: ${e}`) });