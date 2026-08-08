#pragma once

#include "ai_player_formats.h"

#include <array>
#include <cstdint>
#include <functional>
#include <iosfwd>
#include <random>
#include <string>
#include <vector>

namespace aiciv::ai {

constexpr int kBaseInputWidth = AI_PLAYER_BASE_INPUT_WIDTH;
constexpr int kInputWidth = AI_PLAYER_INPUT_WIDTH;
constexpr int kOutputWidth = AI_PLAYER_OUTPUT_WIDTH;
constexpr int kLayerCount = 8;
using InputSignal = std::array<float, kInputWidth>;
using OutputSignal = std::array<float, kOutputWidth>;
constexpr std::array<int, kLayerCount + 1> kLayerWidths = {
    kInputWidth, 536, 448, 368, 288, 208, 176, 176, kOutputWidth
};

enum class EngineKind {
    Strategy,
    Action,
    Economics
};

struct FieldSpec {
    int begin;
    int end;
    std::string name;
    std::string type;
    std::string description;
};

struct Schema {
    EngineKind kind;
    std::string name;
    std::vector<FieldSpec> input;
    std::vector<FieldSpec> output;
};

struct TrainingExample {
    InputSignal input{};
    OutputSignal target{};
    std::vector<int> decisionSlots;
    int correctSlot = 0;
    std::string explanation;
    std::vector<std::string> comments;
};

struct TrainingReport {
    float loss = 0.0f;
    float accuracy = 0.0f;
};

class DensePerceptronEngine {
public:
    explicit DensePerceptronEngine(uint32_t seed = 1, int inputWidth = kBaseInputWidth,
                                   bool sharedCandidateScorer = false);

    OutputSignal forward(const InputSignal& input) const;
    std::vector<float> hiddenBeforeLast(const InputSignal& input) const;
    OutputSignal forwardFromHidden(const std::vector<float>& hidden) const;
    void saveBinary(const std::string& path) const;

    // Fast deterministic back-propagation path used by the example trainer.
    // Hidden layers are identity-initialized reducing layers with tanh activation;
    // the eighth fully connected layer is trained over declared decision slots.
    float trainDecisionSlots(const TrainingExample& example, float learningRate);
    float trainDecisionSlotsFromHidden(const TrainingExample& example, const std::vector<float>& hidden,
                                       float learningRate);
    float trainSharedCandidateScores(const TrainingExample& example, float learningRate);

    // Generic dense back-propagation implementation for all eight dense layers.
    // It is intentionally simple and slow; use for experiments, not the demo loop.
    float trainFullBackprop(const InputSignal& input, const OutputSignal& target, float learningRate);

private:
    struct Layer {
        int inputWidth = 0;
        int outputWidth = 0;
        std::vector<float> weights; // row-major [out][in]
        std::vector<float> bias;
    };

    std::array<Layer, kLayerCount> layers_;
    bool sharedCandidateScorer_ = false;

    static float activate(float x);
    static float activateDerivativeFromOutput(float y);
    static std::vector<int> activeIndices(const std::vector<float>& values);
};

class AIEngine {
public:
    AIEngine(Schema schema, uint32_t seed, int inputWidth = kBaseInputWidth,
             bool sharedCandidateScorer = false);
    virtual ~AIEngine() = default;

    const Schema& schema() const { return schema_; }
    OutputSignal infer(const InputSignal& input) const { return network_.forward(input); }
    TrainingReport train(const std::vector<TrainingExample>& examples, int epochs, float learningRate, std::ostream& out);
    void saveModel(const std::string& path) const { network_.saveBinary(path); }

protected:
    Schema schema_;
    DensePerceptronEngine network_;
    bool sharedCandidateScorer_ = false;
};

class StrategyEngine final : public AIEngine {
public:
    StrategyEngine();
};

class ActionEngine final : public AIEngine {
public:
    ActionEngine();
};

class EconomicsEngine final : public AIEngine {
public:
    EconomicsEngine();
};

Schema makeStrategySchema();
Schema makeActionSchema();
Schema makeEconomicsSchema();

std::vector<TrainingExample> makeStrategyExamples();
std::vector<TrainingExample> makeStrategyDemandExamples();
std::vector<TrainingExample> makeStrategyTechnologyExamples();
std::vector<TrainingExample> makeStrategyLandscapeExamples();
std::vector<TrainingExample> makeStrategyBudgetExamples();
std::vector<TrainingExample> makeStrategyWorkerExamples();
std::vector<TrainingExample> makeActionBootstrapExamples();
std::vector<TrainingExample> makeActionSettlerExamples();
std::vector<TrainingExample> makeActionWorkerExamples();
std::vector<TrainingExample> makeActionExplorerExamples();
std::vector<TrainingExample> makeActionWarriorExamples();
std::vector<TrainingExample> makeActionSlingerExamples();
std::vector<TrainingExample> makeActionArcherExamples();
std::vector<TrainingExample> makeActionHorsemanExamples();
std::vector<TrainingExample> makeActionExamples();
std::vector<TrainingExample> makeEconomicsExamples();
std::vector<TrainingExample> makeEconomicsStrategyExamples();
std::vector<TrainingExample> makeEconomicsWorkerExamples();

std::vector<TrainingExample> loadTrainingExamples(const std::string& path);
void saveTrainingExamples(const std::string& path, const std::vector<TrainingExample>& examples);

void printSchema(const Schema& schema, std::ostream& out);
TrainingReport evaluate(const DensePerceptronEngine& engine, const std::vector<TrainingExample>& examples);

} // namespace aiciv::ai
