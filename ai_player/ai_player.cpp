#include "ai_player.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>

namespace aiciv::ai {
namespace {

InputSignal zeroInputSignal()
{
    InputSignal s{};
    s.fill(0.0f);
    return s;
}

OutputSignal zeroOutputSignal()
{
    OutputSignal s{};
    s.fill(0.0f);
    return s;
}

void addField(std::vector<FieldSpec>& fields, int begin, int end, const std::string& name,
              const std::string& type, const std::string& description)
{
    fields.push_back({begin, end, name, type, description});
}

void setOneHot(OutputSignal& signal, int begin, int count, int index, float on = 0.9f, float off = -0.9f)
{
    for (int k = 0; k < count; ++k) {
        signal[begin + k] = off;
    }
    signal[begin + index] = on;
}

int argmaxSlots(const OutputSignal& values, const std::vector<int>& slots)
{
    int best = slots.empty() ? 0 : slots[0];
    float bestValue = -std::numeric_limits<float>::infinity();
    for (int slot : slots) {
        if (values[slot] > bestValue) {
            bestValue = values[slot];
            best = slot;
        }
    }
    return best;
}

std::vector<int> slotRange(int begin, int count)
{
    std::vector<int> slots;
    slots.reserve(count);
    for (int k = 0; k < count; ++k) {
        slots.push_back(begin + k);
    }
    return slots;
}

struct BinaryModelHeader {
    char magic[8];
    uint32_t version;
    uint32_t width;
    uint32_t layer_count;
    uint32_t activation;
    uint32_t weight_layout;
    uint32_t reserved[11];
};

std::string trim(const std::string& value)
{
    const size_t begin = value.find_first_not_of(" \t\r\n");
    if (begin == std::string::npos) {
        return {};
    }
    const size_t end = value.find_last_not_of(" \t\r\n");
    return value.substr(begin, end - begin + 1);
}

std::vector<std::string> split(const std::string& value, char separator)
{
    std::vector<std::string> parts;
    std::stringstream stream(value);
    std::string part;
    while (std::getline(stream, part, separator)) {
        parts.push_back(part);
    }
    return parts;
}

std::string serializeSlots(const std::vector<int>& slots)
{
    std::ostringstream out;
    for (size_t i = 0; i < slots.size(); ++i) {
        if (i != 0) {
            out << ",";
        }
        out << slots[i];
    }
    return out.str();
}

template <size_t Width>
std::string serializeSparseSignal(const std::array<float, Width>& signal)
{
    std::ostringstream out;
    bool first = true;
    out << std::fixed << std::setprecision(6);
    for (int index = 0; index < static_cast<int>(Width); ++index) {
        if (std::fabs(signal[index]) <= 1.0e-6f) {
            continue;
        }
        if (!first) {
            out << ",";
        }
        first = false;
        out << index << ":" << signal[index];
    }
    return out.str();
}

std::vector<int> parseSlots(const std::string& text, int lineNumber)
{
    std::vector<int> slots;
    for (const std::string& rawPart : split(text, ',')) {
        std::string part = trim(rawPart);
        if (part.empty()) {
            continue;
        }
        int slot = std::stoi(part);
        if (slot < 0 || slot >= kOutputWidth) {
            throw std::runtime_error("decision slot out of range on line " + std::to_string(lineNumber));
        }
        slots.push_back(slot);
    }
    if (slots.empty()) {
        throw std::runtime_error("empty decision slot list on line " + std::to_string(lineNumber));
    }
    return slots;
}

template <size_t Width>
void parseSparseSignal(const std::string& text, std::array<float, Width>& signal, int lineNumber, const std::string& name)
{
    signal.fill(0.0f);
    if (trim(text).empty()) {
        return;
    }
    for (const std::string& rawPart : split(text, ',')) {
        std::string part = trim(rawPart);
        if (part.empty()) {
            continue;
        }
        size_t colon = part.find(':');
        if (colon == std::string::npos) {
            throw std::runtime_error("bad sparse signal entry on line " + std::to_string(lineNumber));
        }
        int index = std::stoi(part.substr(0, colon));
        float value = std::stof(part.substr(colon + 1));
        if (index < 0 || index >= static_cast<int>(Width)) {
            throw std::runtime_error(name + " signal index out of range on line " + std::to_string(lineNumber));
        }
        signal[index] = value;
    }
}

std::string fp(float value)
{
    std::ostringstream out;
    out << std::fixed << std::setprecision(6) << value;
    return out.str();
}

std::string slotLabelList(int base, const std::vector<std::string>& labels)
{
    std::ostringstream out;
    for (size_t i = 0; i < labels.size(); ++i) {
        if (i != 0) {
            out << "; ";
        }
        out << "output[" << (base + static_cast<int>(i)) << "] = " << labels[i];
    }
    return out.str();
}

void addClassificationTargetComments(TrainingExample& example, int outputBase,
                                     const std::vector<std::string>& outputLabels, int cls)
{
    example.comments.push_back("Output candidates: " + slotLabelList(outputBase, outputLabels) + ".");
    example.comments.push_back("Correct answer: choose output[" + std::to_string(outputBase + cls)
                               + "] = " + outputLabels[cls] + ".");
    example.comments.push_back("Evaluation rule: after inference, compare only those candidate outputs; the highest value is the predicted answer.");
    example.comments.push_back("Training target: output[" + std::to_string(outputBase + cls)
                               + "] is set to +0.900000, every other candidate output is set to -0.900000.");
}

void addClassificationTargetSlotComments(TrainingExample& example, int outputBase,
                                         const std::vector<std::string>& outputLabels,
                                         const std::vector<int>& candidateSlots,
                                         int correctSlot)
{
    std::ostringstream candidates;
    for (size_t i = 0; i < candidateSlots.size(); ++i) {
        const int slot = candidateSlots[i];
        const int labelIndex = slot - outputBase;
        if (i != 0) {
            candidates << "; ";
        }
        candidates << "output[" << slot << "] = " << outputLabels[labelIndex];
    }
    example.comments.push_back("Legal output candidates: " + candidates.str() + ".");
    example.comments.push_back("Correct answer: choose output[" + std::to_string(correctSlot)
                               + "] = " + outputLabels[correctSlot - outputBase] + ".");
    example.comments.push_back("Evaluation rule: after inference, compare only legal candidate outputs; the highest value is the predicted answer.");
    example.comments.push_back("Training target: output[" + std::to_string(correctSlot)
                               + "] is set to +0.900000, every other legal candidate output is set to -0.900000.");
}

void addSignalComment(std::vector<std::string>& comments, const std::string& signalName, int slot,
                      float value, const std::string& meaning)
{
    comments.push_back(signalName + "[" + std::to_string(slot) + "] = " + fp(value) + " means " + meaning + ".");
}

int local9SlotFromOld10Slot(int oldSlot)
{
    const int oldDi = oldSlot / 10 - 5;
    const int oldDj = oldSlot % 10 - 5;
    const int di = std::max(-4, std::min(4, oldDi));
    const int dj = std::max(-4, std::min(4, oldDj));
    return (di + 4) * 9 + (dj + 4);
}

std::vector<std::string> actionLabels()
{
    return {
        "goto",
        "wait",
        "build city",
        "road to",
        "irrigate",
        "chop forest",
        "build improvement",
        "attack"
    };
}

std::vector<int> actionDecisionSlotsForFamily(int outputBase, const std::string& family)
{
    if (family == "settler") {
        return { outputBase + 0, outputBase + 1, outputBase + 2 };
    }
    if (family == "worker") {
        return { outputBase + 0, outputBase + 1, outputBase + 3, outputBase + 4, outputBase + 5, outputBase + 6 };
    }
    if (family == "explorer") {
        return { outputBase + 0, outputBase + 1 };
    }
    if (family == "warrior" || family == "slinger" || family == "archer" || family == "horseman") {
        return { outputBase + 0, outputBase + 1, outputBase + 7 };
    }
    return slotRange(outputBase, AI_PLAYER_COMMAND_FLOATS);
}

TrainingExample makeActionUnitSituation(const std::vector<std::string>& labels,
                                        const std::string& family,
                                        const std::string& title,
                                        float unitTypeSignal,
                                        int commandClass,
                                        float currentTerrain,
                                        float currentResource,
                                        float nearbyResource,
                                        float freshWater,
                                        float cityPlotScore,
                                        float cityDistance,
                                        float agePressure,
                                        int cueSlot,
                                        float cueValue,
                                        const std::string& cueMeaning,
                                        const std::string& decisionMeaning,
                                        float strategyTargetX = 0.0f,
                                        float strategyTargetY = 0.0f,
                                        float strategyMilitaryPriority = 0.0f,
                                        float strategyDefensePriority = 0.0f,
                                        float immediateActionSignal = 0.0f)
{
    constexpr int object = 0;
    const int objectBase = object * AI_PLAYER_OBJECT_FLOATS;
    const int outputBase = object * AI_PLAYER_COMMAND_FLOATS;
    TrainingExample ex;
    ex.input = zeroInputSignal();
    ex.target = zeroOutputSignal();
    ex.explanation = "action " + family + " case: " + title;
    ex.decisionSlots = actionDecisionSlotsForFamily(outputBase, family);
    ex.correctSlot = outputBase + commandClass;
    for (int slot : ex.decisionSlots) {
        ex.target[slot] = -0.9f;
    }
    ex.target[ex.correctSlot] = 0.9f;

    ex.input[objectBase + 0] = unitTypeSignal;
    ex.input[objectBase + 4] = 1.0f;
    ex.input[objectBase + 5] = 0.2f;
    ex.input[objectBase + 6] = 1.0f;
    ex.input[objectBase + 8] = immediateActionSignal;
    ex.input[objectBase + 9] = currentTerrain;
    ex.input[objectBase + 10] = currentResource;
    ex.input[objectBase + 11] = nearbyResource;
    ex.input[objectBase + 12] = freshWater;
    ex.input[objectBase + 13] = cityPlotScore;
    ex.input[objectBase + 14] = agePressure;
    ex.input[objectBase + 15] = cityDistance;
    const int localCueSlot = local9SlotFromOld10Slot(cueSlot);
    ex.input[objectBase + 16 + localCueSlot] = cueValue;
    ex.input[objectBase + 97] = strategyTargetX;
    ex.input[objectBase + 98] = strategyTargetY;
    ex.input[objectBase + 99] = strategyMilitaryPriority;
    ex.input[objectBase + 100] = strategyDefensePriority;
    ex.input[AI_PLAYER_SITUATION_BASE + 0] = 0.50f;
    ex.input[AI_PLAYER_SITUATION_BASE + 5] = 0.35f;
    ex.input[AI_PLAYER_SITUATION_BASE + 8] = 0.25f;

    ex.comments.push_back("Purpose: teach Action engine " + family + " behavior from unit status, terrain, resource, fog, city, and local 9x9 window cues.");
    ex.comments.push_back("Object ids are not encoded. Output command record 0 applies to the first unit id stored by ai.js for object record 0.");
    ex.comments.push_back("Action object fields used here: input[0]=unit type, input[8]=immediate action signal, input[9]=current terrain, input[10]=current resource value, input[11]=nearby resource score, input[12]=fresh-water flag, input[13]=city plot score or tactical usefulness, input[14]=age/pressure, input[15]=nearest friendly city distance.");
    ex.comments.push_back("Local 9x9 window slots are input[16..96], scanned row-major from map offset di=-4,dj=-4 to di=+4,dj=+4. Slot input[56] is the center tile under this unit. Negative local values such as -0.200000 represent fog-of-war or unknown tiles.");
    ex.comments.push_back("Forwarded strategy focus fields are relative to this unit: input[97]=target dx, input[98]=target dy, input[99]=military attack priority, input[100]=defense priority. dx/dy are normalized by the 9x9 window radius of 4 tiles.");
    if (strategyMilitaryPriority > 0.01f && (family == "settler" || family == "worker" || family == "explorer")) {
        ex.comments.push_back("Civilian danger rule: this civil unit sees a high military-priority strategy focus, so goto means run away from those focus coordinates rather than attack.");
    }
    ex.comments.push_back("Cue meaning: " + cueMeaning + ".");
    ex.comments.push_back("Decision meaning: " + decisionMeaning + ".");
    addClassificationTargetSlotComments(ex, outputBase, labels, ex.decisionSlots, ex.correctSlot);
    addSignalComment(ex.comments, "input", objectBase + 0, ex.input[objectBase + 0],
                     "unit type normalized as unitTypeIndex/32");
    addSignalComment(ex.comments, "input", objectBase + 9, ex.input[objectBase + 9],
                     "current tile terrain type normalized as terrainType/8");
    if (immediateActionSignal > 0.0f) {
        addSignalComment(ex.comments, "input", objectBase + 8, ex.input[objectBase + 8],
                         "immediate action signal: workers use 0.80 improvement, 0.60 irrigation, 0.45 chop, 0.30 road, 0.20 road-to; military uses 0.70 adjacent enemy, 0.50 defensive hill");
    }
    addSignalComment(ex.comments, "input", objectBase + 16 + localCueSlot,
                     ex.input[objectBase + 16 + localCueSlot],
                     "main local 9x9 cue driving this action");
    addSignalComment(ex.comments, "input", objectBase + 99, ex.input[objectBase + 99],
                     "forwarded strategy military attack priority");
    return ex;
}

} // namespace

DensePerceptronEngine::DensePerceptronEngine(uint32_t seed)
{
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> small(-0.002f, 0.002f);
    for (int layer = 0; layer < kLayerCount; ++layer) {
        const int inWidth = kLayerWidths[layer];
        const int outWidth = kLayerWidths[layer + 1];
        layers_[layer].inputWidth = inWidth;
        layers_[layer].outputWidth = outWidth;
        layers_[layer].weights.assign(inWidth * outWidth, 0.0f);
        layers_[layer].bias.assign(outWidth, 0.0f);
        if (layer == 0) {
            for (int object = 0; object < AI_PLAYER_OBJECT_COUNT; ++object) {
                const int objectInput = object * AI_PLAYER_OBJECT_FLOATS;
                const int summaryOutput = object * 16;
                for (int field = 0; field < 16; ++field) {
                    layers_[layer].weights[(summaryOutput + field) * inWidth + objectInput + field] = 1.0f;
                }
            }
            const std::array<int, 21> genericSlots = {
                1, 2, 3, 4, 5, 6, 10, 14, 15, 20, 21, 22, 23,
                24, 25, 26, 27, 28, 29, 30, 31
            };
            for (int field = 0; field < static_cast<int>(genericSlots.size()); ++field) {
                layers_[layer].weights[(128 + field) * inWidth + AI_PLAYER_SITUATION_BASE + genericSlots[field]] = 1.0f;
            }
        }
        else if (layer == kLayerCount - 1) {
            for (float& weight : layers_[layer].weights) {
                weight = small(rng);
            }
        }
        else {
            for (int i = 0; i < std::min(inWidth, outWidth); ++i) {
                layers_[layer].weights[i * inWidth + i] = 1.0f;
            }
        }
    }
}

float DensePerceptronEngine::activate(float x)
{
    return std::tanh(x);
}

float DensePerceptronEngine::activateDerivativeFromOutput(float y)
{
    return 1.0f - y * y;
}

std::vector<int> DensePerceptronEngine::activeIndices(const std::vector<float>& values)
{
    std::vector<int> active;
    active.reserve(64);
    for (int k = 0; k < static_cast<int>(values.size()); ++k) {
        if (std::fabs(values[k]) > 1.0e-6f) {
            active.push_back(k);
        }
    }
    return active;
}

OutputSignal DensePerceptronEngine::forward(const InputSignal& input) const
{
    std::vector<float> current(input.begin(), input.end());
    for (int layer = 0; layer < kLayerCount; ++layer) {
        const Layer& currentLayer = layers_[layer];
        std::vector<float> next(currentLayer.outputWidth, 0.0f);
        for (int out = 0; out < currentLayer.outputWidth; ++out) {
            float sum = currentLayer.bias[out];
            const float* row = &currentLayer.weights[out * currentLayer.inputWidth];
            for (int in = 0; in < currentLayer.inputWidth; ++in) {
                if (std::fabs(current[in]) > 1.0e-6f) {
                    sum += row[in] * current[in];
                }
            }
            next[out] = activate(sum);
        }
        current = std::move(next);
    }
    OutputSignal output{};
    output.fill(0.0f);
    for (int out = 0; out < kOutputWidth; ++out) {
        output[out] = current[out];
    }
    return output;
}

std::vector<float> DensePerceptronEngine::hiddenBeforeLast(const InputSignal& input) const
{
    std::vector<float> hidden(input.begin(), input.end());
    for (int layer = 0; layer < kLayerCount - 1; ++layer) {
        const Layer& currentLayer = layers_[layer];
        std::vector<float> next(currentLayer.outputWidth, 0.0f);
        for (int out = 0; out < currentLayer.outputWidth; ++out) {
            float sum = currentLayer.bias[out];
            const float* row = &currentLayer.weights[out * currentLayer.inputWidth];
            for (int in = 0; in < currentLayer.inputWidth; ++in) {
                if (std::fabs(hidden[in]) > 1.0e-6f) {
                    sum += row[in] * hidden[in];
                }
            }
            next[out] = activate(sum);
        }
        hidden = std::move(next);
    }
    return hidden;
}

OutputSignal DensePerceptronEngine::forwardFromHidden(const std::vector<float>& hidden) const
{
    const Layer& last = layers_[kLayerCount - 1];
    OutputSignal output{};
    output.fill(0.0f);
    for (int out = 0; out < kOutputWidth; ++out) {
        float sum = last.bias[out];
        const float* row = &last.weights[out * last.inputWidth];
        for (int in = 0; in < last.inputWidth; ++in) {
            if (std::fabs(hidden[in]) > 1.0e-6f) {
                sum += row[in] * hidden[in];
            }
        }
        output[out] = activate(sum);
    }
    return output;
}

void DensePerceptronEngine::saveBinary(const std::string& path) const
{
    std::ofstream out(path, std::ios::binary);
    if (!out) {
        throw std::runtime_error("could not write model database: " + path);
    }

    BinaryModelHeader header{};
    header.magic[0] = 'A';
    header.magic[1] = 'I';
    header.magic[2] = 'C';
    header.magic[3] = 'I';
    header.magic[4] = 'V';
    header.magic[5] = 'A';
    header.magic[6] = 'I';
    header.magic[7] = '\0';
    header.version = 2;
    header.width = kInputWidth;
    header.layer_count = kLayerCount;
    header.activation = 1; // tanh
    header.weight_layout = 1; // row-major [out][in]
    header.reserved[0] = kInputWidth;
    header.reserved[1] = kOutputWidth;
    for (int layer = 0; layer < kLayerCount; ++layer) {
        header.reserved[2 + layer] = kLayerWidths[layer + 1];
    }

    out.write(reinterpret_cast<const char*>(&header), sizeof(header));
    for (const Layer& layer : layers_) {
        out.write(reinterpret_cast<const char*>(layer.weights.data()),
                  static_cast<std::streamsize>(layer.weights.size() * sizeof(float)));
        out.write(reinterpret_cast<const char*>(layer.bias.data()),
                  static_cast<std::streamsize>(layer.bias.size() * sizeof(float)));
    }

    if (!out) {
        throw std::runtime_error("failed while writing model database: " + path);
    }
}

float DensePerceptronEngine::trainDecisionSlots(const TrainingExample& example, float learningRate)
{
    return trainDecisionSlotsFromHidden(example, hiddenBeforeLast(example.input), learningRate);
}

float DensePerceptronEngine::trainDecisionSlotsFromHidden(const TrainingExample& example,
                                                          const std::vector<float>& hidden,
                                                          float learningRate)
{
    std::vector<int> trainSlots = example.decisionSlots;
    for (int out = 0; out < kOutputWidth; ++out) {
        if (std::fabs(example.target[out]) > 1.0e-6f
            && std::find(trainSlots.begin(), trainSlots.end(), out) == trainSlots.end()) {
            trainSlots.push_back(out);
        }
    }

    OutputSignal output = forwardFromHidden(hidden);
    std::vector<int> active = activeIndices(hidden);
    float loss = 0.0f;
    Layer& last = layers_[kLayerCount - 1];
    for (int out : trainSlots) {
        if (out < 0 || out >= kOutputWidth) {
            continue;
        }
        float error = output[out] - example.target[out];
        loss += error * error;
        float delta = error * activateDerivativeFromOutput(output[out]);
        float* row = &last.weights[out * last.inputWidth];
        for (int in : active) {
            row[in] -= learningRate * delta * hidden[in];
        }
        last.bias[out] -= learningRate * delta;
    }
    return loss / std::max<size_t>(1, trainSlots.size());
}

float DensePerceptronEngine::trainFullBackprop(const InputSignal& input, const OutputSignal& target, float learningRate)
{
    std::vector<std::vector<float>> activations(kLayerCount + 1);
    activations[0].assign(input.begin(), input.end());

    for (int layer = 0; layer < kLayerCount; ++layer) {
        const Layer& current = layers_[layer];
        std::vector<float> next(current.outputWidth, 0.0f);
        for (int out = 0; out < current.outputWidth; ++out) {
            float sum = current.bias[out];
            const float* row = &current.weights[out * current.inputWidth];
            for (int in = 0; in < current.inputWidth; ++in) {
                sum += row[in] * activations[layer][in];
            }
            next[out] = activate(sum);
        }
        activations[layer + 1] = std::move(next);
    }

    std::vector<std::vector<float>> deltas(kLayerCount);
    float loss = 0.0f;
    deltas[kLayerCount - 1].assign(kOutputWidth, 0.0f);
    for (int i = 0; i < kOutputWidth; ++i) {
        float error = activations[kLayerCount][i] - target[i];
        loss += error * error;
        deltas[kLayerCount - 1][i] = error * activateDerivativeFromOutput(activations[kLayerCount][i]);
    }

    for (int layer = kLayerCount - 2; layer >= 0; --layer) {
        deltas[layer].assign(layers_[layer].outputWidth, 0.0f);
        const Layer& next = layers_[layer + 1];
        for (int in = 0; in < layers_[layer].outputWidth; ++in) {
            float sum = 0.0f;
            for (int out = 0; out < next.outputWidth; ++out) {
                sum += next.weights[out * next.inputWidth + in] * deltas[layer + 1][out];
            }
            deltas[layer][in] = sum * activateDerivativeFromOutput(activations[layer + 1][in]);
        }
    }

    for (int layer = 0; layer < kLayerCount; ++layer) {
        Layer& current = layers_[layer];
        for (int out = 0; out < current.outputWidth; ++out) {
            float delta = deltas[layer][out];
            float* row = &current.weights[out * current.inputWidth];
            for (int in = 0; in < current.inputWidth; ++in) {
                row[in] -= learningRate * delta * activations[layer][in];
            }
            current.bias[out] -= learningRate * delta;
        }
    }
    return loss / kOutputWidth;
}

AIEngine::AIEngine(Schema schema, uint32_t seed)
    : schema_(std::move(schema)), network_(seed)
{
}

TrainingReport AIEngine::train(const std::vector<TrainingExample>& examples, int epochs, float learningRate, std::ostream& out)
{
    struct CachedExample {
        const TrainingExample* example = nullptr;
        std::vector<float> hidden;
    };
    std::vector<CachedExample> cached;
    cached.reserve(examples.size());
    for (const TrainingExample& example : examples) {
        cached.push_back({ &example, network_.hiddenBeforeLast(example.input) });
    }

    auto evaluateCached = [&]() {
        TrainingReport report;
        int correct = 0;
        float loss = 0.0f;
        for (const CachedExample& item : cached) {
            const TrainingExample& example = *item.example;
            OutputSignal output = network_.forwardFromHidden(item.hidden);
            for (int slot : example.decisionSlots) {
                float error = output[slot] - example.target[slot];
                loss += error * error;
            }
            if (argmaxSlots(output, example.decisionSlots) == example.correctSlot) {
                ++correct;
            }
        }
        report.loss = loss / std::max<size_t>(1, cached.size());
        report.accuracy = static_cast<float>(correct) / std::max<size_t>(1, cached.size());
        return report;
    };

    TrainingReport report;
    for (int epoch = 1; epoch <= epochs; ++epoch) {
        float loss = 0.0f;
        for (const CachedExample& item : cached) {
            loss += network_.trainDecisionSlotsFromHidden(*item.example, item.hidden, learningRate);
        }
        report = evaluateCached();
        if (epoch == 1 || epoch % 10 == 0 || epoch == epochs) {
            out << schema_.name << " epoch " << std::setw(3) << epoch
                << " train_loss=" << std::fixed << std::setprecision(5) << loss / examples.size()
                << " eval_loss=" << report.loss
                << " accuracy=" << std::setprecision(1) << report.accuracy * 100.0f << "%\n";
        }
        if (report.accuracy >= 0.90f && epoch >= 20) {
            out << schema_.name << " early stop at epoch " << epoch
                << " accuracy=" << std::setprecision(1) << report.accuracy * 100.0f << "%\n";
            break;
        }
    }
    return report;
}

StrategyEngine::StrategyEngine() : AIEngine(makeStrategySchema(), 11) {}
TacticsEngine::TacticsEngine() : AIEngine(makeTacticsSchema(), 22) {}
ActionEngine::ActionEngine() : AIEngine(makeActionSchema(), 33) {}
EconomicsEngine::EconomicsEngine() : AIEngine(makeEconomicsSchema(), 44) {}

Schema makeStrategySchema()
{
    Schema schema{EngineKind::Strategy, "strategy", {}, {}};
    addField(schema.input, 0, 479, "objects[0..3] civilization_status[4][120]", "records",
             "four known civilizations without ids: relation, population, cities, military, science, economy, income, technology, threat, trust, distance, expansion");
    addField(schema.input, 480, 959, "objects[4..7] military_force_weight[4][120]", "records",
             "four force centers without ids: relation, x/y center, land/naval strength, mobility, wounded ratio, border pressure, siege pressure, reserve");
    addField(schema.input, 960, 1023, "general_situation[64]", "FP32",
             "own civilization metrics, map knowledge, economy, technology pressure, diplomacy pressure, expansion pressure; slots 1,2,4,14,15 and 20..23 carry city, total unit, military, settler, worker counts; slots 24..40 carry city/settler-neighborhood terrain, resource, coverage, and anchor statistics for research choice");
    addField(schema.output, 0, 63, "object_command[8][8]", "records",
             "per-object strategy output: slots 0..3 are focus_x, focus_y, military_priority, defense_priority; slots 4..7 are command scores");
    addField(schema.output, 64, 71, "general_decision[8]", "records",
             "general strategic decisions; slots 64..67 are production demand percentages for settlers, worker, explorer, military; slots 68..71 are technology priorities for Mining, Animal Husbandry, Masonry, Irrigation");
    return schema;
}

Schema makeTacticsSchema()
{
    Schema schema{EngineKind::Tactics, "tactics", {}, {}};
    addField(schema.input, 0, 959, "military_groups[8][120]", "records",
             "friendly and enemy military group state without ids: relation, type mix, count, center, movement direction, hp, attack, defense, speed, range, terrain, roads, threat");
    addField(schema.input, 960, 1023, "general_situation[64]", "FP32",
             "battle balance, focus point data, fog risk, city pressure, reinforcement availability, strategic priority; slots 23..26 carry forwarded strategy focus x/y/attack/defense priority");
    addField(schema.output, 0, 63, "group_command[8][8]", "records",
             "eight tactical commands corresponding to the eight military groups in input order");
    addField(schema.output, 64, 71, "general_decision[8]", "records",
             "general battle posture and unused reserved tactical decisions");
    return schema;
}

Schema makeActionSchema()
{
    Schema schema{EngineKind::Action, "action", {}, {}};
    addField(schema.input, 0, 959, "units[8][120]", "records",
             "own unit status without ids: type, state, x/y, hp, moves, relation, task, immediate action signal in slot 8, terrain/resource/fresh-water/city score, age, city distance, 9x9 local tile features in slots 16..96, forwarded relative strategy focus in slots 97..100");
    addField(schema.input, 960, 1023, "general_situation[64]", "FP32",
             "owner metrics, map knowledge, economy, science, visible resources, idle counts, tactical pressure");
    addField(schema.output, 0, 63, "unit_command[8][8]", "records",
             "eight unit commands corresponding to the eight input units in order");
    addField(schema.output, 64, 71, "general_decision[8]", "records",
             "reserved action-level decisions");
    return schema;
}

Schema makeEconomicsSchema()
{
    Schema schema{EngineKind::Economics, "economics", {}, {}};
    addField(schema.input, 0, 959, "cities[8][120]", "records",
             "city status without ids: x/y, population, food, production, money, storage, consumption, growth, frontier, seaside, garrison, 9x9 tile food/production/money and landscape features, production legality in slots 97..100");
    addField(schema.input, 960, 1023, "general_situation[64]", "FP32",
             "global economics metrics: money, income, science rate, city counts, unit counts, map knowledge, visible resources; slots 1,2,5,6,14,15 carry city/free-city/military/enemy/idle/worker counts, slot 16 carries opened technology rate, and slots 20..23 carry Strategy production demand percentages for settlers, worker, explorer, military");
    addField(schema.output, 0, 63, "city_command[8][8]", "records",
             "eight production decisions corresponding to the eight input cities in order");
    addField(schema.output, 64, 71, "general_decision[8]", "records",
             "general budget, science, emergency and reserve economic decisions");
    return schema;
}

std::vector<TrainingExample> makeObjectCommandExamples(const std::string& engineName,
                                                       const std::vector<std::string>& labels,
                                                       int count)
{
    std::vector<TrainingExample> examples;
    examples.reserve(count);
    for (int i = 0; i < count; ++i) {
        int object = i % AI_PLAYER_OBJECT_COUNT;
        int cls = (i / AI_PLAYER_OBJECT_COUNT) % AI_PLAYER_COMMAND_FLOATS;
        int objectBase = object * AI_PLAYER_OBJECT_FLOATS;
        int outputBase = object * AI_PLAYER_COMMAND_FLOATS;
        std::stringstream explanation;
        explanation << engineName << " object case " << i << ": object=" << object
                    << " command=" << cls << " -> " << labels[cls];
        TrainingExample ex;
        ex.input = zeroInputSignal();
        ex.target = zeroOutputSignal();
        ex.explanation = explanation.str();
        ex.decisionSlots = slotRange(outputBase, AI_PLAYER_COMMAND_FLOATS);
        ex.correctSlot = outputBase + cls;
        setOneHot(ex.target, outputBase, AI_PLAYER_COMMAND_FLOATS, cls);

        ex.input[objectBase + cls] = 1.0f;
        ex.input[objectBase + 8] = static_cast<float>(object + 1) / 8.0f;
        ex.input[objectBase + 9] = static_cast<float>(cls + 1) / 8.0f;
        ex.input[objectBase + 16 + (cls % 81)] = 0.6f;
        ex.input[AI_PLAYER_SITUATION_BASE + (cls % 12)] = 0.5f;

        ex.comments.push_back("Purpose: train the " + engineName + " engine to choose one 8-float command for one object record.");
        ex.comments.push_back("Object ids are not encoded. The game keeps ids in a side array and maps output command record "
                              + std::to_string(object) + " back to input object " + std::to_string(object) + ".");
        ex.comments.push_back("Situation facts: object record " + std::to_string(object)
                              + " has command cue " + std::to_string(cls)
                              + "; intended reading is \"" + labels[cls] + "\".");
        addClassificationTargetComments(ex, outputBase, labels, cls);
        addSignalComment(ex.comments, "input", objectBase + cls, ex.input[objectBase + cls],
                         "object-local command cue field inside the 120-float object record");
        addSignalComment(ex.comments, "input", objectBase + 8, ex.input[objectBase + 8],
                         "object-order marker used only by bootstrap examples, not a persistent object id");
        addSignalComment(ex.comments, "input", objectBase + 16 + (cls % 81), ex.input[objectBase + 16 + (cls % 81)],
                         "local 9x9 window or object-detail feature supporting the command");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + (cls % 12),
                         ex.input[AI_PLAYER_SITUATION_BASE + (cls % 12)],
                         "generic situation field supporting the same command class");
        examples.push_back(ex);
    }
    return examples;
}

