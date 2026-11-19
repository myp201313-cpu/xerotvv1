import React, { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import { SyncProvider, useSync } from "./context/SyncContext";
import { Navbar } from "./components/Navbar";
import { SearchModal } from "./components/SearchModal";
import { Footer } from "./components/Footer";
import { Home } from "./pages/Home";
import { CatalogPage } from "./pages/CatalogPage";
import { LibraryPage } from "./pages/LibraryPage";
import { SyncPage } from "./pages/SyncPage";
import { WatchPage } from "./pages/WatchPage";
import { AboutPage } from "./pages/AboutPage";
import { DisclaimerPage } from "./pages/DisclaimerPage";
import { DownloadPage } from "./pages/DownloadPage";
import { AdminPage } from "./pages/AdminPage";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { resolveMediaType } from "./utils/catalogLogic";
import type { TMDBMediaItem } from "./types/media";

const AppShell: React.FC = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const { runtimeConfig } = useSync();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === "/" || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSelectSearchItem = (item: TMDBMediaItem) => {
    const type = resolveMediaType(item);
    navigate(`/watch?type=${type}&id=${item.id}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#090a0f] text-slate-100">
      <Navbar onOpenSearch={() => setSearchOpen(true)} />
      {runtimeConfig.announcement && (
        <div className="border-b border-rose-500/20 bg-rose-600/10 px-4 py-2 text-center text-xs font-medium text-rose-200">
          {runtimeConfig.announcement}
        </div>
      )}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/movies" element={<CatalogPage mode="movies" />} />
          <Route path="/tv-shows" element={<CatalogPage mode="tv" />} />
          <Route path="/popular" element={<CatalogPage mode="popular" />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/watch" element={<WatchPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/disclaimer" element={<DisclaimerPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <Footer />
      <OfflineIndicator />
      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectItem={handleSelectSearchItem}
      />
    </div>
  );
};

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || "Unexpected rendering error.",
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#090a0f] px-4 text-center text-slate-100">
          <h1 className="font-display text-2xl font-bold text-white">
            Something went wrong
          </h1>
          <p className="max-w-md text-sm text-slate-400">{this.state.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center rounded-lg bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-500"
          >
            Reload XEROTV
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <SyncProvider>
          <AppShell />
        </SyncProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
