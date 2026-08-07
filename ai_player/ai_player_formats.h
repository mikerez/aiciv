#ifndef AICIV_AI_PLAYER_FORMATS_H
#define AICIV_AI_PLAYER_FORMATS_H

/*
 * Unified C-compatible FP32 signal layouts for AI-player engines.
 *
 * Action and Economics use the same base input shape:
 * - 8 object records, 120 FP32 values each: 960 floats.
 * - 64 generic situation values: 64 floats.
 * - Base input: 1024 FP32 values.
 *
 * Strategy extends the base input with a fixed world birdsview:
 * - 50 x 50 cells, one compact FP32 value per cell: 2500 floats.
 * - Total Strategy input: 3524 FP32 values.
 *
 * Object ids are intentionally not stored in the neural input. The game adapter
 * keeps ids in side arrays in the same order as object records, then maps each
 * output command record back to the corresponding unit/city/group/civilization.
 *
 * All three engines use the same output shape:
 * - 8 command records, 8 FP32 values each: 64 floats.
 * - 8 generic decision values: 8 floats.
 * - Total output: 72 FP32 values.
 *
 * Action interprets its eight input object records as eight complete legal
 * candidates for one selected unit. action output[0..7] score those candidates
 * in order; the remaining outputs are reserved. A candidate includes the exact
 * command, target displacement, target facts, and requested state/improvement.
 *
 * Strategy is the one exception to the command-record interpretation:
 * object_command[n][0..3] are typed focus fields:
 * target_x, target_y, military_attack_priority, defense_priority. For the own
 * civilization record, target_x/target_y plus defense_priority are also used
 * as a worker-support suggestion toward the smallest own city.
 * object_command[n][4..7] remain command scores. The browser adapter forwards
 * the strongest military focus to military action inputs, and the
 * own-civilization worker-support focus to worker action inputs.
 *
 * Strategy general_decision[0..2] are production demand percentages:
 * Settlers, Worker, Explorer. The browser derives Military demand as remaining
 * production pressure. Strategy general_decision[3] is science funding ratio.
 * The browser adapter copies derived production demand into Economics input
 * situation[20..23].
 */

#ifdef __cplusplus
extern "C" {
#endif

#define AI_PLAYER_BASE_INPUT_WIDTH 1024
#define AI_PLAYER_BIRDSVIEW_SIZE 50
#define AI_PLAYER_BIRDSVIEW_FLOATS 2500
#define AI_PLAYER_BIRDSVIEW_BASE 1024
#define AI_PLAYER_INPUT_WIDTH 3524
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

typedef struct AIPlayerStrategyInput {
    AIPlayerUnifiedInput base;
    float birdsview[AI_PLAYER_BIRDSVIEW_FLOATS];
} AIPlayerStrategyInput;

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

typedef struct AIPlayerActionCandidateObject {
    float type;
    float state;
    float immediate_action_signal;
    float nearby_worker_density;
    float task;
    float command;
    float target_dx;
    float target_dy;
    float path_distance;
    float target_terrain;
    float target_resource_value;
    float target_city_plot_score;
    float target_relation;
    float requested_state_or_improvement;
    float strategy_military_priority;
    float valid;
    float settler_age;
    float nearby_resource_score;
    float fresh_water_nearby;
    float strategy_defense_or_worker_support_priority;
    float strategy_alignment;
    float packed_target_tile_signal;
    float local_tile_feature[AI_PLAYER_LOCAL_WINDOW_FLOATS]; /* 9x9 window around the candidate target */
    float reserved[17];
} AIPlayerActionCandidateObject;

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

typedef struct AIPlayerEconomicsSituation {
    float owner_team;
    float own_city_count;
    float free_city_count;
    float known_map_ratio;
    float reserved4;
    float own_military_count;
    float enemy_military_count;
    float reserved7_13[7];
    float idle_unit_count;
    float worker_count;
    float opened_technology_rate;
    float reserved17_19[3];
    float settlers_demand;
    float worker_demand;
    float explorer_demand;
    float military_demand;
    float money_account;
    float account_delta;
    float upkeep;
    float technology_wheel;
    float technology_bronze_working;
    float technology_irrigation;
    float technology_animal_husbandry;
    float technology_mining;
    float technology_masonry;
    float technology_pottery;
    float technology_construction;
    float opportunity_road;
    float opportunity_chop_forest;
    float opportunity_irrigation;
    float opportunity_animal_resource;
    float opportunity_mine;
    float opportunity_cottage_or_quarry;
    float opportunity_plantation_or_winery;
    float opportunity_workshop_or_fortification;
    float usable_road_job;
    float usable_chop_forest_job;
    float usable_irrigation_job;
    float usable_animal_resource_job;
    float usable_mine_job;
    float usable_cottage_or_quarry_job;
    float usable_plantation_or_winery_job;
    float usable_workshop_or_fortification_job;
    float reserved51_63[13];
} AIPlayerEconomicsSituation;

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
    AIPlayerStrategyInput strategy;
} AIPlayerInputSignal;

typedef union AIPlayerOutputSignal {
    float raw[AI_PLAYER_OUTPUT_WIDTH];
    AIPlayerUnifiedOutput fields;
} AIPlayerOutputSignal;

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus
static_assert(sizeof(AIPlayerUnifiedInput) == AI_PLAYER_BASE_INPUT_WIDTH * sizeof(float), "base AI input must be 1024 floats");
static_assert(sizeof(AIPlayerStrategyInput) == AI_PLAYER_INPUT_WIDTH * sizeof(float), "strategy AI input must be 3524 floats");
static_assert(sizeof(AIPlayerUnifiedOutput) == AI_PLAYER_OUTPUT_WIDTH * sizeof(float), "AI output must be 72 floats");
static_assert(sizeof(AIPlayerStrategyCivilizationObject) == AI_PLAYER_OBJECT_FLOATS * sizeof(float), "strategy civ object must be 120 floats");
static_assert(sizeof(AIPlayerStrategyForceObject) == AI_PLAYER_OBJECT_FLOATS * sizeof(float), "strategy force object must be 120 floats");
static_assert(sizeof(AIPlayerActionCandidateObject) == AI_PLAYER_OBJECT_FLOATS * sizeof(float), "action candidate object must be 120 floats");
static_assert(sizeof(AIPlayerEconomicsCityObject) == AI_PLAYER_OBJECT_FLOATS * sizeof(float), "economics city object must be 120 floats");
static_assert(sizeof(AIPlayerEconomicsSituation) == AI_PLAYER_SITUATION_FLOATS * sizeof(float), "economics situation must be 64 floats");
static_assert(sizeof(AIPlayerStrategySituation) == AI_PLAYER_SITUATION_FLOATS * sizeof(float), "strategy situation must be 64 floats");
static_assert(sizeof(AIPlayerInputSignal) == AI_PLAYER_INPUT_WIDTH * sizeof(float), "input union must be 3524 floats");
static_assert(sizeof(AIPlayerOutputSignal) == AI_PLAYER_OUTPUT_WIDTH * sizeof(float), "output union must be 72 floats");
#endif

#endif
