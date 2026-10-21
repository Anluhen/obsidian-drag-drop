# Drag and Drop Lines

Reorder your notes by dragging lines in the editor, the way you would in an outliner.

## Usage

Hover the gutter to the left of a line to reveal its handle (`::`), then drag it up or down. A line shows where the block will land. Release the mouse to drop it, or press <kbd>Esc</kbd> to cancel. Dragging near the top or bottom of the editor scrolls the note.

The handle moves the whole structure that starts on that line:

| Dragged line | What moves |
| --- | --- |
| List item | The item with its nested items and indented content |
| Heading | The whole section, up to the next heading of the same or a higher level |
| First line of a callout | The entire callout |
| Opening or closing fence of a code block | The entire code block |
| Any other line | Only that line |

Lines that start with `#` inside a code block are not treated as headings. Frontmatter has no handles and can't be a drop target, so properties stay at the top of the note.

Each move is a single edit, so <kbd>Ctrl/Cmd</kbd> + <kbd>Z</kbd> undoes it.

## Limitations

- Desktop only: dragging relies on mouse events.
- Works in Live Preview and Source mode, not in Reading view.
- Nested callouts and plain block quotes move one line at a time.

## Installation

Search for **Drag and Drop Lines** in **Settings → Community plugins → Browse**, then install and enable it.

To install manually, download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/Anluhen/obsidian-drag-drop/releases/latest) into `<vault>/.obsidian/plugins/drag-n-drop-lines/` and enable the plugin.

## Development

```bash
npm install
npm run dev    # rebuild main.js on change
npm run lint   # eslint-plugin-obsidianmd checks
npm run build  # type-check and production build
```

## License

[MIT](LICENSE)
