"use client";

const DEVICE_KEY = "binzeo_device_id";

export function getClientDeviceId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `web-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  window.localStorage.setItem(DEVICE_KEY, id);
  return id;
}

export function requestPreciseLocation() {
  return new Promise<{ latitude: number; longitude: number; accuracy_meters: number }>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Precise location is not supported by this browser"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: position.coords.accuracy,
      }),
      () => reject(new Error("Precise location permission is required")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}
