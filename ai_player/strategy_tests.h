#pragma once

#include "ai_player.h"

#include <iosfwd>
#include <string>
#include <vector>

namespace aiciv::ai {

struct StrategyTestSummary {
    int total = 0;
    int passed = 0;
};

StrategyTestSummary runStrategyTests(const StrategyEngine& engine, const std::vector<std::string>& paths,
                                     std::ostream& out);

} // namespace aiciv::ai
