#ifndef AICIV_AI_PLAYER_FORMATS_H
#define AICIV_AI_PLAYER_FORMATS_H

/*
 * Unified C-compatible FP32 signal layouts for AI-player engines.
 *
 * All four engines use the same input shape:
 * - 8 object records, 120 FP32 values each: 960 floats.
 * - 64 generic situation values: 64 floats.
 * - Total input: 1024 FP32 values.
 *
 * Object ids are intentionally not stored in the neural input. The game adapter
 * keeps ids in side arrays in the same order as object records, then maps each
 * output command record back to the corresponding unit/city/group/civilization.
 *
 * All four engines use the same output shape:
 * - 8 command records, 8 FP32 values each: 64 floats.
 * - 8 generic decision values: 8 floats.
 * - Total output: 72 FP32 values.
 *
 * Strategy is the one exception to the command-record interpretation:
 * object_command[n][0..3] are typed focus fields:
 * target_x, target_y, military_attack_priority, defense_priority.
 * object_command[n][4..7] remain command scores. The browser adapter forwards
 * the strongest military focus to tactics and action inputs.
 *
 * Strategy general_decision[0..3] are production demand percentages:
 * Settlers, Worker, Explorer, Military. The browser adapter copies these into
 * Economics input situation[20..23] in the same order.
 */

