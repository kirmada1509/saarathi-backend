-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "home_airport" TEXT NOT NULL,
    "home_city" TEXT NOT NULL,
    "frequent_flyer" TEXT NOT NULL,
    "preferred_airlines" TEXT NOT NULL,
    "preferred_cabin" TEXT NOT NULL,
    "price_sensitivity" TEXT NOT NULL,
    "direct_preference" TEXT NOT NULL,
    "max_layover_minutes" INTEGER NOT NULL,
    "date_flexibility_days" INTEGER NOT NULL,
    "multi_city_tendency" TEXT NOT NULL,
    "trip_purpose" TEXT NOT NULL,
    "preferred_departure" TEXT NOT NULL,
    "baggage_preference" TEXT NOT NULL,
    "seasonal_pattern" TEXT NOT NULL,
    "raw_history" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Flight" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "flight_id" TEXT NOT NULL,
    "airline_code" TEXT NOT NULL,
    "airline_name" TEXT NOT NULL,
    "alliance" TEXT NOT NULL,
    "flight_numbers" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "origin_city" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "destination_city" TEXT NOT NULL,
    "departure_utc" TEXT NOT NULL,
    "arrival_utc" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "stops" INTEGER NOT NULL,
    "layover_airports" TEXT NOT NULL,
    "layover_minutes" INTEGER NOT NULL,
    "cabin_class" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "seats_available" INTEGER NOT NULL,
    "aircraft_type" TEXT NOT NULL,
    "on_time_performance" REAL NOT NULL,
    "baggage_included" BOOLEAN NOT NULL,
    "refundable" BOOLEAN NOT NULL,
    "demand_level" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "is_holiday_season" BOOLEAN NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_user_id_key" ON "User"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Flight_flight_id_key" ON "Flight"("flight_id");
