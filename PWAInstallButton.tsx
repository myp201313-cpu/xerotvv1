import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Smartphone, X } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";

interface PWAInstallButtonProps {
  variant?: "compact" | "full";
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = "compact",
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={
          variant === "full"
            ? "inline-flex h-11 items-center gap-2 rounded-lg bg-rose-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-rose-500 whitespace-nowrap"
            : "inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-rose-500 whitespace-nowrap"
        }
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        <span>Install XEROTV App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === "full"
              ? "inline-flex h-11 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-5 text-sm font-semibold text-white hover:bg-white/10 whitespace-nowrap"
              : "inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap"
          }
        >
          <Smartphone className="h-4 w-4" aria-hidden="true" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowIOSGuide(false);
            }}
          >
            <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#12141d] p-6 shadow-2xl">
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                aria-label="Close iOS install instructions"
                className="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              <h3
                id="ios-install-title"
                className="font-display text-lg font-bold text-white"
              >
                Install XEROTV on iOS
              </h3>
              <ol className="mt-3 space-y-2 text-sm text-slate-300">
                <li>
                  1. Tap the <strong className="text-white">Share</strong> icon in Safari.
                </li>
                <li>
                  2. Scroll down and select{" "}
                  <strong className="text-white">Add to Home Screen</strong>.
                </li>
                <li>
                  3. Tap <strong className="text-white">Add</strong> to launch XEROTV
                  standalone.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-rose-600 text-sm font-semibold text-white hover:bg-rose-500"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <Link
      to="/download"
      className={
        variant === "full"
          ? "inline-flex h-11 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-5 text-sm font-semibold text-white hover:bg-white/10 whitespace-nowrap"
          : "inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap"
      }
    >
      <Smartphone className="h-4 w-4" aria-hidden="true" />
      <span>Android App / APK</span>
    </Link>
  );
};
