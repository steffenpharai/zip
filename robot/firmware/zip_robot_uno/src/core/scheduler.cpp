/*
 * Scheduler Implementation
 */

#include "core/scheduler.h"
#include <avr/wdt.h>

Scheduler::Scheduler()
  : taskCount(0)
  , lastWatchdogReset(0)
{
  // Initialize task array
  for (uint8_t i = 0; i < MAX_TASKS; i++) {
    tasks[i].func = nullptr;
    tasks[i].intervalMs = 0;
    tasks[i].lastRunTime = 0;
    tasks[i].enabled = false;
    tasks[i].name = nullptr;
  }
}

void Scheduler::init() {
  taskCount = 0;
  lastWatchdogReset = millis();
}

bool Scheduler::registerTask(TaskFunction func, unsigned long intervalMs, const char* name) {
  if (taskCount >= MAX_TASKS) {
    return false;  // Too many tasks
  }
  
  tasks[taskCount].func = func;
  tasks[taskCount].intervalMs = intervalMs;
  tasks[taskCount].lastRunTime = 0;
  tasks[taskCount].enabled = true;
  tasks[taskCount].name = name;
  
  taskCount++;
  return true;
}

void Scheduler::enableTask(uint8_t index) {
  if (index < taskCount) {
    tasks[index].enabled = true;
  }
}

void Scheduler::disableTask(uint8_t index) {
  if (index < taskCount) {
    tasks[index].enabled = false;
  }
}

void Scheduler::run() {
  unsigned long now = millis();
  
  // Reset watchdog more frequently to prevent timeouts during long operations
  // Reset every 100ms instead of 500ms for better safety margin
  if (now - lastWatchdogReset > 100) {
    wdt_reset();
    lastWatchdogReset = now;
  }
  
  // Run all enabled tasks
  for (uint8_t i = 0; i < taskCount; i++) {
    if (!tasks[i].enabled || tasks[i].func == nullptr) {
      continue;
    }
    
    // Check if task should run
    unsigned long elapsed = now - tasks[i].lastRunTime;
    if (elapsed >= tasks[i].intervalMs) {
      // Reset watchdog before running task
      wdt_reset();
      lastWatchdogReset = now;
      
      // Run task
      tasks[i].func();
      tasks[i].lastRunTime = now;
      
      // Reset watchdog after running task
      wdt_reset();
      lastWatchdogReset = now;
    }
  }
}

