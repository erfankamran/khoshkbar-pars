'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * نقشه انتخاب موقعیت فروشگاه (درخواست کاربر) — مارکر قابل کشیدن
 * - مارکر را با موس/لمس جابجا کنید یا مستقیم روی نقشه بزنید → مختصات بازمی‌گردد
 * - تغییر مختصات از فیلدهای متنی هم مارکر را جابجا می‌کند (دوطرفه)
 * - Leaflet فقط سمت کلاینت بارگذاری می‌شود (dynamic import در useEffect)
 * - کاشی‌ها: OpenStreetMap (بدون کلید API)
 */

const DEFAULT_CENTER: [number, number] = [35.6892, 51.389]; // تهران — حالت بدون مختصات
const PIN_SVG = `
<svg width="34" height="46" viewBox="0 0 34 46" xmlns="http://www.w3.org/2000/svg">
  <path d="M17 0C7.6 0 0 7.6 0 17c0 12.2 14.4 26.1 16.3 27.8.4.3 1 .3 1.4 0C19.6 43.1 34 29.2 34 17 34 7.6 26.4 0 17 0z" fill="#1f8f5a"/>
  <circle cx="17" cy="17" r="8" fill="#ffffff"/>
  <circle cx="17" cy="17" r="4" fill="#d9b352"/>
</svg>`;

export function MapPicker({
  lat,
  lng,
  onChange,
  ariaLabel = 'نقشه انتخاب موقعیت فروشگاه',
}: {
  lat: string;
  lng: string;
  onChange: (lat: string, lng: string) => void;
  ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [ready, setReady] = useState(false);

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const valid =
    lat.trim() !== '' &&
    lng.trim() !== '' &&
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum) &&
    Math.abs(latNum) <= 90 &&
    Math.abs(lngNum) <= 180;

  // ——— راه‌اندازی یک‌باره نقشه (فقط کلاینت) ———
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = await import('leaflet');
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: 15,
        scrollWheelZoom: true,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);

      const icon = L.divIcon({
        className: 'pars-map-pin',
        html: PIN_SVG,
        iconSize: [34, 46],
        iconAnchor: [17, 44],
      });

      const marker = L.marker(DEFAULT_CENTER, {
        icon,
        draggable: true,
        autoPan: true,
      }).addTo(map);

      const report = (p: { lat: number; lng: number }) => {
        onChangeRef.current(p.lat.toFixed(6), p.lng.toFixed(6));
      };
      marker.on('dragend', () => report(marker.getLatLng()));
      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        report(e.latlng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      setReady(true);
      // اگر کانتینر بعد از رندر جابه‌جا/مخفی شده بود
      setTimeout(() => map.invalidateSize(), 150);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // ——— همگام‌سازی مختصات ورودی → مارکر (بدون حلقه: فقط تفاوت واقعی) ———
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!ready || !map || !marker) return;
    if (!valid) return;
    const current = marker.getLatLng();
    if (
      Math.abs(current.lat - latNum) < 1e-6 &&
      Math.abs(current.lng - lngNum) < 1e-6
    ) {
      return;
    }
    const next: [number, number] = [latNum, lngNum];
    marker.setLatLng(next);
    map.panTo(next, { animate: true });
  }, [ready, valid, latNum, lngNum]);

  // ——— حالت بدون مختصات: مارکر مخفی ———
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!ready || !map || !marker) return;
    const el = marker.getElement();
    if (el) el.style.display = valid ? '' : 'none';
  }, [ready, valid]);

  return (
    <div
      ref={containerRef}
      dir="ltr"
      role="application"
      aria-label={ariaLabel}
      className="z-0 h-64 w-full overflow-hidden rounded-xl border border-cream-200"
    />
  );
}