std::vector<TrainingExample> makeStrategyExamples()
{
    const std::vector<std::string> labels = {
        "research production technology",
        "research naval technology",
        "focus anti-mounted units",
        "protect expansion point"
    };
    std::vector<TrainingExample> examples;
    examples.reserve(100);
    for (int i = 0; i < 100; ++i) {
        const int object = i % AI_PLAYER_OBJECT_COUNT;
        const int cls = (i / AI_PLAYER_OBJECT_COUNT) % 4;
        const int objectBase = object * AI_PLAYER_OBJECT_FLOATS;
        const int outputBase = object * AI_PLAYER_COMMAND_FLOATS;
        const float focusX = -0.75f + 0.50f * static_cast<float>(object % 4);
        const float focusY = -0.50f + 0.35f * static_cast<float>((i / 4) % 4);
        const float militaryPriority = cls == 2 ? 0.85f : (cls == 3 ? 0.35f : 0.15f);
        const float defensePriority = cls == 3 ? 0.80f : (cls == 2 ? 0.30f : 0.10f);

        TrainingExample ex;
        ex.input = zeroInputSignal();
        ex.target = zeroOutputSignal();
        ex.explanation = "strategy focus case " + std::to_string(i) + ": object=" + std::to_string(object)
            + " command_slot=" + std::to_string(4 + cls) + " -> " + labels[cls];
        ex.decisionSlots = slotRange(outputBase + 4, 4);
        ex.correctSlot = outputBase + 4 + cls;
        setOneHot(ex.target, outputBase + 4, 4, cls);
        ex.target[outputBase + 0] = focusX;
        ex.target[outputBase + 1] = focusY;
        ex.target[outputBase + 2] = militaryPriority;
        ex.target[outputBase + 3] = defensePriority;

        ex.input[objectBase + 0] = object < 4 ? -0.25f + object * 0.20f : 0.20f;
        ex.input[objectBase + 1] = focusX;
        ex.input[objectBase + 2] = focusY;
        ex.input[objectBase + 3] = militaryPriority;
        ex.input[objectBase + 4] = defensePriority;
        ex.input[objectBase + 8] = static_cast<float>(object + 1) / 8.0f;
        ex.input[objectBase + 9] = static_cast<float>(cls + 1) / 4.0f;
        ex.input[objectBase + 16 + (cls % 100)] = 0.6f;
        ex.input[AI_PLAYER_SITUATION_BASE + (cls % 12)] = 0.5f;

        ex.comments.push_back("Purpose: teach Strategy engine that output slots 0..3 of each object record are typed focus values, not command scores.");
        ex.comments.push_back("Output focus fields: output[" + std::to_string(outputBase + 0) + "]=target x, output[" + std::to_string(outputBase + 1) + "]=target y, output[" + std::to_string(outputBase + 2) + "]=military attack priority, output[" + std::to_string(outputBase + 3) + "]=defense priority.");
        ex.comments.push_back("The browser forwards the record with maximum military attack priority to Tactics general_situation[23..26] and converts it to Action unit slots [97..100] as target dx, target dy, military priority, and defense priority relative to each unit.");
        ex.comments.push_back("Strategy command candidates for this object are only output slots " + std::to_string(outputBase + 4) + ".." + std::to_string(outputBase + 7) + "; first four floats are never selected as commands.");
        ex.comments.push_back("Civilian Action examples interpret high forwarded military priority near their position as danger and choose goto to run out of the focus area.");
        addClassificationTargetComments(ex, outputBase + 4, labels, cls);
        addSignalComment(ex.comments, "input", objectBase + 1, ex.input[objectBase + 1],
                         "known or calculated focus x coordinate normalized to [-1,1]");
        addSignalComment(ex.comments, "input", objectBase + 2, ex.input[objectBase + 2],
                         "known or calculated focus y coordinate normalized to [-1,1]");
        addSignalComment(ex.comments, "target", outputBase + 2, ex.target[outputBase + 2],
                         "military attack priority forwarded to lower-level engines");
        examples.push_back(ex);
    }
    return examples;
}

