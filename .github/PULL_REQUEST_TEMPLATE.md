<!-- Thanks for opening a PR. Brief is good. -->

## What this changes

<!-- One paragraph. Lead with the user-visible behavior change, then the implementation note. -->

## Why

<!-- Link the issue if there is one. Otherwise one sentence on why this matters. -->

## How to verify

<!-- Steps a reviewer takes to see this working locally. -->

```
```

## Checklist

- [ ] `node --check plugins/claudecadence/hooks/scripts/cadence_hook.js` passes
- [ ] If JS or hook capture changed, a corresponding test in `test/` exercises it
- [ ] No telemetry / hosted-service / outbound network call added
- [ ] No `package.json` runtime dependency added
- [ ] If CSS, all new colors/fonts/radii reference tokens from `_design.css`
- [ ] If user-visible, `CHANGELOG.md` updated under `[Unreleased]`
