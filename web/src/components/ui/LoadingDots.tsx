"use client";

import { useState, useEffect } from "react";

interface LoadingDotsProps {
  size?: "sm" | "md" | "lg";
  color?: string;
}

export function LoadingDots({ size = "md", color }: LoadingDotsProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % 3);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  const sizeMap = {
    sm: "w-1.5 h-1.5",
    md: "w-2 h-2",
    lg: "w-2.5 h-2.5",
  };

  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={`${sizeMap[size]} rounded-full transition-opacity duration-300 ${
            color || "bg-current"
          }`}
          style={{
            opacity: index === activeIndex ? 1 : 0.3,
            transform: index === activeIndex ? "scale(1.2)" : "scale(1)",
          }}
        />
      ))}
    </div>
  );
}
