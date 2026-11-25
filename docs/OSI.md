# The layers, and who owns them

The OSI model is taught as a networking abstraction. In operations it is better
read as a **fault-domain map**: each layer is a different set of people, tools and
questions. This CMDB files every configuration item at the layer *and sub-layer*
whose owner would be paged.

| L | layer | discipline | the question this layer answers | typical tool |
|---|---|---|---|---|
| 7 | Application | Services & Observability | is the thing users asked for working? | Grafana, Kibana |
| 6 | Presentation | Encoding & Crypto | are the bytes interpretable and trusted? | openssl, jq, model cards |
| 5 | Session | Identity & State | who is connected, and for how long? | ssh, tokens, SMB |
| 4 | Transport | Sockets & Ports | what is listening, on which interface? | ss, netstat, compose |
| 3 | Network | Routing & Overlay | can this address reach that address? | ip route, tailscale |
| 2 | Data Link | Switching | is the frame on the right segment? | bridge, VLAN config |
| 1 | Physical | Facilities & Signal | is there a signal and enough power? | cabling, PSU, thermals |

## Why sub-layers exist

A layer is too coarse to own. "Network is broken" is not actionable; "the tailnet
overlay dropped while the LAN route is fine" is. Each layer is therefore split
into sub-layers that map to a **single discipline**, and the sub-layer — not the
layer — is the field a CI must name.

```
L4 Transport
├── l4-tcp     TCP              → Systems
├── l4-udp     UDP & QUIC       → Systems
├── l4-ports   Port registry    → Platform
└── l4-proxy   Proxying & LB    → Platform
```

That is why `l4-ports` is the densest sub-layer in the seed data: ports are the
contract between a service and the network, and the place where "who owns this"
is least ambiguous.

## Two rules that keep the model useful

1. **One CI, one home, one discipline.** A host appears at several layers as
   separate CIs — NIC at L1, listener at L4, service at L7. Merging them into one
   "server" record destroys the ability to trace an outage across layers.
2. **File by the fixer, not by the packet.** A GGUF quantisation level is
   arguably application data; it is filed under L6 *Encoding* because that is the
   team that changes it, and its consequences (VRAM, tokens/s) show up at L7.

## What the model deliberately excludes

* **Business services and SLAs** — no owner, no criticality score, no cost. A real
  CMDB grows these; this one is scoped to infrastructure facts.
* **Live discovery.** The data is a snapshot. Nothing polls the hosts; stale
  states are visible as `unknown`/`degraded`, not silently corrected.
* **Secrets.** Tokens appear as CIs (where they live, who can read them) but
  never as values.

## Rendering choices

* Layers are stacked **bottom-up** in the conventional order, L1 at the base,
  because that is how the dependency reads: a failure at L1 invalidates
  everything above it.
* Colour is per layer, and the same colour drives the slab, the plate edges, the
  legend and the panel accent — so identity is not carried by text alone.
* Selecting a layer **opens** it: sub-layer plates separate along Y, which is a
  spatial cue for "these belong to one layer" rather than decoration.
* Filtering dims layers with no matching CI instead of hiding them, so the stack
  never changes shape while you are reading it.
