"use client";

import React from "react";
import { Input, TextField, Button } from "@heroui/react";
import { getTokens, SF_DISPLAY, SF_TEXT } from "@/utils/tokens";

interface RegisterFormProps {
  email: string;
  setEmail: (email: string) => void;
  phone: string;
  setPhone: (phone: string) => void;
  password: string;
  setPassword: (password: string) => void;
  confirmPassword: string;
  setConfirmPassword: (confirmPassword: string) => void;
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
  phoneError: boolean;
  passwordError: boolean;
  confirmPasswordError: boolean;
  isDark?: boolean;
}

export default function RegisterForm({
  email,
  setEmail,
  phone,
  setPhone,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
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
  phoneError,
  passwordError,
  confirmPasswordError,
  isDark = false,
}: RegisterFormProps) {
  const t = getTokens(isDark);
  const { fg: textPrimary, fg2: textSecondary, fg3: textTertiary, accent, accentFg, error, inputBg, inputBorder, iconContainerBg, errorBg, errorBorder } = t;

  const inputStyle = (hasError: boolean): React.CSSProperties => ({
    fontFamily: SF_TEXT,
    fontSize: "16px",
    letterSpacing: "-0.2px",
    color: textPrimary,
    backgroundColor: inputBg,
    border: `1px solid ${hasError ? error : inputBorder}`,
    borderRadius: "12px",
    padding: "13px 16px",
    outline: "none",
  });

  const labelStyle = (hasError: boolean): React.CSSProperties => ({
    fontFamily: SF_TEXT,
    fontSize: "13px",
    fontWeight: 600,
    letterSpacing: "0.02em",
    lineHeight: 1.4,
    color: hasError ? error : textTertiary,
    display: "block",
    marginBottom: "8px",
  });

  return (
    <div className="w-full max-w-[400px]">
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.ico" alt="Logo" style={{ width: 28, height: 28 }} />
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
          Create account
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
          Get started with your DataForge workspace
        </p>
      </div>

      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
      >
        {/* Input Fields Group */}
        <div style={{ marginBottom: "32px" }}>
          {/* Email */}
          <div style={{ marginBottom: "20px" }}>
            <TextField fullWidth variant={emailError ? "secondary" : "primary"}>
              <label style={labelStyle(emailError)}>EMAIL</label>
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
                style={inputStyle(emailError)}
              />
            </TextField>
          </div>

          {/* Phone */}
          <div style={{ marginBottom: "20px" }}>
            <TextField fullWidth variant={phoneError ? "secondary" : "primary"}>
              <label style={labelStyle(phoneError)}>
                PHONE <span style={{ fontWeight: 400, opacity: 0.6 }}>(OPTIONAL)</span>
              </label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onFocus={() => setIsTyping(true)}
                onBlur={() => setIsTyping(false)}
                placeholder="•••••••••••"
                autoComplete="off"
                fullWidth
                style={inputStyle(phoneError)}
              />
            </TextField>
          </div>

          {/* Password */}
          <div style={{ marginBottom: "20px" }}>
            <TextField fullWidth variant={passwordError ? "secondary" : "primary"}>
              <label style={labelStyle(passwordError)}>PASSWORD</label>
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
                  style={{ ...inputStyle(passwordError), paddingRight: "48px" }}
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

          {/* Confirm Password */}
          <div>
            <TextField fullWidth variant={confirmPasswordError ? "secondary" : "primary"}>
              <label style={labelStyle(confirmPasswordError)}>CONFIRM PASSWORD</label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                fullWidth
                style={inputStyle(confirmPasswordError)}
              />
            </TextField>
          </div>
        </div>

        {/* Error */}
        {errorMsg && (
          <div
            className="rounded-xl px-4 py-3.5"
            style={{
              marginBottom: "12px",
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
            {isSubmitting ? "Creating account..." : "Sign Up"}
          </Button>
        </div>
      </form>

      {/* Footer link */}
      <div
        className="text-center"
        style={{
          fontFamily: SF_TEXT,
          fontSize: "14px",
          lineHeight: 1.4,
          letterSpacing: "-0.15px",
          color: textTertiary,
        }}
      >
        Already have an account?{" "}
        <a
          href="/f/login"
          className="no-underline font-semibold transition-opacity duration-200 hover:opacity-70"
          style={{ color: textPrimary }}
        >
          Log In
        </a>
      </div>
    </div>
  );
}
