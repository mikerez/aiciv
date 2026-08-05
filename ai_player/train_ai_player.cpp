#include "ai_player.h"
#include "action_tests.h"
#include "economics_tests.h"
#include "strategy_tests.h"

#include <algorithm>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

using namespace aiciv::ai;

namespace {

void printExampleNotes(const std::string& name, const std::vector<TrainingExample>& examples)
{
    std::cout << "\n" << name << " training situation explanations:\n";
    const size_t visibleCount = std::min<size_t>(examples.size(), 8);
    for (size_t i = 0; i < visibleCount; ++i) {
        std::cout << "  #" << i << ": " << examples[i].explanation << "\n";
    }
    if (examples.size() > visibleCount) {
        std::cout << "  ... " << (examples.size() - visibleCount)
                  << " more situations in this library.\n";
    }
}

template <typename Engine>
void printWrongExamples(const Engine& engine, const std::vector<TrainingExample>& examples)
{
    int printed = 0;
    for (size_t i = 0; i < examples.size() && printed < 16; ++i) {
        OutputSignal output = engine.infer(examples[i].input);
        int best = examples[i].decisionSlots.empty() ? 0 : examples[i].decisionSlots[0];
        float bestValue = -1.0e30f;
        for (int slot : examples[i].decisionSlots) {
            if (output[slot] > bestValue) {
                bestValue = output[slot];
                best = slot;
            }
        }
        if (best == examples[i].correctSlot) {
            continue;
        }
        std::cout << "  wrong #" << i << ": predicted output[" << best << "]="
                  << std::fixed << std::setprecision(3) << bestValue
                  << " expected output[" << examples[i].correctSlot << "] "
                  << examples[i].explanation << "\n";
        ++printed;
    }
}

template <typename Engine>
void runEngine(Engine& engine, const std::vector<TrainingExample>& examples, const std::string& sourcePath,
               const std::string& modelPath, int epochs, float learningRate)
{
    printSchema(engine.schema(), std::cout);
    printExampleNotes(engine.schema().name, examples);
    std::cout << "\nTraining " << engine.schema().name << " on " << examples.size()
              << " situations from " << sourcePath
              << ". Loss is MSE over declared decision slots.\n";
    TrainingReport report = engine.train(examples, epochs, learningRate, std::cout);
    std::cout << "Final " << engine.schema().name << " accuracy="
              << std::fixed << std::setprecision(1) << report.accuracy * 100.0f
              << "% loss=" << std::setprecision(6) << report.loss << "\n";
    if (report.accuracy < 0.90f) {
        std::cout << "First wrong " << engine.schema().name << " examples after training:\n";
        printWrongExamples(engine, examples);
    }
    engine.saveModel(modelPath);
    std::cout << "Saved " << engine.schema().name << " model database to " << modelPath << "\n";
}

void appendExamples(std::vector<TrainingExample>& target, const std::vector<TrainingExample>& source)
{
    target.insert(target.end(), source.begin(), source.end());
}

std::vector<TrainingExample> loadWithRootFallback(const std::string& rootPath, const std::string& localPath,
                                                  std::string& usedPath)
{
    try {
        usedPath = rootPath;
        return loadTrainingExamples(rootPath);
    } catch (const std::runtime_error&) {
        usedPath = localPath;
        return loadTrainingExamples(localPath);
    }
}

bool tryLoadInto(const std::string& rootPath, const std::string& localPath,
                 std::vector<TrainingExample>& examples, std::vector<std::string>& usedPaths)
{
    try {
        appendExamples(examples, loadTrainingExamples(rootPath));
        usedPaths.push_back(rootPath);
        return true;
    } catch (const std::runtime_error&) {
    }

    try {
        appendExamples(examples, loadTrainingExamples(localPath));
        usedPaths.push_back(localPath);
        return true;
    } catch (const std::runtime_error&) {
    }

    return false;
}

std::string joinPaths(const std::vector<std::string>& paths)
{
    std::string result;
    for (size_t i = 0; i < paths.size(); ++i) {
        if (i != 0) {
            result += ", ";
        }
        result += paths[i];
    }
    return result;
}

std::vector<TrainingExample> loadActionSituationSet(std::string& usedPath)
{
    std::vector<TrainingExample> examples;
    std::vector<std::string> usedPaths;
    const std::vector<std::string> splitNames = {
        "action-bootstrap.situations",
        "action-settlers.situations",
        "action-explorer.situations",
        "action-worker.situations",
        "action-warrior.situations",
        "action-slinger.situations",
        "action-archer.situations",
        "action-horseman.situations",
    };

    for (const std::string& name : splitNames) {
        tryLoadInto("ai_player/" + name, name, examples, usedPaths);
    }

    if (!examples.empty()) {
        usedPath = joinPaths(usedPaths);
        return examples;
    }

    return loadWithRootFallback("ai_player/action.situations", "action.situations", usedPath);
}

std::vector<TrainingExample> loadSplitSituationSet(const std::vector<std::string>& splitNames,
                                                   const std::string& fallbackName,
                                                   std::string& usedPath)
{
    std::vector<TrainingExample> examples;
    std::vector<std::string> usedPaths;
    for (const std::string& name : splitNames) {
        tryLoadInto("ai_player/" + name, name, examples, usedPaths);
    }
    if (!examples.empty()) {
        usedPath = joinPaths(usedPaths);
        return examples;
    }
    return loadWithRootFallback("ai_player/" + fallbackName, fallbackName, usedPath);
}

void exportDefaultSituations()
{
    saveTrainingExamples("ai_player/strategy.situations", makeStrategyExamples());
    saveTrainingExamples("ai_player/strategy-demands.situations", makeStrategyDemandExamples());
    saveTrainingExamples("ai_player/strategy-technology.situations", makeStrategyTechnologyExamples());
    saveTrainingExamples("ai_player/strategy-landscape.situations", makeStrategyLandscapeExamples());
    saveTrainingExamples("ai_player/strategy-budget.situations", makeStrategyBudgetExamples());
    saveTrainingExamples("ai_player/strategy-workers.situations", makeStrategyWorkerExamples());
    saveTrainingExamples("ai_player/tactics.situations", makeTacticsExamples());
    saveTrainingExamples("ai_player/action-bootstrap.situations", makeActionBootstrapExamples());
    saveTrainingExamples("ai_player/action-settlers.situations", makeActionSettlerExamples());
    saveTrainingExamples("ai_player/action-worker.situations", makeActionWorkerExamples());
    saveTrainingExamples("ai_player/action-explorer.situations", makeActionExplorerExamples());
    saveTrainingExamples("ai_player/action-warrior.situations", makeActionWarriorExamples());
    saveTrainingExamples("ai_player/action-slinger.situations", makeActionSlingerExamples());
    saveTrainingExamples("ai_player/action-archer.situations", makeActionArcherExamples());
    saveTrainingExamples("ai_player/action-horseman.situations", makeActionHorsemanExamples());
    saveTrainingExamples("ai_player/economics.situations", makeEconomicsExamples());
    saveTrainingExamples("ai_player/economics-strategy.situations", makeEconomicsStrategyExamples());
    saveTrainingExamples("ai_player/economics-workers.situations", makeEconomicsWorkerExamples());
    std::cout << "Exported ai_player/strategy.situations, ai_player/tactics.situations, "
              << "ai_player/strategy-demands.situations, ai_player/strategy-technology.situations, "
              << "ai_player/strategy-landscape.situations, "
              << "ai_player/strategy-budget.situations, ai_player/strategy-workers.situations, "
              << "ai_player/action-bootstrap.situations, ai_player/action-settlers.situations, "
              << "ai_player/action-worker.situations, ai_player/action-explorer.situations, "
              << "ai_player/action-warrior.situations, ai_player/action-slinger.situations, "
              << "ai_player/action-archer.situations, ai_player/action-horseman.situations, "
              << "ai_player/economics.situations, ai_player/economics-strategy.situations, "
              << "ai_player/economics-workers.situations\n";
}

std::string modelPathBesideSituations(const std::string& situationPath, const std::string& modelName)
{
    const size_t comma = situationPath.find(',');
    const std::string firstPath = comma == std::string::npos ? situationPath : situationPath.substr(0, comma);
    const size_t slash = firstPath.find_last_of("/\\");
    if (slash == std::string::npos) {
        return modelName + ".db";
    }
    return firstPath.substr(0, slash + 1) + modelName + ".db";
}

} // namespace

