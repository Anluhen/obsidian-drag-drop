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

// interface DragSession {
// 	sourceLineNumber: number;
// 	dropLine: number;
// 	ghost: HTMLElement;
// }

// interface DocumentLine {
// 	from: number;
// 	to: number;
// 	number: number;
// 	text: string;
// }

// function createGhost(text: string): HTMLElement {
// 	const ghost = document.createElement("div");
// 	ghost.className = "cm-drag-ghost";
// 	ghost.textContent = text;
// 	ghost.style.position = "fixed";
// 	ghost.style.pointerEvents = "none";
// 	ghost.style.padding = "4px 8px";
// 	ghost.style.borderRadius = "4px";
// 	ghost.style.background = "var(--background-modifier-cover, rgba(0, 0, 0, 0.85))";
// 	ghost.style.color = "var(--text-normal, #fff)";
// 	ghost.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.25)";
// 	ghost.style.opacity = "0.95";
// 	ghost.style.zIndex = "9999";
// 	ghost.style.maxWidth = "320px";
// 	ghost.style.fontFamily = "var(--font-monospace, monospace)";
// 	ghost.style.fontSize = "0.85rem";
// 	ghost.style.lineHeight = "1.4";
// 	ghost.style.whiteSpace = "pre";
// 	ghost.style.overflow = "hidden";
// 	ghost.style.textOverflow = "ellipsis";
// 	document.body.appendChild(ghost);
// 	return ghost;
// }

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
		// private dragging: DragSession | null = null;
		// private readonly onMouseMove = (event: MouseEvent) => this.handleMouseMove(event);
		// private readonly onMouseUp = (event: MouseEvent) => this.handleMouseUp(event);

		constructor(private readonly view: EditorView) { }

		// destroy(): void {
		// 	this.teardownDrag();
		// }

		handleMouseDown(event: MouseEvent): void {

			// 	if (event.button !== 0) {
			// 		return;
			// 	}

			const target = event.target as HTMLElement | null;
			console.log("target: ", target);
			// this.view

			// console.log("A handle!")

			const lineStart = Number(target?.dataset.lineStart);
			if (Number.isNaN(lineStart)) {
				return;
			}

			// 	event.preventDefault();
			// 	event.stopPropagation();
			// 	this.view.focus();

			const line = this.view.state.doc.lineAt(lineStart) as Line;

			this.view.dispatch({
				effects: setHighlightedLine.of(line.from),
			});

			// this.startDrag(line, event);
		}

		handleMouseUp(event: MouseEvent): void {
			console.log("Mouse Up!")
			const target = event.target as HTMLElement | null;
			console.log("target", target)

			const lineStart = Number(target?.dataset.lineStart);
			if (Number.isNaN(lineStart)) {
				return;
			}

			this.view.dispatch({
				effects: setHighlightedLine.of(null),
			});

		}

		private startDrag(line: Line, event: MouseEvent): void {
			console.log('Dragging!');
			// this.teardownDrag();

			// const ghost = createGhost(line.text);
			// this.dragging = {
			// 	sourceLineNumber: line.number,
			// 	dropLine: line.number,
			// 	ghost,
			// };

			// this.updateGhostPosition(event);
			// window.addEventListener("mousemove", this.onMouseMove);
			// window.addEventListener("mouseup", this.onMouseUp);
		}

		// private handleMouseMove(event: MouseEvent): void {
		// 	if (!this.dragging) {
		// 		return;
		// 	}

		// 	event.preventDefault();
		// 	this.updateGhostPosition(event);
		// 	this.dragging.dropLine = this.resolveDropLine(event);
		// }

		// private handleMouseUp(event: MouseEvent): void {
		// 	if (!this.dragging) {
		// 		return;
		// 	}

		// 	event.preventDefault();
		// 	event.stopPropagation();
		// 	this.updateGhostPosition(event);
		// 	this.applyDrop();
		// 	this.teardownDrag();
		// }

		// private applyDrop(): void {
		// 	if (!this.dragging) {
		// 		return;
		// 	}

		// 	const doc = this.view.state.doc;
		// 	if (doc.lines === 0) {
		// 		return;
		// 	}

		// 	const sourceIndex = this.dragging.sourceLineNumber - 1;
		// 	const dropLine = Math.max(1, Math.min(this.dragging.dropLine, doc.lines + 1));

		// 	const originalLines = doc.toString().split("\n");
		// 	if (sourceIndex < 0 || sourceIndex >= originalLines.length) {
		// 		return;
		// 	}

		// 	const [movingLine] = originalLines.splice(sourceIndex, 1);
		// 	if (movingLine == null) {
		// 		return;
		// 	}

		// 	let targetIndex = dropLine - 1;
		// 	if (dropLine > this.dragging.sourceLineNumber) {
		// 		targetIndex -= 1;
		// 	}

		// 	targetIndex = Math.max(0, Math.min(targetIndex, originalLines.length));
		// 	originalLines.splice(targetIndex, 0, movingLine);

		// 	if (sourceIndex === targetIndex) {
		// 		return;
		// 	}

		// 	const newText = originalLines.join("\n");
		// 	let newCursorPos = 0;
		// 	for (let index = 0; index < targetIndex; index += 1) {
		// 		newCursorPos += originalLines[index].length + 1;
		// 	}

		// 	this.view.dispatch({
		// 		changes: {
		// 			from: 0,
		// 			to: doc.length,
		// 			insert: newText,
		// 		},
		// 		selection: EditorSelection.cursor(newCursorPos),
		// 		userEvent: "input.dragdrop",
		// 		scrollIntoView: true,
		// 	});
		// }

		// private updateGhostPosition(event: MouseEvent): void {
		// 	if (!this.dragging) {
		// 		return;
		// 	}

		// 	const offset = 12;
		// 	this.dragging.ghost.style.left = `${event.clientX + offset}px`;
		// 	this.dragging.ghost.style.top = `${event.clientY + offset}px`;
		// }

		// private resolveDropLine(event: MouseEvent): number {
		// 	const doc = this.view.state.doc;
		// 	if (doc.lines === 0) {
		// 		return 1;
		// 	}

		// 	const coords = { x: event.clientX, y: event.clientY };
		// 	const position = this.view.posAtCoords(coords);
		// 	if (position == null) {
		// 		const rect = this.view.dom.getBoundingClientRect();
		// 		if (event.clientY < rect.top) {
		// 			return 1;
		// 		}
		// 		return doc.lines + 1;
		// 	}

		// 	const line = doc.lineAt(position);
		// 	const lineCoords = this.view.coordsAtPos(line.from);
		// 	if (lineCoords) {
		// 		const midpoint = (lineCoords.top + lineCoords.bottom) / 2;
		// 		if (event.clientY > midpoint) {
		// 			return Math.min(doc.lines + 1, line.number + 1);
		// 		}
		// 	}

		// 	return line.number;
		// }

		// private teardownDrag(): void {
		// 	if (!this.dragging) {
		// 		return;
		// 	}

		// 	// window.removeEventListener("mousemove", this.onMouseMove);
		// 	// window.removeEventListener("mouseup", this.onMouseUp);
		// 	this.dragging.ghost.remove();
		// 	this.dragging = null;
		// }
	},
	{
		eventHandlers: {
			mouseup(event: Event) {
				this.handleMouseUp(event as MouseEvent);
				return true; // stop the editor-wide handler
			},
		},
	},
);

const dragHandleTheme = EditorView.baseTheme({
	".cm-drag-gutter": {
		cursor: "grab",
	},
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
		letterSpacing: "0.1rem",
	},
	".cm-drag-ghost": {
		backdropFilter: "blur(4px)",
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
		},
	});

	return [dragHandleGutter, DragHandlePlugin, dragHandleTheme, highlightedLineField];

}
