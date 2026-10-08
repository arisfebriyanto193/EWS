#define relay 13


void setup() {
  Serial.begin(115200);
  pinMode(relay, OUTPUT);
}

void loop() {
  Serial.println("ON");
  digitalWrite(relay, 1);
  delay(6000);
  digitalWrite(relay, 0);
  delay(6000);
}