std::vector<TrainingExample> makeStrategyDemandExamples()
{
    std::vector<TrainingExample> examples;
    examples.reserve(96);
    struct Case {
        const char* title;
        float units;
        float cities;
        float settlers;
        float workers;
        float military;
        float enemyMilitary;
        float money;
        float knownMap;
        std::array<float, 4> demand;
        int strongest;
        const char* decision;
    };
    const std::vector<Case> cases = {
        { "no cities and no settlers", 0.00f, 0.00f, 0.00f, 0.00f, 0.00f, 0.00f, 0.20f, 0.10f, {0.90f, 0.05f, 0.03f, 0.02f}, 0, "make settlers the dominant demand because expansion is impossible without them" },
        { "one city no settler and no worker", 0.05f, 0.06f, 0.00f, 0.00f, 0.06f, 0.00f, 0.25f, 0.15f, {0.45f, 0.35f, 0.15f, 0.05f}, 0, "ask for settlers first and workers second for early expansion" },
        { "one city already has several explorers and no worker", 0.08f, 0.06f, 0.00f, 0.00f, 0.00f, 0.00f, 0.25f, 0.12f, {0.20f, 0.65f, 0.05f, 0.10f}, 1, "do not ask for more explorers when the only city has no worker and existing units are non-military scouts" },
        { "one city several explorers and no defender", 0.08f, 0.06f, 0.00f, 0.12f, 0.00f, 0.00f, 0.25f, 0.18f, {0.25f, 0.35f, 0.05f, 0.35f}, 1, "worker remains the largest need, with military second, because extra scout-like units do not improve the city" },
        { "two cities and no workers", 0.10f, 0.13f, 0.12f, 0.00f, 0.08f, 0.00f, 0.30f, 0.20f, {0.25f, 0.55f, 0.15f, 0.05f}, 1, "make workers the main demand because cities need tile development" },
        { "few explored tiles and enough workers", 0.12f, 0.13f, 0.12f, 0.25f, 0.08f, 0.00f, 0.30f, 0.08f, {0.20f, 0.15f, 0.55f, 0.10f}, 2, "make explorers the main demand because map knowledge is low and worker coverage exists" },
        { "enemy military is stronger", 0.16f, 0.18f, 0.05f, 0.20f, 0.10f, 0.45f, 0.35f, 0.35f, {0.10f, 0.10f, 0.05f, 0.75f}, 3, "make military the main demand under war pressure" },
        { "many cities behind on workers", 0.30f, 0.35f, 0.05f, 0.10f, 0.22f, 0.20f, 0.55f, 0.45f, {0.10f, 0.70f, 0.05f, 0.15f}, 1, "large empire with too few workers should prioritize workers" },
        { "safe economy with few cities", 0.14f, 0.12f, 0.00f, 0.15f, 0.18f, 0.05f, 0.70f, 0.55f, {0.65f, 0.15f, 0.05f, 0.15f}, 0, "safe economy should expand with settlers" },
        { "frontier war economy", 0.25f, 0.25f, 0.06f, 0.20f, 0.15f, 0.65f, 0.45f, 0.40f, {0.15f, 0.15f, 0.05f, 0.65f}, 3, "frontier pressure should move production toward military" },
    };

    for (int repeat = 0; repeat < 96; ++repeat) {
        const Case& c = cases[repeat % cases.size()];
        TrainingExample ex;
        ex.input = zeroInputSignal();
        ex.target = zeroOutputSignal();
        ex.explanation = std::string("strategy production demand case: ") + c.title;
        ex.decisionSlots = slotRange(64, 4);
        ex.correctSlot = 64 + c.strongest;
        ex.input[AI_PLAYER_SITUATION_BASE + 1] = c.cities;
        ex.input[AI_PLAYER_SITUATION_BASE + 2] = c.units;
        ex.input[AI_PLAYER_SITUATION_BASE + 3] = c.knownMap;
        ex.input[AI_PLAYER_SITUATION_BASE + 4] = c.military;
        ex.input[AI_PLAYER_SITUATION_BASE + 5] = c.enemyMilitary;
        ex.input[AI_PLAYER_SITUATION_BASE + 6] = c.money;
        ex.input[AI_PLAYER_SITUATION_BASE + 14] = c.settlers;
        ex.input[AI_PLAYER_SITUATION_BASE + 15] = c.workers;
        ex.input[AI_PLAYER_SITUATION_BASE + 20] = c.settlers;
        ex.input[AI_PLAYER_SITUATION_BASE + 21] = c.workers;
        ex.input[AI_PLAYER_SITUATION_BASE + 22] = c.military;
        ex.input[AI_PLAYER_SITUATION_BASE + 23] = c.cities;
        for (int k = 0; k < 4; ++k) {
            ex.target[64 + k] = c.demand[k];
        }
        ex.comments.push_back("Purpose: teach Strategy general outputs 64..67 as city production demand percentages.");
        ex.comments.push_back("General inputs: input[961]=city count, input[962]=total unit count, input[964]=own military, input[965]=enemy military, input[974]=settlers, input[975]=workers, input[980..983]=settlers/workers/military/cities again as explicit demand counters.");
        ex.comments.push_back("General outputs: output[64]=settlers demand, output[65]=worker demand, output[66]=explorer demand, output[67]=military demand.");
        ex.comments.push_back(std::string("Decision meaning: ") + c.decision + ".");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 14, c.settlers, "current settler count normalized by 8");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 15, c.workers, "current worker count normalized by 8");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 2, c.units, "current total unit count normalized by 64; when high while workers and military are zero, existing units are mostly scouts/explorers");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 4, c.military, "current military count normalized by 64");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 1, c.cities, "current city count normalized by 16");
        addSignalComment(ex.comments, "target", 64, c.demand[0], "settlers production percentage demand");
        addSignalComment(ex.comments, "target", 65, c.demand[1], "worker production percentage demand");
        addSignalComment(ex.comments, "target", 66, c.demand[2], "explorer production percentage demand");
        addSignalComment(ex.comments, "target", 67, c.demand[3], "military production percentage demand");
        examples.push_back(ex);
    }
    return examples;
}

std::vector<TrainingExample> makeStrategyTechnologyExamples()
{
    std::vector<TrainingExample> examples;
    struct Case {
        const char* title;
        float hills;
        float mountains;
        float grass;
        float water;
        float animalResources;
        float stoneResources;
        float cropResources;
        float openedTechRate;
        std::array<float, 4> priority;
        int strongest;
        const char* decision;
        float forest = -1.0f;
        float freshWater = -1.0f;
        float cityAnchor = -1.0f;
        float settlerAnchor = -1.0f;
    };
    const std::vector<Case> cases = {
        { "cities near hills need mining", 0.70f, 0.10f, 0.35f, 0.05f, 0.05f, 0.05f, 0.10f, 0.00f, {0.85f, 0.10f, 0.10f, 0.15f}, 0, "open Mining because city rings contain many hills and mines unlock production" },
        { "cities near mountains need mining", 0.25f, 0.60f, 0.25f, 0.05f, 0.00f, 0.10f, 0.05f, 0.00f, {0.80f, 0.10f, 0.15f, 0.10f}, 0, "open Mining because mountain and hill terrain indicates mineral production" },
        { "animal resources need animal husbandry", 0.20f, 0.05f, 0.60f, 0.05f, 0.75f, 0.05f, 0.05f, 0.00f, {0.10f, 0.90f, 0.05f, 0.10f}, 1, "open Animal Husbandry because pasture/camp resources are near cities" },
        { "stone resources after mining need masonry", 0.35f, 0.15f, 0.35f, 0.05f, 0.05f, 0.80f, 0.05f, 0.08f, {0.15f, 0.05f, 0.90f, 0.10f}, 2, "open Masonry because stone and marble resources need quarry access after Mining" },
        { "crop and river city needs irrigation", 0.05f, 0.00f, 0.75f, 0.30f, 0.05f, 0.05f, 0.75f, 0.08f, {0.10f, 0.10f, 0.05f, 0.90f}, 3, "open Irrigation because crop resources and water-heavy city rings need farms" },
        { "balanced new empire with hills chooses mining first", 0.45f, 0.10f, 0.45f, 0.10f, 0.20f, 0.15f, 0.15f, 0.00f, {0.65f, 0.20f, 0.10f, 0.20f}, 0, "prefer Mining as first production technology when hills are visible" },
        { "many cattle and sheep chooses animal husbandry", 0.20f, 0.05f, 0.55f, 0.10f, 0.65f, 0.10f, 0.20f, 0.00f, {0.15f, 0.75f, 0.10f, 0.20f}, 1, "prefer Animal Husbandry when animal resources dominate the city ring" },
        { "mining already open and stone nearby chooses masonry", 0.30f, 0.10f, 0.45f, 0.10f, 0.10f, 0.70f, 0.10f, 0.12f, {0.05f, 0.10f, 0.85f, 0.15f}, 2, "prefer Masonry when stone resources are present and early mining path is started" },
        { "wet crop land chooses irrigation", 0.05f, 0.00f, 0.70f, 0.45f, 0.10f, 0.05f, 0.60f, 0.05f, {0.10f, 0.15f, 0.05f, 0.80f}, 3, "prefer Irrigation when city rings contain water and crop resources" },
        { "many grass fields with fresh water choose irrigation", 0.05f, 0.00f, 0.82f, 0.32f, 0.05f, 0.05f, 0.25f, 0.00f, {0.05f, 0.10f, 0.05f, 0.85f}, 3, "open Irrigation because city or settler rings are dominated by workable wet fields" },
        { "settler field start with crops chooses irrigation", 0.10f, 0.00f, 0.78f, 0.18f, 0.05f, 0.05f, 0.45f, 0.00f, {0.05f, 0.10f, 0.05f, 0.85f}, 3, "open Irrigation because early field starts with crop resources need farms before other worker jobs" },
        { "flat grass without minerals chooses irrigation path", 0.00f, 0.00f, 0.75f, 0.02f, 0.05f, 0.05f, 0.05f, 0.00f, {0.05f, 0.15f, 0.10f, 0.75f}, 3, "prefer Irrigation as the non-mining growth path when no hills, mountains, or mineral terrain are visible" },
        { "flat wet fields without hills choose irrigation", 0.00f, 0.00f, 0.82f, 0.40f, 0.05f, 0.05f, 0.10f, 0.00f, {0.05f, 0.10f, 0.05f, 0.85f}, 3, "open Irrigation because flat grass with visible water should lead to farms, not mines" },
        { "flat crop fields without hills choose irrigation", 0.00f, 0.00f, 0.76f, 0.08f, 0.05f, 0.05f, 0.65f, 0.00f, {0.05f, 0.10f, 0.05f, 0.85f}, 3, "open Irrigation because crop resources on flat land need farm technology" },
        { "flat animal resources without hills choose animal husbandry", 0.00f, 0.00f, 0.68f, 0.08f, 0.80f, 0.05f, 0.08f, 0.00f, {0.05f, 0.85f, 0.05f, 0.15f}, 1, "open Animal Husbandry because flat pasture resources should not be mistaken for Mining demand" },
        { "tiny accidental hill signal still chooses irrigation", 0.08f, 0.00f, 0.80f, 0.28f, 0.05f, 0.05f, 0.30f, 0.00f, {0.05f, 0.10f, 0.05f, 0.85f}, 3, "ignore small noisy hill statistics when wet field pressure dominates" },
        { "tiny accidental mountain signal still chooses irrigation", 0.00f, 0.04f, 0.80f, 0.25f, 0.05f, 0.05f, 0.30f, 0.00f, {0.05f, 0.10f, 0.05f, 0.85f}, 3, "ignore small noisy mountain statistics when wet field pressure dominates" },
        { "jungle city without hills chooses irrigation path", 0.00f, 0.00f, 0.78f, 0.04f, 0.05f, 0.05f, 0.10f, 0.00f, {0.05f, 0.15f, 0.05f, 0.75f}, 3, "avoid Mining when the visible city ring is jungle/forest with no hills, mountains, or mineral resources", 0.72f, 0.04f, 1.0f, 0.0f },
        { "jungle settler without hills chooses irrigation path", 0.00f, 0.00f, 0.82f, 0.06f, 0.05f, 0.05f, 0.08f, 0.00f, {0.05f, 0.15f, 0.05f, 0.75f}, 3, "avoid Mining before the first city when the settler only sees jungle/forest and no mining terrain", 0.78f, 0.06f, 0.0f, 1.0f },
        { "jungle with animals chooses animal husbandry", 0.00f, 0.00f, 0.72f, 0.05f, 0.70f, 0.05f, 0.05f, 0.00f, {0.05f, 0.80f, 0.05f, 0.15f}, 1, "prefer Animal Husbandry when jungle/forest context has visible animal resources but no mining terrain", 0.68f, 0.05f, 1.0f, 0.0f },
        { "jungle with crop river chooses irrigation", 0.00f, 0.00f, 0.76f, 0.22f, 0.05f, 0.05f, 0.45f, 0.00f, {0.05f, 0.10f, 0.05f, 0.85f}, 3, "prefer Irrigation when jungle/forest context has crop and fresh-water pressure but no mining terrain", 0.58f, 0.22f, 1.0f, 0.0f },
        { "pure jungle city no resources chooses irrigation path", 0.00f, 0.00f, 1.00f, 0.00f, 0.00f, 0.00f, 0.00f, 0.00f, {-0.80f, -0.20f, -0.80f, 0.80f}, 3, "reject Mining when a city sees only jungle/forest, zero resources, zero hills, zero mountains, and zero minerals", 1.00f, 0.00f, 1.0f, 0.0f },
        { "pure jungle settler no resources chooses irrigation path", 0.00f, 0.00f, 1.00f, 0.00f, 0.00f, 0.00f, 0.00f, 0.00f, {-0.80f, -0.20f, -0.80f, 0.80f}, 3, "reject Mining before founding when a settler sees only jungle/forest and no mining or resource signal", 1.00f, 0.00f, 0.0f, 1.0f },
        { "mostly forest city no resources chooses irrigation path", 0.00f, 0.00f, 0.88f, 0.02f, 0.00f, 0.00f, 0.00f, 0.00f, {-0.75f, -0.15f, -0.75f, 0.75f}, 3, "avoid Mining for a mostly forest city ring when all resource and mineral inputs are zero", 0.86f, 0.02f, 1.0f, 0.0f },
        { "mostly forest settler no resources chooses irrigation path", 0.00f, 0.00f, 0.88f, 0.02f, 0.00f, 0.00f, 0.00f, 0.00f, {-0.75f, -0.15f, -0.75f, 0.75f}, 3, "avoid Mining for a mostly forest settler ring when all resource and mineral inputs are zero", 0.86f, 0.02f, 0.0f, 1.0f },
        { "forest with tiny hill noise no resources chooses irrigation path", 0.03f, 0.00f, 0.90f, 0.00f, 0.00f, 0.00f, 0.00f, 0.00f, {-0.70f, -0.15f, -0.75f, 0.70f}, 3, "ignore tiny hill noise when forest dominates and no resources or minerals are visible", 0.88f, 0.00f, 1.0f, 0.0f },
    };

    for (int repeat = 0; repeat < 160; ++repeat) {
        const Case& c = cases[repeat % cases.size()];
        TrainingExample ex;
        ex.input = zeroInputSignal();
        ex.target = zeroOutputSignal();
        ex.explanation = std::string("strategy technology case: ") + c.title;
        ex.decisionSlots = slotRange(68, 4);
        ex.correctSlot = 68 + c.strongest;
        ex.input[AI_PLAYER_SITUATION_BASE + 24] = c.hills;
        ex.input[AI_PLAYER_SITUATION_BASE + 25] = c.mountains;
        ex.input[AI_PLAYER_SITUATION_BASE + 26] = c.grass;
        ex.input[AI_PLAYER_SITUATION_BASE + 27] = c.water;
        ex.input[AI_PLAYER_SITUATION_BASE + 28] = c.animalResources;
        ex.input[AI_PLAYER_SITUATION_BASE + 29] = c.stoneResources;
        ex.input[AI_PLAYER_SITUATION_BASE + 30] = c.cropResources;
        ex.input[AI_PLAYER_SITUATION_BASE + 31] = c.openedTechRate;
        ex.input[AI_PLAYER_SITUATION_BASE + 32] = 1.0f;
        ex.input[AI_PLAYER_SITUATION_BASE + 33] = std::max(0.0f, c.grass - c.hills - c.mountains);
        ex.input[AI_PLAYER_SITUATION_BASE + 34] = c.freshWater >= 0.0f ? c.freshWater : c.water;
        ex.input[AI_PLAYER_SITUATION_BASE + 35] = c.forest >= 0.0f ? c.forest : (c.grass > 0.60f && c.water < 0.10f ? 0.10f : 0.02f);
        ex.input[AI_PLAYER_SITUATION_BASE + 36] = 0.0f;
        ex.input[AI_PLAYER_SITUATION_BASE + 37] = std::max({ c.animalResources, c.stoneResources, c.cropResources });
        ex.input[AI_PLAYER_SITUATION_BASE + 38] = c.stoneResources > 0.40f ? c.stoneResources * 0.5f : 0.0f;
        ex.input[AI_PLAYER_SITUATION_BASE + 39] = c.cityAnchor >= 0.0f ? c.cityAnchor : (repeat % 3 == 0 ? 1.0f : 0.0f);
        ex.input[AI_PLAYER_SITUATION_BASE + 40] = c.settlerAnchor >= 0.0f ? c.settlerAnchor : (repeat % 3 == 0 ? 0.0f : 1.0f);
        setOneHot(ex.target, 68, 4, c.strongest);
        ex.comments.push_back("Purpose: teach Strategy general outputs 68..71 as specific technology priorities.");
        ex.comments.push_back("General inputs: input[984]=hills, [985]=mountains, [986]=grass, [987]=water, [988]=animal resources, [989]=stone resources, [990]=crop resources, [991]=opened technology rate.");
        ex.comments.push_back("Additional context: input[992]=visible context coverage, [993]=flat land, [994]=fresh water, [995]=forest, [996]=desert/snow, [997]=visible resource coverage, [998]=metal/mineral resources, [999]=city anchor, [1000]=settler anchor.");
        ex.comments.push_back("General outputs: output[68]=Mining priority, output[69]=Animal Husbandry priority, output[70]=Masonry priority, output[71]=Irrigation priority.");
        ex.comments.push_back(std::string("Decision meaning: ") + c.decision + ".");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 24, c.hills, "share of visible city-ring tiles that are hills");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 25, c.mountains, "share of visible city-ring tiles that are mountains or rocks");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 28, c.animalResources, "share/count signal for animal resources near owned cities");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 29, c.stoneResources, "share/count signal for stone or marble resources near owned cities");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 30, c.cropResources, "share/count signal for crop resources near owned cities");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 31, c.openedTechRate, "already opened technology ratio encoded as one float");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 32, ex.input[AI_PLAYER_SITUATION_BASE + 32], "visible city/settler context coverage; distinguishes real zero hills from missing context");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 33, ex.input[AI_PLAYER_SITUATION_BASE + 33], "flat non-mining land share around city or settler anchor");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 34, ex.input[AI_PLAYER_SITUATION_BASE + 34], "fresh water pressure around city or settler anchor");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 38, ex.input[AI_PLAYER_SITUATION_BASE + 38], "metal/mineral resource pressure around city or settler anchor");
        addSignalComment(ex.comments, "target", 68, ex.target[68], "Mining priority");
        addSignalComment(ex.comments, "target", 69, ex.target[69], "Animal Husbandry priority");
        addSignalComment(ex.comments, "target", 70, ex.target[70], "Masonry priority");
        addSignalComment(ex.comments, "target", 71, ex.target[71], "Irrigation priority");
        examples.push_back(ex);
    }
    return examples;
}

