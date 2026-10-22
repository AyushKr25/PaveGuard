'use client';

import 'leaflet/dist/leaflet.css';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  MapPin, 
  Filter, 
  Layers, 
  Locate, 
  ZoomIn, 
  ZoomOut,
  AlertTriangle,
  CheckCircle,
  X,
} from 'lucide-react';
import { getDetectionsNear, getCurrentUser } from '@/lib/supabase';
import { cn, getSeverityColor, formatRelativeTime } from '@/lib/utils';
import type { SeverityLevel, DetectionRecord } from '@/types';
import { AppShell } from '@/components/app-shell';

const severityColors: Record<SeverityLevel, string> = {
  LOW: '#22c55e',
  MODERATE: '#f59e0b',
  HIGH: '#ef4444',
  CRITICAL: '#991b1b',
};

const severityBg: Record<SeverityLevel, string> = {
  LOW: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  MODERATE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  HIGH: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  CRITICAL: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200',
};

export default function MapPage() {
  const { toast } = useToast();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [markers, setMarkers] = useState<DetectionRecord[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<DetectionRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [filters, setFilters] = useState({
    severity: [] as SeverityLevel[],
    radius: 5000,
    dateRange: { from: undefined as Date | undefined, to: undefined as Date | undefined },
  });
  const [clusterEnabled, setClusterEnabled] = useState(true);
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 0]);
  const [mapZoom, setMapZoom] = useState(2);

  // Latest render's values for callbacks that outlive a single render
  // (the Leaflet moveend handler would otherwise keep the initial filters)
  const filtersRef = useRef(filters);
  const isLoadingRef = useRef(false);
  const detectionsRef = useRef<DetectionRecord[]>([]);
  const clusterRef = useRef(clusterEnabled);
  filtersRef.current = filters;
  clusterRef.current = clusterEnabled;

  // Initialize Leaflet map. The container mounts after AppShell resolves the
  // user session, so retry until the ref is attached.
  useEffect(() => {
    if (mapInstanceRef.current) return;
    let cancelled = false;

    const tryInit = (attempts = 0) => {
      if (cancelled) return;
      if (!mapRef.current) {
        if (attempts < 50) setTimeout(() => tryInit(attempts + 1), 100);
        return;
      }

    // Dynamic import Leaflet
    import('leaflet').then((L) => {
      if (cancelled) return;
      // Fix default marker icons
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current!, {
        center: mapCenter,
        zoom: mapZoom,
        zoomControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;

      map.on('moveend', () => {
        const center = map.getCenter();
        const zoom = map.getZoom();
        setMapCenter([center.lat, center.lng]);
        setMapZoom(zoom);
        loadMarkersRef.current(center.lat, center.lng);
      });

      // Re-cluster on zoom change (grid grouping depends on the zoom level)
      map.on('zoomend', () => {
        setMapZoom(map.getZoom());
        updateMapMarkers(detectionsRef.current);
      });

      // Load initial markers
      loadMarkersRef.current(mapCenter[0], mapCenter[1]);

      // Get user location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
            setUserLocation(coords);
            map.setView(coords, 14);
          },
          () => {}
        );
      }
    });

    };
    tryInit();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const loadMarkers = async (lat: number, lng: number) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);

    try {
      const { data, error } = await getDetectionsNear(lat, lng, filtersRef.current.radius, 500);
      if (error) throw error;
      if (data) {
        // Filter by severity if selected
        let filtered = data;
        if (filtersRef.current.severity.length > 0) {
          filtered = data.filter(d => filtersRef.current.severity.includes(d.severity_level as SeverityLevel));
        }
        detectionsRef.current = filtered as unknown as DetectionRecord[];
        setMarkers(detectionsRef.current);
        updateMapMarkers(detectionsRef.current);
      }
    } catch (error) {
      console.error('Failed to load markers:', error);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  };

  // Keep the Leaflet handlers and filter effects calling the latest loader
  const loadMarkersRef = useRef(loadMarkers);
  loadMarkersRef.current = loadMarkers;

  const updateMapMarkers = (detections: DetectionRecord[]) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    import('leaflet').then((L) => {
      // Clear all layers before redrawing (clustering regroups every pass)
      markersRef.current.forEach((marker) => map.removeLayer(marker));
      markersRef.current.clear();

      const withLocation = detections.filter(d => d.latitude != null && d.longitude != null);

      // Grid-based clustering: group markers that land within the same
      // 60px cell so dense areas render one count badge instead of overlap
      const groups = new Map<string, DetectionRecord[]>();
      if (clusterRef.current && map.getZoom() < 15) {
        withLocation.forEach((d) => {
          const point = map.latLngToLayerPoint([d.latitude!, d.longitude!]);
          const key = `${Math.floor(point.x / 60)},${Math.floor(point.y / 60)}`;
          const bucket = groups.get(key) || [];
          bucket.push(d);
          groups.set(key, bucket);
        });
      } else {
        withLocation.forEach((d) => groups.set(d.id, [d]));
      }

      groups.forEach((group) => {
        if (group.length === 1) {
          const detection = group[0];
          const color = severityColors[detection.severity_level as SeverityLevel];
          const icon = L.divIcon({
            className: 'custom-marker',
            html: `
              <div style="
                width: 24px; height: 24px; border-radius: 50%;
                background: ${color}; border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                display: flex; align-items: center; justify-content: center;
                color: white; font-size: 10px; font-weight: bold;
              ">
                ${detection.severity_level[0]}
              </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });
          const marker = L.marker([detection.latitude!, detection.longitude!], { icon })
            .addTo(map)
            .on('click', () => setSelectedMarker(detection));
          markersRef.current.set(detection.id, marker);
        } else {
          // Cluster marker: color of the highest severity in the group
          const rank: Record<string, number> = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };
          const top = group.reduce((a, b) => ((rank[b.severity_level] ?? 0) > (rank[a.severity_level] ?? 0) ? b : a));
          const color = severityColors[top.severity_level as SeverityLevel];
          let sumLat = 0;
          let sumLng = 0;
          group.forEach((d) => {
            sumLat += d.latitude!;
            sumLng += d.longitude!;
          });
          const center: [number, number] = [sumLat / group.length, sumLng / group.length];
          const icon = L.divIcon({
            className: 'custom-marker cluster-marker',
            html: `
              <div style="
                width: 36px; height: 36px; border-radius: 50%;
                background: ${color}; border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.35);
                display: flex; align-items: center; justify-content: center;
                color: white; font-size: 13px; font-weight: bold;
              ">
                ${group.length}
              </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });
          const key = `cluster_${group.map((d) => d.id).sort().join('_')}`;
          const marker = L.marker(center, { icon })
            .addTo(map)
            .on('click', () => {
              // Zoom into the cluster on click
              map.setView(center, Math.min(map.getZoom() + 3, 18));
            });
          markersRef.current.set(key, marker);
        }
      });
    });
  };

  // Reload when the user changes severity/radius filters (the RPC query uses
  // the radius; severity is applied client-side but requires a redraw)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    loadMarkersRef.current(mapCenter[0], mapCenter[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.severity, filters.radius]);

  // Redraw when clustering is toggled
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    updateMapMarkers(detectionsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterEnabled]);

  const handleLocate = () => {
    if (userLocation && mapInstanceRef.current) {
      mapInstanceRef.current.setView(userLocation, 16);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setUserLocation(coords);
          mapInstanceRef.current?.setView(coords, 16);
        },
        () => toast({ title: 'Location error', description: 'Could not get your location', variant: 'destructive' })
      );
    }
  };

  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();

  const clearSelection = () => setSelectedMarker(null);

  return (
    <AppShell>
      <div className="flex gap-4 items-start">
      {/* Sidebar */}
      <aside className="w-80 border-r bg-card flex flex-col hidden lg:flex">
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MapPin className="w-6 h-6 text-primary" />
            Pothole Map
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Severity</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as SeverityLevel[]).map(level => (
                    <Badge
                      key={level}
                      variant={level.toLowerCase() as any}
                      className={cn(severityBg[level], 'cursor-pointer')}
                      onClick={() => setFilters(f => ({
                        ...f,
                        severity: f.severity.includes(level)
                          ? f.severity.filter(s => s !== level)
                          : [...f.severity, level]
                      }))}
                    >
                      {level} {filters.severity.includes(level) && <CheckCircle className="w-3 h-3 ml-1" />}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <Label htmlFor="radius">Search Radius: {filters.radius / 1000} km</Label>
                <Slider
                  id="radius"
                  value={[filters.radius]}
                  onValueChange={([v]) => setFilters(f => ({...f, radius: v}))}
                  min={500}
                  max={50000}
                  step={500}
                  className="mt-2"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="cluster">Cluster Markers</Label>
                  <p className="text-xs text-muted-foreground">Group nearby detections below zoom 15</p>
                </div>
                <Switch id="cluster" checked={clusterEnabled} onCheckedChange={setClusterEnabled} />
              </div>
            </CardContent>
          </Card>

          {/* Markers List */}
          <Card className="flex-1 min-h-0">
            <CardHeader className="pb-2 flex items-center justify-between">
              <CardTitle>Detections ({markers.length})</CardTitle>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            </CardHeader>
            <CardContent className="p-0">
              {markers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No detections in this area</p>
                  <p className="text-sm mt-1">Adjust filters or move map</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  {markers.map((detection) => (
                    <button
                      key={detection.id}
                      onClick={() => {
                        setSelectedMarker(detection);
                        mapInstanceRef.current?.setView(
                          [detection.latitude!, detection.longitude!],
                          16
                        );
                      }}
                      className={cn(
                        'w-full p-3 text-left hover:bg-muted transition-colors border-b',
                        selectedMarker?.id === detection.id && 'bg-primary/5 border-l-2 border-l-primary'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold', severityBg[detection.severity_level as SeverityLevel])}>
                          {detection.severity_level[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">Pothole - {detection.severity_level}</p>
                          <p className="text-xs text-muted-foreground">
                            {(detection.confidence * 100).toFixed(1)}% • {formatRelativeTime(detection.created_at)}
                          </p>
                          {detection.latitude && detection.longitude && (
                            <p className="text-xs text-muted-foreground font-mono mt-1">
                              {detection.latitude.toFixed(4)}, {detection.longitude.toFixed(4)}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="p-4 border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>© OpenStreetMap</span>
            <span>•</span>
            <span>{markers.length} markers</span>
          </div>
        </div>
      </aside>

      {/* Map */}
      <main className="flex-1 relative w-full">
        <div 
          ref={mapRef} 
          className="w-full h-[calc(100vh-9rem)] min-h-[500px] rounded-md overflow-hidden"
          style={{ zIndex: 0 }}
        />

        {/* Map Controls */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
          <Button variant="outline" size="icon" onClick={handleZoomIn} title="Zoom In">
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleZoomOut} title="Zoom Out">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleLocate} title="My Location">
            <Locate className="w-4 h-4" />
          </Button>
        </div>

        {/* Selected Marker Popup */}
        {selectedMarker && (
          <div className="absolute bottom-4 left-4 right-4 lg:left-auto lg:right-4 lg:bottom-auto lg:top-20 lg:w-80 z-10">
            <Card className="shadow-lg">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Detection Details</CardTitle>
                  <Button variant="ghost" size="icon" onClick={clearSelection}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold', severityBg[selectedMarker.severity_level as SeverityLevel])}>
                    {selectedMarker.severity_level[0]}
                  </div>
                  <div>
                    <p className="font-semibold">Pothole - {selectedMarker.severity_level}</p>
                    <Badge variant={selectedMarker.severity_level.toLowerCase() as any} className={severityBg[selectedMarker.severity_level as SeverityLevel]}>
                      {selectedMarker.severity_level}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Confidence</p>
                    <p className="font-mono">{(selectedMarker.confidence * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Severity Score</p>
                    <p className="font-mono">{selectedMarker.severity_score.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Source</p>
                    <p className="capitalize">{selectedMarker.source}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Type</p>
                    <p className="capitalize">{selectedMarker.detection_type}</p>
                  </div>
                </div>

                {selectedMarker.latitude && selectedMarker.longitude && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-muted-foreground text-sm">Location</p>
                    <p className="font-mono text-sm">{selectedMarker.latitude.toFixed(6)}, {selectedMarker.longitude.toFixed(6)}</p>
                    {selectedMarker.location_accuracy && (
                      <p className="text-xs text-muted-foreground mt-1">Accuracy: ±{Math.round(selectedMarker.location_accuracy)}m</p>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1" asChild>
                    <a href={`/detections/${selectedMarker.id}`}>View Details</a>
                  </Button>
                  <Button size="sm" onClick={clearSelection}>Close</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-10">
          <Card className="shadow-lg">
            <CardContent className="p-4">
              <p className="font-medium mb-3">Severity Legend</p>
              <div className="flex flex-col gap-2">
                {(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as SeverityLevel[]).map(level => (
                  <div key={level} className="flex items-center gap-2">
                    <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold', severityBg[level])}>
                      {level[0]}
                    </div>
                    <span className="text-sm">{level}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      </div>
    </AppShell>
  );
}

function Loader2({ className }: { className?: string }) {
  return <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" strokeLinecap="round"/></svg>;
}
