#include "strategy_tests.h"

#include <algorithm>
#include <fstream>
#include <iomanip>
#include <map>
#include <sstream>
#include <stdexcept>

namespace aiciv::ai {
namespace {

struct StrategyTechnologyScenario {
    std::string name;
    float hills = 0.0f;
    float mountains = 0.0f;
    float grass = 0.0f;
    float water = 0.0f;
    float animalResources = 0.0f;
    float stoneResources = 0.0f;
    float cropResources = 0.0f;
    float openedTechRate = 0.0f;
    float contextTiles = -1.0f;
    float flatLand = -1.0f;
    float freshWater = -1.0f;
    float forest = 0.0f;
    float desertSnow = 0.0f;
    float resourceTiles = -1.0f;
    float mineralResources = 0.0f;
    float cityAnchor = 0.0f;
    float settlerAnchor = 1.0f;
    std::string expectedTechnology;
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

std::vector<std::string> technologyLabels()
{
    return { "Mining", "Animal_Husbandry", "Masonry", "Irrigation" };
}

InputSignal buildStrategyTechnologyInput(const StrategyTechnologyScenario& scenario)
{
    InputSignal input{};
    input.fill(0.0f);
    input[AI_PLAYER_SITUATION_BASE + 24] = scenario.hills;
    input[AI_PLAYER_SITUATION_BASE + 25] = scenario.mountains;
    input[AI_PLAYER_SITUATION_BASE + 26] = scenario.grass;
    input[AI_PLAYER_SITUATION_BASE + 27] = scenario.water;
    input[AI_PLAYER_SITUATION_BASE + 28] = scenario.animalResources;
    input[AI_PLAYER_SITUATION_BASE + 29] = scenario.stoneResources;
    input[AI_PLAYER_SITUATION_BASE + 30] = scenario.cropResources;
    input[AI_PLAYER_SITUATION_BASE + 31] = scenario.openedTechRate;
    input[AI_PLAYER_SITUATION_BASE + 32] = scenario.contextTiles >= 0.0f ? scenario.contextTiles : 1.0f;
    input[AI_PLAYER_SITUATION_BASE + 33] = scenario.flatLand >= 0.0f ? scenario.flatLand
        : std::max(0.0f, scenario.grass - scenario.hills - scenario.mountains);
    input[AI_PLAYER_SITUATION_BASE + 34] = scenario.freshWater >= 0.0f ? scenario.freshWater : scenario.water;
    input[AI_PLAYER_SITUATION_BASE + 35] = scenario.forest;
    input[AI_PLAYER_SITUATION_BASE + 36] = scenario.desertSnow;
    input[AI_PLAYER_SITUATION_BASE + 37] = scenario.resourceTiles >= 0.0f ? scenario.resourceTiles
        : std::max({ scenario.animalResources, scenario.stoneResources, scenario.cropResources, scenario.mineralResources });
    input[AI_PLAYER_SITUATION_BASE + 38] = scenario.mineralResources;
    input[AI_PLAYER_SITUATION_BASE + 39] = scenario.cityAnchor;
    input[AI_PLAYER_SITUATION_BASE + 40] = scenario.settlerAnchor;
    return input;
}

std::string decodeTechnology(const OutputSignal& output)
{
    const std::vector<std::string> labels = technologyLabels();
    int best = 0;
    float bestValue = -1.0e30f;
    for (int k = 0; k < static_cast<int>(labels.size()); ++k) {
        if (output[68 + k] > bestValue) {
            bestValue = output[68 + k];
            best = k;
        }
    }
    return labels[best];
}

float decodedConfidence(const OutputSignal& output, const std::string& label)
{
    const std::vector<std::string> labels = technologyLabels();
    const auto it = std::find(labels.begin(), labels.end(), label);
    if (it == labels.end()) {
        return 0.0f;
    }
    return output[68 + static_cast<int>(it - labels.begin())];
}

std::vector<StrategyTechnologyScenario> loadStrategyTechnologyTestFile(const std::string& path)
{
    std::ifstream in(path);
    if (!in) {
        throw std::runtime_error("could not open strategy test file: " + path);
    }

    std::vector<StrategyTechnologyScenario> scenarios;
    StrategyTechnologyScenario current;
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
            current = StrategyTechnologyScenario{};
            current.name = words.size() > 1 ? words[1] : "unnamed";
            inScenario = true;
            continue;
        }
        if (!inScenario) {
            throw std::runtime_error(path + ":" + std::to_string(lineNumber) + ": directive outside scenario");
        }
        if (words[0] == "terrain") {
            const auto options = parseOptions(words, 1);
            current.hills = optionFloat(options, "hills", current.hills);
            current.mountains = optionFloat(options, "mountains", current.mountains);
            current.grass = optionFloat(options, "grass", current.grass);
            current.water = optionFloat(options, "water", current.water);
        }
        else if (words[0] == "resources") {
            const auto options = parseOptions(words, 1);
            current.animalResources = optionFloat(options, "animals", current.animalResources);
            current.stoneResources = optionFloat(options, "stone", current.stoneResources);
            current.cropResources = optionFloat(options, "crops", current.cropResources);
        }
        else if (words[0] == "tech") {
            const auto options = parseOptions(words, 1);
            current.openedTechRate = optionFloat(options, "opened", current.openedTechRate);
        }
        else if (words[0] == "context") {
            const auto options = parseOptions(words, 1);
            current.contextTiles = optionFloat(options, "visible", current.contextTiles);
            current.flatLand = optionFloat(options, "flat", current.flatLand);
            current.freshWater = optionFloat(options, "fresh", current.freshWater);
            current.forest = optionFloat(options, "forest", current.forest);
            current.desertSnow = optionFloat(options, "desert_snow", current.desertSnow);
            current.resourceTiles = optionFloat(options, "resources", current.resourceTiles);
            current.mineralResources = optionFloat(options, "minerals", current.mineralResources);
            current.cityAnchor = optionFloat(options, "city", current.cityAnchor);
            current.settlerAnchor = optionFloat(options, "settler", current.settlerAnchor);
        }
        else if (words[0] == "expect") {
            const auto options = parseOptions(words, 1);
            current.expectedTechnology = optionText(options, "technology", current.expectedTechnology);
            if (current.expectedTechnology.empty() && words.size() >= 3 && words[1] == "technology") {
                current.expectedTechnology = words[2];
            }
        }
        else if (words[0] == "end") {
            if (current.expectedTechnology.empty()) {
                throw std::runtime_error(path + ":" + std::to_string(lineNumber) + ": missing expected technology");
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

StrategyTestSummary runStrategyTests(const StrategyEngine& engine, const std::vector<std::string>& paths,
                                     std::ostream& out)
{
    StrategyTestSummary summary;
    out << "\nRunning Strategy technology tests:\n";
    for (const std::string& path : paths) {
        const std::vector<StrategyTechnologyScenario> scenarios = loadStrategyTechnologyTestFile(path);
        out << "  " << path << " (" << scenarios.size() << " scenarios)\n";
        for (const StrategyTechnologyScenario& scenario : scenarios) {
            ++summary.total;
            const OutputSignal output = engine.infer(buildStrategyTechnologyInput(scenario));
            const std::string technology = decodeTechnology(output);
            const bool ok = technology == scenario.expectedTechnology;
            if (ok) {
                ++summary.passed;
            }
            out << "    " << (ok ? "PASS" : "FAIL") << " " << scenario.name
                << ": technology=" << technology
                << " confidence=" << std::fixed << std::setprecision(3)
                << decodedConfidence(output, technology);
            if (!ok) {
                out << " expected technology=" << scenario.expectedTechnology;
            }
            out << "\n";
        }
    }
    out << "Strategy technology tests: " << summary.passed << "/" << summary.total << " passed\n";
    return summary;
}

} // namespace aiciv::ai
