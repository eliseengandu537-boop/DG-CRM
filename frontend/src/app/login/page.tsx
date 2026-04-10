"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { FiLock, FiMail, FiArrowRight, FiShield, FiTrendingUp, FiLayers } from "react-icons/fi";

const HERO_IMAGES = [
  "/back1.jpg",
  "/back2.jpg",
  "/back3.jpg",
  "/back4.jpg",
  "/back5.jpg",
  "/back6.jpg",
  "/back7.jpg",
  "/back8.jpg",
  "/back9.jpg",
  "/back10.jpg",
];

const FEATURES = [
  { icon: FiTrendingUp, label: "Deal pipeline & WIP tracking" },
  { icon: FiLayers,     label: "Properties, stock & asset management" },
  { icon: FiShield,     label: "Role-based secure access" },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, error: authError, clearError, isAuthenticated, isLoading: authLoading } = useAuth();

  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [loading, setLoading]       = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveImage((current) => (current + 1) % HERO_IMAGES.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) router.replace("/");
  }, [authLoading, isAuthenticated, router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch {
      // AuthContext exposes user-facing errors.
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950">

      {/* ════ LEFT PANEL — slideshow ════ */}
      <div className="relative hidden flex-1 lg:flex">

        {/* Slideshow images */}
        {HERO_IMAGES.map((src, index) => (
          <div
            key={src}
            className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ${
              activeImage === index ? "opacity-100" : "opacity-0"
            }`}
            style={{ backgroundImage: `url(${src})` }}
            aria-hidden="true"
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/70 via-slate-950/40 to-slate-950/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />

        {/* Overlaid content */}
        <div className="relative z-10 flex h-full w-full flex-col justify-between p-10 xl:p-14">

          {/* Logo */}
          <div className="flex items-center gap-4">
            <img
              src="/logo-colour (1).png"
              alt="De Gennaro Property"
              className="h-20 w-auto object-contain drop-shadow-lg brightness-0 invert"
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">
              Commercial Property
            </p>
          </div>

          {/* Tagline */}
          <div>
            <span className="inline-block rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/80 backdrop-blur-sm">
              DG Property CRM Platform
            </span>
            <h1 className="mt-5 text-4xl font-light leading-tight text-white xl:text-5xl">
              Every deal.<br />
              Every property.<br />
              <span className="font-bold">One workspace.</span>
            </h1>
            <p className="mt-4 max-w-sm text-base leading-7 text-white/70">
              Manage your pipeline, track commissions, and close deals — all from a single, powerful platform.
            </p>
            <ul className="mt-8 space-y-3">
              {FEATURES.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm">
                    <Icon className="h-4 w-4 text-white" />
                  </span>
                  <span className="text-sm font-medium text-white/85">{label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Dots + copyright */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {HERO_IMAGES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    activeImage === i ? "w-6 bg-white" : "w-1.5 bg-white/35"
                  }`}
                  aria-label={`Image ${i + 1}`}
                />
              ))}
            </div>
            <p className="text-xs text-white/40">
              © {new Date().getFullYear()} De Gennaro Property
            </p>
          </div>

        </div>
        {/* end overlaid content */}
      </div>
      {/* end left panel */}

      {/* ════ RIGHT PANEL — login form ════ */}
      <div className="relative flex w-full flex-col justify-center overflow-hidden px-6 py-10 sm:px-10 lg:w-[420px] lg:shrink-0 xl:w-[480px]">

        {/* Background video */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
          aria-hidden="true"
        >
          <source src="/dog.mp4" type="video/mp4" />
        </video>

        {/* White frosted overlay */}
        <div className="absolute inset-0 bg-white/55 backdrop-blur-[2px]" />

        {/* Form content */}
        <div className="relative z-10 mx-auto w-full max-w-sm">

          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img
              src="/logo-colour (1).png"
              alt="De Gennaro Property"
              className="h-9 w-auto object-contain"
            />
            <span className="text-lg font-bold text-slate-800">DG-property</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-500">Sign in to your property workspace</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email */}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Email address
              </label>
              <div className={`flex items-center gap-3 rounded-xl border bg-slate-50 px-4 py-3 transition-all focus-within:border-[#888e7d] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(136,142,125,0.12)] ${authError ? "border-red-300" : "border-slate-200"}`}>
                <FiMail className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearError(); }}
                  required
                  placeholder="name@dg-property.co.za"
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Password
              </label>
              <div className={`flex items-center gap-3 rounded-xl border bg-slate-50 px-4 py-3 transition-all focus-within:border-[#888e7d] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(136,142,125,0.12)] ${authError ? "border-red-300" : "border-slate-200"}`}>
                <FiLock className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError(); }}
                  required
                  placeholder="Enter your password"
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="shrink-0 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* Error message */}
            {authError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-400 text-[10px] font-bold text-white">!</span>
                <p className="text-sm text-red-700">{authError}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || authLoading}
              className="group mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(15,23,42,0.25)] transition-all hover:bg-[#888e7d] hover:shadow-[0_4px_20px_rgba(136,142,125,0.4)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading || authLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <FiArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>

          </form>
          {/* end form */}

          {/* Footer */}
          <div className="mt-10 border-t border-slate-100 pt-6">
            <p className="text-center text-xs text-slate-400">
              Need access?{" "}
              <a
                href="mailto:info@dg-property.co.za"
                className="font-semibold text-[#888e7d] hover:underline"
              >
                Contact your administrator
              </a>
            </p>
          </div>

        </div>

      </div>
      {/* end right panel */}

    </div>
    /* end outer */
  );
}
