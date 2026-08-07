#pragma once

#include "ai_player.h"

#include <iosfwd>
#include <string>
#include <vector>

namespace aiciv::ai {

struct ActionTestSummary {
    int total = 0;
    int passed = 0;
};

ActionTestSummary runActionTests(const ActionEngine& engine, const std::vector<std::string>& paths, std::ostream& out);
std::vector<TrainingExample> makeActionSimulationTrainingExamples(const std::vector<std::string>& paths);

} // namespace aiciv::ai
