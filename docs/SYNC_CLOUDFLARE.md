# Frontend synchronization

Canonical redesign target is `cloudflare/web/` on `feat/itinerary-jogja-ui` based on `cloudflare-deploy`. No production deploy before approval. Go `web/` is legacy: do not overwrite it with the transport-enabled Workers frontend. Port only compatible visual tokens and styles, then adapt individual markup/scripts and test Go separately. Keep technical repository, Worker name, routes, bindings, storage keys and CRS unchanged.
