# Publishing DeckBridge

DeckBridge is published as a free Preview extension. A release is driven by a `vX.Y.Z` Git tag and must never be started while `npm test` is failing.

## One-time account setup

1. Create the `dtrajano` publisher in the [Visual Studio Marketplace publisher portal](https://marketplace.visualstudio.com/manage/publishers/).
2. Create a private Azure DevOps project linked to `dtrajano/deckbridge-vscode`.
3. Link a valid Azure subscription only to activate the free Azure Pipelines grant. Do not purchase parallel jobs.
4. Create a user-assigned managed identity and a workload-identity-federated Azure Resource Manager service connection named `deckbridge-marketplace-wif`.
5. Add the managed identity to the `dtrajano` Marketplace publisher with the Contributor role.
6. Connect `azure-pipelines.yml` to the GitHub repository and grant that pipeline access only to the service connection above.
7. Set an Azure budget alert at the lowest supported amount. Do not provision paid agents, Managed DevOps Pools or other runtime resources.

No Marketplace PAT is stored in GitHub, Azure Pipelines or the repository.

## Release checklist

1. Update `package.json` and `CHANGELOG.md` to the same `X.Y.Z` version.
2. Run `npm ci`, `npm test`, `npm audit --omit=dev` and `npm run package:release`.
3. Install the generated VSIX in a clean VS Code profile and complete the smoke test below.
4. Commit and merge the release preparation.
5. Create and push the signed or annotated tag `vX.Y.Z`.
6. Confirm the GitHub Release workflow attached the VSIX.
7. Confirm Azure Pipelines published `dtrajano.deckbridge` to the Marketplace.
8. Verify the Marketplace listing and install the extension from search in a clean profile.

## Smoke test

- Agent Deck missing: show installation guidance.
- Agent Deck present: list and group sessions with accurate state colors.
- Open a session and load Recall history.
- Send a message and observe live progress and the response.
- Stop, start and reopen the session.
- Inspect context, mode, model and full session ID.
- Select a model through the chip and guided `/model` completion.
- Open the terminal and VS Code Test Explorer actions.
- Confirm slash commands and Agent Deck skills are suggested.

Do not use real private transcripts or credentials in screenshots or release evidence.

## Cost guardrail

The pipeline is designed for one Microsoft-hosted free-tier job. If Azure requests purchase of capacity or any resource outside the free grant, stop setup and review the account configuration instead of accepting the charge.
