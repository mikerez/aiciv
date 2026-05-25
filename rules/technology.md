# Technology Rules

This file describes technologies available in the `prehistory` layer/era.
Each technology has a list of prerequisite technologies and a sprite asset in `images/`.

## Technology State Rules

- `TECHNOLOGY-STATE-001`: `GameState` stores open technologies in `openTechnologies`.
- `TECHNOLOGY-STATE-002`: A technology is open when its name exists in `GameState.openTechnologies` with value `true`.
- `TECHNOLOGY-STATE-003`: `GameState` starts with zero accumulated science and no opened technologies.
- `TECHNOLOGY-STATE-004`: `GameState.currentResearch` stores the technology selected by the player for discovery.
- `TECHNOLOGY-STATE-005`: `GameState.technologyProgress` stores accumulated science points for each technology.
- `TECHNOLOGY-STATE-006`: `GameState` stores technology costs in science points.
- `TECHNOLOGY-MENU-001`: The technology menu is a white 50% transparent rounded panel from `x=100`, `y=50` to near the unit menu and `y_max-200`.
- `TECHNOLOGY-MENU-002`: The technology menu draws all prehistory technologies once as a dependency tree.
- `TECHNOLOGY-MENU-003`: Technology sprites that are not open are drawn at 50% opacity.
- `TECHNOLOGY-MENU-004`: Clicking a technology selects it as current research only when all prerequisite technologies are open.
- `TECHNOLOGY-MENU-005`: The technology menu slider selects how much city money income is dedicated to science.
- `TECHNOLOGY-MENU-006`: After a valid technology is selected for research, the technology menu closes.
- `TECHNOLOGY-MENU-007`: When research progress discovers a technology, the technology menu opens so the player can see the new opened technology and select the next research.
- `TECHNOLOGY-RESEARCH-001`: During turn processing, dedicated money is converted into science for the selected technology.
- `TECHNOLOGY-RESEARCH-002`: When accumulated science reaches the selected technology cost, that technology becomes open.

## Prehistory Technologies

### Mining

- Sprite: `images/tech_mining.png`
- Prerequired technologies: none.
- Cost: 20 science.
- Description: Enables organized extraction of stone and ore from hills and rocky ground.

### Pottery

- Sprite: `images/tech_pottery.png`
- Prerequired technologies: none.
- Cost: 20 science.
- Description: Enables storage vessels, food preservation, and early settlement logistics.

### Animal Husbandry

- Sprite: `images/tech_animal_husbandry.png`
- Prerequired technologies: none.
- Cost: 20 science.
- Description: Enables domestication, herding, and managed use of animals.

### Sailing

- Sprite: `images/tech_sailing.png`
- Prerequired technologies: none.
- Cost: 20 science.
- Description: Enables basic coastal travel by simple boats and rafts.

### Astronomy

- Sprite: `images/tech_astronomy.png`
- Prerequired technologies: `Sailing`, `Writing`.
- Cost: 65 science.
- Description: Enables navigation by sky observation and improves long-distance planning.

### Irrigation

- Sprite: `images/tech_irrigation.png`
- Prerequired technologies: `Pottery`.
- Cost: 35 science.
- Description: Enables channeling water to improve farming around settlements.

### Writing

- Sprite: `images/tech_writing.png`
- Prerequired technologies: `Pottery`.
- Cost: 40 science.
- Description: Enables records, orders, maps, and stable transfer of knowledge.

### Masonry

- Sprite: `images/tech_masonry.png`
- Prerequired technologies: `Mining`.
- Cost: 35 science.
- Description: Enables shaped-stone construction and stronger permanent buildings.

### Archery

- Sprite: `images/tech_archery.png`
- Prerequired technologies: `Animal Husbandry`.
- Cost: 35 science.
- Description: Enables ranged hunting and early ranged military units.

### Bronze Working

- Sprite: `images/tech_bronze_working.png`
- Prerequired technologies: `Mining`.
- Cost: 40 science.
- Description: Enables copper and tin alloy tools, weapons, and stronger production.

### Wheel

- Sprite: `images/tech_wheel.png`
- Prerequired technologies: `Animal Husbandry`.
- Cost: 35 science.
- Description: Enables carts, road transport, and more efficient movement of goods.

### Navigation

- Sprite: `images/tech_navigation.png`
- Prerequired technologies: `Sailing`, `Astronomy`.
- Cost: 90 science.
- Description: Enables planned sea routes and more reliable travel beyond local coasts.

### Currency

- Sprite: `images/tech_currency.png`
- Prerequired technologies: `Writing`.
- Cost: 60 science.
- Description: Enables standardized exchange and stronger trade management.

### Horseback Riding

- Sprite: `images/tech_horseback_riding.png`
- Prerequired technologies: `Animal Husbandry`, `Wheel`.
- Cost: 60 science.
- Description: Enables mounted movement, scouting, and early cavalry roles.

### Iron Working

- Sprite: `images/tech_iron_working.png`
- Prerequired technologies: `Bronze Working`.
- Cost: 70 science.
- Description: Enables stronger metal tools and iron weapon production.

### Shipbuilding

- Sprite: `images/tech_shipbuilding.png`
- Prerequired technologies: `Sailing`, `Bronze Working`.
- Cost: 65 science.
- Description: Enables larger and stronger vessels for transport and expansion.

### Mathematics

- Sprite: `images/tech_mathematics.png`
- Prerequired technologies: `Writing`.
- Cost: 60 science.
- Description: Enables measurement, calculation, planning, and more advanced building.

### Construction

- Sprite: `images/tech_construction.png`
- Prerequired technologies: `Masonry`, `Mathematics`.
- Cost: 85 science.
- Description: Enables coordinated large structures and stronger settlement works.

### Engineering

- Sprite: `images/tech_engineering.png`
- Prerequired technologies: `Construction`, `Iron Working`.
- Cost: 120 science.
- Description: Enables advanced structures, machines, bridges, and organized works.
