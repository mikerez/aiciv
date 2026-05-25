# Resource Rules

Resources are base map properties stored separately from terrain.

## Layer Ownership

- `RESOURCE-LAYER-001`: Resource definitions for an era are declared by the active layer file.
- `RESOURCE-LAYER-002`: The prehistory layer declares resources in `game_prehistory.js`.
- `RESOURCE-LAYER-003`: Resources not known before the medieval era are kept as commented definitions in the prehistory resource table.

## Tile State

- `RESOURCE-MAP-001`: Each map cell has a resource state stored in `_map_resource[i][j]`, containing `type` and `hidden`.
- `RESOURCE-MAP-002`: Resource `type` `0` means no resource is present on the tile.
- `RESOURCE-MAP-003`: Resource `type` values greater than `0` index `_resource_types`.

## Resource Sprites

- `RESOURCE-SPRITE-001`: Each resource sprite is a `220x160` transparent PNG tile overlay.
- `RESOURCE-SPRITE-002`: The visible resource icon is approximately `30x30` pixels and is centered on the tile overlay.
- `RESOURCE-SPRITE-003`: Resource sprites are drawn above terrain and below units.
- `RESOURCE-SPRITE-004`: Resource sprites use the same fog brightness as their underlying terrain tile.

## Resources

| Resource | Terrain | Gives |
| --- | --- | --- |
| Bananas | forest, grass | Food from tropical forest and grass tiles. |
| Cattle | grass | Food and production from grassland herds. |
| Copper | hills, rocks | Early metal production and trade value. |
| Crabs | water, river grass | Food from coastal water and river grass. |
| Deer | forest, snow | Food and hides from forest or snow edge tiles. |
| Fish | water | Food from water tiles. |
| Rice | grass, river grass | Food from wet grass and river grass. |
| Sheep | grass, hills | Food and wool from grass or hills. |
| Stone | hills, rocks | Production support for early buildings and construction. |
| Wheat | grass, river grass | Food support for city growth. |
| Amber | forest, snow | Luxury and trade value from forested lands. |
| Citrus | grass, forest | Food and luxury from warm grass or forest. |
| Cocoa | forest | Luxury and trade value from forest tiles. |
| Coffee | hills, forest | Luxury and commerce from hills or forest. |
| Cotton | grass, sand | Luxury and textile value from open land. |
| Dyes | forest, grass | Luxury and trade colorants from forests or grass. |
| Diamonds | hills, rocks | High-value luxury from hills and rocks. |
| Furs | snow, forest | Luxury from cold terrain and forests. |
| Gypsum | sand, hills, rocks | Construction material from desert, hills, and rocks. |
| Honey | forest, grass | Food and luxury from forest and grass. |
| Incense | sand, hills | Luxury and ceremonial trade value. |
| Ivory | grass, forest | Luxury and strategic animal material. |
| Marble | hills, rocks | Luxury stone and building production value. |
| Mercury | hills, rocks | Rare scientific and trade material. |
| Olives | grass, hills | Food and luxury from grass or hills. |
| Pearls | water | Luxury from water tiles. |
| Salt | sand, water, hills | Food preservation and trade value. |
| Silk | forest | Luxury textile value from forest regions. |
| Silver | hills, rocks | Precious metal commerce and trade value. |
| Spices | forest, grass | Luxury and food trade value. |
| Sugar | grass, river grass | Food and luxury from wet grass or river grass. |
| Tea | hills, forest | Luxury from hills or forest. |
| Tobacco | grass, forest | Luxury and commerce from grass or forest. |
| Turtles | water | Food and luxury from water tiles. |
| Whales | water | Food, production, and luxury from water tiles. |
| Wine | grass, hills | Luxury and culture value from grass or hills. |
| Horses | grass, sand | Strategic animal resource for horse units. |
| Iron | hills, rocks | Strategic metal for iron weapons and units. |
| Niter | sand, hills, rocks | Strategic resource for gunpowder units. |
| Coal | hills, rocks | Strategic fuel for industry and railways. |
| Oil | water, sand, rocks | Strategic fuel for modern units and industry. |
| Aluminum | hills, rocks | Strategic metal for advanced units and construction. |
| Uranium | hills, rocks, sand | Strategic late-game energy and weapon resource. |
| Gold | hills, rocks, sand | Commerce and trade value. |

## Generation

- `RESOURCE-GEN-001`: Resources are generated after terrain generation and enhancement.
- `RESOURCE-GEN-002`: A tile may contain at most one resource.
- `RESOURCE-GEN-003`: Resources appear only on terrain types listed by their resource definition.
- `RESOURCE-GEN-004`: Generated resources are prepared into a full-map sprite list for faster drawing.
- `RESOURCE-GEN-005`: Resource generation uses sparse probabilities so resources remain rare on the map.
- `RESOURCE-GEN-006`: Duplicate resource names in design input are represented once in `_resource_types`.

## Visibility

- `RESOURCE-VIS-001`: Generated resources start hidden.
- `RESOURCE-VIS-002`: Land resources are revealed only when an Explorer stands on the resource tile.
- `RESOURCE-VIS-003`: Water resources are revealed only when a ship stands on the resource tile.
- `RESOURCE-VIS-004`: Hidden resources are not included in the prepared resource sprite list and are not drawn.
