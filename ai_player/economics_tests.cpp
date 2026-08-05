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
    std::array<float, 8> improvementTechnology{};
    std::array<float, 8> improvementOpportunity{};
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

std::vector<std::string> productionLabels()
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

InputSignal buildEconomicsInput(const EconomicsScenario& scenario)
{
    InputSignal input{};
    input.fill(0.0f);
    const int base = scenario.record * AI_PLAYER_OBJECT_FLOATS;
    input[base + 2] = scenario.population;
    input[base + 3] = scenario.food;
    input[base + 4] = scenario.production;
    input[base + 5] = scenario.money;
    input[base + 10] = scenario.frontier;
    input[base + 11] = scenario.seaside;
    input[base + 12] = scenario.garrison;
    input[base + 13] = scenario.noProduction;
    input[base + 14] = scenario.legalCount;

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

std::string decodeProduction(const OutputSignal& output, int record)
{
    const std::vector<std::string> labels = productionLabels();
    const int base = record * AI_PLAYER_COMMAND_FLOATS;
    int best = 0;
    float bestValue = -1.0e30f;
    for (int k = 0; k < static_cast<int>(labels.size()); ++k) {
        if (output[base + k] > bestValue) {
            bestValue = output[base + k];
            best = k;
        }
    }
    return labels[best];
}

float decodedConfidence(const OutputSignal& output, int record, const std::string& label)
{
    const std::vector<std::string> labels = productionLabels();
    const auto it = std::find(labels.begin(), labels.end(), label);
    if (it == labels.end()) {
        return 0.0f;
    }
    const int index = static_cast<int>(it - labels.begin());
    return output[record * AI_PLAYER_COMMAND_FLOATS + index];
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
            current.militaryCount = optionFloat(options, "military", current.militaryCount);
            current.enemyMilitaryCount = optionFloat(options, "enemy_military", current.enemyMilitaryCount);
            current.idleMovableCount = optionFloat(options, "idle", current.idleMovableCount);
            current.account = optionFloat(options, "account", current.account);
            current.accountDelta = optionFloat(options, "delta", current.accountDelta);
            current.accountDelta = optionFloat(options, "account_delta", current.accountDelta);
            current.upkeep = optionFloat(options, "upkeep", current.upkeep);
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
            const std::string production = decodeProduction(output, scenario.record);
            const bool ok = production == scenario.expectedProduction;
            if (ok) {
                ++summary.passed;
            }
            out << "    " << (ok ? "PASS" : "FAIL") << " " << scenario.name
                << ": production=" << production
                << " confidence=" << std::fixed << std::setprecision(3)
                << decodedConfidence(output, scenario.record, production);
            if (!ok) {
                out << " expected production=" << scenario.expectedProduction
                    << " expected_confidence=" << decodedConfidence(output, scenario.record, scenario.expectedProduction);
            }
            out << "\n";
        }
    }
    out << "Economics strategy tests: " << summary.passed << "/" << summary.total << " passed\n";
    return summary;
}

} // namespace aiciv::ai