#ifdef __cplusplus
extern "C" {
#endif

#define AI_PLAYER_INPUT_WIDTH 1024
#define AI_PLAYER_OUTPUT_WIDTH 72
#define AI_PLAYER_OBJECT_COUNT 8
#define AI_PLAYER_OBJECT_FLOATS 120
#define AI_PLAYER_SITUATION_FLOATS 64
#define AI_PLAYER_COMMAND_FLOATS 8
#define AI_PLAYER_GENERAL_OUTPUT_FLOATS 8
#define AI_PLAYER_LOCAL_WINDOW_SIZE 9
#define AI_PLAYER_LOCAL_WINDOW_FLOATS 81
#define AI_PLAYER_LOCAL_WINDOW_BASE 16
#define AI_PLAYER_POST_WINDOW_BASE 97
#define AI_PLAYER_OBJECT_BASE(n) ((n) * AI_PLAYER_OBJECT_FLOATS)
#define AI_PLAYER_SITUATION_BASE 960
#define AI_PLAYER_OUTPUT_COMMAND_BASE(n) ((n) * AI_PLAYER_COMMAND_FLOATS)
#define AI_PLAYER_OUTPUT_GENERAL_BASE 64

typedef struct AIPlayerUnifiedInput {
    float object[AI_PLAYER_OBJECT_COUNT][AI_PLAYER_OBJECT_FLOATS];
    float situation[AI_PLAYER_SITUATION_FLOATS];
} AIPlayerUnifiedInput;

typedef struct AIPlayerUnifiedCommand {
    float command_score[AI_PLAYER_COMMAND_FLOATS];
} AIPlayerUnifiedCommand;

typedef struct AIPlayerStrategyObjectCommand {
    float target_x;
    float target_y;
    float military_attack_priority;
    float defense_priority;
    float command_score[4];
} AIPlayerStrategyObjectCommand;

typedef struct AIPlayerUnifiedOutput {
    AIPlayerUnifiedCommand object_command[AI_PLAYER_OBJECT_COUNT];
    float general_decision[AI_PLAYER_GENERAL_OUTPUT_FLOATS];
} AIPlayerUnifiedOutput;

typedef struct AIPlayerStrategyCivilizationObject {
    float relation;
    float population;
    float city_count;
    float military_strength;
    float science_rate;
    float economy;
    float food_income;
    float production_income;
    float money_income;
    float technology_ratio;
    float threat;
    float trust;
    float distance;
    float expansion_room;
    float naval_strength;
    float reserved[105];
} AIPlayerStrategyCivilizationObject;

typedef struct AIPlayerStrategyForceObject {
    float relation;
    float center_x;
    float center_y;
    float land_strength;
    float naval_strength;
    float mobility;
    float wounded_ratio;
    float border_pressure;
    float siege_pressure;
    float reserve_strength;
    float target_x;
    float target_y;
    float reserved[108];
} AIPlayerStrategyForceObject;

typedef struct AIPlayerTacticsGroupObject {
    float relation;
    float unit_type_mix;
    float count;
    float center_x;
    float center_y;
    float move_dir_x;
    float move_dir_y;
    float hp;
    float attack;
    float defense;
    float speed;
    float range;
    float terrain;
    float road_access;
    float threat;
    float reserved[105];
} AIPlayerTacticsGroupObject;

typedef struct AIPlayerActionUnitObject {
    float type;
    float state;
    float x;
    float y;
    float hp;
    float moves_left;
    float owner_relation;
    float task;
    float immediate_action_signal; /* workers: 0.80 improvement, 0.60 irrigation, 0.45 chop, 0.30 road, 0.20 road-to; military: 0.70 adjacent enemy, 0.50 defensive hill */
    float current_terrain;
    float current_resource_value;
    float nearby_resource_score;
    float fresh_water_nearby;
    float city_plot_score;
    float turns_since_created;
    float distance_to_nearest_friendly_city;
    float local_tile_feature[AI_PLAYER_LOCAL_WINDOW_FLOATS]; /* 9x9 terrain/resource/modifier/unit signal; slot 40 is the unit tile */
    float strategy_target_dx;
    float strategy_target_dy;
    float strategy_military_attack_priority;
    float strategy_defense_priority;
    float reserved[19];
} AIPlayerActionUnitObject;

typedef struct AIPlayerEconomicsCityObject {
    float x;
    float y;
    float population;
    float food_income;
    float production_income;
    float money_income;
    float food_stored;
    float food_consumption;
    float growth_turns;
    float stored_production;
    float frontier;
    float seaside;
    float garrison_strength;
    float no_production;
    float legal_production_count;
    float city_center_value;
    float local_tile_feature[AI_PLAYER_LOCAL_WINDOW_FLOATS]; /* 9x9 landscape/source strength; slot 40 is the city tile */
    float legal_production_mask[4];
    float reserved[19];
} AIPlayerEconomicsCityObject;

typedef struct AIPlayerCommonSituation {
    float owner_team;
    float own_city_count;
    float own_unit_count;
    float known_map_ratio;
    float own_military_count;
    float enemy_military_count;
    float money;
    float money_income;
    float science_income;
    float science_rate;
    float current_research_progress;
    float visible_food_resources;
    float visible_production_resources;
    float idle_unit_count;
    float settler_count;
    float worker_count;
    float opened_technology_rate;
    float reserved[47];
} AIPlayerCommonSituation;

typedef struct AIPlayerStrategySituation {
    float common[16];
    float food_technology_progress;      /* Pottery + Irrigation family */
    float production_technology_progress; /* Mining + Masonry + Construction + Engineering family */
    float military_technology_progress;
    float naval_technology_progress;
    float settler_count;
    float worker_count;
    float military_count;
    float city_count;
    float city_context_hills;
    float city_context_mountains;
    float city_context_grass;
    float city_context_water;
    float city_context_animal_resources;
    float city_context_stone_resources;
    float city_context_crop_resources;
    float opened_technology_rate;
    float city_context_visible_coverage;
    float city_context_flat_land;
    float city_context_fresh_water;
    float city_context_forest;
    float city_context_desert_snow;
    float city_context_resource_coverage;
    float city_context_mineral_resources;
    float city_anchor_present;
    float settler_anchor_present;
    float reserved[23];
} AIPlayerStrategySituation;

typedef union AIPlayerInputSignal {
    float raw[AI_PLAYER_INPUT_WIDTH];
    AIPlayerUnifiedInput fields;
} AIPlayerInputSignal;

typedef union AIPlayerOutputSignal {
    float raw[AI_PLAYER_OUTPUT_WIDTH];
    AIPlayerUnifiedOutput fields;
} AIPlayerOutputSignal;

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus
static_assert(sizeof(AIPlayerUnifiedInput) == AI_PLAYER_INPUT_WIDTH * sizeof(float), "AI input must be 1024 floats");
static_assert(sizeof(AIPlayerUnifiedOutput) == AI_PLAYER_OUTPUT_WIDTH * sizeof(float), "AI output must be 72 floats");
static_assert(sizeof(AIPlayerStrategyCivilizationObject) == AI_PLAYER_OBJECT_FLOATS * sizeof(float), "strategy civ object must be 120 floats");
static_assert(sizeof(AIPlayerStrategyForceObject) == AI_PLAYER_OBJECT_FLOATS * sizeof(float), "strategy force object must be 120 floats");
static_assert(sizeof(AIPlayerTacticsGroupObject) == AI_PLAYER_OBJECT_FLOATS * sizeof(float), "tactics group object must be 120 floats");
static_assert(sizeof(AIPlayerActionUnitObject) == AI_PLAYER_OBJECT_FLOATS * sizeof(float), "action unit object must be 120 floats");
static_assert(sizeof(AIPlayerEconomicsCityObject) == AI_PLAYER_OBJECT_FLOATS * sizeof(float), "economics city object must be 120 floats");
static_assert(sizeof(AIPlayerStrategySituation) == AI_PLAYER_SITUATION_FLOATS * sizeof(float), "strategy situation must be 64 floats");
static_assert(sizeof(AIPlayerInputSignal) == AI_PLAYER_INPUT_WIDTH * sizeof(float), "input union must be 1024 floats");
static_assert(sizeof(AIPlayerOutputSignal) == AI_PLAYER_OUTPUT_WIDTH * sizeof(float), "output union must be 72 floats");
#endif

#endif
