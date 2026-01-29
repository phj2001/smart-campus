import { create } from 'zustand';

type AppState = {
  homeRequest: number;
  status: string;
  requestHome: () => void;
  setStatus: (text: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  homeRequest: 0,
  status: 'Ready',
  requestHome: () => set((state) => ({ homeRequest: state.homeRequest + 1 })),
  setStatus: (text) => set({ status: text }),
}));
