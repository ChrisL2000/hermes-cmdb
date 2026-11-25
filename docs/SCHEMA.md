# Data schema

Two JSON documents, validated by `scripts/validate.py`.

## `data/osi.json` — `cmdb.osi/v1`

```jsonc
{
  "schema": "cmdb.osi/v1",
  "title": "…",
  "note": "…",
  "layers": [
    {
      "num": 1,                       // 1..7, unique, all seven required
      "id": "physical",               // slug, unique
      "name": "Physical",
      "discipline": "Facilities & Signal",
      "color": "#8b5cf6",             // used for the slab, edges and legend
      "summary": "one or two sentences on why this layer matters",
      "sublayers": [
        {
          "id": "l1-power",           // globally unique, referenced by CIs
          "name": "Power & thermal",
          "discipline": "Facilities", // who owns it in practice
          "detail": "what is configured / observed here",
          "standards": ["ATX 3.0"]    // optional, rendered as chips
        }
      ]
    }
  ]
}
```

Rules: exactly seven layers numbered 1-7; every layer has ≥1 sub-layer (the
shipped set has 3-4); sub-layer ids are unique across the whole file, and a
sub-layer belongs to exactly one layer.

## `data/cmdb.json` — `cmdb/v1`

```jsonc
{
  "schema": "cmdb/v1",
  "generated": "2026-11-25",
  "scope": "one paragraph on what is in scope",
  "hosts": [
    {
      "id": "aireenpc",               // referenced by cis[].host and links[]
      "name": "AireenPC",
      "role": "Inference host",
      "os": "Windows 11 Home 10.0.26300 + WSL2 Ubuntu",
      "cpu_ram": "x64, 24 GB to WSL",
      "gpu": "RTX 5070 Ti 16 GB (sm_120)",
      "lan": "198.19.x",              // optional
      "overlay": "100.111.192.82",    // optional
      "state": "running",
      "notes": "why this host exists"
    }
  ],
  "cis": [
    {
      "id": "ci-l4-ollama",           // unique
      "name": "Ollama API :11434",
      "type": "listener",             // free-form: listener, service, subnet, …
      "host": "aireenpc",             // must exist (or the literal "lab")
      "layer": 4,                     // 1..7
      "sublayer": "l4-ports",         // must exist AND belong to that layer
      "address": "127.0.0.1:11434 -> 100.111.192.82:11434",
      "state": "up",                  // up|ok|active|running / degraded|planned|unknown|archived|dynamic
      "notes": "the operational truth, including the trap"
    }
  ],
  "links": [
    { "from": "peeweeherman", "to": "aireenpc", "kind": "ssh+tailnet", "detail": "…" }
  ]
}
```

### State vocabulary

| value | meaning | colour |
|---|---|---|
| `up`, `ok`, `active`, `running` | healthy and serving | green |
| `degraded` | present but not healthy | amber |
| `planned` | documented, not yet built | amber |
| `unknown` | not yet surveyed | amber |
| `archived` | intentionally out of service | amber |
| `dynamic` | table/state that changes on its own | amber |

Anything not in the green list renders amber, so a typo is visible rather than
silently green — but prefer the vocabulary above.

### The one invariant worth knowing

A CI names **both** `layer` and `sublayer`. The validator fails if they
disagree, because that pair is the join between the OSI model and the inventory:
it is what lets you ask "which CIs does Facilities own?" (join on sub-layer
discipline) and "what is broken at L4 right now?" (filter on layer + state).

## Extending

1. Add the CI to `cis[]` with an existing sub-layer.
2. `python scripts/validate.py` — must print `OK`.
3. Reload the page; the count on the layer label and in the panel updates.

To add a new sub-layer, edit `osi.json` first, then file CIs under it. The
viewer builds plates from the model, so nothing in `app.js` needs to change.
