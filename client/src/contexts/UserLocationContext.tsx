import React, { createContext, useContext, useRef, useState } from "react";

type UserCoordinates = {
  lat: number;
  lng: number;
};

type UserLocationStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable"
  | "outside_bay_area";

type PersonalizationMode = "general" | "personalized";

interface UserLocationContextValue {
  status: UserLocationStatus;
  mode: PersonalizationMode;
  coordinates: UserCoordinates | null;
  isBayArea: boolean;
  requestLocation: () => void;
}

const BAY_AREA_BOUNDS = {
  minLat: 36.8,
  maxLat: 38.9,
  minLng: -123.2,
  maxLng: -121.2,
} as const;

const UserLocationContext = createContext<UserLocationContextValue | undefined>(undefined);

function isWithinBayArea({ lat, lng }: UserCoordinates) {
  return (
    lat >= BAY_AREA_BOUNDS.minLat &&
    lat <= BAY_AREA_BOUNDS.maxLat &&
    lng >= BAY_AREA_BOUNDS.minLng &&
    lng <= BAY_AREA_BOUNDS.maxLng
  );
}

export function UserLocationProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<UserLocationStatus>("idle");
  const [coordinates, setCoordinates] = useState<UserCoordinates | null>(null);
  const pendingRef = useRef(false);

  const requestLocation = () => {
    if (pendingRef.current) return;

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }

    pendingRef.current = true;
    setStatus("requesting");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        pendingRef.current = false;
        const nextCoordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setCoordinates(nextCoordinates);
        setStatus(isWithinBayArea(nextCoordinates) ? "granted" : "outside_bay_area");
      },
      (error) => {
        pendingRef.current = false;
        if (error.code === error.PERMISSION_DENIED) {
          setStatus("denied");
          return;
        }
        setStatus("unavailable");
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 10 * 60 * 1000,
      },
    );
  };

  const value: UserLocationContextValue = {
    status,
    mode: status === "granted" && coordinates ? "personalized" : "general",
    coordinates,
    isBayArea: status === "granted",
    requestLocation,
  };

  return <UserLocationContext.Provider value={value}>{children}</UserLocationContext.Provider>;
}

export function useUserLocation() {
  const context = useContext(UserLocationContext);
  if (!context) {
    throw new Error("useUserLocation must be used within UserLocationProvider");
  }
  return context;
}
