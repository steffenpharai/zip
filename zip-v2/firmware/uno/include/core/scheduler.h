/*
 * Cooperative Scheduler
 * 
 * Fixed-frequency task execution
 * Watchdog integration
 */

#ifndef SCHEDULER_H
#define SCHEDULER_H

#include <Arduino.h>
#include "../config.h"

// Task function pointer type
typedef void (*TaskFunction)();

// Task structure
struct Task {
  TaskFunction func;
  unsigned long intervalMs;
  unsigned long lastRunTime;
  bool enabled;
  const char* name;
};

class Scheduler {
public:
  Scheduler();
  
  // Initialize scheduler
  void init();
  
  // Register a task
  bool registerTask(TaskFunction func, unsigned long intervalMs, const char* name);
  
  // Enable/disable task
  void enableTask(uint8_t index);
  void disableTask(uint8_t index);
  
  // Run scheduler (call from main loop)
  void run();
  
  // Get task count
  uint8_t getTaskCount() const { return taskCount; }
  
private:
  static const uint8_t MAX_TASKS = 8;  // Reduced from 10 to save RAM (we only use 5 tasks)
  Task tasks[MAX_TASKS];
  uint8_t taskCount;
  
  unsigned long lastWatchdogReset;
};

#endif // SCHEDULER_H

