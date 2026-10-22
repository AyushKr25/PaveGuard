'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { GpsInfo } from '@/lib/detection-save';
import { Crosshair, Loader2, MapPin, X } from 'lucide-react';

export interface LocationPickerProps {
  /** Current location, or null when none is set. Never pre-filled with dummy data. */
  value: GpsInfo | null;
  onChange: (value: GpsInfo | null) => void;
  /** Keep updating after a GPS fix (live camera mode). */
  watch?: boolean;
  className?: string;
}

type LocationSource = 'gps' | 'manual';

function parseCoordinate(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return num;
}

function describeGeoError(err: GeolocationPositionError | undefined): string {
  switch (err?.code) {
    case 1:
      return 'Location permission denied. Allow location access in your browser, or enter coordinates manually below.';
    case 2:
      return 'Location unavailable on this device. You can enter the coordinates manually below.';
    case 3:
      return 'Location request timed out. Try again, or enter the coordinates manually below.';
    default:
      return 'Could not detect location. Try again, or enter the coordinates manually below.';
  }
}

/**
 * Pick the location for a detection: either detect it via the browser GPS,
 * or type latitude/longitude manually. Nothing is ever pre-filled — if no
 * location is chosen, detections are saved without coordinates.
 */
export function LocationPicker({ value, onChange, watch = false, className }: LocationPickerProps) {
  const [isDetecting, setIsDetecting] = React.useState(false);
  const [detectError, setDetectError] = React.useState<string | null>(null);
  const [latInput, setLatInput] = React.useState('');
  const [lngInput, setLngInput] = React.useState('');
  const [manualError, setManualError] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<LocationSource | null>(null);
  const [watching, setWatching] = React.useState(false);
  const watchIdRef = React.useRef<number | null>(null);

  const stopWatch = React.useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setWatching(false);
  }, []);

  React.useEffect(() => stopWatch, [stopWatch]);

  const detectLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setDetectError('Geolocation is not supported by this browser. Enter the coordinates manually below.');
      return;
    }
    setIsDetecting(true);
    setDetectError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fix: GpsInfo = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setLatInput(fix.lat.toFixed(6));
        setLngInput(fix.lng.toFixed(6));
        setSource('gps');
        setIsDetecting(false);
        onChange(fix);

        if (watch) {
          stopWatch();
          watchIdRef.current = navigator.geolocation.watchPosition(
            (p) => {
              const next: GpsInfo = {
                lat: p.coords.latitude,
                lng: p.coords.longitude,
                accuracy: p.coords.accuracy,
              };
              setLatInput(next.lat.toFixed(6));
              setLngInput(next.lng.toFixed(6));
              setSource('gps');
              onChange(next);
            },
            () => {},
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
          );
          setWatching(true);
        }
      },
      (err) => {
        setIsDetecting(false);
        setDetectError(describeGeoError(err));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const applyManual = () => {
    const lat = parseCoordinate(latInput, -90, 90);
    const lng = parseCoordinate(lngInput, -180, 180);
    if (lat === null || lng === null) {
      setManualError('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).');
      return;
    }
    setManualError(null);
    stopWatch();
    setSource('manual');
    onChange({ lat, lng, accuracy: null });
  };

  const clearLocation = () => {
    stopWatch();
    setSource(null);
    setDetectError(null);
    setManualError(null);
    setLatInput('');
    setLngInput('');
    onChange(null);
  };

  return (
    <div className={cn('rounded-lg border border-input p-4 space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Location</span>
          {value && source && (
            <Badge variant="secondary" className="text-xs">
              {source === 'gps' ? (watching ? 'GPS · live' : 'GPS') : 'Manual'}
            </Badge>
          )}
        </div>
        {value && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={clearLocation}>
            <X className="w-3 h-3 mr-1" />
            Remove
          </Button>
        )}
      </div>

      {value ? (
        <div className="rounded-md bg-muted px-3 py-2 text-sm">
          <span className="font-mono">
            {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
          </span>
          {value.accuracy != null && value.accuracy > 0 && (
            <span className="text-muted-foreground ml-2">±{Math.round(value.accuracy)}m</span>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Attach the location of this pothole: detect it automatically, or enter the coordinates manually. If left
          empty, detections are saved without a location.
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={detectLocation}
        disabled={isDetecting}
        className="w-full"
      >
        {isDetecting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Detecting location...
          </>
        ) : (
          <>
            <Crosshair className="w-4 h-4 mr-2" />
            Detect my location
          </>
        )}
      </Button>
      {detectError && <p className="text-xs text-destructive">{detectError}</p>}

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Or enter coordinates manually</Label>
        <div className="flex items-center gap-2">
          <Input
            inputMode="decimal"
            placeholder="Latitude"
            aria-label="Latitude"
            className="h-9 text-sm"
            value={latInput}
            onChange={(e) => setLatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyManual();
            }}
          />
          <Input
            inputMode="decimal"
            placeholder="Longitude"
            aria-label="Longitude"
            className="h-9 text-sm"
            value={lngInput}
            onChange={(e) => setLngInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyManual();
            }}
          />
          <Button type="button" size="sm" variant="outline" className="h-9" onClick={applyManual}>
            Set
          </Button>
        </div>
        {manualError && <p className="text-xs text-destructive">{manualError}</p>}
      </div>
    </div>
  );
}
