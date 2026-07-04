CXX ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -pedantic

all: train_ai_player

train_ai_player: ai_player.cpp action_tests.cpp economics_tests.cpp strategy_tests.cpp train_ai_player.cpp ai_player.h ai_player_formats.h action_tests.h economics_tests.h strategy_tests.h
	$(CXX) $(CXXFLAGS) ai_player.cpp action_tests.cpp economics_tests.cpp strategy_tests.cpp train_ai_player.cpp -o train_ai_player

clean:
	rm -f train_ai_player

.PHONY: all clean
