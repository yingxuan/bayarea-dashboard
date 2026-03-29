import React, { createContext, useContext, useEffect, useRef, useState } from "react";

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
  permissionState: PermissionState | "unsupported" | "unknown";
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
  const [permissionState, setPermissionState] = useState<PermissionState | "unsupported" | "unknown">(
    "unknown",
  );
  const pendingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setPermissionState("unsupported");
      return;
    }

    if (!("permissions" in navigator) || typeof navigator.permissions.query !== "function") {
      setPermissionState("unknown");
      return;
    }

    let active = true;
    let permissionStatus: PermissionStatus | null = null;

    void navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((result) => {
        if (!active) return;
        permissionStatus = result;
        setPermissionState(result.state);

        result.onchange = () => {
          if (!active) return;
          setPermissionState(result.state);
          if (result.state === "denied") {
            setCoordinates(null);
            setStatus("denied");
          }
        };
      })
      .catch(() => {
        if (!active) return;
        setPermissionState("unknown");
      });

    return () => {
      active = false;
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, []);

  const requestLocation = () => {
    if (pendingRef.current) return;

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setPermissionState("unsupported");
      setStatus("unavailable");
      return;
    }

    if (permissionState === "denied") {
      setStatus("denied");
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
        setPermissionState("granted");
        setStatus(isWithinBayArea(nextCoordinates) ? "granted" : "outside_bay_area");
      },
      (error) => {
        pendingRef.current = false;
        if (error.code === error.PERMISSION_DENIED) {
          setPermissionState("denied");
          setCoordinates(null);
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
    permissionState,
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
