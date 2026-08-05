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
        "winery", "cottage", "workshop", "mine", "explore", "patrol", "automate",
    };
    const auto it = std::find(order.begin(), order.end(), state);
    if (it == order.end()) {
        throw std::runtime_error("unknown action test unit state: " + state);
    }
    return static_cast<float>(std::distance(order.begin(), it)) / static_cast<float>(order.size() - 1);
}

float normalizedCoord(int coord)
{
    return std::max(-1.0f, std::min(1.0f, (static_cast<float>(coord) / (kTestMapSize - 1)) * 2.0f - 1.0f));
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

InputSignal buildActionInput(const ActionScenario& scenario)
{
    InputSignal input{};
    input.fill(0.0f);
    const TestTile current = tileAt(scenario, scenario.unitI, scenario.unitJ);

    input[0] = unitTypeSignal(scenario.unitType);
    input[1] = unitStateSignal(scenario.unitState);
    input[2] = normalizedCoord(scenario.unitI);
    input[3] = normalizedCoord(scenario.unitJ);
    input[4] = 1.0f;
    input[5] = scenario.unitType == "explorer" || scenario.unitType == "horseman" ? 0.4f : 0.2f;
    input[6] = 1.0f;
    input[7] = scenario.taskFlag;
    input[8] = scenario.workerSignal;
    input[9] = static_cast<float>(current.terrain) / 8.0f;
    input[10] = resourceSignal(current.resource);
    input[11] = scenario.nearbyResource > 0.0f ? scenario.nearbyResource : nearbyResourceScore(scenario);
    input[12] = scenario.freshWater;
    input[13] = scenario.cityScore;
    input[14] = scenario.agePressure;
    input[15] = scenario.cityDistance;

    int n = 0;
    for (int di = -4; di <= 4; ++di) {
        for (int dj = -4; dj <= 4; ++dj) {
            input[16 + n] = packLocalTile(scenario, scenario.unitI + di, scenario.unitJ + dj);
            ++n;
        }
    }

    input[97] = scenario.strategyDx;
    input[98] = scenario.strategyDy;
    input[100] = scenario.strategyPriority;
    input[101] = scenario.nearbyWorkers;

    input[960] = 0.50f;
    input[965] = 0.35f;
    input[968] = 0.25f;
    return input;
}

std::string resourceImprovement(const TestTile& tile);

InputSignal buildActionInputForTurn(const ActionScenario& scenario, int turnIndex)
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

std::vector<std::string> actionLabels()
{
    return { "goto", "wait", "build_city", "road_to", "irrigate", "chop_forest", "build_improvement", "attack" };
}

std::vector<int> legalCommandSlots(const std::string& unitType)
{
    if (unitType == "settlers") {
        return {0, 1, 2};
    }
    if (unitType == "worker") {
        return {0, 1, 3, 4, 5, 6};
    }
    if (unitType == "explorer") {
        return {0, 1};
    }
    if (unitType == "warrior" || unitType == "slinger" || unitType == "archer" || unitType == "horseman"
        || unitType == "spearman" || unitType == "chariot" || unitType == "elephant"
        || unitType == "catapult" || unitType == "trebuchet") {
        return {0, 1, 7};
    }
    return {0, 1};
}

int bestCommandSlot(const OutputSignal& output, const std::string& unitType)
{
    const std::vector<int> slots = legalCommandSlots(unitType);
    int best = slots.front();
    float bestValue = -1.0e30f;
    for (int slot : slots) {
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

std::string simulateEffect(const ActionScenario& scenario, const std::string& command)
{
    const TestTile current = tileAt(scenario, scenario.unitI, scenario.unitJ);
    if (command == "build_city") {
        return current.terrain == 0 ? "blocked" : "city";
    }
    if (command == "build_improvement") {
        return resourceImprovement(current);
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
        if (scenario.targetI >= 0 && tileAt(scenario, scenario.targetI, scenario.targetJ).enemyUnit) {
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
        return (current.terrain == 4 || current.terrain == 5) ? "defended_hill" : "waiting";
    }
    if (command == "goto") {
        if (scenario.unitType == "worker" && scenario.targetI >= 0) {
            const TestTile target = tileAt(scenario, scenario.targetI, scenario.targetJ);
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

MultiTurnResult simulateMultiTurn(const ActionEngine& engine, const ActionScenario& scenario, const std::vector<std::string>& labels)
{
    ActionScenario current = scenario;
    MultiTurnResult result;
    const int maxTurns = std::max(1, scenario.maxTurns);
    for (int turn = 1; turn <= maxTurns; ++turn) {
        const InputSignal input = buildActionInputForTurn(current, turn - 1);
        const OutputSignal output = engine.infer(input);
        const int slot = bestCommandSlot(output, current.unitType);
        const std::string command = labels.at(static_cast<size_t>(slot));
        const std::string effect = simulateEffect(current, command);
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

ActionTestSummary runActionTests(const ActionEngine& engine, const std::vector<std::string>& paths, std::ostream& out)
{
    const std::vector<std::string> labels = actionLabels();
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
                const MultiTurnResult result = simulateMultiTurn(engine, scenario, labels);
                ok = result.ok;
                command = result.lastCommand;
                effect = result.finalEffect;
                confidence = result.confidence;
                turns = result.turns;
            } else {
                const InputSignal input = buildActionInput(scenario);
                const OutputSignal output = engine.infer(input);
                const int slot = bestCommandSlot(output, scenario.unitType);
                command = labels.at(static_cast<size_t>(slot));
                effect = simulateEffect(scenario, command);
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
