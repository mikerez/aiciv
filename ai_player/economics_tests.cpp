#include "economics_tests.h"

#include <algorithm>
#include <array>
#include <fstream>
#include <iomanip>
#include <map>
#include <sstream>
#include <stdexcept>

namespace aiciv::ai {
namespace {

struct EconomicsScenario {
    std::string name;
    int record = 0;
    float population = 0.20f;
    float food = 0.40f;
    float production = 0.40f;
    float money = 0.25f;
    float frontier = 0.50f;
    float seaside = 0.0f;
    float garrison = 0.10f;
    float noProduction = 1.0f;
    float legalCount = 1.0f;
    float cityCount = 0.06f;
    float freeCityCount = 0.13f;
    float workerCount = 0.12f;
    float settlerCount = 0.0f;
    float explorerCount = 0.0f;
    float militaryCount = 0.10f;
    float enemyMilitaryCount = 0.0f;
    float idleMovableCount = 0.18f;
    float settlersDemand = 0.25f;
    float workerDemand = 0.25f;
    float explorerDemand = 0.15f;
    float militaryDemand = 0.35f;
    float openedTechRate = 0.0f;
    float account = 0.10f;
    float accountDelta = 0.05f;
    float upkeep = 0.10f;
    float enemyMounted = 0.0f;
    float enemyNaval = 0.0f;
    float enemyCity = 0.0f;
    float waterJobs = 0.0f;
    std::array<float, 8> improvementTechnology{};
    std::array<float, 8> improvementOpportunity{};
    std::vector<std::string> candidates;
    std::string expectedProduction;
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
    std::vector<std::string> words;
    std::stringstream in(text);
    std::string word;
    while (in >> word) {
        words.push_back(word);
    }
    return words;
}

std::map<std::string, std::string> parseOptions(const std::vector<std::string>& words, size_t begin)
{
    std::map<std::string, std::string> options;
    for (size_t n = begin; n < words.size(); ++n) {
        const size_t eq = words[n].find('=');
        if (eq != std::string::npos) {
            options[words[n].substr(0, eq)] = words[n].substr(eq + 1);
        }
    }
    return options;
}

float optionFloat(const std::map<std::string, std::string>& options, const std::string& key, float fallback)
{
    const auto it = options.find(key);
    return it == options.end() ? fallback : std::stof(it->second);
}

std::string optionText(const std::map<std::string, std::string>& options, const std::string& key,
                       const std::string& fallback = "")
{
    const auto it = options.find(key);
    return it == options.end() ? fallback : it->second;
}

std::vector<std::string> defaultProductionCandidates()
{
    return {
        "settlers",
        "explorer",
        "worker",
        "warrior",
        "slinger",
        "archer",
        "spearman",
        "none",
    };
}

struct ProductionUnitSpec {
    const char* id;
    int index;
    int type;
    float attack;
    float defense;
    float speed;
    float view;
    float cost;
    bool water;
};

const ProductionUnitSpec* productionUnitSpec(const std::string& id)
{
    static const std::vector<ProductionUnitSpec> units = {
        {"settlers", 1, 0, 0, 1, 1, 2, 20, false},
        {"worker", 2, 1, 0, 1, 1, 2, 20, false},
        {"explorer", 3, 1, 0, 1, 2, 4, 15, false},
        {"warrior", 4, 2, 2, 1, 1, 2, 20, false},
        {"slinger", 5, 2, 2, 1, 1, 2, 25, false},
        {"archer", 6, 2, 3, 1, 1, 2, 35, false},
        {"spearman", 7, 2, 2, 3, 1, 2, 35, false},
        {"horseman", 8, 2, 4, 2, 2, 3, 50, false},
        {"chariot", 9, 2, 3, 2, 2, 3, 45, false},
        {"elephant", 10, 2, 5, 4, 2, 3, 70, false},
        {"catapult", 11, 2, 5, 1, 1, 2, 60, false},
        {"trebuchet", 12, 2, 7, 1, 1, 2, 80, false},
        {"galley", 13, 2, 2, 2, 2, 3, 40, true},
        {"galleon", 14, 2, 5, 4, 3, 4, 90, true},
        {"workboat", 15, 1, 0, 1, 2, 3, 30, true},
        {"frigate", 16, 2, 6, 5, 3, 4, 100, true},
        {"knight", 17, 2, 6, 5, 2, 3, 85, false},
        {"pikeman", 18, 2, 4, 6, 1, 2, 55, false},
        {"longbow", 19, 2, 5, 3, 1, 3, 55, false},
        {"fencer", 20, 2, 4, 3, 2, 2, 45, false},
        {"swordsman", 21, 2, 7, 5, 1, 2, 75, false},
        {"trireme", 22, 2, 1, 1, 2, 3, 30, true},
    };
    const auto it = std::find_if(units.begin(), units.end(), [&](const ProductionUnitSpec& unit) {
        return id == unit.id;
    });
    return it == units.end() ? nullptr : &*it;
}

float matchedDemand(const EconomicsScenario& scenario, const std::string& id)
{
    if (id == "none") return std::max(0.0f, -scenario.accountDelta);
    if (id == "settlers") return scenario.settlersDemand;
    if (id == "worker" || id == "workboat") return scenario.workerDemand;
    if (id == "explorer") return scenario.explorerDemand;
    return scenario.militaryDemand;
}

float usableWorkerOpportunity(const EconomicsScenario& scenario)
{
    float best = 0.0f;
    for (int n = 0; n < 8; ++n) {
        best = std::max(best, scenario.improvementTechnology[n] * scenario.improvementOpportunity[n]);
    }
    return best;
}

float candidateContext(const EconomicsScenario& scenario, const std::string& id, const ProductionUnitSpec* unit)
{
    if (id == "none") return std::max(0.0f, std::max(-scenario.accountDelta, scenario.upkeep - 0.5f));
    if (id == "worker") return usableWorkerOpportunity(scenario);
    if (id == "workboat") return scenario.waterJobs;
    if (id == "pikeman" || id == "spearman") return scenario.enemyMounted;
    if (id == "catapult" || id == "trebuchet") return scenario.enemyCity;
    if (unit && unit->water) return scenario.enemyNaval;
    return scenario.frontier;
}

float candidateCount(const EconomicsScenario& scenario, const std::string& id)
{
    if (id == "settlers") return scenario.settlerCount;
    if (id == "worker") return scenario.workerCount;
    if (id == "explorer") return scenario.explorerCount;
    return 0.0f;
}

InputSignal buildEconomicsInput(const EconomicsScenario& scenario)
{
    InputSignal input{};
    input.fill(0.0f);
    const std::vector<std::string>& candidates = scenario.candidates.empty()
        ? defaultProductionCandidates() : scenario.candidates;
    for (int candidate = 0; candidate < static_cast<int>(candidates.size()) && candidate < AI_PLAYER_OBJECT_COUNT; ++candidate) {
        const std::string& id = candidates[candidate];
        const ProductionUnitSpec* unit = productionUnitSpec(id);
        const int base = candidate * AI_PLAYER_OBJECT_FLOATS;
        input[base + 0] = unit ? static_cast<float>(unit->index) / 32.0f : 0.0f;
        input[base + 1] = unit ? static_cast<float>(unit->type) / 3.0f : -1.0f;
        input[base + 2] = unit ? unit->attack / 10.0f : 0.0f;
        input[base + 3] = unit ? unit->defense / 10.0f : 0.0f;
        input[base + 4] = unit ? unit->speed / 5.0f : 0.0f;
        input[base + 5] = unit ? unit->view / 5.0f : 0.0f;
        input[base + 6] = unit ? unit->cost / 100.0f : 0.0f;
        input[base + 7] = unit && unit->water ? 1.0f : 0.0f;
        // Match ai.js: each candidate carries the current empire-wide count of
        // that exact unit type.  This is essential for one-at-a-time civilian
        // production, especially Settlers.
        input[base + 8] = candidateCount(scenario, id);
        input[base + 9] = matchedDemand(scenario, id);
        input[base + 10] = scenario.population;
        input[base + 11] = scenario.food;
        input[base + 12] = scenario.production;
        input[base + 13] = scenario.money;
        input[base + 14] = scenario.frontier;
        input[base + 15] = scenario.seaside;
        input[base + 16] = scenario.garrison;
        input[base + 17] = scenario.militaryCount;
        input[base + 18] = scenario.enemyMilitaryCount;
        input[base + 19] = scenario.enemyMounted;
        input[base + 20] = unit && unit->water ? scenario.enemyNaval : scenario.enemyCity;
        input[base + 21] = candidateContext(scenario, id, unit);
    }

    input[AI_PLAYER_SITUATION_BASE + 1] = scenario.cityCount;
    input[AI_PLAYER_SITUATION_BASE + 2] = scenario.freeCityCount;
    input[AI_PLAYER_SITUATION_BASE + 5] = scenario.militaryCount;
    input[AI_PLAYER_SITUATION_BASE + 6] = scenario.enemyMilitaryCount;
    input[AI_PLAYER_SITUATION_BASE + 14] = scenario.idleMovableCount;
    input[AI_PLAYER_SITUATION_BASE + 15] = scenario.workerCount;
    input[AI_PLAYER_SITUATION_BASE + 16] = scenario.openedTechRate;
    input[AI_PLAYER_SITUATION_BASE + 20] = scenario.settlersDemand;
    input[AI_PLAYER_SITUATION_BASE + 21] = scenario.workerDemand;
    input[AI_PLAYER_SITUATION_BASE + 22] = scenario.explorerDemand;
    input[AI_PLAYER_SITUATION_BASE + 23] = scenario.militaryDemand;
    input[AI_PLAYER_SITUATION_BASE + 24] = scenario.account;
    input[AI_PLAYER_SITUATION_BASE + 25] = scenario.accountDelta;
    input[AI_PLAYER_SITUATION_BASE + 26] = scenario.upkeep;
    for (int n = 0; n < 8; ++n) {
        input[AI_PLAYER_SITUATION_BASE + 27 + n] = scenario.improvementTechnology[n];
        input[AI_PLAYER_SITUATION_BASE + 35 + n] = scenario.improvementOpportunity[n];
        input[AI_PLAYER_SITUATION_BASE + 43 + n]
            = scenario.improvementTechnology[n] * scenario.improvementOpportunity[n];
    }
    return input;
}

std::string decodeProduction(const OutputSignal& output, const EconomicsScenario& scenario)
{
    const std::vector<std::string>& labels = scenario.candidates.empty()
        ? defaultProductionCandidates() : scenario.candidates;
    int best = 0;
    float bestValue = -1.0e30f;
    for (int k = 0; k < static_cast<int>(labels.size()); ++k) {
        if (output[k] > bestValue) {
            bestValue = output[k];
            best = k;
        }
    }
    return labels[best];
}

float decodedConfidence(const OutputSignal& output, const EconomicsScenario& scenario, const std::string& label)
{
    const std::vector<std::string>& labels = scenario.candidates.empty()
        ? defaultProductionCandidates() : scenario.candidates;
    const auto it = std::find(labels.begin(), labels.end(), label);
    if (it == labels.end()) {
        return 0.0f;
    }
    const int index = static_cast<int>(it - labels.begin());
    return output[index];
}

std::vector<EconomicsScenario> loadEconomicsTestFile(const std::string& path)
{
    std::ifstream in(path);
    if (!in) {
        throw std::runtime_error("could not open economics test file: " + path);
    }

    std::vector<EconomicsScenario> scenarios;
    EconomicsScenario current;
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
            current = EconomicsScenario{};
            current.name = words.size() > 1 ? words[1] : "unnamed";
            inScenario = true;
            continue;
        }
        if (!inScenario) {
            throw std::runtime_error(path + ":" + std::to_string(lineNumber) + ": directive outside scenario");
        }
        if (words[0] == "city") {
            const auto options = parseOptions(words, 1);
            current.record = static_cast<int>(optionFloat(options, "record", static_cast<float>(current.record)));
            current.population = optionFloat(options, "population", current.population);
            current.food = optionFloat(options, "food", current.food);
            current.production = optionFloat(options, "production", current.production);
            current.money = optionFloat(options, "money", current.money);
            current.frontier = optionFloat(options, "frontier", current.frontier);
            current.seaside = optionFloat(options, "seaside", current.seaside);
            current.garrison = optionFloat(options, "garrison", current.garrison);
            current.noProduction = optionFloat(options, "free", current.noProduction);
            current.legalCount = optionFloat(options, "legal", current.legalCount);
        }
        else if (words[0] == "demand") {
            const auto options = parseOptions(words, 1);
            current.settlersDemand = optionFloat(options, "settlers", current.settlersDemand);
            current.workerDemand = optionFloat(options, "worker", current.workerDemand);
            current.explorerDemand = optionFloat(options, "explorer", current.explorerDemand);
            current.militaryDemand = optionFloat(options, "military", current.militaryDemand);
        }
        else if (words[0] == "state") {
            const auto options = parseOptions(words, 1);
            current.cityCount = optionFloat(options, "cities", current.cityCount);
            current.freeCityCount = optionFloat(options, "free_cities", current.freeCityCount);
            current.workerCount = optionFloat(options, "workers", current.workerCount);
            current.settlerCount = optionFloat(options, "settlers", current.settlerCount);
            current.explorerCount = optionFloat(options, "explorers", current.explorerCount);
            current.militaryCount = optionFloat(options, "military", current.militaryCount);
            current.enemyMilitaryCount = optionFloat(options, "enemy_military", current.enemyMilitaryCount);
            current.idleMovableCount = optionFloat(options, "idle", current.idleMovableCount);
            current.account = optionFloat(options, "account", current.account);
            current.accountDelta = optionFloat(options, "delta", current.accountDelta);
            current.accountDelta = optionFloat(options, "account_delta", current.accountDelta);
            current.upkeep = optionFloat(options, "upkeep", current.upkeep);
            current.enemyMounted = optionFloat(options, "enemy_mounted", current.enemyMounted);
            current.enemyNaval = optionFloat(options, "enemy_naval", current.enemyNaval);
            current.enemyCity = optionFloat(options, "enemy_city", current.enemyCity);
            current.waterJobs = optionFloat(options, "water_jobs", current.waterJobs);
        }
        else if (words[0] == "tech") {
            const auto options = parseOptions(words, 1);
            current.openedTechRate = optionFloat(options, "opened", current.openedTechRate);
            const std::array<const char*, 8> names = {
                "wheel", "bronze", "irrigation", "animals", "mining", "masonry", "pottery", "construction"
            };
            for (int n = 0; n < 8; ++n) {
                current.improvementTechnology[n] = optionFloat(options, names[n], current.improvementTechnology[n]);
            }
        }
        else if (words[0] == "plots") {
            const auto options = parseOptions(words, 1);
            const std::array<const char*, 8> names = {
                "road", "forest", "irrigation", "animals", "mine", "masonry", "pottery", "construction"
            };
            for (int n = 0; n < 8; ++n) {
                current.improvementOpportunity[n] = optionFloat(options, names[n], current.improvementOpportunity[n]);
            }
        }
        else if (words[0] == "candidates") {
            current.candidates.assign(words.begin() + 1, words.end());
            if (current.candidates.empty() || current.candidates.size() > AI_PLAYER_OBJECT_COUNT) {
                throw std::runtime_error(path + ":" + std::to_string(lineNumber) + ": candidates requires 1..8 unit ids");
            }
        }
        else if (words[0] == "expect") {
            const auto options = parseOptions(words, 1);
            current.expectedProduction = optionText(options, "production", current.expectedProduction);
            if (current.expectedProduction.empty() && words.size() >= 3 && words[1] == "production") {
                current.expectedProduction = words[2];
            }
        }
        else if (words[0] == "end") {
            if (current.expectedProduction.empty()) {
                throw std::runtime_error(path + ":" + std::to_string(lineNumber) + ": missing expected production");
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

EconomicsTestSummary runEconomicsTests(const EconomicsEngine& engine, const std::vector<std::string>& paths,
                                       std::ostream& out)
{
    EconomicsTestSummary summary;
    out << "\nRunning Economics strategy tests:\n";
    for (const std::string& path : paths) {
        const std::vector<EconomicsScenario> scenarios = loadEconomicsTestFile(path);
        out << "  " << path << " (" << scenarios.size() << " scenarios)\n";
        for (const EconomicsScenario& scenario : scenarios) {
            ++summary.total;
            const OutputSignal output = engine.infer(buildEconomicsInput(scenario));
            const std::string production = decodeProduction(output, scenario);
            const bool ok = production == scenario.expectedProduction;
            if (ok) {
                ++summary.passed;
            }
            out << "    " << (ok ? "PASS" : "FAIL") << " " << scenario.name
                << ": production=" << production
                << " confidence=" << std::fixed << std::setprecision(3)
                << decodedConfidence(output, scenario, production);
            if (!ok) {
                out << " expected production=" << scenario.expectedProduction
                    << " expected_confidence=" << decodedConfidence(output, scenario, scenario.expectedProduction);
            }
            out << "\n";
        }
    }
    out << "Economics strategy tests: " << summary.passed << "/" << summary.total << " passed\n";
    return summary;
}

std::vector<TrainingExample> makeEconomicsSimulationTrainingExamples(const std::vector<std::string>& paths)
{
    std::vector<TrainingExample> examples;
    for (const std::string& path : paths) {
        for (const EconomicsScenario& scenario : loadEconomicsTestFile(path)) {
            const std::vector<std::string> original = scenario.candidates.empty()
                ? defaultProductionCandidates() : scenario.candidates;
            for (int rotation = 0; rotation < std::min<int>(4, original.size()); ++rotation) {
                EconomicsScenario rotated = scenario;
                rotated.candidates = original;
                std::rotate(rotated.candidates.begin(), rotated.candidates.begin() + rotation, rotated.candidates.end());
                const auto expected = std::find(rotated.candidates.begin(), rotated.candidates.end(), scenario.expectedProduction);
                if (expected == rotated.candidates.end()) {
                    throw std::runtime_error("economics scenario candidate list omits expected production: " + scenario.name);
                }
                TrainingExample example;
                example.input = buildEconomicsInput(rotated);
                example.target.fill(0.0f);
                for (int slot = 0; slot < static_cast<int>(rotated.candidates.size()); ++slot) {
                    example.decisionSlots.push_back(slot);
                }
                for (int slot : example.decisionSlots) example.target[slot] = -0.9f;
                example.correctSlot = static_cast<int>(expected - rotated.candidates.begin());
                example.target[example.correctSlot] = 0.9f;
                example.explanation = "economics production candidate situation: " + scenario.name;
                const int copies = scenario.name == "mounted_threat_builds_pikeman" ? 4 : 1;
                for (int copy = 0; copy < copies; ++copy) examples.push_back(example);
            }
        }
    }
    return examples;
}

} // namespace aiciv::ai
