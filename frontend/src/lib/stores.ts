import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  UserProfile,
  UserPreferences,
  DetectionRecord,
  DetectionMedia,
  DetectionSession,
  RoadScanSession,
  ProcessingJob,
  SeverityLevel,
  DetectionType,
  DetectionSource,
  MapMarker,
  Detection,
} from '@/types';

// Auth Store
interface AuthState {
  user: UserProfile | null;
  session: { access_token: string; refresh_token: string } | null;
  isLoading: boolean;
  setUser: (user: UserProfile | null) => void;
  setSession: (session: AuthState['session']) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      session: null,
      isLoading: true,
      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => set({ user: null, session: null }),
    }),
    {
      name: 'spai-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user, session: state.session }),
    }
  )
);

// Preferences Store
interface PreferencesState {
  preferences: UserPreferences | null;
  isLoading: boolean;
  setPreferences: (prefs: UserPreferences) => void;
  updatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

const defaultPreferences: UserPreferences = {
  id: '',
  user_id: '',
  theme: 'system',
  inference_mode: 'auto',
  inference_fps: 5,
  confidence_threshold: 0.25,
  severity_threshold: 'MODERATE',
  enable_gps: true,
  enable_sound: false,
  auto_save_detections: false,
  map_cluster_enabled: true,
  language: 'en',
  units: 'metric',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      preferences: null,
      isLoading: true,
      setPreferences: (preferences) => set({ preferences, isLoading: false }),
      updatePreference: (key, value) =>
        set((state) => ({
          preferences: state.preferences
            ? { ...state.preferences, [key]: value, updated_at: new Date().toISOString() }
            : null,
        })),
      setLoading: (isLoading) => set({ isLoading }),
      reset: () => set({ preferences: null, isLoading: true }),
    }),
    {
      name: 'spai-preferences',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Detection Store
interface DetectionState {
  detections: DetectionRecord[];
  currentDetection: DetectionRecord | null;
  media: DetectionMedia[];
  isLoading: boolean;
  error: string | null;
  filters: {
    severity_level: SeverityLevel[];
    detection_type: DetectionType[];
    source: DetectionSource[];
    date_range: [Date | null, Date | null];
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  setDetections: (detections: DetectionRecord[]) => void;
  addDetection: (detection: DetectionRecord) => void;
  updateDetection: (id: string, updates: Partial<DetectionRecord>) => void;
  removeDetection: (id: string) => void;
  setCurrentDetection: (detection: DetectionRecord | null) => void;
  setMedia: (media: DetectionMedia[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setFilters: (filters: Partial<DetectionState['filters']>) => void;
  setPagination: (pagination: Partial<DetectionState['pagination']>) => void;
  clear: () => void;
}

export const useDetectionStore = create<DetectionState>()(
  persist(
    (set) => ({
      detections: [],
      currentDetection: null,
      media: [],
      isLoading: false,
      error: null,
      filters: {
        severity_level: [],
        detection_type: [],
        source: [],
        date_range: [null, null],
      },
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
      },
      setDetections: (detections) => set({ detections }),
      addDetection: (detection) => set((state) => ({ detections: [detection, ...state.detections] })),
      updateDetection: (id, updates) =>
        set((state) => ({
          detections: state.detections.map((d) => (d.id === id ? { ...d, ...updates } : d)),
        })),
      removeDetection: (id) =>
        set((state) => ({
          detections: state.detections.filter((d) => d.id !== id),
        })),
      setCurrentDetection: (currentDetection) => set({ currentDetection }),
      setMedia: (media) => set({ media }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setFilters: (filters) =>
        set((state) => ({ filters: { ...state.filters, ...filters } })),
      setPagination: (pagination) =>
        set((state) => ({ pagination: { ...state.pagination, ...pagination } })),
      clear: () => set({ detections: [], currentDetection: null, media: [], error: null }),
    }),
    {
      name: 'spai-detections',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        filters: state.filters,
        pagination: state.pagination,
      }),
    }
  )
);

// Session Store
interface SessionState {
  currentSession: DetectionSession | null;
  roadScanSession: RoadScanSession | null;
  isActive: boolean;
  stats: {
    totalFrames: number;
    processedFrames: number;
    totalDetections: number;
    uniquePotholes: number;
    fps: number;
    inferenceLatency: number;
  };
  startSession: (session: DetectionSession) => void;
  updateSession: (updates: Partial<DetectionSession>) => void;
  endSession: () => void;
  startRoadScan: (session: RoadScanSession) => void;
  updateRoadScan: (updates: Partial<RoadScanSession>) => void;
  endRoadScan: () => void;
  updateStats: (stats: Partial<SessionState['stats']>) => void;
  resetStats: () => void;
}

const initialStats = {
  totalFrames: 0,
  processedFrames: 0,
  totalDetections: 0,
  uniquePotholes: 0,
  fps: 0,
  inferenceLatency: 0,
};

export const useSessionStore = create<SessionState>((set) => ({
  currentSession: null,
  roadScanSession: null,
  isActive: false,
  stats: initialStats,
  startSession: (session) => set({ currentSession: session, isActive: true, stats: initialStats }),
  updateSession: (updates) =>
    set((state) => ({
      currentSession: state.currentSession ? { ...state.currentSession, ...updates } : null,
    })),
  endSession: () => set({ currentSession: null, isActive: false }),
  startRoadScan: (session) => set({ roadScanSession: session, isActive: true, stats: initialStats }),
  updateRoadScan: (updates) =>
    set((state) => ({
      roadScanSession: state.roadScanSession ? { ...state.roadScanSession, ...updates } : null,
    })),
  endRoadScan: () => set({ roadScanSession: null, isActive: false }),
  updateStats: (stats) =>
    set((state) => ({ stats: { ...state.stats, ...stats } })),
  resetStats: () => set({ stats: initialStats }),
}));

// Live Detection Store
interface LiveDetectionState {
  isRunning: boolean;
  isPaused: boolean;
  cameraPermission: 'prompt' | 'granted' | 'denied' | 'unavailable';
  facingMode: 'user' | 'environment';
  videoElement: HTMLVideoElement | null;
  canvasElement: HTMLCanvasElement | null;
  stream: MediaStream | null;
  inferenceMode: 'auto' | 'browser' | 'cloud';
  inferenceFps: number;
  confidenceThreshold: number;
  detections: Detection[];
  trackHistory: Map<string, Detection[]>;
  stats: {
    fps: number;
    inferenceLatency: number;
    detectionCount: number;
    sessionDuration: number;
  };
  error: string | null;
  setRunning: (running: boolean) => void;
  setPaused: (paused: boolean) => void;
  setCameraPermission: (permission: LiveDetectionState['cameraPermission']) => void;
  setFacingMode: (mode: 'user' | 'environment') => void;
  setVideoElement: (element: HTMLVideoElement | null) => void;
  setCanvasElement: (element: HTMLCanvasElement | null) => void;
  setStream: (stream: MediaStream | null) => void;
  setInferenceMode: (mode: 'auto' | 'browser' | 'cloud') => void;
  setInferenceFps: (fps: number) => void;
  setConfidenceThreshold: (threshold: number) => void;
  setDetections: (detections: Detection[]) => void;
  addTrackHistory: (trackId: string, detection: Detection) => void;
  clearTrackHistory: () => void;
  updateStats: (stats: Partial<LiveDetectionState['stats']>) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useLiveDetectionStore = create<LiveDetectionState>((set) => ({
  isRunning: false,
  isPaused: false,
  cameraPermission: 'prompt',
  facingMode: 'environment',
  videoElement: null,
  canvasElement: null,
  stream: null,
  inferenceMode: 'auto',
  inferenceFps: 5,
  confidenceThreshold: 0.25,
  detections: [],
  trackHistory: new Map(),
  stats: {
    fps: 0,
    inferenceLatency: 0,
    detectionCount: 0,
    sessionDuration: 0,
  },
  error: null,
  setRunning: (isRunning) => set({ isRunning }),
  setPaused: (isPaused) => set({ isPaused }),
  setCameraPermission: (cameraPermission) => set({ cameraPermission }),
  setFacingMode: (facingMode) => set({ facingMode }),
  setVideoElement: (videoElement) => set({ videoElement }),
  setCanvasElement: (canvasElement) => set({ canvasElement }),
  setStream: (stream) => set({ stream }),
  setInferenceMode: (inferenceMode) => set({ inferenceMode }),
  setInferenceFps: (inferenceFps) => set({ inferenceFps }),
  setConfidenceThreshold: (confidenceThreshold) => set({ confidenceThreshold }),
  setDetections: (detections) => set({ detections }),
  addTrackHistory: (trackId, detection) =>
    set((state) => {
      const newMap = new Map(state.trackHistory);
      const history = newMap.get(trackId) || [];
      history.push(detection);
      if (history.length > 100) history.shift();
      newMap.set(trackId, history);
      return { trackHistory: newMap };
    }),
  clearTrackHistory: () => set({ trackHistory: new Map() }),
  updateStats: (stats) =>
    set((state) => ({ stats: { ...state.stats, ...stats } })),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      isRunning: false,
      isPaused: false,
      cameraPermission: 'prompt',
      detections: [],
      trackHistory: new Map(),
      stats: {
        fps: 0,
        inferenceLatency: 0,
        detectionCount: 0,
        sessionDuration: 0,
      },
      error: null,
    }),
}));

// Map Store
interface MapState {
  center: [number, number];
  zoom: number;
  markers: MapMarker[];
  clusters: MapMarker[][];
  selectedMarker: MapMarker | null;
  filterSeverity: SeverityLevel[];
  filterDateRange: [Date | null, Date | null];
  showUserLocation: boolean;
  userLocation: [number, number] | null;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setMarkers: (markers: MapMarker[]) => void;
  addMarker: (marker: MapMarker) => void;
  removeMarker: (id: string) => void;
  setSelectedMarker: (marker: MapMarker | null) => void;
  setFilterSeverity: (severity: SeverityLevel[]) => void;
  setFilterDateRange: (range: [Date | null, Date | null]) => void;
  setShowUserLocation: (show: boolean) => void;
  setUserLocation: (location: [number, number] | null) => void;
  clearMarkers: () => void;
}

const defaultCenter: [number, number] = [0, 0];

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      center: defaultCenter,
      zoom: 2,
      markers: [],
      clusters: [],
      selectedMarker: null,
      filterSeverity: [],
      filterDateRange: [null, null],
      showUserLocation: false,
      userLocation: null,
      setCenter: (center) => set({ center }),
      setZoom: (zoom) => set({ zoom }),
      setMarkers: (markers) => set({ markers }),
      addMarker: (marker) =>
        set((state) => ({ markers: [...state.markers, marker] })),
      removeMarker: (id) =>
        set((state) => ({ markers: state.markers.filter((m) => m.id !== id) })),
      setSelectedMarker: (selectedMarker) => set({ selectedMarker }),
      setFilterSeverity: (filterSeverity) => set({ filterSeverity }),
      setFilterDateRange: (filterDateRange) => set({ filterDateRange }),
      setShowUserLocation: (showUserLocation) => set({ showUserLocation }),
      setUserLocation: (userLocation) => set({ userLocation }),
      clearMarkers: () => set({ markers: [], clusters: [] }),
    }),
    {
      name: 'spai-map',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        center: state.center,
        zoom: state.zoom,
        filterSeverity: state.filterSeverity,
        filterDateRange: state.filterDateRange,
        showUserLocation: state.showUserLocation,
      }),
    }
  )
);