std::vector<TrainingExample> makeTacticsExamples()
{
    const std::vector<std::string> labels = {
        "attack",
        "defend",
        "flank",
        "retreat",
        "reinforce",
        "siege",
        "capture",
        "hold"
    };
    return makeObjectCommandExamples("tactics", labels, 100);
}

std::vector<TrainingExample> makeActionExamples()
{
    std::vector<TrainingExample> examples = makeActionBootstrapExamples();
    std::vector<TrainingExample> settlers = makeActionSettlerExamples();
    std::vector<TrainingExample> workers = makeActionWorkerExamples();
    std::vector<TrainingExample> explorers = makeActionExplorerExamples();
    std::vector<TrainingExample> warriors = makeActionWarriorExamples();
    std::vector<TrainingExample> slingers = makeActionSlingerExamples();
    std::vector<TrainingExample> archers = makeActionArcherExamples();
    std::vector<TrainingExample> horsemen = makeActionHorsemanExamples();
    examples.insert(examples.end(), settlers.begin(), settlers.end());
    examples.insert(examples.end(), workers.begin(), workers.end());
    examples.insert(examples.end(), explorers.begin(), explorers.end());
    examples.insert(examples.end(), warriors.begin(), warriors.end());
    examples.insert(examples.end(), slingers.begin(), slingers.end());
    examples.insert(examples.end(), archers.begin(), archers.end());
    examples.insert(examples.end(), horsemen.begin(), horsemen.end());
    return examples;
}

std::vector<TrainingExample> makeActionBootstrapExamples()
{
    return {};
}

