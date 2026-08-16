#include "ai_player.h"

#include <array>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {

constexpr std::uint32_t kRequestMagic = 0x51434941;  // AICQ in little endian.
constexpr std::uint32_t kResponseMagic = 0x52434941; // AICR in little endian.

struct RequestHeader {
    std::uint32_t magic;
    std::uint32_t requestId;
    std::uint32_t engine;
    std::uint32_t width;
};

struct ResponseHeader {
    std::uint32_t magic;
    std::uint32_t requestId;
    std::uint32_t status;
    std::uint32_t width;
};

bool readExact(char* destination, std::size_t bytes)
{
    std::cin.read(destination, static_cast<std::streamsize>(bytes));
    if (std::cin.gcount() == 0 && std::cin.eof()) return false;
    if (static_cast<std::size_t>(std::cin.gcount()) != bytes) {
        throw std::runtime_error("truncated inference request");
    }
    return true;
}

void writeResponse(std::uint32_t requestId, const aiciv::ai::OutputSignal& output)
{
    ResponseHeader header{kResponseMagic, requestId, 0, aiciv::ai::kOutputWidth};
    std::cout.write(reinterpret_cast<const char*>(&header), sizeof(header));
    std::cout.write(reinterpret_cast<const char*>(output.data()),
                    static_cast<std::streamsize>(output.size() * sizeof(float)));
    std::cout.flush();
}

} // namespace

int main(int argc, char** argv)
{
    try {
        const std::string modelDirectory = argc > 1 ? argv[1] : ".";
        aiciv::ai::StrategyEngine strategy;
        aiciv::ai::ActionEngine action;
        aiciv::ai::EconomicsEngine economics;
        strategy.loadModel(modelDirectory + "/strategy.db");
        action.loadModel(modelDirectory + "/action.db");
        economics.loadModel(modelDirectory + "/economics.db");

        // A zero-width response signals that all models are resident and ready.
        ResponseHeader ready{kResponseMagic, 0, 0, 0};
        std::cout.write(reinterpret_cast<const char*>(&ready), sizeof(ready));
        std::cout.flush();

        while (true) {
            RequestHeader request{};
            if (!readExact(reinterpret_cast<char*>(&request), sizeof(request))) break;
            if (request.magic != kRequestMagic) throw std::runtime_error("invalid inference request magic");
            const std::uint32_t expectedWidth = request.engine == 0
                ? AI_PLAYER_INPUT_WIDTH : AI_PLAYER_BASE_INPUT_WIDTH;
            if (request.engine > 2 || request.width != expectedWidth) {
                throw std::runtime_error("invalid inference engine or input width");
            }

            aiciv::ai::InputSignal input{};
            input.fill(0.0f);
            if (!readExact(reinterpret_cast<char*>(input.data()),
                           static_cast<std::size_t>(request.width) * sizeof(float))) {
                throw std::runtime_error("missing inference input");
            }

            aiciv::ai::OutputSignal output{};
            if (request.engine == 0) output = strategy.infer(input);
            else if (request.engine == 1) output = action.infer(input);
            else output = economics.infer(input);
            writeResponse(request.requestId, output);
        }
        return 0;
    }
    catch (const std::exception& error) {
        std::cerr << "inference_worker: " << error.what() << '\n';
        return 1;
    }
}