int main(int argc, char** argv)
{
    if (argc > 1 && std::string(argv[1]) == "--export-situations") {
        exportDefaultSituations();
        return 0;
    }

    int epochs = 60;
    float learningRate = 0.08f;
    if (argc > 1) {
        epochs = std::max(1, std::atoi(argv[1]));
    }
    if (argc > 2) {
        learningRate = std::max(0.001f, static_cast<float>(std::atof(argv[2])));
    }
    std::string engineFilter = "all";
    if (argc > 3) {
        engineFilter = argv[3];
    }

    StrategyEngine strategy;
    TacticsEngine tactics;
    ActionEngine action;
    EconomicsEngine economics;

    std::string strategyPath;
    std::string tacticsPath;
    std::string actionPath;
    std::string economicsPath;
    std::vector<TrainingExample> strategyExamples =
        loadSplitSituationSet({ "strategy.situations", "strategy-demands.situations", "strategy-technology.situations", "strategy-landscape.situations", "strategy-budget.situations", "strategy-workers.situations" },
                              "strategy.situations", strategyPath);
    std::vector<TrainingExample> tacticsExamples =
        loadWithRootFallback("ai_player/tactics.situations", "tactics.situations", tacticsPath);
    std::vector<TrainingExample> actionExamples = loadActionSituationSet(actionPath);
    std::vector<TrainingExample> economicsExamples =
        loadSplitSituationSet({ "economics-strategy.situations", "economics-workers.situations" }, "economics-strategy.situations", economicsPath);

    if (engineFilter == "all" || engineFilter == "strategy") {
        runEngine(strategy, strategyExamples, strategyPath, modelPathBesideSituations(strategyPath, "strategy"), epochs, learningRate);
        const StrategyTestSummary strategyTests = runStrategyTests(strategy, {
            "ai_player/strategy-technology.test",
            "ai_player/strategy-landscape.test",
            "ai_player/strategy-budget.test",
            "ai_player/strategy-workers.test",
        }, std::cout);
        if (strategyTests.passed != strategyTests.total) {
            return 4;
        }
    }
    if (engineFilter == "all" || engineFilter == "tactics") {
        runEngine(tactics, tacticsExamples, tacticsPath, modelPathBesideSituations(tacticsPath, "tactics"), epochs, learningRate);
    }
    if (engineFilter == "all" || engineFilter == "action") {
        runEngine(action, actionExamples, actionPath, modelPathBesideSituations(actionPath, "action"), epochs, learningRate);
        const ActionTestSummary actionTests = runActionTests(action, {
            "ai_player/action-settlers.test",
            "ai_player/action-worker.test",
            "ai_player/action-explorer.test",
            "ai_player/action-warrior.test",
            "ai_player/action-slinger.test",
            "ai_player/action-archer.test",
            "ai_player/action-horseman.test",
        }, std::cout);
        if (actionTests.passed != actionTests.total) {
            return 2;
        }
    }
    if (engineFilter == "all" || engineFilter == "economics") {
        runEngine(economics, economicsExamples, economicsPath, modelPathBesideSituations(economicsPath, "economics"), epochs, learningRate);
        const EconomicsTestSummary economicsTests = runEconomicsTests(economics, {
            "ai_player/economics-strategy.test",
            "ai_player/economics-workers.test",
        }, std::cout);
        if (economicsTests.passed != economicsTests.total) {
            return 3;
        }
    }

    return 0;
}
