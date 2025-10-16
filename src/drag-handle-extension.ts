import { Line, type Extension } from "@codemirror/state";
import {
	EditorView,
	GutterMarker,
	ViewPlugin,
	gutter,
} from "@codemirror/view";

import { StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet } from "@codemirror/view";

const setHighlightedLine = StateEffect.define<number | null>();

const highlightedLineField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decos, tr) {
		// Keep existing decorations aligned with doc changes.
		decos = decos.map(tr.changes);

		for (const effect of tr.effects) {
			if (effect.is(setHighlightedLine)) {
				if (effect.value == null) {
					return Decoration.none;
				}
				const builder = new RangeSetBuilder<Decoration>();
				const line = tr.state.doc.lineAt(effect.value);
				builder.add(line.from, line.from, Decoration.line({ class: "cm-drag-source" }));
				return builder.finish();
			}
		}

		return decos;
	},
	provide: field => EditorView.decorations.from(field),
});

class DragHandleMarker extends GutterMarker {
	constructor(private readonly lineStart: number) {
		super();
	}

	override toDOM(): HTMLElement {
		const handle = document.createElement("div");
		handle.className = "cm-drag-handle";
		handle.dataset.lineStart = String(this.lineStart);
		handle.tabIndex = -1;
		handle.setAttribute("aria-label", "Drag line");
		return handle;
	}
}

const DragHandlePlugin = ViewPlugin.fromClass(
	class DragHandleController {
		private dragLine: number | null = null;
		private removeWindowMouseUp: (() => void) | null = null;
		private readonly onWindowMouseUp = (event: MouseEvent) => this.handleMouseUp(event);

		constructor(private readonly view: EditorView) { }

		destroy(): void {
			this.removeWindowMouseUp?.();
			this.removeWindowMouseUp = null;
		}

		handleMouseDown(event: MouseEvent): void {

			const target = event.target as HTMLElement | null;

			const lineStart = Number(target?.dataset.lineStart);
			if (Number.isNaN(lineStart)) {
				return;
			}

			const line = this.view.state.doc.lineAt(lineStart) as Line;

			this.dragLine = line.from;

			this.view.dispatch({
				effects: setHighlightedLine.of(line.from),
			});

			if (!this.removeWindowMouseUp) {
				window.addEventListener("mouseup", this.onWindowMouseUp);
				this.removeWindowMouseUp = () => {
					window.removeEventListener("mouseup", this.onWindowMouseUp);
					this.removeWindowMouseUp = null;
				};
			}
		}

		handleMouseUp(event: MouseEvent): void {

			if (this.dragLine == null) return;

			this.view.dispatch({ effects: setHighlightedLine.of(null) });
			this.dragLine = null;

			this.removeWindowMouseUp?.();
			this.removeWindowMouseUp = null;
		}
	},
);

const dragHandleTheme = EditorView.baseTheme({
	".cm-drag-gutter .cm-drag-handle": {
		cursor: "grab",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		position: "relative",
		width: "100%",
		height: "100%",
	},
	".cm-drag-gutter .cm-drag-handle::after": {
		content: '"::"',
		color: "var(--text-muted, #888)",
		fontSize: "0.7rem",
		letterSpacing: "0.2rem",
		opacity: 0,
		transition: "opacity 120ms ease",
	},
	".cm-drag-gutter .cm-drag-handle:hover::after": {
		opacity: 1,
	},
	".cm-line.cm-drag-source": {
		backgroundColor: "var(--background-modifier-hover)",
	},
});

export function createDragHandleExtension(): Extension {
	const dragHandleGutter = gutter({
		class: "cm-drag-gutter",
		lineMarker(_view, line) {
			return new DragHandleMarker(line.from);
		},
		domEventHandlers: {
			mousedown(view, _line, event) {
				const handle = (event.target as HTMLElement).closest(".cm-drag-handle");
				if (!handle) return false;
				view.plugin(DragHandlePlugin)?.handleMouseDown(event as MouseEvent);
				return true; // stop the editor-wide handler
			},
			mouseup(view, _line, event) {
				const handle = (event.target as HTMLElement).closest(".cm-drag-handle");
				if (!handle) return false;
				view.plugin(DragHandlePlugin)?.handleMouseUp(event as MouseEvent);
				return true; // stop the editor-wide handler
			},
		},
	});

	return [dragHandleGutter, DragHandlePlugin, dragHandleTheme, highlightedLineField];

}
