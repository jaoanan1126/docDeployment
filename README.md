# docDeployment

Mintlify documentation workspace for migrating [docs.ramp.com](https://docs.ramp.com/) as described in your take-home brief.

## Prerequisites

- Node.js **v20.17+** ([Mintlify CLI](https://mintlify.com/docs/quickstart))

## Local preview

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Quality checks

```bash
npm run validate
npm run broken-links
npm run a11y
```

If `validate` errors with a system network-interface message, run the same command outside a restricted sandbox (normal terminal is fine).

## Repository layout

| Path | Purpose |
| --- | --- |
| `docs.json` | Site name, theme, colors, navigation ([schema](https://mintlify.com/docs.json)) |
| `index.mdx` | Home page with entry cards and next steps |
| `guides/migration-checklist.mdx` | Integrated migration rubric and Mintlify workflow |
| `logo/` | Light and dark logos (replace with Ramp brand assets) |
| `images/` | Doc images referenced as `/images/...` |
| `custom.css` | Optional scoped styling (homepage card padding) |

## Next steps for the assignment

1. Inventory [docs.ramp.com](https://docs.ramp.com/) and mirror IA in `docs.json`.
2. Add MDX pages under logical folders; use [Mintlify components](https://mintlify.com/docs/components) for steps, callouts, accordions, and tabs.
3. Run validate and broken-links before each push; connect the repo in the [Mintlify dashboard](https://dashboard.mintlify.com/) when you are ready to deploy.