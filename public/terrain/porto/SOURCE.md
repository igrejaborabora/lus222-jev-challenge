# Porto aerial surface experiment

Source: Direção-Geral do Território / IFAP, Ortofotos 25 cm — 2025, northern mainland Portugal.

- Catalogue: https://www.dgterritorio.gov.pt/atividades/cartografia/cartografia-topografica/ortofotos/ortofotos-digitais
- WMS capabilities: https://cartografia.dgterritorio.gov.pt/wms/ortos2025?request=getcapabilities&service=wms
- Layer: `Ortos2025-RGB`; WMS 1.1.1; EPSG:4326.
- Bounding box (west,south,east,north): `-8.74,41.11,-8.55,41.28`.
- GetMap parameters: `SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Ortos2025-RGB&STYLES=&SRS=EPSG:4326&BBOX=-8.74,41.11,-8.55,41.28&WIDTH=2048&HEIGHT=2048&FORMAT=image/jpeg` (4096 version changes width/height).
- Retrieved 27 September 2026. Images are WMS responses, unedited and downsampled by the source service from the nominal 25 cm dataset. The 2048/4096 images do not retain 25 cm ground resolution.
- Service capabilities declare Fees `no conditions apply` and AccessConstraints `None`. DGT describes the listed viewing service as free. Credit DGT / IFAP visibly when displaying the imagery.

This is an opt-in photographic surface experiment. Image coordinates are adapted to the existing illustrative airport and bridge anchors. Heights, runway, coast, river and buildings remain simulated. This is NOT a surveyed reconstruction, a LiDAR terrain model, or a navigation reference. Blank offshore pixels and the coverage boundary blend back to the illustrative surface. No requests are made to DGT during a user's flight.
