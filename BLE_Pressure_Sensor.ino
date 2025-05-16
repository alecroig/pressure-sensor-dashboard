#include <Wire.h>
#include "Adafruit_MPRLS.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ==== I2C and Sensor Setup ====
#define SDA_PIN 2
#define SCL_PIN 3
Adafruit_MPRLS mprls = Adafruit_MPRLS(-1, -1);  // Default I2C

// ==== BLE Setup ====
#define SERVICE_UUID        "19B10000-E8F2-537E-4F6C-D104768A1214"
#define CHARACTERISTIC_UUID "19B10001-E8F2-537E-4F6C-D104768A1214"

BLECharacteristic *pCharacteristic;
bool deviceConnected = false;

unsigned long startTime;
unsigned long lastReadTime = 0;
const unsigned long interval = 250;  // 0.25 seconds
float zeroOffset = 0.0;

// ==== BLE Callbacks ====
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
    Serial.println("BLE device connected.");
  }

  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    Serial.println("BLE device disconnected.");
    BLEDevice::startAdvertising();  // Restart advertising
  }
};

// ==== Sensor Calibration ====
 float calibrateSensor() {
  Serial.println("Starting 5-second calibration...");

  const unsigned long calibrationDuration = 5000;
  unsigned long calibStart = millis();
  int samples = 0;
  float sum = 0;

  while (millis() - calibStart < calibrationDuration) {
    float pressure_hpa = mprls.readPressure();
    float pressure_psi = pressure_hpa * 0.0145038;

    sum += pressure_psi;
    samples++;

    delay(100);  // 10 samples per second
  }

  float offset = sum / samples;
  Serial.print("Calibration complete. Zero offset (PSI): ");
  Serial.println(offset, 4);
  return offset;
}

// ==== Setup Function ====
void setup() {
  Serial.begin(115200);
  while (!Serial);

  Serial.println("Starting MPRLS BLE broadcast with calibration...");

  // Start I2C
  Wire.begin(SDA_PIN, SCL_PIN);

  // Init sensor
  if (!mprls.begin()) {
    Serial.println("Failed to find MPRLS sensor!");
    while (1);
  }
  Serial.println("MPRLS sensor found.");

  // Start BLE
  BLEDevice::init("Pressure_Sensor");
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );
  pCharacteristic->addDescriptor(new BLE2902());

  pService->start();
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.println("BLE advertising started!");

  // Call Calibration
  zeroOffset = calibrateSensor(); 

  delay(1000); 

  startTime = millis(); // reset timer after calibration
}

// ==== Main Loop ====
void loop() {
  unsigned long now = millis();

  if (deviceConnected && (now - lastReadTime >= interval)) {
    lastReadTime = now;

    float pressure_hpa = mprls.readPressure();
    float pressure_psi = (pressure_hpa * 0.0145038) - zeroOffset;

    float elapsed_sec = (now - startTime) / 1000.0;

    char payload[32];
    snprintf(payload, sizeof(payload), "%.3f,%.4f", elapsed_sec, pressure_psi);

    Serial.print("Sending: ");
    Serial.println(payload);

    pCharacteristic->setValue((uint8_t*)payload, strlen(payload));
    pCharacteristic->notify();  // Push data over BLE
  }
}
