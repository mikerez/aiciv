#pragma once

#include "ai_player.h"

#include <iosfwd>
#include <string>
#include <vector>

namespace aiciv::ai {

struct EconomicsTestSummary {
    int total = 0;
    int passed = 0;
};

EconomicsTestSummary runEconomicsTests(const EconomicsEngine& engine, const std::vector<std::string>& paths,
                                       std::ostream& out);
std::vector<TrainingExample> makeEconomicsSimulationTrainingExamples(const std::vector<std::string>& paths);

} // namespace aiciv::ai
