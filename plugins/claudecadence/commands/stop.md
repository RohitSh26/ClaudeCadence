---
description: Stop the ClaudeCadence local viewer server
---

Stop the local http server (frees port 4173).

Run:

```bash
lsof -ti:4173 -nP 2>/dev/null | xargs -r kill 2>&1
echo "ClaudeCadence viewer stopped (port 4173 free)."
```
