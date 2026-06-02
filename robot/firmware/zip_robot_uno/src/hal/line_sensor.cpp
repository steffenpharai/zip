/*
 * Line Sensor Implementation - ITR20001
 */

#include "hal/line_sensor.h"

LineSensorITR20001::LineSensorITR20001()
  : threshold(LINE_SENSOR_THRESHOLD_DEFAULT)
  , baselineLeft(512)
  , baselineMiddle(512)
  , baselineRight(512)
  , calibrated(false)
{
}

void LineSensorITR20001::init() {
  pinMode(PIN_LINE_L, INPUT);
  pinMode(PIN_LINE_M, INPUT);
  pinMode(PIN_LINE_R, INPUT);
  
  // Initial baseline (will be calibrated later)
  readBaseline();
}

uint16_t LineSensorITR20001::readLeft() const {
  return analogRead(PIN_LINE_L);
}

uint16_t LineSensorITR20001::readMiddle() const {
  return analogRead(PIN_LINE_M);
}

uint16_t LineSensorITR20001::readRight() const {
  return analogRead(PIN_LINE_R);
}

void LineSensorITR20001::readAll(uint16_t* left, uint16_t* middle, uint16_t* right) const {
  if (left) *left = readLeft();
  if (middle) *middle = readMiddle();
  if (right) *right = readRight();
}

void LineSensorITR20001::calibrate() {
  // Read baseline values (assume on white surface)
  readBaseline();
  calibrated = true;
}

void LineSensorITR20001::readBaseline() {
  // Average multiple readings
  uint32_t sumL = 0, sumM = 0, sumR = 0;
  const uint8_t samples = 10;
  
  for (uint8_t i = 0; i < samples; i++) {
    sumL += analogRead(PIN_LINE_L);
    sumM += analogRead(PIN_LINE_M);
    sumR += analogRead(PIN_LINE_R);
    delay(10);
  }
  
  baselineLeft = sumL / samples;
  baselineMiddle = sumM / samples;
  baselineRight = sumR / samples;
}

void LineSensorITR20001::setThreshold(uint16_t thresh) {
  threshold = thresh;
}

bool LineSensorITR20001::isLineDetected() const {
  return isLineLeft() || isLineMiddle() || isLineRight();
}

bool LineSensorITR20001::isLineLeft() const {
  uint16_t value = readLeft();
  // Line is darker (lower value) than baseline
  return value < (baselineLeft - threshold);
}

bool LineSensorITR20001::isLineMiddle() const {
  uint16_t value = readMiddle();
  return value < (baselineMiddle - threshold);
}

bool LineSensorITR20001::isLineRight() const {
  uint16_t value = readRight();
  return value < (baselineRight - threshold);
}

uint16_t LineSensorITR20001::getCalibratedLeft() const {
  uint16_t raw = readLeft();
  if (raw < baselineLeft) {
    return baselineLeft - raw;  // Line detected
  }
  return 0;
}

uint16_t LineSensorITR20001::getCalibratedMiddle() const {
  uint16_t raw = readMiddle();
  if (raw < baselineMiddle) {
    return baselineMiddle - raw;
  }
  return 0;
}

uint16_t LineSensorITR20001::getCalibratedRight() const {
  uint16_t raw = readRight();
  if (raw < baselineRight) {
    return baselineRight - raw;
  }
  return 0;
}