std::vector<TrainingExample> makeActionSettlerExamples()
{
    const std::vector<std::string> labels = actionLabels();
    std::vector<TrainingExample> examples;

    struct SettlerActionCase {
        const char* title;
        int commandClass;
        float currentTerrain;
        float currentResource;
        float nearbyResource;
        float freshWater;
        float plotScore;
        float cityDistance;
        int cueSlot;
        float cueValue;
        const char* cueMeaning;
        const char* decisionMeaning;
    };

    const std::vector<SettlerActionCase> settlerCases = {
        {
            "settler stands on grass with A-bit local water source",
            2, 0.25f, 0.00f, 0.10f, 1.00f, 0.86f, 0.65f, 55, 0.37f,
            "local window center tile is grass plus A-bit land water source",
            "build city because field water source gives food and money immediately"
        },
        {
            "settler sees A-bit mountain water source from adjacent grass",
            2, 0.25f, 0.10f, 0.25f, 1.00f, 0.82f, 0.70f, 56, 0.75f,
            "local window tile east of center is mountain/rocks with the A bit set",
            "build city on adjacent grass because mountain spring supports the city"
        },
        {
            "settler is standing on A-bit mountain water source",
            0, 0.63f, 0.00f, 0.15f, 1.00f, 0.42f, 0.70f, 55, 0.75f,
            "local window center tile is mountain/rocks with the A bit set",
            "goto a nearby field because mountains are not the preferred city tile"
        },
        {
            "settler sees shallow lake north of a good grass tile",
            2, 0.25f, 0.00f, 0.20f, 1.00f, 0.84f, 0.60f, 45, 0.10f,
            "local window tile north of center is shallow lake water",
            "build city because lake access improves food and money around the city"
        },
        {
            "settler is on lake/water and must leave it",
            0, 0.00f, 0.00f, 0.25f, 1.00f, 0.00f, 0.55f, 55, 0.10f,
            "local window center tile is water/lake, not a land city tile",
            "goto land because cities cannot be built on water"
        },
        {
            "settler sees lake but current desert plot is poor",
            0, 0.13f, 0.00f, 0.10f, 1.00f, 0.36f, 0.80f, 54, 0.10f,
            "local window tile west of center is lake water",
            "goto a better field because lake alone does not save a poor desert plot"
        },
        {
            "settler sees A-bit field water source and opened food resource",
            2, 0.25f, 0.80f, 0.45f, 1.00f, 0.93f, 0.72f, 55, 0.47f,
            "local window center tile combines grass, A-bit water source, and food resource",
            "build city because resource plus local water is a strong settlement"
        },
        {
            "settler sees A-bit hill water source beside grass",
            2, 0.25f, 0.00f, 0.20f, 1.00f, 0.78f, 0.68f, 46, 0.62f,
            "local window north-east tile is hills with the A bit set",
            "build city on grass because hill water source adds nearby production support"
        },
        {
            "settler on A-bit hill should move to the adjacent field",
            0, 0.50f, 0.00f, 0.15f, 1.00f, 0.48f, 0.70f, 55, 0.62f,
            "local window center tile is hills with the A bit set",
            "goto the better field because hills are useful nearby but not ideal city center"
        },
        {
            "settler sees no water source and mediocre field",
            2, 0.25f, 0.00f, 0.00f, 0.00f, 0.44f, 0.76f, 55, 0.25f,
            "local window center tile is ordinary grass without A-bit water or lake",
            "build city because ordinary grass with enough spacing is acceptable under the more willing settlement policy"
        },
        {
            "settler on plain grass far from city with mixed nearby resources",
            2, 0.25f, 0.00f, 0.36f, 0.00f, 0.52f, 0.92f, 55, 0.25f,
            "center is normal grass; several neighboring resource signals are summarized by nearby resource score",
            "build city because grass plus varied surrounding resources is a generic acceptable start"
        },
        {
            "settler on grass beside forest and hills without visible water",
            2, 0.25f, 0.00f, 0.18f, 0.00f, 0.48f, 0.84f, 46, 0.50f,
            "north-east local window tile is hills and other nearby tiles imply forest production",
            "build city because mixed grass, forest, and hills gives balanced food and production"
        },
        {
            "settler on forest with nearby grass and food resource",
            0, 0.75f, 0.35f, 0.28f, 0.00f, 0.50f, 0.88f, 56, 0.25f,
            "center tile is forest carrying a generic visible resource signal",
            "goto because forest/jungle may support a nearby city but should not be the city center"
        },
        {
            "settler on grass with nearby hills production resource",
            2, 0.25f, 0.00f, 0.32f, 0.00f, 0.55f, 0.86f, 56, 0.60f,
            "east local window tile is hills with production/resource value",
            "build city because grass center and hill resources form a generic productive settlement"
        },
        {
            "settler on grasswater river tile with no opened resource",
            2, 0.88f, 0.00f, 0.08f, 1.00f, 0.58f, 0.80f, 55, 0.88f,
            "center tile is mixed grass-water river terrain",
            "build city because river grasswater is itself a strong generic settlement tile"
        },
        {
            "settler on grass near two generic luxury resources",
            2, 0.25f, 0.50f, 0.30f, 0.00f, 0.57f, 0.90f, 54, 0.35f,
            "west local window tile is a generic luxury/resource signal beside grass",
            "build city because multiple generic resources justify settling even without fresh water"
        },
        {
            "settler on hills with grass and food nearby",
            0, 0.50f, 0.00f, 0.42f, 0.00f, 0.53f, 0.95f, 45, 0.25f,
            "north local window tile is grass while nearby resource score represents food access",
            "goto because hills should provide nearby production rather than host the city center"
        },
        {
            "settler on grass beside mountain production and food resource",
            2, 0.25f, 0.00f, 0.44f, 0.00f, 0.59f, 0.94f, 56, 0.63f,
            "east local window tile is mountain/rocks and nearby score carries food/resource support",
            "build city because mountain production plus food nearby is a generic good city mix"
        },
        {
            "settler on generic grass after many turns searching",
            2, 0.25f, 0.00f, 0.08f, 0.00f, 0.44f, 0.82f, 55, 0.25f,
            "center tile is ordinary grass and unit age pressure says the settler has searched long enough",
            "build city because after enough turns a merely acceptable land tile is better than endless wandering"
        },
        {
            "settler on forest after many turns with mixed landscape",
            0, 0.75f, 0.00f, 0.16f, 0.00f, 0.43f, 0.82f, 55, 0.75f,
            "center tile is forest/jungle, no fresh water is present, and nearby resource support is weak",
            "goto because turn pressure alone must not make a jungle or forest without resources and water acceptable"
        },
        {
            "settler on desert with no resource should continue",
            0, 0.13f, 0.00f, 0.00f, 0.00f, 0.22f, 0.85f, 55, 0.13f,
            "center tile is desert and no surrounding resource or fresh water is encoded",
            "goto because generic desert without resources is not a city site"
        },
        {
            "settler on snow with one distant resource should continue",
            0, 0.38f, 0.00f, 0.08f, 0.00f, 0.24f, 0.90f, 55, 0.38f,
            "center tile is snow and only weak nearby resource support exists",
            "goto because weak snow starts should not be settled early"
        },
        {
            "settler too close to friendly city on good grass should continue",
            0, 0.25f, 0.35f, 0.25f, 1.00f, 0.34f, 0.12f, 55, 0.45f,
            "center tile is good grass/resource land but nearest friendly city distance is very small",
            "goto because settlement spacing is bad even when the local tile is decent"
        },
        {
            "settler on mountain with resources nearby should move to adjacent land",
            0, 0.63f, 0.60f, 0.30f, 0.00f, 0.39f, 0.88f, 55, 0.70f,
            "center tile is mountain/rocks with resource value but poor city-center terrain",
            "goto because mountain resources should support a nearby city rather than host the center"
        },
        {
            "settler on grass with no resources but very far from any city",
            2, 0.25f, 0.00f, 0.00f, 0.00f, 0.47f, 1.00f, 55, 0.25f,
            "center tile is ordinary grass and expansion distance is maximal",
            "build city because remote grass is acceptable for claiming territory"
        },
        {
            "settler founds first city on ordinary grass",
            2, 0.25f, 0.00f, 0.00f, 0.00f, 0.38f, 1.00f, 55, 0.25f,
            "center tile is ordinary grass and no friendly city exists yet",
            "build city because the first city should not wait for an ideal resource or water tile"
        },
        {
            "settler founds on clean grass after scouting",
            2, 0.25f, 0.00f, 0.05f, 0.00f, 0.41f, 0.82f, 56, 0.75f,
            "east local tile is jungle but center tile is clean grass with acceptable spacing",
            "build city because clean grass with enough distance is now acceptable"
        },
        {
            "settler founds on plain grass with forest nearby",
            2, 0.25f, 0.00f, 0.08f, 0.00f, 0.40f, 0.80f, 54, 0.75f,
            "west local tile is forest and center tile is clean grass",
            "build city because ordinary grass plus nearby production is sufficient"
        },
        {
            "settler founds on plain grass with hills nearby",
            2, 0.25f, 0.00f, 0.06f, 0.00f, 0.40f, 0.84f, 56, 0.50f,
            "east local tile is hills and center tile is clean grass",
            "build city because ordinary grass plus nearby hills is sufficient"
        },
        {
            "settler founds on old ordinary grass",
            2, 0.25f, 0.00f, 0.00f, 0.00f, 0.34f, 0.78f, 55, 0.25f,
            "center tile is ordinary grass and age pressure says wandering has gone long enough",
            "build city because aged settlers accept merely decent land"
        },
        {
            "settler on grass with forest belt and one commerce resource",
            2, 0.25f, 0.50f, 0.20f, 0.00f, 0.54f, 0.86f, 44, 0.75f,
            "north-west local window tile is forest and center has generic commerce/resource value",
            "build city because grass plus forest and commerce resource is a viable generic mix"
        },
        {
            "settler on grass near coast and resource",
            2, 0.25f, 0.35f, 0.22f, 0.00f, 0.51f, 0.82f, 56, 0.10f,
            "east local window tile is water/coast and center has resource value",
            "build city because coastal resource access is a generic acceptable settlement"
        },
        {
            "settler on mediocre grass beside enemy pressure should continue",
            0, 0.25f, 0.00f, 0.05f, 0.00f, 0.38f, 0.78f, 56, 0.10f,
            "local window includes weak land but no resource support; tactical pressure is implied by generic fields",
            "goto because mediocre land without support should keep searching"
        },
        {
            "settler on grass with direct food resource but no water",
            2, 0.25f, 0.80f, 0.12f, 0.00f, 0.56f, 0.84f, 55, 0.35f,
            "center tile is grass with a direct generic food resource signal",
            "build city because direct food resource compensates for missing fresh water"
        },
        {
            "settler on forest with direct production resource and nearby food",
            0, 0.75f, 0.60f, 0.25f, 0.00f, 0.55f, 0.86f, 56, 0.25f,
            "center forest tile carries a production/resource signal and nearby score carries food",
            "goto because resource forest should support a nearby grass city rather than become the center"
        },
        {
            "settler on grass with road/irrigation-like improved surroundings",
            2, 0.25f, 0.00f, 0.18f, 1.00f, 0.60f, 0.78f, 55, 0.47f,
            "center local signal is grass plus improvement/fresh-water support",
            "build city because improved or irrigated surroundings are strong enough without special resources"
        },
        {
            "settler on low-score land before turn limit should continue",
            2, 0.25f, 0.00f, 0.00f, 0.00f, 0.36f, 0.70f, 55, 0.25f,
            "center is ordinary grass and spacing is acceptable even without an ideal resource",
            "build city because first-city and long-search behavior should accept merely decent grass"
        },
        {
            "first city runtime ordinary grass score builds",
            2, 0.25f, 0.00f, 0.00f, 0.00f, 0.30f, 1.00f, 55, 0.25f,
            "center tile is ordinary grass with the exact runtime score produced by cityPlotScore",
            "build city because score 0.30 is the first-city threshold and must not loop as goto"
        },
        {
            "first city runtime ordinary grass with neighbor builds",
            2, 0.25f, 0.00f, 0.00f, 0.00f, 0.30f, 1.00f, 56, 0.25f,
            "east local tile is also ordinary grass and no city exists yet",
            "build city because several plain grass tiles still form an acceptable first settlement"
        },
        {
            "aged settler runtime ordinary grass builds",
            2, 0.25f, 0.00f, 0.00f, 0.00f, 0.30f, 0.82f, 55, 0.25f,
            "center tile is ordinary grass and the settler has already searched for several turns",
            "build city because score 0.30 is also enough for an aged settler to stop wandering"
        },
        {
            "settler on jungle with no resource and no water should continue",
            0, 0.75f, 0.00f, 0.00f, 0.00f, 0.30f, 0.86f, 55, 0.75f,
            "center tile is dense forest/jungle with no opened resource, no A-bit water source, and no lake or river nearby",
            "goto because jungle without resources and water is a poor city center"
        },
        {
            "settler on jungle without support after many turns should continue",
            0, 0.75f, 0.00f, 0.04f, 0.00f, 0.38f, 0.95f, 55, 0.75f,
            "center tile is still unsupported jungle; age pressure is not enough to settle it",
            "goto because the model should prefer moving to water or resource support instead of building a weak city"
        },
        {
            "settler on jungle next to plain grass but no water should continue",
            0, 0.75f, 0.00f, 0.08f, 0.00f, 0.36f, 0.88f, 56, 0.25f,
            "east local tile is ordinary grass but there is still no visible resource or fresh water",
            "goto because a single clean grass neighbor is not enough reason to build on jungle"
        },
        {
            "first city candidate on jungle should continue",
            0, 0.75f, 0.00f, 0.12f, 0.00f, 0.42f, 1.00f, 56, 0.47f,
            "east local tile is a better grass/water candidate while center is jungle",
            "goto because first-city pressure must not accept jungle as the city center"
        },
        {
            "old settler on jungle with nearby resource should continue",
            0, 0.75f, 0.20f, 0.22f, 0.00f, 0.44f, 0.95f, 56, 0.47f,
            "nearby resource and age pressure are present but center tile is still jungle",
            "goto because resources near jungle should pull the settler to an adjacent grass city center"
        },
        {
            "first city candidate on hills should continue",
            0, 0.50f, 0.00f, 0.35f, 0.00f, 0.53f, 1.00f, 56, 0.47f,
            "center tile is hills with a good grass resource candidate east",
            "goto because first-city pressure must not accept hills as the city center"
        },
        {
            "old settler on hills with food nearby should continue",
            0, 0.50f, 0.00f, 0.38f, 0.00f, 0.50f, 0.95f, 54, 0.47f,
            "nearby food exists but current city center would be hills",
            "goto because hills should be worked by a nearby grass city instead of hosting it"
        },
        {
            "settler on clean grass near jungle without water should continue",
            2, 0.25f, 0.00f, 0.05f, 0.00f, 0.41f, 0.82f, 56, 0.75f,
            "east local tile is jungle/forest and the settlement has no resource or water support",
            "build city because clean grass with adequate spacing should not wander forever"
        },
        {
            "settler on grass near water resource should build instead of jungle",
            2, 0.25f, 0.50f, 0.45f, 1.00f, 0.82f, 0.88f, 45, 0.10f,
            "north local tile is shallow water or lake and the area has visible resource support",
            "build city because water plus resources is a strong site, unlike unsupported jungle"
        },
        {
            "settler exact clean grass with spacing test builds",
            2, 0.25f, 0.00f, 0.05f, 0.00f, 0.41f, 0.82f, 56, 0.75f,
            "east local tile is jungle while center is clean grass matching the simulation test",
            "build city because clean grass at score 0.41 with good spacing is above the accepted threshold"
        },
        {
            "settler exact first city ordinary grass test builds",
            2, 0.25f, 0.00f, 0.00f, 0.00f, 0.41f, 1.00f, 56, 0.25f,
            "east local tile is ordinary grass and no city exists yet",
            "build city because the first city should be founded on ordinary grass instead of wandering"
        },
        {
            "settler first city plain grass without resource builds",
            2, 0.25f, 0.00f, 0.02f, 0.00f, 0.42f, 1.00f, 55, 0.25f,
            "center tile is clean grass with minimal nearby support",
            "build city because first-city pressure and acceptable grass score are sufficient"
        },
        {
            "settler clean grass beside jungle but acceptable score builds",
            2, 0.25f, 0.00f, 0.04f, 0.00f, 0.42f, 0.82f, 56, 0.75f,
            "east local tile is jungle but center grass is the candidate",
            "build city because nearby jungle should not override a valid clean grass center"
        }
    };

    for (const SettlerActionCase& c : settlerCases) {
        constexpr int object = 0;
        const int objectBase = object * AI_PLAYER_OBJECT_FLOATS;
        const int outputBase = object * AI_PLAYER_COMMAND_FLOATS;
        TrainingExample ex;
        ex.input = zeroInputSignal();
        ex.target = zeroOutputSignal();
        ex.explanation = std::string("action settler settlement case: ") + c.title;
        ex.decisionSlots = actionDecisionSlotsForFamily(outputBase, "settler");
        ex.correctSlot = outputBase + c.commandClass;
        for (int slot : ex.decisionSlots) {
            ex.target[slot] = -0.9f;
        }
        ex.target[ex.correctSlot] = 0.9f;

        ex.input[objectBase + 0] = 1.0f / 32.0f; // Settlers unit type index normalized by ai.js.
        ex.input[objectBase + 4] = 1.0f;         // Full health.
        ex.input[objectBase + 5] = 0.2f;         // One available movement point in normalized action input.
        ex.input[objectBase + 6] = 1.0f;         // Own unit relation.
        ex.input[objectBase + 9] = c.currentTerrain;
        ex.input[objectBase + 10] = c.currentResource;
        ex.input[objectBase + 11] = c.nearbyResource;
        ex.input[objectBase + 12] = c.freshWater;
        ex.input[objectBase + 13] = c.plotScore;
        ex.input[objectBase + 15] = c.cityDistance;
        const int localCueSlot = local9SlotFromOld10Slot(c.cueSlot);
        ex.input[objectBase + 16 + localCueSlot] = c.cueValue;
        ex.input[AI_PLAYER_SITUATION_BASE + 0] = 0.50f; // Enough economy to expand.
        ex.input[AI_PLAYER_SITUATION_BASE + 5] = 0.35f; // Known-map ratio around the settler.
        ex.input[AI_PLAYER_SITUATION_BASE + 8] = 0.25f; // Idle settler pressure.

        ex.comments.push_back("Purpose: teach Action engine settlement choices from generic terrain, resources, distance, fresh water, lakes, and A-bit land water sources.");
        ex.comments.push_back("Object ids are not encoded. Output command record 0 applies to the first unit id stored by ai.js for object record 0.");
        ex.comments.push_back("Action object fields used here: input[0]=unit type, input[9]=current terrain, input[10]=current resource value, input[11]=nearby resource score, input[12]=fresh-water flag, input[13]=city plot score, input[15]=distance to nearest friendly city.");
        ex.comments.push_back("A terrain byte with bit 7 set is the A-bit source flag. On land it means a water source in fields, hills, or mountains; in the local window it raises the tile signal above the base terrain value.");
        ex.comments.push_back("Local 9x9 window slots are input[16..96], scanned row-major from map offset di=-4,dj=-4 to di=+4,dj=+4. Slot input[" + std::to_string(objectBase + 16 + localCueSlot) + "] is the visible cue in this example; input[56] is the center tile under this settler.");
        ex.comments.push_back(std::string("Cue meaning: ") + c.cueMeaning + ".");
        ex.comments.push_back(std::string("Decision meaning: ") + c.decisionMeaning + ".");
        addClassificationTargetSlotComments(ex, outputBase, labels, ex.decisionSlots, ex.correctSlot);
        addSignalComment(ex.comments, "input", objectBase + 0, ex.input[objectBase + 0],
                         "Settlers unit type normalized as unitTypeIndex/32");
        addSignalComment(ex.comments, "input", objectBase + 9, ex.input[objectBase + 9],
                         "current tile terrain type normalized as terrainType/8");
        addSignalComment(ex.comments, "input", objectBase + 12, ex.input[objectBase + 12],
                         "fresh water is present on or near the settlement candidate");
        addSignalComment(ex.comments, "input", objectBase + 13, ex.input[objectBase + 13],
                         "city plot score calculated by ai.js from terrain, resources, water sources, and city distance");
        addSignalComment(ex.comments, "input", objectBase + 16 + localCueSlot,
                         ex.input[objectBase + 16 + localCueSlot],
                         "local 9x9 map cue for lake water or A-bit land water source");
        examples.push_back(ex);
    }

    examples.push_back(makeActionUnitSituation(labels, "settler", "settler inside forwarded military focus runs away",
                                               1.0f / 32.0f, 0, 0.25f, 0.00f, 0.20f, 0.00f, 0.58f, 0.80f, 0.10f,
                                               55, 0.25f,
                                               "center tile is acceptable grass, but strategy focus marks this area as dangerous",
                                               "goto because civilian settler should run out of high military-priority coordinates before building",
                                               0.00f, 0.00f, 0.90f, 0.15f));

    for (float age : {0.10f, 0.50f, 0.90f}) {
        examples.push_back(makeActionUnitSituation(labels, "settler",
                                                   "first-city plain grass runtime score builds after wandering age " + fp(age),
                                                   1.0f / 32.0f, 2, 0.25f, 0.00f, 0.00f, 0.00f, 0.30f, 1.00f, age,
                                                   55, 0.25f,
                                                   "center tile is ordinary grass with no city nearby and no special resource",
                                                   "build city because first-city plain grass at runtime score 0.30 must settle within ten turns"));
    }
    examples.push_back(makeActionUnitSituation(labels, "settler",
                                               "exact grass water resource settlement test builds",
                                               1.0f / 32.0f, 2, 0.25f, 0.80f, 0.45f, 1.00f, 0.82f, 0.88f, 0.00f,
                                               55, 0.47f,
                                               "center tile is grass with cattle-like food resource and A-bit water source",
                                               "build city because direct food, fresh water, and score 0.82 are a strong settlement"));
    examples.push_back(makeActionUnitSituation(labels, "settler",
                                               "aged grass water resource settlement test builds",
                                               1.0f / 32.0f, 2, 0.25f, 0.80f, 0.45f, 1.00f, 0.82f, 0.88f, 0.50f,
                                               55, 0.47f,
                                               "center tile remains a strong grass food resource site after several turns",
                                               "build city because wandering pressure should strengthen an already-good food and water city site"));

    struct SettlerForbiddenWorkerCase {
        const char* title;
        float terrain;
        float resource;
        float nearby;
        float fresh;
        float score;
        int slot;
        float cue;
        const char* cueText;
    };
    const std::vector<SettlerForbiddenWorkerCase> forbiddenWorkerCases = {
        { "settler on fresh grass must not irrigate", 0.25f, 0.00f, 0.08f, 1.00f, 0.40f, 55, 0.47f, "center tile looks like a worker irrigation target" },
        { "settler on grasswater must not irrigate", 0.88f, 0.00f, 0.08f, 1.00f, 0.42f, 55, 0.88f, "center tile is mixed grass-water but settler is not a worker" },
        { "settler on forest must not chop", 0.75f, 0.00f, 0.12f, 0.00f, 0.38f, 55, 0.75f, "center tile is forest but chopping is worker-only" },
        { "settler on forest resource must not improve", 0.75f, 0.80f, 0.18f, 0.00f, 0.40f, 55, 0.85f, "center tile has resource/forest improvement cue but settler cannot build improvements" },
        { "settler on hills resource must not mine", 0.50f, 0.60f, 0.20f, 0.00f, 0.42f, 55, 0.62f, "center tile is hills with mine-like production cue" },
        { "settler on rocks resource must not mine", 0.63f, 0.60f, 0.18f, 0.00f, 0.36f, 55, 0.72f, "center tile is rocky production terrain but mining is worker-only" },
        { "settler between cities must not road-to", 0.25f, 0.00f, 0.00f, 0.00f, 0.34f, 56, 0.35f, "east local tile suggests road connection but settler cannot build roads" },
        { "settler on water resource must not build boats", 0.00f, 0.80f, 0.15f, 1.00f, 0.00f, 55, 0.20f, "center tile is water resource but settler should seek land" },
        { "settler near strong resource must move instead of improve", 0.25f, 0.70f, 0.45f, 0.00f, 0.39f, 57, 0.80f, "nearby local tile has strong resource improvement cue" },
        { "settler on weak desert must not do worker task", 0.13f, 0.00f, 0.00f, 0.00f, 0.22f, 55, 0.13f, "center tile is weak desert and has no settlement support" },
        { "settler on weak snow must not do worker task", 0.38f, 0.00f, 0.04f, 0.00f, 0.24f, 55, 0.38f, "center tile is weak snow and should be left" },
        { "settler too close to city must move not improve", 0.25f, 0.35f, 0.25f, 1.00f, 0.34f, 55, 0.45f, "good local tile is invalid because spacing to friendly city is too small" },
    };
    for (const SettlerForbiddenWorkerCase& c : forbiddenWorkerCases) {
        examples.push_back(makeActionUnitSituation(labels, "settler", c.title,
                                                   1.0f / 32.0f, 0, c.terrain, c.resource, c.nearby,
                                                   c.fresh, c.score, 0.70f, 0.05f, c.slot, c.cue,
                                                   c.cueText,
                                                   "goto because settler commands are settlement or movement; irrigation, roads, chopping, and improvements are worker-only"));
    }

    return examples;
}

