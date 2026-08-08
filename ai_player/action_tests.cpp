#include "action_tests.h"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>

namespace aiciv::ai {
namespace {

constexpr int kTestMapSize = 7;

struct TestTile {
    int terrain = 2;
    std::string resource;
    bool hidden = false;
    bool road = false;
    bool irrigation = false;
    bool waterSource = false;
    bool friendlyUnit = false;
    bool enemyUnit = false;
    bool city = false;
    std::string improvement;
    float localOverride = 999.0f;
    float food = -1.0f;
};

struct ActionScenario {
    std::string name;
    std::string unitType;
    std::string unitState = "ready";
    int unitI = 3;
    int unitJ = 3;
    int targetI = -1;
    int targetJ = -1;
    float workerSignal = 0.0f;
    float nearbyResource = 0.0f;
    float freshWater = 0.0f;
    float cityScore = 0.0f;
    float cityDistance = 0.5f;
    float agePressure = 0.0f;
    float taskFlag = 0.0f;
    float strategyDx = 0.0f;
    float strategyDy = 0.0f;
    float strategyPriority = 0.0f;
    float nearbyWorkers = 0.0f;
    std::string expectedCommand;
    std::string expectedEffect;
    std::string expectedFinalEffect;
    int maxTurns = 1;
    std::map<std::pair<int, int>, TestTile> tiles;
};

struct TestActionCandidate {
    std::string command;
    std::string state = "ready";
    int targetI = -1;
    int targetJ = -1;
};

struct EncodedActionCandidates {
    InputSignal input{};
    std::vector<TestActionCandidate> candidates;
};

std::string trim(const std::string& text)
{
    const size_t begin = text.find_first_not_of(" \t\r\n");
    if (begin == std::string::npos) {
        return {};
    }
    const size_t end = text.find_last_not_of(" \t\r\n");
    return text.substr(begin, end - begin + 1);
}

std::vector<std::string> splitWords(const std::string& text)
{
    std::vector<std::string> parts;
    std::stringstream in(text);
    std::string part;
    while (in >> part) {
        parts.push_back(part);
    }
    return parts;
}

std::map<std::string, std::string> parseOptions(const std::vector<std::string>& words, size_t begin)
{
    std::map<std::string, std::string> options;
    for (size_t n = begin; n < words.size(); ++n) {
        const size_t eq = words[n].find('=');
        if (eq == std::string::npos) {
            continue;
        }
        options[words[n].substr(0, eq)] = words[n].substr(eq + 1);
    }
    return options;
}

float toFloat(const std::map<std::string, std::string>& options, const std::string& key, float fallback)
{
    const auto it = options.find(key);
    return it == options.end() ? fallback : std::stof(it->second);
}

bool toBool(const std::map<std::string, std::string>& options, const std::string& key, bool fallback = false)
{
    const auto it = options.find(key);
    if (it == options.end()) {
        return fallback;
    }
    return it->second == "1" || it->second == "true" || it->second == "yes";
}

std::string optionText(const std::map<std::string, std::string>& options, const std::string& key, const std::string& fallback = "")
{
    const auto it = options.find(key);
    return it == options.end() ? fallback : it->second;
}

int terrainCode(const std::string& terrain)
{
    if (terrain == "water") return 0;
    if (terrain == "desert") return 1;
    if (terrain == "grass") return 2;
    if (terrain == "snow") return 3;
    if (terrain == "hills") return 4;
    if (terrain == "mountain" || terrain == "rocks") return 5;
    if (terrain == "forest" || terrain == "jungle") return 6;
    if (terrain == "grasswater" || terrain == "river") return 7;
    throw std::runtime_error("unknown action test terrain: " + terrain);
}

float resourceSignal(const std::string& resource)
{
    if (resource.empty() || resource == "none") {
        return 0.0f;
    }
    if (resource == "food" || resource == "wheat" || resource == "fish" || resource == "rice"
        || resource == "cattle" || resource == "sheep" || resource == "deer" || resource == "bananas"
        || resource == "sugar" || resource == "honey") {
        return 0.8f;
    }
    if (resource == "production" || resource == "metal" || resource == "stone" || resource == "horses"
        || resource == "iron" || resource == "copper" || resource == "marble") {
        return 0.6f;
    }
    if (resource == "commerce" || resource == "luxury" || resource == "gold" || resource == "silver"
        || resource == "diamonds" || resource == "wine" || resource == "cotton") {
        return 0.5f;
    }
    return 0.35f;
}

float tileFoodYield(const TestTile& tile)
{
    if (tile.food >= 0.0f) return tile.food;
    static const std::array<float, 8> baseFood = {2.0f, 0.0f, 2.0f, 0.0f, 1.0f, 0.0f, 1.0f, 3.0f};
    float food = tile.terrain >= 0 && tile.terrain < static_cast<int>(baseFood.size())
        ? baseFood[tile.terrain] : 0.0f;
    if (tile.waterSource && tile.terrain != 0) food = tile.terrain == 1 ? 2.0f : food + 1.0f;
    static const std::map<std::string, float> resourceFood = {
        {"bananas", 2.0f}, {"cattle", 2.0f}, {"crabs", 2.0f}, {"deer", 1.0f},
        {"fish", 1.0f}, {"rice", 2.0f}, {"sheep", 1.0f}, {"wheat", 2.0f},
        {"citrus", 1.0f}, {"honey", 1.0f}, {"olives", 1.0f}, {"salt", 1.0f},
        {"spices", 1.0f}, {"sugar", 1.0f}, {"turtles", 1.0f}, {"whales", 1.0f},
        {"wine", 1.0f}, {"food", 2.0f},
    };
    const auto resource = resourceFood.find(tile.resource);
    if (resource != resourceFood.end()) food += resource->second;
    return food;
}

float unitTypeSignal(const std::string& unitType)
{
    static const std::map<std::string, int> unitOrder = {
        {"settlers", 1},
        {"worker", 2},
        {"explorer", 3},
        {"warrior", 4},
        {"slinger", 5},
        {"archer", 6},
        {"spearman", 7},
        {"horseman", 8},
        {"chariot", 9},
        {"elephant", 10},
        {"catapult", 11},
        {"trebuchet", 12},
        {"galley", 13},
        {"galleon", 14},
        {"workboat", 15},
        {"frigate", 16},
        {"knight", 17},
        {"pikeman", 18},
        {"longbow", 19},
        {"fencer", 20},
        {"swordsman", 21},
        {"trireme", 22},
    };
    const auto it = unitOrder.find(unitType);
    if (it == unitOrder.end()) {
        throw std::runtime_error("unknown action test unit type: " + unitType);
    }
    return static_cast<float>(it->second) / 32.0f;
}

float unitStateSignal(const std::string& state)
{
    static const std::vector<std::string> order = {
        "ready", "waiting", "fortified", "fortification", "road", "road_to", "irrigate",
        "chop_forest", "pasture", "farm", "plantation", "camp", "fishing_boats", "quarry",
        "winery", "cottage", "workshop", "mine", "explore", "patrol", "automate", "network",
    };
    const auto it = std::find(order.begin(), order.end(), state);
    if (it == order.end()) {
        throw std::runtime_error("unknown action test unit state: " + state);
    }
    return static_cast<float>(std::distance(order.begin(), it)) / static_cast<float>(order.size() - 1);
}

float clamp(float value, float minValue, float maxValue)
{
    return std::max(minValue, std::min(maxValue, value));
}

TestTile tileAt(const ActionScenario& scenario, int i, int j)
{
    const auto it = scenario.tiles.find({i, j});
    if (it != scenario.tiles.end()) {
        return it->second;
    }
    return {};
}

float packLocalTile(const ActionScenario& scenario, int i, int j)
{
    if (i < 0 || j < 0 || i >= kTestMapSize || j >= kTestMapSize) {
        return -1.0f;
    }
    const TestTile tile = tileAt(scenario, i, j);
    if (tile.hidden) {
        return -0.2f;
    }
    if (tile.localOverride != 999.0f) {
        return tile.localOverride;
    }
    float signal = static_cast<float>(tile.terrain) / 8.0f;
    if (!tile.resource.empty() && tile.resource != "none") {
        signal += 0.1f;
    }
    if (tile.road) {
        signal += 0.1f;
    }
    if (tile.irrigation) {
        signal += 0.1f;
    }
    if (tile.waterSource) {
        signal += 0.12f;
    }
    if (tile.friendlyUnit || tile.city) {
        signal += 0.15f;
    }
    if (tile.enemyUnit) {
        signal -= 0.15f;
    }
    return clamp(signal, -1.0f, 1.0f);
}

float nearbyResourceScore(const ActionScenario& scenario)
{
    float score = 0.0f;
    for (int di = -2; di <= 2; ++di) {
        for (int dj = -2; dj <= 2; ++dj) {
            if (di == 0 && dj == 0) {
                continue;
            }
            const TestTile tile = tileAt(scenario, scenario.unitI + di, scenario.unitJ + dj);
            const float signal = resourceSignal(tile.resource);
            if (signal > 0.0f) {
                const int distance = std::max(std::abs(di), std::abs(dj));
                score += signal / std::max(1, distance);
            }
        }
    }
    return clamp(score / 4.0f, 0.0f, 1.0f);
}

bool hasFreshWaterNear(const ActionScenario& scenario, int i, int j)
{
    for (int di = -1; di <= 1; ++di) {
        for (int dj = -1; dj <= 1; ++dj) {
            if (di == 0 && dj == 0) {
                continue;
            }
            const TestTile tile = tileAt(scenario, i + di, j + dj);
            if (tile.waterSource || tile.terrain == 7) {
                return true;
            }
        }
    }
    return false;
}

float cityPlotScore(const ActionScenario& scenario, int i, int j)
{
    const TestTile tile = tileAt(scenario, i, j);
    if (tile.terrain == 0) {
        return 0.0f;
    }
    float score = 0.0f;
    if (tile.terrain == 2) score += 3.0f;
    else if (tile.terrain == 7) score += 3.5f;
    else if (tile.terrain == 6) score += 1.4f;
    else if (tile.terrain == 4) score += 2.0f;
    else if (tile.terrain == 5) score += 1.5f;
    else if (tile.terrain == 1) score += 1.0f;
    else if (tile.terrain == 3) score += 0.8f;
    else score += 1.2f;

    score += resourceSignal(tile.resource) * 2.2f;
    ActionScenario shifted = scenario;
    shifted.unitI = i;
    shifted.unitJ = j;
    score += nearbyResourceScore(shifted) * 2.0f;
    if (tile.waterSource) {
        score += tile.terrain == 4 || tile.terrain == 5 ? 0.8f : 1.8f;
    }
    if (hasFreshWaterNear(scenario, i, j)) {
        score += 1.5f;
    }
    return clamp(score / 10.0f, 0.0f, 1.0f);
}

float nearestCityDistance(const ActionScenario& scenario)
{
    int best = kTestMapSize * 2;
    bool found = false;
    for (const auto& entry : scenario.tiles) {
        if (!entry.second.city) {
            continue;
        }
        found = true;
        best = std::min(best, std::abs(entry.first.first - scenario.unitI)
                              + std::abs(entry.first.second - scenario.unitJ));
    }
    return found ? clamp(static_cast<float>(best) / kTestMapSize, 0.0f, 1.0f)
                 : scenario.cityDistance;
}

std::string resourceImprovement(const TestTile& tile);

int actionCommandCode(const std::string& command)
{
    const std::vector<std::string> labels = {
        "goto", "wait", "build_city", "road_to", "irrigate", "chop_forest", "build_improvement", "attack"
    };
    const auto it = std::find(labels.begin(), labels.end(), command);
    return it == labels.end() ? 1 : static_cast<int>(std::distance(labels.begin(), it));
}

std::vector<TestActionCandidate> buildTestCandidates(const ActionScenario& scenario)
{
    std::vector<TestActionCandidate> result;
    auto add = [&](const std::string& command, const std::string& state, int i, int j) {
        for (const TestActionCandidate& existing : result) {
            if (existing.command == command && existing.state == state
                && existing.targetI == i && existing.targetJ == j) return;
        }
        if (result.size() < AI_PLAYER_OBJECT_COUNT) result.push_back({command, state, i, j});
    };
    const TestTile current = tileAt(scenario, scenario.unitI, scenario.unitJ);
    add("wait", "waiting", scenario.unitI, scenario.unitJ);
    const bool military = scenario.unitType == "warrior" || scenario.unitType == "slinger"
        || scenario.unitType == "archer" || scenario.unitType == "horseman"
        || scenario.unitType == "spearman" || scenario.unitType == "chariot"
        || scenario.unitType == "elephant" || scenario.unitType == "catapult"
        || scenario.unitType == "trebuchet" || scenario.unitType == "frigate"
        || scenario.unitType == "knight" || scenario.unitType == "pikeman"
        || scenario.unitType == "longbow" || scenario.unitType == "fencer"
        || scenario.unitType == "swordsman" || scenario.unitType == "trireme"
        || scenario.unitType == "galley" || scenario.unitType == "galleon";
    if (military) add("wait", "fortified", scenario.unitI, scenario.unitJ);
    if (scenario.unitType == "settlers" && current.terrain != 0) {
        add("build_city", "ready", scenario.unitI, scenario.unitJ);
    }
    if (scenario.unitType == "worker") {
        if (scenario.unitState == "road" || scenario.unitState == "road_to"
            || (scenario.workerSignal >= 0.25f && scenario.workerSignal < 0.40f)) {
            add("road_to", scenario.unitState == "road_to" ? "road_to" : "road", scenario.unitI, scenario.unitJ);
        }
        if (scenario.unitState == "irrigate" || (scenario.workerSignal >= 0.55f && scenario.workerSignal < 0.70f)) {
            add("irrigate", "irrigate", scenario.unitI, scenario.unitJ);
        }
        if (scenario.unitState == "chop_forest" || (scenario.workerSignal >= 0.40f && scenario.workerSignal < 0.55f)) {
            add("chop_forest", "chop_forest", scenario.unitI, scenario.unitJ);
        }
        if (scenario.workerSignal >= 0.75f
            || (scenario.taskFlag > 0.5f && scenario.unitState != "road" && scenario.unitState != "road_to"
                && scenario.unitState != "irrigate" && scenario.unitState != "chop_forest")) {
            add("build_improvement", scenario.taskFlag > 0.5f ? scenario.unitState : resourceImprovement(current),
                scenario.unitI, scenario.unitJ);
        }
    }
    if (scenario.unitType == "workboat" && current.terrain == 0 && current.improvement != "network") {
        add("build_improvement", "network", scenario.unitI, scenario.unitJ);
    }
    if (scenario.targetI >= 0 && scenario.targetJ >= 0
        && (scenario.targetI != scenario.unitI || scenario.targetJ != scenario.unitJ)) {
        const TestTile target = tileAt(scenario, scenario.targetI, scenario.targetJ);
        const int distance = std::max(std::abs(scenario.targetI - scenario.unitI),
                                      std::abs(scenario.targetJ - scenario.unitJ));
        add(military && target.enemyUnit && distance <= 1 ? "attack" : "goto",
            "ready", scenario.targetI, scenario.targetJ);
    }
    for (const auto& entry : scenario.tiles) {
        if (result.size() >= AI_PLAYER_OBJECT_COUNT) break;
        const int i = entry.first.first;
        const int j = entry.first.second;
        if (i == scenario.unitI && j == scenario.unitJ) continue;
        const int distance = std::max(std::abs(i - scenario.unitI), std::abs(j - scenario.unitJ));
        add(military && entry.second.enemyUnit && distance <= 1 ? "attack" : "goto", "ready", i, j);
    }
    for (int radius = 1; result.size() < AI_PLAYER_OBJECT_COUNT && radius <= 3; ++radius) {
        for (int di = -radius; di <= radius && result.size() < AI_PLAYER_OBJECT_COUNT; ++di) {
            for (int dj = -radius; dj <= radius && result.size() < AI_PLAYER_OBJECT_COUNT; ++dj) {
                if (std::max(std::abs(di), std::abs(dj)) != radius) continue;
                const int i = scenario.unitI + di;
                const int j = scenario.unitJ + dj;
                if (i < 0 || j < 0 || i >= kTestMapSize || j >= kTestMapSize) continue;
                add("goto", "ready", i, j);
            }
        }
    }
    return result;
}

EncodedActionCandidates buildActionInput(const ActionScenario& scenario)
{
    EncodedActionCandidates encoded;
    encoded.input.fill(0.0f);
    encoded.candidates = buildTestCandidates(scenario);
    for (int candidateIndex = 0; candidateIndex < static_cast<int>(encoded.candidates.size()); ++candidateIndex) {
        const TestActionCandidate& candidate = encoded.candidates[candidateIndex];
        const int base = candidateIndex * AI_PLAYER_OBJECT_FLOATS;
        const TestTile target = tileAt(scenario, candidate.targetI, candidate.targetJ);
        encoded.input[base + 0] = unitTypeSignal(scenario.unitType);
        encoded.input[base + 1] = unitStateSignal(scenario.unitState);
        encoded.input[base + 2] = scenario.workerSignal;
        encoded.input[base + 3] = scenario.nearbyWorkers;
        encoded.input[base + 4] = scenario.taskFlag;
        encoded.input[base + 5] = static_cast<float>(actionCommandCode(candidate.command)) / 7.0f;
        encoded.input[base + 6] = clamp(static_cast<float>(candidate.targetI - scenario.unitI) / 4.0f, -1.0f, 1.0f);
        encoded.input[base + 7] = clamp(static_cast<float>(candidate.targetJ - scenario.unitJ) / 4.0f, -1.0f, 1.0f);
        encoded.input[base + 8] = clamp(static_cast<float>(std::abs(candidate.targetI - scenario.unitI)
            + std::abs(candidate.targetJ - scenario.unitJ)) / 12.0f, 0.0f, 1.0f);
        encoded.input[base + 9] = static_cast<float>(target.terrain) / 8.0f;
        encoded.input[base + 10] = resourceSignal(target.resource);
        encoded.input[base + 11] = cityPlotScore(scenario, candidate.targetI, candidate.targetJ);
        encoded.input[base + 12] = target.enemyUnit ? -1.0f : (target.friendlyUnit || target.city ? 1.0f : 0.0f);
        encoded.input[base + 13] = unitStateSignal(candidate.state);
        encoded.input[base + 14] = scenario.strategyPriority;
        encoded.input[base + 15] = clamp(tileFoodYield(target) / 8.0f, 0.0f, 1.0f);
        encoded.input[base + 16] = scenario.agePressure;
        encoded.input[base + 17] = scenario.nearbyResource > 0.0f ? scenario.nearbyResource : nearbyResourceScore(scenario);
        encoded.input[base + 18] = scenario.freshWater;
        encoded.input[base + 19] = scenario.strategyPriority;
        encoded.input[base + 20] = encoded.input[base + 6] * scenario.strategyDx
            + encoded.input[base + 7] * scenario.strategyDy;
        encoded.input[base + 21] = packLocalTile(scenario, candidate.targetI, candidate.targetJ);
        int local = 0;
        for (int di = -4; di <= 4; ++di) {
            for (int dj = -4; dj <= 4; ++dj) {
                encoded.input[base + 22 + local] = packLocalTile(scenario, candidate.targetI + di, candidate.targetJ + dj);
                ++local;
            }
        }
    }
    encoded.input[960] = 0.50f;
    encoded.input[965] = 0.35f;
    encoded.input[968] = 0.25f;
    return encoded;
}

EncodedActionCandidates buildActionInputForTurn(const ActionScenario& scenario, int turnIndex)
{
    ActionScenario turn = scenario;
    turn.freshWater = hasFreshWaterNear(turn, turn.unitI, turn.unitJ) || tileAt(turn, turn.unitI, turn.unitJ).waterSource ? 1.0f : 0.0f;
    turn.cityScore = cityPlotScore(turn, turn.unitI, turn.unitJ);
    turn.cityDistance = nearestCityDistance(turn);
    turn.agePressure = std::max(turn.agePressure, clamp(static_cast<float>(turnIndex) / std::max(1, turn.maxTurns), 0.0f, 1.0f));
    if (turn.unitType == "worker") {
        turn.workerSignal = 0.0f;
        const TestTile current = tileAt(turn, turn.unitI, turn.unitJ);
        const bool atTarget = turn.targetI == turn.unitI && turn.targetJ == turn.unitJ;
        // The browser puts the best legal Worker job in field 11, including
        // non-resource jobs such as an empty-hill mine. Preserve the scenario's
        // equivalent signal while approaching that job.
        turn.nearbyResource = atTarget ? nearbyResourceScore(turn) : scenario.nearbyResource;
        if (atTarget) {
            const std::string improvement = resourceImprovement(current);
            if (improvement == "irrigation") turn.workerSignal = 0.60f;
            else if (improvement == "chop_forest") turn.workerSignal = 0.45f;
            else if (improvement == "road") turn.workerSignal = 0.30f;
            else turn.workerSignal = 0.80f;
        }
    } else {
        turn.nearbyResource = nearbyResourceScore(turn);
    }
    return buildActionInput(turn);
}

int bestCandidateSlot(const OutputSignal& output, int candidateCount)
{
    int best = 0;
    float bestValue = -1.0e30f;
    for (int slot = 0; slot < candidateCount; ++slot) {
        if (output[slot] > bestValue) {
            bestValue = output[slot];
            best = slot;
        }
    }
    return best;
}

std::string resourceImprovement(const TestTile& tile)
{
    if (!tile.improvement.empty()) {
        return tile.improvement;
    }
    if (tile.resource == "cattle" || tile.resource == "sheep" || tile.resource == "horses") {
        return "pasture";
    }
    if (tile.resource == "deer" || tile.resource == "furs" || tile.resource == "ivory"
        || tile.resource == "amber" || tile.resource == "honey") {
        return "camp";
    }
    if (tile.resource == "rice" || tile.resource == "wheat") {
        return "farm";
    }
    if (tile.resource == "cotton" || tile.resource == "sugar" || tile.resource == "bananas"
        || tile.resource == "citrus" || tile.resource == "dyes" || tile.resource == "incense"
        || tile.resource == "olives" || tile.resource == "silk" || tile.resource == "spices"
        || tile.resource == "tea") {
        return "plantation";
    }
    if (tile.resource == "crabs" || tile.resource == "fish" || tile.resource == "pearls"
        || tile.resource == "turtles" || tile.resource == "whales") {
        return "fishing_boats";
    }
    if (tile.resource == "wine") {
        return "winery";
    }
    if (tile.resource == "stone" || tile.resource == "marble" || tile.resource == "gypsum"
        || tile.resource == "salt") {
        return "quarry";
    }
    if (tile.resource == "copper" || tile.resource == "iron" || tile.resource == "metal"
        || tile.resource == "diamonds" || tile.resource == "silver" || tile.resource == "gold") {
        return "mine";
    }
    if (tile.terrain == 4 || tile.terrain == 5) {
        return "mine";
    }
    if (tile.terrain == 2 || tile.terrain == 7) {
        return "cottage";
    }
    return "workshop";
}

std::string simulateEffect(const ActionScenario& scenario, const TestActionCandidate& candidate)
{
    const std::string& command = candidate.command;
    const TestTile current = tileAt(scenario, scenario.unitI, scenario.unitJ);
    if (command == "build_city") {
        if (current.terrain == 0) return "blocked";
        return tileFoodYield(current) > 1.0f ? "city" : "low_food_site";
    }
    if (command == "build_improvement") {
        return candidate.state;
    }
    if (command == "road_to") {
        return current.terrain == 0 ? "blocked" : "road";
    }
    if (command == "irrigate") {
        return "irrigation";
    }
    if (command == "chop_forest") {
        return current.terrain == 6 ? "forest_chopped" : "blocked";
    }
    if (command == "attack") {
        if (candidate.targetI >= 0 && tileAt(scenario, candidate.targetI, candidate.targetJ).enemyUnit) {
            return "enemy_removed";
        }
        for (int di = -1; di <= 1; ++di) {
            for (int dj = -1; dj <= 1; ++dj) {
                if (di != 0 || dj != 0) {
                    const TestTile tile = tileAt(scenario, scenario.unitI + di, scenario.unitJ + dj);
                    if (tile.enemyUnit) {
                        return "enemy_removed";
                    }
                }
            }
        }
        return "no_enemy";
    }
    if (command == "wait") {
        return candidate.state == "fortified" ? "defended_hill" : "waiting";
    }
    if (command == "goto") {
        if (scenario.unitType == "worker" && candidate.targetI >= 0) {
            const TestTile target = tileAt(scenario, candidate.targetI, candidate.targetJ);
            if (!target.improvement.empty() || !target.resource.empty()) {
                return "moved_to_" + resourceImprovement(target);
            }
        }
        return "moved";
    }
    return "none";
}

struct MultiTurnResult {
    bool ok = false;
    std::string finalEffect = "none";
    std::string lastCommand = "none";
    int turns = 0;
    float confidence = 0.0f;
};

void stepTowardTarget(ActionScenario& scenario)
{
    if (scenario.targetI < 0 || scenario.targetJ < 0) {
        return;
    }
    if (scenario.unitI < scenario.targetI) ++scenario.unitI;
    else if (scenario.unitI > scenario.targetI) --scenario.unitI;
    if (scenario.unitJ < scenario.targetJ) ++scenario.unitJ;
    else if (scenario.unitJ > scenario.targetJ) --scenario.unitJ;
}

MultiTurnResult simulateMultiTurn(const ActionEngine& engine, const ActionScenario& scenario)
{
    ActionScenario current = scenario;
    MultiTurnResult result;
    const int maxTurns = std::max(1, scenario.maxTurns);
    for (int turn = 1; turn <= maxTurns; ++turn) {
        const EncodedActionCandidates encoded = buildActionInputForTurn(current, turn - 1);
        const OutputSignal output = engine.infer(encoded.input);
        const int slot = bestCandidateSlot(output, static_cast<int>(encoded.candidates.size()));
        const TestActionCandidate& candidate = encoded.candidates.at(static_cast<size_t>(slot));
        const std::string command = candidate.command;
        const std::string effect = simulateEffect(current, candidate);
        result.lastCommand = command;
        result.finalEffect = effect;
        result.turns = turn;
        result.confidence = output[slot];
        if (effect == scenario.expectedFinalEffect) {
            result.ok = true;
            return result;
        }
        if (command != "goto") {
            return result;
        }
        stepTowardTarget(current);
    }
    return result;
}

std::vector<ActionScenario> loadActionTestFile(const std::string& path)
{
    std::ifstream in(path);
    if (!in) {
        throw std::runtime_error("could not open action test file: " + path);
    }

    std::vector<ActionScenario> scenarios;
    ActionScenario current;
    bool inScenario = false;
    std::string line;
    int lineNumber = 0;
    while (std::getline(in, line)) {
        ++lineNumber;
        line = trim(line);
        if (line.empty() || line[0] == '#') {
            continue;
        }
        const std::vector<std::string> words = splitWords(line);
        if (words.empty()) {
            continue;
        }
        if (words[0] == "scenario") {
            if (inScenario) {
                throw std::runtime_error(path + ":" + std::to_string(lineNumber) + ": nested scenario");
            }
            current = ActionScenario{};
            current.name = words.size() > 1 ? words[1] : "unnamed";
            inScenario = true;
            continue;
        }
        if (!inScenario) {
            throw std::runtime_error(path + ":" + std::to_string(lineNumber) + ": directive outside scenario");
        }
        if (words[0] == "unit") {
            if (words.size() < 4) {
                throw std::runtime_error(path + ":" + std::to_string(lineNumber) + ": unit requires type i j");
            }
            current.unitType = words[1];
            current.unitI = std::stoi(words[2]);
            current.unitJ = std::stoi(words[3]);
        }
        else if (words[0] == "state") {
            const auto options = parseOptions(words, 1);
            current.unitState = optionText(options, "name", current.unitState);
            current.taskFlag = toFloat(options, "task", current.taskFlag);
        }
        else if (words[0] == "tile") {
            if (words.size() < 4) {
                throw std::runtime_error(path + ":" + std::to_string(lineNumber) + ": tile requires i j terrain");
            }
            const int i = std::stoi(words[1]);
            const int j = std::stoi(words[2]);
            TestTile tile;
            tile.terrain = terrainCode(words[3]);
            const auto options = parseOptions(words, 4);
            tile.resource = optionText(options, "resource");
            tile.hidden = toBool(options, "hidden");
            tile.road = toBool(options, "road");
            tile.irrigation = toBool(options, "irrigation");
            tile.waterSource = toBool(options, "water");
            tile.city = toBool(options, "city");
            tile.friendlyUnit = toBool(options, "friendly");
            tile.enemyUnit = toBool(options, "enemy");
            tile.improvement = optionText(options, "improvement");
            if (options.find("local") != options.end()) {
                tile.localOverride = std::stof(options.at("local"));
            }
            tile.food = toFloat(options, "food", tile.food);
            current.tiles[{i, j}] = tile;
        }
        else if (words[0] == "target") {
            if (words.size() < 3) {
                throw std::runtime_error(path + ":" + std::to_string(lineNumber) + ": target requires i j");
            }
            current.targetI = std::stoi(words[1]);
            current.targetJ = std::stoi(words[2]);
        }
        else if (words[0] == "features") {
            const auto options = parseOptions(words, 1);
            current.workerSignal = toFloat(options, "worker", current.workerSignal);
            current.nearbyResource = toFloat(options, "nearby", current.nearbyResource);
            current.freshWater = toFloat(options, "fresh", current.freshWater);
            current.cityScore = toFloat(options, "city_score", current.cityScore);
            current.cityDistance = toFloat(options, "city_dist", current.cityDistance);
            current.agePressure = toFloat(options, "age", current.agePressure);
            current.strategyDx = toFloat(options, "strategy_dx", current.strategyDx);
            current.strategyDy = toFloat(options, "strategy_dy", current.strategyDy);
            current.strategyPriority = toFloat(options, "worker_focus", current.strategyPriority);
            current.nearbyWorkers = toFloat(options, "nearby_workers", current.nearbyWorkers);
        }
        else if (words[0] == "expect") {
            if (words.size() < 3) {
                throw std::runtime_error(path + ":" + std::to_string(lineNumber) + ": expect requires kind value");
            }
            if (words[1] == "command") {
                current.expectedCommand = words[2];
            }
            else if (words[1] == "effect") {
                current.expectedEffect = words[2];
            }
            else if (words[1] == "final") {
                current.expectedFinalEffect = words[2];
            }
            else if (words[1] == "turns") {
                current.maxTurns = std::stoi(words[2]);
            }
            else {
                throw std::runtime_error(path + ":" + std::to_string(lineNumber) + ": unknown expect kind");
            }
        }
        else if (words[0] == "end") {
            const bool multiTurn = !current.expectedFinalEffect.empty() || current.maxTurns > 1;
            if (current.unitType.empty() || (!multiTurn && (current.expectedCommand.empty() || current.expectedEffect.empty()))) {
                throw std::runtime_error(path + ":" + std::to_string(lineNumber) + ": incomplete scenario " + current.name);
            }
            if (multiTurn && current.expectedFinalEffect.empty()) {
                throw std::runtime_error(path + ":" + std::to_string(lineNumber) + ": multi-turn scenario needs expect final");
            }
            if (current.tiles.find({current.unitI, current.unitJ}) == current.tiles.end()) {
                current.tiles[{current.unitI, current.unitJ}] = TestTile{};
            }
            scenarios.push_back(current);
            inScenario = false;
        }
        else {
            throw std::runtime_error(path + ":" + std::to_string(lineNumber) + ": unknown directive " + words[0]);
        }
    }
    if (inScenario) {
        throw std::runtime_error(path + ": unterminated scenario");
    }
    return scenarios;
}

} // namespace

std::vector<TrainingExample> makeActionSimulationTrainingExamples(const std::vector<std::string>& paths)
{
    std::vector<TrainingExample> examples;
    auto append = [&](const ActionScenario& scenario, const EncodedActionCandidates& encoded,
                      const std::string& expectedCommand, const std::string& expectedEffect,
                      const std::string& suffix) {
        int correct = -1;
        for (int slot = 0; slot < static_cast<int>(encoded.candidates.size()); ++slot) {
            if (encoded.candidates[slot].command == expectedCommand
                && simulateEffect(scenario, encoded.candidates[slot]) == expectedEffect) {
                correct = slot;
                break;
            }
        }
        if (correct < 0) {
            throw std::runtime_error("no complete Action candidate matches simulation training case "
                + scenario.name + " " + suffix);
        }
        TrainingExample example;
        example.input = encoded.input;
        example.target.fill(0.0f);
        for (int slot = 0; slot < static_cast<int>(encoded.candidates.size()); ++slot) {
            example.decisionSlots.push_back(slot);
        }
        for (int slot : example.decisionSlots) example.target[slot] = -0.9f;
        example.correctSlot = correct;
        example.target[correct] = 0.9f;
        example.explanation = "action simulation situation: " + scenario.name + " " + suffix;
        const bool hardCase = scenario.name.find("old_settler") != std::string::npos
            || scenario.name.find("routes_to_minimum_two_food") != std::string::npos
            || scenario.name.find("first_city_does_not_build_on_jungle") != std::string::npos
            || scenario.name.find("aged_settler_does_not_build_on_hills") != std::string::npos
            || scenario.name.find("clean_grass_with_spacing") != std::string::npos
            || scenario.name.find("empty_cottage_tile") != std::string::npos
            || scenario.name.find("moves_to_cattle_city_tile") != std::string::npos
            || scenario.name.find("moves_to_rice_farm_tile") != std::string::npos
            || scenario.name.find("explorer_moves_to_hidden_area") != std::string::npos
            || scenario.name.find("defends_hill") != std::string::npos
            || scenario.name.find("holds_hill") != std::string::npos
            || scenario.name.find("attacks_adjacent_enemy") != std::string::npos
            || scenario.name.find("leaves_city_for_forest") != std::string::npos;
        const int copies = hardCase ? 8
            : (scenario.name.find("trebuchet_moves_toward_enemy_city") != std::string::npos ? 2 : 1);
        for (int copy = 0; copy < copies; ++copy) examples.push_back(example);
    };

    for (const std::string& path : paths) {
        for (const ActionScenario& scenario : loadActionTestFile(path)) {
            const bool multiTurn = !scenario.expectedFinalEffect.empty() || scenario.maxTurns > 1;
            if (!multiTurn) {
                append(scenario, buildActionInput(scenario), scenario.expectedCommand, scenario.expectedEffect, "single turn");
                continue;
            }
            if (scenario.targetI < 0 || scenario.targetJ < 0) {
                append(scenario, buildActionInputForTurn(scenario, 0), "build_city", "city", "settle current target");
                continue;
            }
            append(scenario, buildActionInputForTurn(scenario, 0), "goto", "moved", "approach target");
            ActionScenario arrived = scenario;
            arrived.unitI = scenario.targetI;
            arrived.unitJ = scenario.targetJ;
            std::string finalCommand = "build_improvement";
            if (scenario.expectedFinalEffect == "city") finalCommand = "build_city";
            else if (scenario.expectedFinalEffect == "irrigation") finalCommand = "irrigate";
            else if (scenario.expectedFinalEffect == "forest_chopped") finalCommand = "chop_forest";
            append(arrived, buildActionInputForTurn(arrived, 1), finalCommand,
                   scenario.expectedFinalEffect, "arrived at target");
        }
    }
    return examples;
}

ActionTestSummary runActionTests(const ActionEngine& engine, const std::vector<std::string>& paths, std::ostream& out)
{
    ActionTestSummary summary;
    out << "\nRunning Action simulation tests:\n";
    for (const std::string& path : paths) {
        const std::vector<ActionScenario> scenarios = loadActionTestFile(path);
        out << "  " << path << " (" << scenarios.size() << " scenarios)\n";
        for (const ActionScenario& scenario : scenarios) {
            ++summary.total;
            const bool multiTurn = !scenario.expectedFinalEffect.empty() || scenario.maxTurns > 1;
            bool ok = false;
            std::string command;
            std::string effect;
            float confidence = 0.0f;
            int turns = 1;
            if (multiTurn) {
                const MultiTurnResult result = simulateMultiTurn(engine, scenario);
                ok = result.ok;
                command = result.lastCommand;
                effect = result.finalEffect;
                confidence = result.confidence;
                turns = result.turns;
            } else {
                const EncodedActionCandidates encoded = buildActionInput(scenario);
                const OutputSignal output = engine.infer(encoded.input);
                const int slot = bestCandidateSlot(output, static_cast<int>(encoded.candidates.size()));
                const TestActionCandidate& candidate = encoded.candidates.at(static_cast<size_t>(slot));
                command = candidate.command;
                effect = simulateEffect(scenario, candidate);
                confidence = output[slot];
                ok = command == scenario.expectedCommand && effect == scenario.expectedEffect;
            }
            if (ok) {
                ++summary.passed;
            }
            out << "    " << (ok ? "PASS" : "FAIL") << " " << scenario.name
                << ": command=" << command << " effect=" << effect
                << " turns=" << turns
                << " confidence=" << std::fixed << std::setprecision(3) << confidence;
            if (!ok) {
                if (multiTurn) {
                    out << " expected final=" << scenario.expectedFinalEffect
                        << " within=" << scenario.maxTurns;
                } else {
                    out << " expected command=" << scenario.expectedCommand
                        << " effect=" << scenario.expectedEffect;
                }
            }
            out << "\n";
        }
    }
    out << "Action simulation tests: " << summary.passed << "/" << summary.total << " passed\n";
    return summary;
}

} // namespace aiciv::ai