// UI Store
interface UIState {
  sidebarOpen: boolean;
  mobileMenuOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' | 'warning' }>;
  modals: Record<string, boolean>;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleMobileMenu: () => void;
  setMobileMenuOpen: (open: boolean) => void;
  setTheme: (theme: UIState['theme']) => void;
  addToast: (toast: Omit<UIState['toasts'][0], 'id'>) => void;
  removeToast: (id: string) => void;
  openModal: (id: string) => void;
  closeModal: (id: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      mobileMenuOpen: false,
      theme: 'system',
      toasts: [],
      modals: {},
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleMobileMenu: () => set((state) => ({ mobileMenuOpen: !state.mobileMenuOpen })),
      setMobileMenuOpen: (mobileMenuOpen) => set({ mobileMenuOpen }),
      setTheme: (theme) => set({ theme }),
      addToast: (toast) =>
        set((state) => ({
          toasts: [...state.toasts, { ...toast, id: crypto.randomUUID() }],
        })),
      removeToast: (id) =>
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
      openModal: (id) =>
        set((state) => ({ modals: { ...state.modals, [id]: true } })),
      closeModal: (id) =>
        set((state) => {
          const modals = { ...state.modals };
          delete modals[id];
          return { modals };
        }),
    }),
    {
      name: 'spai-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
      }),
    }
  )
);