import {
	Line,
	StateEffect,
	StateField,
	RangeSetBuilder,
	EditorSelection,
	type Extension,
} from "@codemirror/state";
import {
	EditorView,
	GutterMarker,
	ViewPlugin,
	WidgetType,
	gutter,
} from "@codemirror/view";

import { Decoration, DecorationSet } from "@codemirror/view";

const setHighlightedLine = StateEffect.define<number | null>();
const setDropIndicator = StateEffect.define<number | null>();

class DropIndicatorWidget extends WidgetType {
	toDOM(): HTMLElement {
		const element = document.createElement("div");
		element.className = "cm-drop-indicator";
		return element;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

const highlightedLineField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decos, tr) {
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

const dropIndicatorField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decos, tr) {
		decos = decos.map(tr.changes);

		for (const effect of tr.effects) {
			if (effect.is(setDropIndicator)) {
				if (effect.value == null) {
					return Decoration.none;
				}

				const builder = new RangeSetBuilder<Decoration>();
				builder.add(
					effect.value,
					effect.value,
					Decoration.widget({
						block: true,
						widget: new DropIndicatorWidget(),
					}),
				);

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
		private dropLine: number | null = null;
		private dragLine: number | null = null;
		private removeWindowMouseUp: (() => void) | null = null;
		private removeWindowMouseMove: (() => void) | null = null;
		private readonly onWindowMouseUp = (event: MouseEvent) => this.handleMouseUp(event);
		private readonly onWindowMouseMove = (event: MouseEvent) => this.handleMouseMove(event);

		constructor(private readonly view: EditorView) { }

		destroy(): void {
			if (this.dropLine != null) {
				this.view.dispatch({ effects: setDropIndicator.of(null) });
				this.dropLine = null;
			}
			this.removeWindowMouseUp?.();
			this.removeWindowMouseUp = null;
			this.removeWindowMouseMove?.();
			this.removeWindowMouseMove = null;
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

			if (!this.removeWindowMouseMove) {
				window.addEventListener("mousemove", this.onWindowMouseMove);
				this.removeWindowMouseMove = () => {
					window.removeEventListener("mousemove", this.onWindowMouseMove);
					this.removeWindowMouseMove = null;
				};
			}
		}

		handleMouseUp(_event: MouseEvent): void {
			if (this.dragLine == null) return;

			const state = this.view.state;
			const doc = state.doc;
			const dropPos = this.dropLine;
			const dragLine = doc.lineAt(this.dragLine);
			const dragLineEnd = dragLine.number < doc.lines ? doc.line(dragLine.number + 1).from : dragLine.to;

			const effects = [setHighlightedLine.of(null)];
			if (this.dropLine != null) {
				effects.push(setDropIndicator.of(null));
			}

			let changes: { from: number; to: number; insert: string } | undefined;
			let selection: EditorSelection | undefined;

			if (dropPos != null && (dropPos < dragLine.from || dropPos > dragLineEnd)) {
				const lines = doc.toJSON();
				const dragIndex = dragLine.number - 1;
				const trailingEmpty = lines.length > 0 && lines[lines.length - 1] === "";

				let targetIndex: number;
				if (dropPos >= doc.length) {
					targetIndex = trailingEmpty ? lines.length - 1 : lines.length;
				} else {
					const dropLineInfo = doc.lineAt(dropPos);
					targetIndex = dropLineInfo.number - 1;
				}

				if (targetIndex > dragIndex) {
					targetIndex -= 1;
				}

				if (targetIndex !== dragIndex) {
					const [movedLine] = lines.splice(dragIndex, 1);
					if (movedLine != null) {
						if (targetIndex < 0) {
							targetIndex = 0;
						}
						if (targetIndex > lines.length) {
							targetIndex = lines.length;
						}
						lines.splice(targetIndex, 0, movedLine);

						const lineBreak = state.lineBreak;
						const newDoc = lines.join(lineBreak);

						changes = { from: 0, to: doc.length, insert: newDoc };

						const lineBreakLength = lineBreak.length;
						let anchor = 0;
						for (let i = 0; i < targetIndex; i++) {
							anchor += lines[i].length;
							anchor += lineBreakLength;
						}
						selection = EditorSelection.cursor(anchor);
					}
				}
			}

			const spec: Parameters<EditorView["dispatch"]>[0] = { effects };
			if (changes) {
				spec.changes = changes;
			}
			if (selection) {
				spec.selection = selection;
				spec.scrollIntoView = true;
			}

			this.view.dispatch(spec);

			this.dragLine = null;
			this.dropLine = null;

			this.removeWindowMouseUp?.();
			this.removeWindowMouseUp = null;
			this.removeWindowMouseMove?.();
			this.removeWindowMouseMove = null;
		}

		handleMouseMove(event: MouseEvent): void {
			if (this.dragLine == null) return;

			const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
			if (pos == null) {
				if (this.dropLine != null) {
					this.view.dispatch({ effects: setDropIndicator.of(null) });
					this.dropLine = null;
				}
				return;
			}

			const doc = this.view.state.doc;
			const line = doc.lineAt(pos);

			const topCoords = this.view.coordsAtPos(line.from);

			let bottomCoords = this.view.coordsAtPos(line.to);
			if (!bottomCoords) {
				const nextLine = line.number < doc.lines ? doc.line(line.number + 1) : null;
				if (nextLine) {
					bottomCoords = this.view.coordsAtPos(nextLine.from);
				}
			}

			if (!topCoords || !bottomCoords) {
				return;
			}

			const topY = topCoords.top ?? topCoords.bottom;
			const bottomY = bottomCoords.bottom ?? bottomCoords.top;

			if (topY == null || bottomY == null) {
				return;
			}

			const midpoint = (topY + bottomY) / 2;
			const isBefore = event.clientY <= midpoint;
			const targetPos = isBefore
				? line.from
				: line.number < doc.lines
					? doc.line(line.number + 1).from
					: line.to;

			if (this.dropLine === targetPos) {
				return;
			}

			this.dropLine = targetPos;
			this.view.dispatch({ effects: setDropIndicator.of(targetPos) });
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
	".cm-drop-indicator": {
		borderTop: "2px solid var(--interactive-accent)",
		height: "0",
		margin: "0 -4px",
		pointerEvents: "none",
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

	return [dragHandleGutter, DragHandlePlugin, dragHandleTheme, highlightedLineField, dropIndicatorField];

}
