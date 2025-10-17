import { Plugin } from 'obsidian';

import { createDragHandleExtension } from "./src/drag-handle-extension";

export default class DragAndDropLines extends Plugin {
	async onload() {
		this.registerEditorExtension(createDragHandleExtension());
	}

	async onunload() {
		this.registerEditorExtension(createDragHandleExtension());
	}
}
