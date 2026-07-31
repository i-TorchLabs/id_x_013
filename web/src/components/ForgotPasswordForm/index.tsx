"use client";

import React from "react";
import { Input, TextField, Checkbox, Button } from "@heroui/react";
import { getTokens, SF_DISPLAY, SF_TEXT } from "@/utils/tokens";

interface ForgotPasswordFormProps {
    email: string;
    setEmail: (email: string) => void;
    isTyping: boolean;
    setIsTyping: (isTyping: boolean) => void;
    isSubmitting: boolean;
    isSuccess: boolean;
    onSubmit: (e: React.FormEvent) => Promise<void>;
    errorMsg: string;
    emailError: boolean;
    agreedToTerms: boolean;
    setAgreedToTerms: (agreed: boolean) => void;
    termsError: boolean;
    isDark?: boolean;
}

export default function ForgotPasswordForm({
    email,
    setEmail,
    isTyping,
    setIsTyping,
    isSubmitting,
    isSuccess,
    onSubmit,
    errorMsg,
    emailError,
    agreedToTerms,
    setAgreedToTerms,
    termsError,
    isDark = false,
}: ForgotPasswordFormProps) {
    const t = getTokens(isDark);
    const { fg: textPrimary, fg2: textSecondary, fg3: textTertiary, accent, accentFg, error, inputBg, inputBorder, iconContainerBg, errorBg, errorBorder } = t;

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

    if (isSuccess) {
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
                        <svg className="w-7 h-7" style={{ color: accent }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                </div>

                <div className="text-center mb-12">
                    <h1
                        className="text-[32px] font-semibold mb-3"
                        style={{ fontFamily: SF_DISPLAY, lineHeight: 1.1, letterSpacing: "-0.32px", color: textPrimary }}
                    >
                        Check your email
                    </h1>
                    <p
                        className="text-[15px]"
                        style={{ fontFamily: SF_TEXT, lineHeight: 1.4, letterSpacing: "-0.2px", color: textTertiary }}
                    >
                        We have sent password reset instructions to {email}
                    </p>
                </div>

                <div style={{ paddingTop: "72px", paddingBottom: "16px" }}>
                    <Button
                        type="button"
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
                        onPress={() => (window.location.href = "/f/login")}
                    >
                        Back to Login
                    </Button>
                </div>
            </div>
        );
    }

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
                    style={{ fontFamily: SF_DISPLAY, lineHeight: 1.1, letterSpacing: "-0.32px", color: textPrimary }}
                >
                    Reset password
                </h1>
                <p
                    className="text-[15px]"
                    style={{ fontFamily: SF_TEXT, lineHeight: 1.4, letterSpacing: "-0.2px", color: textTertiary }}
                >
                    Enter your email to receive reset instructions
                </p>
            </div>

            <form
                onSubmit={(e) => {
                    void onSubmit(e);
                }}
            >
                {/* Input Fields Group */}
                <div style={{ marginBottom: "8px" }}>
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

                {/* Options Group */}
                <div className="flex items-center justify-between">
                    <Checkbox
                        isSelected={agreedToTerms}
                        onChange={(checked: boolean) => setAgreedToTerms(checked === true)}
                    >
                        <span
                            style={{
                                fontFamily: SF_TEXT,
                                fontSize: "14px",
                                letterSpacing: "-0.15px",
                                lineHeight: 1.43,
                                color: textSecondary,
                            }}
                        >
                            I agree to the{" "}
                            <a
                                href="/terms"
                                className="no-underline hover:underline"
                                style={{ color: textPrimary, fontWeight: 500 }}
                            >
                                Terms of Service
                            </a>
                        </span>
                    </Checkbox>
                </div>
                {termsError && (
                    <p className="text-[12px] mt-1" style={{ color: error }}>
                        You must agree to the Terms of Service
                    </p>
                )}

                {/* Error */}
                {errorMsg && (
                    <div
                        className="rounded-xl px-4 py-3.5"
                        style={{
                            marginTop: "12px",
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
                        {isSubmitting ? "Sending..." : "Send Reset Link"}
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
                Remember your password?{" "}
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
