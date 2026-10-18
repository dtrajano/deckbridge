# Contributing

## Development

Requirements: Node.js 22 or later, Visual Studio Code and a local Agent Deck installation for manual integration testing.

```bash
npm ci
npm test
```

Use the **Run Extension** launch configuration or press F5 to open an Extension Development Host. Use `npm run package:local` for local VSIX testing.

## Pull requests

- Keep changes focused and explain user-visible behavior.
- Add or update unit tests for every behavior change and bug fix.
- Run `npm test` before submitting.
- Do not commit transcripts, session databases, credentials, tokens or generated VSIX files.
- Preserve the statement that DeckBridge is an unofficial client for Agent Deck.

By contributing, you agree that your contribution is licensed under the MIT License.