std::vector<TrainingExample> makeActionWorkerExamples()
{
    const std::vector<std::string> labels = actionLabels();
    std::vector<TrainingExample> examples;
    const float worker = 2.0f / 32.0f;
    struct Case {
        const char* title;
        int cmd;
        float terrain;
        float res;
        float nearby;
        float fresh;
        float cityScore;
        float cityDistance;
        float agePressure;
        float workerSignal;
        int slot;
        float cue;
        const char* cueText;
        const char* decision;
    };
    const std::vector<Case> cases = {
        { "worker on fresh grass builds irrigation", 4, 0.25f, 0.00f, 0.05f, 1.00f, 0.35f, 0.50f, 0.00f, 0.60f, 55, 0.47f, "center tile is grass with irrigation/fresh-water support", "irrigate because grass with fresh water should become a stronger food tile" },
        { "worker on grasswater builds irrigation", 4, 0.88f, 0.00f, 0.10f, 1.00f, 0.42f, 0.45f, 0.00f, 0.60f, 55, 0.88f, "center tile is mixed grass-water", "irrigate because mixed grass-water is a strong food source" },
        { "worker on grass near irrigated city builds irrigation", 4, 0.25f, 0.00f, 0.12f, 1.00f, 0.40f, 0.18f, 0.00f, 0.60f, 56, 0.50f, "east tile represents city or existing irrigation support", "irrigate because adjacent city tiles should receive fresh-water food support" },
        { "worker on forest without resource chops", 5, 0.75f, 0.00f, 0.10f, 0.00f, 0.20f, 0.35f, 0.00f, 0.45f, 55, 0.75f, "center tile is forest with no direct resource", "chop forest because the tile can convert stored wildness into city production" },
        { "worker on hills forest without resource chops", 5, 0.75f, 0.00f, 0.06f, 0.00f, 0.18f, 0.45f, 0.00f, 0.45f, 55, 0.70f, "center tile is forested hills with no direct resource", "chop forest because clearing forest is the active supported worker job" },
        { "worker on dense forest near city chops", 5, 0.75f, 0.00f, 0.02f, 0.00f, 0.28f, 0.20f, 0.00f, 0.45f, 55, 0.78f, "center tile is dense forest close enough to send production to a city", "chop forest because no opened resource improvement is available" },
        { "worker on remote forest chops before road", 5, 0.75f, 0.00f, 0.00f, 0.00f, 0.12f, 0.65f, 0.00f, 0.45f, 55, 0.73f, "center tile is remote forest and the preserved action signal says chop", "chop forest because chop signal must beat generic improvement on non-resource forest" },
        { "worker on flat forest without resource chops", 5, 0.75f, 0.00f, 0.04f, 0.00f, 0.24f, 0.40f, 0.00f, 0.45f, 55, 0.76f, "center tile is flat forest with no visible resource", "chop forest because a forest without resource should not become workshop/cottage" },
        { "worker on wet forest without resource chops", 5, 0.75f, 0.00f, 0.08f, 1.00f, 0.30f, 0.32f, 0.00f, 0.45f, 55, 0.80f, "center tile is forest near fresh water but has no direct resource", "chop forest because fresh-water context does not make this an irrigation or improvement command" },
        { "worker on old forest task continues chopping", 5, 0.75f, 0.00f, 0.05f, 0.00f, 0.22f, 0.38f, 0.30f, 0.45f, 55, 0.74f, "center tile is forest and age pressure marks an ongoing chop task", "chop forest because a started forest job should continue until finished" },
        { "worker exact plain forest chop test", 5, 0.75f, 0.00f, 0.10f, 0.00f, 0.20f, 0.35f, 0.00f, 0.45f, 55, 0.75f, "center tile is forest with no direct resource matching the simulation test", "chop forest because signal 0.45 identifies current-tile chopping, not a generic improvement" },
        { "worker plain forest with no resource chops again", 5, 0.75f, 0.00f, 0.08f, 0.00f, 0.18f, 0.36f, 0.00f, 0.45f, 55, 0.75f, "center tile is ordinary non-resource forest", "chop forest because the forest has no opened resource improvement" },
        { "worker forest near city with chop signal chops", 5, 0.75f, 0.00f, 0.10f, 0.00f, 0.26f, 0.18f, 0.00f, 0.45f, 55, 0.77f, "center tile is non-resource forest near a city", "chop forest because nearby city can receive production from the chop" },
        { "worker wet forest with chop signal still chops", 5, 0.75f, 0.00f, 0.10f, 1.00f, 0.28f, 0.32f, 0.00f, 0.45f, 55, 0.78f, "center tile is non-resource forest with fresh-water context", "chop forest because water context does not create a resource improvement" },
        { "worker remote non-resource forest with chop signal chops", 5, 0.75f, 0.00f, 0.02f, 0.00f, 0.10f, 0.70f, 0.00f, 0.45f, 55, 0.74f, "center tile is remote non-resource forest", "chop forest because the immediate signal is chop and no resource improvement is present" },
        { "worker on grass food resource builds farm or pasture", 6, 0.25f, 0.80f, 0.20f, 0.00f, 0.55f, 0.35f, 0.00f, 0.80f, 55, 0.35f, "center tile is grass with direct food resource", "build improvement because direct food resource should get farm, pasture, plantation, or camp as appropriate" },
        { "worker on animal resource builds pasture", 6, 0.25f, 0.80f, 0.10f, 0.00f, 0.45f, 0.40f, 0.00f, 0.80f, 55, 0.58f, "center tile is open land with an animal resource", "build improvement because animal resources should receive pasture when Animal Husbandry is known" },
        { "worker on wheat builds farm", 6, 0.25f, 0.80f, 0.18f, 1.00f, 0.56f, 0.24f, 0.00f, 0.80f, 55, 0.46f, "center tile is grass with wheat and fresh-water support", "build improvement because wheat and rice resources should receive farm" },
        { "worker on forest animal resource builds camp", 6, 0.75f, 0.80f, 0.15f, 0.00f, 0.38f, 0.40f, 0.00f, 0.80f, 55, 0.85f, "center tile is forest with deer/furs/ivory-style resource", "build improvement because resource access is more important than blind chopping" },
        { "worker on plantation luxury builds plantation", 6, 0.25f, 0.50f, 0.08f, 0.00f, 0.42f, 0.38f, 0.00f, 0.80f, 55, 0.52f, "center tile is grass with plantation-style luxury resource", "build improvement because plantation resources should be connected when Pottery is known" },
        { "worker on water fish builds fishing boats", 6, 0.00f, 0.80f, 0.12f, 0.00f, 0.36f, 0.28f, 0.00f, 0.80f, 55, 0.18f, "center tile is coastal water with fish-like resource", "build improvement because water resources use fishing boats when Sailing is known" },
        { "worker on wine builds winery", 6, 0.25f, 0.50f, 0.12f, 0.00f, 0.44f, 0.42f, 0.00f, 0.80f, 55, 0.56f, "center tile is fertile land with wine luxury resource", "build improvement because wine should receive winery instead of a generic road" },
        { "worker on hills production resource builds mine", 6, 0.50f, 0.60f, 0.10f, 0.00f, 0.25f, 0.48f, 0.00f, 0.80f, 55, 0.62f, "center tile is hills with metal/resource signal", "build improvement because hills with metal should receive mine" },
        { "worker on rocks production resource builds mine", 6, 0.63f, 0.60f, 0.10f, 0.00f, 0.12f, 0.55f, 0.00f, 0.80f, 55, 0.72f, "center tile is rocks/mountains with metal resource signal", "build improvement because rocky production resources need mine support" },
        { "worker on stone resource builds quarry", 6, 0.50f, 0.60f, 0.08f, 0.00f, 0.28f, 0.50f, 0.00f, 0.80f, 55, 0.68f, "center tile is hills with stone/marble/gypsum resource", "build improvement because stone-like resources should receive quarry when Masonry is known" },
        { "worker on empty hills builds mine", 6, 0.50f, 0.00f, 0.00f, 0.00f, 0.20f, 0.50f, 0.00f, 0.80f, 55, 0.50f, "center tile is empty hills with Mining available", "build improvement because mine is the useful supported generic hills improvement" },
        { "worker on empty grass builds cottage", 6, 0.25f, 0.00f, 0.00f, 0.00f, 0.34f, 0.25f, 0.00f, 0.80f, 55, 0.25f, "center tile is empty grass near a city with Masonry available", "build improvement because cottage is the useful supported generic grass improvement" },
        { "worker on city-side grass builds cottage", 6, 0.25f, 0.00f, 0.06f, 0.00f, 0.46f, 0.12f, 0.00f, 0.80f, 56, 0.32f, "east local tile represents a city worked-area connection", "build improvement because close grassland should become cottage rather than idle" },
        { "worker on river grass builds cottage when irrigation unavailable", 6, 0.25f, 0.00f, 0.02f, 0.00f, 0.40f, 0.22f, 0.00f, 0.80f, 55, 0.30f, "center tile is grass with a commerce-worked cue and no irrigation action signal", "build improvement because the supported action is cottage, not road or wait" },
        { "worker on copper hills builds mine", 6, 0.50f, 0.60f, 0.16f, 0.00f, 0.24f, 0.46f, 0.00f, 0.80f, 55, 0.66f, "center tile is hills with copper-like metal resource", "build improvement because metal resources should be mined" },
        { "worker on iron mountain builds mine", 6, 0.63f, 0.60f, 0.14f, 0.00f, 0.10f, 0.60f, 0.00f, 0.80f, 55, 0.74f, "center tile is mountain/rocks with iron-like metal resource", "build improvement because mine is the matching supported worker build" },
        { "worker on marble hills builds quarry", 6, 0.50f, 0.50f, 0.10f, 0.00f, 0.22f, 0.50f, 0.00f, 0.80f, 55, 0.64f, "center tile is hills with marble-like quarry resource", "build improvement because quarry resources should not become generic roads" },
        { "worker on cattle grass builds pasture", 6, 0.25f, 0.80f, 0.12f, 0.00f, 0.52f, 0.36f, 0.00f, 0.80f, 55, 0.54f, "center tile is grass with cattle-like animal resource", "build improvement because pasture is the matched resource improvement" },
        { "worker on deer forest builds camp", 6, 0.75f, 0.80f, 0.16f, 0.00f, 0.36f, 0.38f, 0.00f, 0.80f, 55, 0.82f, "center tile is forest with deer-like animal resource", "build improvement because camp should beat chop when the resource is opened" },
        { "worker on rice grass builds farm", 6, 0.25f, 0.80f, 0.18f, 0.00f, 0.56f, 0.30f, 0.00f, 0.80f, 55, 0.44f, "center tile is grass with rice-like food resource", "build improvement because farm is the matched resource improvement" },
        { "worker on cotton grass builds plantation", 6, 0.25f, 0.50f, 0.11f, 0.00f, 0.43f, 0.34f, 0.00f, 0.80f, 55, 0.50f, "center tile is grass with cotton-like luxury resource", "build improvement because plantation is the matched resource improvement" },
        { "worker on sheep hills builds pasture", 6, 0.50f, 0.80f, 0.12f, 0.00f, 0.42f, 0.34f, 0.00f, 0.80f, 55, 0.60f, "center tile is hills with sheep-like animal resource", "build improvement because pasture can be the matched resource improvement even on hills" },
        { "worker on horses grass builds pasture", 6, 0.25f, 0.80f, 0.12f, 0.00f, 0.46f, 0.40f, 0.00f, 0.80f, 55, 0.58f, "center tile is grass with horses-like animal resource", "build improvement because pasture connects mounted-resource tiles" },
        { "worker on bananas jungle builds plantation", 6, 0.75f, 0.50f, 0.12f, 0.00f, 0.40f, 0.32f, 0.00f, 0.80f, 55, 0.86f, "center tile is forest/jungle with bananas-like plantation resource", "build improvement because plantation resource beats blind chopping when the resource is opened" },
        { "worker on sugar flatland builds plantation", 6, 0.25f, 0.50f, 0.14f, 0.00f, 0.44f, 0.34f, 0.00f, 0.80f, 55, 0.52f, "center tile is grass with sugar-like plantation resource", "build improvement because plantation is the matched resource improvement" },
        { "worker on furs forest builds camp", 6, 0.75f, 0.80f, 0.16f, 0.00f, 0.34f, 0.40f, 0.00f, 0.80f, 55, 0.84f, "center tile is forest with furs-like camp resource", "build improvement because camp resource beats chop when the resource is opened" },
        { "worker on honey forest builds camp", 6, 0.75f, 0.80f, 0.14f, 0.00f, 0.38f, 0.36f, 0.00f, 0.80f, 55, 0.84f, "center tile is forest with honey-like camp resource", "build improvement because camp is the matched resource improvement" },
        { "worker on crabs water builds fishing boats", 6, 0.00f, 0.80f, 0.12f, 0.00f, 0.34f, 0.28f, 0.00f, 0.80f, 55, 0.18f, "center tile is water with crabs-like resource", "build improvement because water resources use fishing boats" },
        { "worker on whales water builds fishing boats", 6, 0.00f, 0.80f, 0.12f, 0.00f, 0.30f, 0.35f, 0.00f, 0.80f, 55, 0.18f, "center tile is water with whales-like resource", "build improvement because sea resources use fishing boats" },
        { "worker on salt desert builds quarry", 6, 0.13f, 0.50f, 0.08f, 0.00f, 0.20f, 0.48f, 0.00f, 0.80f, 55, 0.25f, "center tile is desert with salt-like quarry resource", "build improvement because quarry resources are valid outside hills when the resource requires quarry" },
        { "worker on gold hills builds mine", 6, 0.50f, 0.60f, 0.12f, 0.00f, 0.22f, 0.48f, 0.00f, 0.80f, 55, 0.64f, "center tile is hills with gold-like mining resource", "build improvement because gold resources should be mined" },
        { "worker on dry plain builds workshop", 6, 0.13f, 0.00f, 0.00f, 0.00f, 0.12f, 0.55f, 0.00f, 0.80f, 55, 0.22f, "center tile is dry non-resource land with Construction workshop available", "build improvement because workshop is the supported generic production improvement" },
        { "worker on frontier forest builds fortification", 6, 0.75f, 0.00f, 0.00f, 0.00f, 0.08f, 0.88f, 0.00f, 0.80f, 55, 0.70f, "center tile is remote forest with Construction fortification available", "build improvement because fortification is the encoded defensive build for frontier terrain" },
        { "worker on production plain builds workshop", 6, 0.25f, 0.00f, 0.02f, 0.00f, 0.18f, 0.55f, 0.00f, 0.80f, 55, 0.31f, "center tile is non-resource land with Construction workshop available", "build improvement because workshop is the production-focused generic build when no resource job exists" },
        { "worker on frontier hill builds fortification", 6, 0.50f, 0.00f, 0.00f, 0.00f, 0.08f, 0.85f, 0.00f, 0.80f, 55, 0.48f, "center tile is remote defensive hill with Construction fortification available", "build improvement because fortification is useful on remote defensive points when no mine preference is encoded" },
        { "worker on plain land builds road here", 3, 0.25f, 0.00f, 0.00f, 0.00f, 0.18f, 0.42f, 0.00f, 0.30f, 55, 0.25f, "center tile is roadable land and no stronger worker action is available", "road to because the runtime interprets this command as building the current road when legal" },
        { "worker road signal on empty grass builds road", 3, 0.25f, 0.00f, 0.00f, 0.00f, 0.16f, 0.44f, 0.00f, 0.30f, 55, 0.25f, "center tile is empty grass and the immediate worker signal is road-only", "road to because signal 0.30 identifies current-tile road construction rather than generic cottage" },
        { "worker road signal near city builds road", 3, 0.25f, 0.00f, 0.00f, 0.00f, 0.26f, 0.20f, 0.00f, 0.30f, 56, 0.35f, "east tile suggests city connection and the immediate worker signal is road-only", "road to because roads connect nearby city work areas when no improvement signal is active" },
        { "worker road signal on dry land builds road", 3, 0.13f, 0.00f, 0.00f, 0.00f, 0.10f, 0.50f, 0.00f, 0.30f, 55, 0.13f, "center tile is dry land but roadable and no resource improvement is active", "road to because road construction is the only encoded worker job" },
        { "worker road signal on empty hill builds road", 3, 0.50f, 0.00f, 0.00f, 0.00f, 0.12f, 0.48f, 0.00f, 0.30f, 55, 0.42f, "center tile is hill but the immediate signal is road-only", "road to because the model must follow the legal road signal rather than infer a mine" },
        { "worker road signal on forest road corridor builds road", 3, 0.75f, 0.00f, 0.00f, 0.00f, 0.10f, 0.52f, 0.00f, 0.30f, 55, 0.70f, "center tile is forest but the immediate signal is road-only, not chop", "road to because the signal distinguishes road construction from chop forest" },
        { "worker between cities builds road-to", 3, 0.25f, 0.00f, 0.00f, 0.00f, 0.30f, 0.18f, 0.00f, 0.20f, 56, 0.35f, "east tile implies road/city connection target", "road to because plain land without resource is best used connecting cities" },
        { "worker on already roaded land continues road-to", 3, 0.25f, 0.00f, 0.00f, 0.00f, 0.24f, 0.30f, 0.00f, 0.20f, 57, 0.35f, "farther east local tile implies another city or route target", "road to because a worker on an existing road should continue the route" },
        { "worker on roadable hills builds road when no mine action exists", 3, 0.50f, 0.00f, 0.00f, 0.00f, 0.12f, 0.48f, 0.00f, 0.30f, 55, 0.42f, "center tile is hills but the only immediate worker signal is road", "road to because the JS legality layer says road is the available action" },
        { "worker leaving completed road continues road-to city", 3, 0.25f, 0.00f, 0.00f, 0.00f, 0.28f, 0.26f, 0.00f, 0.20f, 54, 0.34f, "west local tile is an existing road and a city connection continues beyond", "road to because route extension should continue after current road is done" },
        { "worker near cattle city tile moves to pasture job", 0, 0.25f, 0.00f, 0.62f, 0.00f, 0.35f, 0.12f, 0.00f, 0.00f, 57, 0.68f, "two tiles east is a cattle-like animal resource inside the city work area", "goto because the useful worker job is nearby and should be reached before building pasture" },
        { "worker near rice and water moves to farm job", 0, 0.25f, 0.00f, 0.58f, 1.00f, 0.40f, 0.10f, 0.00f, 0.00f, 56, 0.60f, "east tile is wet crop land beside city irrigation support", "goto because worker should move to the crop tile before building farm" },
        { "worker near copper hill moves to mine job", 0, 0.25f, 0.00f, 0.55f, 0.00f, 0.28f, 0.18f, 0.00f, 0.00f, 57, 0.72f, "two tiles east is a copper hill resource in the city ring", "goto because worker should move to production resource before building mine" },
        { "worker near marble hill moves to quarry job", 0, 0.25f, 0.00f, 0.48f, 0.00f, 0.28f, 0.20f, 0.00f, 0.00f, 57, 0.70f, "two tiles east is a stone or marble resource in hills", "goto because worker should move to quarry resource before building quarry" },
        { "worker near deer forest moves to camp job", 0, 0.25f, 0.00f, 0.54f, 0.00f, 0.24f, 0.18f, 0.00f, 0.00f, 56, 0.86f, "east tile is a deer forest resource", "goto because resource camp should be built before blind chopping elsewhere" },
        { "worker near cotton flatland moves to plantation job", 0, 0.25f, 0.00f, 0.48f, 0.00f, 0.32f, 0.14f, 0.00f, 0.00f, 56, 0.58f, "east tile is a plantation luxury in the city ring", "goto because worker should move to plantation resource before building" },
        { "worker near wine flatland moves to winery job", 0, 0.25f, 0.00f, 0.46f, 0.00f, 0.32f, 0.16f, 0.00f, 0.00f, 56, 0.57f, "east tile is wine in the city ring", "goto because worker should move to wine before building winery" },
        { "worker near empty grass city tile moves to cottage job", 0, 0.25f, 0.00f, 0.18f, 0.00f, 0.42f, 0.10f, 0.00f, 0.00f, 56, 0.38f, "east tile is empty grass next to a city", "goto because worker should improve city grass with cottage instead of exploring" },
        { "worker near production plain moves to workshop job", 0, 0.25f, 0.00f, 0.16f, 0.00f, 0.20f, 0.22f, 0.00f, 0.00f, 57, 0.40f, "two tiles east is a non-resource production plain suitable for workshop", "goto because worker should move to workshop site before building" },
        { "worker on desert no resource goes elsewhere", 0, 0.13f, 0.00f, 0.00f, 0.00f, 0.10f, 0.50f, 0.00f, 0.00f, 55, 0.13f, "center tile is desert without resource", "goto because weak desert has no supported early worker build" },
        { "worker on snow no resource goes elsewhere", 0, 0.38f, 0.00f, 0.04f, 0.00f, 0.08f, 0.55f, 0.00f, 0.00f, 55, 0.38f, "center tile is snow without resource", "goto because weak snow has no useful immediate worker build" },
        { "worker sees better resource two tiles away", 0, 0.25f, 0.00f, 0.45f, 0.00f, 0.18f, 0.45f, 0.00f, 0.00f, 57, 0.80f, "nearby local tile has strong resource signal", "goto because moving to the resource enables a better improvement" },
    };
    for (const Case& c : cases) {
        examples.push_back(makeActionUnitSituation(labels, "worker", c.title, worker, c.cmd, c.terrain, c.res, c.nearby,
                                                   c.fresh, c.cityScore, c.cityDistance, c.agePressure,
                                                   c.slot, c.cue, c.cueText, c.decision,
                                                   0.0f, 0.0f, 0.0f, 0.0f, c.workerSignal));
    }
    examples.push_back(makeActionUnitSituation(labels, "worker", "worker inside forwarded military focus retreats",
                                               worker, 0, 0.25f, 0.00f, 0.15f, 0.00f, 0.0f, 0.55f, 0.0f,
                                               55, 0.25f,
                                               "center tile is workable grass but strategy focus marks nearby danger",
                                               "goto because civilian worker should run out of high military-priority coordinates instead of starting a build",
                                               0.10f, -0.10f, 0.85f, 0.20f));
    return examples;
}

