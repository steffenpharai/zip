"use client";

import { BatteryGauge } from "./BatteryGauge";
import { Bezel } from "./Bezel";
import { MotorPair } from "./MotorPair";
import { UltrasonicRange } from "./UltrasonicRange";

export function TelemetryPanel({
  batteryMv,
  ultrasonicCm,
  batterySeries,
  ultrasonicSeries,
  axes,
}: {
  batteryMv: number | null;
  ultrasonicCm: number | null;
  batterySeries: number[];
  ultrasonicSeries: number[];
  axes: { v: number; w: number };
}) {
  return (
    <aside className="flex flex-col gap-3">
      <Bezel callsign="TLM // BATT" meta="VDC · 6.4–8.4" index={0}>
        <BatteryGauge mv={batteryMv} series={batterySeries} />
      </Bezel>

      <Bezel callsign="TLM // RANGE" meta="ULTRASONIC · 0–200CM" index={1}>
        <UltrasonicRange cm={ultrasonicCm} series={ultrasonicSeries} max={200} />
      </Bezel>

      <Bezel callsign="DRV // MOTORS" meta="DIFF · L / R" index={2}>
        <MotorPair vAxis={axes.v} wAxis={axes.w} />
      </Bezel>
    </aside>
  );
}
