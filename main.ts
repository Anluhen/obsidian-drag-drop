import { Plugin } from "obsidian";

import { createDragHandleExtension } from "./src/drag-handle-extension";

export default class DragAndDropLines extends Plugin {
	onload(): void {
		// Obsidian removes registered editor extensions when the plugin unloads.
		this.registerEditorExtension(createDragHandleExtension());
	}
}