std::vector<TrainingExample> makeActionExplorerExamples()
{
    const std::vector<std::string> labels = actionLabels();
    std::vector<TrainingExample> examples;
    const float explorer = 3.0f / 32.0f;
    struct Case { const char* title; int cmd; float terrain; int slot; float cue; const char* cueText; const char* decision; };
    const std::vector<Case> cases = {
        { "explorer sees dark area north", 0, 0.25f, 45, -0.20f, "north local tile is fog-of-war / unknown", "goto because explorers should reveal dark map area" },
        { "explorer sees dark area east", 0, 0.25f, 56, -0.20f, "east local tile is fog-of-war / unknown", "goto because moving into fog opens map and resources" },
        { "explorer sees city with no nearby resources", 0, 0.25f, 56, 0.15f, "east local tile is visible city/unit signal but nearby resource score is low", "goto city because standing on or near it can reveal resources around it" },
        { "explorer on hills sees fog beyond", 0, 0.50f, 46, -0.20f, "north-east tile is unknown beyond high ground", "goto because hills near fog are good scouting points" },
        { "explorer surrounded by known land waits", 1, 0.25f, 55, 0.25f, "local center is ordinary known grass and no fog cue is present", "wait because no exploration target is encoded in this compact example" },
        { "explorer sees coastal unknown", 0, 0.25f, 57, -0.20f, "farther east local tile is unknown coast or water edge", "goto because coast/fog edges are valuable exploration fronts" },
    };
    for (const Case& c : cases) {
        examples.push_back(makeActionUnitSituation(labels, "explorer", c.title, explorer, c.cmd, c.terrain, 0.0f, 0.0f,
                                                   0.0f, 0.0f, 0.5f, 0.0f, c.slot, c.cue, c.cueText, c.decision));
    }
    examples.push_back(makeActionUnitSituation(labels, "explorer", "explorer inside forwarded military focus withdraws",
                                               explorer, 0, 0.25f, 0.00f, 0.00f, 0.00f, 0.0f, 0.50f, 0.0f,
                                               55, 0.25f,
                                               "center tile is known grass and strategy focus marks nearby military danger",
                                               "goto because civilian explorer should leave dangerous focus coordinates while scouting",
                                               -0.20f, 0.15f, 0.80f, 0.10f));
    return examples;
}

std::vector<TrainingExample> makeActionWarriorExamples()
{
    const std::vector<std::string> labels = actionLabels();
    std::vector<TrainingExample> examples;
    const float warrior = 4.0f / 32.0f;
    struct Case { const char* title; int cmd; float terrain; int slot; float cue; float actionSignal; const char* cueText; const char* decision; };
    const std::vector<Case> cases = {
        { "warrior sees enemy on adjacent grass", 7, 0.25f, 56, -0.15f, 0.70f, "east local tile is alien unit on flat land", "attack because melee unit can engage adjacent alien on open terrain" },
        { "warrior sees enemy across open field", 0, 0.25f, 57, -0.15f, 0.00f, "farther east local tile is alien unit signal", "goto because warrior should close distance before attack" },
        { "warrior sees hill with no enemy", 0, 0.25f, 46, 0.50f, 0.00f, "north-east local tile is hills", "goto hill because defensive terrain is valuable before contact" },
        { "warrior already on hill with enemy far away", 1, 0.50f, 57, -0.15f, 0.50f, "far enemy is visible while current tile is hills", "wait as fortify/hold because hill defense is better than chasing blindly" },
        { "warrior on rocks holds pass", 1, 0.63f, 55, 0.63f, 0.50f, "center tile is rocks/mountains defensive terrain", "wait as fortify/hold because current terrain is a strong defensive point" },
        { "warrior sees enemy city signal", 0, 0.25f, 56, -0.15f, 0.00f, "local enemy/city signal is visible at movement distance", "goto because warrior should approach before attacking city defenders" },
    };
    for (const Case& c : cases) {
        examples.push_back(makeActionUnitSituation(labels, "warrior", c.title, warrior, c.cmd, c.terrain, 0.0f, 0.0f,
                                                   0.0f, 0.0f, 0.5f, 0.0f, c.slot, c.cue, c.cueText, c.decision,
                                                   0.0f, 0.0f, 0.0f, 0.0f, c.actionSignal));
    }
    examples.push_back(makeActionUnitSituation(labels, "warrior", "warrior follows forwarded military attack focus",
                                               warrior, 0, 0.25f, 0.00f, 0.00f, 0.00f, 0.0f, 0.50f, 0.0f,
                                               56, -0.15f,
                                               "east local tile has enemy pressure and strategy focus gives attack priority",
                                               "goto because military units should move toward the strategy attack focus",
                                               0.35f, 0.10f, 0.90f, 0.15f));
    return examples;
}

std::vector<TrainingExample> makeActionSlingerExamples()
{
    const std::vector<std::string> labels = actionLabels();
    std::vector<TrainingExample> examples;
    const float slinger = 5.0f / 32.0f;
    struct Case { const char* title; int cmd; float terrain; int slot; float cue; float actionSignal; const char* cueText; const char* decision; };
    const std::vector<Case> cases = {
        { "slinger sees enemy adjacent", 7, 0.25f, 56, -0.15f, 0.70f, "east local tile is alien unit adjacent", "attack because adjacent target is already in danger range" },
        { "slinger sees enemy far and hill nearby", 0, 0.25f, 46, 0.50f, 0.00f, "north-east local tile is hills between slinger and enemy", "goto hill because ranged units want high defensive firing positions" },
        { "slinger on hill sees enemy", 1, 0.50f, 57, -0.15f, 0.50f, "far enemy is visible while current tile is hills", "wait as fortify/hold because hill firing position is already good" },
        { "slinger sees dark flank", 0, 0.25f, 54, -0.20f, 0.00f, "west local tile is fog on the flank", "goto carefully because ranged screen should reveal nearby fog" },
    };
    for (const Case& c : cases) {
        examples.push_back(makeActionUnitSituation(labels, "slinger", c.title, slinger, c.cmd, c.terrain, 0.0f, 0.0f,
                                                   0.0f, 0.0f, 0.5f, 0.0f, c.slot, c.cue, c.cueText, c.decision,
                                                   0.0f, 0.0f, 0.0f, 0.0f, c.actionSignal));
    }
    return examples;
}

std::vector<TrainingExample> makeActionArcherExamples()
{
    const std::vector<std::string> labels = actionLabels();
    std::vector<TrainingExample> examples;
    const float archer = 6.0f / 32.0f;
    struct Case { const char* title; int cmd; float terrain; int slot; float cue; float actionSignal; const char* cueText; const char* decision; };
    const std::vector<Case> cases = {
        { "archer sees enemy in range", 7, 0.25f, 57, -0.15f, 0.70f, "enemy unit signal is visible in local range", "attack because archer should shoot visible enemies" },
        { "archer sees hill firing point", 0, 0.25f, 46, 0.50f, 0.00f, "north-east local tile is hills", "goto because archer should occupy hills for range defense" },
        { "archer on hill sees enemy approach", 1, 0.50f, 57, -0.15f, 0.50f, "enemy approaches while archer already holds hills", "wait as fortify/hold because current hill is the right firing position" },
        { "archer holds hill against distant enemy", 1, 0.50f, 58, -0.15f, 0.50f, "distant enemy is visible while archer is already on hills", "wait as hold because defensive hill should be kept when enemy is not adjacent" },
        { "archer holds mountain pass", 1, 0.63f, 55, 0.63f, 0.50f, "center tile is rocks/mountains defensive terrain", "wait as hold because archer is on a strong defensive pass" },
        { "archer stays on hill with no immediate target", 1, 0.50f, 55, 0.50f, 0.50f, "center tile is hills and immediate-action signal says defensive hold", "wait as hold because no adjacent attack signal is encoded" },
        { "archer on hill screens city approach", 1, 0.50f, 54, -0.15f, 0.50f, "enemy pressure is visible but not adjacent to hill archer", "wait as hold because hill position screens the approach better than moving" },
        { "archer sees enemy city ahead", 0, 0.25f, 56, -0.15f, 0.00f, "enemy city/unit signal ahead", "goto because archer should approach siege position before attacking" },
    };
    for (const Case& c : cases) {
        examples.push_back(makeActionUnitSituation(labels, "archer", c.title, archer, c.cmd, c.terrain, 0.0f, 0.0f,
                                                   0.0f, 0.0f, 0.5f, 0.0f, c.slot, c.cue, c.cueText, c.decision,
                                                   0.0f, 0.0f, 0.0f, 0.0f, c.actionSignal));
    }
    return examples;
}

std::vector<TrainingExample> makeActionHorsemanExamples()
{
    const std::vector<std::string> labels = actionLabels();
    std::vector<TrainingExample> examples;
    const float horseman = 8.0f / 32.0f;
    struct Case { const char* title; int cmd; float terrain; int slot; float cue; float actionSignal; const char* cueText; const char* decision; };
    const std::vector<Case> cases = {
        { "horseman sees exposed enemy on grass", 7, 0.25f, 57, -0.15f, 0.70f, "enemy unit is visible on open terrain", "attack because mounted units should exploit open-field targets" },
        { "horseman sees enemy far across plains", 0, 0.25f, 58, -0.15f, 0.00f, "enemy unit is visible farther across open land", "goto because horseman speed closes distance quickly" },
        { "horseman sees hills but no enemy", 0, 0.25f, 46, 0.50f, 0.00f, "nearby hill blocks movement but offers observation", "goto hill only when no exposed enemy is encoded" },
        { "horseman on hills should leave for open enemy", 0, 0.50f, 57, -0.15f, 0.00f, "enemy is visible off current hill terrain", "goto because mounted units prefer mobility over static hill defense" },
        { "horseman adjacent to enemy city", 7, 0.25f, 56, -0.15f, 0.70f, "adjacent enemy/city unit signal", "attack because fast unit is already in striking position" },
    };
    for (const Case& c : cases) {
        examples.push_back(makeActionUnitSituation(labels, "horseman", c.title, horseman, c.cmd, c.terrain, 0.0f, 0.0f,
                                                   0.0f, 0.0f, 0.5f, 0.0f, c.slot, c.cue, c.cueText, c.decision,
                                                   0.0f, 0.0f, 0.0f, 0.0f, c.actionSignal));
    }
    examples.push_back(makeActionUnitSituation(labels, "horseman", "horseman charges forwarded attack focus",
                                               horseman, 0, 0.25f, 0.00f, 0.00f, 0.00f, 0.0f, 0.50f, 0.0f,
                                               58, -0.15f,
                                               "far enemy signal aligns with strategy focus attack priority",
                                               "goto because fast military units should converge on the priority attack coordinates",
                                               0.55f, -0.25f, 0.95f, 0.10f));
    return examples;
}

std::vector<TrainingExample> makeEconomicsExamples()
{
    const std::vector<std::string> labels = {
        "produce Settlers",
        "produce Explorer",
        "produce Worker",
        "produce Warrior",
        "produce Slinger",
        "produce Archor",
        "produce Spearman",
        "produce Horseman"
    };
    return makeObjectCommandExamples("economics", labels, 100);
}

