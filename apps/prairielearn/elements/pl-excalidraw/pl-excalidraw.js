/* eslint-env browser,jquery */

// This module is defined in the import map
// eslint-disable-next-line import/no-unresolved
import {ExcalidrawLib, React, ReactDOM} from "pl-excalidraw-deps"

const elt = React.createElement

const Footer = ({unsaved, readOnly}) => {
    const desc = unsaved ? "Unsaved" : "Saved"
    return elt(ExcalidrawLib.Footer, null,
        readOnly ? null : elt(ExcalidrawLib.Button, {
            "aria-label": desc,
            type: "button",
            disabled: true,
            title: desc,
            size: "medium",
            className: unsaved ? "save-button save-button-unsaved" : "save-button",
        }, desc))
}

const DrawWidget = ({sketchName, metadata, setHiddenInput}) => {
    const [readOnly, setReadOnly] = React.useState(false)
    const [unsaved, setUnsaved] = React.useState(false)
    const [lib, setLib] = React.useState(null)
    const [sceneVer, setSceneVer] = React.useState(0)

    /* First time setup */
    React.useEffect(() => {
        const readOnly = metadata.panel !== "question";
        setReadOnly(readOnly)
    }, [metadata])

    /* Autosave */
    React.useEffect(() => {
        if (!lib || metadata.panel !== "question") return
        const autoSave = setTimeout(() => {
            setHiddenInput(ExcalidrawLib.serializeAsJSON(lib.getSceneElements(), lib.getAppState(), lib.getFiles(), "local"))
            setUnsaved(false)
        }, 250)
        return () => clearTimeout(autoSave)
    }, [setHiddenInput, lib, sceneVer])

    const props = {
        name: sketchName,
        /* The "Exit Zen Mode" button does not have type=button and triggers form submission.
        * https://github.com/excalidraw/excalidraw/issues/8029 */
        zenModeEnabled: false,
        initialData: metadata.scene || {},
        isCollaborating: false,
        excalidrawAPI: (it) => setLib(it),
        viewModeEnabled: readOnly,
        onChange: (elts) => {
            let thisVersion = ExcalidrawLib.getSceneVersion(elts)
            if (sceneVer >= thisVersion) return;
            setUnsaved(true)
            setSceneVer(thisVersion)
        },
    }

    return elt(React.Fragment, null,
        elt("div", {className: "draw-container"},
            elt(ExcalidrawLib.Excalidraw,
                props,
                elt(ExcalidrawLib.MainMenu, null,
                    elt(ExcalidrawLib.MainMenu.DefaultItems.ClearCanvas),
                    elt(ExcalidrawLib.MainMenu.DefaultItems.Export),
                    elt(ExcalidrawLib.MainMenu.DefaultItems.SaveAsImage),
                ),
                elt(Footer, {unsaved, readOnly}),
            )),
    )
}

export async function init_sketch(uuid, name, metadata) {
    const sketch = {}

    const rootElement = document.getElementById(`excalidraw-${uuid}`)

    const hiddenInput = document.getElementById(`excalidraw-input-${uuid}`)
    const setHiddenInput = (value) => hiddenInput.value = value;

    if (metadata.submission) {
        metadata.scene = await ExcalidrawLib.loadFromBlob(new Blob([metadata.submission]))
    }

    sketch.name = name
    sketch.state = null
    sketch.node = rootElement
    sketch.root = ReactDOM.createRoot(rootElement)
    sketch.root.render(elt(React.StrictMode, null, elt(DrawWidget, {
        sketchName: name,
        metadata,
        setHiddenInput,
    })))

    return sketch
}
