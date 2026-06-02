"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/lib/theme/use-theme";
import { useProjector } from "@/lib/projector/projector-provider";

interface SettingsDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}

export default function SettingsDropdown({
  isOpen,
  onClose,
  buttonRef,
}: SettingsDropdownProps) {
  const { theme, toggleTheme } = useTheme();
  const { isProjectorMode, toggleProjectorMode } = useProjector();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose, buttonRef]);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-full mt-2 w-64 bg-panel-surface border border-border rounded-lg shadow-lg z-50"
      style={{ borderRadius: "12px" }}
    >
      <div className="p-4">
        <h3 className="text-text-primary text-sm font-semibold uppercase tracking-wide mb-4">
          Settings
        </h3>
        
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-text-primary text-sm font-medium">
                Theme
              </span>
              <span className="text-text-muted text-xs mt-0.5">
                {theme === "dark" ? "Dark mode" : "Light mode"}
              </span>
            </div>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleTheme();
              }}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2 focus:ring-offset-panel-surface"
              role="switch"
              aria-checked={theme === "dark"}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              <span
                className={`absolute inset-0 rounded-full transition-colors pointer-events-none ${
                  theme === "dark" ? "bg-accent-cyan" : "bg-text-muted"
                }`}
              />
              <span
                className={`relative inline-block h-4 w-4 transform rounded-full bg-white transition-transform pointer-events-none z-10 ${
                  theme === "dark" ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-text-primary text-sm font-medium">
                Projector mode
              </span>
              <span className="text-text-muted text-xs mt-0.5">
                Optimized for 1280x720 display
              </span>
            </div>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleProjectorMode();
              }}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2 focus:ring-offset-panel-surface"
              role="switch"
              aria-checked={isProjectorMode}
              aria-label={`${isProjectorMode ? "Disable" : "Enable"} projector mode`}
            >
              <span
                className={`absolute inset-0 rounded-full transition-colors pointer-events-none ${
                  isProjectorMode ? "bg-accent-cyan" : "bg-text-muted"
                }`}
              />
              <span
                className={`relative inline-block h-4 w-4 transform rounded-full bg-white transition-transform pointer-events-none z-10 ${
                  isProjectorMode ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

