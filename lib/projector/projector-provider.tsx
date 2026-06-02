"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

interface ProjectorContextType {
  isProjectorMode: boolean;
  setProjectorMode: (enabled: boolean) => void;
  toggleProjectorMode: () => void;
}

const ProjectorContext = createContext<ProjectorContextType | undefined>(undefined);

const PROJECTOR_STORAGE_KEY = "zip-projector";

export function ProjectorProvider({ children }: { children: ReactNode }) {
  const [isProjectorMode, setProjectorModeState] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  const applyProjectorMode = useCallback((enabled: boolean) => {
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      
      if (enabled) {
        root.classList.add("projector");
      } else {
        root.classList.remove("projector");
      }
      
      // Force a reflow to ensure styles are applied
      void root.offsetHeight;
    }
  }, []);

  useEffect(() => {
    // Only run on client side
    setMounted(true);
    
    // Get projector mode from localStorage or default to false
    const storedProjector = localStorage.getItem(PROJECTOR_STORAGE_KEY);
    const initialProjector = storedProjector === "true";
    
    setProjectorModeState(initialProjector);
    applyProjectorMode(initialProjector);
  }, [applyProjectorMode]);

  // Sync projector mode state with DOM
  useEffect(() => {
    if (mounted) {
      applyProjectorMode(isProjectorMode);
    }
  }, [isProjectorMode, mounted, applyProjectorMode]);

  const setProjectorMode = useCallback((enabled: boolean) => {
    setProjectorModeState(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem(PROJECTOR_STORAGE_KEY, String(enabled));
    }
    applyProjectorMode(enabled);
  }, [applyProjectorMode]);

  const toggleProjectorMode = useCallback(() => {
    setProjectorModeState((current) => {
      const newMode = !current;
      
      // Apply projector mode immediately
      applyProjectorMode(newMode);
      
      // Save to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem(PROJECTOR_STORAGE_KEY, String(newMode));
      }
      
      return newMode;
    });
  }, [applyProjectorMode]);

  // Always provide context, even before mounted
  return (
    <ProjectorContext.Provider value={{ isProjectorMode, setProjectorMode, toggleProjectorMode }}>
      {children}
    </ProjectorContext.Provider>
  );
}

export function useProjector() {
  const context = useContext(ProjectorContext);
  if (context === undefined) {
    throw new Error("useProjector must be used within a ProjectorProvider");
  }
  return context;
}

