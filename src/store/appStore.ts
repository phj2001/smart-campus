import { create } from 'zustand';

export type SceneModeOption = '3D' | '2.5D' | '2D';

type AppState = {
  sceneMode: SceneModeOption;
  homeRequest: number;
  status: string;
  setSceneMode: (mode: SceneModeOption) => void;
  requestHome: () => void;
  setStatus: (text: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  sceneMode: '3D',
  homeRequest: 0,
  status: 'Ready',
  setSceneMode: (mode) => set({ sceneMode: mode }),
  requestHome: () => set((state) => ({ homeRequest: state.homeRequest + 1 })),
  setStatus: (text) => set({ status: text }),
}));
