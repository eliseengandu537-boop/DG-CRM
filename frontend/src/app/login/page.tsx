"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  FiLock,
  FiMail,
  FiMonitor,
  FiSmartphone,
} from "react-icons/fi";

const HERO_IMAGES = [
  "/twilight-real-estate-photography-tnhometour-com-img~460146a40a667d5a_9-7068-1-7208b0c.jpg",
  "/1100xxs.webp",
  "/main.jpg",
];

export default function LoginPage() {
  const router = useRouter();
  const {
    login,
    error: authError,
    clearError,
    isAuthenticated,
    isLoading: authLoading,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [showLoginCard, setShowLoginCard] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveImage((current) => (current + 1) % HERO_IMAGES.length);
    }, 6000);

    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/");
    }
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

  const revealLoginCard = () => {
    setShowLoginCard(true);
    window.setTimeout(() => {
      document
        .getElementById("login-card")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };

  return (
    <div className="min-h-screen bg-[#e8edf3] text-slate-900">
      <div className="min-h-screen w-full overflow-x-hidden">
        <header className="sticky top-0 z-50 flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8 lg:px-12">
          <div className="flex items-center gap-4">
            <img
              src="/logo-colour (1).png"
              alt="De Gennaro Property"
              className="h-11 w-auto object-contain"
            />
            <div className="hidden sm:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-400">
                Digital Workspace
              </p>
              <p className="text-xl font-semibold leading-none text-slate-700">
                Property management made accessible
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-4xl font-semibold leading-none text-[#888e7d]">DG-property</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-400">
              Commercial Property Platform
            </p>
          </div>
        </header>

        <div className="relative">
          <section className="relative min-h-[500px] overflow-hidden px-4 py-10 sm:px-8 lg:min-h-[560px] lg:px-16">
            {HERO_IMAGES.map((src, index) => (
              <div
                key={src}
                className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ${
                  activeImage === index ? "opacity-100" : "opacity-0"
                }`}
                style={{ backgroundImage: `url(${src})` }}
                aria-hidden
              />
            ))}
            <div className="absolute inset-0 bg-slate-950/45" />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-900/30 via-slate-900/25 to-slate-900/55" />
            <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center text-center text-white">
              <span className="rounded-full border border-white/45 bg-white/10 px-6 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white/95 backdrop-blur">
                Welcome Back
              </span>
              <h1 className="mt-6 text-balance text-4xl font-light leading-tight sm:text-6xl">
                Welcome to <span className="font-semibold">DG-property</span>
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-100/95">
                Everything you need to manage properties and track deals is right here.
                <span className="block">
                  Stay organized, move faster, and turn every opportunity into a closed deal.
                </span>
              </p>

              <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
                <a
                  href="mailto:info@dg-property.co.za"
                  className="inline-flex min-w-48 items-center justify-center rounded-md border border-white/55 px-8 py-3 text-xl font-semibold text-white transition hover:bg-white/10"
                >
                  Contact Us
                </a>
                <button
                  type="button"
                  onClick={revealLoginCard}
                  className="inline-flex min-w-48 items-center justify-center rounded-md bg-emerald-400 px-8 py-3 text-xl font-semibold text-slate-900 transition hover:bg-emerald-300"
                >
                  Login
                </button>
              </div>



              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <span className="rounded-full border border-white/40 bg-white/12 px-5 py-2 text-sm font-semibold backdrop-blur">
                  Secure sign-in
                </span>
                <span className="rounded-full border border-white/40 bg-white/12 px-5 py-2 text-sm font-semibold backdrop-blur">
                  Desktop and tablet ready
                </span>
                <span className="rounded-full border border-white/40 bg-white/12 px-5 py-2 text-sm font-semibold backdrop-blur">
                  Fast access to your workspace
                </span>
              </div>
            </div>
          </section>

          <section
            className={`relative z-10 mx-auto -mt-10 grid max-w-5xl gap-5 px-3 pb-10 sm:px-6 lg:-mt-14 ${
              showLoginCard ? "lg:grid-cols-[1.1fr,0.9fr] lg:items-stretch" : "lg:grid-cols-1"
            }`}
          >
            <article className="h-full rounded-[34px] border border-slate-200 bg-white p-7 shadow-[0_20px_45px_rgba(15,23,42,0.1)] sm:p-8">
              <span className="inline-flex rounded-full bg-[#888e7d]/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-[#888e7d]">
                Universally Accessible
              </span>
              <h2 className="mt-5 text-[clamp(1.8rem,2.8vw,2.55rem)] font-semibold leading-[1.1] text-slate-900">
                Work from desktop, tablet, or wherever the day starts.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">
                Whether you're in the office or on the go, your deals, contacts, and properties
                are always within reach — seamlessly optimised for any screen size.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#888e7d] text-white shadow-[0_10px_20px_rgba(136,142,125,0.35)]">
                    <FiMonitor className="h-7 w-7" />
                  </div>
                  <p className="mt-3 text-lg font-semibold text-slate-900">Desktop ready</p>
                  <p className="mt-1 text-sm text-slate-600">Large-screen focused workflow for office users.</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#888e7d] text-white shadow-[0_10px_20px_rgba(136,142,125,0.35)]">
                    <FiSmartphone className="h-7 w-7" />
                  </div>
                  <p className="mt-3 text-lg font-semibold text-slate-900">Tablet friendly</p>
                  <p className="mt-1 text-sm text-slate-600">Responsive layout for mobile and tablet access.</p>
                </div>
              </div>
            </article>

            {showLoginCard ? (
              <article
                id="login-card"
                className="h-full rounded-[34px] border border-slate-200 bg-white p-7 shadow-[0_20px_45px_rgba(15,23,42,0.1)] sm:p-8"
              >
                <span className="inline-flex rounded-full bg-[#888e7d]/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-[#888e7d]">
                  Secure Login
                </span>
                <h2 className="mt-5 text-[clamp(1.8rem,2.8vw,2.55rem)] font-semibold leading-[1.1] tracking-tight text-slate-900">
                  Sign in to continue
                </h2>
                <p className="mt-3 text-lg leading-8 text-slate-600">
                  Use your work email and password to access your property dashboard.
                </p>

                <form onSubmit={handleSubmit} className="mt-6 space-y-3.5">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">Email</span>
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition focus-within:border-[#888e7d] focus-within:bg-white">
                      <FiMail className="h-5 w-5 shrink-0 text-slate-400" />
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        placeholder="name@company.com"
                        className="w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition focus-within:border-[#888e7d] focus-within:bg-white">
                      <FiLock className="h-5 w-5 shrink-0 text-slate-400" />
                      <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        placeholder="Enter your password"
                        className="w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
                      />
                    </div>
                  </label>

                  {authError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {authError}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={loading || authLoading}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-6 py-3 text-lg font-semibold text-slate-900 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loading || authLoading ? "Signing in..." : "Login"}
                  </button>
                </form>
              </article>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
