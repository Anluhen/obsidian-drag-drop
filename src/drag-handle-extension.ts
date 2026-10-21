import { StateEffect, StateField, type Extension, type Range, type Text } from "@codemirror/state";
import {
	Decoration,
	EditorView,
	GutterMarker,
	ViewPlugin,
	WidgetType,
	gutter,
	type DecorationSet,
	type PluginValue,
	type ViewUpdate,
} from "@codemirror/view";

import {
	frontmatterEnd,
	isValidDropTarget,
	moveLines,
	normalizeTarget,
	resolveBlock,
	type LineRange,
} from "./blocks";

/** Distance from the editor's top or bottom edge, in pixels, that scrolls while dragging. */
const AUTO_SCROLL_MARGIN = 40;

interface DragState {
	source: LineRange;
	/** Line the block will be inserted before; doc.lines + 1 means the end. */
	target: number | null;
}

const setDragState = StateEffect.define<DragState | null>();

class DropIndicatorWidget extends WidgetType {
	eq(): boolean {
		return true;
	}

	toDOM(): HTMLElement {
		return createDiv({ cls: "dnd-lines-drop-indicator" });
	}

	ignoreEvent(): boolean {
		return true;
	}
}

const sourceLine = Decoration.line({ class: "dnd-lines-source" });

function buildDecorations(doc: Text, drag: DragState): DecorationSet {
	const ranges: Range<Decoration>[] = [];
	for (let n = drag.source.start; n <= drag.source.end; n++) {
		ranges.push(sourceLine.range(doc.line(n).from));
	}
	if (drag.target != null) {
		const atEnd = drag.target > doc.lines;
		const indicator = Decoration.widget({
			widget: new DropIndicatorWidget(),
			block: true,
			side: atEnd ? 1 : -1,
		});
		ranges.push(indicator.range(atEnd ? doc.length : doc.line(drag.target).from));
	}
	return Decoration.set(ranges, true);
}

const dragDecorations = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, tr) {
		for (const effect of tr.effects) {
			if (effect.is(setDragState)) {
				return effect.value ? buildDecorations(tr.state.doc, effect.value) : Decoration.none;
			}
		}
		// Any edit cancels the drag, so the decorations would be stale.
		return tr.docChanged ? Decoration.none : decorations;
	},
	provide: field => EditorView.decorations.from(field),
});

const frontmatterEndField = StateField.define<number>({
	create: state => frontmatterEnd(state.doc),
	update: (end, tr) => (tr.docChanged ? frontmatterEnd(tr.state.doc) : end),
});

class DragController implements PluginValue {
	private drag: DragState | null = null;
	private removeListeners: (() => void) | null = null;

	constructor(private readonly view: EditorView) {}

	update(update: ViewUpdate): void {
		// The dragged line numbers are stale once the document changes.
		if (this.drag && update.docChanged) this.stop();
	}

	destroy(): void {
		this.stop();
	}

	start(lineFrom: number): void {
		this.stop();

		const state = this.view.state;
		const line = state.doc.lineAt(lineFrom);
		if (line.number <= state.field(frontmatterEndField)) return;

		this.drag = { source: resolveBlock(state.doc, line.number, state.tabSize), target: null };
		this.listen();
		this.render();
	}

	private listen(): void {
		const win = this.view.dom.ownerDocument.defaultView ?? window;
		const body = win.document.body;

		const onMouseMove = (event: MouseEvent) => this.move(event);
		const onMouseUp = () => this.drop();
		const onBlur = () => this.cancel();
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			this.cancel();
		};

		win.addEventListener("mousemove", onMouseMove);
		win.addEventListener("mouseup", onMouseUp);
		win.addEventListener("blur", onBlur);
		win.addEventListener("keydown", onKeyDown, true);
		body.classList.add("dnd-lines-dragging");

		this.removeListeners = () => {
			win.removeEventListener("mousemove", onMouseMove);
			win.removeEventListener("mouseup", onMouseUp);
			win.removeEventListener("blur", onBlur);
			win.removeEventListener("keydown", onKeyDown, true);
			body.classList.remove("dnd-lines-dragging");
		};
	}

	/** Ends the drag without touching the editor, which may be mid-update or destroyed. */
	private stop(): void {
		this.removeListeners?.();
		this.removeListeners = null;
		this.drag = null;
	}

	private cancel(): void {
		if (!this.drag) return;
		this.stop();
		this.render();
	}

	private move(event: MouseEvent): void {
		if (!this.drag) return;
		this.autoScroll(event.clientY);

		const doc = this.view.state.doc;
		const y = event.clientY - this.view.documentTop;
		const block = this.view.lineBlockAtHeight(y);
		const before = y < (block.top + block.bottom) / 2;
		const target = normalizeTarget(
			doc,
			before ? doc.lineAt(block.from).number : doc.lineAt(block.to).number + 1,
		);
		const next = isValidDropTarget(doc, this.drag.source, target) ? target : null;
		if (next === this.drag.target) return;

		this.drag.target = next;
		this.render();
	}

	private drop(): void {
		const drag = this.drag;
		this.stop();
		if (!drag) return;
		if (drag.target == null) {
			this.render();
			return;
		}

		const state = this.view.state;
		const { changes, anchor } = moveLines(state.doc, state.lineBreak, drag.source, drag.target);
		this.view.dispatch({
			changes,
			selection: { anchor },
			effects: setDragState.of(null),
			userEvent: "move.line",
		});
	}

	private autoScroll(clientY: number): void {
		const scroller = this.view.scrollDOM;
		const rect = scroller.getBoundingClientRect();
		if (clientY < rect.top + AUTO_SCROLL_MARGIN) {
			scroller.scrollTop -= AUTO_SCROLL_MARGIN;
		} else if (clientY > rect.bottom - AUTO_SCROLL_MARGIN) {
			scroller.scrollTop += AUTO_SCROLL_MARGIN;
		}
	}

	private render(): void {
		this.view.dispatch({ effects: setDragState.of(this.drag && { ...this.drag }) });
	}
}

const dragController = ViewPlugin.fromClass(DragController);

class DragHandleMarker extends GutterMarker {
	toDOM(): Node {
		return createDiv({ cls: "dnd-lines-handle", attr: { "aria-label": "Drag to move" } });
	}
}

const dragHandle = new DragHandleMarker();

const dragGutter = gutter({
	class: "dnd-lines-gutter",
	lineMarker(view, line) {
		const lineNumber = view.state.doc.lineAt(line.from).number;
		return lineNumber > view.state.field(frontmatterEndField) ? dragHandle : null;
	},
	domEventHandlers: {
		mousedown(view, line, event) {
			const mouse = event as MouseEvent;
			const onHandle = (mouse.target as HTMLElement).closest(".dnd-lines-handle");
			if (mouse.button !== 0 || !onHandle) return false;
			view.plugin(dragController)?.start(line.from);
			return true;
		},
	},
});

export function createDragHandleExtension(): Extension {
	return [frontmatterEndField, dragDecorations, dragController, dragGutter];
}
