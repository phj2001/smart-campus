import { create } from 'zustand';

export type NavMode = 'idle' | 'selectStart' | 'selectEnd';

type AppState = {
  homeRequest: number;
  status: string;
  selectedFeature: any | null;
  showBuildings: boolean;
  showRoads: boolean;
  showPoints: boolean;

  // 导航状态
  navMode: NavMode;
  navStart: [number, number] | null;  // [lng, lat]
  navEnd: [number, number] | null;
  navPath: [number, number][] | null;
  navDistance: number | null;

  requestHome: () => void;
  setStatus: (text: string) => void;
  setSelectedFeature: (feature: any | null) => void;
  toggleLayer: (layer: 'buildings' | 'roads' | 'points') => void;

  // 导航 Actions
  setNavMode: (mode: NavMode) => void;
  setNavStart: (coords: [number, number] | null) => void;
  setNavEnd: (coords: [number, number] | null) => void;
  setNavPath: (path: [number, number][] | null, distance: number | null) => void;
  clearNav: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  homeRequest: 0,
  status: 'Ready',
  selectedFeature: null,
  showBuildings: true,
  showRoads: true,
  showPoints: true,

  // 导航初始状态
  navMode: 'idle',
  navStart: null,
  navEnd: null,
  navPath: null,
  navDistance: null,

  requestHome: () => set((state) => ({ homeRequest: state.homeRequest + 1 })),
  setStatus: (text) => set({ status: text }),
  setSelectedFeature: (feature) => set({ selectedFeature: feature }),
  toggleLayer: (layer) => set((state) => {
    if (layer === 'buildings') return { showBuildings: !state.showBuildings };
    if (layer === 'roads') return { showRoads: !state.showRoads };
    if (layer === 'points') return { showPoints: !state.showPoints };
    return {};
  }),

  // 导航 Actions
  setNavMode: (mode) => set({ navMode: mode }),
  setNavStart: (coords) => set({ navStart: coords, navMode: 'idle' }),
  setNavEnd: (coords) => set({ navEnd: coords, navMode: 'idle' }),
  setNavPath: (path, distance) => set({ navPath: path, navDistance: distance }),
  clearNav: () => set({
    navMode: 'idle',
    navStart: null,
    navEnd: null,
    navPath: null,
    navDistance: null
  }),
}));
