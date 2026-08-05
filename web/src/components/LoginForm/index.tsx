"use client";

import React from "react";
import Image from "next/image";
import { Input, TextField, Checkbox, Button } from "@heroui/react";
import { getTokens, SF_DISPLAY, SF_TEXT } from "@/utils/tokens";

interface LoginFormProps {
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  showPassword: boolean;
  setShowPassword: (show: boolean) => void;
  isTyping: boolean;
  setIsTyping: (isTyping: boolean) => void;
  isPasswordFocused: boolean;
  setIsPasswordFocused: (focused: boolean) => void;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  errorMsg: string;
  emailError: boolean;
  passwordError: boolean;
  isDark?: boolean;
}

export default function LoginForm({
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  isTyping,
  setIsTyping,
  isPasswordFocused,
  setIsPasswordFocused,
  isSubmitting,
  onSubmit,
  errorMsg,
  emailError,
  passwordError,
  isDark = false,
}: LoginFormProps) {
  const t = getTokens(isDark);
  const { fg: textPrimary, fg2: textSecondary, fg3: textTertiary, accent, accentFg, error, inputBg, inputBorder, iconContainerBg, errorBg, errorBorder } = t;

  return (
    <div className="w-full max-w-100">
      {/* Logo */}
      <div className="flex justify-center mb-10">
        <div
          className="flex items-center justify-center"
          style={{
            width: 56,
            height: 56,
            borderRadius: "16px",
            background: iconContainerBg,
          }}
        >
          <Image
            src="/favicon.ico"
            alt="Logo"
            width={28}
            height={28}
            className="w-7 h-7"
            priority
          />
        </div>
      </div>

      {/* Header */}
      <div className="text-center mb-12">
        <h1
          className="text-[32px] font-semibold mb-3"
          style={{
            fontFamily: SF_DISPLAY,
            lineHeight: 1.1,
            letterSpacing: "-0.32px",
            color: textPrimary,
          }}
        >
          Welcome to SME AI Lab
        </h1>
        <p
          className="text-[15px]"
          style={{
            fontFamily: SF_TEXT,
            lineHeight: 1.4,
            letterSpacing: "-0.2px",
            color: textTertiary,
          }}
        >
          Sign in your Data Forge workspace
        </p>
      </div>

      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
      >
        {/* Input Fields Group */}
        <div className="mb-2">
          {/* Email */}
          <div className="mb-5">
            <TextField fullWidth variant={emailError ? "secondary" : "primary"}>
              <label
                style={{
                  fontFamily: SF_TEXT,
                  fontSize: "13px",
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  lineHeight: 1.4,
                  color: emailError ? error : textTertiary,
                  display: "block",
                  marginBottom: "8px",
                }}
              >
                EMAIL
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setIsTyping(true)}
                onBlur={() => setIsTyping(false)}
                placeholder="you@example.com"
                autoComplete="off"
                fullWidth
                style={{
                  fontFamily: SF_TEXT,
                  fontSize: "16px",
                  letterSpacing: "-0.2px",
                  color: textPrimary,
                  backgroundColor: inputBg,
                  border: `1px solid ${emailError ? error : inputBorder}`,
                  borderRadius: "12px",
                  padding: "13px 16px",
                  outline: "none",
                }}
              />
            </TextField>
          </div>

          {/* Password */}
          <div>
            <TextField fullWidth variant={passwordError ? "secondary" : "primary"}>
              <label
                style={{
                  fontFamily: SF_TEXT,
                  fontSize: "13px",
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  lineHeight: 1.4,
                  color: passwordError ? error : textTertiary,
                  display: "block",
                  marginBottom: "8px",
                }}
              >
                PASSWORD
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setIsPasswordFocused(true)}
                  onBlur={() => setIsPasswordFocused(false)}
                  placeholder="••••••••"
                  fullWidth
                  style={{
                    fontFamily: SF_TEXT,
                    fontSize: "16px",
                    letterSpacing: "-0.2px",
                    color: textPrimary,
                    backgroundColor: inputBg,
                    border: `1px solid ${passwordError ? error : inputBorder}`,
                    borderRadius: "12px",
                    padding: "13px 48px 13px 16px",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer p-1.5 transition-colors duration-200 z-10 rounded-md"
                  style={{ color: textTertiary }}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </TextField>
          </div>
        </div>

        {/* Options Group */}
        <div className="flex items-center justify-between">
          <Checkbox defaultSelected>
            <span
              style={{
                fontFamily: SF_TEXT,
                fontSize: "14px",
                letterSpacing: "-0.15px",
                lineHeight: 1.43,
                color: textSecondary,
              }}
            >
              Remember for 30 days
            </span>
          </Checkbox>
          <a
            href="/f/forgot-password"
            className="text-[14px] no-underline font-medium transition-opacity duration-200 hover:opacity-70"
            style={{
              fontFamily: SF_TEXT,
              color: textPrimary,
              letterSpacing: "-0.15px",
              lineHeight: 1.43,
            }}
          >
            Forgot password?
          </a>
        </div>

        {/* Error */}
        {errorMsg && (
          <div
            className="mb-3 rounded-xl px-4 py-3.5"
            style={{
              backgroundColor: errorBg,
              border: `1px solid ${errorBorder}`,
              color: error,
              fontSize: "14px",
              fontFamily: SF_TEXT,
              lineHeight: 1.4,
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Submit */}
        <div style={{ paddingTop: "72px", paddingBottom: "16px" }}>
          <Button
            type="submit"
            isDisabled={isSubmitting}
            className="w-full"
            style={{
              height: "52px",
              borderRadius: "980px",
              fontSize: "16px",
              fontWeight: 600,
              backgroundColor: accent,
              color: accentFg,
              border: "none",
              fontFamily: SF_TEXT,
              letterSpacing: "-0.2px",
            }}
          >
            {isSubmitting ? "Signing in..." : "Log In"}
          </Button>
        </div>
      </form>

      {/* Footer link */}
      <div
        className="text-center mt-10"
        style={{
          fontFamily: SF_TEXT,
          fontSize: "14px",
          lineHeight: 1.4,
          letterSpacing: "-0.15px",
          color: textTertiary,
        }}
      >
        Don&apos;t have an account?{" "}
        <a
          href="/f/register"
          className="no-underline font-semibold transition-opacity duration-200 hover:opacity-70"
          style={{ color: textPrimary }}
        >
          Sign Up
        </a>
      </div>
    </div>
  );
}
