export class UserResponseDto {
  id!: number;
  user_id!: string;
  age!: number;
  home_airport!: string;
  home_city!: string;
  frequent_flyer!: string;
  preferred_airlines!: string;
  preferred_cabin!: string;
  price_sensitivity!: string;
  direct_preference!: string;
  max_layover_minutes!: number;
  date_flexibility_days!: number;
  multi_city_tendency!: string;
  trip_purpose!: string;
  preferred_departure!: string;
  baggage_preference!: string;
  seasonal_pattern!: string;
  raw_history!: string;

  static fromEntity(user: UserResponseShape): UserResponseDto {
    return Object.assign(new UserResponseDto(), user);
  }
}

export interface UserResponseShape {
  id?: number;
  user_id: string;
  age: number;
  home_airport: string;
  home_city: string;
  frequent_flyer: string;
  preferred_airlines: string;
  preferred_cabin: string;
  price_sensitivity: string;
  direct_preference: string;
  max_layover_minutes: number;
  date_flexibility_days: number;
  multi_city_tendency: string;
  trip_purpose: string;
  preferred_departure: string;
  baggage_preference: string;
  seasonal_pattern: string;
  raw_history: string;
}
