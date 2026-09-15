"use client";

import React, { useState } from "react";
import { useAuth } from "../lib/auth-context";

export function LoginPage() {
  const { login, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setLocalError("Please enter both email and password.");
      return;
    }

    setSubmitting(true);
    setLocalError(null);
    clearError();

    try {
      await login(email, password);
    } catch (err: any) {
      // Error handled by AuthContext state or set local error
      setLocalError(err.detail || err.message || "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const activeError = localError || error;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full space-y-8 bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl">
        
        {/* Branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center p-3 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl shadow-lg shadow-blue-500/20 text-3xl">
            ⚡
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            AI-RFP Intelligence Platform
          </h1>
          <p className="text-slate-400 text-xs">
            Sign in with your enterprise credentials to access RFP requirement extraction & intelligence tools.
          </p>
        </div>

        {/* Error Banner */}
        {activeError && (
          <div className="p-4 bg-red-950/60 border border-red-800/80 text-red-200 text-xs rounded-xl flex items-start justify-between gap-3 shadow-md">
            <div className="flex gap-2">
              <span className="text-base">⚠️</span>
              <div>
                <span className="font-semibold block text-red-100">Authentication Error</span>
                {activeError}
              </div>
            </div>
            <button
              onClick={() => {
                setLocalError(null);
                clearError();
              }}
              className="text-red-400 hover:text-white font-bold text-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Corporate Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. product_a@orga.com"
              required
              disabled={submitting}
              className="w-full bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              disabled={submitting}
              className="w-full bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none transition disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-500/25 transition duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Authenticating with FastAPI...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        {/* Environment / Backend Status */}
        <div className="pt-4 border-t border-slate-800/80 text-center space-y-2">
          <div className="text-[11px] text-slate-500 font-mono">
            FastAPI Server Target: <span className="text-blue-400">{process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}</span>
          </div>
          
          <div className="p-3 bg-slate-950 rounded-xl text-left border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <span className="font-bold text-slate-300 block">Available Test Accounts:</span>
            <div className="font-mono text-[10px] space-y-0.5">
              <div><span className="text-blue-300">product_a@orga.com</span> (Role: PRODUCT_TEAM)</div>
              <div><span className="text-emerald-300">vp_a@orga.com</span> (Role: VP)</div>
              <div><span className="text-indigo-300">cto_a@orga.com</span> (Role: CTO)</div>
              <div><span className="text-purple-300">ceo_a@orga.com</span> (Role: CEO)</div>
              <div className="text-slate-500 pt-1">Password for all: <code className="text-amber-300">password123</code></div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
