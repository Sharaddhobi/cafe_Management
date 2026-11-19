import React, { useEffect, useRef, useState } from 'react';
import { Coffee } from 'lucide-react';
import { CAFE_CONFIG } from '../config/cafeConfig';

export default function QrSplash({ tableNumber, onFinish }) {
  const [fading, setFading] = useState(false);
  const [logoMissing, setLogoMissing] = useState(false);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 1300);
    const doneTimer = setTimeout(() => onFinishRef.current(), 1800);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  const isParcel = Number(tableNumber) === 0;

  return (
    <div
      onClick={() => onFinishRef.current()}
      className={`fixed inset-0 z-50 flex items-center justify-center p-6 transition-opacity duration-500 cursor-pointer ${
        isParcel ? 'liquid-canvas-parcel' : 'liquid-canvas-dinein'
      } ${fading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      <div className="animate-qr-logo flex flex-col items-center text-center space-y-4">
        <div className="relative flex items-center justify-center">
          <span className="animate-qr-ring absolute w-24 h-24 rounded-[28px] border-2 border-[#007AFF]/50" />
          <div className="liquid-glass w-24 h-24 rounded-[28px] flex items-center justify-center p-3 overflow-hidden">
            {!logoMissing ? (
              <img
                src={CAFE_CONFIG.logoUrl}
                alt={CAFE_CONFIG.name}
                onError={() => setLogoMissing(true)}
                className="w-full h-full object-contain"
              />
            ) : (
              <Coffee className="w-10 h-10 text-[#007AFF]" />
            )}
          </div>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {CAFE_CONFIG.name}
          </h1>
          <p className="text-xs font-medium text-slate-500">{CAFE_CONFIG.tagline}</p>
        </div>

        <span className="liquid-pill px-4 py-1.5 rounded-full text-xs font-semibold text-[#007AFF]">
          {isParcel ? 'Parcel / Takeaway Menu' : `Welcome to Table #${tableNumber}`}
        </span>
      </div>
    </div>
  );
}