std::vector<TrainingExample> makeEconomicsStrategyExamples()
{
    const std::vector<std::string> labels = {
        "produce Settlers",
        "produce Explorer",
        "produce Worker",
        "produce Warrior",
        "produce Slinger",
        "produce Archor",
        "produce Spearman",
        "produce Horseman"
    };
    std::vector<TrainingExample> examples;
    examples.reserve(160);
    struct Case {
        const char* title;
        int command;
        float cityCount;
        float freeCityCount;
        float workers;
        float military;
        float enemyMilitary;
        float idleUnits;
        float population;
        float food;
        float production;
        float money;
        float frontier;
        float seaside;
        float garrison;
        std::array<float, 4> demand;
        float openedTechRate;
        const char* decision;
    };
    const std::vector<Case> cases = {
        { "high settler demand uses high food city", 0, 0.06f, 0.13f, 0.12f, 0.10f, 0.00f, 0.18f, 0.25f, 0.75f, 0.35f, 0.30f, 1.00f, 0.00f, 0.20f, {0.80f, 0.10f, 0.05f, 0.05f}, 0.15f, "produce Settlers because Strategy wants expansion and the city has food" },
        { "high worker demand uses productive defended city after worker tech", 2, 0.06f, 0.13f, 0.00f, 0.25f, 0.00f, 0.12f, 0.20f, 0.45f, 0.72f, 0.25f, 0.50f, 0.00f, 0.40f, {0.05f, 0.85f, 0.03f, 0.07f}, 0.35f, "produce Worker because worker technologies are open, worker shortage is dominant, and the city already has military coverage" },
        { "one city many explorers no worker no military makes warrior", 3, 0.06f, 0.13f, 0.00f, 0.00f, 0.00f, 0.25f, 0.18f, 0.45f, 0.65f, 0.35f, 0.60f, 0.00f, 0.00f, {0.20f, 0.65f, 0.05f, 0.10f}, 0.18f, "produce Warrior because even with worker tech a one-city empire with no military needs a defender before a worker" },
        { "exploration pressure no worker no military makes warrior", 3, 0.06f, 0.13f, 0.00f, 0.00f, 0.00f, 0.25f, 0.18f, 0.45f, 0.60f, 0.55f, 0.60f, 0.00f, 0.00f, {0.10f, 0.45f, 0.40f, 0.05f}, 0.18f, "produce Warrior because opened worker technologies do not beat the first military defender" },
        { "beginning no tech worker demand makes warrior", 3, 0.06f, 0.13f, 0.00f, 0.00f, 0.00f, 0.12f, 0.18f, 0.42f, 0.55f, 0.25f, 0.60f, 0.00f, 0.00f, {0.10f, 0.70f, 0.05f, 0.15f}, 0.00f, "produce Warrior before Worker because no worker technologies are open and a worker has no useful job yet" },
        { "beginning no tech no worker no military makes warrior", 3, 0.06f, 0.13f, 0.00f, 0.00f, 0.00f, 0.25f, 0.20f, 0.45f, 0.65f, 0.25f, 0.70f, 0.00f, 0.00f, {0.20f, 0.55f, 0.05f, 0.20f}, 0.00f, "produce Warrior before Worker at the start because no technologies are open and there is no defender" },
        { "beginning no tech explorer pressure makes warrior", 3, 0.06f, 0.13f, 0.00f, 0.00f, 0.00f, 0.25f, 0.18f, 0.45f, 0.60f, 0.55f, 0.60f, 0.00f, 0.00f, {0.10f, 0.45f, 0.40f, 0.05f}, 0.00f, "produce Warrior because no-tech worker demand and explorer pressure should not beat the first defender" },
        { "high explorer demand no military makes warrior", 3, 0.06f, 0.13f, 0.18f, 0.00f, 0.00f, 0.25f, 0.18f, 0.40f, 0.55f, 0.55f, 0.60f, 0.00f, 0.00f, {0.10f, 0.15f, 0.60f, 0.15f}, 0.05f, "produce Warrior because an empire with no military must not keep producing explorers" },
        { "many explorers with one worker makes warrior", 3, 0.06f, 0.13f, 0.12f, 0.00f, 0.00f, 0.30f, 0.20f, 0.45f, 0.55f, 0.50f, 0.60f, 0.00f, 0.00f, {0.15f, 0.20f, 0.45f, 0.20f}, 0.05f, "produce Warrior because one worker and no military is a larger gap than map knowledge" },
        { "two cities one worker no military makes warrior", 3, 0.13f, 0.13f, 0.12f, 0.00f, 0.00f, 0.25f, 0.20f, 0.40f, 0.60f, 0.35f, 0.70f, 0.00f, 0.00f, {0.15f, 0.30f, 0.25f, 0.30f}, 0.05f, "produce Warrior because every early empire needs at least one defender before more scouts" },
        { "two cities one worker no defenders productive city makes slinger", 4, 0.13f, 0.13f, 0.12f, 0.00f, 0.00f, 0.25f, 0.22f, 0.40f, 0.82f, 0.30f, 0.70f, 0.00f, 0.00f, {0.15f, 0.25f, 0.25f, 0.35f}, 0.10f, "produce Slinger because productive early city should add ranged military instead of another explorer" },
        { "high explorer demand uses commerce city", 1, 0.13f, 0.13f, 0.25f, 0.08f, 0.00f, 0.18f, 0.15f, 0.40f, 0.30f, 0.70f, 0.70f, 0.00f, 0.10f, {0.10f, 0.10f, 0.75f, 0.05f}, 0.10f, "produce Explorer because Strategy wants map knowledge and workers already exist" },
        { "high military demand frontier city makes warrior", 3, 0.06f, 0.13f, 0.12f, 0.00f, 0.40f, 0.18f, 0.20f, 0.35f, 0.60f, 0.25f, 1.00f, 0.00f, 0.05f, {0.05f, 0.10f, 0.05f, 0.80f}, 0.05f, "produce Warrior because military demand is high and the frontier is under-defended" },
        { "high military demand city with production makes slinger", 4, 0.13f, 0.13f, 0.18f, 0.12f, 0.40f, 0.18f, 0.25f, 0.45f, 0.80f, 0.25f, 0.50f, 0.00f, 0.20f, {0.05f, 0.10f, 0.05f, 0.80f}, 0.12f, "produce Slinger because production city can add ranged defense" },
        { "high military demand productive frontier makes slinger", 4, 0.13f, 0.13f, 0.18f, 0.12f, 0.40f, 0.18f, 0.22f, 0.42f, 0.82f, 0.22f, 0.65f, 0.00f, 0.15f, {0.05f, 0.10f, 0.05f, 0.80f}, 0.12f, "produce Slinger because high production can make ranged military instead of only basic warriors" },
        { "high military demand productive city with small garrison makes slinger", 4, 0.13f, 0.13f, 0.18f, 0.12f, 0.40f, 0.18f, 0.25f, 0.45f, 0.78f, 0.25f, 0.50f, 0.00f, 0.10f, {0.05f, 0.10f, 0.05f, 0.80f}, 0.12f, "produce Slinger because productive under-defended city should add ranged defense" },
        { "high military demand production-heavy city makes slinger", 4, 0.13f, 0.13f, 0.18f, 0.12f, 0.40f, 0.18f, 0.28f, 0.40f, 0.90f, 0.30f, 0.45f, 0.00f, 0.20f, {0.05f, 0.10f, 0.05f, 0.80f}, 0.12f, "produce Slinger because production-heavy city should convert war demand into stronger ranged unit" },
        { "high military demand defended core makes archer", 5, 0.18f, 0.13f, 0.25f, 0.20f, 0.45f, 0.18f, 0.30f, 0.50f, 0.65f, 0.35f, 0.10f, 0.00f, 0.45f, {0.05f, 0.05f, 0.05f, 0.85f}, 0.18f, "produce Archer because core city with garrison can focus ranged support" },
        { "high military demand versus mounted threat makes spearman", 6, 0.13f, 0.13f, 0.18f, 0.12f, 0.45f, 0.18f, 0.25f, 0.45f, 0.55f, 0.30f, 0.90f, 0.00f, 0.15f, {0.05f, 0.05f, 0.05f, 0.85f}, 0.18f, "produce Spearman because frontier military need favors defensive anti-mounted unit" },
        { "balanced empire still expands from food frontier", 0, 0.18f, 0.13f, 0.25f, 0.18f, 0.08f, 0.18f, 0.30f, 0.85f, 0.40f, 0.40f, 1.00f, 0.00f, 0.35f, {0.45f, 0.25f, 0.10f, 0.20f}, 0.15f, "produce Settlers because expansion priority remains largest" },
        { "balanced empire improves production city after worker tech", 2, 0.18f, 0.13f, 0.12f, 0.18f, 0.08f, 0.18f, 0.20f, 0.40f, 0.75f, 0.30f, 0.30f, 0.00f, 0.35f, {0.20f, 0.45f, 0.10f, 0.25f}, 0.18f, "produce Worker because worker priority is largest and worker technologies are available" },
        { "safe unknown map makes explorer", 1, 0.13f, 0.13f, 0.25f, 0.08f, 0.00f, 0.18f, 0.18f, 0.45f, 0.35f, 0.55f, 0.60f, 0.00f, 0.20f, {0.20f, 0.20f, 0.50f, 0.10f}, 0.10f, "produce Explorer because exploration priority is largest and workers already exist" },
        { "war priority in weak city makes warrior", 3, 0.06f, 0.13f, 0.12f, 0.00f, 0.35f, 0.18f, 0.12f, 0.30f, 0.30f, 0.20f, 0.80f, 0.00f, 0.00f, {0.10f, 0.10f, 0.05f, 0.75f}, 0.05f, "produce Warrior because it is the basic military response from a weak city" },
    };

    for (size_t caseIndex = 0; caseIndex < cases.size(); ++caseIndex) {
        const Case& c = cases[caseIndex];
        for (int record = 0; record < AI_PLAYER_OBJECT_COUNT; ++record) {
        const int objectBase = record * AI_PLAYER_OBJECT_FLOATS;
        const int outputBase = record * AI_PLAYER_COMMAND_FLOATS;
        TrainingExample ex;
        ex.input = zeroInputSignal();
        ex.target = zeroOutputSignal();
        ex.explanation = std::string("economics strategy demand case: ") + c.title;
        ex.decisionSlots = slotRange(outputBase, AI_PLAYER_COMMAND_FLOATS);
        ex.correctSlot = outputBase + c.command;
        setOneHot(ex.target, outputBase, AI_PLAYER_COMMAND_FLOATS, c.command);
        ex.input[objectBase + 2] = c.population;
        ex.input[objectBase + 3] = c.food;
        ex.input[objectBase + 4] = c.production;
        ex.input[objectBase + 5] = c.money;
        ex.input[objectBase + 10] = c.frontier;
        ex.input[objectBase + 11] = c.seaside;
        ex.input[objectBase + 12] = c.garrison;
        ex.input[objectBase + 13] = 1.0f;
        ex.input[objectBase + 14] = 1.0f;
	        for (int k = 0; k < 4; ++k) {
	            ex.input[AI_PLAYER_SITUATION_BASE + 20 + k] = c.demand[k];
	        }
	        ex.input[AI_PLAYER_SITUATION_BASE + 1] = c.cityCount;
	        ex.input[AI_PLAYER_SITUATION_BASE + 2] = c.freeCityCount;
	        ex.input[AI_PLAYER_SITUATION_BASE + 5] = c.military;
	        ex.input[AI_PLAYER_SITUATION_BASE + 6] = c.enemyMilitary;
	        ex.input[AI_PLAYER_SITUATION_BASE + 14] = c.idleUnits;
	        ex.input[AI_PLAYER_SITUATION_BASE + 15] = c.workers;
	        ex.input[AI_PLAYER_SITUATION_BASE + 16] = c.openedTechRate;
	        ex.comments.push_back("Purpose: teach Economics to convert Strategy production demand percentages into concrete city production.");
	        ex.comments.push_back("Economics general inputs: input[961]=city count, input[962]=free city count, input[965]=own military count, input[966]=enemy military count, input[974]=idle movable units, input[975]=worker count, input[976]=opened technology rate, input[980]=settlers demand, input[981]=worker demand, input[982]=explorer demand, input[983]=military demand.");
        ex.comments.push_back("City fields used: population, food income, production income, money income, frontier flag, seaside flag, and garrison strength.");
        ex.comments.push_back(std::string("Decision meaning: ") + c.decision + ".");
        addClassificationTargetComments(ex, outputBase, labels, c.command);
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 20, c.demand[0], "Strategy settlers production demand percentage");
        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 21, c.demand[1], "Strategy worker production demand percentage");
	        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 22, c.demand[2], "Strategy explorer production demand percentage");
	        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 23, c.demand[3], "Strategy military production demand percentage");
	        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 15, c.workers, "current worker count normalized by 8");
	        addSignalComment(ex.comments, "input", AI_PLAYER_SITUATION_BASE + 16, c.openedTechRate, "opened technology rate; zero means beginning game where workers have no useful improvement technology yet");
	        examples.push_back(ex);
        }
    }
    return examples;
}

std::vector<TrainingExample> loadTrainingExamples(const std::string& path)
{
    std::ifstream in(path);
    if (!in) {
        throw std::runtime_error("could not open training situations file: " + path);
    }

    std::vector<TrainingExample> examples;
    std::string line;
    int lineNumber = 0;
    while (std::getline(in, line)) {
        ++lineNumber;
        line = trim(line);
        if (line.empty() || line[0] == '#') {
            continue;
        }

        std::vector<std::string> parts = split(line, '|');
        if (parts.size() != 5) {
            throw std::runtime_error("expected 5 pipe-separated fields on line " + std::to_string(lineNumber));
        }

        TrainingExample example;
        example.correctSlot = std::stoi(trim(parts[0]));
        if (example.correctSlot < 0 || example.correctSlot >= kOutputWidth) {
            throw std::runtime_error("correct slot out of range on line " + std::to_string(lineNumber));
        }
        example.decisionSlots = parseSlots(parts[1], lineNumber);
        parseSparseSignal(parts[2], example.input, lineNumber, "input");
        parseSparseSignal(parts[3], example.target, lineNumber, "target");
        example.explanation = trim(parts[4]);
        examples.push_back(example);
    }

    if (examples.empty()) {
        throw std::runtime_error("training situations file is empty: " + path);
    }
    return examples;
}

void saveTrainingExamples(const std::string& path, const std::vector<TrainingExample>& examples)
{
    std::ofstream out(path);
    if (!out) {
        throw std::runtime_error("could not write training situations file: " + path);
    }

    out << "# AI Civ training situations v1\n";
    out << "# Machine row format: correct_output_slot|candidate_output_slots|nonzero_input_slots|target_output_slots|short_description\n";
    out << "# Comment blocks explain the game meaning of each slot used by the following machine row.\n";
    int index = 0;
    for (const TrainingExample& example : examples) {
        const std::string decisionSlots = serializeSlots(example.decisionSlots);
        const std::string inputSparse = serializeSparseSignal(example.input);
        const std::string targetSparse = serializeSparseSignal(example.target);
        out << "# situation " << index << ": " << example.explanation << "\n";
        if (example.comments.empty()) {
            out << "# Correct answer is output[" << example.correctSlot << "]. Candidate outputs are "
                << decisionSlots << ".\n";
        } else {
            for (const std::string& comment : example.comments) {
                out << "# " << comment << "\n";
            }
        }
        out << "# Machine row below repeats the same situation in parser format.\n";
        out << example.correctSlot << "|"
            << decisionSlots << "|"
            << inputSparse << "|"
            << targetSparse << "|"
            << example.explanation << "\n";
        ++index;
    }
}

void printSchema(const Schema& schema, std::ostream& out)
{
    out << "\n== " << schema.name << " input schema ==\n";
    for (const FieldSpec& field : schema.input) {
        out << "[" << field.begin << ".." << field.end << "] " << field.name
            << " : " << field.type << " - " << field.description << "\n";
    }
    out << "== " << schema.name << " output schema ==\n";
    for (const FieldSpec& field : schema.output) {
        out << "[" << field.begin << ".." << field.end << "] " << field.name
            << " : " << field.type << " - " << field.description << "\n";
    }
}

TrainingReport evaluate(const DensePerceptronEngine& engine, const std::vector<TrainingExample>& examples)
{
    TrainingReport report;
    int correct = 0;
    float loss = 0.0f;
    for (const TrainingExample& example : examples) {
        OutputSignal output = engine.forward(example.input);
        for (int slot : example.decisionSlots) {
            float error = output[slot] - example.target[slot];
            loss += error * error;
        }
        if (argmaxSlots(output, example.decisionSlots) == example.correctSlot) {
            ++correct;
        }
    }
    report.loss = loss / std::max<size_t>(1, examples.size());
    report.accuracy = static_cast<float>(correct) / std::max<size_t>(1, examples.size());
    return report;
}

} // namespace aiciv::ai
